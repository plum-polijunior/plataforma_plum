# ▶ Próximo passo — onde o remake parou

**Atualizado:** 2026-08-25, com a **Etapa 2 escrita inteira** (B11..B17) · **Leia isto primeiro ao
retomar.**

Este arquivo existe porque o agendador do Claude Code morre junto com a sessão: um lembrete só
sobrevive se estiver no repositório. Ele é sempre reescrito por inteiro — não é histórico, é estado.
O histórico está nos `DIARIO.md` de cada bloco.

---

## 👤 A fila, em ordem

### 1. ⚠️⚠️ Publicar — está atrasado SETE blocos

Nada da Etapa 1 tardia nem da Etapa 2 está no ar. **B07-bis, B09, B10, B12, B13, B14 e B15 estão
commitados e não publicados.**

```bash
git push
# a Action `query-engine` tem de ficar verde ANTES (o B12 publica Lambda)
npx supabase functions deploy ai-plum-chat --project-ref rjwidarrsykufuifzunu
npx supabase functions deploy ai-agents    --project-ref rjwidarrsykufuifzunu
```

⚠️ **`ai-agents` é deploy novo neste remake** — nunca foi publicado por nenhum bloco. Ele passou a
consumir `_shared/llm.ts`, `llm/*`, `llm_core.ts` e `perfil.ts`; o `ai-plum-chat` consome
`perfil.ts` e `dicionario.ts` também. `_shared/` é empacotado **por função**: publicar um só deixa
duas cópias divergentes da regra de vocabulário em produção, e divergência **não avisa** (D-028).

Confirme pelo `ezbr_sha256` (`npx supabase functions list`), nunca pelo `version`.

⚠️ **No B10 esse deploy virou obrigatório e urgente.** O Lambda já aceita `registro`/`amostra`; quem
conta as linhas contra o orçamento é a Edge Function. Entre o push e o deploy, **o teto de 200 linhas
por dia não existe** — só o de 5 por pedido, que sozinho não protege nada.

### 2. Seguir os `MANUAL.md`, nesta ordem

Cada um tem um critério de pronto verificável:

1. `execucao/B12-ler-a-planilha/MANUAL.md` → `execucao/B13-inversao-do-cadastro/MANUAL.md`
2. **`execucao/B14-ai-agents-e-dicionario/MANUAL.md`** — recadastrar a `plum_base_suja` e conferir
   que o `schema_metadata` nasceu `versao: 2` com o grão que **você** deixou na tela
3. **`execucao/B15-a3-recebe-o-dicionario/MANUAL.md`** — a sequência do turno tem de ser
   `porteiro → [vocabulário] → planejador → executor → interprete`, **sem `reconhecedor`**
4. **`execucao/B16-adhoc-padrao/MANUAL.md`** — ⚠️ antes de aplicar, confirme que uma base **v1** (não
   recadastrada) responde. Se ela quebrar, **pare**: o B16 multiplica isso por todas as bases antigas
5. `execucao/B10-registro-amostra/MANUAL.md` — o passo 4 dele (forçar a negação de orçamento)
6. `execucao/B07-planejador-interprete/MANUAL.md` — a sequência esperada foi **corrigida** no B15

### 3. ⭐ O que só você pode fazer: as perguntas de avaliação

`execucao/B17-suite-de-avaliacao/MANUAL.md`. O arnês está de pé e roda (`npm run avaliacao`); há
**14** perguntas onde o plano pede 25–30, e as 14 dependem de suposições sobre as colunas da
`plum_base_suja` que podem estar erradas — nesse caso o teste mede a coisa errada **e passa**.

⛔ Não completei inventando pergunta plausível: uma suíte cheia de perguntas que ninguém faria mede a
coisa errada com confiança. **O que rende mais são as perguntas que você já viu o chat errar.**

### 4. Três respostas que continuam pendentes

- ⭐ **A `latencia_ms` do `planejador`.** Ele tem invocação só para ele desde o B07-bis, e o turno
  encurtou duas etapas no B15 — é o que diz se o modelo de raciocínio cabe no orçamento de tempo.
- ⭐ **`custo_produto` é total ou unitário?** Decide se o caminho legado vem calculando lucro errado.
  ⭐ E agora tem onde ser respondido: é exatamente o tipo de coisa que a `semantic_definition` da
  etapa 4 guarda, e que desde o B15 chega ao planejador.
- **Apagar a Edge Function órfã `plum-chat`** pelo painel (T7), e olhar o consumo do Gemini.

---

## 🤖 O que fica engatilhado para mim

**A Etapa 2 está escrita inteira.** Nada da Etapa 2 espera código meu; o que falta é publicar,
conferir pelos manuais, e a lista de perguntas do B17.

O próximo trabalho de código é a **Etapa 3**, e ela ainda não tem plano. O que já está decidido
sobre ela, espalhado pelos blocos:

- ⭐ **O A2 volta.** `adhoc/reconhecedor.ts`, `_shared/reconhecimento.ts` e `plum_reconhecimento`
  ficaram no repositório, desligados, com o motivo escrito no topo de cada um: com **uma** planilha o
  trabalho dele é vazio; com **várias**, escolher entre elas é problema de verdade (§A3, D-005).
- **Cruzar planilhas sem `join`** — a proposta é cruzar **depois** da agregação (D-035).
- **C13** — reconferir base ativa sem criar uuid novo. Ficou **mais fácil** depois da Etapa 2: com a
  identidade sendo o `google_sheet_id`, um "reconferir" que preserve o `id` passa a ser natural.

---

## Estado

- **Etapa 0:** ✅ fechada e no ar.
- **Etapa 1:** ✅ escrita — B02..B10. B02–B06 no ar; **B07-bis, B09 e B10 esperando deploy**.
- **Etapa 2:** ✅ **escrita inteira** — B11 ✅ dicionário v2 e leitor único · B12 ✅ ler a planilha ·
  B13 ✅ a inversão do cadastro (4 passos) · B14 ✅ `ai-agents` reorganizado e a etapa 4 absorvendo o
  A2 · B15 ✅ o A3 recebe o dicionário · B16 ✅ migration do padrão (**não aplicada**) · B17 ⚠️ arnês
  pronto, lista de perguntas incompleta.
- ⭐ **Com a chave ligada, só o `ad_hoc` responde** — sem queda para o legado. Falha vira mensagem na
  tela nomeando a etapa.
- **Testes:** 387 Python, **340** TypeScript, `deno check` limpo nas duas Edge Functions,
  `tsc -p tsconfig.app.json` limpo exceto um erro pré-existente em `PlumChat.tsx:331`.
- **Migration pendente de aplicação:** `20260825120000_adhoc_como_padrao.sql` (B16).

## Pontas soltas

- ⚠️⚠️ **NADA typechecava `supabase/functions/`, e nada typecheca `src/` no `npm run build`.**
  Descoberto em 2026-08-25. `npm run build` é `vite build` (esbuild só remove tipos); `npx tsc
  --noEmit` na raiz checa **zero arquivos**, porque o `tsconfig.json` tem `"files": []` e só
  referências. Os comandos que enxergam são `npx tsc -p tsconfig.app.json --noEmit` e `deno check`.
  ⇒ Um `ReferenceError` chegou à tela por isso (as cinco `useState` que o B13 apagou), e o primeiro
  `deno check` no `ai-plum-chat` achou **19** erros de tipo, 18 pré-existentes. Todos corrigidos.
  **O CLAUDE.md §1 ainda afirma que `npm run build` typecheca — falso.** Ligar o typecheck no build
  esbarra no erro pré-existente de `PlumChat.tsx:331`.
- ⚠️ **`presuncoes_qtd` era `NULL` em toda linha do `plum_logs`**, desde o B07: a coluna existia, o
  código a passava, `montarLinha` não a mapeava. Corrigido no B15, com regressão. ⇒ **Não há linha de
  base** de "quantas presunções antes do dicionário" — não é recuperável.
- ⚠️ **`_shared/llm/claude.ts` nunca foi executado e hoje é inalcançável.** Fica de propósito: trocar
  de provedor é uma linha em `MODELO_POR_PAPEL`.
- ⚠️ **O modelo de raciocínio é `-preview`, e agora o CADASTRO também depende dele** (D-047). Se for
  aposentado, o sintoma passa a ser dois: chat quebrado com `etapa: planejador`, e 400 em toda
  geração de dicionário.
- ⚠️ **Três dívidas de normalização duplicada** TS × Python: nome de coluna (D-017, falha
  barulhenta), valor de texto (B04, falha **muda**) e o enum de `formatting_rule` (§A6 — a Etapa 2
  passou perto e não consertou, por decisão).
- ⚠️ **C4b:** o `query-engine.yml` roda `update-function-code` **antes** do smoke test, então não há
  janela em que o deploy do Lambda seja verificado antes de valer. Derrubou o executor uma vez (I-09).
- **O dicionário é um retrato do dia do cadastro** (§B5). O `metadados` saiu do caminho da pergunta
  no B15, então coluna que sumiu da planilha agora vira `MissingColumnError` visível. Reperfilar é
  Etapa 5.
- **A fusão das duas invocações do `ad_hoc`** (§B4) — o B15 tirou uma chamada de LLM e uma ida ao
  Lambda do primeiro salto, o que reabre a questão. Espera medição.
- `zz_remake/LEIA-PRIMEIRO.md` modificado no working tree apontando o **V2** como autoritativo, que
  o V3 substituiu. É edição sua; não commitei.
- `zz_remake_implementation/chequei-dashboard-agent-e-n-o-nested-platypus.md` continua **não
  rastreado de propósito**: contém a chave publicável do projeto Supabase abandonado.
- `contexto/30-decisoes.md` passou de **520** linhas (teto 400). Divisão limpa: D-001..D-030
  `vigente` × D-031+ `proposta`. Decisão sua.
