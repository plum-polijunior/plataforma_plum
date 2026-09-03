# B04 · `vocabulario` + resolvedor de entidade — manual do 👤

## Antes

**1. Colar `supabase/migrations/20260820120000_vocabulario_exposto.sql`** no SQL Editor.

As quatro linhas de verificação têm de sair `OK`. A que mais importa é a terceira —
*"NENHUMA base nasceu com vocabulario exposto"*: se vier `FALTANDO`, o default não pegou e alguma
base já está autorizada a listar nomes sem ninguém ter pedido.

## Publicar

**Nada.** Nenhum deploy de Edge Function neste bloco: o código novo é só `_shared/`, e nenhuma
função o importa ainda. O `pandas_executor.py` não foi tocado, então nem o Lambda muda.

⭐ Isso é resultado do desenho, não sorte: o `vocabulario` compila para um Query Plan comum, e o
executor já sabia executá-lo. Se este bloco tivesse exigido uma linha no executor, o desenho estaria
errado.

## Depois

**2. Não há nada a testar pela interface, e isso é esperado.**

Quem emite o pedido `vocabulario` é o Reconhecedor (A2), que nasce no **B06**; quem consome o
resolvedor é o Planejador (A3), no **B07**. É o terceiro bloco seguido entregando a peça antes do
consumidor — a ordem que o V3 escolheu, com a fundação primeiro.

A cobertura é `npm test` (36 casos novos) e `npm run test:py` (30 novos).

**3. ⭐ Deixe a flag desligada até o B06.**

`vocabulario_exposto` nasce `false` em todas as bases, e é assim que deve ficar. Ligar antes de o A2
existir não habilita nada — só remove uma trava de um caminho que ninguém percorre.

Quando o B06 chegar, ligue **numa base de teste só**:

```sql
update datasets set vocabulario_exposto = true
where name = '<a base suja de teste>';
```

## ⭐ O que este bloco garante, para a revisão

| Garantia | Por quê |
|---|---|
| A normalização em TypeScript é **idêntica** à do executor | O resolvedor escolhe um literal e o executor depois filtra por ele. Divergir faz a pergunta voltar **com zero** — sem erro, sem log, sem sintoma. Uma tabela de 11 casos replicada nos dois lados é o que segura isso |
| Dois candidatos plausíveis viram **pergunta**, não escolha | Escolher errado devolve um número certo sobre a **pessoa errada** — o pior que este produto pode fazer |
| Coluna com mais de 200 valores distintos é **recusada** | Acima disso é identificador, não categoria, e listá-la é entregar a base. É o mesmo teto do B02, exercido por outra porta |
| O resolvedor não usa LLM | Pedir isto a um modelo troca uma resposta verificável por uma plausível, justamente onde errar significa filtrar pela pessoa errada |

⚠️ **Uma limitação conhecida, escrita na migration:** a flag é **por base**, não por coluna. Coluna
sensível com poucos valores distintos (faixa salarial, motivo de desligamento) não tem controle
próprio — o único disponível é tirá-la do `allowed_columns` do cargo, o que também a tira das
consultas. Foi decisão consciente: uma segunda lista de permissão por coluna criaria dois lugares
para manter em sincronia, e o caso comum (CPF, matrícula) já é pego pelo teto de cardinalidade.

## Se der errado

| Sintoma | Rollback |
|---|---|
| A verificação da migration acusa base com vocabulário exposto | `update datasets set vocabulario_exposto = false;` — imediato, sem deploy |
| Quer desfazer a migration | ⚠️ Não dropar (§4.9 / D-005). A coluna com `false` em tudo é inerte |
| Algum teste do executor quebrou | Não deveria: o `pandas_executor.py` não foi tocado. `git revert` e me avise |
