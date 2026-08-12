/**
 * O ÚNICO interpretador de Query Plan do sistema.
 *
 * A Edge Function extrai as colunas que um plano referencia. O serviço Python
 * NÃO reimplementa isso: ele recebe o conjunto já resolvido, dentro do payload
 * assinado, e faz apenas comparação de conjunto.
 *
 * O motivo é concreto. O `where` é recursivo, com nós `and`/`or` que aninham
 * outros nós. Um interpretador em TypeScript e outro em Python concordariam nos
 * casos simples e divergiriam num aninhamento de três níveis, ou quando o
 * Agente A produzisse uma forma que só um dos dois trata. E quando duas travas
 * de segurança discordam, quem passa é a mais frouxa. É assim que um bypass
 * nasce.
 *
 * Um interpretador, dois pontos de aplicação.
 *
 * Este arquivo não importa nada de propósito: assim ele roda igual no Deno da
 * Edge Function e no Node do vitest, e o que é testado é exatamente o que é
 * executado.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

export type WhereNode =
  | { op: "and" | "or"; args?: unknown[] }
  | { left?: unknown; op?: string; right?: unknown };

/**
 * Expressão aritmética linha a linha, usada dentro do `col` de uma agregação:
 * `{"agg":"sum","col":{"op":"mul","args":["vendas_mes","preco_unitario"]}}`.
 *
 * Existe porque receita quase nunca é uma coluna: numa planilha de vendas ela é
 * `soma(quantidade × preço)`, um produto linha a linha que precisa acontecer
 * ANTES da soma. Sem isto, o Agente A só conseguia pedir `sum(quantidade)` e
 * `avg(preco)` separados, e alguém multiplicava os dois — o que dá um número
 * diferente sempre que os preços não são todos iguais, e pior, quem multiplicava
 * era o Agente C, em texto livre, violando o R-02.
 *
 * `args` aceita nome de coluna, número literal ou outro nó (para `(preco -
 * custo) * qtd`).
 */
export type ArithmeticNode = { op: string; args?: unknown[] };

/** Os quatro operadores aritméticos aceitos. Fechado de propósito. */
export const ARITHMETIC_OPS = ["mul", "add", "sub", "div"] as const;

export interface QueryPlan {
  from?: string;
  target_columns?: unknown[];
  select?: unknown[];
  where?: unknown;
  group_by?: unknown[];
  order_by?: unknown[];
  limit?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Extração
// ─────────────────────────────────────────────────────────────────────────────

/** `tabela.coluna` vira `coluna`, igual ao `_strip_table` do executor. */
export function stripTable(col: string): string {
  const i = col.indexOf(".");
  return i === -1 ? col : col.slice(i + 1);
}

function addCol(into: Set<string>, raw: unknown): void {
  if (typeof raw !== "string") return;
  const c = stripTable(raw.trim());
  if (c) into.add(c);
}

/**
 * Percorre uma expressão aritmética recolhendo TODA coluna citada, em qualquer
 * profundidade.
 *
 * Esta função é RBAC. Uma coluna que escape daqui não é lida da planilha (o
 * executor só carrega o conjunto assinado, e depois levanta MissingColumnError),
 * então o pior caso não é vazamento — mas também não é aceitável: seria uma
 * checagem de permissão que não enxerga metade da expressão que autoriza. O
 * `addCol` só aceita string, então um operando numérico literal é ignorado
 * naturalmente, que é o certo: `2` não é coluna.
 */
function walkArithmetic(node: unknown, into: Set<string>, depth = 0): void {
  if (!node || typeof node !== "object" || depth > 32) return;

  const n = node as Record<string, unknown>;
  const args = Array.isArray(n.args) ? n.args : [];
  for (const a of args) {
    if (a && typeof a === "object") walkArithmetic(a, into, depth + 1);
    else addCol(into, a);
  }
  // Uma expressão aritmética pode aparecer com a coluna em `col` em vez de
  // dentro de `args` se o modelo misturar as duas formas. Recolher os dois é
  // mais seguro que escolher um: sobrar coluna no conjunto exigido barra um
  // plano legítimo (ruído visível); faltar coluna deixa a checagem cega.
  addCol(into, n.col);
}

/** `mul`/`add`/`sub`/`div` — os nós que `walkArithmetic` sabe percorrer. */
function ehOperadorAritmetico(op: string): boolean {
  return (ARITHMETIC_OPS as readonly string[]).includes(op);
}

/**
 * Percorre um nó de `where`, incluindo `and`/`or` aninhados em qualquer
 * profundidade. `maxDepth` existe para que um plano malformado ou hostil
 * (auto-referência, aninhamento absurdo) não vire estouro de pilha na função
 * que aplica o RBAC.
 */
function walkWhere(node: unknown, into: Set<string>, depth = 0): void {
  if (!node || typeof node !== "object" || depth > 32) return;

  const n = node as Record<string, unknown>;
  const op = typeof n.op === "string" ? n.op.toLowerCase() : "";

  if (op === "and" || op === "or") {
    const args = Array.isArray(n.args) ? n.args : [];
    for (const a of args) walkWhere(a, into, depth + 1);
    return;
  }

  // O executor não filtra por expressão aritmética hoje, mas se um plano trouxer
  // uma aqui, as colunas dela precisam entrar no conjunto exigido do mesmo
  // jeito. Ignorar `args` porque "não é suportado" deixaria a extração cega
  // justamente no ramo que ninguém revisou.
  if (ehOperadorAritmetico(op)) {
    walkArithmetic(n, into, depth + 1);
    return;
  }

  // Folha. `left` é o nome da coluna; `right` é valor e nunca é coluna.
  addCol(into, n.left);

  // Alguns planos usam `col` no lugar de `left`. Aceitar os dois é mais seguro
  // que ignorar: ignorar significaria deixar passar uma referência de coluna.
  addCol(into, n.col);
}

/**
 * Os nomes que o `select` **cria** (o `as` de cada expressão nomeada).
 *
 * Não são colunas de origem: `{"expr":{"agg":"count","col":"estudo"},"as":"quantidade"}`
 * lê `estudo` da planilha e batiza o resultado de `quantidade`. Nenhuma planilha
 * tem uma coluna `quantidade`, e nenhum `allowed_columns` pode conter uma.
 */
function selectAliases(plan: QueryPlan): Set<string> {
  const aliases = new Set<string>();
  for (const item of plan.select ?? []) {
    if (!item || typeof item !== "object") continue;
    const as = (item as Record<string, unknown>).as;
    if (typeof as !== "string") continue;
    const a = stripTable(as.trim());
    if (a) aliases.add(a);
  }
  return aliases;
}

/**
 * Todas as colunas de ORIGEM que um Query Plan referencia — as que serão lidas
 * da planilha e, por isso, as que o RBAC precisa autorizar.
 *
 * As sete posições possíveis: `target_columns`, `select` (expressão string),
 * `select` (expressão objeto com `col`), `select` (expressão aritmética, onde as
 * colunas vivem dentro de `args`, recursivo), `where` (recursivo), `group_by` e
 * `order_by`. Se alguma escapar, uma coluna proibida atravessa a checagem.
 *
 * `order_by` é a única com dois espaços de nomes, porque é a única que o
 * executor resolve DEPOIS da agregação (`query_engine/pandas_executor.py`,
 * bloco ORDER BY): ali as colunas do frame já são os aliases do `select`. Ver
 * `selectAliases` e o comentário no laço correspondente.
 */
export function extractColumns(plan: QueryPlan | null | undefined): Set<string> {
  const cols = new Set<string>();
  if (!plan || typeof plan !== "object") return cols;

  for (const c of plan.target_columns ?? []) addCol(cols, c);

  for (const item of plan.select ?? []) {
    if (!item || typeof item !== "object") {
      addCol(cols, item);
      continue;
    }
    const expr = (item as Record<string, unknown>).expr;
    if (expr && typeof expr === "object") {
      const e = expr as Record<string, unknown>;
      // `col` deixou de ser sempre uma string: numa agregação sobre expressão
      // derivada ele é um nó aritmético
      // (`{"agg":"sum","col":{"op":"mul","args":["qtd","preco"]}}`).
      //
      // Este `else` é a parte que importa. `addCol` descarta calado tudo que
      // não é string, então antes desta mudança um nó aqui não contribuía com
      // NENHUMA coluna: o plano seria autorizado sem que ninguém olhasse
      // `qtd` nem `preco` contra o allowed_columns do cargo.
      if (e.col && typeof e.col === "object") walkArithmetic(e.col, cols);
      else addCol(cols, e.col);

      // Forma alternativa: a própria `expr` é o nó aritmético, com o `agg`
      // ao lado (`{"agg":"sum","op":"mul","args":[...]}`). O executor aceita
      // as duas, então a extração precisa aceitar as duas — é exatamente o
      // tipo de divergência entre interpretadores que este arquivo existe
      // para não deixar acontecer.
      if (typeof e.op === "string" && ehOperadorAritmetico(e.op.toLowerCase())) {
        walkArithmetic(e, cols);
      }
    } else {
      addCol(cols, expr);
    }
  }

  walkWhere(plan.where, cols);

  // `group_by` é aplicado ANTES da agregação, sobre o frame de origem, então
  // aqui um nome é sempre coluna de verdade. Continua estrito de propósito: um
  // alias em `group_by` seria uma coluna real sendo lida, e dispensá-lo abriria
  // exatamente o bypass que este arquivo existe para fechar.
  //
  // Duas formas, desde a Fase 5b (agrupar por período):
  //   "data_da_venda"                              ← forma de sempre
  //   {"col": "data_da_venda", "trunc": "month"}   ← truncamento de data
  //
  // O `col` é lido com `addCol` igual à forma string, porque é a MESMA coluna
  // de origem: truncar não muda o que precisa ser lido da planilha nem o que o
  // RBAC precisa autorizar. O `trunc` em si não é coluna e não entra.
  //
  // Sem este ramo, `addCol` descartaria o objeto calado (ele só aceita string) e
  // a coluna de data não entraria em `required` — o executor não a carregaria e
  // o card morreria em `MissingColumnError`. Falha fechada, não vazamento (o
  // executor só lê o conjunto assinado), mas um card quebrado sem motivo
  // aparente. Mesmo raciocínio do `else` da expressão aritmética acima.
  for (const c of plan.group_by ?? []) {
    if (c && typeof c === "object" && !Array.isArray(c)) {
      addCol(cols, (c as Record<string, unknown>).col);
    } else {
      addCol(cols, c);
    }
  }

  // `order_by` é o oposto: roda depois da agregação, sobre o frame de saída,
  // cujas colunas são os aliases. Ordenar por um alias não lê nada da planilha
  // — o valor já foi derivado de colunas que passaram por esta mesma checagem.
  //
  // Tratar o alias como coluna de origem barrava plano legítimo. Em 2026-08-10,
  // "quais estudos tem?" gerou `order_by: [{col:"quantidade"}]` sobre o alias do
  // próprio `count`, e um Admin com todas as 7 colunas liberadas recebeu "sua
  // pergunta usa uma coluna que seu cargo nao pode ver" — porque `quantidade`
  // era exigida em `allowed_columns`, onde ela não pode estar. Era também a
  // causa real de `investigacao-rbac-admin-colunas-negadas.md`, cujas hipóteses
  // A–D procuravam desalinhamento de dado que não existia.
  //
  // Excluir o alias corrige duas coisas de uma vez: `required` vira o conjunto
  // que o executor consegue de fato carregar da planilha. Pedir `quantidade` ao
  // `sheets.py` seria `MissingColumnError` mesmo com o RBAC liberado.
  const aliases = selectAliases(plan);
  for (const o of plan.order_by ?? []) {
    const bruto = o && typeof o === "object" ? (o as Record<string, unknown>).col : o;
    if (typeof bruto === "string" && aliases.has(stripTable(bruto.trim()))) continue;
    addCol(cols, bruto);
  }

  return cols;
}

// ─────────────────────────────────────────────────────────────────────────────
// Autorização
// ─────────────────────────────────────────────────────────────────────────────

export interface AuthorizationResult {
  allowed: boolean;
  /** Colunas que o plano usa e o cargo não pode ver. Vazio quando allowed. */
  forbidden: string[];
  /** Conjunto a carregar da planilha. Só preenchido quando allowed. */
  required: string[];
}

/**
 * O plano só pode usar colunas que o cargo enxerga.
 *
 * Recusa em vez de filtrar em silêncio. Tirar uma coluna do `where` muda o
 * significado do resultado: o card continuaria aparecendo, com um número
 * calculado sobre outro recorte, e ninguém notaria.
 */
export function authorizePlan(
  plan: QueryPlan,
  allowedColumns: readonly string[],
): AuthorizationResult {
  const used = extractColumns(plan);
  const allowed = new Set(allowedColumns.map((c) => c.trim()).filter(Boolean));

  const forbidden: string[] = [];
  for (const c of used) if (!allowed.has(c)) forbidden.push(c);
  forbidden.sort();

  return {
    allowed: forbidden.length === 0,
    forbidden,
    required: [...used].sort(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Impressão digital da permissão
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Identidade do CONJUNTO de colunas que um cargo enxerga num dataset.
 *
 * É esta digital, e não o role_id, que entra na chave do cache de snapshots.
 * O que muda o resultado de um card é o conjunto de colunas, e esse conjunto
 * é mutável: quando o admin revoga uma coluna, a digital muda, o snapshot
 * antigo deixa de ser encontrado e o sistema recalcula. Vazamento de dado
 * revogado deixa de depender de alguém lembrar de invalidar cache.
 *
 * Ordenação e separador nulo importam: sem ordenar, a mesma permissão geraria
 * digitais diferentes conforme a ordem de leitura do banco, e o cache nunca
 * acertaria. Sem separador fora do alfabeto de nomes de coluna, os conjuntos
 * ["ab","c"] e ["a","bc"] colidiriam.
 */
export async function permissionsFingerprint(
  allowedColumns: readonly string[],
): Promise<string> {
  const normalizadas = [...new Set(allowedColumns.map((c) => c.trim()).filter(Boolean))]
    .sort();
  // O separador e o caractere NUL, escrito como ESCAPE e nunca como o
  // caractere literal. Este arquivo e inlinado num arquivo que se cola
  // num campo de texto do navegador, e byte nulo literal nao sobrevive
  // a copiar e colar: sumiria em silencio, a digital calculada no
  // painel passaria a ser outra, e nenhum snapshot ja gravado seria
  // encontrado. O sintoma seria "o cache nunca acerta".
  const canonico = normalizadas.join("\u0000");
  const bytes = new TextEncoder().encode(canonico);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─────────────────────────────────────────────────────────────────────────────
// Regras de formatação estruturadas a partir do schema_metadata
// ─────────────────────────────────────────────────────────────────────────────

export interface FormattingRule {
  type: string;
  params: Record<string, unknown>;
}

/**
 * Extrai a regra de formatação estruturada que o Agente 3/3.1 gravou em
 * `schema_metadata.columns[nome].formatting_rule` (`{type, params, explicacao}`
 * — só `type`/`params` seguem para o executor, `explicacao` é só para o painel
 * humano). Coluna sem `formatting_rule` (schema antigo, em texto livre, ou
 * nunca reprocessado pelo Agente 3.1) cai no fallback seguro `"nenhuma"`.
 *
 * Movido para cá em 2026-08-07: antes vivia só dentro de `dashboard-execute`,
 * mas o chat (`ai-plum-chat`) precisa exatamente do mesmo cálculo — sem isto o
 * executor não sabe que não deve somar uma coluna de percentual. Mesma regra
 * de "um interpretador, dois pontos de aplicação" que já vale para
 * `extractColumns`/`authorizePlan`.
 *
 * O `type` vem de um enum fechado (ver `query_engine/pandas_executor.py`,
 * `_FORMATTERS`/`TYPE_TO_ROLE`) — este arquivo não decide papel (percent/date/
 * number/text) nem interpreta o `type`, isso é responsabilidade única do
 * Python (`roles_from_formatting_rules`), para não duplicar a mesma heurística
 * em duas linguagens (a dívida que existia aqui antes desta mudança).
 */
export function formattingRulesFromSchema(
  schemaMetadata: unknown,
  apenas: ReadonlySet<string>,
): Record<string, FormattingRule> {
  const regras: Record<string, FormattingRule> = {};
  const cols = (
    schemaMetadata as {
      columns?: Record<string, { formatting_rule?: FormattingRule }>;
    }
  )?.columns;
  if (!cols) return regras;

  for (const [nome, def] of Object.entries(cols)) {
    if (!apenas.has(nome)) continue;
    const regra = def?.formatting_rule;
    regras[nome] = {
      type: regra?.type ?? "nenhuma",
      params: regra?.params ?? {},
    };
  }
  return regras;
}

// ─────────────────────────────────────────────────────────────────────────────
// Assinatura do payload para o executor
// ─────────────────────────────────────────────────────────────────────────────

/**
 * HMAC-SHA256 sobre o corpo cru, com um segredo diferente da credencial da AWS.
 *
 * Duas camadas com segredos independentes: quem tiver a chave da AWS alcança o
 * endpoint mas não consegue forjar payload; quem tiver o segredo do HMAC não
 * alcança o endpoint. Vazar um não basta.
 */
export async function signPayload(rawBody: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
