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

## 8. Investigar o 403 "base nao encontrada" em `execute_plan` (chat)

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
