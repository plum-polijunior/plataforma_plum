---
status: vigente
camada: ambos
atualizado_em: 2026-08-27
---

# Glossário

> **O que este arquivo é:** o significado dos termos internos, em uma ou duas frases.
> ⭐ **Por que existe:** metade das confusões deste projeto foi vocabulário, não conceito. Dois
> termos são ativamente ambíguos e estão marcados com ⚠️.

---

## Os dois "Plum"

**Plataforma (Plum plataforma)** · multi-tenant, plug-and-play, horizontal. O cliente faz o
onboarding sozinho e experimenta. É uma **demo**. Quando um documento diz "o Plum" sem qualificar,
normalmente é esta. → `02-plataforma-vs-implementacao.md`

**Implementação (Plum implementado)** · vertical, feita à mão sobre a base de um cliente:
dicionário, fórmulas, grão, o que é sensível. **É o que se vende.**

**Onboarding de dados** · o nome do produto pago que produz a implementação. Entregável: o
dicionário de 4 camadas, assinado pelo cliente. → `40-implementacao/metodo-onboarding-de-dados.md`

---

## Arquitetura

**A1 · A2 · A3 · A4** · ⭐ os quatro slots da cadeia `ad_hoc` do chat. **O número é o slot; o nome é
a implementação.** Hoje: `a1_porteiro` (segurança e viabilidade) → *slot 2 vazio* →
`a3_planejador` (emite o Query Plan) → executor → `a4_interprete` (a prosa, que não faz conta).

⚠️ **Duas confusões que este verbete existe para evitar:**
1. **O A3 é o `planejador`, não o "reconhecedor".** `reconhecedor` foi o nome do **A2**, o agente que
   o cadastro substituiu no B15 (`30-decisoes.md` D-049). O identificador sobrevive no tipo `Papel`,
   no `log_core.ts` e no CHECK de `plum_logs.etapa` sem avisar que o agente morreu — daí a confusão
   ser reprodutível, não um lapso.
2. **Um slot pode ter várias implementações.** `a3_planejador` e o futuro `a3_tendencia` são dois A3.
   Quando isso acontecer, quem escolhe entre eles é o `a2_encaminhador` (D-054).

**`a2_encaminhador`** · (proposta, Etapa 3) o slot 2 preenchido: por pergunta, escolhe **quais bases**
entram no prompt do A3 **e qual A3** planeja. ⛔ Não é o `reconhecedor` revivido — aquele não via a
pergunta, e é exatamente por isso que era cacheável. → `30-decisoes.md` D-054

**Registro de agentes** · `_shared/agentes.ts`: por agente, `quando_usar` e capacidades. ⭐ **Dono é o
administrador, não o cliente** — é código versionado, publicado por deploy, e dele saem *gerados* o
prompt do A2 e o `switch` de despacho. A fronteira: o cliente escreve o que os **dados** significam
(no `schema_metadata`); nós escrevemos o que os **agentes** sabem fazer. → `30-decisoes.md` D-054

**Arquiteto** · (proposta do remake) o componente que traduz a pergunta do usuário em um **plano de
ação analítico** — decide *que análise* a pergunta exige antes de qualquer dado ser buscado. A LLM
escolhe dentro da estrutura que ele monta, não livremente. → `12-visao-tecnologica.md`

**Motor** · a parte que resolve pedidos de dado: autoriza, lê, agrega, devolve. Determinístico.

**Motorista cego** *(blind execution)* · o executor Python. Não recebe a pergunta, não conhece a
intenção de negócio e **não consulta o Supabase**. Obedece um payload já assinado com o conjunto de
colunas já autorizado.

**Query Plan** · o JSON que a IA emite e o pandas executa: `from`, `select`, `where`, `group_by`,
`order_by`, `limit`. É a fronteira entre "a IA planeja" e "o código executa".

**`/resolver`** · (proposta) o contrato público entre quem raciocina e quem resolve dado. Recebe
uma lista de **pedidos nomeados** num lote e devolve os resultados pelos mesmos nomes.

**Pedido nomeado** · um item do lote do `/resolver`, com `id` escolhido pelo chamador (`info_1`,
`receita_ago`). O agente batiza o que pediu e recebe de volta pelo mesmo nome.

**Negação parcial** · quando um pedido do lote é recusado por RBAC e os outros seguem. O agente
então responde de forma honesta e incompleta em vez de dar erro genérico.

**Padrão analítico** · 🏗️ uma *forma de analisar*, independente de setor: decomposição de variação,
Pareto, sazonalidade, comparação temporal. São ~12 e são universais. **Não é** um insight de
domínio.

⚠️ **Receita** · termo ambíguo, evite. Pode significar (a) *faturamento* — o sentido de negócio — ou
(b) *recipe*, o roteiro que descreve como produzir um insight. Quando for o sentido (b), prefira
**roteiro** ou **protocolo**. → `30-decisoes.md` D-036

**Cenário** · uma pergunta de consequência ("e se a glosa subir 20k?"). Implementado como
`overrides` no plano: altera valores em memória antes de agregar. Não escreve nada.

**`overrides`** · o nó do plano que aplica a alteração de um cenário. Enum fechado
(`add`/`mul`/`set`/`sub`), sem `eval`. ⚠️ Toda coluna dentro dele precisa passar pelo RBAC.

---

## Dados

**Dataset** · uma base conectada no Plum. Corresponde a **uma aba** de uma planilha, não à planilha
inteira.

**`schema_metadata`** · o `jsonb` em `datasets` que guarda, por coluna, a definição semântica e as
`formattingRules`. Chamado de "o cérebro do produto".

**Dicionário de 4 camadas** · (proposta) a evolução do `schema_metadata`:
1. **colunas** — nome, tipo, significado *(existe hoje)*
2. **valores** — o vocabulário das dimensões: quais lojas, status, vendedores
3. **relações** — chaves entre planilhas e o **grão** de cada tabela
4. **regras** — fórmulas, sinais, proibições, calendário

**Vocabulário de dimensão** · os valores distintos de uma coluna categórica, com contagem. Resolve
"quanto o vendedor NOME SOBRENOME vendeu?" sem o LLM adivinhar o literal.
⚠️ Pode ser PII (lista de clientes) — por isso a exposição é opt-in por coluna.

**Grão** · a unidade de uma linha da tabela: "1 linha por item de pedido", "1 linha por mês por
loja". ⭐ Cruzar duas tabelas de grão diferente produz número errado plausível.

**Regra de negócio** · 🔧 o conhecimento que não está nos dados: `margem = receita − custo − glosa`,
`glosa é perda (subir é ruim)`, `nunca somar preço unitário`. É o que permite responder "se A muda,
como fica B".

**`gid`** · o identificador numérico da aba dentro da planilha, atribuído pelo Google na criação.
Não muda com rename — por isso é ele que o banco guarda. ⚠️ `gid = 0` é a primeira aba, valor
legítimo.

**Normalização de nome de coluna** · a conversão do cabeçalho original para `snake_case` sem acento.
Implementada **duas vezes** (TS e Python) de propósito, com tabela de 26 casos replicada nos testes
dos dois lados. → `30-decisoes.md` D-017

**Agregação obrigatória** · a regra de que todo resultado passa por soma/média/contagem, nunca linha
bruta (`RawRowsBlocked`). ⚠️ Em revisão — D-033.

**Orçamento de linhas** · (proposta) o teto de linhas brutas entregues por sessão, com log.
Substitui a agregação obrigatória como proteção contra exfiltração. Contábil, não estatístico.

**k-anonimato** · regra **removida** em 2026-08-08: exigia mínimo de linhas de origem por grupo.
Suprimia resposta legítima mais do que protegia alguém. ⭐ Não reintroduzir nada dessa família.
→ D-012

---

## Segurança

**RBAC de coluna** · `role_permissions.allowed_columns` — quais colunas cada cargo vê em cada
dataset. Default é vazio: permissão é sempre explícita.

**`permissions_fingerprint`** · hash do `allowed_columns`, usado como chave do cache de snapshot de
card. Revogar uma coluna invalida o cache sozinho.

**Fail-open × fail-closed** · o Z-dash é fail-**open** de propósito (é economia de custo, não
controle de segurança). Um guardião voltado ao cliente final precisa ser fail-**closed**. O critério
é *para que serve o guardião*. → D-023

**Mecanismo × política (de segurança)** · mecanismo (RLS, RBAC, teto, log) é 🏗️ plataforma;
política (*quais* colunas são sensíveis) é 🔧 implementação. → D-039

**`principal`** · (proposta, Etapa 2) quem está perguntando no Plum Externo — o cliente final, não
um usuário do tenant. Chega assinado, nunca é lido de texto do chat.

---

## Comercial

**ICP** · *ideal customer profile*. Hoje: médio porte, varejo, base bagunçada, equipe técnica
pequena, com orçamento. → `10-visao-comercial.md`

**Vertical** · um setor específico de mercado (varejo, faturamento em saúde, jurídico), em oposição
a **horizontal** (serve qualquer setor). A plataforma é horizontal; a implementação é vertical.

**ITIP** · o ticket recorrente — hoje ~R$ 2k, contra ~R$ 23k de projeto. A desproporção é o problema
central do negócio.

**Glosa** · vocabulário de faturamento em saúde: valor faturado que o convênio se recusou a pagar.
Aparece nos exemplos porque recuperá-la é dinheiro que entra — um argumento de valor com número.

**AT** · Apresentação Técnica, a etapa comercial em que o produto é demonstrado.

**Espelho de dados** · contorno da "armadilha do ERP": em vez de integrar com SAP/Totvs, o cliente
exporta um `.xlsx`/`.csv` diário para a nuvem e o Plum lê aquilo.

**Maisa** · produto irmão — agente que conecta calendário e API de nota fiscal para profissionais
liberais. No remake, é o tradutor de linguagem natural e a camada de ação. → `22-planos-futuros.md`

---

## Documentação

**🏗️ / 🔧** · marcadores de camada usados em todo o `contexto/`: plataforma / implementação.

**`status: vigente | superado | proposta`** · o frontmatter de cada arquivo.
**`proposta`** significa desenhado e **não implementado**.

**`90-arquivo/`** · pasta de material superado que **existiu até 2026-08-14** e foi apagada depois de
o porquê de cada decisão ser extraído para `30-decisoes.md`. Se um documento citar essa pasta, é
resquício.
