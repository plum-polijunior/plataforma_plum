# B13 · A inversão do cadastro — manual do 👤

⭐ **É o bloco que você vê.** A tela de cadastro de base muda de verdade: o upload de arquivo some, a
planilha do Google vira o primeiro passo, e o fluxo passa de 5 para 4 etapas.

## Antes

**Nenhuma migration.** Mas o **B12 precisa estar no ar** — o cadastro novo não funciona sem quem leia
a planilha. Se você ainda não seguiu o `MANUAL.md` do B12, siga antes deste.

## Publicar

```bash
git push
npx supabase functions deploy ai-plum-chat --project-ref rjwidarrsykufuifzunu
```

O front sai no push da Vercel. A Edge Function leva a ação nova (`amostra_do_cadastro`) — confirme
pelo `ezbr_sha256`.

## Depois — cadastre a `plum_base_suja` pelo fluxo novo

⚠️ **Não delete a base antiga.** Cadastre como uma base nova; a antiga fica lá. Deletar levaria junto
os cards e a matriz de permissões, por CASCADE (**C13**).

### Etapa 1 — Planilha

Cole o link da planilha e clique em **Ler a planilha**.

⭐ **O que deve acontecer:** as colunas aparecem na etapa 2 em segundos, sem você ter subido arquivo
nenhum. Se aparecer *"a planilha não foi compartilhada com o Plum"*, compartilhe com
`plum-polijunior@plataforma-plum.iam.gserviceaccount.com` como **Leitor** e tente de novo.

### Etapa 2 — Colunas

Confira a lista. São os cabeçalhos **reais** da planilha, normalizados.

⭐ **O caso que mais interessa:** se duas colunas colidirem, um bloco vermelho aparece e o botão de
avançar fica **desabilitado**, dizendo qual nome interno colidiu e quais cabeçalhos o produziram.

> `numero_de_pecas` ← "Número de Peças" e "numero de pecas"

Renomeie uma delas na planilha, volte e clique em **Reler planilha**. ⚠️ Isso barra de propósito:
seguir criaria a base com uma coluna a menos no dicionário — que é o que acontecia **calado** até
agora (C11).

Se a planilha tiver coluna sem título, aparece um aviso cinza. Ele **não** barra: coluna sem nome não
é consultável, e ignorá-la é o certo.

### Etapas 3 e 4 — Formatação e Semântica

Iguais ao que você já conhece, com uma diferença: as linhas que a IA analisa vêm **da planilha**, não
de um arquivo. São **20** agora, não 5.

⭐ Ao clicar em *"Tudo certo"* na etapa 2, o Plum lê a planilha antes de chamar o Agente 3 — pode
demorar um ou dois segundos a mais que antes.

### Fim

O botão da etapa 4 agora é **Finalizar e Salvar Base**. Não há mais etapa 5.

## Confira no banco

```sql
select
  name,
  status,
  google_sheet_id is not null as tem_planilha,
  jsonb_object_keys_count(schema_metadata->'columns') as colunas
from datasets
where organization_id = (select organization_id from profiles where id = auth.uid())
order by name;
```

⚠️ Se `jsonb_object_keys_count` não existir no seu Postgres, use esta:

```sql
select
  d.name,
  d.status,
  d.google_sheet_id is not null as tem_planilha,
  (select count(*) from jsonb_object_keys(d.schema_metadata->'columns')) as colunas
from datasets d
order by d.name;
```

⭐ **O que olhar:** a base nova tem `status = active` e um número de colunas igual ao que você viu na
etapa 2. Se tiver **uma a menos**, houve colisão que passou — me avise, porque o bloqueio falhou.

E confira que o cargo Admin foi liberado logo no começo:

```sql
select r.name as cargo, array_length(rp.allowed_columns, 1) as colunas_liberadas
from role_permissions rp
join roles r on r.id = rp.role_id
where rp.dataset_id = '<id da base nova>';
```

## ⭐ Um teste que vale fazer

Depois de finalizar, tente pedir a amostra ampliada de novo (o `curl` do MANUAL do B12, trocando a
ação para `amostra_do_cadastro`):

```
{"error": "Esta base ja foi finalizada; a amostra ampliada e so do cadastro."}
```

É a porta das 20 linhas fechando. Ela só existe enquanto a base está sendo criada — depois disso vale
o teto de 5 do chat e o orçamento do B10.

## Se der errado

| Sintoma | O que fazer |
|---|---|
| *"seu cargo não tem acesso a nenhuma coluna"* no meio do cadastro | ⚠️ O grant do passo 1 falhou. Me mande o console do navegador — procure `Falha ao liberar colunas` |
| A etapa 3 não carrega as linhas | A base pode ter saído de `processing`. Confira o `status` no SQL acima |
| As colunas aparecem mas com nomes estranhos | São os cabeçalhos reais normalizados. Se estiverem errados, o cabeçalho da planilha é que está |
| Colisão que você não consegue resolver | Renomear na planilha é o único caminho — sufixo automático foi recusado (o `_2` trocaria de dono ao reordenar colunas) |
| Base antiga sumiu da lista | Não deveria: nada é deletado. Confira `select name, status from datasets` |

## O que vem a seguir

**B14** — `ai-agents` reorganizado, etapas 3 e 4 em modelo de raciocínio, e a etapa 4 absorvendo o
que o A2 fazia no chat (grão, observações, papel analítico, vocabulário útil).
