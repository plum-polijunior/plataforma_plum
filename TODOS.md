# TODOS

Trabalho conscientemente adiado, com o raciocínio junto. Um item aqui não é "esquecemos",
é "decidimos que não agora, por este motivo". Antes de reabrir qualquer um, leia o
**Contexto** e o **Depende de**.

Origem: `/plan-eng-review` de 2026-08-06 sobre o design doc do Dashboard PLUM
(`~/.gstack/projects/plum-polijunior-plataforma_plum/kakam-plataforma-design-20260806-215908.md`).

---

## 1. Cache de coluna com TTL no serviço Python — RESOLVIDO em 2026-08-07

**Decisão tomada, por conversa entre Allekka/bmchad/RicardoMoussalli:** ligar o cache agora,
aceitando conscientemente que o dado bruto do cliente fica até 15 minutos na memória do
processo (era exatamente essa a decisão de privacidade que faltava, descrita abaixo). Feito em
`query_engine/sheets.py`: `load_columns` agora passa pelo `cache.get_or_fetch`, chave por
planilha+aba+conjunto exato de colunas. Suíte de testes (53 testes) roda verde depois da
mudança. O raciocínio original que levou a adiar fica registrado abaixo, sem alterar — é o
motivo de a decisão ter sido consciente, não um commit de passagem.

<details>
<summary>Raciocínio original (antes da decisão)</summary>

**O quê:** guardar as colunas lidas do Google Sheets por ~15 minutos, chaveado por
`(google_sheet_id, coluna)`, no serviço Python.

**Por quê:** reduz chamadas repetidas ao Google entre execuções distintas, inclusive entre
usuários diferentes da mesma organização e entre o chat e o dashboard.

**Prós:** corta a maioria das leituras repetidas dentro da janela; já estava especificado em
`query_engine/prd.md:144`, então é um débito de implementação e não uma ideia nova.

**Contras:** mais um lugar onde dado pode ficar velho; exige política de invalidação quando o
cliente edita a planilha; se for Redis, é mais uma peça de infraestrutura para manter.

**Contexto:** na revisão, o problema real era a quota de 60 requisições por minuto do Sheets
(`query_engine/prd.md:145`). Seis cards do mesmo dataset faziam seis GET na mesma planilha.
A decisão 11A resolveu na origem, agrupando: um endpoint em lote executa todos os cards de um
dataset com **um** `batchGet` da união das colunas. Isso mata o N+1 em vez de escondê-lo atrás
de cache. O cache de coluna continua valendo, mas como otimização de segunda ordem, quando
houver medição mostrando que ainda faz falta.

**A implementação já existe e está no repositório.** `query_engine/cache.py`, escrito pelo
bmchad, é um `TTLCache` com lock, chave por tenant e janela de 15 minutos. Ele foi mantido de
propósito quando o resto da implementação paralela dele foi consolidada. Ligar é conectar
`load_columns` a ele.

**O que precisa ser decidido antes de ligar, e é o motivo de não estar ligado:** o cache
guarda **linhas brutas do cliente na memória do processo por 15 minutos**. A premissa P1.2 diz
que nenhuma linha bruta é persistida em disco, e memória não é disco, então não há violação
literal. Mas estender a vida do dado bruto de "uma requisição" para "quinze minutos" muda a
postura de privacidade, e isso merece uma decisão consciente e escrita, não um commit de
passagem. Se ligar, o material comercial precisa refletir isso.

**Depende de / bloqueado por:** T7 (batchGet) no ar, medição real de chamadas por minuto, e a
decisão de privacidade acima.

</details>

---

## 2. Streaming e agregação incremental para bases grandes

**O quê:** ler a planilha em páginas e agregar por pedaço, sem nunca ter a base inteira na
memória do serviço.

**Por quê:** hoje o executor carrega tudo em um DataFrame. Uma planilha de centenas de milhares
de linhas mata o container por falta de memória.

**Prós:** resolve bases grandes de verdade, em vez de recusá-las; abre o mercado de clientes com
volume maior, que é justamente quem mais sofre com planilha.

**Contras:** reescreve o núcleo do `execute_plan`; nem toda agregação é incremental de forma
trivial (mediana e percentil não são); é uma semana de trabalho para um problema que talvez
nenhum cliente atual tenha.

**Contexto:** `query_engine/pandas_executor.py:227-228` aplica `limit` **depois** da agregação,
então ele nunca protegeu a entrada. A decisão 10A escolheu um teto explícito de linhas por
organização, com erro nomeando a planilha e o limite. O raciocínio: se um cliente tem 400 mil
linhas, ele precisa saber que o PLUM ainda não é a ferramenta certa para aquela base, e você
precisa saber que existe demanda por bases grandes. Falha nomeada vira sinal de produto;
streaming prematuro só esconde a informação.

**Depende de / bloqueado por:** pelo menos um cliente real batendo no teto. Esse evento é o
gatilho, não uma data.

---

## 3. Testes E2E dos 6 fluxos mapeados

**O quê:** Playwright cobrindo: criar o primeiro card, abrir com 6 cards em cache, executor fora
do ar mostrando o selo de idade, revogação de coluna surtindo efeito imediato, POST direto no
serviço Python retornando 401, e dois cargos vendo o mesmo card de formas diferentes.

**Por quê:** são fluxos que cruzam front, Edge Function, serviço Python e Google Sheets. Teste
unitário com mock esconde exatamente as falhas de integração que importam nesses caminhos.

**Prós:** os dois fluxos de segurança (revogação e acesso direto ao serviço) são o tipo de coisa
que só se prova de ponta a ponta; protege contra regressão quando o time rodar.

**Contras:** Playwright é infraestrutura nova, precisa de ambiente com Supabase e serviço Python
de pé, e é lento no CI.

**Contexto:** a decisão 9A instalou vitest e pytest focados na fronteira de segurança, porque os
invariantes críticos (extrair colunas, comparar conjuntos, calcular a digital de permissão,
suprimir grupo pequeno, levantar exceção em coluna ausente) são funções puras e não precisam de
banco nem de rede. Cobertura completa da parte que mais importa, sem tentar cobrir a UI inteira
antes dela existir. Os 6 fluxos estão mapeados no test plan
(`kakam-plataforma-eng-review-test-plan-20260806-224500.md`), prontos para virar código.

**Depende de / bloqueado por:** T13 e T14 (a página existir), e a decisão de onde hospedar o
serviço Python (Open Question 4 do design doc).

---

## 4. Eval do Agente A contra perguntas reais

**O quê:** suíte de avaliação que pega as perguntas literais dos usuários e verifica se o
Agente A gera um Query Plan válido e semanticamente correto para cada uma.

**Por quê:** o Agente A é um LLM. Mudar o prompt dele, trocar o modelo, ou receber um
`schema_metadata` com formato diferente pode degradar a qualidade dos planos sem quebrar teste
nenhum, porque a saída continua sendo JSON válido.

**Prós:** transforma "o chat parece que piorou" em um número; é o único jeito de mexer no prompt
do Agente A com confiança.

**Contras:** precisa de um conjunto de perguntas reais com resposta esperada conferida à mão, e
montar esse conjunto é trabalho humano que não dá para automatizar.

**Contexto:** a tarefa de campo do `/office-hours` é justamente coletar 10 perguntas literais do
cliente pagante. Esse conjunto é a semente natural do eval. Além dele, `plum_chat` já grava toda
pergunta feita (ver item 7), então o corpus cresce sozinho. O eval só faz sentido depois que o
executor real estiver no ar, porque hoje toda resposta vem de `"Simulado"`.

**Depende de / bloqueado por:** T1 (executor real) e a coleta das 10 perguntas.

---

## 5. Privacidade diferencial contra ataque de diferenciação — MOOT em 2026-08-08

O k-anonimato que este item protegia foi removido (decisão de produto, ver
`k-anonimato-removido.md` na raiz do repo): sem supressão de grupo, não há grupo suprimido
para reconstruir por diferença entre duas consultas. Mantido abaixo só como registro do
raciocínio, para o caso de k-anonimato (ou proteção equivalente) ser reintroduzido no futuro
— aí este ataque volta a valer.

**O quê:** proteção contra reconstruir grupos suprimidos rodando duas consultas com filtros
levemente diferentes e subtraindo os resultados.

**Por quê:** o k-anonimato da premissa P3 suprime grupos com menos de `K_MIN` linhas, mas não
impede que alguém isole um indivíduo por diferença entre dois agregados legítimos.

**Prós:** fecha o último furo conhecido da garantia de privacidade; num produto vendido por
compliance com LGPD, é a diferença entre uma garantia forte e uma garantia com asterisco.

**Contras:** privacidade diferencial adiciona ruído calibrado aos resultados, o que colide com a
promessa de "precisão matemática de 100%" do `query_engine/prd.md:6`. Exige orçamento de
privacidade por usuário e por período, e explicar isso para um gerente é difícil. É desproporcional
ao estágio atual do produto.

**Contexto:** registrado como Open Question 7 do design doc. É um limite conhecido e aceito, não
um descuido. Se um cliente de saúde, financeiro ou RH entrar na base, isso sobe de prioridade
imediatamente, porque nesses setores o ataque deixa de ser teórico.

**Depende de / bloqueado por:** entrada de um cliente em setor regulado, ou exigência explícita
de auditoria.

---

## 6. Parar de enviar amostras reais da planilha para o Gemini (premissa P2)

**O quê:** os agentes `predict_semantics` e `format_data` em
`supabase/functions/ai-agents/index.ts:36-37` e `50-51` recebem
`dataSamples`, que são 5 linhas reais da planilha do cliente lidas em
`src/components/DatabasePipeline.tsx:72-75`, e as enviam para a API do Google.

**Por quê:** isso viola a premissa P1.1 do design doc ("nenhuma linha bruta entra no contexto de
um LLM") e torna falsa a garantia comercial de que a IA nunca lê os dados do cliente. Cinco
linhas com CPF continuam sendo CPF enviado para terceiro.

**Prós:** fechar isso deixa o discurso de privacidade honesto e defensável numa auditoria, sem
asterisco em contrato ou proposta.

**Contras:** as amostras existem por um bom motivo: sem ver dado real, o Agente 1 não consegue
inferir a definição semântica de uma coluna e o Agente 3 não consegue escrever a regra de
formatação. Substituir exige inferir tipo e formato de forma determinística e só mandar
metadados (nome, tipo detectado, cardinalidade, exemplo sintético) para o LLM. É reprojetar o
onboarding, não ajustar um prompt.

**Contexto:** **este item tem outro dono.** Na sessão de `/office-hours` a premissa P2 foi
explicitamente recusada como escopo por isso, e a recusa foi pelo motivo certo: não adianta
aceitar uma premissa sobre a qual você não tem autoridade de agir. Fica registrado como risco
conhecido, aberto, de outra propriedade. **Consequência prática enquanto isso existir:** a frase
"a IA nunca lê seus dados" não deve aparecer em contrato ou proposta sem qualificação.

**Depende de / bloqueado por:** conversa com o dono do onboarding sobre apetite e prioridade.

---

## 7. Usar `plum_chat.assunto` para descobrir quais cards criar

**O quê:** consultar o histórico de perguntas já feitas no chat, agrupado pelo campo `assunto`
que o Agente Z preenche em toda mensagem (`src/pages/PlumChat.tsx:126-128`), e usar o ranking
para decidir quais cards o dashboard deve sugerir primeiro.

**Por quê:** é a única fonte empírica que existe hoje sobre o que as pessoas realmente querem
saber. Todo o resto do desenho do dashboard é inferência a partir do schema.

**Prós:** `select assunto, count(*) from plum_chat group by 1 order by 2 desc` custa 30 segundos e
substitui semanas de suposição sobre layout; cada card sugerido passa a nascer de uma pergunta que
um humano de verdade fez.

**Contras:** só tem valor se houver volume real de uso. Com o executor mockado, as perguntas
existentes foram feitas contra respostas simuladas, então o `assunto` é confiável mas a satisfação
com a resposta não é.

**Contexto:** descoberto na sessão de `/office-hours`. O instrumento que responde "o que o
dashboard deve mostrar" já foi construído e nunca foi consultado. A premissa central do documento
original (`PLUM-insights-dashboards-autonomos.md`) era montar a tela a partir do **schema**; este
item é o argumento de que ela deveria ser montada a partir das **perguntas**.

**Depende de / bloqueado por:** volume de uso real, que por sua vez depende de T1 (executor real).
Rodar a consulta agora mesmo assim custa nada e já informa a Fase 1.

---

## 8. Investigar o 403 "base nao encontrada" em `execute_plan` (chat) — RESOLVIDO em 2026-08-08

**O quê:** no primeiro teste de ponta a ponta do chat (2026-08-07, depois de ligar o executor
real), toda pergunta chega a `execute_plan` e falha com `{"error": "base nao encontrada"}`,
HTTP 403, vindo de `supabase/functions/ai-plum-chat/index.ts` (a query que busca o dataset por
`id` + `organization_id` devolve vazio).

**Testado com:** usuário `bernardo.machado@polijunior.com.br`, cargo Admin, organização
"Machado Lmtd" (`organization_id = 3bf8596f-7a4d-4b91-8fd5-bdb78a512251`), base
`demo_riosulense.xlsx` (`id = cdcef2a8-d888-487c-9e7f-c9f87baa3158`).

**Já confirmado, direto no banco, que NÃO é a causa:**
- O dataset existe, está `status = 'active'`, e pertence exatamente a essa organização.
- Existe uma linha em `role_permissions` para esse `role_id` + `dataset_id`, com
  `allowed_columns` preenchido (29 colunas).
- `profile.organization_id`/`role_id`/`status` do usuário resolvem certo — os 3 checks
  anteriores no mesmo handler (`perfil sem organizacao`, `perfil nao ativo`, `sem cargo`) não
  disparam, só a busca do dataset falha.
- Logout/login (para forçar reemissão das claims do JWT) **não resolveu** — descarta a hipótese
  óbvia de `current_org_id()` estar usando uma claim `organization_id` desatualizada no token.

**Ainda não verificado:** o valor exato de `datasetId` que o front (`PlumChat.tsx`) está
mandando no corpo da requisição — pode não ser o UUID esperado (estado React desalinhado de
testes anteriores com outras contas/organizações no mesmo navegador). Existem 3 organizações de
teste, cada uma com exatamente uma base (`Babygoat`, `Babygoat2`, "Machado Lmtd"), então um
`selectedDatasetId` sobrando de outra sessão apontaria para a base errada e bateria exatamente
nesse erro.

**Diagnóstico deixado no ar:** `handleExecutePlan` agora faz `console.error` com o `datasetId`
recebido, o `profile.organization_id` resolvido, e o erro do Supabase (se houver) sempre que
cai em "base nao encontrada" — ver log da Edge Function `ai-plum-chat` no painel do Supabase
depois de reproduzir.

**Depende de / bloqueado por:** reproduzir de novo com o log novo no ar e olhar o valor real de
`datasetId` — provável próximo passo é conferir se ele bate com o dataset da organização do
usuário, e só então decidir se o bug é no front (estado stale) ou ainda na RLS/policy.

**Atualização (2026-08-08):** numa reprodução mais recente, o erro `"base nao encontrada"`
não apareceu mais — a pergunta passou pelo Agente Z, Agente A, achou o dataset e chegou em
`handleExecutePlan`, que falhou com um 403 **diferente**: `"executor respondeu 403"`, vindo da
própria AWS (Function URL do Lambda), não do Supabase. Diagnosticado e corrigido: a Function
URL com `AuthType=AWS_IAM` não ficava autorizada só com a policy de identidade
`lambda:InvokeFunctionUrl` em `plum-edge-invoker` (mesmo o IAM Policy Simulator confirmando
"allowed" pra essa ação isolada, a chamada real via `aws4fetch` continuava recebendo
`403 Forbidden` direto da AWS, antes do Lambda rodar — confirmado pelo CloudWatch do Lambda
não ter nenhum log da tentativa). Faltavam **duas** coisas, nunca provisionadas: a ação
`lambda:InvokeFunction` (além de `InvokeFunctionUrl`) na policy de identidade, e uma
resource-based policy no próprio Lambda (`aws lambda add-permission`) — `provision.sh` e
`valores-supabase.sh` foram corrigidos para provisionar as duas em deploys futuros. Este item
some do jeito que estava descrito (o "base nao encontrada" não reproduz mais na mesma
sequência de testes), mas fica aberto até confirmar em produção que `execute_plan` completa
de ponta a ponta sem nenhum 403, em qualquer camada.

**Confirmado (2026-08-08):** ao longo desta mesma data, `execute_plan` completou de ponta a
ponta múltiplas vezes sem 403 em nenhuma camada (ver os logs de Lambda capturados em
`test_data/test_errors/test_error_2.txt` e `test_error_3.txt`, ambos com `POST /execute 200`).
O que restava de "não encontrado" no chat era outra causa — investigada e documentada em
`docs/fases dashboard/2026-08-08-fase-3-e2e-do-chat-e-remocao-do-k-anonimato.md` — e o usuário
confirmou o chat funcionando ao final da sessão. Item fechado.

---

## 9. Migrar o endereço público para `plum-polijunior.com.br`

**O quê:** hoje a plataforma é servida pela URL autogerada da Vercel,
`https://plataforma-plum-gules.vercel.app`. O endereço definitivo deveria ser
`plum-polijunior.com.br`. Migrar significa: adicionar o domínio no projeto da Vercel,
apontar o DNS para lá, e então trocar **três** lugares que precisam concordar entre si.

**Os três lugares (têm que mudar juntos, senão o SSO quebra):**

1. Supabase → Authentication → URL Configuration → **Site URL**
2. Supabase → Authentication → URL Configuration → **Redirect URLs** (a allowlist)
3. `supabase/functions/send-auth-email/index.ts` → constante `SITE_URL`, usada nos 4 botões
   dos e-mails transacionais

**Por quê não agora:** `plum-polijunior.com.br` **não aponta para a Vercel**. Verificado em
2026-08-09: o apex e o `www` respondem `Server: hcdn` (Hostinger), com IPs distintos entre si,
enquanto `plataforma-plum-gules.vercel.app` responde `Server: Vercel`. Ou seja, o domínio
bonito serve outro site. Apontar o Site URL para ele hoje faria o callback do OAuth cair numa
página sem aplicação — o SSO quebraria de novo, com outro sintoma.

**Contexto — como isso apareceu:** um login por SSO estava terminando em
`http://localhost:3000/#access_token=...` com `ERR_CONNECTION_REFUSED`. Causa: o Site URL
nunca saiu do padrão de fábrica do Supabase (`http://localhost:3000`), e como o `redirectTo`
pedido pelo `Auth.tsx` não estava na allowlist, o Supabase descartava o `redirectTo` e caía no
Site URL. Ao investigar, apareceu a divergência de domínio: o `SITE_URL` do `send-auth-email`
apontava para `plum-polijunior.com.br`, então os 4 botões dos e-mails ("Acessar o Plum",
"Aceitar Convite", "Ver solicitação") levavam para a Hostinger, não para o produto. Isso já
estava quebrado antes e ninguém tinha notado. A correção de 2026-08-09 alinhou os três lugares
na URL da Vercel, que é a que funciona hoje.

**Cuidado ao migrar:** `plum-polijunior.com.br` é o domínio verificado no Resend, usado no
`from: 'Plum <contato@plum-polijunior.com.br>'` (`send-auth-email:182`). Esse campo é do
remetente de e-mail e **não deve** mudar junto — ele já está certo. O que muda é só para onde
os links apontam.

**Risco de não fazer:** a URL da Vercel é derivada do nome do projeto. Se alguém renomear o
projeto na Vercel, ela muda e o SSO quebra de novo, silenciosamente, do mesmo jeito.

**Depende de / bloqueado por:** decidir o que acontece com o site que está hoje na Hostinger
nesse domínio (fica num subdomínio? sai?), e uma janela para a propagação de DNS.

---

## 10. Renomear a rota `/dashboard`, que não é um dashboard

**O quê:** `/dashboard` (`src/pages/Dashboard.tsx`, 1007 linhas) é a tela de **gestão da
organização** — membros, cargos, aprovações, matriz de permissões. Não mostra nenhum dado do
cliente. O nome deveria ser `/organizacao` ou equivalente.

**Por quê:** com a Página Inicial (`/inicio`) virando o dashboard de verdade, ter uma rota
chamada `/dashboard` que não é o dashboard é uma armadilha permanente para quem chega no
código. Já custou tempo de leitura mais de uma vez.

**Os lugares que precisam mudar juntos** (é isso que torna a mudança não-trivial):

1. `src/App.tsx` — a `<Route>`
2. `src/layouts/DashboardLayout.tsx` — o `<Link to="/dashboard">` e as duas comparações
   `location.pathname === "/dashboard"` da linha 71
3. `src/pages/Auth.tsx` — **três** redirecionamentos: `:90`, `:111` e `:244`. O de `:111` é o
   `redirectTo` do **OAuth**, e o valor precisa estar na allowlist de Redirect URLs do
   Supabase (Authentication → URL Configuration), que **não é versionada**

**Por que não agora:** o item 3 é o mesmo tipo de configuração fora do repositório que já
quebrou o SSO uma vez (ver item 9 deste arquivo: o Site URL que nunca saiu de
`http://localhost:3000`). Trocar a rota sem atualizar a allowlist faz o login por SSO cair
numa página inexistente, com sintoma confuso. É barato de fazer e caro de fazer errado, então
merece uma janela própria e não pode pegar carona numa fase de dashboard.

**Contexto:** decisão D3 do plano da Fase 4
(`docs/fases dashboard/2026-08-10-fase-4-PLANO-pagina-inicial.md`). A Página Inicial nasce em
`/inicio` justamente para não depender disto.

**Depende de / bloqueado por:** nada técnico. Só de alguém abrir a allowlist do Supabase na
mesma janela em que troca as rotas, e testar um login por SSO depois.

---

## 11. `sheets.py` compara o cabeçalho CRU contra o nome normalizado

**O quê:** `_ranges_for` (`query_engine/sheets.py`) casa as colunas pedidas contra o cabeçalho
da planilha por comparação **literal**:

```python
for idx, h in enumerate(headers):
    if h in faltando:      # h vem cru, só com .strip()
```

E o docstring da própria função, três linhas acima, afirma o contrário:

> *"A comparação é feita no nome **normalizado** do cabeçalho, do mesmo jeito que o onboarding
> normaliza ao montar o schema_metadata."*

**O comentário descreve a intenção; o código não a implementa.** É assim que isto sobreviveu:
quem lê o docstring conclui que está resolvido.

**Por quê importa:** o onboarding normaliza para `snake_case` ao montar o `schema_metadata`
(`DatabasePipeline.tsx`), mas **o Plum nunca escreve na planilha do cliente** (invariante R-01).
Então o cabeçalho continua sendo `Status do Pedido`, `Valor Total (R$)`, `Vendedor(a)` — e o
executor procura `status_do_pedido`, `valor_total_r`, `vendedor_a`. Nunca casa.

**Alcance:** toda planilha com cabeçalho legível por humano. Isso inclui **qualquer Google
Sheets em português** e **todo CSV/XLSX importado com cabeçalho original**. As bases que hoje
funcionam funcionam por coincidência: o arquivo de origem já estava em `snake_case`.

**Como foi encontrado:** na Etapa 0 da Fase 4 do dashboard (2026-08-10), subindo
`testes/chat/bases/vendas_loja_roupas_teste.csv` para o Sheets. Resposta do executor, HTTP 200:

> `"A planilha nao tem a(s) coluna(s): status_do_pedido, valor_total_r."`

Contornado renomeando a linha 1 da planilha à mão para os nomes normalizados.

**NÃO é o mesmo bug do `gid` da aba,** corrigido em `a334d99` — aquele era *qual aba ler*, este
é *qual coluna casar dentro da aba*. Confirmado em 2026-08-11, depois daquele merge, que
`_ranges_for` continua comparando cru.

**Contras de consertar:** a normalização precisa ser **exatamente** a mesma do front, que hoje
vive em TypeScript (`DatabasePipeline.tsx`). Duas implementações da mesma regra em linguagens
diferentes divergem — é a mesma armadilha que `_shared/query_plan.ts` documenta para o Query
Plan. Uma saída melhor seria o onboarding gravar também o nome ORIGINAL de cada coluna no
`schema_metadata`, e o executor casar por ele: aí não existe normalização em dois lugares,
existe um mapa gravado uma vez.

**Depende de / bloqueado por:** decisão de quem cuida do `query_engine` sobre qual das duas
saídas seguir. Enquanto isso, **o onboarding deveria avisar** quando o cabeçalho da planilha
não bate com o schema — hoje o erro só aparece na primeira pergunta, muito depois.

---

## 12. Planilha em local errado troca dia com mês, e o Plum não tem como perceber

**O quê:** quando um CSV brasileiro (`05/01/2026`) é importado para uma planilha do Google
cujo **Local** é Estados Unidos, o Sheets lê a data como *month-first* e grava o número de
série de **1º de maio**. Dias de 1 a 12 ficam trocados; de 13 em diante o Sheets não consegue
ler como mês e acerta por acidente.

**Por quê é sério:** **12 dos ~30 dias de todo mês ficam errados, em silêncio.** E não é um
número que falta — é um número **trocado**, com cara de resposta certa. Atinge o chat e o
dashboard igualmente, porque o dado já está errado na origem.

**Por quê o Plum não detecta:** o serial gravado é legítimo. Ele aponta para 1º de maio de
verdade. Não existe, do lado de cá, nada que distinga "1º de maio" de "1º de maio escrito
errado". Todas as camadas fazem a coisa certa com um dado errado.

**Medido em produção, 2026-08-11:** a bateria da Fase 4 do dashboard pediu o faturamento de
12–16/01 sobre `testes/chat/bases/vendas_loja_roupas_teste.csv`. Gabarito R$ 2.387,92;
o executor devolveu R$ 1.626,57 — exatamente a soma de 13 a 16, com o dia 12 (R$ 761,35) fora.
Um card agrupando por data mostrou `01/12/2026` no lugar de `12/01/2026`, e o mesmo padrão em
05, 06, 07, 08 e 09 de janeiro. Trocado o Local da planilha para Brasil e reimportado, o card
passou a devolver R$ 2.387,92.

**O que NÃO é a causa** (hipóteses levantadas e derrubadas, para ninguém refazer o caminho):

- `_fmt_data` (`pandas_executor.py:626-639`) está correto: `origin="1899-12-30"`, e
  `dayfirst=True` por padrão.
- Os `params` da `formatting_rule` estavam **vazios**, então `dayfirst` não foi desligado pelo
  Agente 3.
- `between` em coluna de data é inclusivo nos dois extremos (`:525`).
- O Query Plan gerado pelo agente estava correto: `between` com `["2026-01-12","2026-01-16"]`.

**Saídas possíveis, nenhuma trivial:**

1. **Avisar no onboarding.** Ao conectar a planilha, comparar as 5 primeiras datas lidas pelo
   executor com as 5 primeiras do arquivo que o navegador leu. Divergiu, avisa antes de
   finalizar. É o único momento em que as duas versões existem lado a lado.
2. **Detectar a suspeita.** Uma coluna de data cujos valores nunca passam do dia 12 é quase
   certamente uma coluna trocada. Heurística, não prova — mas um aviso vale mais que silêncio.
3. **Documentar** no material de onboarding: "configure o Local da planilha como Brasil antes
   de importar". Barato e insuficiente sozinho, porque depende de alguém ler.

**Depende de / bloqueado por:** decisão de quem cuida do onboarding (`ai-agents` /
`DatabasePipeline.tsx`). A saída 1 é a única que pega o caso de verdade, e é justamente a que
exige trabalho no pipeline de importação.


---

## 13. A escala do percentual é ambígua, e hoje quem chuta é a tela

**O quê:** o executor devolve percentual como está na planilha, e há duas origens
legítimas para a mesma ideia de "10%":

| Origem | O executor recebe |
|---|---|
| Célula formatada como porcentagem no Sheets | `0.1` (fração) |
| Texto `"10%"` numa célula comum | `10` (pontos) — `_fmt_percentual` tira o `%` |

Nada no `formatting_rule` distingue as duas: o `type` informa **que** é percentual,
não em **que escala**. É a mesma família da dívida do `query_engine/urgent.md`.

**Medido em 2026-08-11:** o card "Desconto médio" da base sintética mostrou **0,05%**
onde o gabarito diz **5,00%**. O Sheets guardara os descontos como fração.

**Mitigação aplicada, e é um chute:** `src/components/dashboard/formato.ts` assume
fração quando o valor é `< 1` e multiplica por 100. Resolve o caso comum e **falha
numa base cujos percentuais sejam todos abaixo de 1%** — 0,3% de taxa viraria 30%.

**Por que a tela é o lugar errado:** ela vê um agregado, um número só. O executor vê
a **coluna inteira**. Decidir a escala olhando 40 valores é qualitativamente mais
confiável que olhar uma média — e ali dá para usar sinais melhores que magnitude,
como todos os valores estarem no intervalo [0,1].

**E o chat tem o mesmo problema, sem nem a mitigação:** perguntar "qual o desconto
médio" devolve o número cru para o Agente C, que o repassa como veio.

**Saída proposta:** `_fmt_percentual` (`query_engine/pandas_executor.py`) normaliza a
coluna para pontos percentuais na ingestão. Aí o executor sempre emite uma escala só,
o front só acrescenta o `%`, e a heurística morre — inclusive a do chat.

**Depende de / bloqueado por:** é `query_engine`, compartilhado com o chat. Merece o
mesmo cuidado da Fase 4: plano curto antes, e teste dos dois lados.
