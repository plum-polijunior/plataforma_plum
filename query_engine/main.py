"""
Serviço executor do PLUM.

Um endpoint que executa N planos de UM dataset numa passada só. O formato em
lote não é otimização prematura: é o que faz seis cards do mesmo dashboard
custarem uma leitura no Google em vez de seis (decisão 11A).

O que este serviço NÃO faz, de propósito:

  - Não consulta o Supabase. Nenhuma linha de SQL aqui.
  - Não decide permissão. Ele obedece o conjunto de colunas que veio assinado.
  - Não interpreta o Query Plan para fins de segurança. Compara conjuntos.
  - Não escolhe qual planilha ler. O `sheet_id` vem dentro do payload assinado.

Toda decisão de autorização vive na Edge Function, onde o JWT do usuário e o
RLS do Postgres existem. Aqui é Motorista Cego.

Resposta é **por card**, nunca por lote: um card com coluna proibida devolve
`forbidden` e os outros cinco continuam funcionando. Um card ruim não pode
derrubar o dashboard inteiro.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, Header, HTTPException, Request
from pydantic import ValidationError

from query_engine import config, linhas as linhas_mod, metadados as metadados_mod, sheets
from query_engine.pandas_executor import (
    CardinalidadeExcedida,
    ExecutorError,
    MissingColumnError,
    RawRowsBlocked,
    RowLimitExceeded,
    apply_formatting_rules,
    execute_plan,
    roles_from_formatting_rules,
)
from query_engine.security import (
    BadSignature,
    ColumnNotAllowed,
    ExecutionPayload,
    PayloadExpired,
    assert_columns_allowed,
    verify_freshness,
    verify_signature,
)


# O runtime Python do Lambda ja anexa um handler ao root logger antes deste
# modulo carregar. Sem `force=True`, basicConfig() e um no-op nesse caso (doc
# do stdlib) e todo `logger.info` fica mudo no CloudWatch — só WARNING/ERROR
# apareciam, porque o handler que o runtime anexa comeca mais restritivo.
logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"), force=True)
logger = logging.getLogger("plum.executor")

app = FastAPI(title="PLUM Query Engine", docs_url=None, redoc_url=None)


def plano_where(plan: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """O `where` do plano, quando ha um. Usado so por `registro`."""
    onde = (plan or {}).get("where")
    return onde if isinstance(onde, dict) else None


def colunas_de_linha(plan: Dict[str, Any], autorizadas: List[str]) -> List[str]:
    """
    As colunas que um `registro`/`amostra` devolve: o `select` do plano,
    INTERSECTADO com o que a barreira 4 autorizou.

    ⚠️ Nao da para usar `resolved_columns` direto. Ele inclui as colunas do
    `where` (o `extractColumns` percorre o filtro tambem, e tem de percorrer —
    e assim que uma coluna se esconde do RBAC), entao um `registro` que filtra
    por `cpf` e pede so `nome` devolveria o `cpf` junto. Autorizado, mas nao
    pedido: num tipo que ja e a excecao ao P1.3, entregar coluna a mais por
    acidente e o contrario do que se quer.

    ⭐ A intersecao e nesta ordem de proposito: o `select` escolhe, o
    `autorizadas` filtra. Nunca o contrario — `select` nao amplia nada.
    """
    permitidas = {c for c in autorizadas if c}
    pedidas = [
        c for c in (plan or {}).get("select") or []
        if isinstance(c, str) and c in permitidas
    ]
    # Sem `select` utilizavel, cai no conjunto autorizado — que ja e o recorte
    # minimo que a barreira 4 deixou passar.
    return pedidas or list(autorizadas)

# Reaproveitado entre invocações enquanto o container do Lambda vive. Evita
# reconstruir credencial e cliente a cada requisição.
_service = None


def _google_service():
    global _service
    if _service is None:
        _service = sheets.build_service(config.google_service_account_info())
    return _service


@app.get("/health")
def health() -> Dict[str, str]:
    """Sem segredo, sem dado. Só prova que o container subiu."""
    return {"status": "ok"}


@app.post("/execute")
async def execute(
    request: Request,
    x_plum_signature: Optional[str] = Header(default=None),
) -> Dict[str, Any]:
    raw = await request.body()

    # ── Barreira 2: autenticidade do payload ─────────────────────────────────
    try:
        verify_signature(raw, x_plum_signature, config.hmac_secret())
    except BadSignature as exc:
        logger.warning("Assinatura recusada: %s", exc)
        raise HTTPException(status_code=401, detail="assinatura invalida") from exc

    try:
        payload = ExecutionPayload.model_validate_json(raw)
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail="payload malformado") from exc

    # ── Barreira 3: frescor ──────────────────────────────────────────────────
    try:
        verify_freshness(payload.issued_at, config.signature_max_age_seconds())
    except PayloadExpired as exc:
        logger.warning("Payload expirado: %s", exc)
        raise HTTPException(status_code=401, detail="payload expirado") from exc

    max_rows = payload.max_rows or config.default_max_rows()

    # ── Barreira 4: conjunto de colunas, por card ────────────────────────────
    # Feita antes de tocar no Google: um card proibido não deve nem gerar leitura.
    aprovados: List = []
    resultados: List[Dict[str, Any]] = []
    colunas_a_carregar: set = set()

    for pedido in payload.plans:
        try:
            colunas = assert_columns_allowed(
                pedido.resolved_columns, payload.allowed_columns
            )
        except ColumnNotAllowed as exc:
            logger.warning("Card %s barrado: %s", pedido.card_id, exc)
            resultados.append(
                {
                    "card_id": pedido.card_id,
                    "status": "forbidden",
                    "error": "Seu cargo nao tem acesso a uma das colunas deste card.",
                }
            )
            continue
        aprovados.append(pedido)
        colunas_a_carregar |= colunas

    if not aprovados:
        return {"results": resultados}

    # ⭐ Tolerar coluna ausente SO quando o lote inteiro e `metadados`.
    #
    # O `metadados` pede todas as colunas do cargo, e ate 2026-08-20 uma unica
    # entrada obsoleta na matriz de permissoes derrubava o caminho `ad_hoc`
    # inteiro — enquanto uma pergunta normal, que pede duas ou tres colunas, nem
    # percebia. Descrever uma base e onde "esta coluna nao existe mais" e uma
    # resposta util: o `metadados.descrever` ja devolve `{"existe": false}`.
    #
    # ⚠️ A condicao `all(...)` nao e decoracao. Num lote misto, tolerar faria um
    # pedido COM PLANO rodar sem uma coluna do `where`, devolvendo a conta sobre
    # a tabela inteira com o rotulo do recorte pedido. Na pratica coleta e
    # execucao ja vem em lotes separados; isto garante em vez de torcer.
    so_metadados = all(p.tipo == "metadados" for p in aprovados)

    # ── Uma leitura para todos os cards aprovados ────────────────────────────
    try:
        df = sheets.load_columns(
            _google_service(),
            payload.sheet_id,
            payload.tab,
            colunas_a_carregar,
            max_rows=max_rows,
            tolerar_ausentes=so_metadados,
            # Qual aba, pelo identificador estável. Quando presente tem
            # precedência sobre `payload.tab` — ver `sheets.resolver_aba`.
            tab_gid=payload.tab_gid,
        )
    except sheets.SheetError as exc:
        # Falha de leitura atinge todos os cards que dependiam dela. A Edge
        # Function transforma isto em snapshot antigo com selo de idade.
        for pedido in aprovados:
            resultados.append(
                {"card_id": pedido.card_id, "status": "error", "error": str(exc)}
            )
        return {"results": resultados}

    # Regras estruturadas do Agente 3/3.1: limpa/tipa colunas que a planilha
    # guarda como texto (moeda escrita como string, CPF pontuado, Sim/Não...).
    # Colunas já nativamente numéricas/data no Sheets chegam corretas de
    # `sheets.load_columns` (valueRenderOption=UNFORMATTED_VALUE) e passam
    # incólumes por aqui.
    df = apply_formatting_rules(df, payload.formatting_rules)
    column_roles = roles_from_formatting_rules(payload.formatting_rules)

    tabelas = {"producao": df}

    for pedido in aprovados:
        # ── Pedido `metadados`: descrição, não consulta ──────────────────────
        # Não tem Query Plan — não há o que planejar. Devolve a forma da base
        # (papel, distintos, vazios, extremos onde é seguro) para o A2 escolher
        # colunas sem que nenhuma linha saia. Ver `query_engine/metadados.py`.
        #
        # Fica ANTES do caminho normal porque `execute_plan` recusaria: um plano
        # sem `select` viola o P1.3, e com razão — só que aqui não há plano.
        if pedido.tipo == "metadados":
            resultados.append(
                {
                    "card_id": pedido.card_id,
                    "status": "ok",
                    "tipo": "metadados",
                    **metadados_mod.descrever(
                        df, pedido.resolved_columns, column_roles
                    ),
                }
            )
            continue

        # ── `registro` e `amostra`: a UNICA excecao ao P1.3 ──────────────────
        # ⚠️ Sao os unicos pedidos que devolvem linha sem agregacao, e por isso
        # vivem num arquivo so (`query_engine/linhas.py`): toda a discussao de
        # privacidade cabe num diff, e a revisao vira pergunta binaria.
        #
        # ⚠️ O teto de 5 linhas e aplicado la. O ORCAMENTO da janela e aplicado
        # na Edge Function, antes de chegar aqui — so ela sabe quanto o usuario
        # ja gastou. Teto por pedido sozinho nao protege nada: 200 pedidos de 5
        # linhas e a base inteira sem violar teto nenhum.
        if pedido.tipo in ("registro", "amostra"):
            try:
                colunas = colunas_de_linha(pedido.plan, pedido.resolved_columns)
                if pedido.tipo == "registro":
                    saida = linhas_mod.registro(
                        df, colunas, plano_where(pedido.plan), column_roles
                    )
                else:
                    saida = linhas_mod.amostra(
                        df,
                        colunas,
                        linhas_mod.semente_de(payload.sheet_id, len(df)),
                    )
            except ExecutorError as exc:
                resultados.append(
                    {"card_id": pedido.card_id, "status": "error", "error": str(exc)}
                )
                continue

            resultados.append({"card_id": pedido.card_id, "status": "ok", **saida})
            continue

        # `from` do plano pode nomear a tabela; aqui só existe uma.
        plano = dict(pedido.plan)
        plano["from"] = "producao"
        try:
            saida = execute_plan(
                plano,
                tabelas,
                column_roles=column_roles,
                max_rows=None,  # já barrado em sheets.load_columns
                # ⭐ O teto de cardinalidade só recusa no caminho novo. No
                # legado ele mede e registra (`[adhoc-observacao]` no
                # CloudWatch), para sabermos por dado — e não por palpite — se
                # dá para ligá-lo no dashboard mais adiante.
                aplicar_regras_adhoc=(payload.caminho == "ad_hoc"),
            )
            resultados.append(
                {
                    "card_id": pedido.card_id,
                    "status": "ok",
                    "columns": saida.get("columns", []),
                    "rows": saida.get("rows", []),
                    "row_count": saida.get("row_count", 0),
                    "suppressed_groups": saida.get("suppressed_groups", 0),
                    # B02 — quanto literal da base este resultado carrega.
                    # Quem vai debitar disso e o orcamento do B10; ate la e
                    # medicao. Aditivo: nenhum consumidor atual le estas chaves.
                    "grupos_de_texto": saida.get("grupos_de_texto", {}),
                    "selecoes_literais": saida.get("selecoes_literais", []),
                }
            )
        except MissingColumnError as exc:
            # Quinta barreira, de graça: só carregamos as colunas assinadas, e
            # o executor não ignora mais coluna ausente. Um plano que tente
            # alcançar algo fora do conjunto morre aqui.
            logger.warning("Card %s referencia coluna nao carregada: %s",
                           pedido.card_id, exc)
            resultados.append(
                {
                    "card_id": pedido.card_id,
                    "status": "error",
                    "error": "Este card usa uma coluna que nao esta disponivel.",
                }
            )
        except RawRowsBlocked as exc:
            logger.warning("Card %s bloqueado por P1.3: %s", pedido.card_id, exc)
            resultados.append(
                {
                    "card_id": pedido.card_id,
                    "status": "error",
                    "error": "Este card precisa de uma agregacao para poder ser exibido.",
                }
            )
        except CardinalidadeExcedida as exc:
            # Mesma familia do P1.3, e a mensagem vai crua para o agente de
            # proposito: aqui quem le e o A3, que precisa saber POR QUE o
            # pedido caiu para poder reformular agregando. "Erro ao executar"
            # o faria repetir o mesmo plano.
            logger.warning("Pedido %s barrado por cardinalidade: %s",
                           pedido.card_id, exc)
            resultados.append(
                {
                    "card_id": pedido.card_id,
                    "status": "error",
                    "error": str(exc),
                }
            )
        except RowLimitExceeded as exc:
            resultados.append(
                {"card_id": pedido.card_id, "status": "error", "error": str(exc)}
            )
        except ExecutorError as exc:
            logger.exception("Card %s falhou", pedido.card_id)
            resultados.append(
                {"card_id": pedido.card_id, "status": "error", "error": str(exc)}
            )

    return {"results": resultados}
