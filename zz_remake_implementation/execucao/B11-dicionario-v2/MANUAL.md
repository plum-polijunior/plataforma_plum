# B11 · Dicionário v2 e o leitor único — manual do 👤

## ⭐ Não há nada para você fazer neste bloco

Sem migration, sem secret, sem deploy de Edge Function, sem mudança de tela. **Nem `git push` é
necessário** para o bloco valer — nada dele está no caminho de nenhuma pergunta ainda.

Isso não é um bloco pequeno por acidente: ele cria o leitor que os seis blocos seguintes usam, e
**nasce sem consumidor de propósito**. É a ordem que permite o B15 trocar o reconhecimento pelo
dicionário sem escrever o parser no meio da troca.

## Se quiser conferir mesmo assim

```bash
npx vitest run supabase/functions/_shared/dicionario.test.ts
```

Esperado: **27 passando**. É a prova de que o formato antigo (o que está gravado nas suas bases hoje)
continua sendo lido inteiro, e que nenhum `schema_metadata` estranho derruba a leitura.

## Uma consulta que passa a fazer sentido

A partir daqui o dicionário tem versão, e dá para ver quais bases já foram conferidas por gente:

```sql
select
  name,
  coalesce(schema_metadata->>'versao', '1') as versao_do_dicionario
from datasets
where status = 'active'
order by versao_do_dicionario, name;
```

Hoje **todas** vão sair como `1` — nenhuma passou pelo cadastro novo, que ainda não existe. Depois do
B14, a base que você recadastrar sai como `2`.

⭐ **Versão `1` não é defeito.** Significa que o dicionário daquela base foi deduzido e nunca revisado
por uma pessoa. O chat continua respondendo; ele só passa a ser mais cuidadoso — o A3 recebe um aviso
explícito de que os conceitos podem estar errados e declara mais presunções.

## O que vem a seguir

**B12** — ler a planilha antes de existir permissão. É o primeiro bloco com deploy (Lambda +
`ai-plum-chat`), e o primeiro que você vai conseguir testar de fora, com `curl`.

⚠️ **B12 antes de B13, sem exceção.** O cadastro invertido não funciona sem quem leia a planilha.
