# ▶ Próximo passo — onde o remake parou

**Atualizado:** 2026-08-21, com o B10 escrito · **Leia isto primeiro ao retomar.**

Este arquivo existe porque o agendador do Claude Code morre junto com a sessão: um lembrete só
sobrevive se estiver no repositório. Ele é sempre reescrito por inteiro — não é histórico, é estado.
O histórico está nos `DIARIO.md` de cada bloco.

---

## 👤 A fila, em ordem

### 1. ⚠️ Publicar o Lambda e o `ai-plum-chat` — está atrasado quatro blocos

```bash
npx supabase functions deploy ai-plum-chat --project-ref rjwidarrsykufuifzunu
```

**B07-bis, B09, B10 e agora o B12 estão commitados e não estão no ar.** O B12 publica **Lambda
também** — `git push` primeiro, Action `query-engine` verde, e só então o deploy abaixo. O roteiro
completo está em `execucao/B12-ler-a-planilha/MANUAL.md`. Confirme pelo `ezbr_sha256` (receita em
`supabase/functions/README.md`), nunca pelo `version`.

⚠️ **No B10 esse deploy virou obrigatório e urgente.** O Lambda já aceita `registro`/`amostra`; quem
conta as linhas contra o orçamento é a Edge Function. Entre o push e este deploy, **o teto de 200
linhas por dia não existe** — só o de 5 por pedido, que sozinho não protege nada (200 pedidos de 5
linhas é a base inteira).

### 2. Seguir o `MANUAL.md` do B10

`zz_remake_implementation/execucao/B10-registro-amostra/MANUAL.md`. O passo que mais importa é o
**4**: forçar a negação e confirmar que a agregação continua respondendo. Se ela parar junto, o
orçamento está cobrando de quem não devolve linha.

### 3. Seguir o `MANUAL.md` do B07 — ainda não foi feito

⭐ **É o bloco em que o remake passa a RESPONDER**, e agora sem rede: com a chave ligada, **só** o
`ad_hoc` responde. Não há mais queda para o legado — decisão sua de 2026-08-21 (*"prefiro chat
quebrado pra remake habilitado"*). Falha agora aparece na tela, nomeando a etapa.

⚠️ Confira que `planejador` e `interprete` saem com `modelo = gemini-3.1-pro-preview` no log.

⭐ E o passo que mais rende: **repita `quanto joão silva vendeu?`** e compare com R$ 224.042,24, que
é o que o caminho antigo respondeu em 2026-08-20.

### 4. Três respostas que continuam pendentes

- ⭐ **A `latencia_ms` do `planejador`.** Ele tem uma invocação só para ele desde o B07-bis, então o
  número é limpo — e é o que diz se o modelo de raciocínio cabe no orçamento de tempo.
- ⭐ **`custo_produto` é total ou unitário?** Decide se o caminho legado vem calculando lucro errado.
- **Apagar a Edge Function órfã `plum-chat`** pelo painel do Supabase (T7), e olhar o consumo do
  Gemini no período.

---

## 🤖 O que fica engatilhado para mim

**A Etapa 1 está escrita inteira.** O próximo bloco é o **B11**, da Etapa 2 — o plano está em
`zz_remake_implementation/PLANO-etapa-2.md`.

⭐ **A Etapa 2 mudou de conteúdo em relação ao V3.** O achado que a motiva: a `semantic_definition`
que o usuário escreve no cadastro **nunca chega a nenhum agente do `ad_hoc`** — ela só é hasheada
para a chave do cache do A2, enquanto o caminho legado a usa nos três prompts. O remake regrediu
nisso sem ninguém notar.

⭐⭐ **E uma mudança maior, decidida em 2026-08-21: a URL da planilha vira a etapa 1 do cadastro e o
upload de arquivo é removido.** Hoje o cadastro descreve um `.xlsx` e o chat consulta um Google
Sheets, sem nada garantindo que sejam a mesma planilha — **C11 e C12 são as duas faces disso**. Com
uma fonte só, elas deixam de ser possíveis em vez de serem consertadas, e a **C4** vira
desnecessária.

Sete blocos: **B11** ✅ dicionário v2 + leitor único · **B12** ✅ ler a planilha antes de existir
permissão (`cabecalhos` no Lambda + `TETO_DE_CADASTRO = 20`) · **B13** a inversão do cadastro, que passa a ter
**4 passos** · **B14** `ai-agents` reorganizado e as etapas 3 e 4 em raciocínio, com a 4 absorvendo o
A2 · **B15** o A3 recebe o dicionário e o A2 sai do chat · **B16** `ad_hoc` como padrão · **B17** a
suíte de avaliação.

⚠️ **B12 antes de B13, sem exceção** — o cadastro invertido não funciona sem quem leia a planilha.
E **`confianca` sai**: com a etapa 4 assistida, não sobra campo deduzido sem humano olhando.

⚠️ **A suíte de avaliação vem DEPOIS do padrão** (decisão do 👤). O risco de apontar o chat para um
caminho não medido é real; o que o limita é o B15 manter a chave como escape hatch — voltar é um
`UPDATE`, sem deploy.

⭐ **O que resta do B08 é uma decisão, não código:** ligar ou não o teto de cardinalidade no caminho
legado, com o dado que o modo observação do B02 vem acumulando (`[adhoc-observacao]` no CloudWatch).

---

## Estado

- **Etapa 0:** ✅ fechada e no ar.
- **Etapa 1:** ✅ **escrita** — B02..B10 (o B08 encolheu para uma decisão). B02–B06 no ar; **B07-bis,
  B09 e B10 commitados, esperando o deploy do `ai-plum-chat`**.
- ⭐ **Com a chave ligada, só o `ad_hoc` responde** — sem queda para o legado. Falha vira mensagem na
  tela nomeando a etapa.
- **Etapa 2:** **B11 e B12 feitos**. Próximo: **B13** (a inversão do cadastro).
  ⚠️ O B12 **precisa estar no ar** antes de eu mexer na tela — ver o `MANUAL.md` dele.
- **Testes:** 387 Python, 313 TypeScript, `tsc` limpo, lint na baseline.
- **Bloqueante da etapa, sem dono:** as **25–30 perguntas de avaliação**. Não bloqueia nenhum bloco.

## Pontas soltas

- ⚠️ **Um `error` de Postgrest ignorado foi achado pela terceira vez** (no B10, na leitura do saldo;
  antes na leitura e na gravação do cache do A2). O padrão é sempre `const { data } = await ...`: o
  Postgrest **não lança**, devolve `{ data: null, error }`, e o `?? []` transforma falha em resposta
  vazia plausível. Vale uma varredura por `const { data }` sem `error` no `ai-plum-chat`.
- ⚠️ **`_shared/llm/claude.ts` nunca foi executado e hoje é inalcançável.** A análise de custo de
  2026-08-21 levou planejador e intérprete para `gemini-3.1-pro-preview`. ⭐ O adaptador fica de
  propósito: trocar de provedor é uma linha em `MODELO_POR_PAPEL`. A chave já está nos secrets.
- ⚠️ **O modelo de raciocínio é `-preview`.** Se for aposentado, agora o sintoma é o chat **quebrado
  na tela** (não mais silêncio), com `etapa: planejador`.
- ⚠️ **Duas dívidas de normalização duplicada**, TS × Python, com tabela de casos replicada:
  nome de coluna (D-017, falha barulhenta) e **valor de texto** (B04, falha **muda** — devolve
  resultado vazio). Mudou um lado, mude o outro e os dois testes.
- ⚠️ **C4b:** o `query-engine.yml` roda `update-function-code` **antes** do smoke test, então não há
  janela em que o deploy do Lambda seja verificado antes de valer. Derrubou o executor uma vez
  (**I-09**).
- **C11 e C12** em `contexto/20-pendencias.md` se resolvem juntos, no onboarding: cabeçalhos que
  colidem ao normalizar, e `allowed_columns` que nunca é revalidado contra a planilha.
- `zz_remake/LEIA-PRIMEIRO.md` modificado no working tree apontando o **V2** como autoritativo, que
  o V3 substituiu. É edição sua; não commitei.
- `zz_remake_implementation/chequei-dashboard-agent-e-n-o-nested-platypus.md` continua **não
  rastreado de propósito**: contém a chave publicável do projeto Supabase abandonado.
- `contexto/30-decisoes.md` passou de 450 linhas (teto 400). Divisão limpa: D-001..D-030 `vigente`
  × D-031+ `proposta`. Decisão sua.
