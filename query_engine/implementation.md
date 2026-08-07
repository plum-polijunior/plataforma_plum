# `query_engine` — estado da implementação

> Atualizado em 2026-08-07, contra o commit `5cb86c8`. Este arquivo deixou de ser um plano
> futuro: o serviço existe, é testado e é publicado por CI. O que segue é o estado real, o que
> ainda falta e o que divergiu do desenho original.

**O que mudou desde `ad08c60`:** os conflitos de merge commitados foram resolvidos (`a2e35d9`),
e as duas implementações paralelas viraram uma só (`e677b38` — `app.py`, `auth.py` e
`sheets_client.py` foram deletados). Ficou o caminho do dashboard, que é o que tem RBAC de
coluna, k-anonimato, leitura em lote e testes.

---

## 1. O serviço, hoje

Um processo FastAPI empacotado como imagem de container e publicado em **AWS Lambda**.

| Arquivo | Papel |
|---|---|
| `main.py` | app FastAPI: `GET /health`, `POST /execute` |
| `lambda_handler.py` | Mangum traduz o evento do Function URL para ASGI |
| `security.py` | HMAC, frescor do payload, RBAC de coluna por conjunto |
| `config.py` | leitura de segredos do SSM Parameter Store |
| `sheets.py` | Google Sheets: metadados + `batchGet` só das colunas pedidas |
| `pandas_executor.py` | o Motorista Cego: `execute_plan` |
| `tests/` | 4 arquivos — privacidade, segurança, endpoint, sheets |

`POST /execute` recebe **N planos (cards) de um dataset numa requisição só** e devolve
resultado **por card**: um card com coluna proibida volta `forbidden` e os outros cinco
continuam funcionando. Um card ruim não derruba o dashboard.

A leitura do Google é **uma só para todos os cards aprovados** — a união das colunas vira um
`batchGet`. A cota do Sheets é de 60 requisições por minuto; uma chamada por card estourava com
dez pessoas abrindo o dashboard às 8h.

### As quatro barreiras de segurança

Documentadas em `security.py`, definem onde cada decisão mora:

1. **SigV4 da AWS**, no Function URL com auth `AWS_IAM`. Resolvida pela infraestrutura, antes de
   qualquer código rodar. Sem credencial IAM a requisição não chega.
2. **HMAC-SHA256 sobre o corpo cru**, com segredo *diferente* da credencial IAM. Quem tiver a
   chave da AWS ainda não consegue forjar payload.
3. **Expiração curta** (`issued_at` + `PLUM_SIGNATURE_MAX_AGE`, default 120s), nos dois sentidos
   — relógio adiantado na Edge Function não vira payload eternamente válido.
4. **`resolved_columns ⊆ allowed_columns`**, comparação de conjunto. Recusa em vez de filtrar em
   silêncio: tirar uma coluna do `where` muda o significado do resultado.

E uma quinta que sai de graça: só as colunas assinadas são carregadas da planilha, então um
plano que alcance qualquer outra morre em `MissingColumnError`. A checagem de conjunto é
confirmada pela própria execução, sem ninguém reimplementar o parser.

O `sheet_id` entra **dentro** do payload assinado, de propósito: trocar a planilha alvo exige o
segredo do HMAC, não apenas alcançar o endpoint.

---

## 2. Segredos

- **SSM Parameter Store**, não Secrets Manager (o plano antigo dizia Secrets Manager).
- As variáveis de ambiente guardam o **caminho** do parâmetro, nunca o valor:
  `GOOGLE_SA_PARAM=/plum/prod/google-sa-json`, `HMAC_SECRET_PARAM=/plum/prod/hmac-secret`.
- **Nada é escrito em disco.** O JSON da service account sai do Parameter Store direto para a
  memória do processo e morre com o container.
- Três caminhos de leitura, em ordem: extensão AWS Parameters and Secrets (`localhost:2773`,
  cache local por cold start) → boto3 → env `*_VALUE`. O terceiro é **só para teste local** e
  emite warning quando é usado.

A service account (`reader@plum-ai.iam.gserviceaccount.com`) lê a planilha de **todos** os
tenants. É o segredo de maior valor do sistema — daí o endpoint nunca poder ficar público (§3).

---

## 3. Deploy — Lambda via CI

O desenho de EC2 + Docker Compose + Nginx/Certbot + Cloudflare Tunnel das versões anteriores
deste documento foi abandonado. O que existe e roda:

```
push na branch `plataforma`  (ou botão "Run workflow")
  → .github/workflows/query-engine.yml
      job `testes`:   pytest (query_engine/) + npm test (vitest)
      job `publicar`: OIDC → ECR build/push → cria-ou-atualiza a Lambda
  → Lambda `plum-query-engine`, sa-east-1, imagem de container
      base: public.ecr.aws/lambda/python:3.12
      handler: query_engine.lambda_handler.handler
  → Function URL com auth AWS_IAM
```

Três detalhes do workflow que valem conhecer:

- **`docker build --platform linux/amd64` explícito.** O Lambda roda x86_64; sem isso um runner
  arm publicaria uma imagem que sobe e morre com `exec format error`.
- **O deploy falha se o endpoint ficar público.** Depois de garantir `--auth-type AWS_IAM`, o
  workflow relê o `AuthType` e roda `test "$AUTH" = "AWS_IAM"`. Não é comentário pedindo
  cuidado: é uma trava que quebra o build.
- **Ninguém precisa de Docker na própria máquina.** A imagem é construída no runner do GitHub.

Sem chave de longa duração no GitHub: a autenticação com a AWS é por **OIDC**
(`secrets.AWS_DEPLOY_ROLE_ARN` é o ARN de uma role cuja trust policy aceita só este repositório,
não uma credencial).

O provisionamento saiu deste arquivo e foi para `infra/aws/`:

| Arquivo | O que é |
|---|---|
| `infra/aws/README.md` | ponto de entrada |
| `infra/aws/PASSO-A-PASSO.md` | roteiro de provisionamento |
| `infra/aws/provision.sh` | cria os recursos na AWS, idempotente |
| `infra/aws/valores-supabase.sh` | extrai os valores que viram secrets do Supabase |
| `infra/aws/smoke-test.sh` | confere que o endpoint **não** é público e que responde |

---

## 4. O que o `pandas_executor.py` garante

A reescrita corrigiu três falhas silenciosas reais — o tipo de bug que o produto vende que não
tem:

- **Filtro sobre coluna inexistente não devolve mais `True` para tudo.** Antes, um `where` sobre
  coluna ausente era ignorado e a conta rodava sobre a base inteira, devolvendo o total
  histórico com o rótulo do recorte pedido. Agora levanta `MissingColumnError`.
- **`group_by` sobre coluna inexistente não é mais descartado em silêncio.** Mesma lógica:
  agrupar por `[regiao, fantasma]` e devolver só por região é um resultado diferente do pedido,
  com o rótulo do pedido.
- **`_PCT_COLS` / `_STRING_COLS` deixaram de ser constantes globais vazias** (a dívida do
  `CLAUDE.md` §8). Viraram `column_roles: {coluna: 'percent'|'text'|'date'|'number'}`, passado
  por requisição — o único jeito que funciona em multitenant, já que cada cliente nomeia as
  colunas do jeito dele.

Ganhou também:

- **`k_min`** — k-anonimato por grupo. Grupos com menos de `k_min` linhas de origem são
  suprimidos antes de o vetor sair, e `suppressed_groups` volta no retorno para a interface
  poder explicar o buraco. `SUM(salario) GROUP BY funcionario` numa base com uma linha por
  pessoa é a folha de pagamento vestida de agregado.
- **`RawRowsBlocked`** — plano sem agregação é recusado (P1.3: só sai daqui vetor agregado).
- **`RowLimitExceeded`** — teto de linhas checado antes do processamento, e em `sheets.py`
  checado antes de qualquer MB entrar em memória, a partir dos metadados da planilha.

---

## 5. Pendências

> **Estado em 2026-08-07 (não commitado).** Os itens 5.1 a 5.4 abaixo foram
> implementados; o texto de cada um fica como registro do problema e da decisão.
> O que **falta** é verificação em ambiente real — ver §7. Nada disso foi
> rodado: a máquina onde o trabalho foi feito não tem Python nem Node
> instalados, então `pytest`, `npm run build` e `npm test` não puderam ser
> executados. O CI é a primeira validação real.

### 5.1 O papel da coluna ainda sai de grep sobre texto livre

Este é o resto vivo do `query_engine/urgent.md`. O diagnóstico de lá continua válido, e o status
segue `⬜ diagnosticado`.

Com a consolidação, o `column_roles` deixou de ser derivado no Python e passou a vir pronto no
payload assinado. Quem o produz agora é **`papeisDeColuna()` em
`supabase/functions/dashboard-execute/index.ts:340-358`** — e o que ela faz é o mesmo grep de
palavra-chave, só que em TypeScript:

```ts
const r = (def?.cleaning_rule ?? "").toLowerCase();
if (/percent|porcent|%|taxa/.test(r)) roles[nome] = "percent";
else if (/data|date/.test(r)) roles[nome] = "date";
else if (/r\$|moeda|float|int|numero|número|decimal/.test(r)) roles[nome] = "number";
else roles[nome] = "text";
```

A entrada é a `cleaning_rule`: uma frase em português que o Agente 3 escreveu livremente. O
prompt do Agente 3 não conhece esse vocabulário de ~12 palavras, então uma regra como *"converter
Sim/Não para booleano"* ou *"normalizar CPF removendo pontos"* cai no `else` e vira `text` — sem
log, sem aviso, sem erro.

Consequência concreta: `role = text` faz `_scalar_agg` rodar
`pd.to_numeric(..., errors="coerce").fillna(0)` em `sum`/`avg`. Valor que não converte vira `0` e
entra na soma. E uma coluna percentual cuja regra não contenha `percent|porcent|%|taxa` perde a
proteção de "nunca somar" — `10% + 20%` volta a virar `30`.

A correção proposta no `urgent.md` (coluna `datasets.formatting_contract` com `{tipo, params}`
de um enum fechado) resolve isso na raiz: `column_roles` passa a ser derivado do `tipo`, não
adivinhado da frase. Agora com uma vantagem: como só existe **um** consumidor
(`papeisDeColuna`), a mudança é menor do que era quando havia duas funções fazendo o mesmo grep.

### 5.2 Código morto em `query_engine/`

Sobras da consolidação, que hoje não são importadas por ninguém:

| O quê | Situação |
|---|---|
| `cache.py` | último consumidor era `sheets_client.py`, deletado. Não é copiado pelo `Dockerfile`. |
| `cachetools==5.5.0` no `requirements.txt` | instalado só para o `cache.py` morto |
| `apply_formatting_rules`, `execute_plan_with_formatting`, `roles_from_formatting_rules` | **nenhum chamador de produção.** `main.py` chama `execute_plan` direto com o `column_roles` do payload. Só `__init__.py` exporta e um teste usa. |

Decidir: apagar, ou manter porque o caminho do chat (§5.4) vai precisar. Se ficar, vale um
comentário dizendo isso — hoje parecem vivos.

> Nota sobre a formatação de valores: como `sheets.py` lê com
> `valueRenderOption="UNFORMATTED_VALUE"`, uma célula de moeda no Google Sheets chega como
> número, porque lá "R$" é formato de exibição sobre um valor numérico. O problema de parsing de
> `"R$ 1.234,56"` só aparece quando a célula é **texto de verdade**. Isso reduz o alcance
> prático do §5.1 para o dashboard, mas não o elimina — e não vale para a decisão de `role`,
> que continua errada independentemente do tipo da célula.

### 5.3 `supabase/functions/_shared/query_plan.ts` está como binário no git

Continua com **1 byte NUL** no meio, então o git o trata como binário: não aparece em diff de
PR, não dá para revisar linha a linha, `git blame` não funciona.

É justamente o arquivo que `security.py` chama de *"único parser do sistema"* — a extração
recursiva de colunas que aplica o RBAC (decisão 8A: dois parsers em duas linguagens divergiriam
em algum aninhamento, e quando duas travas discordam quem passa é a mais frouxa). Um arquivo
crítico de segurança que ninguém consegue revisar em PR.

Correção: reescrever em UTF-8 limpo e criar `.gitattributes` com `*.ts text eol=lf`. Não existe
`.gitattributes` no repo.

```sh
# confirmar
git ls-files --eol supabase/functions/_shared/query_plan.ts
```

### 5.4 O chat não está ligado

`PlumChat.tsx:144` continua com o mock:

```ts
const mockPythonVetor = { rows: [{ valor: "Simulado" }], msg: "Execução do Pandas pendente da API Python." };
```

Falta a `action: 'execute_plan'` na Edge Function `ai-plum-chat` — hoje ela só repassa para o
Gemini, sem nenhuma checagem de tenant. É a peça que fecha R-05 nessa rota.

**Não reescrever do zero:** `supabase/functions/dashboard-execute/index.ts` já faz exatamente
esse fluxo (JWT → `allowed_columns` do cargo → extração de colunas → assinatura HMAC → chamada
ao executor). O chat precisa da mesma coisa com um plano só em vez de N cards.

Duas diferenças a resolver antes:
- O executor exige agregação (`RawRowsBlocked`) e aplica `k_min`. Uma pergunta de chat que peça
  listagem vai ser recusada — decidir se o chat relaxa `k_min` ou se o Agente A é instruído a
  sempre agregar.
- O cache de dados (TTL 15 min do `cache.py`) morreu com a consolidação. Hoje só há cache de
  *metadados* da planilha, em `sheets.py`. Para o chat, várias perguntas seguidas sobre o mesmo
  dataset viram várias leituras.

---

## 6. O que foi feito

| # | Mudança | Arquivos |
|---|---|---|
| 1 | Byte NUL de `query_plan.ts` virou escape `\u0000`; `.gitattributes` criado | `_shared/query_plan.ts`, `.gitattributes` |
| 2 | Código morto removido | `cache.py` (apagado), `requirements.txt`, `pandas_executor.py`, `__init__.py`, `tests/test_privacidade.py` |
| 3 | Coluna `datasets.formatting_contract` + tipos | `migrations/20260807120000_contrato_formatacao.sql`, `types.ts` |
| 4 | Agentes 3/3.1 com enum fechado e validação no servidor | `supabase_edge_function_ai_agents.ts` |
| 5 | `papeisDeColuna` lê o contrato, com fallback avisado | `_shared/query_plan.ts`, `_shared/query_plan.test.ts`, `dashboard-execute/index.ts` |
| 6 | Contrato persistido e exibido | `DatabasePipeline.tsx`, `Cfgdatabase.tsx`, `src/lib/formatting-contract.ts` |
| 7 | Chat ligado ao executor | `functions/chat-execute/index.ts` (novo), `PlumChat.tsx` |

Três decisões que valem registro, porque divergem do que o próprio documento
pedia antes:

**O NUL era intencional.** É o separador de `permissionsFingerprint`, e o
comentário no arquivo explica por quê: sem um separador fora do alfabeto de
nomes de coluna, `["ab","c"]` e `["a","bc"]` colidiriam. Trocar o byte cru por
`\u0000` produz exatamente a mesma string, então **nenhuma digital muda** e
nenhum snapshot em cache é invalidado.

**`papeisDeColuna` mudou de arquivo, não só de lógica.** Estava dentro de
`dashboard-execute/index.ts`, onde não tinha teste. Foi para
`_shared/query_plan.ts`, que é o módulo coberto por vitest — coerente com a
regra que o próprio repositório escreveu: *"a peça que aplica o RBAC é
justamente a que não pode viver sem teste"*. Ganhou 8 casos, incluindo dois que
**documentam o erro do fallback** em vez de escondê-lo.

**O chat virou uma função nova, não uma `action` em `ai-plum-chat`.** Este
documento pedia `action: 'execute_plan'` ali. Mas `ai-plum-chat` é colada à mão
no painel e não pode importar `_shared/query_plan.ts` — colocar a autorização
lá significaria uma **segunda cópia de `authorizePlan`**, exatamente o cenário
de "duas travas que discordam" que `query_plan.ts` proíbe no seu comentário de
abertura. `supabase/functions/chat-execute/index.ts` é irmã de
`dashboard-execute`, deployada por CLI, e reusa o único parser.

### O que o contrato resolve, em uma linha

`column_roles` deixa de ser adivinhado por grep numa frase em português e passa
a sair de um `tipo` de enum fechado, revisado por humano antes de virar dado.
Base sem contrato continua funcionando pelo caminho antigo — e agora **avisa no
log** que está adivinhando, que é o que faltava para o R-08 valer aqui.

---

## 7. Verificação — o que falta

Nada abaixo foi executado. A máquina onde a implementação foi feita não tem
Python nem Node (os caminhos em `WindowsApps` são stubs da Microsoft Store).

```sh
npm run build                          # typecheck + build
npm test                               # vitest, inclui os 8 casos novos de papeisDeColuna
cd query_engine && python -m pytest    # invariantes de privacidade e segurança
git grep -n -E "^(<<<<<<< |=======$|>>>>>>> )"   # deve não retornar nada
git ls-files --eol supabase/functions/_shared/query_plan.ts   # deve sair como texto, não binário
```

Depois, em ambiente real:

1. **Aplicar a migration** no SQL Editor do painel (não há CLI — `CLAUDE.md` §1).
   O bloco de verificação no fim do arquivo deve imprimir `OK` nas cinco linhas.
2. **Deploy manual** da Edge Function `ai-agents` pelo painel (é colada à mão).
3. **Deploy por CLI** de `chat-execute`: `supabase functions deploy chat-execute`.
   Ela precisa dos mesmos secrets de `dashboard-execute` (`PLUM_EXECUTOR_URL`,
   `PLUM_EXECUTOR_HMAC_SECRET`, `PLUM_AWS_*`).
4. **Pipeline de importação E2E**: subir uma planilha com coluna de moeda, data,
   CPF e Sim/Não. Conferir na Etapa 3 que cada uma recebeu um tipo do enum e que
   nenhuma caiu em "Sem transformação" por acidente. Finalizar e conferir no
   painel que `datasets.formatting_contract` foi gravado.
5. **Base legada**: abrir em `/cfgdatabase` um dataset importado antes da
   migration. Deve aparecer o aviso "Formato legado" no card e o badge "Legado"
   por coluna. Rodar o Agente 3.1 nele e confirmar que passa a ter contrato.
6. **Chat E2E**: pergunta válida, bloqueada pelo Agente Z, inviável (coluna
   inexistente), pergunta sobre coluna que o cargo não enxerga (deve dar 403 com
   mensagem, sem chamar o Agente C) e `dataset_id` de outra organização (403
   antes de chegar na AWS).
7. `supabase/tests/*.sql` — o `CLAUDE.md` §9 exige rodar sempre que o schema muda
   ou uma Edge Function passa a fazer query nova. As duas coisas aconteceram.

Para subir o serviço localmente, sem Lambda:

```sh
uvicorn query_engine.main:app --reload
```
