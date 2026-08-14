---
status: proposta
camada: implementacao
atualizado_em: 2026-08-14
---

# Template — Varejo (médio porte)

> **O que este arquivo é:** o rascunho do que é **típico do setor**, para que o próximo onboarding de
> varejo comece com ~70% preenchido e a conversa de descoberta vire **confirmação**.
> ⚠️ **`status: proposta` — este template é hipótese, não observação.** Ele foi escrito a partir do
> ICP declarado, não a partir das 4 bases reais. **Quem conduziu aquelas vendas precisa corrigi-lo
> antes do primeiro uso.**
>
> Como usar: `40-implementacao/metodo-onboarding-de-dados.md`, passo 5.

---

## Grão típico

| Tabela | Uma linha é… | Armadilha |
|---|---|---|
| `vendas` | 1 item de pedido (não 1 pedido) | somar `preco_unitario` dá número sem significado |
| `pedidos` | 1 pedido | contar linhas de `vendas` ≠ nº de pedidos |
| `estoque` | 1 SKU × 1 dia (ou snapshot) | ⚠️ confirmar se é snapshot ou movimento — muda tudo |
| `metas` | 1 mês × 1 loja | ⚠️ se for por trimestre, **não cruza** com venda diária sem conversão |
| `produtos` | 1 SKU | — |
| `lojas` | 1 loja | — |

⭐ **Pergunte sempre:** *"se eu somar esta coluna inteira, o número faz sentido ou dá dobrado?"*

## Fórmulas típicas

```
margem_bruta   = receita - custo_produto
margem_liquida = margem_bruta - desconto - devolucao
ticket_medio   = receita / pedidos          (⚠️ pedidos, não itens)
itens_por_venda= itens / pedidos
giro           = unidades_vendidas / estoque_medio
ruptura_%      = sku_sem_estoque / sku_ativo
atingimento_%  = receita / meta
```

## Sinais

| Sobe = bom | Sobe = ruim |
|---|---|
| receita · margem · ticket médio · giro · recompra · atingimento | devolução · ruptura · desconto médio · estoque parado · cancelamento |

⚠️ **Ambíguos, confirmar com o cliente:** `desconto` (pode ser estratégia deliberada) ·
`estoque` (alto é ruim por capital, bom por disponibilidade).

## Proibições típicas

- ⛔ Nunca somar `preco_unitario`, `margem_%`, ou qualquer coluna já em percentual.
- ⛔ Não somar `estoque` ao longo do tempo se for snapshot (soma de fotos não é quantidade).
- ⛔ Não tratar pedido cancelado como venda — confirmar qual `status` conta.
- ⛔ Não comparar período de promoção com período normal sem avisar.

## Calendário

- Fechamento contábil: **confirmar o dia**. O mês corrente é sempre parcial.
- Sazonalidade forte: Black Friday, Natal, Dia das Mães, volta às aulas. Comparação mês a mês sem
  isso engana.
- ⚠️ **Confirmar se houve troca de sistema/ERP** — o histórico antes da troca pode não ser comparável.

## Perguntas típicas do setor

*"vendi mais que mês passado?"* · *"quais lojas bateram a meta?"* · *"qual SKU está encalhado?"* ·
*"onde está concentrado o meu faturamento?"* · *"que dia da semana vende mais?"* ·
*"minha margem caiu — por quê?"* · *"quanto perdi de venda por ruptura?"*

⭐ A última e a penúltima são **decomposição de variação** — o padrão analítico mais valioso do
catálogo, e o que mais parece um analista de verdade.

## Colunas frequentemente sensíveis

`cliente_nome` · `cpf` · `email` · `telefone` · `endereco` · `vendedor_nome` (é pessoa
identificável — pode ser dado de desempenho individual) · ⚠️ **`observacao` / `obs` / campo de texto
livre**, onde CPF e telefone aparecem colados à mão.

Default de `vocabulario_exposto`: `false` para todas as acima.

## ❓ A confirmar com quem conduziu as 4 vendas

1. As 4 eram varejo? Quais fórmulas apareceram de verdade?
2. `estoque` veio como snapshot ou movimento?
3. Qual erro de grão apareceu mais?
4. Alguma proibição que não está na lista acima?
