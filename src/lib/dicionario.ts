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

/**
 * O rótulo de cada papel na tela, e o que ele significa para quem revisa.
 *
 * ⭐ Era privado do `DatabasePipeline.tsx` até o B23, quando o "Editar Esquema"
 * passou a oferecer a mesma escolha sobre uma base já ativa. Duas listas de
 * papéis divergiriam em silêncio — a segunda tela ganharia um papel novo meses
 * depois da primeira, e ninguém notaria até um cadastro e uma edição
 * descreverem a mesma coluna de formas que não existem no mesmo enum.
 */
export const PAPEIS: { valor: PapelAnalitico; rotulo: string; ajuda: string }[] = [
  { valor: "medida", rotulo: "Medida", ajuda: "serve para somar ou tirar média" },
  { valor: "dimensao", rotulo: "Dimensão", ajuda: "serve para agrupar ou filtrar" },
  { valor: "identificador", rotulo: "Identificador", ajuda: "aponta uma linha específica" },
  { valor: "temporal", rotulo: "Temporal", ajuda: "data, mês ou ano" },
];

/**
 * ⭐⭐ **Só dimensão pode ter vocabulário — e esta é a única implementação.**
 *
 * ⚠️ **Não é açúcar sintático: é uma invariante que o leitor NÃO reforça.**
 * `colunasComVocabulario` (`_shared/dicionario.ts`) filtra apenas por
 * `vocabulario_util`, sem olhar o papel. Um `true` sobrando numa coluna de
 * medida faz o chat pedir a lista de valores de uma coluna numérica em **toda**
 * pergunta daquela base — desperdiçando um dos 4 pedidos de vocabulário, ou
 * (abaixo do teto de distintos) entregando ao planejador uma lista de números
 * apresentada como vocabulário de categoria.
 *
 * ⚠️ **E o `true` sobra com facilidade**, porque a tela esconde o interruptor
 * fora de dimensão: quem marcou o vocabulário e depois trocou o papel para
 * medida não tem mais o controle que o desligaria. Por isso a checagem é no
 * SALVAMENTO, e não no `onChange` do papel — limpar ali faria quem trocasse por
 * engano e voltasse perder a escolha, com o interruptor reaparecendo desligado.
 *
 * Com o cadastro e o "Editar Esquema" gravando dicionário, a regra precisa de um
 * dono: duplicá-la seria o D-028 em escala pequena.
 */
export function vocabularioEfetivo(
  papel: PapelAnalitico,
  querVocabulario: unknown,
): boolean {
  return papel === "dimensao" && Boolean(querVocabulario);
}

export interface FormattingRule {
  type: string;
  params: Record<string, unknown>;
  explicacao: string;
}

/**
 * Uma coluna dentro do `schema_metadata`, na forma em que ele é GRAVADO.
 *
 * ⚠️ **Todos opcionais, e é requisito, não frouxidão.** Base v1 não tem
 * `papel_analitico` nem `vocabulario_util`, e não será migrada — recadastrar
 * cria uuid novo e órfã os cards (C13). Quem lê preenche o default; quem
 * escreve preenche tudo.
 *
 * ⛔ Isto NÃO é o tipo de leitura. O leitor é `_shared/dicionario.ts`, roda no
 * Deno, e devolve `ColunaDoDicionario` com os campos já resolvidos e obrigatórios.
 */
export interface ColunaDoSchema {
  semantic_definition?: string;
  formatting_rule?: FormattingRule;
  papel_analitico?: PapelAnalitico;
  vocabulario_util?: boolean;
}

/** O `schema_metadata` inteiro, como as duas telas do front o montam. */
export interface SchemaMetadata {
  versao?: number;
  grao?: string;
  observacoes?: string[];
  columns: Record<string, ColunaDoSchema>;
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
 * que ninguém leu.
 *
 * ⭐ **A versão só sobe onde alguém de fato revisou, e são DOIS lugares desde o
 * B23:** o cadastro (esta constante) e o botão "Marcar como conferida" do
 * "Editar Esquema" — que é um ato explícito, separado do salvar, e reversível.
 * Salvar edição nunca promove.
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
export function colunaNova(): ColunaDoSchema {
  return {
    semantic_definition: "",
    formatting_rule: { ...REGRA_SEM_FORMATACAO },
    papel_analitico: "dimensao" as PapelAnalitico,
    vocabulario_util: false,
  };
}
