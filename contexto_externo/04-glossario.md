---
status: vigente
camada: roteador
atualizado_em: 2026-09-18
---

# Glossário da tese externa

> Só termos que **confundem** ou que têm significado específico aqui. Palavra óbvia não entra.

| Termo | O que é, e por que importa |
|---|---|
| ⭐ **Porteiro** | O papel do Plum nesta tese: decide **se** a pessoa pode ver aquilo, e só então busca. Oposto do integrador da tese interna, que agrega para quem já tem acesso a tudo |
| ⭐ **Titular** | A pessoa a quem o dado pertence. Toda consulta do porteiro é escopada por um titular resolvido pelo canal — nunca pelo texto da mensagem |
| ⭐ **Identidade de canal** | O identificador que vem como **metadado verificado** do transporte (o telefone, no WhatsApp), separado do conteúdo. É a única origem legítima do titular |
| **`registro` / `amostra`** | Os dois tipos de pedido que **já devolvem linha não agregada** no `ad_hoc`. `registro` exige `where`; `amostra` não aceita. Ambos com orçamento em código |
| ⭐ **Linha bruta filtrada** | O modo que falta: `registro` com o **filtro de titular injetado pelo servidor**, não emitido pelo planejador. É a peça que separa o `ad_hoc` atual do porteiro |
| **Orçamento de linhas** | 200 linhas detalhadas por pessoa/base/dia (`_shared/orcamento.ts`). ⚠️ Dimensionado para linha bruta ser exceção — no porteiro ela é o caminho normal |
| ⭐ **Conector** | O código que fala com um sistema de origem do cliente. É 🔧 implementação; o que é 🏗️ é o **contrato** que ele obedece |
| **Contrato do conector** | O que todo conector precisa entregar para o núcleo funcionar. `13-contrato-do-conector.md` |
| ⭐ **Deflexão** | Atendimento que deixou de chegar ao humano porque o Plum resolveu. É a métrica-mãe do produto e a base do ROI |
| **Fila humana** | O que o Plum **não** resolve e encaminha à central — por ser solicitação, por falta de permissão ou por indisponibilidade. Não é falha: é o produto sabendo o próprio limite |
| **Console da central** | A superfície web da equipe de atendimento. Trata só o que caiu na fila humana |
| **Solicitação × consulta** | Consulta o Plum responde; solicitação (quero passagem, quero reembolso) ele **encaminha**. A fronteira existe porque escrever em sistema de terceiro é outro risco |
| **Espelho de dados** | Exportação programada da fonte para uma planilha, quando não há conector nativo. Porta de entrada universal — com atraso, e o atraso precisa ser dito |
| ⚠️ **"Externo"** | Fora dos **sistemas**, não fora da **empresa**. Na Helisul são funcionários sem login. Ver `03-erros-comuns.md` |
| **Doutrina** | Os invariantes herdados da tese interna e reafirmados aqui: read-only, a IA não calcula, autorização nunca nasce de dado que o modelo tocou. Ver `12-visao-tecnologica.md` |
| **D-E-xxx** | Prefixo de decisão desta tese. O `D-xxx` sem `E` é da tese interna e **não vale aqui** |

## Termos de cliente que não são do produto

⚠️ Aparecem no material da Helisul e **não devem virar conceito da plataforma** — são vocabulário
🔧 daquela operação:

`missão` · `escala` · `translado` · `diária` · `FER/FR/FS/SA` · `Cavok` · `Onfly` · `Paytrack` ·
`CCQ` · `CCO` · `AOG`

⭐ Se um desses aparecer num arquivo 🏗️ da plataforma, é sinal de vazamento de implementação para
dentro do produto — e vale parar e generalizar.
