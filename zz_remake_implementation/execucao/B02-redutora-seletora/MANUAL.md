# B02 · Redutora × seletora — manual do 👤

## Antes

**Nenhuma migration. Nenhum deploy de Edge Function.** O B02 só mexe no executor, e o executor sobe
sozinho no push (`query-engine.yml` roda `update-function-code` para todo push em `plataforma` que
toque `query_engine/**`).

**1. Registre o `ezbr_sha256` das três funções — o marco zero da etapa.**

Não é para este bloco: é para os próximos. `ai-plum-chat`, `dashboard-execute` e `dashboard-agent`
compartilham uma cópia de `_shared/query_plan.ts` cada, e a do `ai-plum-chat` está **antiga de
propósito** (D-028). O primeiro bloco que tocar aquele arquivo precisa fechar a divergência, e sem o
número de hoje não há como saber se ela fechou.

Anote os três no `CONTEXTO-alteracoes.md`. ⚠️ **`version` não serve** — ele sobe em troca de secret,
sem código novo (I-03).

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
