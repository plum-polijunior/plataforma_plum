# LOG — Fase 5b · PR 1: trava de tipo em `group_by` (endurecimento)

**Data:** 2026-08-11 23:13 · **Modo:** Execução de Plano
**Branch:** `feat/fase-5b-agrupar-por-periodo` · **Commit inicial:** `a8560b1`
**Plano de origem:** `docs/fases dashboard/2026-08-12-fase-5b-PLANO-v2-agrupar-por-periodo.md`

> **Escopo fechado deste PR.** Somente as Etapas 1 e 2 do plano (a Etapa 0 já estava
> concluída e registrada no próprio plano). Toca **apenas** `query_engine/pandas_executor.py`
> e `query_engine/tests/`. **Não** toca `supabase/functions/` (nem `_shared/`), **não** toca
> `src/`, **não** publica Edge Function, **não** cria migration. `trunc`/período é PR 2.
>
> Nota de datas: o arquivo de log usa a hora real do sistema (2026-08-11 23:13). O plano de
> origem está datado `2026-08-12` seguindo a convenção já em uso no repositório, onde commits
> de 2026-08-11 16:41–16:57 criaram `docs/2026-08-12-*.md`.

---

## 1. Sumário executivo

### O que foi feito

Fechado o furo em que **um card malformado derrubava o dashboard inteiro**: `group_by` com
item de tipo inesperado levantava `TypeError` dentro do pandas, que não é `ExecutorError`,
escapava do laço por card do `main.py` e virava HTTP 500 do lote — fazendo *todos* os cards
do dataset caírem para `stale`. Agora vira `ExecutorError` nomeado num card só. **Nenhuma
feature foi adicionada:** `trunc`/período é o PR 2. O PR 1 é só endurecimento, e deixa o
produto melhor do que estava mesmo se a Fase 5b parar aqui.

### Decisões tomadas

- **A forma objeto (`{col, trunc}`) é recusada com mensagem PRÓPRIA**, separada de "tipo
  inválido" — descartada a alternativa de uma mensagem genérica só. Ela é o que o PR 2 vai
  introduzir, e "ainda não sei agrupar por período" é diagnóstico diferente de "isto não é
  nome de coluna". Efeito colateral desejado: o PR 2 muda um `if`, não a estrutura.
- **O container também ganhou trava**, não só cada item. Não estava no plano. `group_by:
  "regiao"` (esquecer os colchetes — saída plausível de LLM) iterava os *caracteres* e
  devolvia `MissingColumnError: coluna 'r' nao encontrada`, mandando quem investiga para o
  lugar errado.
- **Item vazio/nulo continua ignorado**, preservação consciente e agora fixada por teste:
  sobra de lista do LLM nunca derrubou a pergunta e não vai passar a derrubar.
- **Testes escritos já no estado-alvo**, com a execução vermelha capturada como evidência —
  em vez de escrever um teste afirmando `TypeError` e invertê-lo depois, como o plano pedia
  ao pé da letra. Mesmo D.O.D., sem teste descartável no histórico.
- **Negação explícita no `.gitignore`** (`!docs/logs/`) em vez de trocar `logs` por `/logs`:
  não altera o comportamento da regra para nenhum outro caminho.

### Bugs encontrados e soluções

- **`group_by` com item não-string → HTTP 500 do lote inteiro** → causa: `_strip_table(dict)`
  devolve o dict intacto (`"." in dict` testa chaves), e o erro só estoura depois em
  `pandas.Index.__contains__`, que chama `hash(key)` fora do `try/except` → correção:
  `_colunas_de_group_by()` em `query_engine/pandas_executor.py`, validando tipo do container
  e de cada item antes de qualquer uso.
- **`docs/logs/` invisível para o git** → causa: a regra `logs` do `.gitignore` (escrita para
  runtime na raiz) casa com qualquer pasta `logs` em qualquer nível → correção: `!docs/logs/`
  + `!docs/logs/**`. Nenhum log jamais havia sido commitado neste repo.
- **`npm run build` quebrado localmente** (Etapa 0) → causa: o pull trouxe `react-markdown` no
  `package.json` e o `node_modules` era anterior → correção: `npm install`. O sintoma acusava
  o arquivo errado (`RespostaMarkdown.tsx`, como se fosse import inválido).
- **Suíte pytest não rodava** (Etapa 0) → causa: `cachetools` ausente derrubava a COLETA de 2
  módulos e com ela a suíte inteira; e o Python local era 3.14/pandas 3.0.1 contra o
  3.12/pandas 2.2.3 do Lambda → correção: `.venv` com as versões fixadas.

### Safeguards e lacunas

- ✅ **Os 227 testes do baseline passam sem UMA edição** — provado por
  `git diff --numstat`: **0 linhas removidas** nos arquivos de teste, e a única linha removida
  em todo o PR é o `gb_cols = [...]` que foi substituído. É a contenção do R1 (regressão no
  chat), e teste alterado junto com o código não provaria nada.
- ✅ **242 testes** (227 + 15 novos), `npm test` 96, `npm run build` exit 0.
- ✅ **O bug foi provado por execução, não por leitura**: com a trava desligada num backup
  temporário, o teste de ponta a ponta falha com `TypeError: unhashable type: 'dict'`.
- ✅ **A promessa "um card ruim não pode derrubar o dashboard inteiro"** passou a ser
  verificada pelo endpoint real (Google Sheets dublado), e não só afirmada no docstring.
- ✅ **Nada destrutivo:** sem migration, sem alteração de dado, sem arquivo apagado. O v1 do
  plano foi preservado de propósito.
- ⚠️ **O Lambda é compartilhado com o chat** e este PR o republica (via CI). Não há como
  evitar — é um Lambda só. A contenção é que a mudança é aditiva e os 227 passam intactos.
- ⚠️ **`query_engine/__pycache__/*.pyc` continuam RASTREADOS** no git (dívida pré-existente).
  Rodar pytest os modifica; `git restore query_engine/__pycache__/` antes de cada commit.
  Não foi corrigido aqui de propósito: destracking não é desta fase.
- ⚠️ **Nenhuma Edge Function foi publicada, e nenhuma deve ser** neste PR. `_shared/` não foi
  tocado.

### Pendências

- [ ] **Commit e PR do PR 1.** Não commitei nada — o usuário não pediu, e o `slog` não
      commita por conta própria. Sugestão de escopo do commit: `.gitignore`,
      `query_engine/pandas_executor.py`, os 2 arquivos de teste, o plano v2 e este log.
- [ ] **Rodar `git restore query_engine/__pycache__/`** imediatamente antes do commit, se
      pytest tiver rodado depois desta linha.
- [ ] **PR 2 (a feature).** Etapas 3–6 do plano: `trunc` no executor, `_shared/query_plan.ts`,
      `VizLinha.tsx` + as 4 whitelists de `viz`, e o prompt do `dashboard-agent` **por último**.
- [ ] **Decidir se `ai-plum-chat` é republicada no PR 2** (§8 do plano). Antes de decidir,
      conferir se a versão implantada bate com o repositório — o `CLAUDE.md` §1 registra que
      elas já divergiram. **Não é decisão do PR 1.**
- [ ] **Lacuna de verificação conhecida:** `quarter` e `year` não têm base de teste real
      (nenhuma base atual tem coluna de papel `date` cruzando anos). Ficarão em teste
      unitário sintético no PR 2, a menos que alguém monte uma base de 12–20 linhas.

---

## 2. Detalhamento passo a passo

### Etapa 0 — Baseline pré-mudança — [SUCESSO]

Confirmado imediatamente antes de tocar em qualquer arquivo, para que a Seção 1 possa
afirmar "sem regressão" com número, não com impressão.

**Comandos executados**

```sh
$ git rev-parse --abbrev-ref HEAD
feat/fase-5b-agrupar-por-periodo

$ git rev-parse --short HEAD
a8560b1

$ git status --porcelain
 M .gitignore
?? "docs/fases dashboard/2026-08-12-fase-5b-PLANO-v2-agrupar-por-periodo.md"

$ cd query_engine && ../.venv/Scripts/python.exe -m pytest -q --tb=no
[…]
........................................................................ [ 95%]
...........                                                              [100%]

$ ../.venv/Scripts/python.exe -m pytest --collect-only -q
tests/test_endpoint.py: 12
tests/test_expressao_derivada.py: 18
tests/test_formas_de_plano.py: 28
tests/test_formatting.py: 29
tests/test_privacidade.py: 14
tests/test_seguranca.py: 14
tests/test_sheets.py: 112
```

**Resultado:** **227 testes passando** (12+18+28+29+14+14+112) em Python 3.12.0 com
`pandas==2.2.3` — as versões que o Lambda executa. É contra este número que a ausência de
regressão vai ser medida. A árvore está limpa exceto por `.gitignore` (a entrada `.venv/`) e
o plano v2, ambos da preparação e nenhum de código de produção.

---

### Etapa 1 — Provar que o bug de hoje é real — [SUCESSO]

**Desvio deliberado da letra do plano, e por quê.** O plano pedia um teste afirmando
`TypeError`, a ser *invertido* na Etapa 2 para exigir `ExecutorError`. Fiz diferente:
escrevi os testes **já no estado-alvo** (exigindo `ExecutorError`) e capturei a execução
**vermelha** como evidência. Mesmo D.O.D. — prova documentada de que o bug existe e de que o
teste o detecta — sem deixar um teste descartável no histórico e sem reescrever o mesmo
arquivo duas vezes. O artefato que fica commitado é o teste bom.

**Arquivos alterados**

| Arquivo | Ação | Mudança |
|---|---|---|
| `query_engine/tests/test_formas_de_plano.py` | alterado | +7 testes numa seção nova, `GROUP BY — o quarto membro da mesma família`. Nenhum dos 28 testes existentes do arquivo foi tocado |

Os 7 testes novos, e o papel de cada um:

| Teste | Papel |
|---|---|
| `test_group_by_nao_string_falha_como_erro_do_executor` (4 casos: `objeto_col_trunc`, `objeto_sem_col`, `col_nao_string`, `lista`) | exige `ExecutorError` com `"group_by"` na mensagem |
| `test_group_by_nao_string_nao_pode_escapar_como_typeerror` (`@invariante`) | exige explicitamente que **não** seja `TypeError`/`AttributeError` — `pytest.raises` sozinho não distingue |
| `test_group_by_com_strings_continua_intocado` | **rede do chat**: o caminho antigo (strings) tem que continuar idêntico |
| `test_group_by_por_coluna_ausente_continua_missing_column` | a trava de **tipo** não pode engolir a checagem de **existência** |

**Dependências**
- nenhuma

**Comandos executados**

```sh
$ cd query_engine && ../.venv/Scripts/python.exe -m pytest tests/test_formas_de_plano.py -q --tb=line
............................FFFFF..                                      [100%]
================================== FAILURES ===================================
[…]/pandas/core/indexes/base.py:5358: TypeError: unhashable type: 'dict'
[…]/pandas/core/indexes/base.py:5358: TypeError: unhashable type: 'dict'
[…]/pandas/core/indexes/base.py:5358: TypeError: unhashable type: 'dict'
[…]/pandas/core/indexes/base.py:5358: TypeError: unhashable type: 'list'
query_engine/tests/test_formas_de_plano.py:492: Failed: escapou como TypeError, que o
  main.py nao captura: viraria HTTP 500 do lote inteiro. unhashable type: 'dict'
=========================== short test summary info ===========================
FAILED tests/test_formas_de_plano.py::test_group_by_nao_string_falha_como_erro_do_executor[objeto_col_trunc]
FAILED tests/test_formas_de_plano.py::test_group_by_nao_string_falha_como_erro_do_executor[objeto_sem_col]
FAILED tests/test_formas_de_plano.py::test_group_by_nao_string_falha_como_erro_do_executor[col_nao_string]
FAILED tests/test_formas_de_plano.py::test_group_by_nao_string_falha_como_erro_do_executor[lista]
FAILED tests/test_formas_de_plano.py::test_group_by_nao_string_nao_pode_escapar_como_typeerror
```

**Resultado:** o bug do plano §2 está **confirmado por execução**, não por leitura. As 5
falhas são todas `TypeError` levantado dentro do pandas (`indexes/base.py:5358`, o
`hash(key)` de `Index.__contains__`), e não `ExecutorError` — exatamente a cadeia descrita
no plano. O `TypeError` vem em duas variantes, `'dict'` e `'list'`, o que mostra que o furo
é do *tipo não-hasheável* em geral, não de uma forma específica.

Dois sinais adicionais, e os dois importam:

1. **Os 28 testes originais do arquivo passaram** (os 28 pontos antes dos F). A seção nova
   não perturbou nada.
2. **Os 2 testes de regressão novos já passaram em vermelho** — `group_by` com strings e
   `group_by` por coluna ausente. Ou seja: o comportamento que o chat usa hoje já estava
   correto antes da mudança, e agora está *fixado por teste*. É a rede do R1.

35 testes no arquivo (28 antigos + 7 novos), 30 passando, 5 falhando pelo motivo certo.

---

### Etapa 2 — Trava de tipo em `group_by` — [SUCESSO]

**Arquivos alterados**

| Arquivo | Ação | Mudança |
|---|---|---|
| `query_engine/pandas_executor.py` | alterado | +`_colunas_de_group_by()` (função nova, seção própria antes de `execute_plan`); a linha `gb_cols = [_strip_table(c) for c in group_by_raw if c]` passa a ser `gb_cols = _colunas_de_group_by(group_by_raw)`. **76 adições, 1 remoção** — a única remoção é essa linha |
| `query_engine/tests/test_formas_de_plano.py` | alterado | +7 testes além dos 7 da Etapa 1 (container e vazio) |
| `query_engine/tests/test_endpoint.py` | alterado | +1 teste de ponta a ponta |

**O que `_colunas_de_group_by` recusa, e com qual mensagem**

| Entrada | Antes | Depois |
|---|---|---|
| `[{"col":"x","trunc":"month"}]` | `TypeError` → 500 do lote | `ExecutorError`: "Agrupar por periodo ainda nao e suportado… (chaves: col, trunc)" |
| `[{"trunc":"month"}]` | `TypeError` → 500 do lote | idem |
| `[["x"]]` (lista aninhada) | `TypeError` → 500 do lote | `ExecutorError`: "Item de 'group_by' invalido… veio list" |
| `"regiao"` (string solta) | itera CARACTERES → `MissingColumnError: 'r'` | `ExecutorError`: "'group_by' precisa ser uma lista…" |
| `123` | `TypeError: not iterable` → 500 | idem |
| `["regiao"]` | funciona | **funciona, idêntico** |
| `[]`, `[None]`, `[""]`, `None` | agregado único | **agregado único, idêntico** |

Duas decisões de projeto dentro da função, e as duas foram deliberadas:

1. **A forma objeto tem mensagem PRÓPRIA**, separada de "tipo inválido". Ela é o que o PR 2
   vai introduzir, e "ainda não sei agrupar por período" é diagnóstico diferente de "isto não
   é nome de coluna". Quando o `trunc` entrar, é este ramo que passa a aceitar em vez de
   recusar — a mudança do PR 2 fica localizada num `if`.
2. **O CONTAINER também ganhou trava**, não só cada item. Não estava explícito no plano, e é
   o mesmo furo: `group_by: "regiao"` (esquecer os colchetes, saída plausível de um LLM)
   iterava os caracteres e devolvia `MissingColumnError: coluna 'r' nao encontrada`, que manda
   quem investiga para o lugar errado. Coberto por 3 testes novos.
3. **Item vazio/nulo continua sendo ignorado**, e isso é preservação consciente: sobra de
   lista do LLM nunca derrubou a pergunta e não vai passar a derrubar. Fixado por 4 testes.

**Comandos executados**

```sh
$ cd query_engine && ../.venv/Scripts/python.exe -m pytest tests/test_formas_de_plano.py -q
...................................                                      [100%]

$ ../.venv/Scripts/python.exe -m pytest -q --tb=short
[…]
..........................                                               [100%]

$ ../.venv/Scripts/python.exe -m pytest --collect-only -q
tests/test_endpoint.py: 13
tests/test_expressao_derivada.py: 18
tests/test_formas_de_plano.py: 42
tests/test_formatting.py: 29
tests/test_privacidade.py: 14
tests/test_seguranca.py: 14
tests/test_sheets.py: 112
```

**242 testes passando** = 227 do baseline + 15 novos (14 em `test_formas_de_plano.py`,
1 em `test_endpoint.py`).

**A prova de que os 227 não foram editados** — é a contenção do R1, e teste alterado junto
com o código não prova nada:

```sh
$ git diff --numstat query_engine/tests/test_formas_de_plano.py
170	0	query_engine/tests/test_formas_de_plano.py     # 170 adicionadas, ZERO removidas

$ git diff -U0 query_engine/pandas_executor.py | grep "^-" | grep -v "^---"
-    gb_cols = [_strip_table(c) for c in group_by_raw if c]        # a única linha removida
```

**A prova empírica de que o bug era real, e de nível de lote.** O teste de ponta a ponta foi
rodado com a trava DESLIGADA (cópia de segurança do executor no scratchpad, linha antiga
restaurada, teste rodado, arquivo restaurado do backup em seguida):

```sh
# com a trava desligada:
$ ../.venv/Scripts/python.exe -m pytest tests/test_endpoint.py::test_card_com_group_by_malformado_nao_derruba_o_lote -q --tb=line
F                                                                        [100%]
[…]/pandas/core/indexes/base.py:5358: TypeError: unhashable type: 'dict'
FAILED tests/test_endpoint.py::test_card_com_group_by_malformado_nao_derruba_o_lote

# restaurado, e a suíte inteira volta a verde:
$ git diff --numstat query_engine/pandas_executor.py
76	1	query_engine/pandas_executor.py
```

**Resultado:** o comportamento mudou de **HTTP 500 no lote inteiro** para **erro num card só,
com HTTP 200 e os outros cards intactos** — verificado pelo endpoint real com o Google Sheets
dublado, não por inspeção. O card bom devolve os três grupos (`Sul`, `Norte`, `Ilha`) na
mesma resposta em que o card malformado devolve `status: "error"`.

Isso passa a valer a promessa que o docstring do `main.py` já fazia e que o código não
cumpria: *"Um card ruim não pode derrubar o dashboard inteiro."*

---

### Etapa 3 — Achado fora do plano: `docs/logs/` estava invisível para o git — [SUCESSO]

Não estava no plano. Apareceu ao rodar os portões finais: o log deste PR **não aparecia no
`git status`**.

**Causa raiz.** `.gitignore:2` tem a regra `logs`, agrupada com `*.log` e `npm-debug.log*`,
portanto escrita para log de runtime na raiz. Mas um padrão sem barra casa com **qualquer**
pasta chamada `logs`, em qualquer nível — inclusive `docs/logs/`. Consequências medidas:

```sh
$ git check-ignore -v "docs/logs/LOG_2026-08-11_2313_fase-5b-pr1-trava-group-by.md"
.gitignore:2:logs	docs/logs/LOG_2026-08-11_2313_fase-5b-pr1-trava-group-by.md

$ git ls-files docs/logs/
(vazio — nenhum log jamais foi commitado neste repositório)

$ find . -type d -name logs -not -path "./node_modules/*" -not -path "./.git/*"
./docs/logs        # é a ÚNICA pasta `logs` do repo

$ git ls-files | grep -i "\.log$\|/logs/"
(vazio — a regra `logs` nunca protegeu nada versionado)
```

Ou seja: a regra não estava protegendo nada e estava escondendo documentação. Todo log de
sessão produzido antes desta correção existiu só no disco de quem rodou.

**Arquivos alterados**

| Arquivo | Ação | Mudança |
|---|---|---|
| `.gitignore` | alterado | `!docs/logs/` + `!docs/logs/**` logo depois de `logs`, com comentário explicando por que a negação existe |

Negação explícita em vez de trocar `logs` por `/logs`: não altera o comportamento da regra
para nenhum outro caminho, presente ou futuro.

**Comandos executados**

```sh
$ git add --dry-run docs/logs/
add 'docs/logs/LOG_2026-08-11_2313_fase-5b-pr1-trava-group-by.md'

$ git add --dry-run .venv
The following paths are ignored by one of your .gitignore files:
.venv
hint: Use -f if you really want to add them.

$ touch teste-temp.log && git check-ignore -v teste-temp.log && rm teste-temp.log
.gitignore:11:*.log	teste-temp.log
```

**Resultado:** o log passa a ser versionável, e as duas regras vizinhas continuam intactas —
`.venv/` segue ignorada e `*.log` solto segue ignorado. Sem regressão.

⚠️ Nota de método: `git check-ignore -v` sai com código 0 quando encontra um padrão que casa,
**inclusive quando é uma negação** — então o exit code dele não responde "está ignorado?".
Quem responde é `git status` / `git add --dry-run`. Custou um falso alarme durante a execução.


