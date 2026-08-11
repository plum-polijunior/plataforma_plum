# Entrada no produto e o guardião do dashboard

**Data:** 2026-08-11 · **Branch:** `plataforma` · **Estado:** tudo no ar em commit
(`b486afe`..`527d19f`). **Edge Function `dashboard-agent` ainda não publicada** — ver
"Lacunas e pendências" no fim.

Dois blocos de trabalho sem relação técnica entre si, feitos no mesmo dia. O primeiro é a
tela de entrada; o segundo é um agente que faltava no `dashboard-agent`. Ficam no mesmo
documento porque foram a mesma sessão, não porque se tocam.

---

## Parte 1 — A tela de entrada

### 1.1 Contexto

Três coisas na `src/pages/Auth.tsx` tratavam eventos de frequências muito diferentes como se
fossem equivalentes.

**Onde o login pousava.** Os três caminhos de entrada — senha, SSO e criação de organização —
mandavam o usuário para `/dashboard`, que é a tela "Minha Organização": código de convite,
aprovação de membros, matriz de cargos. Administração. A Página Inicial (`/inicio`), o mural
de cards que responde "como está o negócio hoje", existia desde a Fase 4 mas ninguém caía
nela ao entrar.

**A escolha inicial.** A primeira tela do `/auth` mostrava dois cartões lado a lado, de mesmo
tamanho e mesmo peso visual: "Entrar" e "Nova Organização". Só que criar uma organização
acontece **uma vez na vida da empresa**, e entrar acontece milhares de vezes. Dar o mesmo
espaço aos dois faz o caminho comum custar uma decisão que não precisava existir.

**A escolha dentro do "Entrar".** Depois de clicar em "Entrar", vinha uma **segunda** tela de
escolha, com o mesmo problema: "Já sou usuário" e "Primeiro acesso", também lado a lado,
também de mesmo peso. Duas decisões empilhadas antes de qualquer campo de texto aparecer.

**Sem retorno na validação.** O botão "Entrar com Email" estava sempre visível e sempre
clicável. Uma senha curta ou um e-mail sem `@` só falhava depois do clique, no servidor.

### 1.2 O que mudou

O login agora pousa em `/inicio` nos três caminhos. `/dashboard` continua existindo e
continua acessível pela barra lateral — deixou de ser o destino padrão, não foi removido.

A primeira tela ficou com **um** cartão "Entrar", centralizado, e abaixo dele um botão
secundário: *"Sua empresa ainda não usa o Plum? Crie uma organização agora!"*. O caminho raro
continua a um clique de distância, mas não disputa mais atenção com o caminho comum.

A segunda tela de escolha foi **removida**. Clicar em "Entrar" agora leva direto ao
formulário: SSO (Google/Microsoft), depois e-mail e senha. "Primeiro acesso" virou um botão
abaixo do formulário, e leva ao fluxo de código de convite que já existia.

Os dois blocos ganharam títulos — "Já possui uma conta?" e "Ainda não possui conta?" — para
que a segunda opção não pareça continuação do formulário de cima.

Sobre estilo: "Primeiro acesso" recebeu o mesmo desenho de "Entrar com Email" (botão primário
de largura total), e o botão de criar organização recebeu o mesmo desenho do "Entrar no Plum"
do cabeçalho da landing (`variant="hero"` com a borda em gradiente de `Header.tsx`). Nenhum
estilo novo foi inventado: os dois reaproveitam o que o sistema de design já tinha.

Por fim, o botão "Entrar com Email" **só é renderizado** quando o e-mail casa com
`/^[^\s@]+@[^\s@]+\.[^\s@]+$/` e a senha tem 6 caracteres ou mais. E, para que a ausência do
botão não vire um mistério, cada campo mostra o próprio erro assim que o usuário digita algo
inválido:

> O email precisa ter um @ e um domínio (ex.: nome@empresa.com).
> A senha precisa ter pelo menos 6 caracteres.

### 1.3 Como validar

Verificado em navegador headless (Playwright, Chromium) contra o Vite local, sem nenhum erro
de console em nenhum dos estados. Para reproduzir: `npm run dev`, abrir `/auth` e conferir

1. tela inicial: um cartão "Entrar" centralizado + o link de criar organização abaixo;
2. clicar em "Entrar": vai direto ao SSO + formulário, **sem** a tela "Já sou usuário";
3. formulário vazio ou com `foo` / `123`: sem botão "Entrar com Email", com os dois erros
   em vermelho sob os campos;
4. `foo@example.com` / `123456` (exatamente 6): os erros somem e o botão aparece;
5. "Primeiro acesso" abre o código de convite; "Voltar" retorna ao formulário.

O pouso em `/inicio` precisa de uma conta real — não dá para exercitar com o Supabase local
sem sessão.

---

## Parte 2 — Agente Z-dash, o guardião que faltava

### 2.1 Contexto

O chat (`ai-plum-chat`) tem um porteiro desde sempre: o **Agente Z** classifica a pergunta
antes de qualquer coisa cara acontecer, e o próprio prompt dele cita "Revolução Francesa"
como exemplo do que bloquear.

O `dashboard-agent`, que constrói cards a partir de uma pergunta digitada em "Novo card",
**não tinha equivalente nenhum**. Qualquer frase ia direto para o prompt inteiro de
`INSTRUCAO_CARD` (~1.400 tokens) somado ao `schema_metadata` da base.

O desperdício de tokens era o menor dos problemas. O pior caso não era erro: como o prompt
obriga o modelo a preencher `title`, `viz` e `query_plan`, uma pergunta fora de contexto
tende a produzir um card **estruturalmente válido** — o modelo pega uma coluna real qualquer,
monta uma agregação legítima, e devolve um número verdadeiro sob um título que não tem nada a
ver com o negócio. Esse card passa pela TRAVA 1 (coluna existe), passa pela TRAVA 2 (`viz`
válido), roda no executor de verdade e chega à prévia com o botão "Publicar" habilitado.
Um número correto respondendo a uma pergunta que ninguém fez, pronto para ir ao mural da
organização inteira.

### 2.2 O que mudou

Um segundo agente entrou antes do primeiro, dentro da mesma ação `gerar_card`. Os dois agora
têm nome:

| Agente | Papel | Entrada | Saída |
|---|---|---|---|
| **Z-dash** | escopo | só a pergunta | `{status: PERMITIDO\|BLOQUEADO, motivo}` |
| **Tarsila do Amaral** | planejador (já existia) | pergunta + `schema_metadata` | `{title, viz, higher_is_better, query_plan}` ou `{erro}` |

Três decisões que valem o registro:

**O Z-dash não recebe `schema_metadata`.** É o que mantém a etapa barata — o `schema_metadata`
é a parte que mais cresce do payload, e mandá-lo duas vezes apagaria a economia inteira. Ele
também não precisa: "isto tem a ver com medir dados de uma empresa?" tem resposta certa sem
saber que colunas a base tem. Por isso o enum dele é **binário**, sem o `INVIAVEL` do chat —
viabilidade já é checada duas vezes depois (regra 1 do prompt do Tarsila, e a TRAVA 1 no
cliente), e uma terceira opinião mais fraca sobre a mesma pergunta só criaria divergência.

**O prompt manda errar para o lado de deixar passar.** A linha "NA DÚVIDA, PERMITIDO" é
deliberada. Um falso bloqueio é um beco sem saída num diálogo que não tem conversa para
recuperar; um falso "permitido" custa uma chamada normal, que já sabe devolver `{erro}`.

**Fail-open em tudo.** Rede, timeout de 6s, cota, JSON inválido, status desconhecido: qualquer
coisa que não seja um `BLOQUEADO` explícito e bem-formado deixa a pergunta seguir. Isto é
economia de custo, não controle de segurança — quem protege dado é o RBAC do
`executar_previa`, que não foi tocado. Fechar aqui transformaria um soluço do Gemini em "o
produto parou de criar cards", e ainda mascararia a mensagem específica de cota que o Tarsila
já sabia produzir.

O bloqueio reaproveita o contrato `{card: {erro}}` que o `NovoCardDialog` já renderizava, o
que significa **zero mudança no front-end**.

### 2.3 O custo, dito abertamente

O guardião é **uma requisição Gemini a mais em toda geração de card**. A cota do Gemini é por
requisição, não por token — então a quantidade de cards que uma organização consegue criar
por dia **cai pela metade**. O risco R17, no plano da Fase 4, registra que a cota já estourou
de verdade em 2026-08-10 e derrubou o chat.

A troca foi aceita conscientemente: o que se compra é a impossibilidade estrutural do card
sem sentido publicável. Se a cota voltar a apertar, a alternativa sem requisição extra é
acrescentar uma regra de "fora de escopo" ao `{erro}` que o `INSTRUCAO_CARD` já sabe devolver
— mais barato, e mais frágil, porque a recusa passa a depender da oitava regra de um prompt
gigante em vez de um `response_schema` fechado.

### 2.4 Logs

Antes, o `dashboard-agent` registrava pouco: o card final e os erros. Agora segue o padrão do
chat — uma linha com a resposta **inteira** de cada agente, marcada com o nome dele:

```
[gerar_card/z-dash] {"status":"BLOQUEADO","motivo":"conhecimento geral, não é dado da empresa"}
[gerar_card/z-dash] respondido sem response_schema.        (só quando degradou)
[gerar_card/tarsila] recuperado na tentativa 2.            (só quando o JSON veio na retentativa)
[gerar_card/tarsila] {"title":"Faturamento por loja","viz":"bar",...}
```

As tags são greppáveis pela ação (`gerar_card`) ou pelo agente, já que os dois rodam dentro da
mesma ação.

**A pergunta crua não vai para o log**, em nenhum dos dois. A D4 decidiu deixar
`origin_question` como `NULL` no banco porque é texto livre que a pessoa digita sem pensar —
reintroduzi-la pelo log seria contornar a mesma decisão por outra porta. O que se registra é
o `motivo` escrito pelo modelo e o card resultante, que basta para reconstruir por que um card
saiu como saiu.

---

## Resumo estruturado

### Task: pouso do login na Página Inicial

1. **O que foi feito** — os três caminhos de entrada de `Auth.tsx` (senha, SSO,
   criação de organização) passaram a redirecionar para `/inicio` em vez de `/dashboard`.
2. **Decisão técnica** — `/dashboard` é "Minha Organização", tela de administração;
   `/inicio` é o mural de cards. A maioria dos logins não quer administrar. Não foi criada
   constante compartilhada: são três `window.location.href` independentes, e isso é uma
   pegadinha registrada em CLAUDE.md §7 (mexeu em um, mexa nos três).
3. **Integrações tocadas** — N/A (só roteamento no cliente).
4. **Safeguard** — N/A.
5. **Como validar** — entrar com uma conta real e conferir a URL final.
6. **Lacunas e pendências** — [LACUNA: os três destinos continuam duplicados como literais —
   quem resolve: próxima pessoa que mexer em `Auth.tsx` — D.O.D.: uma constante única
   importada pelos três pontos.]

### Task: hierarquia da tela de entrada

1. **O que foi feito** — "Entrar" virou cartão único centralizado com link secundário para
   criar organização; a tela de escolha "Já sou usuário / Primeiro acesso" foi removida e o
   formulário passou a aparecer direto, com "Primeiro acesso" abaixo dele; títulos "Já possui
   uma conta?" e "Ainda não possui conta?" separam os dois blocos.
2. **Decisão técnica** — frequência decide hierarquia: criar organização é evento único na
   vida da empresa, login é diário. Estilos reaproveitados do que já existia (`variant="hero"`
   de `Header.tsx`, botão primário de largura total), nenhum estilo novo.
3. **Integrações tocadas** — N/A.
4. **Safeguard** — N/A.
5. **Como validar** — passos 1 e 2 de §1.3.
6. **Lacunas e pendências** — N/A.

### Task: validação com retorno visível no login

1. **O que foi feito** — "Entrar com Email" só é renderizado com e-mail válido e senha de 6+
   caracteres; cada campo mostra o próprio erro em vermelho assim que recebe algo inválido.
2. **Decisão técnica** — a regra da senha nasceu como `> 6` e foi corrigida para `>= 6`, um
   caractere mais estrita do que o pretendido. Esconder o botão sem explicar o porquê seria
   pior do que deixá-lo falhar: por isso os erros inline vieram junto, não depois.
3. **Integrações tocadas** — N/A (validação local; o servidor continua sendo a autoridade).
4. **Safeguard** — N/A. Isto é conveniência de interface, não barreira: o Supabase continua
   validando credencial do lado dele.
5. **Como validar** — passos 3 e 4 de §1.3.
6. **Lacunas e pendências** — [LACUNA: o cadastro de novo membro e a criação de organização
   não ganharam o mesmo retorno inline — quem resolve: não atribuído — D.O.D.: mesmos dois
   erros aplicados aos formulários de `signup` e `criar organização`.]

### Task: Agente Z-dash

1. **O que foi feito** — guardião de escopo em `dashboard-agent`, rodando antes do prompt
   caro dentro de `gerar_card`; o planejador que já existia passou a se chamar Agente Tarsila
   do Amaral.
2. **Decisão técnica** — implementação **isolada** no próprio arquivo, sem módulo
   compartilhado em `_shared/`, respeitando a decisão D1 registrada no cabeçalho do arquivo
   ("prompt próprio, propósito próprio"). Descartada a alternativa de extrair um
   `_shared/scope_guard.ts` reutilizável pelos dois agentes: teria dado cobertura de teste via
   vitest, mas exigiria reinterpretar uma decisão que veio de orientação do gerente, não de
   raciocínio técnico da equipe. Sem `schema_metadata` e sem `INVIAVEL`, pelos motivos em §2.2.
   Fail-open por decisão explícita.
3. **Integrações tocadas** — Gemini (`gemini-3.5-flash`, `temperature 0.1`,
   `response_schema` fechado). Nenhum schema de banco, nenhum endpoint novo, nenhuma mudança
   no contrato com o front (`{card: {erro}}` reaproveitado).
4. **Safeguard** — o defeito era um card estruturalmente válido e semanticamente sem sentido
   chegar publicável ao mural da organização (§2.1). O novo código impede porque a recusa não
   depende mais de o modelo escolher devolver `{erro}` no meio de um prompt de 80 linhas: é um
   enum de dois valores com decodificação restringida por gramática, avaliado antes de o
   planejador existir na conversa.
5. **Como validar** — `npx supabase functions serve dashboard-agent --no-verify-jwt
   --env-file <arquivo com GEMINI_API_KEY>` e `curl` com `action: "gerar_card"` para:
   "faturamento por loja" (PERMITIDO, card completo); "faturamento" sozinho (PERMITIDO — testa
   o viés "na dúvida"); "me resuma a revolução francesa" (BLOQUEADO, e **sem** linha
   `[gerar_card/tarsila]` no log, que é a prova de que a chamada cara não aconteceu);
   "oi, tudo bem?" (BLOQUEADO); pergunta pedindo agrupamento por mês (PERMITIDO no guardião,
   `{erro}` no Tarsila — prova que o guardião não absorveu a viabilidade); e uma chave inválida
   só no guardião, para confirmar que o fluxo continua em vez de travar.
6. **Lacunas e pendências** — [LACUNA: nada disto foi executado de verdade — quem resolve:
   próxima sessão com acesso a `GEMINI_API_KEY` — D.O.D.: os seis casos acima rodados e o
   comportamento conferido nos logs.] [LACUNA: a função **não foi publicada** — quem resolve:
   próxima sessão — D.O.D.: `npx supabase functions deploy dashboard-agent --project-ref
   rjwidarrsykufuifzunu` com `ezbr_sha256` mudando, conforme CLAUDE.md §9.] [LACUNA: nenhuma
   cobertura automatizada — quem resolve: não atribuído — D.O.D.: o guardião vive dentro da
   Edge Function, fora do que o `vitest.config.ts` alcança; só entra em teste se um dia virar
   módulo em `_shared/`.]

### Task: logs dos dois agentes

1. **O que foi feito** — tags `[gerar_card/z-dash]` e `[gerar_card/tarsila]`, cada uma
   registrando a resposta completa do seu agente; aviso quando o guardião degradou para sem
   `response_schema`; "recuperado na tentativa 2" no planejador.
2. **Decisão técnica** — copiado o padrão do `ai-plum-chat`, que loga a resposta inteira de
   cada agente numa linha marcada com o nome. A pergunta crua fica de fora, pela D4 (§2.4).
3. **Integrações tocadas** — N/A.
4. **Safeguard** — N/A.
5. **Como validar** — as mesmas chamadas da task anterior; conferir as quatro formas de linha
   listadas em §2.4 nos logs do `functions serve` ou no painel do Supabase depois do deploy.
6. **Lacunas e pendências** — N/A.

---

## Achados da revisão, já corrigidos

A revisão de código do Z-dash levantou quatro pontos; três viraram correção no mesmo dia e
estão no commit `527d19f`/`9b309ce`:

- **Privacidade.** A primeira versão logava a pergunta crua no caso BLOQUEADO. Contradizia a
  D4 diretamente. Passou a logar só o `motivo`.
- **Sem retentativa sem schema.** O chat repete a chamada sem `response_schema` quando a API
  devolve 400 (`ai-plum-chat/index.ts`), justamente porque "o endurecimento não pode ser o que
  derruba o guard". O Z-dash não tinha isso — um 400 de schema o teria transformado num no-op
  permanente que ainda gastaria uma requisição por card. Corrigido.
- **`clearTimeout` inalcançável.** Ficava depois do `fetch`; quando o `fetch` rejeita por erro
  de rede (não abort), o timer de 6s ficava pendurado. Foi para um `finally`.

O quarto ponto foi o custo de cota descrito em §2.3 — não é defeito, é a troca escolhida, e
está registrada aqui e em CLAUDE.md §5 em vez de corrigida.
