# contexto_externo/ — as regras desta pasta

Documentação da **tese externa** (Plum como porteiro). Leia o `00-LEIA-PRIMEIRO.md` antes de
qualquer coisa.

⛔ **Só escreva aqui se o `MODO ATIVO` do `CLAUDE.md` da raiz for `externo`.** Em `interno`, esta
pasta é leitura proibida. Em `ambos`, pergunte antes de gravar.

---

## As cinco regras

1. ⭐ **Um fato, um dono.** Antes de escrever, procure onde aquele fato já mora. Se já existe em
   outro arquivo, **aponte** — nunca reescreva. Dois donos garantem que um vai apodrecer.
2. ⭐ **Esta pasta é autossuficiente.** Quem trabalha na tese externa lê só ela e o `CLAUDE.md` da
   raiz. **Nunca referencie `contexto_interno/`** a não ser para dizer "a outra tese está lá".
3. **Fato sobre código em produção não mora aqui.** O dono é o `CLAUDE.md` da raiz e os
   `CLAUDE.md` de pasta. Aqui mora o **produto**: tese, cliente, decisão, pendência.
4. **Teto de 400 linhas por arquivo.** Exceções declaradas: `30-decisoes.md` e
   `31-incidentes-e-licoes.md`, que acumulam por natureza.
5. **Decisão desta tese usa prefixo `D-E-`.** Numeração nunca muda, nunca é reaproveitada.
   Decisão revogada vira `status: revogada` com o porquê — não se apaga.

## Ao acrescentar um fato

| O fato é… | Vai para |
|---|---|
| uma escolha, com alternativa rejeitada | `30-decisoes.md` |
| algo que deu errado e virou regra | `31-incidentes-e-licoes.md` |
| trabalho adiado, com o raciocínio | `20-pendencias.md` |
| uma crença falsa que este projeto produz | `03-erros-comuns.md` |
| um termo que confunde | `04-glossario.md` |
| o que o conector precisa entregar | `13-contrato-do-conector.md` |

⚠️ **Se não couber em nenhum, o arquivo certo provavelmente não existe ainda.** Crie, e registre
no `00-LEIA-PRIMEIRO.md`. Não enfie em `20-pendencias.md` por falta de lugar.
