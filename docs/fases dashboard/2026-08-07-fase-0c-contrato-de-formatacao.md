# Fase 0c — Contrato de formatação

**Data:** 2026-08-07 · **Branch:** `fix/contrato-de-formatacao` · **Estado:**
código escrito; **nada foi executado** — a máquina onde o trabalho foi feito não
tem Python nem Node instalados, então `pytest`, `npm run build` e `npm test` não
rodaram. O CI é a primeira validação real. Migration e deploys pendentes.

---

## 1. O que travava, e por quê

A Fase 0b entregou o executor ligado às pontas. Sobrou um buraco que atravessa
o produto inteiro e que `query_engine/urgent.md` já tinha diagnosticado sem
ninguém ter corrigido: **o comportamento numérico de cada coluna era decidido
por grep de palavra-chave numa frase em português escrita por um LLM.**

O caminho completo era este:

```
Agente 3 (onboarding)
  escreve uma frase livre:  "Retirar os R$, converter para float"
        │
        ▼
  schema_metadata.columns[col].cleaning_rule   (texto)
        │
        ▼
  papeisDeColuna() na Edge Function
  faz grep de ~12 palavras nessa frase
        │
        ▼
  column_roles = {col: percent|date|number|text}
        │
        ▼
  o executor usa o papel para decidir se `sum` vira `avg`
  e se coage texto para número
```

O gerador da frase não conhecia o vocabulário do consumidor. Nada impedia o
Agente 3 de escrever *"converter Sim/Não para booleano"*, *"normalizar CPF
removendo pontos"* ou *"padronizar em caixa alta"* — nenhuma dessas casa com
uma das palavras, e a coluna caía no `else`, virando `text`.

**Por que `text` é a pior queda possível.** Em `_scalar_agg`, papel `text` faz o
executor rodar `pd.to_numeric(errors="coerce").fillna(0)` antes de somar. Valor
que não converte não vira erro: vira **zero**, e entra na conta. E uma coluna
percentual cuja frase não tenha `percent|porcent|%|taxa` perde a proteção de
nunca-somar, então `10% + 20%` volta a dar `30`.

Nenhum dos dois emite log, exceção ou aviso. O número errado chega ao usuário
com a mesma cara de certo que o número certo — que é exatamente o modo de falha
que o produto vende que não tem (`prd.md` §2.2: *"eliminando 100% das
alucinações numéricas"*). A alucinação deixou de vir do LLM e passou a vir de um
dado mal tipado que ninguém avisou.

### Dois achados de percurso

Ao abrir o código para corrigir isso, apareceram dois problemas que não estavam
no `urgent.md` e que entraram nesta fase:

**`query_plan.ts` estava como binário no git.** O arquivo tinha um byte NUL cru
no meio, então o git parou de tratá-lo como texto: sem diff em PR, sem
`git blame`. É o arquivo que `security.py` chama de *"único parser do sistema"*
— a peça que aplica o RBAC de coluna. Crítico de segurança e impossível de
revisar.

**Sobras da consolidação da Fase 0b.** `cache.py` perdeu seu único consumidor
quando `sheets_client.py` foi deletado, e três funções de `pandas_executor.py`
ficaram sem nenhum chamador de produção. Código morto que parece vivo é
armadilha para quem chega depois.

---

## 2. A ideia, em linguagem de gente

Parar de pedir bilhete escrito à mão e passar a usar **menu de opções fixas**.

Antes, o Agente 3 escrevia uma frase e o sistema tentava adivinhar o que ela
queria dizer. Agora ele **escolhe de uma lista** de dez tipos, e a lista é
fechada:

```
moeda_brl · numero_decimal · numero_inteiro · percentual · data
texto_trim_maiusculas · texto_trim_minusculas · documento_cpf_cnpj
booleano_sim_nao · nenhuma
```

A frase em português **não sumiu** — ela continua em `cleaning_rule`, para a
pessoa que revisa o dicionário ler e conferir. O que mudou é quem manda: a
máquina lê o `tipo`, o humano lê a frase, e a frase passa a ser **derivada** do
tipo, nunca o contrário. Assim os dois não podem divergir.

Se o modelo inventar um tipo fora da lista, a Edge Function troca por `nenhuma`
e devolve um aviso que aparece na tela. "Não soube classificar" virou um caso
**explícito e visível**, em vez de um vazio silencioso.

```
ANTES                              DEPOIS
─────                              ──────
frase livre                        frase livre  ──► só exibição p/ humano
    │                                  ▲
    ▼                                  │ derivada de
grep de 12 palavras                tipo (enum fechado)  ──► column_roles
    │                                  │
    ▼                                  ▼
papel (errava calado)              papel (determinístico)
```

### Onde o contrato vive

Coluna nova `datasets.formatting_contract`, separada de `schema_metadata`:

```json
{
  "versao": 1,
  "colunas": {
    "faturamento":  { "tipo": "moeda_brl",  "params": {"casas_decimais": 2} },
    "data_venda":   { "tipo": "data",       "params": {"dayfirst": true} },
    "desconto_pct": { "tipo": "percentual", "params": {} }
  }
}
```

`NULL` nessa coluna significa **base legada**: importada antes do contrato
existir. Ela continua funcionando pelo caminho antigo — mas agora o log diz que
está adivinhando, e a tela marca a base com um aviso. Migração é gradual; nenhuma
base existente parou de funcionar.

---

## 3. Resumo estruturado

### Task 1 — Byte NUL em `query_plan.ts`

1. **O que foi feito** — o byte NUL cru virou o escape `\u0000`, e o repositório
   ganhou `.gitattributes`. O git volta a tratar o arquivo como texto.

2. **Decisão técnica** — o NUL era **intencional**, não acidente: é o separador
   de `permissionsFingerprint`, e o comentário do arquivo explica que sem um
   separador fora do alfabeto de nomes de coluna os conjuntos `["ab","c"]` e
   `["a","bc"]` colidiriam. Descartada a alternativa de trocar o separador por
   um caractere visível (`|`, `\x1f`): mudaria a digital de toda permissão
   existente e invalidaria todo o cache de snapshots sem necessidade.
   `"\u0000"` produz **exatamente a mesma string** que o byte cru, então nenhuma
   digital muda. Verificado: o blob em stage saiu `i/lf` sem NUL, e o diff
   textual forçado mostra uma única linha alterada.

3. **Integrações tocadas** — N/A (comportamento idêntico).

4. **Safeguard** — o bug era o git tratar como binário o arquivo que aplica o
   RBAC, deixando-o sem diff em PR e sem `git blame`. O `.gitattributes` fixa
   `*.ts text eol=lf`, então nenhum outro caminho reintroduz o problema.
   Conferido que ele não gera ruído de fim de linha: o índice já guardava LF, o
   CRLF do working tree vem do `core.autocrlf=true` local.

5. **Como validar**
   ```sh
   git ls-files --eol supabase/functions/_shared/query_plan.ts   # deve sair i/lf, não i/-text
   npm test                                                       # digitais continuam batendo
   ```
   Atenção: **o diff deste commit ainda aparece como `Bin`**, porque o lado do
   `HEAD` é binário. Todo diff depois dele é textual.

6. **Lacunas e pendências** — N/A.

---

### Task 2 — Código morto do `query_engine`

1. **O que foi feito** — apagados `cache.py`, a dependência `cachetools`, e as
   funções `apply_formatting_rules`, `execute_plan_with_formatting` e
   `roles_from_formatting_rules` de `pandas_executor.py`, com `__init__.py` e
   `tests/test_privacidade.py` ajustados.

2. **Decisão técnica** — nenhum deles tinha chamador de produção depois da
   consolidação da Fase 0b: `main.py` chama `execute_plan` direto, com
   `column_roles` vindo pronto no payload assinado. Descartado manter "para o
   caminho do chat": a Task 7 mostrou que o chat usa o mesmo `/execute`, então a
   conversão nunca voltaria a ser chamada. No lugar das funções ficou um
   comentário explicando por que sumiram — inclusive que a conversão de valor
   não é mais necessária porque `sheets.py` lê com
   `valueRenderOption="UNFORMATTED_VALUE"`, e no Google Sheets "R$" é formato de
   exibição sobre um valor numérico, não texto.

3. **Integrações tocadas** — `query_engine/__init__.py` deixou de exportar
   `execute_plan_with_formatting` e passou a exportar as exceções do executor.

4. **Safeguard** — N/A.

5. **Como validar**
   ```sh
   cd query_engine && python -m pytest
   git grep -n "execute_plan_with_formatting\|apply_formatting_rules\|cachetools" -- "*.py" "*.txt"
   # só deve casar o comentário explicativo em pandas_executor.py
   ```

6. **Lacunas e pendências** — [LACUNA: se um dia entrar fonte de dados que
   devolva texto de verdade (CSV, upload direto), a conversão de valor precisa
   voltar — mas guiada pelo `tipo` do contrato, com dicionário de funções, nunca
   por grep. — quem resolve: quem implementar essa fonte — D.O.D.: um
   `_FORMATTERS: Dict[str, Callable]` com um caso de teste por tipo do enum.]

---

### Task 3 — Coluna `datasets.formatting_contract`

1. **O que foi feito** — migration `20260807120000_contrato_formatacao.sql` cria
   a coluna `jsonb`, com `COMMENT`, `CHECK` de forma e bloco de verificação de
   cinco linhas. `types.ts` atualizado nos três blocos (`Row`, `Insert`,
   `Update`).

2. **Decisão técnica** — coluna física separada, e não mais um campo dentro de
   `schema_metadata`. O motivo é de responsabilidade: `schema_metadata` é o que
   o **humano e o LLM** leem (definição semântica, frase de limpeza); o contrato
   é o que a **máquina executa**. Misturar os dois foi o que permitiu que a
   frase virasse fonte de comportamento. O `CHECK` valida só a **forma**
   (`colunas` é objeto), nunca o enum de `tipo`: a Edge Function precisa poder
   corrigir um tipo inválido para `nenhuma` e avisar, em vez de o banco recusar
   a gravação e travar o pipeline de importação.
   Descartadas: (a) reprocessar todas as bases com revisão humana obrigatória —
   trava datasets em produção até alguém revisar; (c) corte limpo sem fallback —
   quebra base existente agora.

3. **Integrações tocadas** — `datasets` ganha uma coluna. **Sem mudança de
   RLS:** a coluna herda as policies existentes (SELECT por organização com
   membro ativo, escrita por admin). Não há superfície nova.

4. **Safeguard** — N/A (não é correção de bug, é a base para as Tasks 4-7).

5. **Como validar** — colar no SQL Editor do painel (não há CLI — `CLAUDE.md`
   §1). O bloco final deve imprimir `OK` nas cinco linhas, inclusive
   *"Nenhum dataset existente foi alterado"*.

6. **Lacunas e pendências** — [LACUNA: a migration não foi aplicada — quem
   resolve: quem tiver acesso ao painel Supabase — D.O.D.: as cinco linhas do
   bloco de verificação saindo `OK`.]

---

### Task 4 — Agentes 3 e 3.1 emitem contrato

1. **O que foi feito** — `supabase_edge_function_ai_agents.ts` passou a listar o
   enum fechado no `systemInstruction` e a pedir
   `{tipo, params, explicacao}` por coluna, em vez de frase livre. A resposta
   passa por `normalizarContrato()` **antes de sair da função**.

2. **Decisão técnica** — o Gemini já roda com
   `response_mime_type: 'application/json'`, mas isso garante a **forma** da
   resposta, não o **vocabulário**. Por isso a validação no servidor: tipo fora
   da lista vira `nenhuma` e entra num array `avisosContrato` que chega à tela.
   Nunca confiar no LLM para respeitar um enum. A função também aceita o formato
   antigo (frase solta) e o converte, porque o modelo às vezes recai nele.
   A frase `formattingRules` continua sendo devolvida para a UI, mas agora é
   **derivada** de `explicacao` — o que a pessoa lê e o que a máquina executa
   saem da mesma fonte e não podem divergir.

3. **Integrações tocadas** — a resposta de `format_data` e `refine_format` ganha
   `formattingContract` e `avisosContrato`. `formattingRules` continua existindo
   com o mesmo shape, então nada que já consumia quebrou.

4. **Safeguard** — o bug era o gerador não conhecer o vocabulário do consumidor.
   Agora o vocabulário está **no prompt** e é **validado na saída**: as duas
   pontas usam a mesma lista, e o que escapar é rebaixado para `nenhuma` com
   aviso visível, nunca aceito em silêncio.

5. **Como validar** — deploy manual pelo painel (esta função é colada à mão).
   Subir uma planilha com coluna de moeda, data, CPF e Sim/Não; conferir na
   Etapa 3 que cada uma recebeu um tipo e que nenhuma caiu em
   "Sem transformação" por acidente.

6. **Lacunas e pendências** — [LACUNA: `TIPOS_FORMATACAO` aqui,
   `PAPEL_POR_TIPO` em `_shared/query_plan.ts` e `ROTULO_DO_TIPO` em
   `src/lib/formatting-contract.ts` são três cópias da mesma lista, porque os
   três são deployados por caminhos diferentes e não podem se importar — quem
   resolve: quem migrar `ai-agents` de "colada no painel" para
   `supabase/functions/` — D.O.D.: uma lista só, importada pelos três. Enquanto
   isso, os três arquivos têm comentário apontando um para o outro, e o
   fail-safe garante que dessincronia degrada para "não formata e avisa", nunca
   para "formata errado".]

---

### Task 5 — `papeisDeColuna` lê o contrato

1. **O que foi feito** — a função saiu de `dashboard-execute/index.ts` e foi
   para `_shared/query_plan.ts`, agora lendo `formatting_contract.colunas[].tipo`
   e caindo no grep antigo só para coluna sem contrato. Devolve
   `{roles, legado}`, e o chamador loga o `legado`.

2. **Decisão técnica** — mudou de arquivo, não só de lógica. Onde estava, não
   tinha teste; `_shared/query_plan.ts` é o módulo coberto por vitest. Isso é
   coerente com a regra que o próprio repositório escreveu no cabeçalho de
   `dashboard-execute`: *"A peça que aplica o RBAC é justamente a que não pode
   viver sem teste."* O papel de coluna decide se `sum` vira `avg` — está na
   mesma categoria. Ganhou 8 casos de teste, incluindo dois que
   **documentam o erro do fallback** (`papelPorPalavraChave` classificando
   errado) em vez de escondê-lo: o comportamento ruim fica registrado como
   conhecido, não como aceitável.
   O `legado` volta separado em vez de só logar lá dentro porque quem chama é
   quem tem o `dataset_id` para pôr na mensagem.

3. **Integrações tocadas** — `dashboard-execute` passa a incluir
   `formatting_contract` no `SELECT` de `datasets`. O payload enviado ao
   executor não mudou de shape.

4. **Safeguard** — o bug era o papel ser adivinhado em silêncio. Agora: com
   contrato, é determinístico; sem contrato, ainda adivinha **mas grita no log**
   com o `dataset_id` e a lista de colunas afetadas, dizendo para reprocessar em
   `/cfgdatabase`. É o R-08 (*validação alerta, nunca corrige*) passando a valer
   aqui, que era o item 5 do `urgent.md`.

5. **Como validar**
   ```sh
   npm test   # 8 casos novos em query_plan.test.ts
   ```
   Em runtime: abrir um dashboard de base legada e conferir o `console.warn` com
   a lista de colunas adivinhadas.

6. **Lacunas e pendências** — N/A.

---

### Task 6 — Persistir e exibir o contrato

1. **O que foi feito** — `DatabasePipeline.tsx` grava `formatting_contract` ao
   finalizar; `Cfgdatabase.tsx` mostra badge de tipo por coluna e marca base
   legada; `src/lib/formatting-contract.ts` centraliza o vocabulário do front.

2. **Decisão técnica** — o pipeline mantém `formattingRules` **e**
   `formattingContract` em estado. Descartado unificar num só: `formattingRules`
   é lido em doze pontos da tela, e trocar tudo aumentaria a superfície de erro
   sem ganho — a Edge Function já garante que os dois não divergem. Na gravação,
   **toda** coluna entra no contrato, mesmo as que a IA não classificou:
   `"nenhuma"` é uma declaração explícita de "não formatar", diferente de
   ausência, que faria a Edge Function cair no grep. O badge fica vermelho
   (pipeline) ou âmbar (Cfgdatabase) quando o tipo é `nenhuma` ou falta, porque
   quem aprova precisa ver isso **antes** de aprovar, não descobrir depois num
   número errado (R-06 + R-08).

3. **Integrações tocadas** — `datasets.formatting_contract` é escrito em dois
   lugares: finalização do pipeline e refino do Agente 3.1 no Cfgdatabase. O
   `select('*')` do Cfgdatabase já traz a coluna nova sem alteração.

4. **Safeguard** — N/A.

5. **Como validar** — `npm run build`; depois, na tela: importar uma planilha e
   conferir os badges na Etapa 3; abrir uma base antiga em `/cfgdatabase` e
   conferir o aviso "Formato legado" no card e o badge "Legado" por coluna;
   rodar o Agente 3.1 nela e confirmar que passa a ter contrato.

6. **Lacunas e pendências** — [LACUNA: não há botão de "migrar esta base para o
   contrato" — o caminho hoje é rodar o Agente 3.1 manualmente em cada base
   legada — quem resolve: próxima fase, se o número de bases justificar —
   D.O.D.: ação em lote no Cfgdatabase com revisão humana obrigatória antes de
   gravar.]

---

### Task 7 — Chat ligado ao executor

1. **O que foi feito** — criada
   `supabase/functions/chat-execute/index.ts`, e o `mockPythonVetor` de
   `PlumChat.tsx` foi removido.

2. **Decisão técnica** — `query_engine/implementation.md` pedia uma
   `action: 'execute_plan'` dentro de `ai-plum-chat`. **Foi descartado.**
   `ai-plum-chat` é colada à mão no painel e por isso não pode importar
   `_shared/query_plan.ts`; pôr a autorização lá significaria uma segunda cópia
   de `authorizePlan`, que é literalmente o cenário que o cabeçalho de
   `query_plan.ts` proíbe — *"quando duas travas de segurança discordam, quem
   passa é a mais frouxa. É assim que um bypass nasce."* `chat-execute` é irmã
   de `dashboard-execute`, deployada por CLI, e reusa o único parser.
   **O `k_min` não foi relaxado.** Uma pergunta de chat que exporia um grupo com
   menos de k linhas é a mesma exposição que um card faria; trocar o envelope
   não muda o dado.
   Quando o executor recusa, o `PlumChat` mostra o motivo e **não chama o Agente
   C** — sem número real, ele não é acionado, porque um LLM com um vetor vazio e
   uma pergunta na mão é exatamente a receita de número inventado.

3. **Integrações tocadas** — nova Edge Function `chat-execute`
   (`POST` com `{dataset_id, plan}`). Precisa dos mesmos secrets de
   `dashboard-execute`: `PLUM_EXECUTOR_URL`, `PLUM_EXECUTOR_HMAC_SECRET`,
   `PLUM_AWS_REGION`, `PLUM_AWS_ACCESS_KEY_ID`, `PLUM_AWS_SECRET_ACCESS_KEY`.
   `PlumChat.tsx` passa a fazer quatro chamadas em vez de três.

4. **Safeguard** — o bug era o chat responder com dado simulado
   (`{valor: "Simulado"}`) passado ao Agente C como se fosse resultado real.
   Agora o Agente C só é chamado quando existe vetor calculado; qualquer falha
   vira mensagem com o motivo. E a leitura do erro usa `error.context.json()`,
   porque em status fora do 2xx o `supabase-js` devolve `data: null` e a
   mensagem útil só existe ali — sem isso, "essa coluna não é visível para o seu
   cargo" viraria um genérico inútil.

5. **Como validar** — `supabase functions deploy chat-execute`, depois no chat:
   pergunta válida; pergunta bloqueada pelo Agente Z; pergunta inviável (coluna
   inexistente); pergunta sobre coluna que o cargo não enxerga (403 com
   mensagem, sem chamar o Agente C); `dataset_id` de outra organização (403
   antes de chegar na AWS).

6. **Lacunas e pendências** — [LACUNA: o cache de dados morreu na consolidação
   da Fase 0b; hoje só há cache de metadados da planilha em `sheets.py`. Várias
   perguntas seguidas sobre o mesmo dataset viram várias leituras no Google, e a
   cota é de 60/min — quem resolve: próxima fase — D.O.D.: cache TTL de 15 min
   por `(sheet_id, conjunto de colunas)` no executor, com a mesma chave que o
   `cache.py` deletado usava.]
   [LACUNA: `chat-execute` não grava snapshot nem degrada para resultado antigo,
   diferente de `dashboard-execute`. Decisão consciente — a pergunta é nova a
   cada vez — mas significa que indisponibilidade do executor vira erro direto
   no chat — quem resolve: só se virar problema real de uso — D.O.D.: N/A.]

---

## 4. Pendência que atravessa todas as tasks

**Nada nesta fase foi executado.** A máquina onde o código foi escrito não tem
Python nem Node (os caminhos em `WindowsApps` são stubs da Microsoft Store).

[LACUNA: `npm run build`, `npm test` e `python -m pytest` não rodaram — quem
resolve: a primeira máquina que pegar esta branch, ou o CI — D.O.D.: os três
verdes. O workflow `query-engine.yml` roda os três em push e PR, então abrir o
PR já dispara.]

Ordem sugerida para quem pegar a branch:

1. `npm ci && npm run build && npm test`
2. `cd query_engine && pip install -r requirements.txt pytest && python -m pytest`
3. Aplicar a migration no SQL Editor do painel
4. Deploy manual de `ai-agents` (colada no painel)
5. `supabase functions deploy chat-execute` e redeploy de `dashboard-execute`
6. `supabase/tests/*.sql` — `CLAUDE.md` §9 exige, porque o schema mudou **e**
   uma Edge Function passou a fazer query nova
7. Os testes de tela e E2E descritos em cada task
