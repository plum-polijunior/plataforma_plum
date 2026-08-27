# B19 · O payload leva N bases, e autoriza cada uma — manual do 👤

⭐ **É aqui que mora o risco da etapa** (§B3 do plano), porque mexe no caminho de RBAC.

⚠️⚠️ **ESTE BLOCO ESTÁ PELA METADE, DE PROPÓSITO — leia isto antes de qualquer coisa.**

| metade | estado |
|---|---|
| **executor** (`security.py`, `main.py`) | ✅ pronto, publicado, testado |
| **Edge Function** (`handleExecutePlan` monta `bases[]`) | ⛔ **não feito** |

⇒ **Nada muda em produção com este bloco.** A Edge Function publicada não manda o campo `bases`, e
sem ele o executor sintetiza **uma** base com os campos do topo, exatamente como antes. A capacidade
existe e ninguém a usa ainda.

## Antes

**B18 no ar.** Este bloco depende de o `from` ser respeitado — sem isso a escolha de base não tem
efeito observável.

**Nenhuma migration.**

## Publicar

Mesmo caminho e mesmo cuidado do B18: o push em `plataforma` casa `query_engine/**` e publica no
Lambda de produção, com o smoke test rodando **depois** da substituição (C4b / I-09).

```sh
cd query_engine && python -m pytest -q
```

## ⭐⭐ O que confirmar

**Que nada mudou** — pelo mesmo motivo do B18, e com a mesma verificação: abra o dashboard e confira
que todos os cards continuam com número.

⚠️ O caminho legado passa por código novo agora: `payload.bases` vazio faz o `main.py` sintetizar uma
base chamada `producao` com `sheet_id`, `tab`, `tab_gid`, `allowed_columns` e `formatting_rules` do
topo. É uma linha de tradução, mas é código que não existia — e é o que roda para os 4 clientes.

## O que o bloco deixou pronto

**`BaseRequest`** em `security.py`: por base, a planilha, a aba e **as permissões dela**.

⛔⛔ **`allowed_columns` é da BASE, nunca do turno**, e é o ponto do bloco. Uma lista global seria a
união das permissões de bases diferentes: quem pode ver `salario` em RH passaria a poder pedir
`salario` de Vendas, e a comparação de conjuntos não veria nada de errado — o nome está na lista. O
RBAC é por dataset (`role_permissions`) e o payload tem de ter a mesma forma.

Além disso:

- **Uma leitura do Google por base**, não por card. Base sem coluna a carregar é pulada.
- **Falha de leitura derruba só os cards daquela base.** Antes havia uma base e um `return` global
  era o certo; com N, derrubar o lote porque uma planilha perdeu o compartilhamento esconderia as
  respostas que ainda dão.
- **Regras de formatação por base.** Elas descrevem as colunas de UMA planilha; aplicar as de outra
  limparia a coluna errada.
- **Duas bases com o mesmo nome ⇒ 400.** Qual ganha dependeria da ordem do dict, e seria a permissão
  da outra.

## ⭐ Um bug de autorização foi achado em revisão, antes de publicar

A primeira versão guardava `{card_id: nome_da_base}` num dict. O `card_id` vem do **planejador** — é
um id emitido por um LLM — e nada garante que seja único no lote.

⇒ Dois pedidos com o mesmo id e bases diferentes colapsariam na base do último, e o primeiro
executaria sobre uma base contra cujo `allowed_columns` ele **nunca foi autorizado**. Bypass de RBAC
por colisão de string que um modelo escolheu.

Corrigido: a base anda **em par** com o pedido (`aprovados: List[tuple]`), e nada que o modelo
escolheu indexa a decisão de autorização. Regressão coberta por
`test_card_id_REPETIDO_nao_faz_um_pedido_herdar_a_base_do_outro`.

## O que falta para fechar o bloco

`handleExecutePlan` no `index.ts` resolve **um** dataset e roda `authorizePlan` contra **um**
`allowedColumns`. Multi-dataset ali é: `.in("id", ids)` nos datasets, `role_permissions` por dataset,
autorização por pedido contra a base que o `from` nomeia, e `bases[]` no payload.

⚠️ **E há uma consequência de contrato:** o turno é partido em duas invocações e o cliente carrega o
dicionário entre elas. Multi-base muda o que vai e volta ⇒ `PlumChat.tsx` entra, e é **par
indivisível front ↔ Edge Function**, com o sintoma silencioso do B14.

## Se algo der errado

| sintoma | causa provável |
|---|---|
| Cards de uma base ficaram vazios, os das outras não | esperado quando aquela planilha perdeu o compartilhamento. Antes derrubava o lote inteiro |
| `duas bases com o mesmo nome` (400) | quem montou o payload repetiu o `nome`. Não pode vir do LLM — o nome sai do dataset |
| Coluna negada numa base que a libera | ⚠️ o `allowed_columns` está sendo lido do topo do payload em vez da base. É regressão do bloco |
| **Todos** os cards vazios | a síntese da base legada quebrou. Reverta o Lambda antes de investigar |
