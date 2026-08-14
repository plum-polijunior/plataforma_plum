---
status: proposta
camada: implementacao
atualizado_em: 2026-08-14
---

# O que somar ao Plum já vendido

> **O que este arquivo é:** o cliente já pagou o onboarding e tem a base organizada. O que se
> oferece a ele agora? É a lista de upsell — e a resposta para *"o que ele paga no mês 13"*.
> **O que este arquivo NÃO é:** o roadmap da plataforma (é `20-pendencias.md`), nem plano futuro
> distante (é `22-planos-futuros.md`).

---

## Por que este arquivo existe

Hoje, quando a base do cliente fica limpa, **o trabalho acaba e não há próximo passo**. O que ele
perderia ao cancelar é pouco: a base organizada já é dele. Ticket de R$ 23k que não deixa
recorrência atrás. → `10-visao-comercial.md`

⭐ **A regra que ordena esta lista:** oferecer só o que **cresce** depois de entregue. Uma melhoria
que se completa e para não resolve o problema.

---

## 1. ⭐ Completar o dicionário — camadas 3 e 4

O onboarding entrega a camada 1 (colunas). As outras três são o que transforma o Plum de consulta em
interpretação.

| Camada | Conteúdo | O que passa a ser possível |
|---|---|---|
| **2. Valores** | vocabulário das dimensões: quais lojas, status, vendedores | "quanto o vendedor Fulano vendeu" funcionar sem adivinhação |
| **3. Relações** | chaves entre planilhas + **grão** de cada tabela | cruzar planilhas: meta vs realizado, estoque vs venda |
| **4. Regras** | fórmulas, sinais, proibições, calendário | ⭐ **cenários** e "se A muda, como fica B" |

```
formulas:   margem = receita - custo - glosa · ticket = receita / pedidos
sinais:     glosa: perda (subir é ruim) · nps: bem (subir é bom)
grao:       vendas = 1 linha por item de pedido · metas = 1 linha por mês por loja
temporal:   fechamento no dia 5 · o mês corrente é parcial
proibicoes: nunca somar 'preco_unitario'
```

**Como se apresenta ao cliente:** como as "skills" do agente daquela base, editáveis em **"minha
base de dados"**. Não é configuração técnica — é ensinar o assistente a trabalhar como o time dele
trabalha.

⚠️ **`sinais` parece detalhe e não é.** Sem ele, a IA chuta se "a glosa caiu" é boa ou má notícia —
e acerta metade das vezes.

## 2. ⭐ Cenários

Com as fórmulas da camada 4 preenchidas, "e se a glosa subir 20k?" passa a ter resposta exata. Não
escreve nada em lugar nenhum — altera valores em memória antes de agregar.

**Por que é o melhor primeiro upsell:** é a capacidade que o cliente hoje **não consegue de jeito
nenhum** sem montar planilha paralela (trabalho que ninguém faz por preguiça), e produz um artefato
atribuível ao Plum — um cenário salvo, com data, premissa e resultado. Vira histórico, vira reunião.

**Sugestões:** cenário composto ("glosa +20k **e** volume −5%"), comparação com o real depois do
fato, e o cenário como objeto de primeira classe (guarda-se **o plano**, nunca o resultado — o RBAC
de quem abre tem de ser reavaliado).

## 3. Padrões analíticos novos entrando sem projeto

⭐ **É o item que mais justifica recorrência**, porque o valor cresce sem consumir a equipe. Cada
padrão novo da plataforma (`11-visao-de-produto.md`) chega automaticamente para todos os clientes
cujo dicionário atenda aos `requisitos` dele.

E o mecanismo dá um argumento comercial mensurável: *"sua base habilita 12 das 20 análises; com uma
coluna de custo unitário, habilita 17."*

## 4. Insight proativo

Padrão executável em `cron` = análise que chega sem ser pedida. O canal pode ser e-mail, in-app ou
WhatsApp.

⚠️ **Duas regras desde o dia zero:** no máximo **um** por semana por pessoa, e **sempre com número
em R$**. Alerta sem valor monetário é notificação; notificação sem consequência é ignorada em duas
semanas; e canal ignorado não volta.

## 5. Novas planilhas conectadas

Conforme o cliente conecta mais bases ao mesmo "banco de dados", o cruzamento entre elas passa a
valer. É crescimento natural de valor — e depende do grão da camada 3 estar declarado.

## 6. Trava dura de inferência (opcional, por cliente)

A plataforma **mostra o raciocínio** em vez de recusar (`30-decisoes.md` D-037). Mas há cliente para
quem uma resposta especulativa em reunião de diretoria é inaceitável.

Para esses, uma regra de negócio: *nenhuma afirmação causal ou contrafactual sem fórmula declarada no
dicionário.* Fica **opcional e por cliente** — como padrão da plataforma produziria "desculpa, não
posso responder isso" a cada prompt.

## 7. Política de sensibilidade revisada

Quais colunas são sensíveis, quais vocabulários podem ser expostos ao modelo, se `amostra` é
permitida nesta base. É 🔧 porque nenhuma heurística adivinha que `obs_cliente` tem CPF colado à mão
(D-039).

**Vira entregável:** um documento de uma página sobre o que sai da base do cliente e para onde —
material de comitê de segurança, e diferencial em venda para empresa maior.

---

## O que **não** oferecer

| Não | Por quê |
|---|---|
| **Escrita na base / no ERP** | Muda a categoria da falha: resposta errada se questiona, dado corrompido não. E queima o argumento que faz o TI aprovar (D-018) |
| 20 insights sob medida | É o caminho de volta para consultoria não escalável. O que se entrega é o **dicionário**; as análises vêm da plataforma |
| Integração nativa com SAP/Totvs | Espelho de dados resolve. Integração é projeto de meses com risco de conector |
| Dashboard de BI complexo | Não se compete com Power BI |

---

## Ordem sugerida de oferta

| # | Item | Quando |
|---|---|---|
| 1 | Camadas 3 e 4 do dicionário | logo após o onboarding — é a continuação natural |
| 2 | Cenários | assim que as fórmulas existirem. **É o momento "ah, agora entendi"** |
| 3 | Padrões novos + relatório de análises habilitadas | contínuo, é a recorrência |
| 4 | Insight proativo | depois de 1–2 meses de uso, quando já se sabe o que importa para ele |
| 5 | Política de sensibilidade documentada | quando entrar comitê de segurança ou cliente maior |

---

## ❓ Abertas

1. **O contrato do onboarding já embute 12 meses de plataforma?** Se não, o mês 13 continua sendo
   uma conversa difícil (`10-visao-comercial.md`).
2. **Quem preenche as camadas 3 e 4 — a equipe técnica ou o cliente na interface?** Muda o custo e
   muda o preço.
3. **Insight proativo é canal próprio ou vai pela Maisa?** (`22-planos-futuros.md`)
