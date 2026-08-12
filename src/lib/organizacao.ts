/**
 * Modo de entrada de uma organização, e o normalizador de domínio.
 *
 * ⚠️ POR QUE O LITERAL VIVE AQUI, E SÓ AQUI
 *
 * O valor de `organizations.join_mode` diverge entre o SQL versionado deste
 * repo e o banco em produção — é a dívida registrada no CLAUDE.md §8
 * ("Divergências entre o banco real e as migrations... Confirme o estado real
 * antes de mexer em entrada de organização"):
 *
 *   • migrations do repo (20260722130000): CHECK IN ('share_id', 'dominio')
 *   • dump de produção (schema.sql, 2026-08-06): DEFAULT 'codigo',
 *     CHECK IN ('codigo', 'dominio') — e `handle_new_user` e
 *     `resolver_codigo_organizacao` no dump comparam com 'codigo'
 *
 * LER é inofensivo (todo o código compara contra `MODO_DOMINIO`, que é igual
 * nos dois mundos). ESCREVER com o literal errado devolve `23514
 * check_violation` e a troca de modo falha.
 *
 * ✅ MEDIDO CONTRA O BANCO REAL em 2026-08-12, antes de escrever a tela de
 * domínios. `select join_mode, count(*) from organizations group by 1`
 * devolveu linhas com `'codigo'` — e uma linha não pode existir violando o
 * CHECK, então `'codigo'` é comprovadamente gravável. O
 * `pg_get_constraintdef` confirmou `'dominio'` do outro lado. Os valores
 * abaixo NÃO são chute: quem mudar isto tem de medir de novo.
 *
 * Por isso o literal está numa constante só: quando a divergência entre o SQL
 * versionado e produção for reconciliada, muda-se uma linha aqui em vez de
 * caçar strings pela tela.
 */
export type JoinMode = "codigo" | "dominio";

/** Entrada por código de convite de 12 caracteres. */
export const MODO_CONVITE: JoinMode = "codigo";

/** Entrada automática por domínio de e-mail verificado. */
export const MODO_DOMINIO: JoinMode = "dominio";

/**
 * Reduz o que a pessoa digitou ao domínio puro.
 *
 * ⚠️ A saída daqui precisa ser IDÊNTICA ao que o servidor vai procurar no
 * login. `resolve_org_from_identity` calcula o domínio candidato como
 * `lower(btrim(split_part(email, '@', 2)))` e busca por igualdade exata — um
 * domínio cadastrado como "Empresa.com " ou "www.empresa.com" fica na tabela
 * e nunca casa com ninguém, sem erro nenhum aparecer.
 *
 * Os quatro recortes cobrem o que as pessoas de fato colam: o e-mail inteiro,
 * a URL do site, o `www.` na frente e a barra no fim.
 */
export function normalizarDominio(bruto: string): string {
  return bruto
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    // Cola o e-mail inteiro ("alguem@empresa.com") → fica só o que vem depois
    // do @. `split` e não `replace(/^@/)`: o caso comum é o e-mail completo,
    // não um @ solto na frente.
    .replace(/^.*@/, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .replace(/\.$/, "");
}

/**
 * Formato mínimo de domínio, aplicado ao valor JÁ normalizado.
 *
 * Deliberadamente frouxo: o objetivo é pegar erro de digitação óbvio
 * ("empresa" sem TLD, espaço no meio), não validar a lista de TLDs do mundo.
 * A recusa que importa — provedor público — é do servidor, no trigger
 * `guardar_dominio_da_org`.
 */
export function dominioTemFormatoValido(normalizado: string): boolean {
  if (!normalizado || normalizado.length > 253) return false;
  return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/.test(
    normalizado,
  );
}
