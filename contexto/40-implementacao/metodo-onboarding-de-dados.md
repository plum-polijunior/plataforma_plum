---
status: proposta
camada: implementacao
atualizado_em: 2026-08-14
---

# Método — Onboarding de Dados

> **O que este arquivo é:** o playbook do produto pago. Como conduzir um onboarding, o que extrair
> do cliente, o que entregar e o que fica assinado.
> ⚠️ **`status: proposta`** — este método é a formalização do que a equipe já fez 4 vezes. Precisa
> ser revisado por quem conduziu essas vendas antes de ser usado como está.
>
> ⭐ **Por que existe:** enquanto isso só existir na cabeça da equipe, cada onboarding custa o mesmo
> que o primeiro. Este arquivo é o mecanismo que faz cada execução baratear a seguinte.

---

## O que é vendido

**Onboarding de dados** — o trabalho de tornar a base de um cliente consultável e interpretável.
Ticket praticado: ~R$ 23k.

**O entregável não é "a base limpa".** É o **dicionário de 4 camadas, assinado pelo cliente** — a
base limpa é consequência. A diferença importa: base limpa é dele e não gera recorrência; dicionário
é o insumo que o produto consome, e ele cresce.

| Camada | Conteúdo | Quem sabe |
|---|---|---|
| 1. Colunas | nome, tipo, significado, regras de limpeza | a IA propõe, o cliente confirma |
| 2. Valores | vocabulário das dimensões | sai da própria base |
| 3. Relações | chaves entre planilhas, **grão** de cada tabela | ⭐ só o cliente sabe |
| 4. Regras | fórmulas, sinais, proibições, calendário | ⭐ só o cliente sabe |

⭐ **As camadas 3 e 4 são o trabalho real.** É extração de conhecimento, não limpeza de dado.

---

## Roteiro da conversa de descoberta

Perguntas que **têm** de ser respondidas. Não são um formulário para enviar — são o que a conversa
precisa cobrir.

**Sobre o negócio**
- Quais são os 3 números que você olha toda semana? De onde eles saem hoje?
- Qual pergunta você faz e demora mais para ser respondida?
- Qual decisão você tomaria diferente se tivesse o número na hora?

**Sobre as fórmulas** ⭐ (o mais valioso, e o que ninguém documenta)
- Como você calcula margem? E ticket? E os indicadores da sua meta?
- Que número você calcula à mão hoje, fora de qualquer sistema?
- Tem número que "todo mundo sabe" que é calculado de um jeito específico aqui?

**Sobre os sinais**
- Para cada indicador: subir é bom ou ruim?
- Qual é a meta, e ela varia por período / loja / pessoa?

**Sobre o grão** ⚠️ (a pergunta que evita o erro mais silencioso)
- Uma linha desta planilha representa o quê, exatamente?
- Se eu somar esta coluna inteira, o número faz sentido, ou dá dobrado?
- As planilhas têm o mesmo nível de detalhe? (metas por trimestre × vendas por dia?)

**Sobre o calendário**
- Quando fecha o mês? O mês corrente está completo?
- Tem período que não deve ser comparado com outro? (promoção, greve, mudança de sistema)

**Sobre as proibições**
- Que coluna nunca deve ser somada?
- Tem coluna que já não vale mais, ou que mudou de significado numa data?
- Que coluna tem dado sensível — inclusive **dentro** de campo de texto livre?

**Sobre as pessoas**
- Quem pode ver margem? Quem só vê o próprio resultado?
- Quem vai usar isso toda semana? (é essa pessoa que decide se renova)

---

## Passo a passo

| # | Etapa | Saída |
|---|---|---|
| 1 | **Inventário** — quais planilhas/CSVs existem, quem mantém, com que frequência atualizam | lista de bases candidatas |
| 2 | **Triagem** — quais entram agora. Comece pela que responde os 3 números da semana | escopo acordado |
| 3 | **Onboarding pela plataforma** — as 5 etapas, camada 1 do dicionário | `schema_metadata` preenchido |
| 4 | ⚠️ **Verificação real** — ler a planilha de verdade e comparar o cabeçalho com o do arquivo | pega aba errada, base não compartilhada, cabeçalho divergente e coluna sem título **de uma vez** (I-08) |
| 5 | **Descoberta** — a conversa acima, com quem conhece o negócio | rascunho das camadas 3 e 4 |
| 6 | **Formalização** — escrever fórmulas, sinais, grão, proibições no formato do dicionário | `dicionario.md`, `regras.md`, `relacoes.md` |
| 7 | ⭐ **Validação com o cliente** — rodar 5 a 10 perguntas reais e conferir cada número com quem sabe a resposta | divergências corrigidas antes da entrega |
| 8 | **Assinatura** — o cliente confirma que as fórmulas e o grão estão certos | ⭐ é o que transfere a responsabilidade sobre o significado |
| 9 | **Entrega** — relatório: o que está habilitado, o que está bloqueado e o que falta para desbloquear | é a base do próximo upsell |
| 10 | **Template** — o que dessa base é típico do setor volta para `templates/` | ⭐ é o que barateia o próximo |

---

## O passo 7 é o que separa entrega de risco

**Rodar as perguntas com o cliente na sala, antes de entregar.** Um número errado descoberto na
validação é ajuste; o mesmo número descoberto na reunião de diretoria dele é o fim da relação.

Escolha perguntas que exercitem: uma agregação simples, uma fórmula da camada 4, um recorte por
dimensão, um cruzamento entre duas planilhas, e uma pergunta que a base **não** deveria conseguir
responder (para conferir que o Plum recusa em vez de inventar).

---

## O passo 8: o que fica assinado, e por quê

O cliente confirma:

- as **fórmulas** ("margem é isto");
- os **sinais** (subir é bom ou ruim);
- o **grão** de cada tabela;
- as **proibições**;
- a **política de sensibilidade** — quais colunas são sensíveis, quais vocabulários podem ir ao
  modelo, se `amostra` é permitida nesta base.

⭐ **Por que assinar:** a fronteira do produto é *a plataforma interpreta os dados e produz um
resultado; o stakeholder decide o que significa*. Se a fórmula estiver errada, o Plum vai calcular
com precisão a coisa errada — e a assinatura é onde essa responsabilidade fica clara, antes de haver
problema.

---

## O relatório de entrega

Uma página, três blocos:

1. **O que a sua base responde hoje** — a lista de análises habilitadas, com um exemplo real de cada.
2. **O que ela ainda não responde, e por quê** — "não há coluna de custo, então margem não sai".
3. **O que desbloqueia o quê** — *"com uma coluna de custo unitário, mais 5 análises passam a
   funcionar."*

⭐ **O bloco 3 é o produto seguinte se vendendo sozinho**, e é a única parte do relatório que não
pode faltar.

---

## Como virar template de vertical

Depois de cada onboarding, separe o que é **daquele cliente** do que é **daquele setor**:

| Do cliente | Do setor → vai para `templates/` |
|---|---|
| nomes das colunas dele | grão típico ("varejo: 1 linha por item de pedido") |
| os valores das dimensões | fórmulas típicas (margem, ticket, ruptura, giro) |
| a estrutura de cargos | sinais típicos (devolução: ruim; recompra: bom) |
| as particularidades do calendário dele | proibições típicas (nunca somar preço unitário) |
| | perguntas típicas que o setor faz |

⭐ **Meta:** o décimo varejista começa o passo 5 com um rascunho de 70% já preenchido, e a conversa
de descoberta vira **confirmação** em vez de descoberta. Onboarding cai de semanas para dias, a
margem sobe e o preço não precisa cair.

---

## Onde guardar

```
40-implementacao/
  metodo-onboarding-de-dados.md   ← este arquivo
  templates/template-varejo.md    ← o que é típico do setor
  clientes/<cliente>/
    dicionario.md   regras.md   relacoes.md   historico.md
```

⚠️ **`clientes/` contém dado de cliente.** ❓ Decidir **antes** de a pasta ter conteúdo real: entra
no `.gitignore` com um `exemplo-cliente/` versionado como molde, ou é versionada assumindo que o
repo permanece privado? Ver `20-pendencias.md` D8.

---

## ❓ Abertas

1. **Quem escreve a versão definitiva deste método?** Precisa de quem conduziu as 4 vendas — este
   arquivo é uma reconstrução, não um registro.
2. **O passo 8 é assinatura formal ou e-mail de confirmação?**
3. **Quanto do passo 5 pode ir para a interface** (o cliente preenchendo fórmulas sozinho em "minha
   base de dados") e quanto exige um humano do nosso lado? É a pergunta que decide se o onboarding
   fica caro para sempre.
