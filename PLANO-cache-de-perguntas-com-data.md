# PLANO — Estender o cache de Query Plan para perguntas com data relativa

**Data:** 2026-08-12 · **Estado:** ⛔ **AVALIADO E RECUSADO EM 2026-08-12.**
Não é tarefa pendente — é uma porta que foi aberta, olhada e fechada de
propósito.

> **Motivo da recusa, na palavra de quem decidiu:** `date_ref` é "mais uma
> camada de imprevisibilidade para um produto multi-tenant que já trabalha com
> uma gama de bancos de dados diferentes".
>
> O raciocínio se sustenta: o vocabulário relativo teria de produzir o recorte
> certo em toda base de todo cliente, com colunas de data de tipos e formatos
> que o Plum não controla — e o modo de falhar é justamente o que este produto
> menos pode permitir, um número errado com cara de certo (R-02 e R-13 do
> `CLAUDE.md`). Trocar economia de token por esse risco não compensa enquanto
> o produto ainda está estabilizando a leitura das bases.
>
> **O que vale hoje:** plano com qualquer data fica fora do cache
> (`planoTemData`, `src/lib/plano-cache.ts`). Perguntas datadas passam pelo
> Agente A todas as vezes, como sempre passaram.
>
> **Quando reabrir:** se a economia de token virar problema real e medido, e
> se houver confiança na normalização de coluna de data entre bases. O plano
> abaixo continua válido como ponto de partida — inclusive a distinção do §2,
> que é a parte que não é óbvia.

O documento segue como estava no momento da avaliação.

---

O cache de plano entregue em 2026-08-12 **exclui** qualquer plano com data.
Este documento descrevia como incluir a maior parte dessas perguntas com
segurança.

---

## 1. Por que as perguntas com data ficaram de fora

O prompt do Agente A recebe a data de hoje interpolada
(`supabase/functions/ai-plum-chat/index.ts:317` e `:356` — `Hoje é ${hoje}`).
Então "quanto faturei hoje", perguntado em 12/08, gera:

```json
{ "where": { "left": "data_venda", "op": "between",
             "right": ["2026-08-12", "2026-08-12"] } }
```

Guardar e reusar esse plano em 13/08 devolveria o faturamento do **dia
anterior** — sem erro, sem aviso, com cara de resposta certa. O `CLAUDE.md`
registra dois incidentes desse tipo (o intervalo que perdia o primeiro dia; a
receita calculada como soma × média), e os dois viraram regra escrita. Por isso
a versão entregue é conservadora: plano com data não entra no cache.

## 2. A observação que destrava o caso

Uma data no plano pode ter duas origens completamente diferentes, e hoje o
sistema não distingue:

| Origem | Exemplo de pergunta | O que deve acontecer ao reusar |
|---|---|---|
| **Relativa** | "quanto faturei **hoje**" | **Recalcular** para o dia da execução |
| **Absoluta** | "quanto faturei **em 12 de agosto**" | **Preservar** — a pessoa quis aquele dia |

O plano gerado é textualmente idêntico nos dois casos: `["2026-08-12",
"2026-08-12"]`. A informação que distingue os dois — se o usuário disse "hoje"
ou disse "12 de agosto" — **é perdida** no momento em que o Agente A resolve a
data. Recuperá-la depois, olhando o plano, é impossível.

Daí a conclusão que orienta este plano: **a distinção tem de ser feita por quem
tem o contexto, que é o Agente A**, e precisa ser gravada no plano.

E a segunda observação, também correta: "faturamento no ano" e "faturamento
deste ano" produzem o mesmo recorte semântico. Uma vez que o plano carregue
"este ano" como um símbolo em vez de duas datas, ele passa a valer para
qualquer execução futura — o cache deixa de envelhecer.

## 3. Proposta: `date_ref`, um marcador relativo no Query Plan

Acrescentar ao Query Plan uma forma alternativa de expressar o lado direito de
um filtro de data. Em vez de:

```json
{ "left": "data_venda", "op": "between", "right": ["2026-08-12", "2026-08-12"] }
```

o Agente A emitiria, **quando e somente quando** o usuário usou um termo
relativo:

```json
{ "left": "data_venda", "op": "between", "right": { "date_ref": "hoje" } }
```

Vocabulário fechado, pequeno e coberto por teste — nada de expressão livre:

| `date_ref` | Intervalo resolvido na execução |
|---|---|
| `hoje` | \[D, D] |
| `ontem` | \[D-1, D-1] |
| `esta_semana` | \[segunda desta semana, D] |
| `semana_passada` | \[segunda a domingo da semana anterior] |
| `este_mes` | \[dia 1 do mês, D] |
| `mes_passado` | \[dia 1 ao último dia do mês anterior] |
| `este_ano` | \[1º de janeiro, D] |
| `ano_passado` | \[1º de janeiro a 31 de dezembro do ano anterior] |
| `ultimos_7_dias` | \[D-6, D] |
| `ultimos_30_dias` | \[D-29, D] |

Se o usuário disse uma data concreta, o Agente A continua emitindo o literal de
sempre — e aquele plano continua fora do cache, que é o comportamento correto:
a pergunta é sobre um dia fixo, e reusar o plano devolveria exatamente o que se
pediu, mas o plano também não envelhece, então cachear seria inofensivo. A
decisão conservadora é manter fora até haver motivo.

### Onde `date_ref` é resolvido: no servidor, nunca no cliente

`supabase/functions/ai-plum-chat/index.ts`, dentro de `handleExecutePlan`,
**antes** de `authorizePlan` e antes de assinar o payload. Uma função pura
`resolverDatasRelativas(plan, hoje)` que devolve um plano novo com os
`date_ref` substituídos por literais.

Três razões para ser ali, e não no navegador:

1. **O fuso.** O executor Python e o Postgres trabalham em UTC
   (`timezone('utc', now())` em todo o schema). Resolver "hoje" no relógio do
   navegador faria o resultado depender de onde a pessoa está — e às 21h em
   São Paulo já é o dia seguinte em UTC. A resolução tem de acontecer no mesmo
   lugar que define o "hoje" do resto do sistema.
2. **A ordem em relação ao RBAC.** `authorizePlan` extrai as colunas de
   `where` recursivamente (`_shared/query_plan.ts`, `walkWhere`). Resolver
   depois dele deixaria o RBAC olhando uma forma do plano diferente da que vai
   executar — exatamente o tipo de discrepância que o cabeçalho de
   `query_plan.ts` avisa que vira bypass ("quando duas travas discordam, quem
   passa é a mais frouxa").
3. **O cliente não é autoridade.** Se o navegador resolvesse, `date_ref`
   viraria mais um campo que o cliente declara — e a regra 1 do `CLAUDE.md` §4
   é que nenhuma decisão pode depender de dado enviado pelo cliente.

## 4. Onde cada peça muda

**`supabase/functions/_shared/query_plan.ts`**
- `walkWhere` precisa reconhecer `{"date_ref": "..."}` como folha e **não**
  tentar extrair coluna dela. Hoje ele varre o `right` procurando strings; um
  objeto novo ali não quebra (o `addCol` descarta o que não é string), mas
  vale um teste explícito para garantir que `date_ref` nunca conte como coluna
  e nunca escape do RBAC.
- Exportar `resolverDatasRelativas(plan, hoje)` daqui, e não de dentro do
  `ai-plum-chat`: é o mesmo motivo de o `authorizePlan` viver aqui — o
  `dashboard-agent` também gera planos, e cards com "faturamento deste mês"
  são o caso de uso mais óbvio dessa feature depois do chat. **Um
  interpretador, dois pontos de aplicação.**

**`supabase/functions/ai-plum-chat/index.ts`**
- Prompt do Agente A (`:340-358`): acrescentar a regra do `date_ref` com a
  tabela do vocabulário, e a instrução explícita de que **data mencionada de
  forma concreta continua virando literal**. Vale um exemplo de cada lado, no
  estilo das regras que já existem ali.
- `handleExecutePlan` (`:80`): chamar `resolverDatasRelativas` logo no começo,
  antes de `authorizePlan` (`:173`).
- ⚠️ Ao mexer na gramática do plano, o checklist do `CLAUDE.md` §9 vale:
  **dois** prompts emitem Query Plan (Agente A e Tarsila do Amaral) e **três**
  lugares interpretam (`_shared/query_plan.ts`, `pandas_executor.py`, e as
  tabelas de teste). O `dashboard-agent` pode ficar sem `date_ref` numa
  primeira leva, mas o interpretador precisa aceitar planos que o tenham.

**`query_engine/pandas_executor.py`**
- Em princípio **não muda**: o plano chega ao Lambda já com as datas
  resolvidas. Confirmar isso é item de verificação, não de implementação.

**`src/lib/plano-cache.ts`**
- `planoTemData` passa a distinguir: plano com `date_ref` é **cacheável**;
  plano com literal de data continua fora. Hoje a função responde "tem data?";
  passa a responder "tem data que envelhece?".
- `canonicalizarPlano` não muda — `{"date_ref":"hoje"}` é só mais um objeto, e
  a ordenação de chaves já o cobre.

**`src/pages/PlumChat.tsx`**
- Nada. O cliente continua gravando o plano como veio e mandando de volta em
  `execute_plan`; a resolução acontece no servidor, invisível para ele.

## 5. O ganho, e por que ele é maior do que parece

Com escopo por usuário (a decisão desta leva), o cache atual quase não dispara:
exige a mesma pessoa repetindo a mesma pergunta sem data 5 vezes. As perguntas
que **de fato** se repetem em um produto de operação são justamente as datadas
— "quanto vendi hoje", "como está o mês". Este plano devolve essa classe
inteira ao cache.

E há um efeito de segunda ordem: um plano com `date_ref` **não envelhece
nunca**. Enquanto um plano datado seria válido por um dia, um com
`{"date_ref":"hoje"}` acumula repetições indefinidamente — o que torna o limiar
de 5 alcançável de verdade, mesmo com escopo por usuário.

## 6. Riscos, e o que fazer com cada um

| Risco | Mitigação |
|---|---|
| O Agente A usar `date_ref` onde o usuário deu data concreta | O vocabulário é fechado e o prompt traz exemplo dos dois lados. Um caso em `testes/chat/` com "faturamento em 12 de agosto" deve produzir literal, não `date_ref`. |
| Fuso: "hoje" em UTC ≠ "hoje" em São Paulo | Decisão consciente e **documentada na tela**, não escondida. O sistema inteiro já é UTC; resolver `date_ref` em UTC é consistente. Se um dia a organização precisar de fuso próprio, é coluna em `organizations` e entra em `resolverDatasRelativas` como parâmetro. |
| `esta_semana` começa domingo ou segunda? | Fixar **segunda** (ISO-8601, e é o que faz sentido no Brasil comercial), escrever no prompt, e cobrir com teste. Ambiguidade não resolvida aqui vira número diferente do que a pessoa esperava. |
| Plano antigo, gravado antes desta mudança, com literal de data | Continua fora do cache pela regra atual. Nenhuma migração de dados é necessária — os planos velhos simplesmente nunca vencem a contagem. |
| Cache servir plano `date_ref` para pergunta que mudou de sentido | Não muda nada em relação a hoje: o lookup continua exigindo o texto exato da pergunta. |

## 7. Verificação

1. **Testes puros** (`src/lib/plano-cache.test.ts` e um novo para
   `resolverDatasRelativas`): cada entrada do vocabulário, com uma data-base
   fixa passada por parâmetro — nunca `new Date()` dentro do teste, senão o
   teste passa a depender do dia em que roda. Incluir viradas de mês e de ano
   (`mes_passado` em 1º de janeiro) e ano bissexto.
2. **RBAC**: um plano com `date_ref` cuja coluna de data não está em
   `allowed_columns` **tem** de voltar `forbidden`. É o teste que garante que
   o campo novo não virou um buraco no `walkWhere`.
3. **Ponta a ponta**, no chat: perguntar "quanto faturei hoje" cinco vezes,
   confirmar que da quinta em diante o log mostra reuso de plano e que o
   número continua sendo o do dia corrente — o jeito mais direto de conferir é
   repetir no dia seguinte e ver o número mudar.
4. **Regressão do caso absoluto**: "faturamento em 12 de agosto" tem de
   continuar devolvendo 12 de agosto, hoje e sempre.

## 8. Sequência sugerida

1. `resolverDatasRelativas` + testes, em `_shared/query_plan.ts`. Puro, sem
   integração, sem risco. — 1 h
2. `walkWhere` reconhecendo `date_ref` + teste de RBAC. — 30 min
3. Chamada em `handleExecutePlan`, antes do `authorizePlan`. Publicar o
   `ai-plum-chat`. Nesta etapa nada usa `date_ref` ainda — o sistema fica
   preparado sem mudar comportamento. — 30 min
4. Regra no prompt do Agente A. **É aqui que o comportamento muda**, e é a
   etapa que precisa dos testes manuais de `testes/chat/`. — 1 h
5. `planoTemData` passa a aceitar `date_ref`. O cache começa a pegar as
   perguntas datadas. — 15 min

Fazer 3 antes de 4 é o que permite publicar o interpretador antes de o
planejador começar a emitir o campo novo — sem isso, existe uma janela em que
um plano com `date_ref` chega a um servidor que não sabe resolvê-lo.
