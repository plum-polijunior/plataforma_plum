# ▶ Próximo passo — onde o remake parou

**Atualizado:** 2026-09-03, depois do `fillna(0)` e dos blocos B21 e B22 ·
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
| **Lambda `plum-query-engine`** | — | ⭐ **2026-09-03 12:38Z** (o `fillna(0)`) |
| **front (Vercel)** | — | 2026-09-03, commit `f85cc7f` (B21 + B22) |

✅ **As quatro Edge Functions continuam sincronizadas com o repositório** — nenhum
commit desde 2026-08-31 tocou `supabase/functions/**`. Some a divergência de
`_shared/query_plan.ts` que existia desde 12/08.

⭐ **Sinal de saúde:** `version` e o sufixo do `entrypoint_path` estão **iguais** nas
quatro (`v75/_75`, `v64/_64`, `v48/_48`, `v18/_18`). Quando divergirem, a diferença
é o número de trocas de secret desde o último deploy de código.

⭐⭐ **O `ad_hoc` é o PADRÃO desde 2026-08-31** (migration
`20260825120000_adhoc_como_padrao.sql`). A chave virou escape hatch de emergência:

```sql
update public.organizations set remake_habilitado = false;  -- volta ao legado, sem deploy
```

⚠️ Isto **não alcança os quatro clientes pagantes**: eles usam a 🔧 implementação,
deploy separado (`contexto/02-plataforma-vs-implementacao.md`).

---

## 👤 A fila, em ordem

### 1. ⭐⭐ Percorrer os manuais do B21 e do B22 — são de tela, e ninguém validou

Os dois estão no ar e **nenhum foi exercitado por gente**. São os primeiros blocos
da Etapa 3 que mudam o que você vê, então o critério de pronto é seu:

- `execucao/B21-base-duplicada/MANUAL.md` — 5 conferências. A que mais importa é a
  2 (**outra aba** do mesmo arquivo tem de continuar virando base nova) e a 4 (o
  link de "Publicar na web" recusado com mensagem própria).
- `execucao/B22-reler-e-reconciliar/MANUAL.md` — 6 conferências. ⛔ A **3** é a
  central: apagar uma coluna que esteja no `allowed_columns` de um cargo
  **não-Admin** e conferir **no banco** que ela sumiu das duas pontas. Sobrar no
  `allowed_columns` é a C12 por outra porta, e é silencioso.

⭐ E a **4** é o ponto do bloco inteiro: depois de reconciliar, os cards do
dashboard daquela base **continuam com número**. É isso que separa reconciliar de
recadastrar.

### 2. ⚠️ Confirmar que uma base `versao: 1` responde

⛔ **Continua pendente, e continua urgente.** Com o B16, o `ad_hoc` vale para
**todas** as organizações — inclusive as bases da demo, que seguem em
`schema_metadata` v1 e não serão recadastradas.

Faça uma pergunta numa base que você **não** recadastrou. Se quebrar, o rollback é
o `UPDATE` acima, sem deploy.

⭐ **E agora há uma saída melhor que não existia:** o **Reler** do B22 funciona
sobre base v1 e preserva os cards. Ele não escreve as definições semânticas (isso
continua sendo o cadastro), mas reconcilia as colunas sem custar o uuid.

### 3. Conferir os blocos que subiram sem manual seguido

Em ordem de valor:

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

---

## 🤖 O que fica engatilhado para mim

### Etapa 3, blocos B23 e B24 — as duas pontas soltas que sobraram

`PLANO-etapa-3.md`. B18..B22 estão feitos e no ar.

- **B23** — `grao` e `observacoes` editáveis na base ativa (**C17**). Trabalho de
  tela, na mesma seção que o B22 acabou de criar; o consumo pelo A3 já existe
  desde o B14. ⚠️ E vale a mesma regra da D-056: escrever o grão **não** promove
  uma base v1 para v2, porque v2 afirma que cada coluna foi conferida.
- **B24** — o Agente 2 refina só o que a pessoa editou (**C16**). Precisa guardar a
  saída original do Agente 1 e mandar só o que divergir. ⚠️ A saída volta parcial,
  então o merge é no front: substituir o objeto inteiro apagaria as colunas não
  enviadas.

⭐ **B23 primeiro** — é menor, e cai exatamente onde o B22 já colocou UI.

---

## Pontas soltas

- ⚠️⚠️ **NADA typechecava `supabase/functions/`, e `npm run build` não typecheca
  `src/`.** `npm run build` é `vite build` (esbuild só remove tipos); `npx tsc
  --noEmit` na raiz checa **zero arquivos** (`"files": []`). Os que enxergam:
  `npx tsc -p tsconfig.app.json --noEmit` e `deno check`. Nenhum está no CI (I-11).
  ⇒ Sobra **um** erro pré-existente: `src/pages/PlumChat.tsx:382` (`unknown` →
  `Json`). Ligar o typecheck no `build` esbarra nele.
- ⚠️ **`contexto/30-decisoes.md` está em 814 linhas** (teto 400) — dobrou o teto.
  Divisão limpa: `D-001..D-030` (vigente) × `D-031+`. **Decisão sua**, e a cada
  bloco novo o problema piora.
- ⚠️ **`Cfgdatabase.tsx` mistura dois estilos de aviso:** as seções antigas usam
  `alert()`/`window.confirm()` crus, e as do B22 usam `useToast`. Não é urgente,
  mas é visível na mesma tela.
- ⚠️ **As seções 2 e 3 do "Editar Esquema" podem se sobrescrever:** uma lê de
  `editedSchema`, a outra de `selectedDataset.schema_metadata`, e "Aplicar Ordem"
  (formatação) salva direto sem confirmação. Não é regressão do B22 — é anterior,
  e o B22 encostou nisso.
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
