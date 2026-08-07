# Fase 0b — Ligando as pontas

**Data:** 2026-08-07 · **Branch:** `plataforma` · **Estado:** todo o caminho
escrito e testado de ponta a ponta em código. Falta executar o provisionamento
da AWS e aplicar a migration.

---

## 1. O que travava, e por quê

A Fase 0 entregou o executor pronto e testado, mas ele estava sozinho no mundo.
Quatro lacunas se travavam em cadeia, e nenhuma podia ser resolvida fora de
ordem:

```
   sem migration  ──► a Edge Function não tem onde ler nem gravar card
        │
        ▼
   sem Edge Function ──► ninguém chama o executor legitimamente
        │                  (ele exige payload assinado, e quem assina é ela)
        ▼
   sem google_sheet_id ──► o executor não acha a planilha
        │                   (o onboarding gravava a URL, ele lia o ID)
        ▼
   sem vitest ──► a peça que aplica o RBAC de coluna fica sem teste
```

Esta fase resolve as quatro. O que sobra depois dela é execução de
infraestrutura, não decisão nem código.

---

## 2. A migration

Arquivo: `supabase/migrations/20260806230000_dashboard_cards.sql`

Quatro blocos, todos idempotentes e não destrutivos.

### 2.1 `dashboard_cards`

Um card é um Query Plan salvo. É o mesmo JSON que o Agente A gera para o chat,
guardado e re-executado. Não existe segundo motor: a tela e a conversa passam
pelo mesmo executor, pelo mesmo ponto de RBAC e pela mesma auditoria.

Duas colunas merecem explicação.

**`viz` não aceita `donut`.** Rosca e pizza mostram todas as fatias ao mesmo
tempo, sem ordem, então o olho compara toda cor com toda cor. Rodando o
validador de paleta contra a superfície real do card do PLUM (`#120E1B`), com
3 categorias passa folgado e com 4 o amarelo e o laranja ficam a ΔE 10,6 numa
escala cujo piso é 15. Isso quer dizer que gente com visão de cor normal já
confunde as duas fatias, antes de considerar daltonismo. Parte-do-todo virou
barra empilhada horizontal, com no máximo 3 segmentos e o excedente agrupado
em "Outros".

**`higher_is_better` nasce nulo.** Metade das métricas de qualquer empresa é
melhor quando cai: custo, tempo de entrega, cancelamento. Sem este campo, quem
implementasse pintaria toda subida de verde, e um card de custo subindo 30%
apareceria como boa notícia. Cor é lida antes do número. O padrão nulo faz o
delta sair sem cor até alguém escolher, porque **cor errada é pior que ausência
de cor**.

### 2.2 `dashboard_card_snapshots`, e por que a chave não usa `role_id`

Esta é a decisão menos óbvia do banco inteiro.

O primeiro desenho chaveava o cache por `(card_id, role_id)`, com a
justificativa correta de que o RBAC de coluna muda o resultado: o mesmo card
executado por um vendedor e por um diretor produz números diferentes.

A justificativa está certa. A chave estava errada.

O que muda o resultado não é o **identificador do cargo**, é o **conjunto de
colunas** que aquele cargo enxerga. E esse conjunto é mutável:

```
  10h00  vendedor abre o dashboard
         sistema calcula e guarda o snapshot, incluindo margem_lucro

  10h05  admin revoga margem_lucro do cargo de vendedor
         → a linha de role_permissions muda
         → o snapshot das 10h00 continua sendo o mais recente de (card, cargo)

  10h06  vendedor recarrega
         → cache válido por mais 9 minutos
         → ele continua vendo a margem que acabou de perder
         → o admin olha a tela de permissões e acredita que revogou
```

A correção troca `role_id` por uma **impressão digital da permissão**:

```
  permissions_fingerprint = sha256( allowed_columns ordenadas )
```

Revogar uma coluna gera uma digital nova. O snapshot antigo simplesmente deixa
de ser encontrado, e o sistema recalcula. Três ganhos de uma função de três
linhas:

1. **Invalidação automática**, sem trigger e sem ninguém precisar lembrar.
2. **Dedup**: dois cargos com permissão idêntica compartilham o snapshot, o que
   é uma leitura a menos no Google.
3. **Vazamento impossível por construção**, não por disciplina.

Custo aceito de olhos abertos: a série histórica passa a ser por digital, então
mudar a permissão inicia uma série nova para aquele cargo. Isso é correto e não
é bug — a métrica realmente mudou de definição quando o conjunto de colunas
mudou.

`role_id` continua na tabela, fora da chave, para auditoria.

**Sobre RLS de snapshot:** membro ativo da organização lê; **ninguém** escreve.
Não existe policy de INSERT para `authenticated`, e com RLS ligada e sem policy
a operação é negada. Quem grava é a Edge Function, com service role, depois de
validar o plano. Se o navegador pudesse inserir snapshot, ele fabricaria um
resultado com qualquer digital de permissão e contornaria o RBAC inteiro.

### 2.3 `k_min` e `max_rows` por organização

Estavam em variável de ambiente do serviço, o que é global. Uma base de 40
clientes B2B com k=5 suprime quase tudo; uma base de varejo com 200 mil linhas
por mês precisa de outro teto. A decisão é do admin da organização.

### 2.4 `google_sheet_id` vira a fonte da verdade

A tabela tinha dois campos concorrentes. O onboarding gravava
`google_sheet_url` (`DatabasePipeline.tsx:395`) e o executor esperava
`google_sheet_id`. Como `types.ts` só conhecia o segundo, o TypeScript não
acusava nada, e **todo card falharia no primeiro dia** com "planilha nula".

A migration adiciona uma função `extract_google_sheet_id(url)`, faz o backfill
dos datasets existentes, e emite um `RAISE WARNING` nomeando quantos datasets
ativos ficaram sem ID. Diagnóstico, não bloqueio: melhor descobrir na migration
do que em produção.

---

## 3. O único interpretador de Query Plan

Arquivo: `supabase/functions/_shared/query_plan.ts`

Esta é a peça que aplica o RBAC de coluna. Ela percorre um Query Plan e devolve
todas as colunas que ele referencia, em qualquer das seis posições possíveis:

```
  {
    target_columns: ["faturamento"],              ← 1
    select: [
      { expr: "regiao" },                         ← 2  (string)
      { expr: {agg:"sum", col:"margem_lucro"} }   ← 3  (objeto)
    ],
    where: {                                      ← 4  (recursivo!)
      op: "and",
      args: [
        { left: "data_venda", op: "between", ... },
        { op: "or", args: [ { left: "cpf", ... } ] }
      ]
    },
    group_by: ["vendedor"],                       ← 5
    order_by: [{ col: "total", dir: "desc" }]     ← 6
  }
```

Se **qualquer** uma dessas posições escapar, uma coluna proibida atravessa a
checagem e nenhuma camada abaixo pega, porque todas confiam no conjunto que sai
daqui.

### Por que existe só um interpretador

O serviço em Python **não** reimplementa isso. Ele recebe o conjunto já
resolvido, dentro do payload assinado, e faz apenas comparação de conjunto.

O motivo é concreto: o `where` é recursivo. Um interpretador em TypeScript e
outro em Python concordariam nos casos simples e divergiriam num aninhamento de
três níveis, ou quando o Agente A produzisse uma forma que só um dos dois
trata. E quando duas travas de segurança discordam, quem passa é a mais frouxa.
É assim que um bypass nasce.

Um interpretador, dois pontos de aplicação.

O arquivo **não importa nada** de propósito, para rodar igual no Deno da Edge
Function e no Node do vitest. O que é testado é exatamente o que é executado.

### A quinta barreira, que sai de graça

Existe ainda uma proteção que ninguém escreveu explicitamente. O serviço carrega
da planilha **apenas** as colunas que vieram assinadas. Se um plano declarar
`resolved_columns: ["faturamento"]` mas somar `margem_lucro` por dentro, a
comparação de conjunto passa (ela confia no que a Edge Function extraiu), mas
`margem_lucro` não existe no DataFrame carregado, e o executor levanta
`MissingColumnError` — porque na Fase 0 ele parou de ignorar coluna ausente.

Uma correção de bug virou uma barreira de segurança. Tem teste provando.

---

## 4. A Edge Function

Arquivo: `supabase/functions/dashboard-execute/index.ts`

Toda autorização do dashboard vive aqui, e só aqui. É o único ponto do caminho
onde o JWT do usuário e o RLS do Postgres existem ao mesmo tempo.

```
  POST /dashboard-execute   { dataset_id, card_ids? }
       │
       ├─ 1. JWT válido · perfil ativo · cargo definido
       │      (role_id nulo → 403. "sem permissão" nunca pode ser lido
       │       como "todas as permissões")
       │
       ├─ 2. o dataset pertence a esta organização?
       ├─ 3. os cards pertencem a esta organização?
       ├─ 4. allowed_columns do cargo NESTE dataset
       ├─ 5. impressão digital = chave do cache
       │
       ├─ 6. POR CARD: extrai colunas do plano · confere · recusa se sobrar
       ├─ 7. cache: último snapshot dentro do TTL do card
       │
       └─ 8. o que sobrou vai numa chamada só ao executor, assinada
                │
                ├── sucesso  → grava snapshots (service role) → status "ok"
                └── falha    → último snapshot IGNORANDO o TTL → status "stale"
                                sem snapshot algum            → status "error"
```

Três escolhas que merecem nota.

**O cliente usa o JWT do usuário, não a service role.** Toda leitura passa por
RLS. Se usássemos service role, um bug de filtro viraria vazamento entre
organizações em vez de resultado vazio. A service role só aparece na escrita de
snapshot, que é justamente o que o navegador não pode fazer.

**A resposta é por card, nunca por lote.** Um card com coluna proibida devolve
`forbidden` e os outros cinco continuam funcionando. Um card ruim não pode
apagar o dashboard inteiro.

**A degradação nunca mente sobre a idade.** Quando o executor falha, o card
volta com `status: "stale"` e o `computed_at`. A tela mostra o número com selo
de "calculado há X". Um dashboard que às vezes mostra erro é pior que uma
planilha, porque planilha sempre abre; e mostrar número velho sem avisar é pior
que mostrar erro, porque a pessoa decide com dado de ontem achando que é de
hoje.

---

## 5. AWS: uma linha de comando

Arquivo: `infra/aws/provision.sh`

Idempotente. Cria: repositório no ECR com política de ciclo de vida, os dois
parâmetros no SSM, role de execução com permissão mínima, a função Lambda,
Function URL com auth `AWS_IAM`, provedor OIDC do GitHub com role de deploy
restrita a este repositório e a esta branch, e o usuário IAM que a Edge Function
usa para assinar.

```
   Repositório Git                    NUNCA contém segredo
        │ push
        ▼
   GitHub Actions ─── OIDC ──► role de deploy
        │                       (o GitHub guarda um ARN, não uma chave)
        │ docker push
        ▼
      ECR ──► Lambda ─── role de execução ──► SSM (SecureString/KMS)
                  │                             /plum/prod/google-sa-json
                  │                             /plum/prod/hmac-secret
                  ▼
            memória do processo · morre com o container · nunca vai a disco
```

Detalhes de permissão mínima que valem a pena notar:

- A role de execução do Lambda pode ler **exatamente aqueles dois parâmetros**,
  nada mais. Se vazar, não abre o resto da conta.
- A role de deploy só publica naquele repositório do ECR e só atualiza aquela
  função.
- O usuário da Edge Function só pode `lambda:InvokeFunctionUrl` naquela função,
  e só quando o tipo de auth for `AWS_IAM`.
- O segredo do HMAC é gerado dentro do script com `openssl rand`, nunca
  impresso e nunca gravado em arquivo.

O script termina imprimindo os dois passos que exigem mão humana (registrar o
ARN no GitHub e a chave no Supabase) e os dois comandos de conferência: o
endpoint precisa responder **403 sem assinatura** e `status: ok` com assinatura.

---

## 6. Testes: 76, em duas linguagens

```bash
npm test                                  # 35 · TypeScript
cd query_engine && python -m pytest       # 41 · Python
```

Um teste merece destaque, porque prova o contrato entre as duas linguagens:

```
  HMAC-SHA256("key", "The quick brown fox jumps over the lazy dog")

  TypeScript (crypto.subtle) : f7bc83f4...2d1a3cd8
  Python (hmac.hexdigest)    : f7bc83f4...2d1a3cd8   ✓
```

Sem isso, a Edge Function assinaria de um jeito e o executor verificaria de
outro, e a descoberta só aconteceria contra a AWS de verdade, com o Lambda
respondendo 401 sem explicar por quê.

O CI roda as duas suítes em todo pull request que toque `query_engine/`,
`supabase/functions/` ou `src/lib/`.

---

# Resumo estruturado

## Nome da task: T8 — Migration do dashboard

**1. O que foi feito**
`supabase/migrations/20260806230000_dashboard_cards.sql` cria `dashboard_cards`
e `dashboard_card_snapshots` com RLS, adiciona `dashboard_k_min` e
`dashboard_max_rows` em `organizations`, e cria o índice da leitura quente.

**2. Decisão técnica**
A chave do snapshot é `(card_id, permissions_fingerprint, computed_at)`, não
`(card_id, role_id, computed_at)`. O que determina o resultado de um card é o
conjunto de colunas permitidas, e esse conjunto é mutável; chavear pelo cargo
deixava o snapshot antigo válido depois da revogação. Descartei duas
alternativas: trigger de invalidação em `role_permissions` (funciona no caminho
comum, mas volta a vazar se alguém escrever por uma rota que o trigger não
cobre) e TTL curto (encurta a janela sem fechar, e multiplica as chamadas ao
Google). Snapshots são append-only em vez de cache sobrescrito porque o
histórico acumulado **é** a série temporal que o motor de insights vai precisar,
sem varrer a planilha de novo e sem tocar em linha bruta.

**3. Integrações tocadas**
Schema: duas tabelas novas, duas colunas em `organizations`, três colunas em
`datasets`, uma função `extract_google_sheet_id(text)`, um trigger de
`updated_at`. Nenhum endpoint.

**4. Safeguard**
O bug era de desenho e teria aparecido em produção: com `role_id` na chave, um
cargo continuava vendo por até 15 minutos uma coluna que o admin acabara de
bloquear, e o admin acreditava ter bloqueado. A digital torna isso impossível
por construção. Seis testes em `query_plan.test.ts` cobrem a função de digital,
incluindo o caso de colisão entre conjuntos que concatenam igual (`["ab","c"]`
contra `["a","bc"]`).

**5. Como validar**
```bash
supabase db reset                     # aplica todas as migrations
# ou, contra um banco existente:
supabase db push
```
Depois, no SQL editor:
```sql
select count(*) from public.datasets
 where status = 'active' and (google_sheet_id is null or google_sheet_id = '');
-- deve ser 0. Se não for, esses datasets precisam ser reconectados.
```

**6. Lacunas e pendências**
[LACUNA: a migration nunca foi aplicada contra o banco real — quem tem acesso
ao projeto Supabase resolve — D.O.D.: `supabase db push` sem erro, a query
acima devolvendo 0, e o `RAISE WARNING` do bloco 4 não aparecendo no log.]
[LACUNA: `dashboard_k_min` e `dashboard_max_rows` não têm tela de edição — dono
do front resolve — D.O.D.: admin consegue mudar os dois na tela de organização,
com a mudança registrada em auditoria.]

---

## Nome da task: T10 — Edge Function `dashboard-execute`

**1. O que foi feito**
`supabase/functions/dashboard-execute/index.ts` valida JWT e organização,
carrega `allowed_columns`, calcula a digital de permissão, autoriza card a card,
consulta o cache, assina o payload, chama o Lambda com SigV4 e grava os
snapshots. Em caso de falha, degrada para o snapshot anterior com selo de idade.

**2. Decisão técnica**
Toda autorização vive nesta função, e o serviço em Python é Motorista Cego. A
razão é que a service account do Google lê a planilha de todos os clientes, e o
caminho do executor nunca toca o Postgres, então o RLS não protege nada lá; o
isolamento precisa vir de um lugar onde o JWT existe. O cliente Supabase usa o
JWT do usuário e não a service role, para que um bug de filtro vire resultado
vazio em vez de vazamento entre organizações. A service role aparece só na
escrita de snapshot, que o navegador não pode fazer: se pudesse, fabricaria um
resultado com qualquer digital e contornaria o RBAC. Descartei fazer a
autorização no Python (não tem JWT nem RLS) e descartei usar service role no
caminho de leitura (transforma bug em vazamento).

**3. Integrações tocadas**
Endpoint novo: `POST /functions/v1/dashboard-execute` com
`{ dataset_id, card_ids? }`. Consome `profiles`, `datasets`,
`dashboard_cards`, `role_permissions`, `organizations`, e escreve em
`dashboard_card_snapshots`. Chama `POST {EXECUTOR_URL}/execute` com header
`X-Plum-Signature`. Cinco variáveis novas nos secrets do Supabase.

**4. Safeguard**
N/A — código novo. Mas fecha o risco que estava aberto desde a revisão: o design
não dizia como o serviço saberia que quem o chama tem direito.

**5. Como validar**
```bash
npm test                              # o extrator e a digital
supabase functions deploy dashboard-execute
supabase functions invoke dashboard-execute --body '{"dataset_id":"<uuid>"}'
```
Com um cargo sem acesso à coluna do card, a resposta daquele card precisa vir
com `"status":"forbidden"` e os demais cards continuarem `"ok"`.

**6. Lacunas e pendências**
[LACUNA: nunca foi implantada nem executada — quem tiver acesso ao projeto
Supabase resolve — D.O.D.: `supabase functions invoke` devolvendo `results` com
um card real.]
[LACUNA: sem teste de integração da função em si, só do módulo compartilhado —
sem dono definido — D.O.D.: um teste que suba a função localmente com
`supabase functions serve` e exercite os quatro status (`ok`, `stale`,
`forbidden`, `error`).]
[LACUNA: o front que consome este endpoint não existe (tarefas D4, D5, T13,
T14) — dono do front resolve — D.O.D.: `/dashboard` renderizando os cinco
estados conforme `DESIGN.md` seção 6.]

---

## Nome da task: T11 + T12 (TypeScript) — vitest e o extrator de colunas

**1. O que foi feito**
vitest instalado e configurado, scripts `test`, `test:watch` e `test:py` no
`package.json`, e 35 testes: 28 do módulo compartilhado e 7 do extrator de ID
de planilha.

**2. Decisão técnica**
O módulo compartilhado não importa nada, de propósito, para rodar igual no Deno
e no Node — assim o que é testado é exatamente o que é executado. Os testes são
organizados por **posição no plano**, não por função, porque o risco real é uma
posição escapar: existe um teste que percorre as seis posições com a mesma
coluna proibida e exige que todas sejam barradas. Descartei testar via Deno
(`deno test`), que seria mais fiel ao runtime mas adicionaria um segundo
executor de teste ao projeto para pouco ganho, já que o módulo é código padrão
sem API de plataforma além de `crypto.subtle`, presente nos dois.

**3. Integrações tocadas**
`package.json` (três scripts), `vitest.config.ts` (novo), workflow do CI passa a
rodar as duas suítes.

**4. Safeguard**
Indireto e importante: o teste do vetor de referência do HMAC prova que
`crypto.subtle` no TypeScript produz o mesmo dígito que `hmac.hexdigest()` no
Python. Sem ele, a Edge Function assinaria de um jeito e o executor verificaria
de outro, e a descoberta só aconteceria contra a AWS real, com um 401 sem
explicação. Também há um teste de aninhamento de 500 níveis no `where`, para
que um plano hostil não vire estouro de pilha justamente na função que aplica
o RBAC.

**5. Como validar**
```bash
npm test          # 35 passando
npm run test:py   # 41 passando
```
Para ver o teste de paridade falhar de propósito, troque um caractere do vetor
esperado em `query_plan.test.ts`.

**6. Lacunas e pendências**
[LACUNA: componentes React seguem sem teste, porque a tela do dashboard ainda
não existe — dono do front resolve junto com D4 — D.O.D.: os cinco estados do
card cobertos por teste de componente.]
[LACUNA: testes de ponta a ponta com navegador continuam deferidos — item 3 do
`TODOS.md` — D.O.D.: os seis fluxos do plano de teste rodando em CI.]

---

## Nome da task: T9 — `google_sheet_id` como fonte da verdade

**1. O que foi feito**
`src/lib/google-sheets.ts` com `extrairSheetId`, usado no onboarding
(`DatabasePipeline.tsx`) e na tela de edição (`Cfgdatabase.tsx`). As duas telas
passam a gravar o ID e recusar link inválido. `types.ts` atualizado com
`google_sheet_url` e `google_sheet_tab`.

**2. Decisão técnica**
O ID é a verdade e a URL vira campo de exibição, porque a API do Google exige o
ID. Extrair uma vez na escrita é melhor que extrair em toda leitura, e faz o
erro aparecer enquanto a pessoa ainda está com o link na mão. Descartei extrair
no executor a cada leitura (paga parse em toda execução e falha em URL antiga
malformada, sem ninguém para corrigir) e descartei preencher os dois campos
como verdade (funciona hoje e garante que um dia divirjam).

**3. Integrações tocadas**
Schema: `datasets.google_sheet_id`, `google_sheet_url`, `google_sheet_tab`, e a
função SQL de backfill. Front: duas telas passam a gravar `google_sheet_id`.

**4. Safeguard**
O bug: o onboarding gravava a URL e o executor lia o ID, e como `types.ts` só
conhecia o ID o TypeScript não acusava nada. Todo card falharia no primeiro dia
com "planilha nula", e a suspeita natural recairia sobre credencial ou permissão
do Google, não sobre nome de campo. Agora as duas telas recusam link inválido
antes de gravar, `types.ts` conhece os três campos, e sete testes cobrem as
formas de URL que o Google entrega, o ID colado sozinho, e os casos que precisam
devolver nulo (link de Documento em vez de Planilha, texto solto, vazio).

**5. Como validar**
```bash
npm test -- google-sheets
```
Na tela: colar `https://docs.google.com/document/d/1AbC/edit` na configuração de
base precisa mostrar a mensagem de link inválido e **não** gravar nada.

**6. Lacunas e pendências**
[LACUNA: `google_sheet_tab` está fixo em `Sheet1` e nenhuma tela permite
escolher a aba — dono do onboarding resolve — D.O.D.: seletor de aba no passo
de conexão, alimentado pela lista real de abas da planilha.]
[LACUNA: `types.ts` foi editado à mão e não regenerado — quem aplicar a
migration resolve — D.O.D.: `supabase gen types typescript` executado e o
arquivo substituído, com `dashboard_cards` e `dashboard_card_snapshots`
presentes.]

---

## Nome da task: INFRA — Provisionamento da AWS

**1. O que foi feito**
`infra/aws/provision.sh`, idempotente, cria os sete recursos do executor: ECR
com política de ciclo de vida, dois parâmetros no SSM, role de execução, função
Lambda, Function URL com auth `AWS_IAM`, OIDC do GitHub com role de deploy, e o
usuário IAM da Edge Function.

**2. Decisão técnica**
Lambda com imagem de container, escolhido contra ECS Fargate (o balanceador é
custo fixo antes da primeira requisição), App Runner (instância provisionada
ociosa) e EC2 (passivo de patch numa equipe com rotatividade). O cold start com
pandas é o contra, e ele é neutralizado por duas decisões anteriores: o endpoint
em lote faz uma invocação por dashboard em vez de seis, e a degradação serve o
snapshot anterior com selo de idade. Segredos ficam no SSM Parameter Store como
SecureString em vez de Secrets Manager, porque o tier padrão não cobra por
parâmetro e o PLUM não precisa de rotação automática ainda. O Function URL usa
`AWS_IAM` em vez de header caseiro: assinatura da AWS é infraestrutura testada,
e o HMAC continua como segunda camada com **outro** segredo, de modo que vazar
um não basta.

**3. Integrações tocadas**
Nenhum código. Recursos AWS: ECR, SSM, IAM (duas roles e um usuário), Lambda,
Function URL, provedor OIDC. Um secret novo no GitHub (`AWS_DEPLOY_ROLE_ARN`,
que é um ARN e não uma credencial) e cinco nos secrets do Supabase.

**4. Safeguard**
N/A — infraestrutura nova. Vale registrar o que o script deliberadamente não
faz: não grava segredo em arquivo nenhum, não imprime o segredo do HMAC (gerado
com `openssl rand` e enviado direto ao SSM), e avisa para apagar o JSON da
service account depois de enviá-lo.

**5. Como validar**
```bash
GOOGLE_SA_FILE=~/Downloads/plum-ai-xxxx.json bash infra/aws/provision.sh

# o endpoint NÃO pode ser público — deve responder 403:
curl -s -o /dev/null -w '%{http_code}\n' <FunctionURL>/health

# e deve responder com credencial:
aws lambda invoke --function-name plum-query-engine \
  --payload '{"version":"2.0","rawPath":"/health","requestContext":{"http":{"method":"GET","path":"/health"}},"headers":{}}' \
  --cli-binary-format raw-in-base64-out /tmp/r.json && cat /tmp/r.json
```

**6. Lacunas e pendências**
[LACUNA: o script nunca foi executado — quem tiver acesso à conta AWS resolve —
D.O.D.: os dois comandos de conferência acima com os resultados esperados, 403
e `status: ok`.]
[LACUNA: a extensão AWS Parameters and Secrets não é anexada pelo script,
porque o ARN do layer varia por região e precisa ser consultado na
documentação da AWS — quem provisionar resolve — D.O.D.: layer anexado, ou a
decisão consciente de ficar no caminho do boto3, que o `config.py` já suporta
como alternativa.]
[LACUNA: sem observabilidade além do log padrão — sem dono definido — D.O.D.:
alarme no CloudWatch para taxa de erro e para duração no percentil 95.]
[LACUNA: a região `sa-east-1` é suposição de menor latência e não foi
confirmada — quem provisionar resolve — D.O.D.: região escolhida e refletida no
script e no workflow.]
