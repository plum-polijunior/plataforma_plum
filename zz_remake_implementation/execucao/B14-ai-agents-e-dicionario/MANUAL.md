# B14 · `ai-agents` e o dicionário v2 — manual do 👤

⭐ **É o bloco em que a etapa 4 do cadastro muda de verdade.** Ela ganha o grão da base, as
observações, e por coluna o papel analítico e a caixa de vocabulário.

## Antes

**Nenhuma migration.** Mas **B12 e B13 precisam estar no ar**, e o `PROXIMO-PASSO.md` registrava os
dois como commitados e não publicados. Confira antes de tudo.

## Publicar

⚠️ **É o primeiro deploy de `ai-agents` em todo o remake.** Vale o cuidado do I-03: publicar à mão e
confirmar pelo `ezbr_sha256`, nunca pelo `version` (que sobe sozinho em mudança de secret).

```bash
git push
npx supabase functions deploy ai-agents     --project-ref rjwidarrsykufuifzunu
npx supabase functions deploy ai-plum-chat  --project-ref rjwidarrsykufuifzunu
```

⚠️ **Os dois, e nesta ordem não importa — mas os dois.** O `ai-agents` passou a consumir
`_shared/llm.ts`, `llm/gemini.ts`, `llm/claude.ts`, `llm_core.ts` e `perfil.ts`; o `ai-plum-chat`
leva a ação `perfil_do_cadastro` e o `perfil.ts` também. `_shared/` é empacotado **por função**:
publicar um só deixa duas cópias divergentes da regra de vocabulário em produção, e a divergência
**não avisa** — os dois lados ficam internamente coerentes (D-028).

Confira quais funções mudaram de `ezbr_sha256`:

```bash
npx supabase functions list --project-ref rjwidarrsykufuifzunu
```

O front sai no push da Vercel.

## Depois — cadastre a `plum_base_suja` de novo

⚠️ **Não delete a base anterior.** Cadastre como nova; deletar levaria os cards e a matriz de
permissões por CASCADE (**C13**).

1. Cole a URL, siga até a **etapa 3 (Formatação)** como sempre.
2. Clique em **"Prever Semântica com IA"**. Você vai ver dois toasts novos antes do Agente 1:
   *"Lendo o perfil da base"* e depois *"A IA está descrevendo as colunas e o grão da base"*.
   A primeira é a leitura do perfil; ela demora mais que antes, porque conta a base inteira.
3. Na **etapa 4**, confira nesta ordem:

   - ⭐ **O grão.** *"O que UMA LINHA da planilha representa?"* É o campo que mais muda resposta e o
     que a IA mais erra. "uma venda" e "um dia por loja" fazem a mesma soma significar coisas
     diferentes.
   - **As observações.** No máximo três. Apague o que não fizer sentido — elas vão para o prompt do
     planejador em toda pergunta.
   - **O papel de cada coluna.** Procure especificamente por **identificador marcado como
     dimensão**: se um CPF, um código de pedido ou um CEP estiver como "Dimensão", corrija. É o erro
     que faz o chat tentar agrupar por aquela coluna.
   - **A caixa de vocabulário**, que só aparece em dimensão. Ligada significa que o chat pode
     consultar a lista de valores daquela coluna — é o que permite casar *"joão silva"* com o
     literal da base.

4. **Finalize e salve.**

## Confirme que o dicionário nasceu v2

```sql
select name,
       schema_metadata->>'versao'      as versao,
       schema_metadata->>'grao'        as grao,
       jsonb_array_length(coalesce(schema_metadata->'observacoes', '[]'::jsonb)) as obs
  from datasets
 where organization_id = '<sua org>'
 order by created_at desc
 limit 5;
```

⭐ **O critério de pronto do bloco:** `versao` = `2`, o `grao` é a frase que **você** deixou na tela
(corrija uma de propósito, para conferir que a correção sobreviveu), e uma coluna tem o
`papel_analitico` que você escolheu:

```sql
select schema_metadata->'columns'->'<uma_coluna>' from datasets where id = '<uuid>';
```

## Se algo der errado

| sintoma | causa provável |
|---|---|
| *"Esta base ainda nao teve as colunas liberadas"* | o grant do Admin não rodou no passo 1 — o B13 não está no ar |
| *"O perfil do cadastro e so durante o cadastro"* | a base já está `active`; comece um cadastro novo |
| A etapa 4 abre sem grão e sem observações | o perfil não veio. Não é fatal, mas o console tem `[perfil-cadastro]` com o motivo |
| Todas as colunas viraram "Dimensão" | o perfil falhou e caiu no default. Mesmo console acima |
| `[agent-1] modelo=gemini-3.7-flash` no log | os papéis novos não subiram — `ai-agents` está numa versão anterior |
