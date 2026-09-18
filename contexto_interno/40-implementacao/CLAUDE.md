# 40-implementacao/ — conhecimento de cliente

Aqui vive o que é **🔧 da implementação**: o método do onboarding, os templates por vertical e o
conhecimento das bases de clientes específicos.

## ⚠️ A regra de dependência, e ela é a razão desta pasta existir

**Código da plataforma nunca importa nada daqui.** O conhecimento de cliente é carregado como
**dado** — via `schema_metadata`, regras no banco, configuração — nunca como código.

No dia em que uma condicional na plataforma disser `if (cliente === 'x')`, a separação
plataforma × implementação morreu, e o Plum volta a ser o legado single-tenant hardcodeado.

## ⚠️ Não generalize daqui para a plataforma

Uma fórmula, um grão ou uma proibição que você aprendeu numa base **não** é regra da plataforma. Se
parecer que é, o caminho é: (1) confirmar em 3 clientes do mesmo setor, (2) subir para
`templates/`, e só então (3) discutir se algum **mecanismo** genérico da plataforma facilita aquilo.

O teste está em `../02-plataforma-vs-implementacao.md`: *se depende de saber o que a coluna
significa, não é plataforma.*

## Estrutura

```
metodo-onboarding-de-dados.md   ← o playbook do produto pago
templates/                      ← o que é típico de um setor
clientes/<cliente>/             ← dicionario · regras · relacoes · historico
```

## ⚠️ `clientes/` tem dado de cliente

Decisão pendente antes de a pasta ter conteúdo real: entra no `.gitignore` (com um
`exemplo-cliente/` versionado como molde) ou é versionada assumindo repo privado para sempre?
Ver `../20-pendencias.md` D8. **Não coloque dado real aqui antes disso ser decidido.**
