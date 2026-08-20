import { distancia, normalizar } from "./texto.ts";

/**
 * Resolvedor de entidade — **código, sem LLM**.
 *
 * Casa o que o usuário escreveu ("o vendedor Fulano") com o literal que existe
 * na base ("FULANO DA SILVA"), a partir da lista que o pedido `vocabulario`
 * devolveu. É uma das três peças determinísticas do remake (V7 §1), e é
 * determinística de propósito: pedir isto a um modelo troca uma resposta
 * verificável por uma plausível, no exato ponto em que errar significa filtrar
 * pela pessoa errada.
 *
 * ⭐ **Dois candidatos plausíveis viram PERGUNTA, não escolha.** É a regra que
 * organiza o arquivo. Escolher errado devolve um número certo sobre a pessoa
 * errada — o mesmo formato de falha que o `MissingColumnError` do executor
 * existe para evitar, e o pior que o produto pode fazer.
 *
 * ── POR QUE A DISTÂNCIA DE EDIÇÃO É A SEGUNDA CAMADA, NÃO A PRIMEIRA ─────
 *
 * O executor já normaliza os dois lados de `=` e `in` (trim, maiúsculas, sem
 * acento). Então caixa e acento **não são problema do resolvedor**: "joao" já
 * casa com "JOÃO" lá na frente. O que sobra para ele é o que a normalização não
 * alcança — "João Silva" contra "JOAO DA SILVA", "ACME" contra "ACME LTDA",
 * um dígito trocado. Daí a distância vir depois de `normalizar()`, e não no
 * lugar dela.
 */

/** Um valor distinto da coluna, com quantas linhas ele tem. */
export interface ValorDoVocabulario {
  valor: string;
  linhas: number;
}

export type Resolucao =
  | { tipo: "exato"; literal: string }
  | { tipo: "ambiguo"; opcoes: string[] }
  | { tipo: "nenhum" };

/**
 * ⚠️ Teto de distância, proporcional ao tamanho do termo.
 *
 * Absoluto não funciona: distância 3 é razoável em "NATUREZA DA AQUISICAO" e
 * absurda em "ANA" — ali ela casaria com quase qualquer nome de três letras.
 * 40% do termo, com piso de 1, mantém a tolerância proporcional ao que foi
 * digitado.
 */
function tetoDeDistancia(termo: string): number {
  return Math.max(1, Math.floor(termo.length * 0.4));
}

/**
 * Casa `termo` contra os valores da coluna.
 *
 * A ordem das tentativas é do mais confiável para o menos:
 *
 *  1. **Igualdade normalizada** — é o que o executor faria de qualquer jeito.
 *  2. **Contenção** — "ACME" dentro de "ACME LTDA". Um só candidato: resolve.
 *  3. **Distância de edição** — erro de digitação e grafia diferente.
 *
 * Em 2 e 3, mais de um candidato empatado vira `ambiguo` — nunca "o primeiro".
 */
export function resolverEntidade(
  termo: string,
  vocabulario: ValorDoVocabulario[],
): Resolucao {
  const alvo = normalizar(termo);
  if (!alvo) return { tipo: "nenhum" };

  const candidatos = vocabulario
    .filter((v) => v?.valor != null)
    .map((v) => ({ ...v, norm: normalizar(v.valor) }));

  // 1. Exato. Se a base tem a mesma grafia normalizada mais de uma vez
  // ("Ana" e "ANA"), qualquer uma serve: o `where` do executor casa as duas.
  const exatos = candidatos.filter((c) => c.norm === alvo);
  if (exatos.length) return { tipo: "exato", literal: exatos[0].valor };

  // 2. Contenção, nos dois sentidos: "ACME" dentro de "ACME LTDA", e
  // "JOAO DA SILVA COSTA" contendo o "JOAO DA SILVA" da base.
  const contidos = candidatos.filter(
    (c) => c.norm.includes(alvo) || alvo.includes(c.norm),
  );
  if (contidos.length === 1) return { tipo: "exato", literal: contidos[0].valor };
  if (contidos.length > 1) return { tipo: "ambiguo", opcoes: maisFrequentes(contidos) };

  // 3. Distância de edição. Só os empatados no menor valor disputam — um
  // candidato a distância 1 não compete com outro a distância 3.
  const teto = tetoDeDistancia(alvo);
  const perto = candidatos
    .map((c) => ({ ...c, d: distancia(alvo, c.norm) }))
    .filter((c) => c.d <= teto);

  if (!perto.length) return { tipo: "nenhum" };

  const menor = Math.min(...perto.map((c) => c.d));
  const empatados = perto.filter((c) => c.d === menor);

  if (empatados.length === 1) return { tipo: "exato", literal: empatados[0].valor };
  return { tipo: "ambiguo", opcoes: maisFrequentes(empatados) };
}

/**
 * As opções que vão para a pergunta, mais frequentes primeiro.
 *
 * A contagem de linhas vem do próprio `vocabulario` e é o melhor desempate que
 * existe sem adivinhar: entre "ACME LTDA" com 400 linhas e "ACME LTDA ME" com
 * 2, a primeira é a que o usuário provavelmente quis dizer. ⚠️ Mas ela ordena a
 * pergunta, **não** a responde — quem escolhe continua sendo o usuário.
 *
 * Limitado a 5: uma pergunta com vinte opções não é uma pergunta, é uma lista.
 */
function maisFrequentes(cs: { valor: string; linhas: number }[]): string[] {
  return [...cs]
    .sort((a, b) => (b.linhas ?? 0) - (a.linhas ?? 0) || a.valor.localeCompare(b.valor))
    .slice(0, 5)
    .map((c) => c.valor);
}
