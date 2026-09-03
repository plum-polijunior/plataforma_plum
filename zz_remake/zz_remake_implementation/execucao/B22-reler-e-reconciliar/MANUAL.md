# B22 · "Editar Esquema" relê a planilha e reconcilia — manual do 👤

⭐⭐ **É o bloco mais valioso da Etapa 3.** Até agora, acrescentar ou tirar uma coluna no Google Sheets
obrigava a **refazer o cadastro inteiro** — e refazer cria um `dataset` novo, com uuid novo, que leva
junto **todos os cards do dashboard e a matriz de permissões** por CASCADE. Na prática: a base da
demo nunca ia ganhar dicionário v2, porque o preço era perder os cards.

Agora existe um **Reler a planilha** dentro do "Editar Esquema", que compara o cabeçalho de hoje com
o dicionário e reconcilia **preservando o `id` da base**.

Fecha três pendências de uma vez: **C15** (mudar coluna obriga a recadastrar), **C13** (não há como
reconferir base ativa) e **C12** (`allowed_columns` nunca revalidado contra o cabeçalho).

**Front puro.** Sem migration, sem Edge Function, sem Lambda.

## Antes

⭐ **O B21 primeiro**, porque é o diálogo dele que manda a pessoa para cá. Sem ele, quem quer
reconciliar continua recolando o link no cadastro — e criando base duplicada.

⚠️ **E o conserto do `fillna(0)` precisa estar no Lambda** (commit `db52921`, publicado em
2026-09-03 12:38Z). Toda coluna que a reconciliação acrescenta nasce em `formatting_rule.type =
"nenhuma"`, que é exatamente o caso em que o executor tratava *"não consegui converter"* como *"vale
zero"* — média puxada para baixo, mínimo virando R$ 0,00.

## Publicar

```sh
git push
```

A Vercel publica no push. ⭐ **Nenhum deploy de Edge Function**, e vale explicar por quê, porque o
plano da Etapa 3 dizia o contrário: a ação `cabecalhos_da_planilha` **já funcionava sobre base
ativa**. O `exigirAdminDaBase` confere organização, cargo e status **da pessoa** — nunca o
`datasets.status`. Não havia nada a mudar do lado do servidor.

## ⭐⭐ O que confirmar

### 1. Coluna nova

Acrescente uma coluna na planilha (qualquer cabeçalho novo na linha 1). Depois: **Bases de Dados →**
clique na base **→ Editar Esquema → Reler a planilha**.

⭐ **O que deve acontecer:** a coluna aparece em **Novas**, com `+` na frente. As outras aparecem em
**Iguais**, e o texto diz que a descrição, o papel e o vocabulário delas ficam intocados.

Clique em **Aplicar ao dicionário**. Depois, no bloco *"Refinar Contexto Semântico"* logo abaixo,
escreva o que a coluna significa e salve.

⛔ **A coluna nova entra SEM descrição, e sem IA** — foi pedido assim. O chat passa a saber que ela
existe, mas não o que ela quer dizer até você escrever.

Confira no banco:

```sql
select jsonb_object_keys(schema_metadata -> 'columns') from public.datasets where id = 'UUID';
```

### 2. ⭐ A coluna nova chegou ao Admin — e só a ele

```sql
select r.name, rp.allowed_columns
  from public.role_permissions rp
  join public.roles r on r.id = rp.role_id
 where rp.dataset_id = 'UUID';
```

⭐ A linha do **Admin** tem a coluna nova. As dos outros cargos **não** — permissão é sempre
explícita, e liberar para todo mundo daria acesso que ninguém concedeu. Libere para os outros pela
tela de sempre (**Minha Organização → Cargos & Permissões**).

⚠️ Se o Admin **não** recebeu, ele não consegue perguntar sobre a coluna que acabou de acrescentar —
e o sintoma é *"seu cargo não tem acesso a nenhuma coluna"*, que aponta para o lugar errado.

### 3. ⛔ Coluna removida — o teste que importa, e faça com um cargo NÃO-Admin

Antes de apagar: escolha uma coluna que esteja no `allowed_columns` de algum cargo comum e anote.

Apague essa coluna na planilha → **Reler** → ela aparece em **Sumiram**, riscada, com o aviso de que
sai também da permissão de todos os cargos. **Aplicar**.

Rode a consulta do item 2 de novo: a coluna tem de ter sumido **das duas pontas** — do
`schema_metadata` e do `allowed_columns` de todos os cargos.

⚠️ **Por que isto é o teste central:** sobrar no `allowed_columns` é a **C12** por outra porta — a
matriz de permissões passa a citar coluna que não existe, e isso é silencioso. Ninguém percebe até
alguém pedir aquela coluna.

⭐ **A ordem dos dois updates é a defesa, e é deliberada.** Não há transação no cliente Supabase, então
a permissão sai **primeiro** e o dicionário depois. Falhar no meio deixa a coluna no dicionário e
fora da permissão — visível na matriz, e refazer resolve. Na ordem inversa, falhar no meio produziria
exatamente a C12.

### 4. ⭐⭐ Os cards e as permissões sobreviveram — é o ponto do bloco

Abra o dashboard daquela base. **Todos os cards que não dependem da coluna apagada continuam com
número.**

⚠️ É isto que separa reconciliar de recadastrar. Recadastrar criaria uuid novo e os cards ficariam
órfãos; aqui o `id` do dataset é o mesmo, porque a operação é um `update`.

Card que dependia da coluna apagada **para de responder** — e isso é correto, não regressão.

### 5. Colisão trava, igual ao passo 1 do cadastro

Crie duas colunas cujos cabeçalhos normalizem para o mesmo nome (p. ex. `Número de Peças` e
`numero de pecas`) → **Reler**.

⭐ Um bloco vermelho aparece, listando o nome interno e os dois cabeçalhos que o produziram, e **não
há botão de aplicar**. Renomeie uma na planilha e releia.

⛔ Isto barra de propósito (C11): aplicar assim faria a base perder uma coluna em silêncio — o furo
que o B13 fechou, reaberto por outra porta.

### 6. ⚠️ Trocar de base zera o diff

Releia a base A, **sem aplicar**, e clique no card da base B.

⭐ O diff tem de desaparecer. Se ele sobreviver e você apertar "Aplicar", as colunas de A entram no
dicionário de B — e nada na tela denunciaria.

## O que este bloco NÃO faz

⛔ **Não promove a versão do dicionário.** Reconciliar uma base v1 **não** a torna v2. O
`conferido = versao >= 2` afirma que uma pessoa conferiu papel analítico e grão de **cada** coluna, e
a reconciliação não pergunta nada disso. Promover faria o A3 **parar de declarar presunção** sobre
conceitos que ninguém leu — que é o oposto do que se quer.

(A coluna nova é gravada na forma v2 mesmo assim — `papel_analitico`, `vocabulario_util`. O leitor lê
esses campos independentemente da `versao`; o que a `versao` governa é se **alguém conferiu**.)

⛔ **Não renomeia coluna, e não deixa acrescentar coluna à mão.** Era o que o V3 pedia, e é a solução
errada para o problema certo: o nome normalizado é contrato com **três** lados — as chaves do
`schema_metadata`, os valores do `allowed_columns` e o cabeçalho real da planilha, que o executor
normaliza na leitura. Digitá-lo à mão quebra os três de uma vez, com falha muda ("coluna não
encontrada"). E "acrescentar coluna" criaria uma coluna que **não existe na planilha**.

⇒ O que se quer é reconciliar **com a planilha**, e é a planilha que tem a resposta.

⛔ **Não chama o Agente 1 para descrever as colunas novas.** Foi pedido sem IA neste passo; é
candidato a bloco próprio depois que isto rodar.

⛔ **Não edita grão nem observações** — é o **B23**.

## Se algo der errado

| sintoma | causa provável |
|---|---|
| *"a planilha não foi compartilhada com o Plum"* | compartilhe com `plum-polijunior@plataforma-plum.iam.gserviceaccount.com` como **Leitor** |
| Releu e **tudo** aparece em "Novas" e "Sumiram" | está lendo a **aba errada**. Conserte a aba pelo campo de conexão logo acima (cole a URL com a aba certa aberta) e releia |
| O botão diz "Nada a reconciliar" | a planilha e o dicionário já batem — é o caso feliz |
| Aplicou e o card sumiu do dashboard | o card dependia de uma coluna que saiu da planilha. Esperado |
| Coluna sumiu do dicionário mas ficou no `allowed_columns` | ⛔ a ordem dos updates inverteu, ou o segundo update falhou. É a C12 — releia e aplique de novo |
| A contagem de colunas no card da base não mudou | a lista só recarrega quando se entra/sai do cadastro. O `setDatasets` local devia ter atualizado — recarregue a página e confira o banco |
