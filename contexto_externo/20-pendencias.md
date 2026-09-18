---
status: vigente
camada: produto
atualizado_em: 2026-09-18
---

# Pendências — tese externa

> **Ordenadas por dificuldade, não por prioridade.** O raciocínio vai junto: pendência sem o
> porquê vira lista de desejos.
> ⏳ **Nada aqui começa antes de o remake interno fechar** (D-E-010). Esta lista é preparação.

---

## ⭐ A boa notícia: o caminho da linha bruta já está aberto

**Conferido no código em 2026-09-18.** O remake já entregou os tipos **`registro`** (até 5
linhas, exige `where`) e **`amostra`**, com orçamento implementado em `_shared/orcamento.ts`.
O porteiro **não precisa inverter invariante nenhum** — precisa de uma peça em cima do que
existe.

### O que fazer agora, durante o remake

Duas coisas, e as duas são baratas hoje:

| Ao mexer no executor / no `ad_hoc` | Prefira |
|---|---|
| Onde o `where` do `registro` é montado | **um ponto só**, para que somar um filtro do servidor seja uma linha, não uma caçada |
| Metadados por base | deixar espaço para um campo que o executor não interpreta hoje (será o `owner_column`) |

⭐ **Preservar isso custa quase nada agora; reabrir depois é refatoração.** É a diferença entre
a tese externa começar com semanas de vantagem ou meses de dívida.

---

## 🔴 Difícil — não se sabe ainda como fazer

| # | Pendência | O raciocínio |
|---|---|---|
| **PE-1** | ⭐ **Filtro de titular injetado pelo servidor** | Rebaixado de 🔴 para cá: `registro`/`amostra` e o orçamento **já existem**. Falta que o filtro de identidade seja somado pelo servidor em vez de escrito pelo planejador (R-E-03), mais `owner_column` por fonte. ⚠️ E o orçamento precisa de outro regime: 200/pessoa/dia foi dimensionado para linha bruta ser exceção, e no porteiro ela é a regra. Ver `12-visao-tecnologica.md` §4 |
| **PE-2** | ⛔ **Dono e auditoria da tabela identidade→titular** | É a chave-mestra do modelo de permissão, e hoje não tem dono, nem trilha, nem validade. Um `UPDATE` errado dá o acesso de uma pessoa a outra **sem erro nenhum** |
| **PE-3** | **Hierarquia de titular** | Gestor vê a equipe? Muda "titular" de pessoa para conjunto e mexe no núcleo da autorização. Decidir **antes** de codar — muito mais caro depois |
| **PE-4** | **Revogação vinda de fora** | Funcionário é desligado no sistema do cliente. O vínculo continua válido aqui, e o aviso não chega sozinho |

## 🟡 Médio — sabe-se o caminho, falta decidir

| # | Pendência | O raciocínio |
|---|---|---|
| **PE-5** | **Contrato do conector fechado** | O rascunho existe (`13-contrato-do-conector.md`). Falta fechar cache, paginação, versionamento e quem escreve o conector do cliente |
| **PE-6** | ⭐ **Conector universal de planilha** | Destrava o ciclo de venda e é 🏗️. Provavelmente o item de maior retorno comercial por esforço |
| **PE-7** | **Gatilho de saída da EvolutionAPI** | Não-oficial: risco de banimento, sem SLA. Definir agora a condição de migração para a Cloud API — decidir depois da primeira suspensão é decidir sob pressão |
| **PE-8** | **Permissão de documento: documento ou trecho** | Comece por documento e **escreva a decisão**, para que "por trecho" seja escolha e não esquecimento no primeiro contrato com cláusula comercial |
| **PE-9** | **Revisão humana do contexto consolidado** | O resumo gerado por IA vira fonte de verdade e responde cliente. Precisa da mesma régua que o dicionário tem |
| **PE-10** | **Corte de documento por estrutura** | Cortar por caractere quebra cláusula no meio. Por cabeçalho/seção/artigo — e é o argumento para exigir Docs em vez de PDF no primeiro release |
| **PE-11** | **Três recusas distintas** | "Não pode ver", "não existe" e "fonte fora do ar" não podem virar a mesma frase. Texto próprio, testado, e registro no console |
| **PE-12** | **Telefone compartilhado / não cadastrado** | Apareceu na discovery da Helisul (Q-09) e vai reaparecer em todo cliente |

## 🔵 Claro — só falta fazer

| # | Pendência |
|---|---|
| **PE-13** | ⭐ Integração do canal WhatsApp — **servidor EvolutionAPI e número já configurados e prontos**. É implementar nesta plataforma, não montar do zero |
| **PE-14** | Áudio e imagem no canal — requisito de adesão, não conveniência |
| **PE-15** | Métrica de deflexão instrumentada, com linha de base **antes** do piloto |
| **PE-16** | Console da central: fila, alertas, gestão de acesso |
| **PE-17** | Landing page da tese externa |
| **PE-18** | `31-incidentes-e-licoes.md` — ainda vazio; o primeiro incidente desta tese cria |

---

## ⚠️ Dívidas que já nascem conhecidas

| Dívida | Por que se aceita agora |
|---|---|
| **Identidade só por telefone** | Adequado para escala e folga; frágil para dado financeiro. Revisitar quando entrar valor monetário |
| **Gateway não-oficial de WhatsApp** | Certo para piloto, errado para contrato. Ver PE-7 |
| **Conector por cliente** | Decisão consciente (D-E-002). O contrato é o que impede virar prejuízo |
| **Sem aviso proativo** | Reduz escopo e risco de LGPD e de spam. É outro produto |

---

## Ordem sugerida de ataque

1. **PE-1 e PE-2** — destravam tudo e são os únicos que não dá para contornar
2. **PE-5 + PE-6** — o contrato e o conector universal; juntos, viabilizam vender
3. **PE-13 + PE-11** — canal e recusas: é o produto mínimo apresentável
4. **PE-15** — instrumentar **antes** do primeiro piloto, ou o resultado vira opinião
5. O resto, por demanda de cliente real
