---
status: vigente
camada: roteador
atualizado_em: 2026-09-18
---

# Plum Externo — leia isto primeiro

> **O que este arquivo é:** o roteador do `contexto_externo/`, e a fronteira entre as duas teses.
> **O que este arquivo NÃO é:** a arquitetura. Ela mora em `contexto_interno/12-visao-tecnologica.md`
> e nos `CLAUDE.md` de cada pasta de código — e **não é duplicada aqui**.

---

## As duas teses, em seis frases

1. **Tese interna — o Plum é INTEGRADOR.** Quem decide dentro da empresa pergunta sobre os dados
   dela e recebe um número agregado, calculado por motor determinístico. Comprador: diretoria.
2. **Tese externa — o Plum é PORTEIRO.** Quem **não tem login nos sistemas** pergunta, e recebe
   apenas o que aquela pessoa está autorizada a ver. Comprador: operações.
3. A tese interna responde *"como vai o negócio?"*. A externa responde *"e o meu caso?"*.
4. A interna devolve **agregado**; a externa devolve **o registro daquela pessoa**. ⛔ São
   requisitos opostos — ver `12-deltas-tecnicos.md`.
5. As duas compartilham a **doutrina**, não o código: nenhuma decisão de autorização nasce de algo
   que o modelo tocou, e nenhum número sai de texto livre.
6. Material da tese interna → `contexto_interno/`. Não misture.

---

## ⚠️ A correção de vocabulário que evita o erro mais caro

**Os usuários do Plum Externo na Helisul não são pessoas de fora da empresa.** São pilotos,
motoristas e mecânicos — **funcionários**. O que eles não têm é **login no Cavok, no Onfly e no
Paytrack**.

> ⭐ **A fronteira do "externo" não é a empresa. É o sistema.**
> O Plum Externo atende quem está fora dos *sistemas*, não fora da *organização*.

Por que a precisão importa:

- **Comercialmente:** "damos acesso a quem não tem login" é uma promessa mansa e verdadeira.
  "Abrimos seus dados para fora da empresa" acende o alarme do jurídico e do TI na primeira frase.
- **Juridicamente:** funcionário consultando o próprio dado tem base legal simples. Terceiro
  consultando dado da empresa é outro tratamento de LGPD inteiro.
- **Tecnicamente:** funcionário já existe num cadastro interno — é o que torna a resolução de
  identidade possível. Terceiro, não.

❓ **B2B2C (o cliente final da empresa perguntando "o motorista está vindo?") é extensão, não é o
caso implementado.** Vale perseguir, mas exige um modelo de identidade que hoje não existe: não há
cadastro prévio de quem é aquele telefone. Ver `12-deltas-tecnicos.md`.

---

## Os arquivos

| Arquivo | O que traz |
|---|---|
| `00-LEIA-PRIMEIRO.md` | este roteador |
| ⭐ `01-tese-externa.md` | o porteiro, quem compra, por que é um negócio melhor |
| `02-plataforma-vs-implementacao.md` | 🏗️ × 🔧, e o teste que toda proposta passa |
| ⭐ `03-erros-comuns.md` | as crenças falsas desta tese. **Maior retorno por linha — leia inteiro uma vez** |
| `04-glossario.md` | titular · canal · conector · deflexão · fila humana |
| `10-visao-comercial.md` | ICP, ROI, preço, objeções |
| `11-visao-de-produto.md` | o que o produto faz e **o que recusa fazer** |
| ⭐ `12-visao-tecnologica.md` | a arquitetura-alvo (⚠️ proposta, não é o que está no ar) |
| ⭐ `13-contrato-do-conector.md` | o que todo conector entrega — **o artefato central** |
| `15-case-helisul.md` | o case, separando medido de estimado |
| `20-pendencias.md` | trabalho adiado, por dificuldade, com o raciocínio |
| `30-decisoes.md` | `D-E-001` em diante — o porquê de cada escolha |
| `CLAUDE.md` | as regras desta pasta |

### Se você é novo aqui

`00` → `03-erros-comuns` → `01-tese-externa` → o que o seu trabalho pedir. ⭐ O `03` primeiro:
ele economiza as três suposições erradas que todo mundo faz nesta tese.

### Quero fazer X → leia Y

| Quero… | Leia |
|---|---|
| entender por que existe uma tese externa | `01` |
| decidir se uma feature é plataforma ou de um cliente | `02` |
| escrever um conector | `13`, depois `12` §4 |
| mexer em permissão ou identidade | ⛔ `12` §3 e §4 — **antes de qualquer código** |
| preparar uma reunião de venda | `10`, depois `15` |
| usar o número da Helisul em material | ⛔ `15` **primeiro** |
| registrar uma decisão | `30`, prefixo `D-E-` |

## O que **não** ler aqui

| Procura por | Vá para |
|---|---|
| O que está no ar: comandos, schema, deploy, armadilhas | ⭐ `CLAUDE.md` da raiz |
| Executor, Query Plan, RBAC de coluna — o código compartilhado | o `CLAUDE.md` **da pasta** (`query_engine/`, `supabase/functions/`, `src/`) |
| A tese interna (Plum como integrador, dashboards, BI) | `contexto_interno/` — e só se for isso que você procura |

⭐ **Esta pasta é autossuficiente.** Quem trabalha no Plum Externo lê **só aqui** e o `CLAUDE.md`
da raiz. Não precisa abrir `contexto_interno/` em momento nenhum.

⚠️ **Um fato tem um dono, e o dono do código compartilhado nunca foi o `contexto_interno/`** — é o
`CLAUDE.md`. É por isso que independência e não-duplicação não brigam aqui: as duas teses
compartilham *código em produção*, e código em produção tem dono próprio.

A única coisa que aparece nas duas pastas é a **doutrina** (R-01, R-02, R-13, e "nenhuma
autorização nasce de dado que o modelo tocou). Não é cópia — é o mesmo invariante com a
consequência de cada tese. Ver `PLANO-contexto-externo.md`.
