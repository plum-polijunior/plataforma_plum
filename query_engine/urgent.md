# URGENTE — `apply_formatting_rules` não formata o que promete

**Severidade:** Alta · **Classe:** Corretude de dados (viola a promessa de "100% precisão
matemática" do `query_engine/prd.md`) · **Impacto:** respostas do chat podem estar erradas
**sem nenhum aviso**, nem para o usuário, nem nos logs.
**Status:** ⬜ diagnosticado · ⬜ corrigido · ⬜ aplicado

---

## O que é `formattingRules` hoje

`formattingRules` é gerado pelo **Agente 3** (`action: 'format_data'`) e refinado pelo
**Agente 3.1** (`action: 'refine_format'`), ambos em
`supabase/functions/ai-agents/index.ts:49-60`, durante a Etapa 3 do
pipeline de importação (`DatabasePipeline.tsx`).

O LLM recebe 5 linhas de amostra e devolve um JSON com duas chaves:
- `formattedSamples`: as 5 linhas já transformadas — **o próprio LLM faz a conversão
  mentalmente**, sem gerar código.
- `formattingRules`: um objeto `{ coluna: "frase livre descrevendo a regra" }`. O prompt dá
  como exemplo literal: `"Retirar os R$, converter para string(), e deixar com 3 casas
  decimais"`.

Isso é persistido em `datasets.schema_metadata.formattingRules` quando o pipeline finaliza
(Etapa 5) e passa a ser a fonte da verdade usada em **toda pergunta futura do chat** sobre
aquele dataset.

## Como isso é "executado" hoje no query engine

Ponto crítico: **nenhum agente de IA roda no momento da consulta.** Quem lê
`formattingRules` em tempo de chat é `apply_formatting_rules()`, em
`query_engine/pandas_executor.py:398-422`, e o que ela faz é **grep de palavras-chave** na
frase livre — não interpretação, não geração de código, não LLM:

```python
if any(keyword in rule_lower for keyword in ["r$", "moeda", "float", "int", "número", "numero", "decimal"]):
    # remove R$/separador de milhar, troca vírgula por ponto, to_numeric
elif "data" in rule_lower or "date" in rule_lower:
    # to_datetime
```

Só existem esses dois ramos. Qualquer coluna cuja regra não contenha uma dessas palavras
**não sofre nenhuma transformação** — segue exatamente como veio da planilha (string bruta).

---

## Problemas

1. **Vocabulário fixo, mas o gerador (Agente 3) não conhece esse vocabulário.** O prompt do
   Agente 3 pede texto livre em português natural. Nada impede — e é bem provável — que ele
   escreva regras como *"remover espaços em branco e capitalizar"*, *"normalizar CPF
   removendo pontos e traços"*, *"converter Sim/Não para booleano"* ou *"limitar a 2 casas
   decimais sem símbolo de percentual"*. Nenhuma dessas bate nas palavras-chave atuais → a
   coluna passa direto, sem transformação.

2. **Falha silenciosa, não um erro.** `apply_formatting_rules` não loga, não lança exceção e
   não sinaliza no resultado que uma coluna ficou sem tratamento. O `pandas_executor` segue
   para `execute_plan`, que tenta `pd.to_numeric`/`groupby`/`sum` em uma coluna que ainda é
   string bruta ("R$ 1.234,56"). Dependendo do caminho (`errors="coerce"` em vários pontos de
   `execute_plan`), isso vira `NaN` → tratado como `0` em somas → **o Agente C recebe e
   apresenta um número errado com total confiança**, sem qualquer indício de que algo falhou.
   Isso viola diretamente a premissa central do produto (`prd.md` §2.2): "eliminando 100% das
   alucinações numéricas" — a alucinação não vem mais do LLM, vem de um dado mal tipado que
   ninguém avisou.

3. **Sem noção de composição/ordem.** Uma regra como *"remover espaços, depois converter para
   moeda"* pede duas operações. O keyword-match ativa no máximo um ramo (o de moeda, por
   conter "moeda"), a limpeza de espaços nunca acontece.

4. **Agrava dívidas já conhecidas.** `_PCT_COLS` e `_STRING_COLS` em `pandas_executor.py`
   estão vazios (`#definir` — ver `CLAUDE.md` §8). Ou seja, colunas percentuais não têm a
   proteção de "nunca somar" (`_PCT_COLS`), e a rota de string-para-numérico também depende de
   heurística. Os dois problemas se somam: mesmo se `formattingRules` funcionasse
   perfeitamente, essas duas listas vazias já são um segundo ponto de falha silenciosa.

5. **R-08 fica quebrado na prática.** O invariante diz "Validação alerta, nunca corrige". Hoje
   não corrige (correto) mas também **não alerta** — nem ao usuário no chat, nem ao operador
   nos logs, nem visualmente no painel `Cfgdatabase.tsx` onde a regra foi originalmente
   revisada por humano (R-06). A pessoa que aprovou a regra no pipeline não tem como saber que
   ela não vai ser aplicada de fato depois.

---

## Como corrigir

### Ideia central
Parar de pedir **texto livre** ao Agente 3/3.1 e passar a pedir uma **instrução estruturada**
(JSON com um `type` de um enum fixo + parâmetros), que o `pandas_executor` interpreta por
`switch`/dicionário de funções — sem heurística de palavra-chave. Texto livre continua
existindo só como campo de exibição para humano, separado do campo que o Python de fato lê.

### 1. Novo formato de `formattingRules`

Trocar de `Dict[str, str]` para `Dict[str, {"type": str, "params": dict, "explicacao": str}]`:

```json
{
  "faturamento": {
    "type": "moeda_brl",
    "params": { "casas_decimais": 2 },
    "explicacao": "Remove 'R$', separador de milhar e converte vírgula decimal para número."
  },
  "data_venda": {
    "type": "data",
    "params": { "dayfirst": true },
    "explicacao": "Converte para data (dia/mês/ano)."
  },
  "percentual_desconto": {
    "type": "percentual",
    "params": { "casas_decimais": 1 },
    "explicacao": "Remove '%' e converte para número decimal (0-100)."
  },
  "nome_cliente": {
    "type": "texto_trim_maiusculas",
    "params": {},
    "explicacao": "Remove espaços nas bordas e padroniza para MAIÚSCULAS."
  },
  "cpf": {
    "type": "documento_cpf_cnpj",
    "params": {},
    "explicacao": "Remove pontos, traços e barras, mantém só dígitos."
  },
  "ativo": {
    "type": "booleano_sim_nao",
    "params": {},
    "explicacao": "Converte Sim/Não, Verdadeiro/Falso, 1/0 para booleano."
  },
  "observacoes": {
    "type": "nenhuma",
    "params": {},
    "explicacao": "Texto livre, sem transformação."
  }
}
```

`explicacao` é o único campo que o painel `Cfgdatabase.tsx` mostra ao humano revisor — mantém
a UX atual. `type`/`params` é o que o `pandas_executor` de fato executa.

**Enum inicial de `type`** (fechado, cobre os casos reais do produto; expandir só com
decisão explícita, não silenciosamente):
`moeda_brl` · `numero_decimal` · `numero_inteiro` · `percentual` · `data` ·
`texto_trim_maiusculas` · `texto_trim_minusculas` · `documento_cpf_cnpj` ·
`booleano_sim_nao` · `nenhuma`.

### 2. Prompt do Agente 3 (`format_data`) e 3.1 (`refine_format`)

Em `supabase_edge_function_ai_agents.ts:49-60`, substituir a instrução de texto livre por:

- Listar o enum fechado de `type` explicitamente no `systemInstruction` (o Gemini já roda com
  `response_mime_type: 'application/json'` — dá para forçar o formato).
- Instruir: *"Se a coluna não se encaixar em nenhum tipo da lista, use `type: 'nenhuma'` e
  explique por quê em `explicacao` — nunca invente um `type` fora da lista."* Isso torna o
  "não sei formatar" um caso explícito e visível, em vez de um vazio silencioso.
- Agente 3.1 mantém a regra atual de "altera só o que foi pedido, preserva o resto" — mas
  agora troca o objeto `{type, params, explicacao}` da coluna mencionada, não a frase.

### 3. `apply_formatting_rules` no `pandas_executor.py`

Trocar o `if/elif` de keyword-match por um dicionário de funções (`_FORMATTERS: Dict[str,
Callable]`), uma por `type` do enum. Cada formatter recebe `(series, params)` e devolve a
série transformada. `type` desconhecido ou `"nenhuma"` → não transforma, mas **loga
warning** com nome da coluna e dataset — hoje isso não existe, e é o motivo do problema #2
ser silencioso.

### 4. Migração dos dados existentes

Datasets já importados têm `formattingRules` no formato antigo (frase livre). Não dá para
trocar o formato e quebrar todo dataset em produção (migrations do projeto são não
destrutivas — `CLAUDE.md` §2.9). Duas opções, decidir antes de implementar:
- **(a)** Rodar o Agente 3.1 uma vez sobre cada dataset ativo para "traduzir" a regra antiga
  para o novo formato, com revisão humana obrigatória antes de salvar (mantém R-06).
- **(b)** `apply_formatting_rules` aceita os dois formatos por um período (`isinstance(rule,
  str)` → tenta o keyword-match antigo como fallback; `isinstance(rule, dict)` → usa o novo
  dispatcher), e o painel `Cfgdatabase.tsx` marca visualmente quais datasets ainda estão no
  formato antigo, incentivando reprocessar.

### 5. Atualizar `types.ts`

Como qualquer mudança de shape em `schema_metadata` (que é `jsonb`), atualizar
`src/integrations/supabase/types.ts` na mesma alteração, conforme regra 12 do `CLAUDE.md`.

---

## Por que é urgente

O produto vende "a IA nunca calcula, ela planeja, o Python executa" como garantia de
precisão. Hoje essa garantia **já pode estar sendo violada em produção** para qualquer coluna
cuja regra de formatação, escrita em português livre por um LLM, não contenha uma das ~7
palavras-chave hardcoded — e não há log, alerta ou teste que detecte isso acontecendo. Não é
uma melhoria de qualidade de código: é um risco de o chat responder um número errado ao
cliente final com aparência de certeza absoluta.
