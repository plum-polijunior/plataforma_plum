# Plano de implementação — contexto e documentação do Plum

**Origem:** `zz_remake/context`. **Insumo adicional:** `about_v3` (roteado na §11).
**Objetivo declarado:** um agente sem contexto que leia o repo tem hoje uma visão **errada** do
que o Plum é. Este plano conserta isso e cria o mecanismo para não voltar a apodrecer.
**Convenções:** `⭐` central · `⚠️` risco · `✂️` onde eu discordo do pedido · `❓` decisão sua ·
`🏗️` plataforma · `🔧` implementação

---

## 0. O diagnóstico, em números

**50 arquivos `.md`, ~15.000 linhas** fora de `node_modules`. O problema não é o volume — é que
nada diz o que ainda vale:

| Sintoma | Evidência concreta |
|---|---|
| Documento aspiracional lido como schema | `docs/PRD-PLUM2.0.md` (1.108 linhas) descreve `tenants`, `tenant_users`, `data_dictionary` — **nada disso existe no banco**. Só o `CLAUDE.md` avisa |
| Verdade contraditória entre arquivos | `query_engine/prd.md` diz que o cache está **desligado**; ele está ligado desde 2026-08-07 |
| Plano abandonado sem marca | `query_engine/implementation.md` descreve a arquitetura EC2 que foi **substituída** por Lambda |
| Duplicata literal | `REMAKE-…_V1.md` existe na **raiz e em `zz_remake/`** (789 linhas cada) |
| Pendências em 5 lugares | `TODOS.md`, `organizar_tudo.md`, `pendencias_e_dividas_tecnicas.md`, `query_engine/urgent.md`, `urgent_multiplas_planilhas_simultâneas.md` |
| Histórico sem rótulo | `docs/fases dashboard/` tem 5.000+ linhas de planos executados que um agente lê como se fossem o presente |

⭐ **A causa raiz não é falta de documento — é falta de *roteamento*.** O `CLAUDE.md` é excelente
e resolve o problema para quem o lê. Um agente que abre `docs/PRD-PLUM2.0.md` primeiro forma o
modelo errado e nunca descobre que estava errado. **O que falta é um ponto de entrada único que
diga o que ler, em que ordem, e o que ignorar.**

---

## 1. Sete princípios (sem eles, isto vira outra pasta de markdown)

1. ⭐ **Uma fonte de verdade por pergunta.** Se dois arquivos respondem "quais são as Edge
   Functions", um dos dois vai ficar velho. Repetir é proibido; **linkar** é obrigatório.
2. ⭐ **Separar o que É do que QUEREMOS, sem exceção.** Foi o que estragou o PRD. Arquivo que
   descreve realidade não contém roadmap; arquivo de roadmap abre dizendo "nada aqui está
   implementado".
3. **Todo arquivo tem frontmatter curto** com `status`, `camada`, `atualizado_em`. Sem isso não
   há como marcar o superado nem gerar painel no Obsidian.
4. ⭐ **O topo de cada arquivo nega o erro comum.** Três linhas de "o que este arquivo NÃO é". O
   agente lê de cima para baixo — o desmentido tem que vir antes do conteúdo.
5. **Teto de ~400 linhas por arquivo.** Acima disso o agente não lê inteiro e passa a citar
   pedaços fora de contexto. Estourou: divide.
6. **Não criar pasta antes de ter 3 arquivos para ela.** A árvore da V3 §11 previa 6 subpastas de
   plataforma; o conteúdo não existe. Começa plano, divide quando doer.
7. ⭐ **Superado nunca é apagado — é marcado e roteado.** Ver §6, onde eu discordo do pedido.

---

## 2. A estrutura final

```
CLAUDE.md                          ← FICA. Operacional: comandos, invariantes, armadilhas
README.md                          ← reescrito: 20 linhas + link para contexto/00
contexto/
  00-LEIA-PRIMEIRO.md              ⭐ índice, ordem de leitura, o que NÃO ler
  01-o-que-e-o-plum.md             🏗️ a plataforma, em uma leitura
  02-plataforma-vs-implementacao.md ⭐ 🏗️/🔧 — o arquivo mais importante do conjunto
  03-erros-comuns.md               ⭐ anti-verdades: as 12 coisas que se acredita e são falsas
  04-glossario.md                  arquiteto, motor, grão, padrão analítico, ITIP…
  10-visao-comercial.md            ICP, ticket, objeções, narrativa
  11-visao-de-produto.md           superfícies, jornadas, a receita-modelo
  12-visao-tecnologica.md          arquitetura-alvo, agentes, contrato, observabilidade
  20-pendencias.md                 🏗️ por hierarquia de dificuldade
  21-melhorias-do-plum-vendido.md  🔧 o que dá pra somar ao Plum com onboarding
  22-planos-futuros.md             assistente, prospecção, Etapa 2
  30-decisoes.md                   ⭐ uma linha por decisão + o porquê
  31-incidentes-e-licoes.md        2026-07-22, R-13, a armadilha de deploy
  40-implementacao/
    CLAUDE.md
    metodo-onboarding-de-dados.md  🔧 o playbook do produto pago
    templates/template-varejo.md
    clientes/<cliente>/            dicionario · regras · relacoes · historico
  90-arquivo/                      superados, com aviso no topo. O agente é instruído a pular
    remake/ V1 V2 V3 about_v1..3 · prd-plum-2.0 · fases-dashboard/ · logs/ · …
```

**Por que `contexto/` e não `docs/`:** `docs/` já tem 17 arquivos com reputação misturada.
Pasta nova = nome limpo, e `docs/` inteira vira `90-arquivo/` num movimento só.

---

## 3. Especificação arquivo por arquivo

> Formato: **o que responde** · ⛔ **o que não contém** · **fontes** · **tamanho**

### `00-LEIA-PRIMEIRO.md` ⭐ (o arquivo que resolve o problema)

Responde: *sou um agente novo, o que eu leio?* Contém, nesta ordem: as 5 frases que definem o
Plum · a tabela "quero fazer X → leia Y" · ⭐ **a lista explícita do que NÃO ler**
(`90-arquivo/`, e por quê) · onde está a verdade de cada coisa (schema → `migrations/`; como
rodar → `CLAUDE.md`; por que decidimos → `30-decisoes.md`).
⛔ Nenhum conteúdo próprio — é só roteador. **~80 linhas.**

### `01-o-que-e-o-plum.md`

Responde: o que é a plataforma, para quem, que problema resolve, como funciona ponta a ponta,
o que ela deliberadamente **não** faz. A fronteira do `about_v3` §1.1: *a plataforma interpreta
os dados e produz um resultado; o stakeholder decide o que aquilo significa.*
⛔ Nada de roadmap. Nada de detalhe de implementação de cliente.
Fontes: `CLAUDE.md` cabeçalho, `query_engine/prd.md` §1–2, V3 §0. **~150 linhas.**

### `02-plataforma-vs-implementacao.md` ⭐

Responde: qual a diferença, quem paga por qual, como decidir onde uma feature nova mora.
Abre com a sua frase do `about_v3`:

> ⭐ **QUANTO MELHOR FOR A PLATAFORMA, MAIS FÁCIL É A IMPLEMENTAÇÃO.**

Contém: a tabela de economia das duas camadas e a **tabela de classificação** (V3 §1 e §1.1) —
que é o teste que qualquer proposta tem que passar. E a regra de ouro nas duas direções: *se
depende de saber o que a coluna significa, não é plataforma; se serve pra qualquer base, não
deveria ser feito à mão.*
Fontes: V3 §1, `about_v2`, `about_v3`. **~120 linhas.**

### `03-erros-comuns.md` ⭐ (minha adição — o antídoto direto do seu diagnóstico)

Responde: *em que um agente/pessoa nova acredita e está errado?* Formato de duas colunas: **o que
se acredita** × **o que é verdade + onde conferir**. O que já sei que entra:

| Crença errada | Verdade |
|---|---|
| O PRD-PLUM2.0 descreve o banco | Descreve um modelo que não existe. Verdade: `supabase/migrations/` |
| O Plum é o agente de WhatsApp | Aquilo é o legado single-tenant. A plataforma é outro sistema |
| A plataforma É o produto vendido | É **demo**. O vendido é a implementação (§02) |
| O Plum escreve na planilha | Nunca. R-01, escopo `readonly` |
| O executor consulta o Supabase | Nunca. Motorista cego; autorização fica na Edge Function |
| Push publica Edge Function | Publica com cobertura desconhecida. `ai-plum-chat` está com cópia antiga **de propósito** |
| k-anonimato protege as respostas | Removido em 2026-08-08 |
| O chat cacheia respostas | Cacheia **plano**, nunca resultado |
| Cache do executor está desligado | Ligado desde 2026-08-07 (`prd.md` está velho) |
| O executor roda em EC2 | Lambda. `implementation.md` é histórico |
| Joins são suportados | Bloqueados (R-11) |
| `gid = 0` significa "sem aba" | É a primeira aba, valor legítimo |

⛔ Não explica nada em profundidade — cada linha aponta para onde está a explicação.
**~60 linhas.** ⭐ É o arquivo de melhor retorno por linha de todo o conjunto.

### `04-glossario.md`

Responde: o que significa cada termo interno. Entram no mínimo: plataforma × implementação,
arquiteto, motor, `/resolver`, pedido nomeado, padrão analítico, **receita** (⚠️ ambíguo com
faturamento — decidir um sinônimo), grão, dicionário de 4 camadas, vocabulário de dimensão,
Query Plan, motorista cego, ITIP, vertical, onboarding de dados, glosa.
⭐ Metade da confusão da nossa própria discussão foi vocabulário. **~80 linhas.**

### `10-visao-comercial.md`

Responde: quem compra, por quê, quanto paga, quais objeções, o que já vendeu.
Entra: ICP (médio porte, varejo, base bagunçada, equipe técnica pequena, orçamento) · as **4
vendas, ticket médio 23k, ITIP 2k** e o que elas revelaram · a armadilha de ser consultoria ·
o que precisa ser multi-tenant para o ticket subir · ⭐ e a sua observação do `about_v3` §6:
*"a tese 'a IA não lê seus dados' é fraca — Google/Anthropic é mais confiável que a equipe. A
equipe ler os dados gera incômodo; o Google ler gera indiferença."*
⛔ Nada de arquitetura. Fontes: V1 §1/§8, V2 §1/§7, V3 §10. **~200 linhas.**

### `11-visao-de-produto.md`

Responde: quais superfícies existem, o que cada usuário faz, o que entra e o que ficou fora.
Entra: as três superfícies · a jornada de onboarding · ⭐ **a receita-modelo** (`about_v3` §1: não
matar as receitas, ter **uma** forte como referência) — proponho `margem-sob-estresse` porque ela
exercita fórmula, `overrides`, sinal e limitação de uma vez · `about_v3` §3.3: **o catálogo de
padrões e as regras de negócio aparecem no front**, não só no prompt.
Fontes: V3 §3, V1 §5. **~250 linhas.**

### `12-visao-tecnologica.md`

Responde: como a coisa vai ser construída. ⚠️ **Aqui é onde duplicar o `CLAUDE.md` é mais
tentador e mais destrutivo.** Regra: `CLAUDE.md` = o que está no ar e como não quebrar;
este arquivo = **para onde vamos e por quê**.
Entra: o arquiteto + o motor · contrato `/resolver` versionado e público · tipos de pedido ·
orçamento de linhas · multi-planilha e o join depois da agregação (`about_v3` §5.3: **implementar
o (a)**) · ⭐ **arquitetura de agentes proposta de novo, sem herdar Z/A/C** (`about_v3` §2: não
precisa aproveitar a atual) · abstração de provedor com **Gemini Flash para raciocínio rápido +
Claude para pensamento** (`about_v3` §2.3) · ⭐ **observabilidade: log estruturado no Supabase**
(`about_v3` §2, e hoje não existe nada disso).
Se passar de 400 linhas, quebra em `12a-arquiteto.md` / `12b-contrato.md` / `12c-dados.md`.
**~350 linhas.**

### `20-pendencias.md` 🏗️ (por hierarquia de dificuldade, como pedido)

Responde: o que falta na plataforma, ordenado por dificuldade. Estrutura em 4 níveis —
**trivial** (< 1 dia) · **claro** (1–5 dias, sabe-se como) · **projeto** (1–3 semanas) ·
**precisa de decisão antes** (não é esforço, é escolha). Cada item: uma linha, dono, e link para
onde está o raciocínio.
⭐ **Substitui e consolida cinco arquivos** (`TODOS.md`, `organizar_tudo.md`,
`pendencias_e_dividas_tecnicas.md`, `query_engine/urgent.md`,
`urgent_multiplas_planilhas_simultâneas.md`) — este é o maior ganho de ordem do plano inteiro.
⚠️ Cuidado ao consolidar: aqueles arquivos carregam o **porquê** de cada adiamento, que é a parte
valiosa. Se o porquê não couber numa linha, ele vai para `30-decisoes.md` e a pendência linka.
**~200 linhas.**

### `21-melhorias-do-plum-vendido.md` 🔧

Responde: o cliente já tem onboarding feito — o que podemos somar? Entra: dicionário camadas 3 e
4 (relações, fórmulas, sinais, grão) · regras de negócio como "skills" do agente dentro de
"minha base de dados" (`about_v3` §3.2) · travas duras como regra de negócio **da implementação**
(`about_v3` §3.1, ver §11 abaixo) · template por vertical · insight proativo.
⭐ Este arquivo é a lista de upsell. Hoje ela não existe em lugar nenhum, e é o que responde "o
que o cliente paga no mês 13". **~150 linhas.**

### `22-planos-futuros.md`

Responde: o que existe no horizonte e **não** está sendo feito. Abre com aviso: *nada aqui está
implementado nem priorizado.* Entra: Maisa como tradutor · Plum Externo (cliente final) ·
prospecção Apollo + ICP do dado real · multi-canal.
⛔ Nenhuma estimativa que possa ser lida como compromisso. **~120 linhas.**

### `30-decisoes.md` ⭐ (minha adição — o arquivo que salva mais tempo no futuro)

Responde: *por que é assim?* Uma entrada por decisão: `D-nnn · data · decisão · por quê · o que
foi rejeitado · status`. É a única informação que um agente **não consegue reconstruir lendo
código** — e é a que mais gera retrabalho quando falta.
Já existe material espalhado para ~20 entradas: por que k-anonimato saiu · por que o cache de
plano guarda plano e não resultado · por que o Z-dash é fail-open · por que `dashboard-agent` tem
prompt próprio (D1) · por que `origin_question` é `NULL` (D4) · por que a Fase 5b não publicou o
chat (D7) · por que um `batchGet` por dataset (11A) · por que `gid` e não nome de aba · por que
migrations são manuais · Gemini Flash + Claude por papel · joins continuam bloqueados.
**~250 linhas, e cresce uma linha por decisão.**

### `31-incidentes-e-licoes.md`

Responde: o que já deu errado e qual regra nasceu disso. Entra: escalonamento de privilégio de
2026-07-22 → as 12 regras de segurança · R-13 (o Agente C multiplicando `soma × média`) ·
a armadilha do "Supabase Preview" que publica com cobertura desconhecida · o vazamento da classe
`tema-escuro` no logout · o `gid` descartado por `extrairSheetId`.
⭐ Formato importa: **incidente → regra**, nunca só a narrativa. **~150 linhas.**

### `40-implementacao/metodo-onboarding-de-dados.md` 🔧

Responde: como conduzir um onboarding pago, passo a passo. É o playbook do produto que já vendeu
4×, e hoje só existe na cabeça da equipe. Entra: roteiro da conversa de descoberta · como extrair
fórmulas, sinais e grão do cliente · o que precisa ser **assinado** pelo cliente · checklist de
saída · como virar template de vertical.
⭐ Enquanto isso não existir em texto, cada onboarding custa o mesmo que o primeiro. **~200 linhas.**

---

## 4. `CLAUDE.md` por pasta — e uma correção de rota

Você pediu "CLAUDE.md em cada pasta". ⭐ **Concordo, mas o valor está nas pastas de *código*, não
nas de documento** — é lá que o agente edita e é lá que ele quebra coisa.

| Arquivo | Conteúdo (curto, só o que a pasta esconde) |
|---|---|
| `CLAUDE.md` (raiz) | **fica como está.** Global: stack, comandos, invariantes, checklist final |
| `contexto/CLAUDE.md` | "aqui não entra código nem passo-a-passo; um fato tem um único dono; superado vai para `90-arquivo/`" |
| `contexto/40-implementacao/CLAUDE.md` | "conhecimento de cliente. Nunca importado por código da plataforma — carregado como **dado**. Não generalize daqui para a plataforma" |
| `supabase/functions/CLAUDE.md` | ⭐ a armadilha de deploy, `_shared` empacotado por função, a exceção deliberada do `ai-plum-chat`, conferir `ezbr_sha256` |
| `query_engine/CLAUDE.md` | motorista cego, as 4 barreiras, teto antes do parse, espelho de `normalizar_coluna` |
| `src/CLAUDE.md` | `.dark` sem consumidor × `.tema-escuro`, `border-border` sem opacidade, portal do Radix, extrator de classe que não pula comentário |
| `supabase/migrations/CLAUDE.md` | ordem, idempotência, bloco de verificação, aplicar à mão pelo painel |

⚠️ **Regra para não recriar o problema:** cada `CLAUDE.md` de pasta tem **teto de 40 linhas** e só
contém o que *aquela pasta* esconde. Se começar a explicar o produto, virou duplicata do
`contexto/` e vai divergir.

---

## 5. Inventário: destino dos 50 arquivos

**FICA** (7): `CLAUDE.md` · `DESIGN.md` · `infra/aws/PASSO-A-PASSO.md` · `README.md` (reescrito) ·
`supabase/functions/README.md` · `testes/chat/README.md` · `docs/fases dashboard/README.md`
(vira o índice de `90-arquivo/fases-dashboard/`).

**FONTE → depois `90-arquivo/`** (11): `docs/PRD-PLUM2.0.md` · `query_engine/prd.md` ·
`query_engine/implementation.md` · `query_engine/urgent.md` · `TODOS.md` · `organizar_tudo.md` ·
`pendencias_e_dividas_tecnicas.md` · `reorganizacao_cargos_e_permissoes.md` ·
`PLANO-cache-de-perguntas-com-data.md` · `urgent_multiplas_planilhas_simultâneas.md` ·
`zz_remake/*` (V1–V3 + `about_*` + este plano).

**HISTÓRICO → `90-arquivo/`, com aviso no topo** (17): `docs/fases dashboard/*` ·
`docs/logs/*` · `docs/2026-08-*` · `docs/INCIDENTE-*` · `docs/k-anonimato-removido.md` ·
`docs/SSO-DOMINIO.md` · `docs/MUDANCAS-FRONT-ENDURECIMENTO.md` ·
`docs/investigacao-rbac-*` · `docs/plano-k-anonimato-por-cargo.md`.
⚠️ **Antes de arquivar, extrair as decisões para `30-decisoes.md` e os incidentes para `31-`.**
Arquivar sem extrair é perder o porquê — é o único jeito de este plano piorar o repo.

**APAGAR de verdade** (5): `REMAKE-…_V1.md` na **raiz** (duplicata exata) · `.lovable/plan.md` ·
`query_engine/.pytest_cache/README.md` (gerado — e entra no `.gitignore`) ·
`test_data/test_errors/investigacao-data-nao-encontrada.md` (investigação encerrada) ·
`src/pages/prd_chat_ui.md` (❓ conferir se ainda descreve a tela atual antes de apagar).

**MANTER onde está** (4): `docs/PASSO-A-PASSO-APLICAR.md` (⚠️ cita 3 arquivos que não existem —
corrigir, não arquivar) · `testes/chat/teste-*` (roteiros vivos) · `infra/aws/README.md`.

---

## 6. ✂️ Sobre "apagar o resto" — eu recomendaria não

Você escreveu *"apagar o resto"*. Entendo o impulso, e discordo em um ponto específico:

⚠️ **Os documentos superados carregam o *porquê*, e `git log` é invisível para um agente em one
shot.** Apagar `k-anonimato-removido.md` não deixa o repo mais limpo para o agente — deixa a
remoção do k-anonimato sem justificativa, e a próxima pessoa reintroduz. O `CLAUDE.md` atual é
bom exatamente porque **preserva as correções datadas** ("⚠️ Correção de 2026-08-12: o check
PUBLICA, mas não publica tudo").

⭐ **E o diagnóstico da §0 sustenta isso: o ruído vem de ambiguidade, não de volume.** Um arquivo
com `status: superado` no topo, numa pasta que o `00-LEIA-PRIMEIRO.md` manda pular, gera zero
confusão. O que gera a visão errada é um PRD de 1.108 linhas em `docs/` **sem marca nenhuma**.

**Proposta:** apagar só as 5 duplicatas/geradas da §5. O resto vai para `90-arquivo/` com três
linhas no topo:

```markdown
> ⛔ SUPERADO — 2026-08-14. Não use como referência.
> Substituído por: [[contexto/12-visao-tecnologica]]
> Mantido porque registra POR QUE decidimos assim.
```

❓ Se você preferir apagar mesmo assim: extraia primeiro as decisões para `30-decisoes.md`. Aí
apagar é seguro, porque o porquê já tem outro dono.

---

## 7. A skill de manutenção

Você pediu *"uma skill para que o claude sempre atualize eles"*. Duas peças — uma sem a outra não
funciona:

**(a) A skill** — `.claude/skills/contexto-plum/SKILL.md`

- **Quando dispara:** ao terminar qualquer alteração que mude comportamento, decisão, pendência
  ou fato sobre o produto; ou quando alguém pede "atualize o contexto".
- **O que ela faz, em ordem:** (1) classifica a mudança — 🏗️ ou 🔧? fato, decisão ou pendência?
  (2) roteia para **um** arquivo pela tabela da §3; (3) atualiza `atualizado_em`; (4) se foi
  decisão, cria entrada em `30-decisoes.md` com o que foi rejeitado; (5) se contradisse algo,
  marca o antigo como superado **e datado**, sem apagar; (6) se um arquivo passou de 400 linhas,
  avisa; (7) roda o teste de aceite da §9 e reporta.
- **O que ela proíbe explicitamente:** criar arquivo novo sem tirar conteúdo de outro ·
  repetir fato que já tem dono · escrever em `90-arquivo/`.

**(b) A linha no checklist do `CLAUDE.md`** — a §9 dele já tem "Antes de terminar qualquer
alteração". Acrescentar:

```
- [ ] Mudou algum FATO sobre o produto (não só código)? Rode a skill `contexto-plum`.
```

⚠️ **Por que as duas:** skill sozinha depende de o agente notar que ela se aplica. O checklist é
lido em toda tarefa e é o que garante o disparo. É o mesmo par cinto-e-suspensório que o repo já
usa para deploy de Edge Function.

---

## 8. Obsidian

A V3 §11 tem o detalhe (vault = raiz do repo, exclusões obrigatórias de `node_modules`/`dist`,
versionar `app.json` e ignorar `workspace.json`, não depender de Dataview). O que este plano
acrescenta:

- **Frontmatter padrão**, para virar painel sem plugin obrigatório:
  ```yaml
  status: vigente | superado | proposta
  camada: plataforma | implementacao | negocio | ambos
  atualizado_em: 2026-08-14
  ```
- **`00-LEIA-PRIMEIRO.md` é a nota inicial do vault** (Settings → "Default location for new
  notes" e a nota de abertura). Quem abre o Obsidian e quem abre o Claude Code entram pela mesma
  porta.
- ⚠️ **Wikilink para arquivo de código não resolve.** Para apontar `src/lib/colunas.ts`, use
  caminho em backtick, não `[[ ]]` — senão o Obsidian cria nota fantasma e o link vira lixo.

---

## 9. ⭐ Teste de aceite — o que faz este plano ser verificável

"Melhorar a documentação" não é mensurável. Isto é: **um Claude sem contexto, lendo apenas
`contexto/` e `CLAUDE.md`, responde as 12 perguntas abaixo. Meta: no máximo 1 erro.**

| # | Pergunta | Resposta certa |
|---|---|---|
| 1 | O Plum altera dados do cliente? | Nunca. R-01 |
| 2 | Onde está o schema real do banco? | `supabase/migrations/` — **não** no PRD |
| 3 | A plataforma é o produto vendido? | Não, é demo. Vende-se a implementação |
| 4 | O que custa 23k? | O onboarding de dados (implementação) |
| 5 | O executor consulta o Supabase? | Nunca |
| 6 | Deploy de Edge Function é automático? | Publica com cobertura desconhecida; publique à mão |
| 7 | k-anonimato está ativo? | Não, removido em 2026-08-08 |
| 8 | O chat cacheia resultado ou plano? | Plano |
| 9 | Joins entre planilhas são permitidos? | Não. Cruzamento acontece depois da agregação |
| 10 | Onde o executor roda? | Lambda, não EC2 |
| 11 | Qual o ICP? | Médio porte, varejo, base bagunçada, equipe técnica pequena, com orçamento |
| 12 | Uma feature nova é plataforma ou implementação — como decidir? | Depende do significado da coluna? → implementação |

⭐ **Rode este teste ANTES de começar, com o repo como está hoje.** O número de erros na linha de
base é a melhor justificativa do esforço — e, se for baixo, o plano pode ser bem menor do que
parece.

---

## 10. Execução — 5 fases

| Fase | O quê | Esforço | Entregável |
|---|---|---|---|
| **0** | Rodar o teste da §9 no repo atual e anotar a linha de base. `git tag antes-da-reorg` | 1 h | número de erros |
| **1** | ⭐ **Extração**: varrer as 11 fontes e os 17 históricos tirando **decisões** → `30-` e **incidentes** → `31-`. Nada é movido ainda | 1 dia | `30-` e `31-` prontos |
| **2** | Escrever `00`, `01`, `02`, `03`, `04` (o núcleo — é o que resolve o diagnóstico) | 1 dia | agente já não erra o essencial |
| **3** | Escrever `10`, `11`, `12`, `20`, `21`, `22` + o `metodo-onboarding` | 2 dias | conjunto completo |
| **4** | `CLAUDE.md` por pasta (§4) + skill (§7) + linha no checklist | 0,5 dia | mecanismo de manutenção |
| **5** | Mover para `90-arquivo/` com aviso no topo · apagar as 5 · Obsidian · **rodar o teste de novo** | 0,5 dia | ≤ 1 erro |

**Total ~5 dias.** ⚠️ **A ordem importa: extrair antes de mover.** Inverter é como se perde o
porquê — e o porquê é a única coisa aqui que não se recompra.

❓ **Fase 1 é a única que eu não delegaria.** Decidir o que foi decisão e o que foi divagação
exige quem estava lá.

---

## 11. Roteamento do `about_v3`

Seus comentários na V3 não pedem um V4 — pedem endereço. Onde cada um entra:

| Comentário | Vai para | Muda algo? |
|---|---|---|
| Não matar as receitas; ter **uma** forte como modelo | `11-visao-de-produto` | ✅ Revisa V3 §3.2. Proponho `margem-sob-estresse` como referência |
| Estrutura das queries ao pandas precisa ser discutida | `12-visao-tecnologica` + `20-pendencias` (nível "precisa de decisão") | ❓ item aberto |
| A arquiteta lê dados da planilha para gerar contexto, depois consulta | `12-visao-tecnologica` | ✅ é a `amostra` da V3 §6, agora **no papel do arquiteto**, não do intérprete |
| ⭐ Quanto melhor a plataforma, mais fácil a implementação | `02-plataforma-vs-implementacao` (abertura) | ✅ vira o princípio do arquivo |
| A plataforma interpreta, o stakeholder decide o significado | `01` e `11` | ✅ é a fronteira do produto |
| Pode propor arquitetura de agentes nova, sem herdar Z/A/C | `12-visao-tecnologica` | ✅ libera o desenho |
| Logs estruturados no Supabase | `12-visao-tecnologica` + `20-pendencias` | ⭐ **novo** — não existe nada hoje |
| Gemini Flash (rápido) + Claude (pensamento) | `30-decisoes` | ✅ decidido |
| ⚠️ A IA pode errar, mas deve **mostrar como pensou e os cálculos**. Trava dura seria "não posso responder" a cada prompt — mas a implementação pode criar essa regra | `12`, `30-decisoes`, `21-melhorias` | ⭐ **revisa R-14.** Vira "raciocínio e cálculos visíveis" na plataforma; trava dura passa a ser regra de negócio 🔧, opcional por cliente. Risco V1 continua, mitigado por auditabilidade em vez de recusa |
| Fórmulas/grão como "skills" do agente em "minha base de dados" | `21-melhorias` + `12` | ✅ dicionário camada 4 ganha front. Reclassifica: mecanismo 🏗️, conteúdo 🔧 |
| Catálogo de padrões e regras visíveis no front | `11-visao-de-produto` | ✅ requisito de produto |
| Implementar o join **depois** da agregação (5.3a) | `12` + `30-decisoes` | ✅ decidido; R-11 sobrevive |
| A tese "a IA não lê seus dados" é fraca — o Google gera indiferença, a equipe gera incômodo | `10-visao-comercial` | ⭐ observação forte. Muda a narrativa de privacidade |
| 5 linhas não bastam? É o que o onboarding já faz | `30-decisoes` (❓ aberto) | Ver abaixo |

⭐ **Sobre as 5 linhas** — boa provocação, e você tem precedente do seu lado: o pipeline já
trafega cabeçalho + 5 linhas. 5 basta para entender **forma** (que colunas, que tipo, como o valor
vem escrito). Não basta para entender **variedade** — quantos status existem, se "loja" tem 4 ou
400 valores. Mas variedade é justamente o que `vocabulario` resolve, e melhor (com contagem, e
sem trafegar linha). **Recomendação: `amostra` = 5, alinhada ao que já existe, e variedade via
`vocabulario`.** Fica mais barato e mais defensável do que os 20 que eu tinha chutado.

---

## 12. Riscos deste plano

| # | Risco | Gravidade | Mitigação |
|---|---|---|---|
| P1 | Arquivar sem extrair → perde o porquê | **alto** | Fase 1 antes da Fase 5, sem exceção |
| P2 | `12-visao-tecnologica` duplicar o `CLAUDE.md` e divergir | **alto** | `CLAUDE.md` = o que está no ar; `contexto/` = para onde vamos. Nunca repetir, sempre linkar |
| P3 | Conjunto novo apodrecer em 2 meses | **alto** | Skill + linha no checklist (§7) + `atualizado_em` visível |
| P4 | Virar 12 arquivos que ninguém lê | médio | `00-LEIA-PRIMEIRO` + teto de 400 linhas + teste de aceite recorrente |
| P5 | `40-implementacao/clientes/` com dado de cliente num repo que um dia deixa de ser privado | **alto** | decidir agora: `.gitignore` + `exemplo-cliente/` versionado como molde |
| P6 | 5 dias de documentação parecendo 5 dias sem entregar produto | médio | Fase 2 (1 dia) já resolve a maior parte do teste. Pare ali se precisar |

---

## 13. ❓ Decisões antes de começar

1. **Apagar ou arquivar o superado?** Minha recomendação: arquivar com marca (§6).
2. **`contexto/` na raiz, ou dentro de `docs/`?** Recomendo raiz — `docs/` está queimada.
3. **`40-implementacao/clientes/` é versionado?** Decidir antes de criar a pasta (P5).
4. **`src/pages/prd_chat_ui.md` ainda descreve a tela atual?** Se não, entra na lista de apagar.
5. **Quem escreve o `metodo-onboarding-de-dados`?** É a única peça que exige quem conduziu as 4
   vendas — e é a de maior valor comercial do conjunto.
