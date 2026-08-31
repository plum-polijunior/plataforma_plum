# ▶ Próximo passo — onde o remake parou

**Atualizado:** 2026-08-31, depois do I-14 e do deploy que sincronizou as quatro
Edge Functions · **Leia isto primeiro ao retomar.**

Este arquivo existe porque o agendador do Claude Code morre junto com a sessão: um
lembrete só sobrevive se estiver no repositório. Ele é sempre reescrito por
inteiro — **não é histórico, é estado**. O histórico está nos `DIARIO.md` de cada
bloco.

⚠️ **Ele já ficou obsoleto uma vez, em 2026-08-31**: dizia "Etapa 2 escrita
inteira" e listava uma fila de deploy de sete blocos que já tinha sido resolvida,
quatro commits depois. É o arquivo que o projeto manda ler primeiro ao retomar —
quando ele mente, manda alguém publicar o que já está publicado e ignorar o que
não está. **Reescreva-o ao fim de qualquer sessão que mude o estado.**

---

## ⭐ O que está NO AR agora (medido, não presumido)

```bash
npx supabase functions list --project-ref rjwidarrsykufuifzunu
```

| função | versão | publicada |
|---|---|---|
| `ai-plum-chat` | 75 | 2026-08-31 |
| `ai-agents` | 64 | 2026-08-25 |
| `dashboard-execute` | 48 | 2026-08-31 |
| `dashboard-agent` | 18 | 2026-08-31 |

✅ **As quatro estão sincronizadas com o repositório**, conferido pelo
`ezbr_sha256` em 2026-08-31. Some a divergência de `_shared/query_plan.ts` que
existia desde 12/08, e o Tarsila passou a saber a data de hoje.

⭐⭐ **E o `ad_hoc` é o PADRÃO desde 2026-08-31.** A migration
`20260825120000_adhoc_como_padrao.sql` foi aplicada: `remake_habilitado` nasce
`true` e todas as organizações existentes foram ligadas. A chave trocou de papel —
era conveniência de desenvolvimento, virou **escape hatch de emergência**:

```sql
update public.organizations set remake_habilitado = false;  -- volta ao legado, sem deploy
```

⚠️ Isto **não alcança os quatro clientes pagantes**: eles usam a 🔧 implementação,
deploy separado. É o erro mais caro do projeto (`02-plataforma-vs-implementacao.md`).

⭐ **Sinal de saúde para conferir depois:** `version` e o sufixo do
`entrypoint_path` estão **iguais** nas quatro (`v75/_75`, `v64/_64`, `v48/_48`,
`v18/_18`). Quando divergirem, a diferença é o número de trocas de secret desde o
último deploy de código — foi assim que o `dashboard-agent` ficou em `v17` com
path `_12`.

---

## 👤 A fila, em ordem

### 1. Publicar o front (só push) — a ponte de transição saiu

`src/pages/PlumChat.tsx` parou de mandar `dicionario` no `ad_hoc_planejar`. Ela
era a ponte do I-14, criada quando a Edge estava na v74; agora está na v75 e
atual, então a ponte cumpriu o papel e foi removida antes de virar permanente
(regra 1 do I-14 — *"é como o `cacheHit` sobreviveu ao A2"*).

⚠️ Nenhum deploy de Edge Function é necessário: o campo já não era lido.

### 2. ⚠️ Confirmar que uma base `versao: 1` responde

⛔ **Agora é urgente, não preventivo.** Com o B16 aplicado, o `ad_hoc` vale para
**todas** as organizações — inclusive as bases da demo, que continuam em
`schema_metadata` v1 e não serão recadastradas (C13).

Faça uma pergunta numa base que você **não** recadastrou. Se ela quebrar, o
rollback é um `UPDATE`, sem deploy, com efeito imediato (ver acima). O leitor
único tolera a v1 com default por campo — mas isso nunca foi exercitado com o
padrão ligado.

### 3. Conferir os blocos que subiram sem manual seguido

Cada `MANUAL.md` tem critério de pronto verificável. Os que ainda não foram
percorridos, em ordem de valor:

1. `execucao/B20-a2-encaminhador/MANUAL.md` — o mais novo e o menos exercitado
2. `execucao/B19-payload-multibase/MANUAL.md` — ⚠️ é onde uma coluna pode escapar
   do RBAC (I-05); vale rodar mesmo que pareça funcionar
3. `execucao/B18-from-nao-sobrescrito/MANUAL.md`
4. `execucao/B10-registro-amostra/MANUAL.md` — o passo 4 (forçar negação de
   orçamento)

### 4. ⭐⭐ O que só você pode fazer: as perguntas de avaliação

`execucao/B17-suite-de-avaliacao/MANUAL.md`. O arnês roda (`npm run avaliacao`);
há **14** perguntas onde o plano pede 25–30, e elas dependem de suposições sobre
as colunas da `plum_base_suja` que podem estar erradas — nesse caso o teste mede a
coisa errada **e passa**.

⭐ **Duas das 14 já se provaram furadas em campo**, e isso é evidência do
problema, não anedota: `posicao-percentil` pergunta por "clientes" numa base que
não tem coluna de comprador, e `dispersao-criterio` passou numa resposta cuja
conclusão era circular (D-052).

⛔ Não completar inventando pergunta plausível. **O que rende mais são as
perguntas que você já viu o chat errar.**

---

## 🤖 O que fica engatilhado para mim

### ⚠️⚠️ Prioridade sobre a Etapa 3: a família do `fillna(0)` no executor

Achada em 2026-08-27, **não corrigida**. Produz número errado **hoje**, com uma
planilha só — não depende de nada da Etapa 3.

Raiz única, em `query_engine/pandas_executor.py`: quando a coluna não está tipada
como número, o executor faz `pd.to_numeric(...).fillna(0)` — trata *"não consegui
converter"* como *"vale zero"*.

| agregação | efeito |
|---|---|
| `sum` | defensável — ausente soma zero |
| `avg` | ⛔ **errado** — o zero entra no denominador e puxa a média |
| `min` | ⛔ **errado** — vira `0`, *"a menor venda foi R$ 0,00"* |
| `count` | não passa pela coerção: **conta linha que somou zero** |

⚠️ E o caminho escalar coage só `sum/avg/mean` ([:1060](query_engine/pandas_executor.py#L1060))
enquanto o agrupado coage também `min/max` (`_coerce_numeric_for_agg`) — **a mesma
pergunta dá números diferentes com e sem `group by`**. É a classe de bug que a
docstring do `_scalar_agg` diz ter consertado no B09, sobrevivendo noutro lugar.

⭐ E há um agravante de produto: nada disso acontece com a coluna corretamente
tipada. ⇒ **A correção de uma média depende de uma regra de formatação que o
Agente 3 escolheu olhando 20 linhas e que o usuário aprovou sem que nada dissesse
que ela afeta médias.**

⚠️ Antes de consertar: conferir se algum dos 387 testes de Python **assere o
comportamento atual**. Se sim, há decisão de produto junto (soma de ausente é
zero? média de ausente é o quê?), não só conserto.

### Depois: Etapa 3, blocos B21..B24

`PLANO-etapa-3.md`. B18, B19 e B20 estão feitos e no ar. Sobram as quatro pontas
soltas do cadastro, e a ordem sugerida **não** é a numérica:

- **B21** primeiro — planilha já cadastrada para de virar base duplicada. É de um
  dia, não depende de nada, e é o que morde hoje.
- **B22** — "editar esquema" relê a planilha e reconcilia (C13). O mais valioso
  dos quatro: hoje mudar uma coluna no Sheets obriga a recadastrar tudo.
- **B23** — observações editáveis na base ativa.
- **B24** — o Agente 2 refina só o que a pessoa editou.

---

## Pontas soltas

- ⚠️⚠️ **NADA typechecava `supabase/functions/`, e `npm run build` não typecheca
  `src/`.** `npm run build` é `vite build` (esbuild só remove tipos); `npx tsc
  --noEmit` na raiz checa **zero arquivos** (`"files": []`). Os que enxergam:
  `npx tsc -p tsconfig.app.json --noEmit` e `deno check`. Nenhum está no CI (I-11).
  ⇒ Sobra **um** erro pré-existente: `src/pages/PlumChat.tsx:382`
  (`unknown` → `Json`). Ligar o typecheck no `build` esbarra nele.
- ⚠️ **`presuncoes_qtd` era `NULL` em toda linha do `plum_logs`** até 2026-08-25
  (I-12). Corrigido, mas **sem linha de base recuperável** — não há "antes".
- ⚠️ **O modelo de raciocínio é `-preview`**, e o **cadastro** também depende dele
  desde o D-047. Se for aposentado: chat quebrado com `etapa: planejador` **e**
  400 em toda geração de dicionário.
- ⚠️ **Três dívidas de normalização duplicada** TS × Python: nome de coluna
  (D-017, falha barulhenta), valor de texto (B04, falha **muda**) e o enum de
  `formatting_rule` (§A6 da Etapa 2 — passou perto e não consertou, por decisão).
- ⚠️ **C4b:** o `query-engine.yml` roda `update-function-code` **antes** do smoke
  test, então não há janela em que o deploy do Lambda seja verificado antes de
  valer. Derrubou o executor uma vez (I-09).
- **O dicionário é um retrato do dia do cadastro** (§B5 da Etapa 2). O `metadados`
  saiu do caminho da pergunta no B15; coluna que sumiu da planilha vira
  `MissingColumnError` visível. Reperfilar é Etapa 5 — e o B22 encosta nisso.
- **A fusão das duas invocações do `ad_hoc`** (§B4) — o B15 tirou uma chamada de
  LLM e uma ida ao Lambda do primeiro salto. Espera medição da `latencia_ms`.
- `contexto/30-decisoes.md` passou de **719** linhas (teto 400). Divisão limpa:
  D-001..D-030 `vigente` × D-031+ `proposta`. Decisão sua.
