/**
 * O dicionário da base — leitor único do `schema_metadata`. Puro, sem Deno.
 *
 * ⭐ **Por que existe um leitor, em vez de cada consumidor abrir o JSONB.**
 *
 * O `schema_metadata` é lido hoje em seis lugares (`ai-plum-chat`, `ai-agents`,
 * `dashboard-agent`, `dashboard-execute`, `query_plan.ts` e o front), cada um
 * cavando as chaves que quer. Enquanto o objeto teve duas chaves isso passou;
 * com a Etapa 2 ele ganha cinco, e **duas formas** convivendo. Seis
 * interpretadores de um formato com duas versões é a receita do D-028 — cada
 * um internamente coerente, divergindo em silêncio.
 *
 * ⛔ **Ninguém mais lê o JSONB na mão.** Quem precisa do dicionário chama
 * `lerDicionario`.
 *
 * ── ⚠️ AS DUAS VERSÕES CONVIVEM PARA SEMPRE ─────────────────────────────────
 *
 * `versao: 1` é o formato de hoje: só `semantic_definition` e `formatting_rule`
 * por coluna. `versao: 2` acrescenta `papel_analitico`, `vocabulario_util`,
 * `grao` e `observacoes`, todos conferidos por gente no cadastro.
 *
 * Tolerar a v1 **não é gentileza com o passado**, é requisito: as bases da demo
 * não serão recadastradas (recadastrar cria uuid novo e órfã os cards — C13), e
 * uma base esquecida não pode virar chat quebrado. Ela responde com o que tem.
 *
 * ── ⭐ A FORMA DE SAÍDA ESPELHA `Reconhecimento`, MENOS `confianca` ──────────
 *
 * De propósito: no B15 o A3 troca `reconhecimento` por `dicionario`, e com os
 * mesmos nomes de campo essa troca é mecânica em vez de reescrita.
 *
 * `confianca` não vem junto porque ela some (§B7 do plano): ela existia para o
 * A2 declarar onde tinha chutado, e no cadastro assistido não há chute
 * não conferido. O que ela informava sobe de granularidade — `conferido` diz se
 * houve humano no meio, e o A3 usa isso para calibrar presunção por BASE em vez
 * de por coluna.
 */

export type PapelAnalitico = "medida" | "dimensao" | "identificador" | "temporal";

export interface ColunaDoDicionario {
  /**
   * O que a coluna significa, em linguagem de negócio.
   *
   * ⭐ É o campo mais valioso do dicionário e o único que **só o humano sabe**:
   * *"lucro não inclui impostos"*, *"receita_2 parou de ser preenchida em
   * março"*. Nada disso é derivável dos dados.
   *
   * Vem do `semantic_definition` do JSONB; o nome muda aqui para casar com o
   * `Reconhecimento` que ele substitui.
   */
  conceito: string;
  papel_analitico: PapelAnalitico;
  /** Conhecer os valores distintos ajudaria? Vira pedido `vocabulario` (B04). */
  vocabulario_util: boolean;
  /** O `type` da `formatting_rule`. Quem converte texto em número é ele. */
  formatacao: string;
}

export interface Dicionario {
  versao: number;
  /** ⭐ `versao >= 2`: passou por gente no cadastro. Calibra presunção no A3. */
  conferido: boolean;
  /** O que UMA LINHA representa. `""` quando não foi declarado. */
  grao: string;
  observacoes: string[];
  colunas: Record<string, ColunaDoDicionario>;
}

const PAPEIS = new Set<PapelAnalitico>([
  "medida",
  "dimensao",
  "identificador",
  "temporal",
]);

/**
 * Papel provável a partir do tipo de formatação — o default da v1.
 *
 * ⭐ Base v1 não tem `papel_analitico`, mas **tem** `formatting_rule`, e o tipo
 * restringe bastante o papel. Deduzir daqui é muito melhor que devolver
 * `dimensao` para tudo, que faria o A3 tentar agrupar por faturamento.
 *
 * ⚠️ Restringe, não determina: `numero_inteiro` tanto é `quantidade_vendida`
 * (medida) quanto `pedido_id` (identificador). Por isso a v2 pergunta a uma
 * pessoa em vez de confiar nisto — este mapa é o piso, não o teto.
 */
const PAPEL_POR_FORMATACAO: Readonly<Record<string, PapelAnalitico>> = {
  data: "temporal",
  ano: "temporal",
  moeda_brl: "medida",
  numero_decimal: "medida",
  numero_inteiro: "medida",
  percentual: "medida",
  // CPF/CNPJ é o único tipo do enum que aponta uma entidade por si só.
  documento_cpf_cnpj: "identificador",
  texto_trim_maiusculas: "dimensao",
  texto_trim_minusculas: "dimensao",
  booleano_sim_nao: "dimensao",
  nenhuma: "dimensao",
};

/**
 * ⭐ Vocabulário por padrão nas dimensões da v1 — e o motivo é a assimetria do
 * erro, não otimismo.
 *
 * Base v1 não declara `vocabulario_util`, e não há cardinalidade no JSONB para
 * decidir. Errar para cada lado custa coisas muito diferentes:
 *
 * - **falso positivo** (buscar vocabulário de uma coluna com 5.000 valores): o
 *   teto de 200 do executor recusa em silêncio e o A3 planeja sem. Custo: um
 *   pedido desperdiçado, dentro do limite de 4 colunas.
 * - ⛔ **falso negativo** (não buscar de uma coluna com 40 valores): o resolvedor
 *   de entidade fica sem lista, e *"quanto o joão vendeu"* devolve **vazio** —
 *   a falha exata que o vocabulário existe para evitar, e que parece um fato.
 *
 * Então a v1 assume `true` onde o papel é `dimensao`, e o executor filtra.
 */
function vocabularioPadrao(papel: PapelAnalitico): boolean {
  return papel === "dimensao";
}

interface ColunaCrua {
  semantic_definition?: unknown;
  formatting_rule?: { type?: unknown } | null;
  papel_analitico?: unknown;
  vocabulario_util?: unknown;
}

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : "";
}

/**
 * Lê o `schema_metadata` e devolve o dicionário normalizado.
 *
 * ⚠️ **Nunca lança e nunca devolve `undefined` em campo nenhum.** Ele é chamado
 * no caminho da pergunta, e um `schema_metadata` estranho tem de virar
 * dicionário pobre, não turno perdido. Base sem dicionário nenhum é um caso
 * real: o cadastro grava o objeto no fim, e uma base em rascunho não tem nada.
 */
export function lerDicionario(schemaMetadata: unknown): Dicionario {
  const raiz = (schemaMetadata ?? {}) as Record<string, unknown>;

  // ⚠️ `versao` ausente é 1, nunca `undefined`. Deixar `undefined` escapar
  // obrigaria todo consumidor a lembrar de tratar, e um dia um não lembra.
  const versaoCrua = raiz.versao;
  const versao = typeof versaoCrua === "number" && versaoCrua >= 1
    ? Math.floor(versaoCrua)
    : 1;

  const colunasCruas = raiz.columns;
  const entradas = colunasCruas && typeof colunasCruas === "object" &&
      !Array.isArray(colunasCruas)
    ? Object.entries(colunasCruas as Record<string, unknown>)
    : [];

  const colunas: Record<string, ColunaDoDicionario> = {};
  for (const [nome, valor] of entradas) {
    if (!nome) continue;
    // Coluna cujo valor não é objeto ainda conta como coluna existente: o nome
    // dela está no cabeçalho da planilha. Some a descrição, não a coluna.
    const c = (valor && typeof valor === "object" && !Array.isArray(valor)
      ? valor
      : {}) as ColunaCrua;

    const formatacao = texto(c.formatting_rule?.type) || "nenhuma";
    const papelDeclarado = texto(c.papel_analitico) as PapelAnalitico;
    const papel = PAPEIS.has(papelDeclarado)
      ? papelDeclarado
      : PAPEL_POR_FORMATACAO[formatacao] ?? "dimensao";

    colunas[nome] = {
      conceito: texto(c.semantic_definition),
      papel_analitico: papel,
      vocabulario_util: typeof c.vocabulario_util === "boolean"
        ? c.vocabulario_util
        : vocabularioPadrao(papel),
      formatacao,
    };
  }

  const observacoes = Array.isArray(raiz.observacoes)
    ? raiz.observacoes.map(texto).filter(Boolean)
    : [];

  return {
    versao,
    conferido: versao >= 2,
    grao: texto(raiz.grao),
    observacoes,
    colunas,
  };
}

/**
 * Normaliza um dicionário que **voltou do cliente**, entre as duas invocações.
 *
 * ⭐ Por que existe: o `ad_hoc` é dividido em duas invocações (o turno inteiro
 * numa só encadeava cinco idas à rede e a função morria antes de responder), e o
 * dicionário atravessa o cliente no meio. O que chega em `ad_hoc_planejar` é
 * JSON de fora — pode vir truncado, editado ou de uma versão anterior do front.
 *
 * ⚠️ **Isso é seguro pela mesma razão que os `pedidos`: nada aqui é decisão de
 * autorização.** O `authorizePlan` roda no servidor sobre o plano final e a
 * barreira 4 do Lambda reconfere contra o `allowed_columns` lido com o JWT.
 * Dicionário adulterado muda o que o A3 *acredita* sobre a base, não o que ele
 * *pode ler* — no pior caso a pessoa recebe uma resposta ruim sobre a própria
 * base, com as colunas que ela já podia ver.
 *
 * A implementação é um adaptador de forma: reescreve `Dicionario` de volta no
 * formato do `schema_metadata` e reusa `lerDicionario`, para os defaults ficarem
 * num lugar só. Duplicá-los aqui seria criar o segundo interpretador que este
 * arquivo existe para não ter.
 */
export function normalizarDicionario(cru: unknown): Dicionario {
  const d = (cru ?? {}) as Partial<Dicionario>;
  const colunas = (d.colunas && typeof d.colunas === "object" && !Array.isArray(d.colunas)
    ? d.colunas
    : {}) as Record<string, Partial<ColunaDoDicionario>>;

  const columns: Record<string, unknown> = {};
  for (const [nome, c] of Object.entries(colunas)) {
    columns[nome] = {
      semantic_definition: c?.conceito,
      papel_analitico: c?.papel_analitico,
      vocabulario_util: c?.vocabulario_util,
      formatting_rule: { type: c?.formatacao },
    };
  }

  return lerDicionario({
    versao: d.versao,
    grao: d.grao,
    observacoes: d.observacoes,
    columns,
  });
}

/**
 * As colunas cujo vocabulário vale buscar, em ordem estável.
 *
 * Herdou o comportamento do `colunasComVocabularioUtil` que vivia em
 * `reconhecimento.ts` — apagado em 2026-08-27 com o resto do A2 (D-054). Esta é
 * a única implementação desde então.
 *
 * Ordem alfabética porque o chamador corta as 4 primeiras — sem ordem estável,
 * qual coluna ganha vocabulário mudaria entre execuções, e com ela o plano.
 */
export function colunasComVocabulario(d: Dicionario): string[] {
  return Object.entries(d.colunas)
    .filter(([, c]) => c.vocabulario_util)
    .map(([nome]) => nome)
    .sort();
}

/**
 * O dicionário como o A3 o recebe.
 *
 * ⚠️ **Nome técnico da coluna vai junto, de propósito.** O A3 precisa dele para
 * escrever o Query Plan — é o `col` que o executor procura no cabeçalho. Quem
 * não pode mostrar nome técnico é o A4, na resposta ao usuário.
 *
 * ⭐ O `conceito` vazio é dito, não omitido: *"(sem descrição)"* avisa o A3 de
 * que ninguém descreveu aquela coluna, o que é informação. Omitir faria a
 * coluna parecer inexistente e ele a evitaria sem saber por quê.
 */
export function paraPrompt(d: Dicionario): string {
  const linhas = Object.entries(d.colunas).map(([nome, c]) => {
    const partes = [
      `- ${nome}: ${c.conceito || "(sem descrição)"}`,
      `[${c.papel_analitico}`,
      c.formatacao !== "nenhuma" ? `, ${c.formatacao}` : "",
      "]",
    ];
    return partes.join("");
  });

  const blocos = [
    "DICIONÁRIO DA BASE (coluna: conceito [papel, formato]):",
    linhas.length ? linhas.join("\n") : "(nenhuma coluna descrita)",
  ];

  if (d.grao) blocos.push("", `GRÃO — o que UMA LINHA representa: ${d.grao}`);
  if (d.observacoes.length) {
    blocos.push("", "OBSERVAÇÕES SOBRE A BASE:", ...d.observacoes.map((o) => `- ${o}`));
  }

  // ⭐ Dizer que o dicionário não foi conferido é o que substitui a `confianca`
  // por coluna: em vez de o A3 saber onde desconfiar, ele sabe QUANDO desconfiar
  // de tudo. Base v1 nunca passou por gente — os conceitos ali são palpite de
  // modelo que ninguém leu.
  if (!d.conferido) {
    blocos.push(
      "",
      "⚠️ Este dicionário NÃO foi conferido por uma pessoa: os conceitos acima " +
        "foram deduzidos automaticamente e podem estar errados. Declare presunção " +
        "sempre que usar uma coluna cuja descrição você teve de interpretar.",
    );
  }

  return blocos.join("\n");
}

/**
 * Uma base no ÍNDICE que o A2 encaminhador lê para escolher.
 *
 * ⭐ `nome` é o que o `from` do Query Plan casa, e quem o escolhe é a Edge
 * Function a partir do dataset — nunca o LLM.
 */
export interface BaseNoIndice {
  nome: string;
  dicionario: Dicionario;
}

/**
 * O ÍNDICE das bases — o insumo do A2, e **de propósito muito menor** que o
 * dicionário.
 *
 * ── ⭐⭐ POR QUE NÃO É O `paraPrompt` DE CADA BASE ───────────────────────────
 *
 * O A2 existe porque mandar o dicionário completo de seis planilhas ao A3 em
 * toda pergunta é caro e ruidoso. Se o A2 recebesse esses mesmos seis
 * dicionários para escolher, o custo teria sido **movido um salto**, não
 * resolvido — e o A2 seria gasto puro.
 *
 * ⇒ Aqui vai o mínimo para ESCOLHER: por base, o nome, o grão, quantas colunas
 * ela tem, e a **lista de nomes de coluna agrupada por papel analítico**. Sem o
 * conceito de cada coluna, sem formatação, sem observações. O A3 depois recebe o
 * `paraPrompt` **inteiro** — mas só das bases escolhidas. É aí que a economia
 * mora.
 *
 * ⚠️ **O nome da coluna é informação suficiente para escolher a BASE, e não para
 * planejar.** É por isso que o A2 não pode emitir Query Plan: ele viu nomes, não
 * significados. Quem lê `lucro` sem ler *"lucro não inclui impostos"* erraria a
 * conta — e é justamente o conceito que fica fora deste índice.
 *
 * ⭐ Agrupar por papel em vez de listar cru é o que torna a escolha possível sem
 * o conceito: *"tem coluna temporal?"* é a pergunta que decide se um
 * `a3_tendencia` consegue trabalhar naquela base.
 */
export function paraIndice(bases: readonly BaseNoIndice[]): string {
  const blocos = bases.map(({ nome, dicionario }) => {
    const porPapel = new Map<PapelAnalitico, string[]>();
    for (const [coluna, c] of Object.entries(dicionario.colunas)) {
      const lista = porPapel.get(c.papel_analitico) ?? [];
      lista.push(coluna);
      porPapel.set(c.papel_analitico, lista);
    }

    const linhas = [`### ${nome}`];
    linhas.push(
      dicionario.grao
        ? `UMA LINHA É: ${dicionario.grao}`
        : "UMA LINHA É: (não declarado)",
    );

    const total = Object.keys(dicionario.colunas).length;
    linhas.push(`${total} coluna(s):`);

    // ⭐ Ordem fixa, não a de inserção: sem ela o mesmo índice sairia diferente
    // entre execuções e a escolha do A2 mudaria sem nada ter mudado na base.
    for (const papel of ["temporal", "medida", "dimensao", "identificador"] as const) {
      const nomes = porPapel.get(papel);
      if (!nomes?.length) continue;
      linhas.push(`  ${papel}: ${[...nomes].sort().join(", ")}`);
    }
    if (!total) linhas.push("  (nenhuma coluna descrita)");

    // ⚠️ Base não conferida entra no índice do mesmo jeito — esconder uma base
    // porque ninguém revisou o dicionário dela faria a pergunta parecer
    // impossível em vez de arriscada. O aviso vai ao A3, que é quem planeja.
    if (!dicionario.conferido) linhas.push("  ⚠️ dicionário não conferido por pessoa");

    return linhas.join("\n");
  });

  return [
    "AS BASES DESTA ORGANIZAÇÃO (nome: o que uma linha é, e as colunas por papel):",
    "",
    blocos.length ? blocos.join("\n\n") : "(nenhuma base cadastrada)",
  ].join("\n");
}
