# B15 · O A3 recebe o dicionário — manual do 👤

⭐ **É o bloco em que a definição que VOCÊ escreve no cadastro passa a chegar ao planejador.** Até
agora ela era só o hash de uma chave de cache.

## Antes

**Nenhuma migration.** Mas o **B14 precisa estar no ar e a `plum_base_suja` recadastrada** — sem um
dicionário v2 para ler, este bloco só melhora as presunções de bases v1, que é a metade menos
interessante do efeito.

## Publicar

```bash
git push
npx supabase functions deploy ai-plum-chat --project-ref rjwidarrsykufuifzunu
```

O front sai no push da Vercel. ⚠️ Front e função são **par indivisível** aqui: o front passou a
mandar `dicionario` onde mandava `reconhecimento`. Função nova com front antigo recusa com
*"prompt e dicionario obrigatorios"*; front novo com função antiga passa `dicionario` para um
parâmetro que a função ignora e o A3 planeja sem saber nada da base.

## Depois — pergunte, e olhe a sequência

Faça uma pergunta no chat, na base recadastrada. Então:

```sql
select etapa, status, modelo, presuncoes_qtd, latencia_ms
  from plum_logs
 where turno_id = (select turno_id from plum_logs order by created_at desc limit 1)
 order by created_at;
```

⭐ **O critério de pronto:** a sequência tem de ser

```
porteiro → [executor (vocabulário)] → planejador → executor → interprete
```

⚠️ **Se aparecer `reconhecedor`, a função implantada é anterior a este bloco.** Confira o
`ezbr_sha256` antes de investigar qualquer prompt — é o I-03.

## O que olhar, em ordem de valor

1. ⭐ **`presuncoes_qtd` deixou de ser `NULL`.** Ele era `NULL` em **toda** linha desde o B07: a
   coluna existia, o código a passava, e o mapeamento para o banco não a incluía. Corrigido neste
   bloco.

   ⚠️ **Não há linha de base.** "Quantas presunções o A3 declarava antes do dicionário" não foi
   gravado e não é recuperável. Este bloco começa a medir; o "antes" não existe.

2. **A `versao` do dicionário que o A3 leu**, para o número acima ser interpretável:

   ```sql
   select turno_id,
          presuncoes_qtd,
          resposta_agente->'_dicionario'->>'versao'    as versao,
          resposta_agente->'_dicionario'->>'conferido' as conferido
     from plum_logs
    where etapa = 'planejador' and caminho = 'ad_hoc'
    order by created_at desc limit 20;
   ```

   Dicionário `versao: 1` faz o A3 presumir **mais**, por instrução — o prompt manda ser liberal
   quando ninguém conferiu. Comparar presunções entre v1 e v2 sem separar por versão mede a mistura.

3. ⭐ **A pergunta que rende mais:** faça uma cuja resposta depende de uma regra de negócio que só
   você sabe, e que você escreveu na etapa 4. Ex.: se você definiu *"faturamento não inclui frete"*,
   pergunte algo sobre faturamento e veja se a resposta ou a presunção mencionam isso. É a prova de
   que o texto que você digitou atravessou o sistema — o que era literalmente impossível antes.

4. **A latência caiu.** Duas etapas saíram do turno (uma chamada de LLM e uma ida ao Lambda). Some
   as `latencia_ms` do turno e compare com um turno anterior ao bloco.

## Se algo der errado

| sintoma | causa provável |
|---|---|
| *"prompt e dicionario obrigatorios"* | front antigo com função nova — force refresh |
| Resposta genérica, sem citar nada do seu dicionário | a base é v1. Confira `schema_metadata->>'versao'` |
| `status: erro`, `etapa: dicionario` | `schema_metadata` sem coluna nenhuma — base em rascunho, cadastro não finalizado |
| `reconhecedor` ainda aparece no log | a função no ar é anterior ao B15 |
