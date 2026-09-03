# B10 · `registro`, `amostra` e o orçamento — diário

**Data:** 2026-08-21 · **Escopo:** executor (arquivo novo), Edge Function `ai-plum-chat`, prompt do
A3. Sem migration.

**Último bloco da Etapa 1.** E o único que mexe no caminho que devolve linha sem agregação — o P1.3,
que todos os outros blocos protegem, aqui é violado de propósito e sob condições.

---

## ⭐ A violação mora num arquivo só, e essa é a decisão de desenho

`query_engine/linhas.py`. Nada de `registro`/`amostra` em `pandas_executor.py`, que continua sendo
*"só sai daqui vetor agregado"* sem exceção.

O motivo é revisão, não organização: **toda a discussão de privacidade passa a caber num diff**, e a
pergunta do PR vira binária — *"mexeu em `linhas.py`?"* — em vez de exigir leitura do executor
inteiro. Se algum dia alguém precisar devolver linha bruta de outro jeito, o certo é trazer para cá,
não abrir uma segunda porta.

---

## ⭐ O erro que este bloco existe para não cometer

**O teto por pedido não protege nada sozinho.** Cinco linhas por `registro`, e 200 pedidos de cinco
linhas é a base inteira **sem violar teto nenhum**. Um limite por requisição parece um limite e não
é; é o modo de falha óbvio depois de escrito e invisível antes.

Por isso são **três** travas, e duas ficam fora do executor:

| trava | onde | por quê ali |
|---|---|---|
| 5 linhas por pedido | `linhas.py` | quem serializa é quem sabe quanto saiu |
| 200 linhas por janela | `orcamento.ts` (Edge Function) | só ela sabe quanto o usuário já gastou |
| colunas do cargo | barreira 4 do `main.py` | já existia; vale igual aqui |

---

## O orçamento: sem tabela nova, e a chave é a que já estava avisada

O saldo sai de `SUM(plum_logs.linhas_brutas_entregues)`. A coluna existe desde a Etapa 0, a tabela é
append-only e tem RLS. Nada a migrar.

**Chave: usuário × base × 24 horas.** ⚠️ Não `sessao_id` — ele é uuid gerado no cliente, renovado a
cada F5, e amarrar a cota a ele daria orçamento novo a cada recarga. O aviso estava escrito em três
lugares desde a Etapa 0 (migration, `log.ts`, `PlumChat.tsx`), e escrevê-lo aqui pela quarta vez é
mais barato que descobrir de novo.

### ⚠️ Duas coisas quebradas achadas ao ligar o fio, e nenhuma apareceria em teste

**1. O filtro estava por organização, não por pessoa.** A policy de SELECT do `plum_logs` é *"membro
ativo lê o log da org"* — qualquer membro lê o log de todos. Sem `user_id` explícito na consulta, a
cota seria **coletiva**: um colega gastaria as 200 linhas de todo mundo. É a mesma armadilha do
RLS ≠ GRANT — supor que a policy faz o recorte que você tinha em mente. Agora o `user_id` vem do
`auth.getUser()` e entra no filtro.

**2. A leitura do saldo falhava ABERTA.** `const { data } = await supabase...` — o Postgrest não
lança, devolve `{ data: null, error }`. Com o `error` descartado, `data ?? []` virava saldo cheio, e
o orçamento se abriria exatamente quando o banco está ruim. **É o terceiro `error` ignorado deste
projeto** (o `buscar()` do cache do A2 e a gravação dele foram os outros dois). Agora ele lança, e o
`catch` trata como **esgotado**: o custo do lado seguro é uma pergunta respondida sem linha
detalhada.

---

## ⚠️ O débito é escrita verificada, e é a única do log

Todo o resto de `plum_logs` é best-effort de propósito — a regra que o `log_core.ts` protege é *"log
nunca derruba a pergunta"*.

Mas um orçamento apoiado numa escrita best-effort é um orçamento **que se contorna fazendo o log
falhar**. Se o débito não gravar, a linha bruta saiu de graça; e se o log estiver quebrado, saem
todas, para sempre.

Daí `criarRegistradorVerificado`, ao lado do `criarRegistradorCom` que engole tudo. Se o débito não
gravar, o turno é **recusado** com `etapa: "orcamento"`. São duas posturas na mesma tabela, e a
diferença está escrita nos dois arquivos.

⭐ E o valor debitado vem do executor (`linhas_brutas_entregues` por pedido), não de uma estimativa
da Edge Function: quem sabe quanto saiu é quem serializou.

---

## Decisões

**Reserva pelo PIOR caso, antes de executar.** Conferir depois seria conferir tarde — as linhas já
teriam sido lidas da planilha e devolvidas. *"Estourou, mas já entreguei"* não é um orçamento.

**Nega por pedido, não o lote.** Um pedido que não cabe não é motivo para perder os outros; a
negação parcial do B07 já sabe explicar o que ficou de fora. E o motivo é frase de gente, porque
chega ao A4 e vira texto na tela.

**⭐ Quem não devolve linha não paga.** `agregado`, `serie`, `metadados` e `vocabulario` passam com
saldo zero. Cobrar deles empurraria o planejador a **agregar menos** para caber — o contrário do que
o orçamento quer. A lista canônica está em dois lugares (`orcamento.ts` e
`linhas.py::tipos_que_consomem_orcamento`) com um teste de cada lado apontando para o outro.

**`registro` exige `where`.** Sem filtro, "me dá 5 registros" é **amostra**. A distinção não é
burocracia: sem ela, dez pedidos sem filtro são 50 linhas em ordem — paginação da base com outro
nome.

**⭐ `amostra` usa semente determinística, e ela NÃO sai do `hash()` do Python.** `hash()` é
aleatorizado por processo desde o 3.3, então a "semente determinística" mudaria a cada cold start do
Lambda — determinismo que só vale dentro de uma invocação não é determinismo. Soma de bytes é feia e
é estável, e há um teste que roda a semente em **subprocessos com `PYTHONHASHSEED` diferente** para
provar isso. A semente inclui o tamanho da base: base que cresceu devolve amostra nova, porque
amostra congelada de base que mudou descreve o passado.

**⚠️ A coluna que só aparece no `where` não volta na resposta.** `resolved_columns` inclui as
colunas do filtro — o `extractColumns` percorre o `where` e **tem** de percorrer, senão a coluna se
esconde do RBAC (I-05). Mas um `registro` que filtra por `cpf` e pede só `nome` devolveria o `cpf`
junto: autorizado, e ainda assim coluna a mais por acidente, num tipo que já é a exceção ao P1.3.
`colunas_de_linha()` intersecta o `select` com o autorizado, nessa ordem — o `select` escolhe, o
`allowed_columns` filtra, e nunca o contrário.

**`registro` e `amostra` entraram no `TipoDePedido`.** Sem isso o `normalizarPlanoDoA3` descartaria
os dois **calado** (`[a3] pedido N com tipo 'registro' — descartado`), e o bloco entregaria uma
capacidade que o planejador emite e ninguém recebe.

---

## O prompt do A3

Ganhou os dois tipos, os exemplos, e — o que mais importa — **o orçamento explicado como orçamento
do usuário**: 200 linhas por dia por base, agregação não gasta nada, pedir linha quando uma
agregação responderia é gastar a cota dele à toa. Com o ⛔ explícito contra fatiar a base em vários
`registro` por região para ver mais de cinco, que é a forma que o modelo tentaria.

---

## Arquivos

**Novos:** `query_engine/linhas.py` · `supabase/functions/_shared/orcamento.ts` ·
`supabase/functions/_shared/orcamento.test.ts`

**Editados:** `query_engine/main.py` (`plano_where`, `colunas_de_linha`, o ramo `registro`/`amostra`)
· `_shared/log_core.ts` + `log.ts` (`criarRegistradorVerificado`) · `_shared/pedidos.ts` (os dois
tipos) · `ai-plum-chat/index.ts` (`saldoDaJanela`, reserva, débito verificado) ·
`adhoc/prompts/a3_planejador.ts` · `query_engine/tests/test_privacidade.py` (+17) ·
`_shared/query_plan.test.ts` (+3)

**Verificado:** `npm run test:py` — **374 testes** · `npm test` — **286** · `npx tsc --noEmit` limpo ·
bundle do `ai-plum-chat` fecha.

⛔ **Não tocado:** `pandas_executor.py` (o P1.3 dele continua sem exceção), `dashboard-agent`,
`ai-agents`, nenhuma migration.

## 👤 Falta

**Deploy do `ai-plum-chat`** — é a primeira vez em vários blocos que ele é obrigatório: sem o
deploy, o Lambda aceita `registro` e nada conta as linhas.
