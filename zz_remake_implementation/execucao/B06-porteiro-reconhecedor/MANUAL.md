# B06 · A1 + A2 + cache + a chave — manual do 👤

⭐ **É o bloco em que o caminho `ad_hoc` passa a existir.** Também é o primeiro que muda o front e o
primeiro que liga a chave `remake_habilitado`, criada na Etapa 0 e sem leitor até agora.

## Antes

**1. Colar `supabase/migrations/20260820130000_plum_reconhecimento.sql`.**

Sete linhas de verificação. Duas merecem olhar:

- *"Chave unica (dataset_id, digital_dicionario)"* — sem ela o `upsert` grava linha duplicada e o
  cache **nunca acerta de verdade**. Como a gravação do cache engole o próprio erro, o sintoma seria
  "o A2 é chamado toda vez": parece custo alto, é bug.
- *"Sem policy de DELETE"* — cache derivado não se apaga. Entrada velha fica inalcançável quando o
  dicionário muda, e vira histórico de como o A2 lia a base antes da edição.

⚠️ **Confira que a migration do B04 (`20260820120000_vocabulario_exposto.sql`) já foi aplicada.** As
duas são da mesma data e a ordem numérica é a de aplicação.

## Publicar

```bash
npx supabase functions deploy ai-plum-chat --project-ref rjwidarrsykufuifzunu
```

⚠️ Confirme pelo `ezbr_sha256` (receita em `supabase/functions/README.md`). O front também mudou —
o deploy da Vercel sai do push.

## Depois — com a chave AINDA DESLIGADA

**2. Faça uma pergunta normal no chat.** Tem de responder como sempre.

O front agora dispara uma chamada extra em paralelo (`ad_hoc_planejar`), mas com
`remake_habilitado = false` ela retorna na hora, sem chamar LLM nenhum. **Nada pode ter mudado** —
nem a resposta, nem a percepção de velocidade.

**3. Confira que o log só tem `legado`:**

```sql
select caminho, etapa, count(*)
from plum_logs
where created_at > now() - interval '10 minutes'
group by 1, 2 order by 1, 2;
```

Esperado: só `legado`. Se aparecer `ad_hoc` com a chave desligada, pare — a chave não está sendo
lida, e o caminho novo está rodando em quem não pediu.

## Depois — ligando a chave numa organização de teste

**4. Ligue em UMA organização só:**

```sql
update organizations set remake_habilitado = true
where name = '<a organização de teste>';
```

**5. ⭐ Faça uma pergunta e confira os DOIS caminhos no mesmo turno:**

```sql
select caminho, etapa, status, modelo, tokens_entrada, latencia_ms, cache_hit_a2
from plum_logs
where turno_id = (select turno_id from plum_logs order by created_at desc limit 1)
order by created_at;
```

Esperado: linhas `legado` (`guard`, `plan_query`, `execute_plan`, `synthesize_answer`) **e** linhas
`ad_hoc` (`porteiro`, `reconhecedor`), com o **mesmo `turno_id`**.

⭐ **Este é o critério §0.5 do V3**, adiado desde a Etapa 0 porque não havia dois caminhos: uma
pergunta rodando com a chave ligada e o log mostrando por qual caminho cada etapa passou. Aqui ele é
melhor do que o critério pedia — os dois caminhos aparecem **na mesma pergunta**, então dá para
comparar custo e latência par a par em vez de em agregado.

**6. ⭐ Faça uma SEGUNDA pergunta na mesma base** e confira `cache_hit_a2`:

```sql
select etapa, cache_hit_a2, latencia_ms, tokens_entrada
from plum_logs
where caminho = 'ad_hoc' and etapa = 'reconhecedor'
order by created_at desc limit 4;
```

Esperado: a linha mais recente com **`cache_hit_a2 = true`**, `tokens_entrada` nulo (não houve
chamada) e latência muito menor.

É o critério de pronto do V7 §8 item 4 — *"2ª pergunta na mesma base não chama A2"* — e é a razão de
A1 e A2 serem agentes separados.

**7. Olhe o que o A2 entendeu da base:**

```sql
select jsonb_pretty(reconhecimento) from plum_reconhecimento order by created_at desc limit 1;
```

⚠️ **Se vier `colunas: {}` com observações sobre erro na planilha**, não é o A2 lendo mal — é o
executor tendo recusado o `metadados` antes. Veja a tabela de sintomas no fim. Escolha uma base sem
cabeçalho colidente para fazer este passo.

⚠️ **Aqui é onde o remake começa a poder ser julgado.** Não há teste automatizado que diga se o A2
entendeu a base direito — só leitura. Vale conferir três coisas: o `grao` está certo? Alguma coluna
recebeu `conceito` errado? As colunas com `confianca: "baixa"` são de fato as ambíguas?

⭐ Se o A2 estiver lendo mal, o A3 vai planejar mal, e nenhum ajuste no B07 conserta. **É o momento
de mexer no `adhoc/prompts/a2_reconhecedor.ts`** — e a base suja da Etapa 0 §0.3 é justamente o teste
mais duro que ele vai receber.

## ⚠️ O que este bloco NÃO faz

**Não responde pergunta pelo caminho novo.** O `ad_hoc_planejar` vai até o reconhecimento e para —
quem transforma reconhecimento em pedidos é o A3, no B07. A resposta continua vindo inteira da cadeia
atual, com a chave ligada ou desligada.

**Não busca vocabulário.** A ação devolve a lista de colunas que valeria buscar, mas ninguém busca.
Quem consome é o A3.

## Se der errado

| Sintoma | Rollback |
|---|---|
| Chat ficou mais lento com a chave ligada | Esperado até certo ponto: são duas chamadas de LLM extras por pergunta, em paralelo. Se incomodar, `update organizations set remake_habilitado = false;` — imediato, sem deploy |
| Chat quebrou depois do deploy | Republicar a versão anterior pelo painel. ⚠️ A chamada sombra é `void` + `.catch()` e **não deveria** conseguir derrubar nada — se derrubou, é bug meu e quero saber |
| O reconhecimento fala de **erro da planilha** em vez de descrever colunas | O executor recusou o `metadados`. ⭐ A frase é do `sheets.py`, não do modelo. Filtre por `codigo_erro`: `metadados_executor` (o executor recusou — mensagem em `resposta_agente`), `metadados_vazio` (veio ok e sem coluna) ou `metadados_http_<n>`. Nada é cacheado em nenhum dos casos |
| Uma coluna some das `observacoes` do A2 como *"não existe"* | ⭐ Esperado, e é informação: aquela coluna está no `allowed_columns` do cargo e **não está mais no cabeçalho da planilha**. Corrija a matriz em `Cfgdatabase.tsx?tab=permissoes`. Desde 2026-08-20 isso não derruba mais o `metadados` inteiro |
| `cache_hit_a2` nunca vira `true` | A digital do dicionário está instável. Me avise: é a canonicalização, e tem teste que deveria ter pego |
| Aparece `ad_hoc` no log de organização com a chave desligada | ⚠️ Grave. `update organizations set remake_habilitado = false;` em tudo e me avise |
