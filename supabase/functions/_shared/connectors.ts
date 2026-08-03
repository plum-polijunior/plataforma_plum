// =========================================================================
// DATA CONNECTOR — busca as linhas reais do dataset (Express: Google Sheets)
// =========================================================================
// Interface plugável (ADR-005 do PRD). Hoje: GoogleSheetCsvConnector, que lê
// o CSV exportado da planilha. Amanhã: conector SQL / service-account / motor
// DSL — troca por trás sem tocar o núcleo.
//
// SEGURANÇA: o núcleo só chama fetchRows para datasets JÁ aprovados pelo RBAC,
// e passa apenas as colunas permitidas. Este conector PROJETA para essas
// colunas (defesa em profundidade): mesmo que a planilha tenha colunas extras,
// as não-permitidas são descartadas ANTES de chegar ao cérebro.
//
// LIMITE HONESTO (bridge): mandar linhas cruas ao LLM só escala para bases
// pequenas. O caminho determinístico/escalável continua sendo o motor DSL
// (R-02). Por isso há teto de linhas e as truncagens são reportadas (nunca
// silenciosas).
// =========================================================================
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { parse } from "https://deno.land/std@0.168.0/encoding/csv.ts";

export interface FetchResult {
  rows: Record<string, unknown>[];
  truncated: boolean;
  /** Colunas permitidas que NÃO foram encontradas na fonte (para diagnóstico). */
  missingColumns: string[];
}

export interface DataConnector {
  fetchRows(datasetId: string, allowedColumns: string[]): Promise<FetchResult>;
}

const MAX_ROWS_PER_DATASET = 200;

/** Normaliza um cabeçalho para o mesmo snake_case usado no dicionário/RBAC. */
export function toSnake(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove diacríticos
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Extrai o id da planilha de um id puro ou de uma URL do Google Sheets. */
function extractSheetId(ref: string): string | null {
  if (!ref) return null;
  const m = ref.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1];
  // Se já parece um id (sem barras), usa direto.
  if (/^[a-zA-Z0-9-_]+$/.test(ref)) return ref;
  return null;
}

export class GoogleSheetCsvConnector implements DataConnector {
  constructor(private admin: SupabaseClient) {}

  async fetchRows(
    datasetId: string,
    allowedColumns: string[],
  ): Promise<FetchResult> {
    const { data: ds, error } = await this.admin
      .from("datasets")
      .select("google_sheet_id")
      .eq("id", datasetId)
      .maybeSingle();
    if (error) throw error;

    const sheetId = extractSheetId((ds?.google_sheet_id as string) ?? "");
    if (!sheetId) {
      // Sem fonte conectada — não é erro fatal; o cérebro responde só pela semântica.
      return { rows: [], truncated: false, missingColumns: allowedColumns };
    }

    // Exportação CSV da primeira aba (requer a planilha acessível por link).
    const url =
      `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=0`;
    const resp = await fetch(url, { redirect: "follow" });
    if (!resp.ok) {
      throw new Error(`sheet_fetch_${resp.status}`);
    }
    // Planilha privada redireciona para uma página de login (HTML, status 200).
    // Se não veio CSV, tratamos como fonte não acessível — nunca alimentar HTML.
    const contentType = resp.headers.get("content-type") ?? "";
    if (!contentType.includes("text/csv")) {
      throw new Error("sheet_nao_publica");
    }
    const text = await resp.text();

    const table = parse(text) as string[][];
    if (table.length === 0) {
      return { rows: [], truncated: false, missingColumns: allowedColumns };
    }

    const header = table[0].map(toSnake);
    const allowed = new Set(allowedColumns.map(toSnake));

    // Índices das colunas permitidas presentes na planilha.
    const picked: { idx: number; name: string }[] = [];
    for (let i = 0; i < header.length; i++) {
      if (allowed.has(header[i])) picked.push({ idx: i, name: header[i] });
    }
    const found = new Set(picked.map((p) => p.name));
    const missingColumns = [...allowed].filter((c) => !found.has(c));

    const bodyRows = table.slice(1);
    const truncated = bodyRows.length > MAX_ROWS_PER_DATASET;
    const limited = bodyRows.slice(0, MAX_ROWS_PER_DATASET);

    const rows = limited.map((r) => {
      const obj: Record<string, unknown> = {};
      for (const { idx, name } of picked) obj[name] = r[idx] ?? null;
      return obj;
    });

    return { rows, truncated, missingColumns };
  }
}
