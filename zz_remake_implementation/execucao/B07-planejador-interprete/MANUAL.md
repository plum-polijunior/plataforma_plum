# B07 · A3 + A4 + presunções — manual do 👤

⭐ **É o bloco em que o remake passa a responder.** Com a chave ligada, a resposta que aparece na tela
vem do caminho novo.

## Antes

**Nenhuma migration, nenhum secret novo.** A `ANTHROPIC_API_KEY` já está criada, e é aqui que ela
começa a ser usada de verdade.

## Publicar

```bash
npx supabase functions deploy ai-plum-chat --project-ref rjwidarrsykufuifzunu
```

Confirme pelo `ezbr_sha256`. O front também mudou — sai no push da Vercel.

## Depois — com a chave DESLIGADA

**1. Faça uma pergunta.** Tem de responder pelo caminho de sempre, sem diferença nenhuma.

```sql
select caminho, count(*) from plum_logs
where created_at > now() - interval '5 minutes' group by 1;
```

Só `legado`. Se aparecer `ad_hoc`, pare.

## Depois — com a chave LIGADA

**2. Faça a mesma pergunta que já funcionava** (`quanto joão silva vendeu?`).

⭐ **Compare o número com o que o caminho antigo respondia.** Você tem a conversa de 2026-08-20:
R$ 224.042,24. Se o `ad_hoc` der outro número, é o achado mais importante que este bloco pode
produzir — e quero saber antes de qualquer ajuste de prompt.

**3. Olhe se veio o bloco de presunções.** A resposta deve terminar com algo assim:

> _Considerei:_
> - receita = receita líquida (a base tem bruta e líquida; usei a líquida)

⚠️ **Presunção ausente onde havia escolha é o defeito mais grave deste bloco** — não porque a resposta
fica feia, mas porque um número certo sobre a coisa errada fica indistinguível de um certo. Se a base
tem duas colunas de receita e a resposta não disse qual usou, o prompt do A3 precisa apertar.

**4. Veja o turno inteiro no log:**

```sql
select etapa, status, modelo, tokens_entrada, tokens_saida, latencia_ms, presuncoes_qtd
from plum_logs
where turno_id = (select turno_id from plum_logs order by created_at desc limit 1)
order by created_at;
```

Esperado, tudo com `caminho = 'ad_hoc'`: `porteiro` → `executor` (metadados) → `reconhecedor` →
[`executor` (vocabulário)] → `planejador` → `executor` → `interprete`.

⭐ **Confira o `modelo` do `planejador` e do `interprete`: têm de ser `gemini-3.1-pro-preview`.** Se
vier `gemini-3.7-flash`, alguém apontou os dois para o modelo barato e a cadeia rodou mais fraca do
que a projetada — sem nada quebrar para avisar.

⚠️ **`-preview` faz parte do ID.** Não existe `gemini-3.1-pro`: pedir aquele nome dá 400 em toda
chamada, e com a queda para o legado isso é **silencioso** — o chat responde normalmente e o remake
simplesmente não roda. Esta consulta é o único lugar onde a diferença aparece.

**5. Teste a desambiguação.** Pergunte por um nome que exista escrito de mais de um jeito na base
suja. O esperado é o chat **perguntar qual**, não escolher:

> Encontrei mais de um "João" na sua base. Qual deles?
> - JOAO DA SILVA
> - João Silva

⭐ Esse é o comportamento que o B04 inteiro existe para produzir, e a razão de o resolvedor não usar
LLM: escolher errado devolveria um número certo sobre a pessoa errada.

⚠️ Se ele não perguntar, olhe se `vocabulario_exposto` está ligado na base:
`update datasets set vocabulario_exposto = true where name = '<a base de teste>';`

**6. Teste a negação parcial.** Pergunte algo que envolva uma coluna fora do `allowed_columns` do seu
cargo, junto com uma que esteja dentro. O esperado é responder o que dá e **dizer o que faltou** —
não recusar tudo.

**7. Pergunte algo impossível para a base** ("qual a previsão do tempo amanhã?", "qual o CNPJ do
cliente?" numa base sem CNPJ). Duas recusas diferentes, e as duas são respostas legítimas: o
porteiro barra a primeira, o planejador declara a segunda `inviavel`.

## ⭐ A queda para o legado — o que torna isto seguro

**Qualquer falha do `ad_hoc` cai para o caminho antigo, em silêncio.** Você não vê erro; a pergunta é
respondida pela cadeia de sempre e o defeito fica no `plum_logs`.

Então **a ausência de defeito na tela não prova que o `ad_hoc` funcionou.** Confira sempre:

```sql
select caminho, etapa, status, codigo_erro
from plum_logs
where turno_id = (select turno_id from plum_logs order by created_at desc limit 1)
order by created_at;
```

Se houver linhas dos **dois** caminhos no mesmo turno, o `ad_hoc` tentou e caiu — e o `codigo_erro`
diz onde.

⚠️ **Duas exceções que NÃO caem:** `bloqueado` (porteiro) e `inviavel` (planejador). São respostas,
não falhas — cair ali faria a pergunta ser respondida por um caminho que o outro já tinha recusado.

## Se der errado

| Sintoma | O que fazer |
|---|---|
| Chat responde, mas sempre pelo legado | O `ad_hoc` está caindo. `select codigo_erro, jsonb_pretty(resposta_agente) from plum_logs where caminho='ad_hoc' and status='erro' order by created_at desc limit 1` |
| `planejador`/`interprete` com `modelo = gemini-3.7-flash` | Alguém apontou os dois para o modelo barato em `MODELO_POR_PAPEL`. Há teste que impede isso — se passou, me avise |
| Toda pergunta responde pelo legado, e o log mostra o `planejador` com erro do provedor | ⚠️ O modelo pode ter sido aposentado (é `-preview`). Confira o `codigo_erro`: `gemini_400`/`gemini_404` no `planejador` é isso. Trocar é uma linha em `MODELOS.RACIOCINIO` |
| Resposta sem bloco de presunções onde havia escolha | Prompt do A3. `adhoc/prompts/a3_planejador.ts` — e me diga qual escolha ficou implícita |
| O A4 fez uma conta | ⚠️ **Grave, e é o R-13 (I-02).** Me avise com a pergunta e a resposta: todo número da resposta tem de estar literalmente nos resultados |
| Ficou lento | São até 5 chamadas de LLM e 3 idas ao Lambda por pergunta. `update organizations set remake_habilitado = false;` desliga na hora, sem deploy |
| Quer desligar tudo | A chave. Sem deploy, imediato |
