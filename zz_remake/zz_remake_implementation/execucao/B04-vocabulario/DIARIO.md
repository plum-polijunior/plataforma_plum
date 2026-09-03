# B04 · `vocabulario` + resolvedor de entidade — diário

**Data:** 2026-08-20 · **Escopo:** `_shared/`, uma migration, e testes nos dois lados.

O bloco que faz *"quanto o vendedor Fulano vendeu"* parar de devolver zero quando o nome está
escrito de três jeitos na planilha. Duas peças: o pedido `vocabulario`, que lista os valores
distintos de uma coluna, e o **resolvedor de entidade**, que casa o que o usuário escreveu com o
literal que existe na base.

⭐ **Nenhuma linha nova no executor.** O `vocabulario` compila para `group_by [col] + count + order
desc + limit 200` — um Query Plan comum. Isso não é economia de trabalho: é o que mantém **um**
interpretador de Query Plan no sistema. Um endpoint próprio seria um segundo lugar onde uma coluna
pode escapar do RBAC.

---

## O que o plano dizia e o código pediu diferente

### 1. ⭐ A armadilha da normalização era pior do que o plano descrevia

O plano da etapa já avisava: a normalização em TypeScript precisa ser a mesma do `_strip_accents` do
executor, senão o resolvedor escolhe um literal que o `where` depois não casa e a pergunta volta com
zero. Ao escrever, apareceu o que isso **é**: a segunda dívida de normalização duplicada do projeto,
e de natureza pior que a primeira.

A primeira (D-017) é o nome de **coluna**: divergir vira `MissingColumnError` — barulhento. Esta é o
**valor** de texto: divergir vira **resultado vazio**. Sem erro, sem log, sem sintoma — só uma
resposta que parece dado ausente.

**Feito:** `_shared/texto.ts` espelhando `_strip_accents`, e uma tabela de 11 casos **replicada** nos
dois lados (`entidade.test.ts` × `test_normalizacao_de_valor.py`), seguindo exatamente a convenção
que a D-017 já criou para `colunas.ts` × `sheets.py`. Mais o teste de idempotência: o valor é
normalizado mais de uma vez no caminho, e uma função que muda o resultado na segunda passada
quebraria o casamento sem nenhum caso da tabela falhar.

⚠️ **A normalização não colapsa espaço interno nem tira pontuação** — porque o executor também não.
Ser **igual** a ele vale mais que ser esperto; quem cobre grafia diferente é a distância de edição,
que roda em cima disto.

### 2. O teto de distância tinha de ser proporcional, não absoluto

Distância 3 é razoável em `NATUREZA DA AQUISICAO` e absurda em `ANA` — ali casaria com quase
qualquer nome de três letras, e o resolvedor viraria um gerador de ambiguidade. **Feito:** 40% do
tamanho do termo, com piso de 1.

E só os candidatos empatados no **menor** valor disputam: um a distância 1 não compete com outro a
distância 3 só por caberem no teto.

### 3. A flag ficou por base, e a granularidade fina foi recusada com motivo

`datasets.vocabulario_exposto`, não por coluna. Por coluna seria mais fino e é o que a intuição
pede — mas já existe uma lista de colunas por cargo (`allowed_columns`), e uma segunda lista criaria
**dois lugares** para manter em sincronia. Divergência entre listas de permissão é o formato de bug
que o I-01 já cobrou deste projeto.

E o caso que a granularidade fina protegeria — CPF, matrícula, telefone — já é pego pela terceira
trava: identificador tem cardinalidade alta por definição.

⚠️ **O que este desenho não cobre**, e está escrito na migration: coluna sensível com **poucos**
valores distintos (faixa salarial, motivo de desligamento). Para essa, o controle disponível é tirar
a coluna do `allowed_columns` — o que também a tira das consultas, e pode ser demais. Se aparecer um
caso real, a granularidade por coluna vira decisão informada em vez de especulação.

### 4. O teto de cardinalidade não podia morar no TypeScript

O plano dava a trava como uma das três da Edge Function. Não dá: **nada nessa camada sabe quantos
valores distintos a coluna tem.** Tentar seria pior que não tentar — um palpite viraria ora recusa
indevida, ora falsa segurança.

**Feito:** as duas travas conferíveis (`allowed_columns` e a flag) ficam em `vocabulario.ts`; a
terceira é o `CardinalidadeExcedida` que o B02 já implementou, exercido por outra porta. ⭐ Uma
constante, dois consumidores — que era exatamente o §B5 do plano da etapa.

---

## Decisões

**⭐ Dois candidatos plausíveis viram PERGUNTA, nunca escolha.** É a regra que organiza o resolvedor.
Escolher errado devolve um número **certo sobre a pessoa errada** — o pior que este produto pode
fazer, e a mesma família de falha que o `MissingColumnError` do executor existe para evitar.

A contagem de linhas do vocabulário ordena as opções (entre `ACME LTDA` com 400 linhas e
`ACME LTDA ME` com 2, a primeira vem antes), mas ⚠️ **ela ordena a pergunta, não a responde**.

**Limite de 5 opções.** Uma pergunta com vinte opções não é uma pergunta, é uma lista.

**A ordem das travas importa para o motivo devolvido.** Coluna proibida numa base com vocabulário
desligado sai como `coluna_proibida`, não como `vocabulario_desligado` — reportar o segundo sugeriria
que ligar a flag resolveria, e daria a quem lê a impressão errada sobre o que o cargo alcança.

**O resolvedor é código, sem LLM** (V7 §1). Pedir isto a um modelo troca uma resposta verificável por
uma plausível, no exato ponto em que errar significa filtrar pela pessoa errada.

**O literal devolvido é o da base, com a grafia original.** O `where` normaliza os dois lados, então
grafia não importa para o casamento — mas importa para a resposta mostrar ao usuário o nome como ele
está escrito na planilha dele.

---

## O teste que fecha o laço

Em `test_privacidade.py`, `test_o_literal_devolvido_casa_com_o_where_depois` roda o plano de
vocabulário, pega um literal do resultado e filtra por ele — ida e volta no mesmo teste. Se a
normalização do `where` divergisse da lista, ali daria zero.

⭐ É o único lugar onde o ciclo inteiro do bloco é exercido de ponta a ponta, e é barato porque as
duas pontas são o mesmo executor.

---

## O que ficou de fora

**Nada disto é alcançável ainda.** O `vocabulario` é emitido pelo Reconhecedor (A2) e consumido pelo
Planejador (A3), que nascem no **B06** e no **B07**. Terceiro bloco seguido entregando peça antes do
consumidor — é a ordem que o V3 escolheu, com a fundação primeiro.

A cobertura, por isso, é `vitest` + `pytest`: 33 casos novos.

---

## Arquivos

**Novos:** `_shared/texto.ts` (normalização + distância) · `_shared/entidade.ts` (o resolvedor,
**sem LLM**) · `_shared/vocabulario.ts` (o plano e as travas) · `_shared/entidade.test.ts` (24) ·
`_shared/vocabulario.test.ts` (12) · `query_engine/tests/test_normalizacao_de_valor.py` (23 — a
tabela de paridade) · `supabase/migrations/20260820120000_vocabulario_exposto.sql`

**Editados:** `query_engine/tests/test_privacidade.py` (+7: o plano de vocabulário atravessando o
executor, o teto sendo aplicado, e o laço literal→`where`) ·
`src/integrations/supabase/types.ts` (`vocabulario_exposto`, §4.12)

**Verificado:** `npm test` — **243 testes** · `npm run test:py` — **334 testes** · `npx tsc --noEmit`
limpo · lint na baseline (65 erros, nenhum novo).

⛔ **Não tocado:** `pandas_executor.py` (⭐ de propósito — é a prova de que o `vocabulario` não é
caminho novo), `query_plan.ts`, e nenhuma Edge Function.
