/**
 * A data de hoje, no fuso do cliente — o insumo sem o qual "este mês" não existe.
 *
 * ── ⚠️ POR QUE NÃO É `new Date().toISOString()` ────────────────────────────
 *
 * `toISOString()` devolve **UTC**, e o Brasil está em UTC−3. Das 21h à
 * meia-noite, todo dia, o UTC já virou: às 21h30 de 25/08 em São Paulo, o
 * `toISOString()` diz `2026-08-26`. O planejador então filtra o dia seguinte, e
 * *"quanto vendi hoje"* — que é das perguntas mais comuns deste produto —
 * responde **zero** durante as últimas três horas de cada dia. Zero parece um
 * fato, não um erro de fuso.
 *
 * ⚠️ **O fuso é fixo em São Paulo, e é uma escolha, não um descuido.** O Brasil
 * tem quatro fusos; o Acre e parte do Amazonas estão a UTC−5. Não há
 * `timezone` por organização no schema hoje, e inventar um palpite pelo IP
 * seria pior — erraria sem deixar rastro. São Paulo é a referência comercial do
 * país e cobre a maioria dos clientes. Quando alguém do Acre reclamar de um dia
 * de diferença, a correção é uma coluna em `organizations`, e este arquivo é o
 * único lugar que muda.
 *
 * ── ⚠️ NUNCA CHAME ISTO NO ESCOPO DE MÓDULO ────────────────────────────────
 *
 * `const HOJE = dataDeHoje()` no topo de um arquivo congela a data no instante
 * em que o *isolate* subiu. A Edge Function é reaproveitada entre invocações
 * por tempo indeterminado — o valor sobreviveria à virada do dia, e a única
 * pista seria o chat responder sobre ontem sem nada quebrar. Chame por
 * requisição.
 */

/**
 * ⭐ Fuso de referência. Existe uma vez, aqui.
 *
 * Trocar por organização é uma coluna em `organizations` e um parâmetro nesta
 * função — não um segundo `Intl` espalhado por outro arquivo.
 */
const FUSO_DO_CLIENTE = "America/Sao_Paulo";

/**
 * `YYYY-MM-DD` no fuso do cliente.
 *
 * ⭐ `en-CA` não é exotismo: é a única *locale* comum cujo formato de data curto
 * já é ISO (`2026-08-25`). `pt-BR` daria `25/08/2026`, que o executor não
 * entende, e montar a string à mão a partir de `getFullYear`/`getMonth` traria
 * de volta o UTC que esta função existe para evitar.
 */
export function dataDeHoje(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO_DO_CLIENTE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
}
