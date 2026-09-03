# ▶ Próximo passo — onde o remake parou

**Atualizado:** 2026-09-03, com a **Etapa 3 escrita inteira** (B18..B24) ·
**Leia isto primeiro ao retomar.**

Este arquivo existe porque o agendador do Claude Code morre junto com a sessão: um
lembrete só sobrevive se estiver no repositório. Ele é sempre reescrito por
inteiro — **não é histórico, é estado**. O histórico está nos `MANUAL.md` de cada
bloco e em `contexto/30-decisoes.md`.

⚠️ **Ele já ficou obsoleto uma vez**, em 2026-08-31: dizia "Etapa 2 escrita
inteira" e listava uma fila de deploy já resolvida quatro commits antes. É o
arquivo que o projeto manda ler primeiro — quando ele mente, manda alguém
publicar o que já está publicado e ignorar o que não está. **Reescreva-o ao fim de
qualquer sessão que mude o estado.**

---

## ⭐ O que está NO AR agora (medido, não presumido)

```bash
npx supabase functions list --project-ref rjwidarrsykufuifzunu
aws lambda get-function-configuration --function-name plum-query-engine --region sa-east-1
```

| peça | versão | publicada |
|---|---|---|
| `ai-plum-chat` | 75 | 2026-08-31 |
| `ai-agents` | 64 | 2026-08-25 |
| `dashboard-execute` | 48 | 2026-08-31 |
| `dashboard-agent` | 18 | 2026-08-31 |
| **Lambda `plum-query-engine`** | — | 2026-09-03 12:38Z (o `fillna(0)`) |
| **front (Vercel)** | — | 2026-09-03, commit `ef17ae1` (B23 + B24) |

✅ **As quatro Edge Functions continuam sincronizadas com o repositório** — nenhum
commit desde 2026-08-31 tocou `supabase/functions/**`. ⭐ E os quatro blocos da
Etapa 3 que sobraram (B21..B24) foram **front puro**, de propósito: a assimetria
do I-14 (Vercel publica no push, Edge Function não) não teve como aparecer.

⭐ **Sinal de saúde:** `version` e o sufixo do `entrypoint_path` estão **iguais**
nas quatro (`v75/_75`, `v64/_64`, `v48/_48`, `v18/_18`). Quando divergirem, a
diferença é o número de trocas de secret desde o último deploy de código.

⭐⭐ **O `ad_hoc` é o PADRÃO desde 2026-08-31** (migration
`20260825120000_adhoc_como_padrao.sql`). A chave virou escape hatch de emergência:

```sql
update public.organizations set remake_habilitado = false;  -- volta ao legado, sem deploy
```

⚠️ Isto **não alcança os quatro clientes pagantes**: eles usam a 🔧 implementação,
deploy separado (`contexto/02-plataforma-vs-implementacao.md`).

---

## 👤 A fila, em ordem

### 1. ⭐⭐ Percorrer os manuais da Etapa 3 — quatro blocos de tela, nenhum validado

B21..B24 estão no ar e **nenhum foi exercitado por gente**. São os blocos que você
vê, então o critério de pronto é seu. Em ordem de risco:

1. `execucao/B22-reler-e-reconciliar/MANUAL.md` — ⛔ a conferência **3** é a
   central: apagar uma coluna que esteja no `allowed_columns` de um cargo
   **não-Admin** e conferir **no banco** que ela sumiu das duas pontas. Sobrar lá é
   a C12 por outra porta, e é silencioso. E a **4** é o ponto do bloco: depois de
   reconciliar, os cards daquela base continuam com número.
2. `execucao/B23-dicionario-na-base-ativa/MANUAL.md` — a **1** (trocar dimensão →
   medida e ver `vocabulario_util` virar `false` no banco) e a **3** (marcar como
   conferida, e entender o que isso afirma — D-057).
3. `execucao/B24-refino-so-do-editado/MANUAL.md` — a **1**: editar UMA definição,
   refinar, e conferir que as outras ficaram caractere por caractere iguais.
4. `execucao/B21-base-duplicada/MANUAL.md` — a **2** (outra **aba** do mesmo
   arquivo tem de continuar virando base nova) e a **4** (link de "Publicar na
   web" recusado com mensagem própria).

### 2. ⚠️ Confirmar que uma base `versao: 1` responde

⛔ **Continua pendente, e continua urgente.** Com o B16, o `ad_hoc` vale para
**todas** as organizações — inclusive as bases da demo, que seguem em v1.

Faça uma pergunta numa base que você **não** recadastrou. Se quebrar, o rollback é
o `UPDATE` acima, sem deploy.

⭐ **E agora há duas saídas que não existiam:** o **Reler** do B22 reconcilia as
colunas preservando os cards, e o **Marcar como conferida** do B23 tira aquela
base do estado "ninguém me leu" sem recadastrar — depois de você preencher o grão
e revisar os papéis.

### 3. Conferir os blocos anteriores que subiram sem manual seguido

1. `execucao/B20-a2-encaminhador/MANUAL.md` — o menos exercitado
2. `execucao/B19-payload-multibase/MANUAL.md` — ⚠️ é onde uma coluna pode escapar
   do RBAC (I-05); vale rodar mesmo parecendo funcionar
3. `execucao/B18-from-nao-sobrescrito/MANUAL.md`
4. `execucao/B10-registro-amostra/MANUAL.md` — o passo 4 (forçar negação de
   orçamento)

### 4. ⭐⭐ O que só você pode fazer: as perguntas de avaliação

`execucao/B17-suite-de-avaliacao/MANUAL.md`. O arnês roda (`npm run avaliacao`); há
**14** perguntas onde o plano pede 25–30, e elas dependem de suposições sobre as
colunas da `plum_base_suja` que podem estar erradas — nesse caso o teste mede a
coisa errada **e passa**.

⭐ Duas das 14 já se provaram furadas em campo (D-052). ⛔ Não completar inventando
pergunta plausível: **o que rende mais são as perguntas que você já viu o chat
errar.**

⚠️ **É o único item bloqueante que sobrou nesta lista** — a Etapa 3 acabou.

---

## 🤖 O que fica engatilhado para mim

### ⭐ A Etapa 3 fechou. A próxima decisão é sua, não minha.

`PLANO-etapa-3.md` está inteiro em ✅. Fecharam: C12, C13, C14, C15, C16, C17, mais
a família do `fillna(0)`.

O que **sobra na Etapa 3** é o que ela declarou fora de escopo desde o começo:

- ⭐ **Cruzar duas planilhas numa resposta** (§B2) — o A3 ganhou o direito de
  escolher a planilha certa, não de pedir duas e cruzar. É a **Etapa 6**, e depende
  do grão declarado, que agora existe e desde o B23 é editável fora do cadastro.
- **Chamar o Agente 1 para descrever as colunas novas** que o Reler do B22
  acrescenta. Hoje elas entram sem descrição, e é a pessoa que escreve.

⇒ Sem uma Etapa 4 escrita, não há bloco engatilhado. **Ou você escolhe o próximo
tema, ou eu escrevo o `PLANO-etapa-4.md` a partir do V3.**

---

## Pontas soltas

- ⚠️⚠️ **`contexto/30-decisoes.md` está em 857 linhas** (teto 400) — mais que o
  dobro. Divisão limpa: `D-001..D-030` × `D-031+`. **Decisão sua**, e piora a cada
  bloco. É a ponta solta mais antiga desta lista.
- ⚠️⚠️ **NADA typechecava `supabase/functions/`, e `npm run build` não typecheca
  `src/`.** `npm run build` é `vite build` (esbuild só remove tipos); `npx tsc
  --noEmit` na raiz checa **zero arquivos** (`"files": []`). Os que enxergam:
  `npx tsc -p tsconfig.app.json --noEmit` e `deno check`. Nenhum está no CI (I-11).
  ⇒ Sobra **um** erro pré-existente: `src/pages/PlumChat.tsx:382` (`unknown` →
  `Json`). Ligar o typecheck no `build` esbarra nele — e é o mesmo padrão que o
  B23 resolveu no `Cfgdatabase.tsx` com um cast de fronteira.
- ⚠️ **`Cfgdatabase.tsx` mistura dois estilos de aviso:** as seções antigas usam
  `alert()`/`window.confirm()` crus, as do B22/B23 usam `useToast`. Visível na
  mesma tela.
- ⚠️ **As seções de formatação e de contexto do "Editar Esquema" podem se
  sobrescrever:** "Aplicar Ordem" (Agente 3.1) lê de `selectedDataset` e salva
  direto, sem confirmação, enquanto o resto do painel edita `editedSchema`. É
  anterior ao B23, e o B23 encostou nisso.
- ⚠️ **O modelo de raciocínio é `-preview`**, e o **cadastro** também depende dele
  desde o D-047. Se for aposentado: chat quebrado com `etapa: planejador` **e** 400
  em toda geração de dicionário.
- ⚠️ **Três dívidas de normalização duplicada** TS × Python: nome de coluna (D-017,
  falha barulhenta), valor de texto (B04, falha **muda**) e o enum de
  `formatting_rule`.
- ⚠️ **C4b:** o `query-engine.yml` roda `update-function-code` **antes** do smoke
  test, então não há janela em que o deploy do Lambda seja verificado antes de
  valer. Derrubou o executor uma vez (I-09).
- **A fusão das duas invocações do `ad_hoc`** (§B4) — espera medição da
  `latencia_ms`.
