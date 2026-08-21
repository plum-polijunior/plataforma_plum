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

⭐ **Olhe a `latencia_ms` do `planejador`.** Ele agora tem uma invocação só para ele, então esse
número é limpo — e é o que diz se o modelo de raciocínio cabe no orçamento de tempo. Se passar de
uns 40s, a próxima conversa é sobre streaming ou sobre um modelo mais rápido no planejador.

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

## ⭐ Não há queda para o legado — e é decisão, não descuido

**Com a chave ligada, o `ad_hoc` responde ou você vê um erro.** A queda existiu por um dia e foi
removida em 2026-08-21 a pedido do 👤: ela **escondeu a primeira falha real**. O chat respondeu
normalmente, o número saiu igual ao de antes, e só o bloco de presunções ausente denunciou que o
caminho novo não tinha respondido.

⭐ **Por isso o erro nomeia a etapa:** *"Não consegui responder agora (falhou em: planejador)"*. Sem
a rede, a mensagem na tela é a principal superfície de diagnóstico.

⚠️ **Com a chave DESLIGADA nada muda** — o legado responde inteiro, como sempre.

**Três invocações, não uma:** `ad_hoc_reconhecer` → `ad_hoc_planejar` → `ad_hoc_executar`. Juntas
elas encadeariam cinco idas à rede, sendo a última um modelo de raciocínio — foi o que derrubou o
primeiro teste, com a função terminando o trabalho e morrendo antes de responder.

## Se der errado

| Sintoma | O que fazer |
|---|---|
| Erro na tela nomeando uma etapa | É o desenho funcionando. `select codigo_erro, jsonb_pretty(resposta_agente) from plum_logs where caminho='ad_hoc' order by created_at desc limit 3` diz o resto |
| Chat responde pelo legado com a chave LIGADA | ⚠️ Não deveria mais acontecer. Se acontecer, o `ad_hoc_reconhecer` devolveu `habilitado: false` — a chave não está sendo lida |
| `planejador`/`interprete` com `modelo = gemini-3.7-flash` | Alguém apontou os dois para o modelo barato em `MODELO_POR_PAPEL`. Há teste que impede isso — se passou, me avise |
| Toda pergunta responde pelo legado, e o log mostra o `planejador` com erro do provedor | ⚠️ O modelo pode ter sido aposentado (é `-preview`). Confira o `codigo_erro`: `gemini_400`/`gemini_404` no `planejador` é isso. Trocar é uma linha em `MODELOS.RACIOCINIO` |
| Resposta sem bloco de presunções onde havia escolha | Prompt do A3. `adhoc/prompts/a3_planejador.ts` — e me diga qual escolha ficou implícita |
| O A4 fez uma conta | ⚠️ **Grave, e é o R-13 (I-02).** Me avise com a pergunta e a resposta: todo número da resposta tem de estar literalmente nos resultados |
| Ficou lento | São até 5 chamadas de LLM e 3 idas ao Lambda por pergunta. `update organizations set remake_habilitado = false;` desliga na hora, sem deploy |
| Quer desligar tudo | A chave. Sem deploy, imediato |
