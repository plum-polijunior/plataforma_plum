# B02 · Redutora × seletora — manual do 👤

## Antes

**Nenhuma migration. Nenhum deploy de Edge Function.** O B02 só mexe no executor, e o executor sobe
sozinho no push (`query-engine.yml` roda `update-function-code` para todo push em `plataforma` que
toque `query_engine/**`).

**1. Registre o `ezbr_sha256` das três funções — a foto de antes.**

### O que é esse número

A **impressão digital do código que está de fato rodando** naquela Edge Function. Não é o commit do
git, e não é o campo `version`: o `version` sobe sozinho quando você troca um secret, sem código
novo, então ele **não prova deploy nenhum** (I-03).

### Para que serve aqui

⚠️ **É mais fraco do que a primeira redação deste manual sugeria, e vale dizer por quê:**

- O B02 **não toca** `_shared/query_plan.ts` — o portão dos três consumidores não se aplica a este
  bloco.
- O valor original de tirar uma foto agora seria detectar republicação que ninguém pediu. **Isso
  caiu quando você desconectou a integração GitHub↔Supabase na Etapa 0** — era ela que publicava
  sozinha, com cobertura desconhecida.

⭐ **O que sobra, e é real:** a D-028 registra que `ai-plum-chat` roda com uma cópia **antiga** do
`query_plan.ts`, de propósito. O primeiro bloco que mexer naquele arquivo — o **B09** — tem de
publicar os três e provar que subiram. Com o número de hoje anotado, "provar" vira uma subtração;
sem ele, vira arqueologia.

### Como obter

Ele não aparece no painel. Vem da Management API, e precisa de um **token pessoal**:
*supabase.com/dashboard/account/tokens* → "Generate new token".

```powershell
$env:SUPABASE_ACCESS_TOKEN = "<cole o token aqui>"
Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/rjwidarrsykufuifzunu/functions" `
  -Headers @{ Authorization = "Bearer $env:SUPABASE_ACCESS_TOKEN" } |
  Select-Object slug, version, ezbr_sha256, updated_at | Format-Table
```

No Git Bash, o mesmo:

```bash
curl -s -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  "https://api.supabase.com/v1/projects/rjwidarrsykufuifzunu/functions"
```

⚠️ **Se o campo `ezbr_sha256` não vier nessa resposta**, use o que o `CLAUDE.md` §1 registra como
tendo funcionado em 2026-08-12 — compara conteúdo em vez de hash, e serve para o mesmo fim:

```bash
curl -s -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  "https://api.supabase.com/v1/projects/rjwidarrsykufuifzunu/functions/<nome>/body" \
  | grep -a -c "walkArithmetic"
```

Contagens **iguais** nos três (`ai-plum-chat`, `dashboard-execute`, `dashboard-agent`) significam
interpretador de RBAC igual nos três.

### O que fazer com o número

Colar **uma linha por função** no `CONTEXTO-alteracoes.md`, com a data. Não resuma em "os três
batem": o B09 vai comparar valor a valor.

```
B02 · 2026-08-19 · sha antes do push — ai-plum-chat: <…> · dashboard-execute: <…> · dashboard-agent: <…>
```

**2. Confira se algum card usa `limit` acima de 500.**

O `limit` passou a ser preso entre 1 e 500. A gramática já dizia `1..500`, mas nada aplicava — então
um card fora da faixa passaria a devolver menos linhas do que devolvia.

```sql
select id, title, query_plan->>'limit' as limite
from dashboard_cards
where (query_plan->>'limit')::int > 500;
```

Esperado: **zero linhas**. Se vier alguma, o card vai truncar em 500 depois deste push — decida se
importa antes de publicar, não depois.

## Publicar

`git push` na `plataforma`. O Lambda sobe sozinho; acompanhe a Action `query-engine`.

## Depois

**3. Abra qualquer dashboard e confira que os números não mudaram.** É o portão do §1.2 do V3. Como
os cards são de teste, "não mudaram" é olhar a tela, não levantar planilha.

**4. ⭐ Procure `[adhoc-observacao]` no CloudWatch** do grupo de log do executor, depois de um dia de
uso normal.

Esse prefixo aparece quando um plano do **caminho legado** teria sido recusado pelo teto de
cardinalidade. A regra não recusa lá — só registra. É exatamente o dado que falta para decidir, no
B08, se ela pode passar a valer no dashboard também.

- **Nenhuma ocorrência** → ótimo sinal: nenhum card agrupa por coluna de texto com mais de 200
  valores distintos, e ligar a regra no legado será barato.
- **Muitas ocorrências** → a regra não pode ser ligada no legado sem antes olhar caso a caso. Anote
  quais colunas aparecem; é insumo do B08.

**5. Não há nada a testar no caminho `ad_hoc`.** Ele não existe ainda — nasce no B06. A cobertura
deste bloco é `pytest` (19 casos novos em `test_privacidade.py`), e é assim de propósito: o bloco
entrega uma regra antes do consumidor dela, pelo mesmo motivo que o V3 põe o B02 antes dos agentes.

## Se der errado

| Sintoma | Rollback |
|---|---|
| Um card passou a mostrar menos linhas | É o clamp de `limit` (passo 2). Ajuste o `limit` do card para ≤500 — o teto está certo, o card é que estava fora da gramática |
| Um card quebrou com "Agrupar por … devolveria os valores da coluna um a um" | **Não deveria acontecer**: a regra só recusa quando `caminho = "ad_hoc"`, e nada manda isso ainda. Se acontecer, reverta o commit do `query_engine/` e me avise — é bug, não configuração |
| Precisa desligar tudo rápido | `git revert` do commit e push. O Lambda volta em um minuto, sem painel nenhum |
