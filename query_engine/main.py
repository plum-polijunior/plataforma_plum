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
    TABELA_PADRAO,
    CardinalidadeExcedida,
    ExecutorError,
    MissingColumnError,
    RawRowsBlocked,
    RowLimitExceeded,
    TabelaNaoEncontradaError,
    apply_formatting_rules,
    execute_plan,
    resolver_nome_da_tabela,
    roles_from_formatting_rules,
)
from query_engine.security import (
    BadSignature,
    BaseRequest,
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

def descrever_cabecalhos(service, payload) -> Dict[str, Any]:
    """
    O cabecalho da planilha, sem carregar dado nenhum.

    ⭐ **E a UNICA porta deste executor que nao passa pela barreira 4**, e o
    motivo e circular por natureza: quem pergunta "quais sao as colunas?" ainda
    nao pode ter uma lista de colunas permitidas. No cadastro, esta chamada
    acontece ANTES de existir `role_permissions` — e o que ela devolve e
    exatamente o insumo para criar essa permissao.

    ⚠️ Nao ha o que autorizar porque nao ha coluna pedida: `resolved_columns`
    vem vazio e nenhuma celula de dado e lida. `sheets.get_meta` busca so a
    linha 1 (`ranges=['Aba'!1:1]`) — cabecalho e contagem de linhas, uma
    requisicao. Nome de coluna nao e dado do negocio; e o enderecamento dele.

    ⚠️ Quem confere QUEM pode chamar isto e a Edge Function, que exige Admin da
    organizacao dona da base. Aqui so se confere a assinatura HMAC, como em todo
    o resto — este endpoint nunca soube quem e o usuario.
    """
    tab = sheets.resolver_aba(service, payload.sheet_id, payload.tab, payload.tab_gid)
    meta = sheets.get_meta(service, payload.sheet_id, tab)

    # ⭐ A colisao de normalizacao aparece AQUI, com a pessoa olhando a tela.
    #
    # Dois cabecalhos que normalizam para o mesmo nome fazem uma coluna sumir do
    # `schema_metadata` e, por tabela, do `allowed_columns` — e ate hoje isso
    # acontecia calado, na importacao (C11). Devolver as colisoes deixa o
    # cadastro dizer "renomeie uma destas" no primeiro passo, em vez de a base
    # nascer com uma coluna a menos que ninguem procurou.
    por_normalizado: Dict[str, List[str]] = {}
    colunas: List[Dict[str, str]] = []
    sem_titulo = 0

    for original in meta.headers:
        nome = sheets.normalizar_coluna(original)
        if not nome:
            # Coluna sem titulo nao e enderecavel e inventar um nome seria
            # adivinhar. Conta-se quantas ha, para o cadastro poder avisar.
            sem_titulo += 1
            continue
        por_normalizado.setdefault(nome, []).append(str(original))
        colunas.append({"original": str(original), "nome": nome})

    colisoes = {n: orig for n, orig in por_normalizado.items() if len(orig) > 1}

    return {
        "tipo": "cabecalhos",
        "aba": tab,
        "colunas": colunas,
        # `row_count` e o tamanho da GRADE, nao o numero de linhas preenchidas —
        # o Sheets aloca linhas vazias. Serve para ordem de grandeza, nao para
        # contagem exata; quem conta de verdade e o `metadados`.
        "row_count": meta.row_count,
        "colisoes": colisoes,
        "colunas_sem_titulo": sem_titulo,
    }


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

    # ── `cabecalhos`: antes da barreira 4, e so ele ──────────────────────────
    #
    # ⚠️ Ele vem ANTES de propósito, e a razao esta em `descrever_cabecalhos`:
    # nao ha coluna a autorizar quando o que se pede e a lista de colunas. E o
    # mesmo formato do desvio que o `metadados` do B03 faz sobre a autorizacao
    # POR PLANO — aqui o desvio e sobre o conjunto de colunas.
    #
    # ⚠️⚠️ Exige o lote INTEIRO ser `cabecalhos`. Num lote misto, deixar passar
    # daria a um pedido com plano uma carona para fora da barreira 4 — e a
    # barreira 4 e a unica coisa entre um Query Plan e a coluna de salario.
    tipos = {p.tipo for p in payload.plans}
    if tipos == {"cabecalhos"}:
        try:
            saida = descrever_cabecalhos(_google_service(), payload)
        except sheets.SheetError as exc:
            return {
                "results": [
                    {"card_id": p.card_id, "status": "error", "error": str(exc)}
                    for p in payload.plans
                ]
            }
        return {
            "results": [
                {"card_id": p.card_id, "status": "ok", **saida} for p in payload.plans
            ]
        }
    if "cabecalhos" in tipos:
        raise HTTPException(
            status_code=400,
            detail="'cabecalhos' nao pode vir num lote com outros tipos",
        )

    # ── Quais bases este payload traz ────────────────────────────────────────
    # ⭐ Multi-base (B19). `payload.bases` vazio significa payload de Edge
    # Function anterior ao bloco: sintetiza-se UMA base com os campos do topo, e
    # o nome dela é `TABELA_PADRAO` — que é exatamente o `from` que todo card
    # salvo carrega. O caminho legado sai idêntico daqui.
    bases = payload.bases or [
        BaseRequest(
            nome=TABELA_PADRAO,
            sheet_id=payload.sheet_id,
            tab=payload.tab,
            tab_gid=payload.tab_gid,
            allowed_columns=payload.allowed_columns,
            formatting_rules=payload.formatting_rules,
        )
    ]
    por_nome: Dict[str, Any] = {b.nome: b for b in bases}
    if len(por_nome) != len(bases):
        # Duas bases com o mesmo nome fariam o `from` casar com a errada, e qual
        # ganha dependeria da ordem do dict. Recusa: é erro de quem monta.
        raise HTTPException(status_code=400, detail="duas bases com o mesmo nome")

    # ── Barreira 4: conjunto de colunas, por card e POR BASE ─────────────────
    # Feita antes de tocar no Google: um card proibido não deve nem gerar leitura.
    #
    # ⛔⛔ **`allowed_columns` é da BASE, nunca do turno.** Uma lista global seria
    # a união das permissões de bases diferentes: quem pode ver `salario` em RH
    # passaria a pedir `salario` de Vendas e a comparação de conjuntos não veria
    # nada de errado, porque o nome está na lista. O RBAC é por dataset
    # (`role_permissions`) e esta barreira tem de ter a mesma forma.
    #
    # ⭐ E o `resolver_nome_da_tabela` é o MESMO que o `execute_plan` usa. Duas
    # implementações da regra do `from` divergiriam em silêncio, e a divergência
    # seria autorizar contra a base A e executar sobre a base B.
    # ⛔⛔ **`(pedido, nome_base)` em par, NUNCA um dict chaveado por `card_id`.**
    #
    # O `card_id` vem do PLANEJADOR — é `pedido.id` emitido por um LLM — e nada
    # garante que seja único no lote. Um dict `{card_id: base}` colapsaria dois
    # pedidos de mesmo id na base do último, e o primeiro executaria sobre uma
    # base contra a qual ele NÃO foi autorizado. É bypass de RBAC por colisão de
    # string que um modelo escolheu.
    aprovados: List[tuple] = []
    resultados: List[Dict[str, Any]] = []
    # {nome da base: colunas a carregar} — uma leitura do Google por base.
    colunas_por_base: Dict[str, set] = {nome: set() for nome in por_nome}

    for pedido in payload.plans:
        try:
            nome_base = resolver_nome_da_tabela(pedido.plan, por_nome.keys())
        except TabelaNaoEncontradaError as exc:
            # ⚠️ Não é `forbidden`: nada foi negado por cargo. É plano malformado
            # — o planejador nomeou uma planilha que não veio. Ver T8.
            logger.warning("Card %s sem base: %s", pedido.card_id, exc)
            resultados.append(
                {"card_id": pedido.card_id, "status": "error", "error": str(exc)}
            )
            continue

        try:
            colunas = assert_columns_allowed(
                pedido.resolved_columns, por_nome[nome_base].allowed_columns
            )
        except ColumnNotAllowed as exc:
            logger.warning("Card %s barrado em '%s': %s", pedido.card_id, nome_base, exc)
            resultados.append(
                {
                    "card_id": pedido.card_id,
                    "status": "forbidden",
                    "error": "Seu cargo nao tem acesso a uma das colunas deste card.",
                }
            )
            continue

        aprovados.append((pedido, nome_base))
        colunas_por_base[nome_base] |= colunas

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
    so_metadados = all(p.tipo == "metadados" for p, _ in aprovados)

    # ── Uma leitura do Google por base com pedido aprovado ───────────────────
    # ⚠️ Base sem nenhuma coluna a carregar é pulada: ler a planilha para não
    # usar nada é latência e cota de graça.
    tabelas: Dict[str, Any] = {}
    papeis_por_base: Dict[str, Dict[str, str]] = {}

    for nome_base, colunas_a_carregar in colunas_por_base.items():
        if not colunas_a_carregar:
            continue
        base = por_nome[nome_base]
        try:
            bruto = sheets.load_columns(
                _google_service(),
                base.sheet_id,
                base.tab,
                colunas_a_carregar,
                max_rows=max_rows,
                tolerar_ausentes=so_metadados,
                # Qual aba, pelo identificador estável. Quando presente tem
                # precedência sobre `base.tab` — ver `sheets.resolver_aba`.
                tab_gid=base.tab_gid,
            )
        except sheets.SheetError as exc:
            # ⭐ Falha de leitura atinge só os cards DAQUELA base. Antes do B19
            # havia uma base e o `return` aqui era o comportamento certo; com N,
            # derrubar o lote inteiro porque uma planilha perdeu o
            # compartilhamento esconderia as respostas que ainda dão.
            for pedido, base_do_pedido in aprovados:
                if base_do_pedido == nome_base:
                    resultados.append(
                        {"card_id": pedido.card_id, "status": "error", "error": str(exc)}
                    )
            continue

        # Regras estruturadas do Agente 3/3.1 DESTA base: limpa/tipa colunas que
        # a planilha guarda como texto (moeda escrita como string, CPF pontuado,
        # Sim/Não...). Colunas já nativamente numéricas/data no Sheets chegam
        # corretas de `sheets.load_columns` (valueRenderOption=UNFORMATTED_VALUE)
        # e passam incólumes por aqui.
        #
        # ⚠️ Por base, não do payload: as regras descrevem as colunas de UMA
        # planilha, e aplicar as de outra limparia a coluna errada.
        tabelas[nome_base] = apply_formatting_rules(bruto, base.formatting_rules)
        papeis_por_base[nome_base] = roles_from_formatting_rules(base.formatting_rules)

    if not tabelas:
        return {"results": resultados}

    for pedido, nome_base in aprovados:
        # ⭐ A base vem EM PAR com o pedido, decidida na barreira 4. Não se
        # recalcula e não se busca por chave: a decisão que autorizou tem de ser
        # exatamente a que executa, e nada que o modelo escolheu pode indexá-la.
        #
        # ⚠️ Pode não estar em `tabelas` se a leitura daquela planilha falhou — o
        # erro já foi para `resultados` no laço de leitura.
        if nome_base not in tabelas:
            continue
        df = tabelas[nome_base]
        column_roles = papeis_por_base[nome_base]
        base = por_nome[nome_base]

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
        if pedido.tipo in ("registro", "amostra", "amostra_cadastro"):
            try:
                colunas = colunas_de_linha(pedido.plan, pedido.resolved_columns)
                # ⚠️ `base.sheet_id`, não `payload.sheet_id`: a semente
                # existe para a amostra ser estável por planilha. Com multi-base
                # o campo do topo é o da primeira e daria a MESMA semente para
                # bases diferentes — amostras correlacionadas sem motivo.
                semente = linhas_mod.semente_de(base.sheet_id, len(df))
                if pedido.tipo == "registro":
                    saida = linhas_mod.registro(
                        df, colunas, plano_where(pedido.plan), column_roles
                    )
                elif pedido.tipo == "amostra_cadastro":
                    # ⚠️ Teto de 20, e ele NAO chega por parametro — o tipo do
                    # pedido e que escolhe a funcao. Ver `linhas.TETO_DE_CADASTRO`.
                    saida = linhas_mod.amostra_de_cadastro(df, colunas, semente)
                else:
                    saida = linhas_mod.amostra(df, colunas, semente)
            except ExecutorError as exc:
                resultados.append(
                    {"card_id": pedido.card_id, "status": "error", "error": str(exc)}
                )
                continue

            resultados.append({"card_id": pedido.card_id, "status": "ok", **saida})
            continue

        # ⭐⭐ **O `from` do plano é RESPEITADO desde 2026-08-27 (B18).** Até
        # aqui esta função fazia `plano["from"] = "producao"`, descartando o que
        # o planejador emitiu — o executor sempre soube receber várias tabelas,
        # quem não sabia era este arquivo.
        #
        # ⚠️ Passa-se só a tabela DESTE pedido, não o dicionário inteiro. É
        # redundante com o `from` e é de propósito: `execute_plan` não tem como
        # alcançar uma base que a barreira 4 não autorizou para este card, nem
        # que o `from` diga outra coisa. Defesa em profundidade, e barata.
        try:
            saida = execute_plan(
                pedido.plan,
                {nome_base: df},
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
