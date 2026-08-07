# infra/aws

Como subir e conferir o serviço executor do PLUM.

## Comece pelo arquivo certo

| Você é… | Abra |
|---|---|
| **Ricardo** (ou quem toca o produto no dia a dia) | [`PASSO-A-PASSO-RICARDO.md`](PASSO-A-PASSO-RICARDO.md) |
| **Quem tem admin na conta AWS** | [`LEIA-ME-PRIMEIRO.md`](LEIA-ME-PRIMEIRO.md) |

São duas pessoas, em duas máquinas, com ferramentas diferentes. Seguir o
arquivo do outro só gera confusão.

## Os arquivos

| Arquivo | O que é | Quem roda |
|---|---|---|
| `PASSO-A-PASSO-RICARDO.md` | Comandos `npx` no terminal do VS Code | Ricardo |
| `LEIA-ME-PRIMEIRO.md` | Roteiro de provisionamento, passos 1 a 8 | quem tem AWS |
| `provision.sh` | Cria os 7 recursos na AWS. Idempotente. | quem tem AWS |
| `smoke-test.sh` | Confere que o endpoint não é público e que responde | quem tem AWS |

## Em uma frase

O `provision.sh` cria uma função Lambda que roda o executor em Python, com a
chave do Google guardada no Parameter Store e o endpoint fechado por IAM. Ele
produz 5 valores; 3 viram segredos do Supabase e 2 são públicos.
