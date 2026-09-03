# B17 · A suíte de avaliação — manual do 👤

⚠️ **Este bloco está ENTREGUE PELA METADE, e é a metade que o plano previa que faltaria.** O arnês
está de pé e roda; a lista de perguntas não está completa. Leia a seção "O que falta" antes de tudo.

## O que existe

```bash
PLUM_URL=https://rjwidarrsykufuifzunu.supabase.co \
PLUM_ANON_KEY=<a anon key> \
PLUM_JWT=<access token de um Admin> \
PLUM_DATASET_ID=<uuid da plum_base_suja> \
npm run avaliacao
```

Sem as quatro variáveis a suíte **se pula com um aviso**, em vez de falhar — rodar sem ambiente não
deve parecer sucesso nem erro.

⛔ **Ela não roda no `npm test`**, e o isolamento é por dois mecanismos: config separada
(`vitest.avaliacao.config.ts`) e extensão diferente (`*.eval.ts`, não `*.test.ts`). Depender só do
`include` deixaria a suíte cara a um rename de distância de entrar no CI. Ela chama modelo de
verdade e o executor real; no CI ficaria cara e instável, e o I-10 mostrou o custo de um teste que
falha por motivo alheio ao código — some a confiança na suíte inteira, não só naquele teste.

⚠️ **Use JWT de usuário, nunca `service_role`.** Metade do que se avalia é o comportamento sob RBAC
de coluna: com `service_role` o RLS não se aplica, a suíte mediria uma cadeia que nenhum usuário
executa, e um vazamento de coluna sairia verde.

## As duas metades

| | o quê | quem julga |
|---|---|---|
| **mecânica** | emitiu `std` na pergunta de dispersão? declarou presunção onde havia ambiguidade? pediu linha bruta onde agregação bastava? | `expect` — vira regressão de verdade |
| **julgamento** | a resposta está boa? | **você**, lendo o que sai no console |

⭐ A metade de julgamento sai **sempre**, mesmo quando a mecânica passa: pergunta, o porquê dela, o
plano, as presunções e a resposta final. Um verde só diz que o plano tinha a forma certa — não que a
resposta serve.

⛔ **Não tentei automatizar o julgamento.** Um `expect` sobre qualidade de prosa mediria presença de
palavra-chave, que é pior que não medir: daria verde para uma resposta errada bem escrita.

## Depois de rodar

O console imprime um `sessao_id` no começo. É por ele que se acha a execução inteira:

```sql
select etapa, status, codigo_erro, presuncoes_qtd, latencia_ms, modelo
  from plum_logs
 where sessao_id = '<o sessao_id impresso>'
 order by created_at;
```

## ⚠️ O que falta, e por que eu não completei

O plano pede **25–30 perguntas** sobre a `plum_base_suja`. Existem **14**, e elas cobrem as
verificações mecânicas que o plano nomeia explicitamente mais as regras do prompt do A3 que já
custaram caro (o R-13, o `quantile` sem `p`, o `trunc` sem `day`, a resolução de entidade).

⛔ **Não completei inventando pergunta plausível, de propósito.** As 14 dependem de suposições sobre
a base — a `inviavel-de-verdade`, por exemplo, presume que não existe nada sobre satisfação de
cliente; a `presuncao-duas-receitas` presume que há mais de uma coluna de receita. Se essas
suposições estiverem erradas, o teste mede a coisa errada **e passa**.

Uma suíte cheia de perguntas que ninguém faria mede a coisa errada com confiança, que é pior que
medir pouco. O que falta é conversa com quem usa a base, não mais linhas no arquivo.

**O que eu preciso de você:**

1. Abra `testes/avaliacao/perguntas.ts` e **confira as 14** contra as colunas reais da
   `plum_base_suja`. Ajuste `esperaAgregacao`/`exigePresuncao` onde a suposição não valer, e
   **apague** a que não fizer sentido nenhum na base — uma pergunta errada calibrada é pior que
   nenhuma.
2. Escreva 10 a 15 perguntas que você **de fato faria** a essa base. Para cada uma, diga o que
   seria um erro mecânico; eu traduzo para os campos do arquivo.
3. ⭐ Vale mais que o resto: **as perguntas que você já viu o chat errar.** Elas são o único caso em
   que a suíte tem valor comprovado desde a primeira execução.
