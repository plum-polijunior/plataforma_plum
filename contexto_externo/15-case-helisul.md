---
status: vigente
camada: negocio
atualizado_em: 2026-09-18
---

# Case Helisul — o que está medido e o que não está

> **O que este arquivo é:** o único caso real da tese externa, com a fronteira entre **fato
> medido** e **estimativa** explícita.
> **Fonte:** `zz_remake_2/prd/PRD_Helisul_v1.md` (v1.0, 19/06/2026, status 🟡 discovery).

---

## O cliente e o problema

Helisul — transporte e operação aérea/rodoviária (helicópteros, aviões, caminhões), **300 a 400
colaboradores** distribuídos em vários estados, frota de dezenas de aeronaves.

A central de atendimento respondia **manualmente**, via WhatsApp, às dúvidas de pilotos,
motoristas e mecânicos: *qual a minha escala, quando são minhas férias, minha passagem foi
emitida, qual o hotel, receberei meu reembolso*.

Quatro agravantes, todos registrados em ata:

1. ⭐ **Fragmentação:** Cavok (escala), Onfly (passagens e hotéis), Paytrack (diárias e
   reembolsos), Proteus (financeiro), Softview (frota) — mais dezenas de planilhas paralelas.
2. **Trabalho manual em dobro:** o atendente classificava a mensagem **e** consultava o sistema
   à mão.
3. **Repetição:** a mesma pergunta, todo dia, de pessoas diferentes.
4. **O bot anterior (Selene) só triava** e enfrentava resistência dos comandantes mais
   experientes.

⭐ **A dor não é "consultar é difícil". É que ninguém tem login.** O dado existia, estava correto
e estava inacessível para quem precisava dele — que é exatamente a tese externa, encontrada num
cliente real antes de ter nome.

---

## O que o Plum faz lá

Fluxo em seis etapas, e as três primeiras acontecem antes de qualquer leitura:

**telefone → identidade → intenção → autorização → API (leitura) → resposta**

Com três fronteiras que viraram invariantes desta tese (`12-visao-tecnologica.md`):

- o telefone vem como **metadado verificado** do canal, nunca do texto (R-E-03);
- **somente leitura** nas APIs de terceiros; solicitação vai para a central (R-E-01);
- **API fora do ar é erro**, nunca resposta parcial ou inventada (R-E-04).

⭐ Além do canal, uma **plataforma web para a central** tratar só o que exige humano — a origem
do "console" no modelo de produto.

---

## ⛔ Os números — leia antes de usar em qualquer material

### O que está medido

| | |
|---|---|
| **542 usuários atendidos** no mês | junho/2026, PRD §1.3 |
| **~10 mensagens por conversa**, em média | ⚠️ o próprio PRD questiona: *"automatizadas ou humanas ou total?"* |
| **300–400 colaboradores** na operação | PRD §1.3 |

### O que **não** está medido

⛔ **Deflexão — quantos atendimentos deixaram de chegar ao humano.** É a métrica-mãe do produto
e ela é **lacuna declarada no PRD (Q-01)**: *"Ainda a quantificar: mensagens/dia, mensagens de
solicitação e mensagens de erro por falta de acesso."*

⚠️ **E a data importa:** naquele documento a Fase 4 (Desenvolvimento) constava como
`⏳ Aguarda Fase 3`, e a Fase 3 dependia de credenciais que a Helisul ainda não tinha liberado.
**Os 542 medem o volume que existia — o tamanho do problema, não o tamanho do resultado.**

### ⛔ A confusão a não cometer

> **"O Plum economizou 540 atendimentos por mês"** não é o que o PRD diz.

`542 usuários ≠ 540 atendimentos desviados`. São métricas diferentes, e a segunda não foi
coletada. Levar esse número para landing page ou deck é a mesma categoria de erro que atribuir a
si o resultado de um projeto de terceiro: o número é real, a afirmação não.

⭐ **O que dizer no lugar, e é mais forte:** *"uma operação de 400 pessoas, 542 atendimentos
manuais em um mês, quase todos a mesma pergunta"*. Isso é **verdade, medido, e descreve a dor** —
que é o que o material de venda precisa. O resultado entra quando for medido.

---

## ⚠️ O que este case NÃO prova

**Ele valida a tese. Não valida este código.**

O sistema descrito no PRD lê **APIs REST de terceiros**, roda **FastAPI** com autenticação
própria, e o `central-platform/` dele **não está neste repositório** (verificado em 2026-09-18).
Este repo lê Google Sheets, roda Supabase e identifica por JWT.

⭐ São dois produtos com o mesmo nome, unidos por doutrina. Tratar a Helisul como prova de que a
plataforma atual já faz isso é o erro que mais custa cronograma — ver `03-erros-comuns.md`.

---

## ⭐ O que aprender antes do próximo cliente

1. **Combine a métrica antes de começar.** Linha de base medida, definição de deflexão acordada,
   e como medir. Sem isso, o resultado do piloto é uma opinião — e este case é a prova disso.
2. **O dado mais valioso da discovery foi o mapa de fragmentação**, não o volume. Saber que são
   cinco sistemas mais dezenas de planilhas é o que dimensiona o trabalho real.
3. **A API sem documentação trava tudo.** O Cavok — a fonte do dado mais pedido, a escala —
   estava inteiro em lacuna (Q-02). ⭐ **Qualificar acesso à fonte deveria ser critério de venda,
   não descoberta de projeto.**
4. **Resistência do usuário é risco de produto.** O bot anterior falhou por adesão, não por
   tecnologia. Áudio e imagem não são conveniência nessa operação — são requisito.
5. **Telefone compartilhado e não cadastrado** apareceram já na discovery (Q-09) e continuam sem
   política. Vão reaparecer em todo cliente.
