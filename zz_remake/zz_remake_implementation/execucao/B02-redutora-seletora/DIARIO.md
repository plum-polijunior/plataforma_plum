# B02 · Redutora × seletora, teto de cardinalidade, clamp de `limit` — diário

**Data:** 2026-08-19 · **Escopo:** só o executor. Nenhuma Edge Function, nenhuma migration.

O bloco fecha o furo de **forma** do P1.3: ele verifica que *existe* agregação, não que o resultado
*agrega*. `group_by [cliente] + count` passa pelo P1.3 e devolve a carteira inteira, um nome por
linha — a mesma linha bruta que o P1.3 recusa, entregue por outra porta.

---

## O que o plano dizia e o código pediu diferente

### 1. Dois campos, não um

O plano previa `PlanRequest.tipo` sozinho distinguindo `ad_hoc` de legado. Não dá: `tipo` descreve o
**pedido** (`agregado`, `serie`, `metadados`, `vocabulario`, `registro`, `amostra`) e os dois
primeiros existem nos dois caminhos. Um `agregado` vindo do dashboard e um vindo do A3 têm o mesmo
`tipo` e precisam de tratamento diferente.

**Feito:** `PlanRequest.tipo` (por pedido, para o B03 e o B10) **e** `ExecutionPayload.caminho`
(`legado`|`ad_hoc`, por lote — um lote inteiro vem de um caminho só). Cada um com uma função.

Os dois nascem com `default`, pela regra de ordem do §B2 do plano: o Lambda sobe a todo push e a
Edge Function é publicada à mão, então por algumas horas o executor novo recebe payload da função
velha. Campo obrigatório aqui derrubaria o dashboard nesse intervalo.

### 2. ⭐ A seletora sobre texto é **reportada**, não recusada

O plano deixava implícito que o executor recusaria. Reler o cabeçalho do `main.py` corrigiu isso: *"o
que este serviço NÃO faz, de propósito: não decide permissão"*. O executor é Motorista Cego.

Decidir se `min(cliente)` custa orçamento é do **autorizador**, e o orçamento é B10. Se o B02
recusasse agora, o B10 teria de desfazer a recusa para transformá-la em débito — churn puro.

**Feito:** `execute_plan` devolve `selecoes_literais` (aliases que são seletora sobre texto) e
`grupos_de_texto` (`{coluna: distintos}`). O `main.py` repassa por card. Ninguém lê ainda; é medição
até o B10.

⚠️ **A exceção é o teto de cardinalidade**, que **é** recusa. Ele não é política de permissão: é o
mesmo invariante do P1.3 (linha bruta não atravessa), só que pela porta que faltava tapar. Por isso
mora no executor e levanta `CardinalidadeExcedida`, irmã de `RawRowsBlocked`.

### 3. O teto é por coluna, não sobre o número de linhas

A primeira versão barrava também quando `len(df_out)` passava de 200. Errado: agrupar cidade (150) por
mês (12) dá 1.800 linhas e ainda assim expõe **150** literais. Volume é problema do `limit`; exposição
é problema do teto. Misturar recusaria consulta legítima e deixaria o vazamento de pé.

### 4. A conta é feita **antes** do `limit`

Cortar em 500 não protege: 500 nomes de cliente continuam sendo 500 nomes de cliente. O que importa é
o alcance do recorte, não quantas linhas sobraram — então a conferência entra logo depois do
`_grouped_agg`, antes de `order_by` e de `head()`.

### 5. O alias escapava

`_grouped_agg` renomeia coluna direta que tenha `as`. Conferir só o nome de origem deixaria
`{"expr": "cliente", "as": "quem"}` passar; conferir só o nome de saída perderia o papel, que está
registrado sob o nome de origem. `_conferir_cardinalidade` recebe pares `(saída, origem)` por isso, e
há um teste só para esse caso.

### 6. `_shared/query_plan.ts` ficou intocado

O plano listava "só a constante do teto". Não coloquei: o consumidor dela é o `vocabulario` do B04, e
constante sem consumidor é o mesmo código especulativo que a Etapa 0 recusou a escrever no item da
chave. Ela nasce no B04, onde é lida.

⭐ **Consequência boa: o B02 não precisa de deploy de Edge Function nenhum.** Não toca em
`query_plan.ts`, então o portão dos três consumidores (I-03) também não se aplica. É um `git push` e
o Lambda sobe sozinho.

⚠️ **Atualização de 2026-08-20:** o manual deste bloco tinha um passo 1 pedindo o registro do
`ezbr_sha256` como marco zero da etapa. Ele saiu — a D-028, que era a última justificativa dele, foi
encerrada quando a Etapa 0 republicou o `ai-plum-chat`. Medido pela Management API: os três
consumidores estão na mesma versão.

---

## Decisões

**O modo observação.** No `legado` a regra roda inteira e emite `logger.warning` com o prefixo
`[adhoc-observacao]` em vez de recusar. Custo zero, risco zero — e ao chegar no B08 saberemos por
dado, e não por palpite, se dá para ligá-la no dashboard. Sem isso o bloco ficaria cinco semanas sem
nenhum sinal de realidade, porque o `ad_hoc` só nasce no B06.

**O clamp de `limit` vale para os dois caminhos.** É o único item do bloco que vale, e vale porque a
gramática já documentava `1..500` (V7 §4) sem que nada aplicasse: era `plan.get("limit", 200)` seguido
de `head(limit)`. `limit: 50000` sobre um `group_by` de texto entregava a base inteira sem violar
regra nenhuma — e `agregado` é isento de orçamento no desenho do B10, então o furo sobreviveria ao
bloco que deveria fechá-lo.

**`classificar_agregacao` é pública e não é whitelist.** O `agg` continua indo direto para o pandas
(V6 decisão 4). A tabela só diz o que cada função *faz* com os valores; função fora dela sai como
`desconhecida` e executa normalmente. O B09 acrescenta as novas como redutoras — é o motivo de a
tabela ter nascido extensível.

---

## ⚠️ Pendência aberta, não consertada aqui

`min`/`max` sobre coluna de **texto** no caminho agrupado devolvem **`0`**, não o literal:
`_coerce_numeric_for_agg` converte a coluna. Isso não é proteção — é resposta errada em silêncio, da
mesma família do que o `MissingColumnError` existe para evitar.

Não consertei no B02 de propósito: destravar a coerção **aumentaria** o vazamento (passaria a devolver
o nome de verdade) antes de o orçamento do B10 existir para cobrá-lo. Vai para
`contexto/20-pendencias.md` junto com o outro achado de silêncio (a colisão de cabeçalho normalizado
do `DatabasePipeline.tsx`).

⚠️ **E a classificação foi escrita para o comportamento correto, não para o atual** — quando a
pendência for resolvida, a tabela já está certa e nada precisa mudar aqui.

---

## Arquivos

**Editados:** `query_engine/pandas_executor.py` (constantes, `CardinalidadeExcedida`,
`classificar_agregacao`, `_seletoras_de_texto`, `_conferir_cardinalidade`, `_limite_de_saida`, o
kwarg `aplicar_regras_adhoc` em `execute_plan` e em `execute_plan_with_formatting`) ·
`query_engine/security.py` (`PlanRequest.tipo`, `ExecutionPayload.caminho`) ·
`query_engine/main.py` (liga o `caminho`, trata a exceção nova, repassa os contadores) ·
`query_engine/tests/test_privacidade.py` (+19 casos)

**Verificado:** `npm run test:py` — **285 testes**, todos verdes. Nada de TypeScript foi tocado.

⛔ **Não tocado:** `_shared/query_plan.ts`, `ai-plum-chat`, `dashboard-execute`, `dashboard-agent`.
