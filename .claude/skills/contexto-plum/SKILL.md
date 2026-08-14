---
name: contexto-plum
description: Mantém a pasta contexto/ do Plum atualizada e sem duplicação. Use ao terminar qualquer alteração que mude um FATO sobre o produto — uma decisão tomada, uma pendência resolvida ou criada, um comportamento novo, um erro comum descoberto, uma dívida assumida. Use também quando alguém pedir "atualize o contexto", "documente essa decisão" ou "registre isso". NÃO use para mudança que só toca código sem mudar nenhum fato documentado.
---

# Manter o contexto do Plum

> ⚠️ **Instalação:** mova ou copie esta pasta para `.claude/skills/contexto-plum/` para o Claude Code
> reconhecer a skill. Ela ficou em `skills/` porque `.claude/` é protegida em algumas sessões.

Você vai rotear uma mudança para **um** arquivo de `contexto/`, sem criar um segundo dono para o
mesmo fato.

⭐ **Princípio que manda em tudo:** *um fato, um dono.* Se dois arquivos respondem a mesma pergunta,
um deles vai ficar velho e alguém vai acreditar no errado. Prefira **linkar** a repetir.

## Passo 1 — Classifique

Responda as três antes de escrever qualquer coisa:

1. **Camada:** 🏗️ plataforma (serve a qualquer base) ou 🔧 implementação (depende do significado de
   uma coluna)? O teste está em `contexto/02-plataforma-vs-implementacao.md`. Se a resposta for "os
   dois", separe em duas partes.
2. **Natureza:** é um **fato** (o produto passou a ser assim), uma **decisão** (escolhemos X e
   rejeitamos Y), uma **pendência** (falta fazer), um **incidente** (deu errado) ou uma **crença
   errada** que você acabou de desfazer?
3. **Já tem dono?** Procure antes de criar — `Grep` pelo termo em `contexto/`.

## Passo 2 — Roteie

| Natureza | Arquivo |
|---|---|
| Decisão tomada (com o rejeitado) | `30-decisoes.md` — nova entrada `D-nnn`, **nunca renumere as antigas** |
| Algo deu errado e virou regra | `31-incidentes-e-licoes.md` — formato **incidente → causa → regra** |
| Crença errada desfeita | ⭐ `03-erros-comuns.md` — uma linha, com link para a explicação |
| Falta fazer / decisão pendente | `20-pendencias.md`, no nível 🟢/🔵/🟠/🔴 correto |
| Termo novo | `04-glossario.md` |
| Mudou o que o produto faz | `01-o-que-e-o-plum.md` (é hoje) ou `11-visao-de-produto.md` (é proposta) |
| Mudou a arquitetura-alvo | `12-visao-tecnologica.md` |
| Preço, ICP, objeção, venda | `10-visao-comercial.md` |
| Upsell para cliente com onboarding | `21-melhorias-do-plum-vendido.md` |
| Etapa 2 / horizonte | `22-planos-futuros.md` |
| Como conduzir onboarding | `40-implementacao/metodo-onboarding-de-dados.md` |
| O que é típico de um setor | `40-implementacao/templates/` |
| Armadilha de uma pasta de **código** | o `CLAUDE.md` daquela pasta (teto de 40 linhas) |
| Comando, deploy, invariante do que **está no ar** | `CLAUDE.md` da raiz — **não** `contexto/` |

## Passo 3 — Escreva

- Atualize `atualizado_em` no frontmatter do arquivo tocado.
- **Foi decisão?** A entrada em `30-decisoes.md` precisa dos cinco campos: data, decisão, **por
  quê**, **o que foi rejeitado**, status. Sem o rejeitado, alguém vai propor de novo o que já foi
  descartado.
- **Contradisse algo?** Marque o antigo como superado **e datado** (o padrão do repo é
  `⚠️ Correção de <data>:`), não apague. Se for um arquivo inteiro, mova para `contexto/90-arquivo/`
  com o aviso de três linhas no topo e link para o substituto.
- **Resolveu pendência?** Mova para a seção "Já resolvido — não reabrir" de `20-pendencias.md`, com o
  que ficou. Não delete a linha.

## Passo 4 — Verifique

- ⚠️ Algum arquivo passou de **400 linhas**? Avise e proponha a divisão.
- ⚠️ Você criou um segundo dono para um fato? Se sim, desfaça e linke.
- Rode as 12 perguntas do teste de aceite (abaixo) contra o que escreveu. Alguma resposta ficou
  ambígua?

## Proibições

- ⛔ **Nunca escreva em `contexto/90-arquivo/`.** É material superado.
- ⛔ Não crie arquivo novo sem tirar conteúdo de outro. Arquivo novo é redistribuição, não adição.
- ⛔ Não repita fato que já tem dono.
- ⛔ Não misture "o que é" com "o que queremos" no mesmo arquivo.
- ⛔ Não coloque dado real de cliente em `40-implementacao/clientes/` antes de a decisão de
  versionamento estar tomada (`20-pendencias.md` D8).
- ⛔ Não registre a **pergunta crua** do usuário em lugar nenhum — nem em exemplo, nem em log
  (`30-decisoes.md` D-022).

## Teste de aceite

Um agente sem contexto, lendo apenas `contexto/` e `CLAUDE.md`, deve acertar 11 das 12:

1. O Plum altera dados do cliente? → **nunca**
2. Onde está o schema real? → **`supabase/migrations/`**, não o PRD
3. A plataforma é o produto vendido? → **não, é demo**
4. O que custa ~23k? → **o onboarding de dados**
5. O executor consulta o Supabase? → **nunca**
6. Deploy de Edge Function é automático? → **cobertura desconhecida; publique à mão**
7. k-anonimato está ativo? → **não, removido em 2026-08-08**
8. O chat cacheia resultado ou plano? → **plano**
9. Joins entre planilhas são permitidos? → **não**
10. Onde o executor roda? → **Lambda**, não EC2
11. Qual o ICP? → **médio porte, varejo, base bagunçada, equipe técnica pequena, com orçamento**
12. Uma feature é plataforma ou implementação — como decidir? → **depende do significado da coluna?
    então é implementação**
