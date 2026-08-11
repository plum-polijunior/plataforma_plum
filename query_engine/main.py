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

from query_engine import config, sheets
from query_engine.pandas_executor import (
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

    # ── Uma leitura para todos os cards aprovados ────────────────────────────
    try:
        df = sheets.load_columns(
            _google_service(),
            payload.sheet_id,
            payload.tab,
            colunas_a_carregar,
            max_rows=max_rows,
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
        # `from` do plano pode nomear a tabela; aqui só existe uma.
        plano = dict(pedido.plan)
        plano["from"] = "producao"
        try:
            saida = execute_plan(
                plano,
                tabelas,
                column_roles=column_roles,
                max_rows=None,  # já barrado em sheets.load_columns
            )
            resultados.append(
                {
                    "card_id": pedido.card_id,
                    "status": "ok",
                    "columns": saida.get("columns", []),
                    "rows": saida.get("rows", []),
                    "row_count": saida.get("row_count", 0),
                    "suppressed_groups": saida.get("suppressed_groups", 0),
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
