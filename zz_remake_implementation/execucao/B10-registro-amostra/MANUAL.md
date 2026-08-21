# B10 · `registro`, `amostra` e o orçamento — manual do 👤

⭐ **É o último bloco da Etapa 1**, e o único em que o sistema devolve **linha da planilha** para o
chat. Tudo que veio antes era agregado; aqui sai o dado como ele é, no máximo 5 linhas por pedido e
200 por dia.

## Antes

**Nenhuma migration, nenhum secret novo.** O orçamento usa a coluna `linhas_brutas_entregues` do
`plum_logs`, que existe desde a Etapa 0.

## Publicar

São **dois** artefatos, e desta vez a ordem importa.

**1. O executor (Lambda), pelo push:**

```bash
git push
```

⚠️ **Confira que a Action `query-engine` terminou verde** antes de seguir. O smoke test roda
**depois** do `update-function-code` (C4b), então uma falha só aparece com o executor já substituído
— foi assim que ele caiu em 2026-08-21 (I-09).

**2. A Edge Function, à mão:**

```bash
npx supabase functions deploy ai-plum-chat --project-ref rjwidarrsykufuifzunu
```

⚠️ **Este deploy não é opcional e não pode ficar para depois.** O Lambda já publicado aceita
`registro` e `amostra`; quem conta as linhas é a Edge Function. Entre um deploy e o outro, o
orçamento simplesmente não existe.

**Confirme que subiu**, pelo `ezbr_sha256` — nunca pelo `version`, que muda por qualquer troca de
secret. A receita completa (como pegar o token, o comando do PowerShell e o que comparar) está em
`supabase/functions/README.md`, seção *"Como confirmar que o deploy subiu"*.

## Depois

Tudo abaixo é **com a chave do remake ligada** para a sua organização.

### 1. Peça uma linha e veja se ela vem

Pergunte algo que só uma linha responde:

> *"me mostra um exemplo de linha dessa base"*

Esperado: até 5 linhas na tela. Se vierem mais que 5, pare e me avise — é o teto por pedido furado, e
é o pior defeito possível deste bloco.

### 2. Confirme que o gasto foi registrado

```sql
select etapa, status, linhas_brutas_entregues, resposta_agente
from plum_logs
where caminho = 'ad_hoc' and linhas_brutas_entregues > 0
order by created_at desc limit 5;
```

⭐ **Tem de haver uma linha com `linhas_brutas_entregues` preenchido.** Se as linhas apareceram na
tela e esta consulta não devolve nada, o débito não gravou — e aí o orçamento é decorativo. É
exatamente o cenário que o bloco trata como falha: você deveria ter visto na tela *"Não consegui
registrar o uso desta consulta"* em vez da resposta.

### 3. Veja o saldo consumido

```sql
select sum(linhas_brutas_entregues) as gasto_24h
from plum_logs
where user_id = auth.uid()
  and dataset_id = '<o id da base que você usou>'
  and created_at > now() - interval '24 hours';
```

Este número é o seu orçamento gasto. O teto é **200**.

⚠️ **Ele é por pessoa, por base.** Um colega gastando a cota dele não mexe na sua, e outra base tem
saldo próprio. Se você quiser zerar para testar de novo, use outra base — ⛔ **não apague linha do
`plum_logs`**, ele é append-only de propósito.

### 4. ⭐ Force a negação — é o teste que importa

Faça uns 40 pedidos de linha na mesma base (ou rode o passo 1 umas 40 vezes) até o gasto passar de
200. A partir daí:

- perguntas que pedem **linha** devem ser recusadas com uma frase — *"Você já viu o máximo de linhas
  detalhadas desta base nas últimas 24 horas"*;
- perguntas que **somam, contam ou agrupam** devem continuar respondendo **normalmente**.

⚠️ Se a agregação também parar de funcionar, o orçamento está cobrando de quem não devolve linha — e
isso empurraria o planejador a agregar menos, que é o contrário do que ele existe para fazer.

⭐ **E se uma pergunta misturar as duas coisas** ("quanto vendemos e me mostra um exemplo"), a parte
agregada deve vir e só a parte de linha ser negada, com o motivo dito. Negar o turno inteiro seria
perder de graça o que dava para responder.

### 5. Confira que `registro` sem filtro é recusado

> *"me lista 5 clientes"*

Sem um critério, isso é **amostra**, não registro. O A3 deve emitir `amostra` (5 linhas quaisquer).
Se ele emitir `registro` sem `where`, o executor recusa e você verá um erro no card — o que é o
comportamento certo, mas significa que o prompt precisa apertar. Me diga a pergunta.

## ⭐ O que mudou para o usuário

| | antes | agora |
|---|---|---|
| "me mostra um exemplo de linha" | inviável — só saía agregado | até 5 linhas |
| "qual foi o pedido P-4471?" | inviável | as linhas que casam com o filtro |
| quanto disso por dia | — | 200 linhas, por pessoa, por base |
| perguntas que somam/agrupam | sem limite | **sem limite, igual** |

## Se der errado

| Sintoma | O que fazer |
|---|---|
| Vieram mais de 5 linhas | **Pare e me avise.** Teto furado, é o defeito mais grave daqui |
| Linhas na tela, nada em `linhas_brutas_entregues` | Débito não gravou. Me mande o log da função (`[orcamento]`) |
| Tudo é negado, inclusive agregação | O orçamento está cobrando de quem não devolve linha. Me avise |
| Tudo é negado logo na primeira pergunta | A **leitura** do saldo falhou, e ela falha fechada de propósito. Procure `[orcamento] leitura do saldo falhou` no log |
| Voltou coluna que você não pediu | Me mande o card. O recorte é o `select` ∩ o que seu cargo permite |
| O A3 nunca pede linha, mesmo quando é o certo | Prompt, não código. Me diga a pergunta que deveria ter pedido |
