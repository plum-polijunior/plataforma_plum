# contexto/ — regras desta pasta

**Comece por `00-LEIA-PRIMEIRO.md`.** Ele roteia o resto.

## O que entra aqui

Contexto de produto, negócio e arquitetura-alvo. **Nada de código** e nada de passo-a-passo
operacional (isso é o `CLAUDE.md` da raiz e `infra/aws/PASSO-A-PASSO.md`).

## As cinco regras

1. **Um fato, um dono.** Se dois arquivos respondem a mesma pergunta, um vai ficar velho. Não
   repita — **linke**.
2. **Nunca misture "o que é" com "o que queremos".** Foi isso que estragou o PRD antigo. Arquivo de
   realidade não contém roadmap; arquivo de proposta abre avisando `status: proposta`.
3. **Frontmatter obrigatório:** `status` (`vigente`/`superado`/`proposta`), `camada`
   (`plataforma`/`implementacao`/`negocio`/`ambos`), `atualizado_em`.
4. **Teto de ~400 linhas.** Acima disso ninguém lê inteiro e passa a citar pedaço fora de contexto.
   Estourou: divide.
   ⚠️ **Exceção declarada: `30-decisoes.md` e `31-incidentes-e-licoes.md`.** São registros
   *append-only*, lidos por busca (`D-024`, `I-05`) e não de cabo a rabo. Dividi-los por faixa de
   número transformaria "onde está a D-024?" numa consulta a mais. Eles crescem sem teto — o que se
   proíbe é **reescrever** entrada antiga, não acumular entrada nova.
5. **Extraia o porquê antes de apagar.** Quando um fato deixa de valer, a decisão (com o que foi
   rejeitado) vai para `30-decisoes.md` **antes** de o documento antigo sair. Ver D-041.

## Fronteira com o `CLAUDE.md` da raiz

| | Dono |
|---|---|
| o que **está no ar**, comandos, deploy, armadilhas de código | `CLAUDE.md` (raiz) |
| **para onde vamos** e **por quê** | `contexto/` |

⚠️ `12-visao-tecnologica.md` é o arquivo mais tentado a duplicar o `CLAUDE.md`. Se os dois
discordarem, o `CLAUDE.md` está certo sobre o presente.

## ⚠️ Não existe mais pasta de arquivo

`docs/` e `contexto/90-arquivo/` foram apagados em 2026-08-14. Consequência prática: **este conjunto
de arquivos é tudo o que existe.** Não há um segundo lugar para "guardar por segurança" — se um
porquê não estiver em `30-decisoes.md`, ele não está em lugar nenhum.

## Antes de criar um arquivo novo

- Esse fato já tem dono em algum arquivo existente? Então **não** crie — acrescente lá.
- Não crie pasta antes de ter 3 arquivos para ela.
- Ao terminar, use a skill `contexto-plum`.
