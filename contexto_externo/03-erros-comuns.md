---
status: vigente
camada: roteador
atualizado_em: 2026-09-18
---

# Erros comuns — as crenças falsas que esta tese produz

> **O que este arquivo é:** o que quase todo mundo assume errado sobre o Plum Externo, com a
> verdade ao lado. É o arquivo de maior retorno por linha desta pasta.
> **Como usar:** leia inteiro uma vez. Depois volte quando algo "parecer óbvio".

---

### ❌ "Os usuários do Plum Externo são pessoas de fora da empresa."
✅ **Na Helisul são funcionários** — pilotos, motoristas, mecânicos. O que eles não têm é **login
no Cavok, no Onfly e no Paytrack**. ⭐ **A fronteira do "externo" é o sistema, não a organização.**
Errar isso muda a conversa de LGPD inteira e acende o alarme do TI logo na primeira frase.
B2B2C de verdade (o cliente final da empresa) é extensão, não é o caso implementado.

### ❌ "A arquitetura já está 90% pronta para a tese externa."
✅ **90% da doutrina, não do código.** Verificado em 2026-09-18: o `central-platform/` descrito no
PRD da Helisul **não existe neste repositório**. Aquele sistema lê API REST de terceiros, roda
FastAPI e identifica por telefone; este repo lê Google Sheets, roda Supabase e identifica por
JWT. São dois produtos com o mesmo nome. Ver `12-visao-tecnologica.md`.

### ❌ "O executor bloqueia linha bruta, então o porteiro exige inverter um invariante."
✅ **Não exige — o mecanismo já existe** (conferido no código em 2026-09-18). O `ad_hoc` tem os
tipos **`registro`** (até 5 linhas, **exige `where`**) e **`amostra`** (até 5 linhas quaisquer,
sem `where`), com orçamento implementado em `_shared/orcamento.ts`: 200 linhas por pessoa, por
base, por dia. `RawRowsBlocked` é o default para quem não declara um desses tipos.
⛔ **O que falta é uma peça só, e é de segurança:** hoje o `where` do `registro` é **escrito pelo
planejador**. No porteiro, o filtro de titular tem de ser **injetado pelo servidor** — senão o
usuário digita *"mostra a escala do João"* e o modelo obedece. Ver `12-visao-tecnologica.md` §4.

### ❌ "O RBAC já está pronto, é só usar."
✅ Existe **RBAC de coluna** (que campos se vê). Falta **RBAC de linha** (quais registros são
seus). O porteiro precisa dos dois, e o segundo não existe.

### ❌ "O telefone identifica a pessoa com segurança."
⚠️ O telefone identifica o **aparelho**. A tabela `telefone → pessoa` é que identifica a pessoa —
e ela é a **chave-mestra de todo o modelo de permissão**. Um `UPDATE` errado ali dá a uma pessoa
o acesso de outra **sem gerar erro nenhum**. Operadora recicla número; funcionário é desligado e
continua na tabela. Ver `12-visao-tecnologica.md` §titular.

### ❌ "A Helisul valida o produto."
✅ A Helisul valida **a tese**. O código é outro, o canal é outro e as fontes são outras. É
evidência forte de que existe mercado — não é evidência de que o que está neste repositório
funciona para esse mercado.

### ❌ "O Plum economizou 540 atendimentos por mês na Helisul."
⛔ **Não está medido.** O `PRD_Helisul_v1.md` §1.3 registra *"542 **usuários** atendidos no mês"*
(junho/2026) — usuários, não atendimentos desviados — e marca a métrica de deflexão como lacuna
aberta (Q-01), com a própria dúvida no texto: *"~10 mensagens (automatizadas ou humanas ou
total?)"*. Naquele documento a fase de desenvolvimento ainda constava como não iniciada.
⚠️ **Até haver medição de produção, 542 é o tamanho do problema, não o tamanho do resultado.**
Usar como resultado em material de venda é a mesma categoria de erro que atribuir a si um case
de terceiro.

### ❌ "Conector é parte da plataforma."
✅ **É implementação** (D-E-002). Impossível prever o sistema do cliente. O que é plataforma é o
**contrato** que todo conector obedece — `13-contrato-do-conector.md`.

### ❌ "Integrar o WhatsApp é só plugar a EvolutionAPI."
⚠️ É gateway **não-oficial** — dirige o WhatsApp Web, não a Cloud API da Meta. Traz risco de
banimento do número, sem SLA e sem recurso. É a escolha certa para **piloto** e a errada para
operar sob contrato. A condição de migração precisa ser decidida antes, não depois da primeira
suspensão.

### ❌ "Se a fonte não responder, a gente responde o que tem."
⛔ **Fonte indisponível é erro, nunca resposta vazia.** Resposta vazia vira *"você não tem escala
amanhã"* — que é pior que não responder, porque o piloto acredita. Ver R-E-04.

### ❌ "O resumo que a IA fez do documento é o contexto."
⚠️ É conteúdo **gerado por IA que virou fonte de verdade**, e passa a responder cliente. Precisa
da mesma revisão humana que o dicionário exige. E o trecho citado na resposta tem de ser
**recuperado literalmente** do documento — resumo serve para achar, não para citar.

### ❌ "O Plum substitui a central de atendimento."
✅ Ele **esvazia a fila** dela. Vender como corte de headcount cria inimigo interno — e a central
é justamente quem opera o console e quem pode sabotar a adoção. A central passa a tratar o que é
difícil.

### ❌ "O modo do `CLAUDE.md` desliga o código da outra tese."
✅ O modo governa **documentação e decisão de produto**. `src/`, `supabase/functions/` e
`query_engine/` servem às duas teses e estão **sempre** no escopo.
