# B12 · Ler a planilha antes de existir permissão — manual do 👤

⭐ **Nada muda na tela.** O cadastro continua exatamente como está — quem o inverte é o **B13**. Este
bloco só cria a peça de servidor que torna a inversão possível, e ela é conferível de fora.

## Antes

**Nenhuma migration, nenhum secret novo.**

## Publicar

São dois, e o Lambda vai primeiro (pelo push).

**1. O executor:**

```bash
git push
```

⚠️ **Confira que a Action `query-engine` terminou verde antes de seguir.** O smoke test roda
**depois** do `update-function-code` (C4b), então uma falha só aparece com o executor já substituído
— foi assim que ele caiu em 2026-08-21 (I-09).

**2. A Edge Function:**

```bash
npx supabase functions deploy ai-plum-chat --project-ref rjwidarrsykufuifzunu
```

Confirme pelo `ezbr_sha256` — receita em `supabase/functions/README.md`, seção *"Como confirmar que o
deploy subiu"*. ⛔ Nunca pelo `version`.

⚠️ Este deploy leva junto **B07-bis, B09 e B10**, que ainda não estavam no ar. Depois dele, o
orçamento de linhas do B10 passa a valer de verdade.

## Depois — o teste que prova o bloco

O front ainda não chama a ação nova, então a conferência é por `curl`. São três passos.

### 1. Pegue seu token de acesso

Com o Plum aberto e você logado, abra o DevTools (`F12`) → aba **Console** e cole:

```js
JSON.parse(localStorage.getItem(
  Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'))
)).access_token
```

Copie o texto que sair (sem as aspas). Ele vale cerca de uma hora.

### 2. Pegue o id de uma base ativa

No SQL Editor:

```sql
select id, name, google_sheet_id from datasets where status = 'active' order by name;
```

### 3. Chame a ação

No PowerShell, com os dois valores preenchidos:

```powershell
$TOKEN = "<cole o access_token do passo 1>"
$DATASET = "<cole o id do passo 2>"
$ANON = "<a chave anon do projeto — Settings > API > anon public>"

$body = @{ action = "cabecalhos_da_planilha"; datasetId = $DATASET } | ConvertTo-Json

Invoke-RestMethod `
  -Uri "https://rjwidarrsykufuifzunu.supabase.co/functions/v1/ai-plum-chat" `
  -Method Post `
  -Headers @{ Authorization = "Bearer $TOKEN"; apikey = $ANON } `
  -ContentType "application/json" `
  -Body $body | ConvertTo-Json -Depth 5
```

**Esperado:**

```json
{
  "status": "ok",
  "aba": "Vendas",
  "colunas": [ { "original": "Faturamento", "nome": "faturamento" }, ... ],
  "row_count": 1200,
  "colisoes": {},
  "colunas_sem_titulo": 0
}
```

⭐ **O que olhar:**

- **`colunas`** tem o nome **original** da planilha e o **normalizado**. O normalizado é o que vira
  chave do `schema_metadata` e do `allowed_columns`.
- **`colisoes`** vazio é o esperado. Se vier preenchido, aquela base tem dois cabeçalhos que viram o
  mesmo nome — e uma das colunas **já está faltando** no cadastro atual dela. É a pendência C11
  aparecendo pela primeira vez em vez de sumir calada.
- **`row_count`** é o tamanho da **grade**, não o número de linhas preenchidas (o Sheets aloca linhas
  vazias). Serve para ordem de grandeza; quem conta de verdade é o `metadados`.

### 4. Teste que a porta está fechada para quem não deve entrar

Repita o passo 3 com um `datasetId` **de outra organização** (ou um uuid inventado):

```
{"error": "base nao encontrada"}
```

⭐ Esse é o teste mais importante do bloco. Esta é a única ação do sistema que roda **antes de existir
permissão de coluna**, então ela confere identidade à mão — sessão, perfil ativo, cargo Admin e **a
base ser da sua organização**. Sem a última, seria um leitor de planilha alheia para quem soubesse um
uuid.

Se você tiver um usuário não-Admin à mão, vale testar com ele também: esperado
`{"error": "apenas administradores cadastram bases"}`.

## Se der errado

| Sintoma | O que fazer |
|---|---|
| `"A planilha nao foi compartilhada com o Plum"` | É a resposta certa para planilha não compartilhada. Compartilhe com `plum-polijunior@plataforma-plum.iam.gserviceaccount.com` como Leitor |
| `"Esta base ainda nao tem o link da planilha"` | A base foi cadastrada antes de o `google_sheet_id` existir. Recadastre-a |
| `401` | O token expirou (dura ~1h). Repita o passo 1 |
| `"apenas administradores cadastram bases"` sendo você Admin | O cargo no banco não se chama exatamente "admin". Confira em `select name from roles` |
| `colisoes` preenchido numa base que funciona | ⚠️ Não é falso positivo: aquela base tem mesmo uma coluna faltando no dicionário. Me avise qual |

## O que vem a seguir

**B13** — a inversão do cadastro: a URL da planilha vira o passo 1 e o upload de arquivo some.

⚠️ **B12 antes de B13, sem exceção** — e é por isso que este deploy precisa estar verde antes de eu
mexer na tela.
