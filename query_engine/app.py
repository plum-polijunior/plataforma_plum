"""
Serviço HTTP do query engine — o "motorista cego" do PRD exposto via API. É chamado pela
Edge Function `ai-plum-chat` (action "execute_plan") depois do Agente A gerar o Query Plan e
antes do Agente C sintetizar a resposta. Nunca recebe a pergunta em linguagem natural do
usuário (query_engine/prd.md §2.3) — só o plano estruturado.

A validação de tenant (organization_id x dataset_id, membro ativo) já foi feita pela Edge
Function antes de chegar aqui (CLAUDE.md R-05); este serviço só confirma que a requisição
veio dela (auth.verify_request) e executa o plano contra os dados reais da planilha.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

import auth
import sheets_client
from pandas_executor import execute_plan_with_formatting

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("plum.query_engine")

app = FastAPI(title="Plum Query Engine")


class ExecutePlanRequest(BaseModel):
    organization_id: str
    dataset_id: str
    google_sheet_id: str
    sheet_name: str = Field(default="Sheet1")
    target_columns: list[str]
    plan: dict[str, Any]
    formatting_rules: dict[str, Any] = Field(default_factory=dict)


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/execute-plan")
async def execute_plan_endpoint(request: Request) -> JSONResponse:
    raw_body = await request.body()

    try:
        auth.verify_request(
            raw_body=raw_body,
            timestamp=request.headers.get(auth.TIMESTAMP_HEADER),
            signature=request.headers.get(auth.SIGNATURE_HEADER),
        )
    except auth.InvalidSignatureError as exc:
        logger.warning("Requisição rejeitada: %s", exc)
        return JSONResponse(status_code=401, content={"error": "Assinatura inválida."})

    try:
        payload = ExecutePlanRequest.model_validate_json(raw_body)
    except Exception as exc:
        logger.warning("Payload inválido: %s", exc)
        return JSONResponse(status_code=400, content={"error": f"Payload inválido: {exc}"})

    try:
        df = sheets_client.fetch_table(
            google_sheet_id=payload.google_sheet_id,
            sheet_name=payload.sheet_name,
            target_columns=payload.target_columns,
            dataset_id=payload.dataset_id,
        )
    except sheets_client.SheetAccessError as exc:
        logger.error(
            "Falha ao ler planilha [org=%s dataset=%s]: %s",
            payload.organization_id, payload.dataset_id, exc,
        )
        return JSONResponse(status_code=502, content={"error": str(exc)})

    table_name = payload.plan.get("from", "producao")
    tables = {table_name: df}

    try:
        result = execute_plan_with_formatting(payload.plan, tables, payload.formatting_rules)
    except Exception as exc:
        logger.exception(
            "Erro ao executar o plano [org=%s dataset=%s]",
            payload.organization_id, payload.dataset_id,
        )
        return JSONResponse(status_code=500, content={"error": f"Erro ao executar o plano: {exc}"})

    return JSONResponse(status_code=200, content=result)
