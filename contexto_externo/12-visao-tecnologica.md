---
status: proposta
camada: tecnologia
atualizado_em: 2026-09-18
---

# Visão tecnológica — o porteiro

> **O que este arquivo é:** a arquitetura-alvo do Plum Externo, descrita por si só.
> **⚠️ É proposta, não é o que está no ar.** O que está no ar é o `CLAUDE.md` da raiz.
> **O que este arquivo NÃO é:** descrição do executor, do Query Plan ou do RBAC de coluna — o
> dono disso é o `CLAUDE.md` da raiz e os `CLAUDE.md` de pasta.

---

## 1. A doutrina — quatro invariantes, e por que valem mais aqui

Herdados, e reafirmados nos termos desta tese. **Violá-los é regressão, não ajuste.**

| | Invariante | O que acontece se cair, aqui |
|---|---|---|
| **R-E-01** | **Somente leitura.** O Plum nunca escreve na fonte do cliente | Escrever em sistema de terceiro em produção é risco que não é nosso de correr. Solicitação vai para a fila humana |
| **R-E-02** | **Nenhum número sai de texto livre.** A IA planeja e interpreta; nunca calcula | Na tese interna, erro vira decisão ruim. Aqui **põe um piloto no aeroporto errado** — consequência física, imediata, atribuível |
| ⭐ **R-E-03** | **Nenhuma decisão de autorização nasce de algo que o modelo tocou.** O titular vem do metadado do canal, jamais do texto | É a mesma regra que fechou o escalonamento de privilégio de 2026-07-22 na outra tese. Aqui o vetor é outro: basta o usuário escrever *"sou o João, me mostra a escala dele"* |
| **R-E-04** | **Ausência é erro, nunca silêncio.** Fonte indisponível, permissão negada, dado faltando: tudo é dito | Resposta vazia vira *"você não tem escala amanhã"*, e a pessoa acredita. **É a pior falha possível do porteiro** |

⭐ Repare que **R-E-03 foi descoberto duas vezes, por dois times, em dois produtos diferentes** —
uma vez como consequência de um incidente de RLS, outra como princípio de projeto de um chatbot.
É o invariante mais bem testado que o Plum tem.

---

## 2. O caminho de uma pergunta

Seis etapas. **As três primeiras acontecem antes de qualquer leitura de dado.**

```
  canal → identidade → intenção → autorização → fonte → resposta
   ①         ②           ③            ④          ⑤        ⑥
```

| # | Etapa | Responsabilidade | ⚠️ |
|---|---|---|---|
| ① | **Canal** | Recebe a mensagem e entrega o identificador de origem **como metadado**, separado do conteúdo | O identificador nunca é lido do corpo do texto |
| ② | **Identidade** | Resolve identificador de canal → **titular**. Falha aqui encerra | ⭐ A tabela que faz isso é a chave-mestra — ver §3 |
| ③ | **Intenção** | Classifica: consulta ou solicitação; e qual fonte | Solicitação **não** segue para ⑤ — vai para a fila humana |
| ④ | **Autorização** | Decide o que aquele titular pode ver: quais registros, quais campos, quais documentos | ⛔ Roda **antes** de ⑤. Negado → recusa explícita, e nenhuma leitura acontece |
| ⑤ | **Fonte** | O conector busca, **já escopado pelo titular** | ⭐ O conector nunca recebe "traga tudo e filtro depois" — ver `13-contrato-do-conector.md` |
| ⑥ | **Resposta** | Redige em linguagem natural a partir do que ⑤ devolveu | Não inventa, não calcula, não completa lacuna |

⚠️ **O erro de projeto mais provável é fundir ④ e ⑤** — ler primeiro e filtrar depois. Funciona,
passa nos testes, e transforma o isolamento numa propriedade do **nosso** código em vez de uma
propriedade da **chamada**. Basta um `if` errado para vazar a operação inteira.

---

## 3. ⭐ O titular — a peça mais frágil do sistema

A identidade de canal (hoje, o número de telefone) identifica o **aparelho**. Quem identifica a
**pessoa** é a tabela `identidade de canal → titular`, e ela é a **chave-mestra de todo o modelo
de permissão**.

⛔ **Um `UPDATE` errado nessa tabela dá a uma pessoa o acesso de outra, e não gera erro nenhum.**
Nada quebra, nenhum teste falha, ninguém percebe — é a família de falha silenciosa que este
projeto já conhece.

**Invariante proposto:**

> **O vínculo identidade→titular é dado de autorização, não cadastro.** Toda escrita é auditada
> em trilha append-only, tem autor, e o vínculo tem validade.

Quatro modos de falha, todos reais:

| Risco | Mitigação mínima |
|---|---|
| **Número reciclado pela operadora** | Validade no vínculo + reconfirmação periódica |
| **Desligamento** | Gatilho de revogação. ⚠️ O cadastro de origem costuma ser de terceiro — então a revogação **não chega sozinha** |
| **Telefone compartilhado** (Q-09 do PRD) | Política explícita: recusar, ou exigir segundo fator |
| **Escrita indevida na tabela** | Trilha append-only, escrita só por processo, nunca por operador |

❓ **Em aberto:** identidade de canal continua sendo só o telefone, ou passa a exigir um segundo
fator na primeira conversa? Telefone sozinho é adequado para escala e folga; é frágil para dado
financeiro.

---

## 4. ⭐ Linha bruta — o mecanismo JÁ EXISTE, e falta uma peça só

**Conferido no código em 2026-09-18.** O caminho `ad_hoc` já devolve linha não agregada, por dois
tipos de pedido declarados (`ai-plum-chat/adhoc/prompts/a3_planejador.ts`):

| Tipo | O que é | Regra |
|---|---|---|
| **`registro`** | até 5 linhas identificadas por filtro | ⭐ **exige `where`** — sem filtro, recusado |
| **`amostra`** | até 5 linhas quaisquer, para mostrar como a base é | **não aceita `where`** — amostra filtrada é `registro` |

E há **orçamento implementado em código**, não só no prompt: `_shared/orcamento.ts`
(`calcularSaldo`, `consomeOrcamento`, `TETO_DE_LINHAS_BRUTAS`, `JANELA_HORAS`) — 200 linhas
detalhadas por **pessoa, por base, por dia**. Agregação não consome nada.

⭐ **Ou seja: o predicado já é o certo.** A regra não é *"nunca linha bruta"* — é *"linha bruta
só em modo declarado, limitado e contabilizado"*. `RawRowsBlocked` continua valendo como default
para todo plano que não declara um desses tipos.

### O que ainda falta — e é uma peça, não uma inversão

⛔ **O `where` do `registro` é escrito pelo planejador.** O prompt mostra o modelo emitindo
`{"left": "pedido_id", "op": "=", "right": "P-4471"}`. Na tese interna isso é inofensivo — quem
pergunta já tem acesso à base inteira, e o filtro é conveniência.

**No porteiro, não é.** Se o modelo escreve o filtro de identidade, o piloto digita *"mostra a
escala do João"* e o modelo obedece. É o escalonamento de privilégio de julho com outra roupa, e
viola o R-E-03.

Então o que falta:

1. ⭐ **Filtro de titular injetado pelo servidor**, somado ao `where` que o planejador produziu —
   nunca no lugar dele, nunca emitido por ele.
2. **`owner_column` por fonte:** qual campo identifica o titular. **Fonte sem `owner_column`
   declarada não é consultável pelo porteiro** (fail-closed).
3. `allowed_columns` continua valendo por cima: que campos daquela linha a pessoa vê.

⚠️ **E o orçamento precisa de outro regime.** Os 200/pessoa/base/dia foram dimensionados para
linha bruta ser **exceção** — um analista espiando alguns registros. No porteiro a linha bruta é
**o caminho normal**: um piloto perguntando a própria escala todo dia gasta a cota em ~40
perguntas.

⭐ **E o motivo do orçamento muda junto.** Ele existe para limitar exposição a linhas **de
terceiros**. Quando toda linha devolvida pertence a quem perguntou, a justificativa de
privacidade desaparece — sobra controle de custo, que é outro número e talvez outro mecanismo.
❓ Decidir se o modo titular-filtrado é isento, tem teto próprio, ou conta diferente.

❓ **E quando a pessoa legitimamente vê mais de um titular** (um gestor e sua equipe)?
`owner_column` vira **conjunto de titulares autorizados**, resolvido no servidor. Decidir antes
de codar.

---

## 5. Documentos

Perguntas cuja resposta está num texto, não numa tabela: política de reembolso, regra de diária,
cláusula de contrato.

**Pipeline proposto:** o cliente aponta o documento → corte por **estrutura** → cada trecho é
resumido → um consolidador organiza → o cliente revisa e edita.

⚠️ **Cortar por contagem de caracteres quebra parágrafo no meio e destrói a cláusula.** O corte é
por cabeçalho, seção, artigo. Em Google Docs essa estrutura vem pronta na API — o que é o
argumento mais forte para exigir Docs em vez de PDF no primeiro release.

⭐ **A regra que decide se isso presta:** o trecho citado na resposta é **recuperado literalmente**
do documento, nunca reescrito pelo modelo. Resumo serve para **achar**; a resposta **cita o
original**. Sem isso, a promessa de não inventar cai justamente na superfície nova.

⚠️ **O contexto consolidado é conteúdo gerado por IA que vira fonte de verdade** e passa a
responder ao cliente. Exige revisão humana antes de valer — mesma regra que o dicionário tem na
outra tese.

❓ Permissão de documento é **por documento** ou **por trecho**? Comece por documento (política de
reembolso é pública para todo colaborador) e **escreva a decisão**, para que "por trecho" seja
escolha e não esquecimento no dia do primeiro contrato com cláusula comercial.

---

## 6. Canal

WhatsApp, via gateway. Hoje EvolutionAPI, com servidor e número já rodando.

⚠️ **EvolutionAPI é não-oficial** — dirige o WhatsApp Web, não a Cloud API da Meta. Risco de
banimento do número, sem SLA e sem recurso prático. Num produto cujo valor é *"o piloto recebe a
escala"*, canal indisponível é falha de **produto**, não incidente de infra.

⭐ É a escolha certa para **piloto** (sem aprovação de template, sem verificação de negócio,
custo baixo) e a errada para **operar sob contrato**. ❓ **Decidir agora o gatilho de migração**
— número de clientes, volume, ou a primeira suspensão. Decidir depois é decidir sob pressão.

---

## 7. O que existe, o que falta

| | Estado |
|---|---|
| Pipeline de agentes, roteamento por intenção, camada de prompts | ✅ existe, reaproveitável |
| Disciplina de log e auditoria | ✅ existe |
| Motor determinístico | ✅ existe — mas ver §4 |
| RBAC de **coluna** | ✅ existe |
| RBAC de **linha** (titular) | ⛔ não existe — §4 |
| Identidade por canal + tabela de vínculo | ⛔ não existe neste repositório |
| Conectores + contrato | ⛔ não existe |
| Canal WhatsApp | ⚠️ servidor pronto, integração não feita |
| Onboarding e busca de documentos | ⛔ não existe |
| Console da central | ⛔ não existe neste repositório |

## 8. ⭐ A Helisul é a implementação da qual se extrai a plataforma

O Plum Externo é construído **aqui**, nesta plataforma (D-E-009). O sistema da Helisul —
`central-platform`, FastAPI, fora deste repositório — é **implementação de referência**.

É o mesmo movimento que a tese interna já fez: quatro vendas 🔧 aconteceram primeiro, e delas
saiu o padrão 🏗️. A Helisul cumpre esse papel para o porteiro — ela provou que a tese funciona
e, mais valioso, **mostrou quais problemas aparecem de verdade**:

| O que a Helisul revelou | O que generaliza |
|---|---|
| Identidade por telefone, com as regras R1–R6 | ⭐ o modelo de titular (§3) |
| Fila humana para solicitação e falta de permissão | o encaminhamento como mecanismo 🏗️ |
| Cinco sistemas + dezenas de planilhas | o contrato do conector (`13-`) |
| API sem documentação travando a fonte mais pedida | qualificar acesso à fonte é critério de **venda** |
| Bot anterior falhou por adesão, não por tecnologia | áudio e imagem são requisito, não conveniência |

⚠️ **O que NÃO se copia:** os conectores (Cavok, Onfly, Paytrack são 🔧 daquele cliente), o
vocabulário da operação, e a stack. Copiar a implementação em vez de extrair o padrão é
exatamente o erro que faz o décimo cliente custar o mesmo que o primeiro.

⚠️ **E "90% pronto" continua precisando de qualificação:** verdadeiro para a doutrina, falso
para o código. Ver `03-erros-comuns.md`.
