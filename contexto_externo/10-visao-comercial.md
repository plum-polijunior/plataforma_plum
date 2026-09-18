---
status: vigente
camada: negocio
atualizado_em: 2026-09-18
---

# Visão comercial — o porteiro

> **O que este arquivo é:** quem compra, por que, quanto, quais objeções.
> **O que este arquivo NÃO é:** arquitetura nem roadmap.

---

## O ICP

**Operação distribuída, com muita gente em campo e poucos logins nos sistemas centrais.**
Transporte, logística, frota, manutenção, obras, serviços com equipe externa, franquias.

⭐ **O sinal de qualificação é direto e verificável:** *existe uma central — ou um grupo de
WhatsApp — respondendo a mesma pergunta todo dia?* Se existe, o custo **já está sendo pago**, e
alguém dentro da empresa já o conhece pelo nome.

### Três perguntas que qualificam em dois minutos

1. Quantas pessoas da sua operação **não têm login** nos sistemas que guardam o dado delas?
2. Quantas mensagens a central recebe por dia, e que fração é **a mesma pergunta**?
3. Quando alguém pergunta algo que não pode ver, **o que impede hoje** que a resposta saia?

⭐ A terceira é a mais reveladora. Na maioria das operações a resposta honesta é *"o bom senso do
atendente"* — e é essa a brecha que o porteiro fecha com uma regra em vez de uma pessoa cansada
no fim do turno.

---

## ⭐ Por que este negócio é melhor que o da tese interna

Cada linha responde a um problema que a outra tese diagnosticou e não resolveu.

| Problema lá | Como se resolve aqui |
|---|---|
| **O beneficiário não é o comprador** | A central **é** centro de custo, com headcount e dono de orçamento. Quem sofre é quem paga |
| ⭐ **"O que o cliente paga no mês 13?"** | **Desligue o Plum e o telefone toca amanhã de manhã.** A recorrência é estrutural: o valor não é um artefato que fica com o cliente, é um serviço que deixa de acontecer |
| **Não existe evento de sucesso observável** | Cada deflexão **é** o evento. Contável, no sistema da central, todo dia |
| **ROI intangível** | `deflexões × custo por atendimento`. Uma multiplicação |
| **A dor é intermitente e barata** | Central é dor **diária e contínua**, com escala e turno |

⭐ **E o RBAC muda de papel.** Na tese interna é um selo no slide de segurança. Aqui é **o que
torna o produto possível** — ninguém abre dado para 400 pessoas sem controle de acesso confiável.
A mesma engenharia, de guarda-corpo a razão de ser.

---

## O ROI, e o que falta para poder dizê-lo

```
economia mensal = deflexões/mês × custo médio por atendimento
```

⛔ **Hoje não temos a primeira variável medida.** O `PRD_Helisul_v1.md` §1.3 registra **542
usuários atendidos** em junho/2026 — usuários, não deflexões — e marca a métrica de deflexão como
lacuna aberta (Q-01). Ver `15-case-helisul.md`.

⚠️ **Enquanto não houver medição de produção, 542 é o tamanho do problema, não o do resultado.**
Usar como resultado em material de venda é a mesma categoria de erro que atribuir a si o case de
um terceiro — e é o tipo de coisa que desmonta na primeira pergunta de follow-up.

⭐ **O que fazer no lugar, e é melhor:** peça ao prospect os números **dele** na reunião.
"Quantas mensagens por dia? Que fração é repetida?" O número que o cliente diz em voz alta é o
que ele defende internamente depois — e você não depende de um case para justificar o preço.

---

## Estrutura de preço — as opções, e o que cada uma provoca

| Modelo | A favor | ⚠️ Contra |
|---|---|---|
| **Por assento** (colaborador ativo) | previsível; escala com o cliente | cobra por quem não usa; e o porteiro tem cauda longa de usuário esporádico |
| **Por deflexão** | ⭐ alinha incentivo e conta a própria história | **pune o sucesso**: a demanda cai porque o Plum educou a operação, e a receita cai junto |
| **Assinatura + faixa de volume** | previsibilidade com upside | mais difícil de explicar em uma reunião |
| **Implantação + recorrente** | cobre o custo do conector 🔧 | é o modelo da tese interna, com o risco de repetir o 23k + 2k |

❓ **Decisão em aberto.** Inclinação: **implantação (cobre o conector) + assinatura por faixa de
volume**. A implantação paga o trabalho vertical; a faixa dá previsibilidade sem punir o cliente
por usar bem.

⭐ **E o conector universal de planilha é a alavanca comercial mais importante do modelo** — ele
permite vender sem implantação pesada e deixa o conector nativo como upsell. Ver
`13-contrato-do-conector.md`.

---

## Objeções conhecidas

| Objeção | Resposta |
|---|---|
| **"Já temos um chatbot"** | O chatbot tria e responde FAQ. ⭐ Ele não consulta o dado **daquela pessoa**, porque não sabe quem ela é nem o que ela pode ver. É essa a diferença, e é a única que importa |
| **"E se ele mostrar o dado errado para a pessoa errada?"** | A pergunta certa, e a resposta é arquitetural: o titular vem do canal, nunca do texto; a autorização roda **antes** de qualquer leitura; a fonte é consultada já escopada. Ver `12-visao-tecnologica.md` |
| **"E se a IA inventar?"** | Ela não calcula e não completa lacuna. Ausência de dado é dita, nunca preenchida |
| **"Meu sistema é X, vocês integram?"** | Não temos conector nativo para tudo — e é proposital. Começamos por espelho de dados e a operação roda em uma semana; conector nativo entra depois se valer a pena |
| **"Meu TI não vai liberar API"** | Somente leitura, e o espelho de planilha dispensa API. A governança continua do cliente |
| **"Isso substitui minha central?"** | Não. **Esvazia a fila dela.** A central passa a tratar o que é difícil — e é ela quem opera o console |
| **"LGPD"** | Funcionário consultando o próprio dado. Trilha de acesso, PII minimizada em log, retenção definida. ⚠️ Ver a ressalva abaixo |

### ⚠️ Sobre LGPD, a honestidade que protege

Funcionário consultando o **próprio** dado é a situação mais simples possível — e é o caso
implementado. ⛔ **B2B2C não é isso.** Cliente final da empresa consultando dado da empresa muda
a base legal, o titular dos dados e o dever de informação. **Não prometa B2B2C no mesmo fôlego
que o caso de colaborador** — são dois produtos para o jurídico.

---

## ❓ Perguntas comerciais abertas

- **Quem é o comprador econômico:** o gestor da central, o diretor de operações ou o RH? Muda o
  discurso inteiro, e nas duas primeiras conversas isso deve ser descoberto, não presumido.
- **A central é aliada ou ameaçada?** Ela opera o console e pode sabotar a adoção. ⭐ Tratar o
  gestor da central como **campeão interno**, não como custo a cortar.
- **Qual o piloto mínimo vendável?** Um conjunto de perguntas, uma fonte, um grupo de usuários —
  e uma métrica combinada **antes** de começar. Sem métrica combinada antes, não há como provar
  resultado depois: é o erro que já custou o número da Helisul.
