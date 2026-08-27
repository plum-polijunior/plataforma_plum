# B20 · O `a2_encaminhador` — manual do 👤

⭐ O slot 2 da cadeia do chat volta a existir, com **duas** escolhas: quais bases o A3 recebe, e
**qual A3** planeja.

⚠️⚠️ **ESTE BLOCO ESTÁ NOS COMPONENTES, SEM FIAÇÃO — e isso é a coisa mais importante deste arquivo.**

| peça | estado |
|---|---|
| `_shared/agentes.ts` — o registro | ✅ pronto, testado |
| `paraIndice()` em `_shared/dicionario.ts` | ✅ pronto, testado |
| `adhoc/prompts/a2_encaminhador.ts` | ✅ pronto |
| `adhoc/encaminhador_core.ts` + `encaminhador.ts` | ✅ pronto, testado |
| papel `encaminhador` no `MODELO_POR_PAPEL` | ✅ pronto |
| migration do CHECK de `plum_logs.etapa` | ✅ escrita, **não aplicada** |
| **o A2 chamado dentro do turno** | ⛔ **não feito** |

⇒ **Nada muda no chat com este bloco.** `encaminhar()` não é chamado por ninguém: o turno continua
`a1_porteiro → a3_planejador → executor → a4_interprete`, com o slot 2 vazio. O código está no
repositório, desligado — e desta vez isso está escrito no lugar certo, que é aqui.

## Antes

**B18 e B19 no ar** — o A2 escolher base não tem efeito enquanto o executor não aceitar N bases.

⚠️ **Aplique a migration.** É par indivisível com o dia em que a fiação subir, e aplicá-la agora é
inofensivo (acrescenta um valor a um enum que ninguém escreve ainda).

## Migration — `20260827130000_plum_logs_encaminhador.sql`

SQL Editor do painel, colada inteira, e **leia o bloco de verificação no fim**.

⭐⭐ **Ela ACRESCENTA, não renomeia.** `'reconhecedor'` fica no enum: o A2 antigo rodou de 2026-08-20
(B06) a 2026-08-25 (B15) e existem linhas com aquele valor. Tirá-lo do CHECK as coloca em violação, e
um `ADD CONSTRAINT` sobre dado que não passa **falha na hora**.

⚠️ A segunda linha da verificação é a que importa: *"etapa AINDA aceita 'reconhecedor'"*. Um
`FALTANDO` ali significa que as linhas de agosto viraram dado em violação.

Depois: atualize `src/integrations/supabase/types.ts` (§4 do `CLAUDE.md` de `migrations/`).

## Publicar

⛔ **Não publique nada de Edge Function por causa deste bloco.** `encaminhar()` não tem chamador; o
que subiria é código morto, e `_shared/` é empacotado por função — publicar um consumidor deixa
cópias divergentes do RBAC (D-028).

⚠️ O `_shared/llm_core.ts` mudou (papel novo, e `reconhecedor` saiu). Quando alguma função for
publicada por outro motivo, ela leva essa mudança. É inofensivo: nada chama `papel: "reconhecedor"`.

## ⭐ Como conferir sem fiação

Os três critérios de pronto do bloco, e o terceiro é o que costuma faltar:

```sh
npx vitest run supabase/functions/_shared/agentes.test.ts
npx vitest run supabase/functions/ai-plum-chat/adhoc/encaminhador_core.test.ts
```

1. **O registro é dono único.** `test_acrescentar_um_agente_muda_o_PROMPT` e o do despacho provam que
   acrescentar um A3 ao `REGISTRO` muda os dois **sem editar mais nenhum arquivo**. Se um dia exigir
   uma segunda edição, o acoplamento voltou — conserte o acoplamento, não o teste.
2. **O índice é barato.** `⛔ NÃO traz o conceito das colunas` e `é bem menor que o dicionário` são
   guarda-corpos contra alguém "enriquecer" o índice até ele empatar com o dicionário — momento em
   que o A2 deixa de economizar qualquer coisa e vira gasto puro.
3. ⭐⭐ **O roteamento é falsificável.** `um especialista É escolhido quando o modelo o pede` usa o
   `REGISTRO_DE_TESTE`, que tem um `a3_tendencia` de mentira. Sem ele, com um A3 só em produção o A2
   sempre "acerta" e não há como distinguir roteador funcionando de roteador quebrado — o primeiro
   teste real seria no dia em que o segundo A3 subisse. É o I-13 aplicado antes do erro.

## O que decidir antes da fiação

⚠️ Nada disso é código; é escolha, e a fiação vai pedir.

- **`plum_logs`:** a etapa `encaminhador` grava a escolha **e o motivo** em `resposta`. Sem coluna
  nova. ⛔ Confira no banco, não na tela — foi exatamente o I-12.
- **`agenteInvalido`:** quando o modelo pede um agente que não existe, o A2 cai no generalista e
  marca isso. Vai como `codigo_erro` no log. Um fallback que ninguém mede é um roteador que parou de
  funcionar sem avisar.
- **A presunção chega ao usuário.** *"Respondi olhando só a planilha de Vendas."* Se o A2 pega 1 de 6
  e a resposta precisava de 2, o número sai errado e confiante — e o usuário é a única pessoa capaz
  de perceber. Mesma classe do D5.
- **Uma base só: o A2 ainda roda**, porque a escolha do A3 existe independente do número de bases.
  🔮 Se a medição mostrar que é gasto puro, o portão de "só com 2+ bases" volta a valer para a metade
  de **seleção**, nunca para a de roteamento.

## Se algo der errado

| sintoma | causa provável |
|---|---|
| `CHECK de etapa NAO barrou valor fora do enum` | a migration ficou entre o `DROP` e o `ADD`. Rode-a de novo inteira — ela é idempotente |
| `FALTANDO` em *"AINDA aceita 'reconhecedor'"* | alguém editou a migration removendo o valor histórico. ⛔ Não siga: as linhas de agosto ficam em violação |
| O A2 nunca escolhe o especialista | esperado em produção: `REGISTRO` não contém entrada de teste, e é assim de propósito. O teste usa `REGISTRO_DE_TESTE` explícito |
| `registro de agentes sem o padrao 'a3_planejador'` | erro de programação, não de modelo — alguém montou um registro sem o generalista. É o único caso em que o roteador levanta, e está certo levantar |
