---
status: proposta
camada: tecnologia
atualizado_em: 2026-09-18
---

# O contrato do conector

> **O que este arquivo é:** o que todo conector precisa entregar para o núcleo funcionar.
> **Por que é o artefato central:** conector é 🔧 implementação (D-E-002). Se cada cliente exige
> um conector novo, **este contrato é a única coisa que impede a margem de sumir**. Acertá-lo
> faz uma integração durar uma semana; errá-lo faz cada cliente ser um produto novo.

---

## ⭐ O teste

> **Um conector novo é escrito sem tocar em nenhum arquivo do núcleo.**

Se precisou tocar, **o contrato está errado** — não o conector. Toda exceção aberta "só desta
vez" vira o motivo pelo qual o décimo cliente custa o mesmo que o primeiro.

---

## As cinco cláusulas

### 1. ⭐ O conector recebe o titular, nunca o descobre

A busca é **sempre** parametrizada por um titular já resolvido pelo núcleo. O conector não
recebe "traga tudo"; não filtra depois; não tem opinião sobre quem pode ver o quê.

⛔ **Por que é a cláusula mais importante:** se o filtro do titular acontece depois da leitura,
você carregou a operação inteira para responder sobre uma pessoa — e o isolamento passa a ser
uma propriedade do **seu código** em vez de uma propriedade da **chamada**. Um `if` errado vaza
tudo, e nada quebra.

### 2. Tipos de registro declarados, com dono explícito

Cada conector declara os conjuntos de registros que sabe ler. Para cada um:

- **nome estável** (não muda quando o sistema de origem muda de versão);
- **campos**, com tipo;
- ⭐ **qual campo é o titular** (`owner_column`).

⛔ **Conjunto sem titular declarado não é consultável pelo porteiro.** Fail-closed: a ausência
nega, não libera.

### 3. Somente leitura, sem exceção

Nenhuma escrita na fonte. Nunca. Solicitações ("quero reembolso") não viram `POST` — vão para a
fila humana.

⚠️ Isso não é conservadorismo: escrever em sistema de terceiro em produção é um risco que não é
nosso de correr, e é a fronteira que mantém a implantação negociável com o TI do cliente.

### 4. ⭐ Falha explícita — ausência nunca é resposta

| Situação | O conector devolve |
|---|---|
| Fonte fora do ar | **erro de disponibilidade** |
| Titular existe, não tem registro | **"nenhum registro"**, explicitamente |
| Titular não existe na fonte | **erro de identidade** |
| Campo existe mas está vazio | o campo, vazio — e diz que está |

⛔ **Os dois primeiros não podem colapsar em "lista vazia".** "Nenhuma escala encontrada" e "o
Cavok está fora do ar" viram a mesma frase para o piloto — *"você não tem escala amanhã"* — e
ele acredita. É a pior falha possível do porteiro (R-E-04).

### 5. Sem semântica de negócio

O conector traz o dado. **O que o dado significa mora no dicionário**, fora dele.

⚠️ Concretamente: o conector não sabe que `FR` é folga remunerada, não decide que "turno" é
derivado do horário, não traduz nada. Semântica dentro do conector é 🔧 conteúdo vazando para
dentro de 🏗️ mecanismo, e é assim que o próximo conector vira um mês de trabalho.

---

## A forma, em rascunho

Não é a implementação — é o **formato da fronteira**, para discussão:

```
conector.descrever()
  → [ { nome, campos: [{nome, tipo}], owner_column } ]

conector.buscar(conjunto, titular, filtros?)
  → { registros: [...] }
  | { erro: "indisponivel" | "identidade_desconhecida" | ... }
```

- `titular` é obrigatório e vem do núcleo.
- `filtros` é opcional e **nunca** inclui identidade.
- Não há `buscar_tudo`. A ausência dessa função é parte do contrato.

⭐ **Repare no que o contrato não tem:** nenhuma noção de permissão, de coluna visível, de
agregação, de linguagem natural. O conector é o pedaço mais burro do sistema, de propósito — é
a mesma disciplina do *motorista cego* do executor, aplicada na outra ponta.

---

## O conector universal de planilha

⭐ Um conector 🏗️ que serve todo cliente sem integração: o cliente exporta do sistema dele para
uma planilha, e o porteiro lê dali.

Existe por três motivos:

1. **Destrava o ciclo de venda** — sem ele, toda demonstração exige credencial do cliente, que
   exige TI, que exige semanas. O negócio morre antes da primeira demo.
2. É a mesma resposta que o produto já dá para a armadilha do ERP: *exporte, não integre*.
3. ⭐ Transforma o conector nativo em **upsell**, em vez de pré-requisito.

⚠️ **A limitação é real e tem de ser dita na venda:** exportação tem atraso. Serve para escala,
folga, férias e política. **Não serve** para "meu voo atrasou agora". Essa fronteira define quais
perguntas entram no piloto — e dizê-la antes é mais barato que descobri-la depois.

---

## ❓ Em aberto

- **Quem escreve o conector do cliente — nós ou o TI dele?** Muda o contrato: se for o cliente,
  o contrato precisa de documentação pública e de um modo de teste isolado.
- **Cache: responsabilidade do núcleo ou do conector?** Inclinação: núcleo. Conector que cacheia
  sozinho esconde indisponibilidade, e isso viola a cláusula 4.
- **Paginação e limite de taxa** ficam no conector (é detalhe da fonte) ou no núcleo (é política
  de produto)?
- **Versionamento:** a fonte muda de versão e o `nome estável` deixa de casar. Quem detecta?
