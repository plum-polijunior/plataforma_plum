# Plano: explicar e configurar k-anonimato por cargo — SUPERADO em 2026-08-08

> **Este plano está obsoleto.** Depois de implementar a Fase 1 (bypass do Admin), o k-anonimato
> foi removido do produto por inteiro — não só para o Admin — por decisão consciente do dono
> do produto: pra 90% das planilhas reais (linhas organizadas por data/evento, não por pessoa)
> o limiar suprimia respostas legítimas com mais frequência do que qualquer ganho de
> privacidade que gerava. Ver `k-anonimato-removido.md` na raiz do repo pelo raciocínio
> completo, e o histórico de commits de 2026-08-08 pela implementação. Mantido aqui como
> registro do caminho intermediário (bypass só do Admin) que foi considerado e superado —
> não reaplicar as Fases 1/2 abaixo sem decisão de produto nova.

Motivação (histórica): o Admin da organização — que deveria ter acesso irrestrito — está sendo
suprimido pela mesma regra de k-anonimato que qualquer outro cargo, e hoje não existe
lugar nenhum no front-end que explique o que essa regra faz ou permita ajustá-la. Este
documento explica o mecanismo em detalhe, mostra exatamente onde está o buraco, e propõe
como fechá-lo — mas termina em perguntas de decisão, porque a parte de "dar bypass total ao
Admin" tem uma implicação de privacidade que só o dono do produto pode assumir.

## 1. O que é k-anonimato, em termos simples

Toda resposta que sai do executor Python (`query_engine/pandas_executor.py`) é um número
agregado — soma, média, contagem — nunca a linha bruta da planilha do cliente. Mas agregação
sozinha não garante privacidade: `SOMA(peças não conformes) AGRUPADO POR funcionário` numa
base onde um funcionário só aparece numa linha é, na prática, aquela linha inteira disfarçada
de "agregado". Basta filtrar o suficiente (por pessoa, por dia, por combinação rara de
colunas) para isolar um indivíduo mesmo dentro de uma soma.

k-anonimato é a regra que impede isso: **todo grupo que aparece no resultado precisa ter, no
mínimo, `k` linhas de origem por trás dele.** Se um grupo (uma linha do `GROUP BY`, ou a base
inteira quando não há agrupamento) tem menos que `k` linhas, ele é removido do resultado antes
de sair — nunca aparece parcialmente, nunca com um aviso do tipo "resultado de só 2 linhas".
Quem pergunta só sabe que *algo* foi omitido (contador `suppressed_groups`), nunca o quê.

Hoje `k = 5` por padrão (`DEFAULT_K_MIN` em `pandas_executor.py`). Ou seja: se você perguntar
"quantas peças não conformes o João produziu essa semana" e o João só tiver 3 linhas na
planilha nessa semana, a resposta some — não porque o dado não existe, mas porque mostrá-lo
equivaleria a expor o desempenho individual do João.

## 2. Como funciona hoje, tecnicamente

- `organizations.dashboard_k_min` (int, padrão `5`, `CHECK BETWEEN 1 AND 1000` — migration
  `20260806230000_dashboard_cards.sql`) é a única fonte do valor de `k`. É **por
  organização**, não por cargo, não por base, não por pergunta.
- Os dois consumidores do executor — `dashboard-execute/index.ts` (cards do dashboard) e
  `ai-plum-chat/index.ts` (ação `execute_plan`, chat) — leem essa coluna e mandam
  `k_min: org?.dashboard_k_min ?? 5` no payload assinado pro Lambda. **Nenhum dos dois
  considera o cargo de quem está perguntando.**
- Dentro do executor, `_grouped_agg()` (agrupamento) e o ramo de agregado único de
  `execute_plan()` aplicam o filtro: grupo com menos de `k` linhas de origem é descartado, e
  a contagem de descartes vira `suppressed_groups` na resposta.
- **Não existe UI nenhuma para isso.** Não há tela, não há tooltip, não há input — o único
  jeito de mudar `dashboard_k_min` hoje é um `UPDATE` manual no SQL Editor do painel
  Supabase. Nem `Cfgdatabase.tsx` nem `Dashboard.tsx` sabem que essa coluna existe.

## 3. O problema relatado: Admin sofre a mesma supressão que qualquer cargo

O produto já resolveu um problema parecido, mas só em **um** dos dois eixos de proteção:

- **Eixo 1 — RBAC de coluna** (`role_permissions.allowed_columns`): decide *quais colunas*
  um cargo pode ver. Para o Admin, isso já tem bypass: `DatabasePipeline.tsx` cria
  automaticamente uma linha de `role_permissions` para o Admin com **todas** as colunas do
  `schema_metadata` sempre que uma base fica `active`, e a migration
  `20260807190000_backfill_permissao_admin_bases_existentes.sql` fez o mesmo retroativamente
  para bases já conectadas antes dessa mudança. O comentário da migration é explícito: "a
  tela assume que ele possui acesso irrestrito".
- **Eixo 2 — k-anonimato** (`k_min`): decide *quantas linhas de origem* precisam existir por
  trás de qualquer número, independente de quais colunas estão envolvidas. **Não existe
  bypass equivalente aqui.** `k_min` vem só de `organizations.dashboard_k_min`, e nem
  `dashboard-execute/index.ts` nem `ai-plum-chat/index.ts` sabem, no momento de montar o
  payload, se o cargo de quem pergunta é Admin ou não — a variável `role_name`/`is_admin`
  simplesmente não existe nesse trecho do código hoje (só `role_id` é lido de `profiles`).

Resultado: o Admin já vê todas as colunas, mas se filtrar fundo o suficiente para isolar um
grupo pequeno (ex.: "peças não conformes do João no dia X"), a resposta é suprimida do mesmo
jeito que seria para um Vendedor comum.

## 4. Cuidado antes de implementar: `k_min = 0` não é "sem limite"

É tentador pensar "bypass pro Admin = `k_min = 0`". **Isso é uma armadilha.** Lendo
`pandas_executor.py::execute_plan`:

```python
if not select_items:
    if k_min > 0:
        raise RawRowsBlocked(...)   # linha 123-126
...
if not aggs and k_min > 0:
    raise RawRowsBlocked(...)       # linha 158-162
```

`k_min = 0` não desliga só a supressão por tamanho de grupo — **desliga também o bloqueio de
linha bruta** (P1.3, a barreira que garante que todo plano tem agregação). Com `k_min = 0`,
um plano sem `select` devolveria até 50 linhas brutas da planilha direto
(`df.head(50)`, linha 127). O próprio docstring do parâmetro já avisa: *"0 desliga a proteção
(só para uso interno em teste; o caminho de produção nunca passa 0)"*.

**O bypass certo é `k_min = 1`**, não `0`. Com `k = 1`, todo grupo com pelo menos 1 linha
passa (nenhuma supressão por tamanho), mas `k_min > 0` continua verdadeiro — o bloqueio de
linha bruta e a exigência de agregação continuam ativos. Isso preserva R-01/R-02 do produto
(a IA planeja, o código executa; nenhuma linha bruta sai) enquanto remove a supressão de
grupos pequenos.

## 5. Isso ainda é uma decisão de produto, não só técnica

RBAC de coluna e k-anonimato protegem coisas diferentes:

- RBAC de coluna impede um cargo de ver uma coluna que ele não deveria (ex.: Vendedor não vê
  salário).
- k-anonimato impede **qualquer pessoa, mesmo alguém autorizado a ver a coluna**, de isolar o
  valor de uma pessoa específica através de filtro + agregação.

Dar ao Admin acesso irrestrito ao Eixo 1 (colunas) é uma escolha relativamente segura: ele já
administra a organização, presumivelmente já tem esse nível de confiança. Dar bypass total ao
Eixo 2 (k-anonimato) é uma escolha diferente: significa que o Admin passa a poder perguntar
"quantas peças não conformes o João fez no dia X" e receber uma resposta específica do João,
mesmo que `pecas_nao_conformes` seja uma coluna "pública" dentro da organização. Isso pode
ser exatamente o que se quer de um Admin — mas é uma decisão explícita sobre até onde vai
"acesso irrestrito", não uma consequência automática de já ter feito isso para colunas. Ver
`CLAUDE.md` §5, R-12: k-anonimato está listado como invariante do produto, não como
permissão configurável — este plano propõe torná-lo configurável, o que é uma mudança de
postura que vale confirmar antes de implementar.

## 6. Como configurar hoje, sem UI (imediato, sem código)

Enquanto não há interface, ajustar o valor pra uma organização específica é um `UPDATE`
direto no SQL Editor do painel Supabase:

```sql
UPDATE public.organizations
SET dashboard_k_min = 3   -- entre 1 e 1000; nunca 0 em produção (ver §4)
WHERE id = '<uuid da organização>';
```

Afeta os dois consumidores (dashboard e chat) imediatamente, porque ambos leem a mesma coluna
a cada chamada — não precisa de deploy nem de cache invalidado.

## 7. Proposta de implementação

### Fase 1 — Bypass do Admin no k-anonimato (baixo esforço, sem migration) — FEITO em 2026-08-08

Em `dashboard-execute/index.ts` e `ai-plum-chat/index.ts`, no ponto onde hoje só se lê
`profile.role_id`, também buscar o nome do cargo (`roles.name`, via join ou segunda query) e
comparar em minúsculas — mesma convenção já usada por `is_org_admin()`
(`CLAUDE.md` §7: "`is_org_admin()` é case-insensitive... no front, comparar cargo sempre com
`.toLowerCase()`"). Se o cargo for Admin, usar `k_min: 1` no payload em vez de
`org?.dashboard_k_min ?? 5`. Não precisa de nova coluna, nova RPC nem migration — é uma
condicional local em dois arquivos já existentes.

```ts
const k_min = profile.roleName?.toLowerCase() === "admin" ? 1 : (org?.dashboard_k_min ?? 5);
```

Teste a acrescentar em `query_engine/tests/test_privacidade.py` (mesmo arquivo dos testes de
k-anonimato existentes, ex. `test_p3_o_limiar_padrao_e_cinco`): confirmar que `k_min=1` deixa
passar um grupo de tamanho 1 mas ainda recusa plano sem agregação (`RawRowsBlocked`) —
fixa exatamente a armadilha do §4 como regressão. (Não fiz esse teste em Python porque a
Fase 1 implementada não alterou `pandas_executor.py` — o executor já aceitava `k_min` como
parâmetro; a mudança inteira é em qual valor os dois Edge Functions mandam pra ele.)

**Achado durante a implementação, fora do escopo original deste plano:**
`dashboard-execute/index.ts` cacheia resultado de card em `dashboard_card_snapshots`, com
chave por `permissions_fingerprint` — um hash só do CONJUNTO de colunas liberadas
(`_shared/query_plan.ts::permissionsFingerprint`), sem relação com `k_min`. Depois da Fase 1,
dois cargos com o MESMO conjunto de colunas (ex.: um cargo não-Admin configurado com acesso
total, igual ao Admin) gerariam a mesma digital mesmo tendo `k_min` diferentes — um snapshot
calculado sem supressão para o Admin (`k_min=1`) poderia ser servido, do cache, para esse
outro cargo. Corrigido junto: `permissionsFingerprint` ganhou um segundo parâmetro
`kMinBypass` que entra na digital, e `dashboard-execute/index.ts` passa `isAdmin` nessa
chamada. Teste novo em `_shared/query_plan.test.ts`. `ai-plum-chat` não precisou do mesmo
ajuste porque não tem cache de snapshot (cada pergunta do chat é ad-hoc).

### Fase 2 (opcional) — Configuração granular por cargo, não só Admin/resto

Se no futuro fizer sentido um Gerente ter `k=3` e um Vendedor `k=10` (em vez de só
Admin=1/todo-o-resto=padrão-da-org), o caminho é estender `role_permissions` com uma coluna
opcional:

```sql
ALTER TABLE public.role_permissions
  ADD COLUMN IF NOT EXISTS k_min_override int
  CHECK (k_min_override IS NULL OR k_min_override BETWEEN 1 AND 1000);
```

`NULL` (padrão) herda `organizations.dashboard_k_min`; um valor explícito sobrepõe por par
(cargo, dataset) — mesmo padrão já usado por `allowed_columns`. Os dois consumidores
resolveriam `k_min` como `perm?.k_min_override ?? org?.dashboard_k_min ?? 5`. Precisaria de
migration idempotente + atualizar `types.ts` + UI na matriz de permissões (mesma tela onde já
se edita `allowed_columns` por cargo/dataset).

**Recomendação: não fazer a Fase 2 agora.** Resolve um problema que ainda não foi relatado
(granularidade por cargo, além do caso Admin), e este projeto é protótipo — construir a
camada de override antes de alguém precisar dela é complexidade especulativa. Fica registrada
aqui para não precisar redescobrir o desenho se o pedido aparecer.

## 8. UI para explicar e configurar `dashboard_k_min` (independe da Fase 1/2 acima)

Isso resolve a segunda parte do pedido — hoje não há onde ver ou mudar esse número.

- **Onde**: um card novo em `Cfgdatabase.tsx`, provavelmente na aba de permissões (`?tab=
  permissoes`, já é o lugar de configuração de acesso a dados) ou em `Dashboard.tsx` perto do
  card "Minha Organização" — decisão de UX, não técnica.
- **Quem edita**: só Admin. A policy de RLS já permite (`"admin atualiza a propria org"`,
  migration `20260722120000`, `FOR UPDATE ... USING (is_org_admin())`) — um
  `supabase.from('organizations').update({ dashboard_k_min: n }).eq('id', orgId)` direto do
  cliente já funciona hoje, sem RPC nova.
- **O que mostrar**: não só um input numérico. A explicação do §1 em linguagem simples, mais
  o valor atual, mais um exemplo concreto amarrado ao dataset real da organização (ex.: "com
  k=5, perguntas que resultariam em grupos de 4 pessoas ou menos são omitidas"). Um input
  numérico validado entre 1 e 1000 (mesmo `CHECK` do banco, replicado no front pra feedback
  imediato) — e um aviso visível se o valor ficar abaixo de 5 ("menor prazo de privacidade que
  o padrão recomendado").
- **Não expor `k_min=0` como opção na UI** — mesmo motivo do §4; se algum dia for necessário
  para debug interno, isso continua sendo um `UPDATE` manual no banco, nunca um botão.

## 9. Perguntas que precisam de decisão antes de codar

1. Confirma que o Admin deve ter bypass total de k-anonimato (`k_min=1`), sabendo que isso
   permite reidentificar indivíduos via filtro fino mesmo em colunas "abertas" (§5)? Ou o
   Admin deveria ter um `k_min` menor mas não igual a 1 (ex.: 2 ou 3 — ainda protegido, só
   menos que o padrão de 5)?
2. A Fase 1 muda o comportamento de produção sem migration nem tela — topa que eu implemente
   direto, ou prefere revisar o diff antes?
3. A UI do §8 entra em `Cfgdatabase.tsx` ou em `Dashboard.tsx`? (Ambas já existem; a decisão é
   só de onde encaixa melhor na navegação atual.)
4. Faz sentido também expor `dashboard_max_rows` na mesma UI, já que os dois vêm juntos do
   banco e são configurações do mesmo tipo (limites por organização), ou prefere manter o
   escopo só em k-anonimato por agora?
