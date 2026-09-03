/**
 * O `schema_metadata` visto do lado do navegador — a forma que o front escreve.
 *
 * ⭐ **Por que estas constantes saíram do `DatabasePipeline.tsx`.** Elas nasceram
 * privadas dele porque o cadastro era o único lugar que escrevia dicionário. Com
 * o B22 o "Editar Esquema" também escreve, e redeclarar `{ type: "nenhuma" }`
 * ali seria criar a segunda definição de "coluna sem regra de formatação" — o
 * padrão do D-028 em escala pequena: dois lados internamente coerentes,
 * divergindo em silêncio no dia em que um deles mudar.
 *
 * ⛔ **Isto NÃO é o leitor.** O leitor único é
 * `supabase/functions/_shared/dicionario.ts`, e ele roda no Deno — não há como
 * compartilhar código entre o navegador e a Edge Function. O que existe aqui é
 * só o mínimo que o front precisa para **montar** o objeto; interpretar o que
 * está gravado continua sendo trabalho do `lerDicionario`.
 */

/** O papel analítico de uma coluna. Espelha `PapelAnalitico` do leitor. */
export type PapelAnalitico = "medida" | "dimensao" | "identificador" | "temporal";

export interface FormattingRule {
  type: string;
  params: Record<string, unknown>;
  explicacao: string;
}

/**
 * A coluna que não tem regra de formatação — texto cru, do jeito que veio.
 *
 * ⚠️ **`type: "nenhuma"` não é neutro no executor**, e quem acrescenta coluna
 * precisa saber disso: é justamente o caso em que a coluna chega como texto e
 * precisa ser convertida na hora da conta. O `_como_numero`
 * (`query_engine/pandas_executor.py`) entende "R$ 57,50", mas o que ele não
 * conseguir converter vira ausência — não zero. Uma coluna numérica que ficar
 * em `nenhuma` responde certo; só responde mais devagar e sem garantia de
 * escala. Descrever a formatação continua sendo melhor que deixar assim.
 */
export const REGRA_SEM_FORMATACAO: FormattingRule = {
  type: "nenhuma",
  params: {},
  explicacao: "",
};

/**
 * ⭐ A versão do dicionário que o cadastro escreve.
 *
 * ⚠️ **`versao` não é enfeite: ela é o que diz ao chat se houve gente no meio.**
 * O A3 lê `conferido = versao >= 2` e calibra presunção por base — dicionário v1
 * nunca passou por humano, então os conceitos ali são palpite de modelo. Ver
 * `supabase/functions/_shared/dicionario.ts`.
 *
 * ⛔ As bases v1 **não são migradas** e conviverão para sempre: recadastrar cria
 * uuid novo e órfã os cards da base (CASCADE em `dashboard_cards`). O leitor
 * tolera as duas formas por requisito, não por gentileza.
 *
 * ⛔⛔ **E a reconciliação do B22 NÃO promove a versão.** Relê a planilha, casa
 * as colunas, acrescenta e remove — e não pergunta nada a ninguém sobre papel
 * analítico ou grão. Marcar v2 ali seria afirmar que uma pessoa conferiu cada
 * coluna, e o efeito é que o A3 **para de declarar presunção** sobre conceitos
 * que ninguém leu. A versão só sobe onde alguém de fato revisou: no cadastro.
 */
export const VERSAO_DO_DICIONARIO = 2;

/**
 * A entrada de uma coluna que o B22 acabou de encontrar na planilha.
 *
 * ⚠️ Escrita na **forma v2** mesmo numa base v1, e não há contradição: o
 * `lerDicionario` lê `papel_analitico` e `vocabulario_util` independentemente da
 * `versao` do objeto. Gravar na forma pobre perderia dado à toa; o que a
 * `versao` governa é se alguém **conferiu**, não qual é o formato.
 *
 * `dimensao` é o default pelo mesmo motivo que o leitor usa: é o papel que não
 * afirma nada de errado sobre a coluna. Chutar `medida` faria o planejador
 * tentar somar um nome de cliente.
 */
export function colunaNova() {
  return {
    semantic_definition: "",
    formatting_rule: { ...REGRA_SEM_FORMATACAO },
    papel_analitico: "dimensao" as PapelAnalitico,
    vocabulario_util: false,
  };
}
