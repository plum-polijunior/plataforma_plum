/**
 * Contrato de formatação — o vocabulário compartilhado do front.
 *
 * Separa o que a pessoa lê do que a máquina executa:
 *
 *   schema_metadata.columns[col].cleaning_rule   frase em português, só exibição
 *   formatting_contract.colunas[col].tipo        enum fechado, vira column_roles
 *
 * Antes existia só a frase, e quem precisava do comportamento fazia grep de
 * palavra-chave nela. Uma regra como "converter Sim/Não para booleano" não
 * casava com nada e a coluna virava `text` em silêncio — o que faz o executor
 * somar com `to_numeric(errors="coerce").fillna(0)` e transformar valor não
 * convertido em ZERO dentro da conta. Ver query_engine/urgent.md.
 *
 * A lista abaixo precisa bater com:
 *   - TIPOS_FORMATACAO em supabase/edge-functions/supabase_edge_function_ai_agents.ts
 *   - PAPEL_POR_TIPO   em supabase/functions/_shared/query_plan.ts
 */

export const TIPOS_FORMATACAO = [
  "moeda_brl",
  "numero_decimal",
  "numero_inteiro",
  "percentual",
  "data",
  "texto_trim_maiusculas",
  "texto_trim_minusculas",
  "documento_cpf_cnpj",
  "booleano_sim_nao",
  "nenhuma",
] as const;

export type TipoFormatacao = (typeof TIPOS_FORMATACAO)[number];

/** Uma entrada do contrato, como o Agente 3 devolve. */
export interface ItemContrato {
  tipo: string;
  params: Record<string, unknown>;
  explicacao: string;
}

/** O que é gravado em `datasets.formatting_contract`. */
export interface ContratoFormatacao {
  versao: number;
  colunas: Record<string, { tipo: string; params: Record<string, unknown> }>;
}

/** Rótulo curto, para o revisor não precisar decorar o enum. */
export const ROTULO_DO_TIPO: Record<string, string> = {
  moeda_brl: "Moeda (R$)",
  numero_decimal: "Número decimal",
  numero_inteiro: "Número inteiro",
  percentual: "Percentual",
  data: "Data",
  texto_trim_maiusculas: "Texto (MAIÚSCULAS)",
  texto_trim_minusculas: "Texto (minúsculas)",
  documento_cpf_cnpj: "CPF/CNPJ",
  booleano_sim_nao: "Sim/Não",
  nenhuma: "Sem transformação",
};

/**
 * Uma coluna sem tipo, ou com tipo `nenhuma`, não recebe tratamento nenhum.
 * Isso é legítimo (texto livre), mas precisa ficar visível antes de alguém
 * aprovar o dicionário — R-08: validação alerta, nunca corrige.
 */
export function semTratamento(tipo?: string): boolean {
  return !tipo || tipo === "nenhuma";
}
