# B18 · O `from` deixa de ser sobrescrito — manual do 👤

⭐ **É a fundação do multi-base, e o executor sempre soube fazer isso.** `execute_plan(plan, tables)`
resolve `plan["from"]` contra um dicionário de tabelas desde sempre. Quem não sabia era o `main.py`,
que montava `{"producao": df}` e depois fazia `plano["from"] = "producao"`, jogando fora o `from` que
o planejador emitiu.

**Servidor puro.** Sem front, sem Edge Function, sem migration.

## Antes

Nada. Este bloco não depende de nenhum outro estar no ar.

## Publicar

⚠️ **O push publica sozinho, e é isso que exige atenção.** `query-engine.yml` casa
`query_engine/**`, então entrar na `plataforma` já constrói a imagem e chama `update-function-code`
no Lambda **de produção** — o que serve os 4 clientes.

⛔ **E o smoke test roda DEPOIS da substituição** (C4b / I-09): a imagem quebrada troca a boa e o
teste só avisa em seguida. Não há janela em que o deploy seja verificado antes de valer.

⇒ Antes de dar push, localmente:

```sh
cd query_engine && python -m pytest -q
```

Depois do push, acompanhe o run em Actions até o job `publicar` fechar verde.

## ⭐⭐ O que confirmar, e é uma coisa só

**Que nada mudou.** Este bloco é uma capacidade nova cujo critério de pronto é a ausência de efeito
no que já existe.

Abra o dashboard de uma base qualquer e confira que **todos os cards continuam com número**.

⚠️ **Por que este é O teste:** todo card salvo em produção carrega `"from": "producao"`, porque o
`main.py` sobrescrevia o `from` antes de executar. Passar a respeitar o `from` sem a ponte de
compatibilidade apagaria o dashboard de todo mundo no minuto da publicação.

A ponte está em `_resolver_tabela` → `resolver_nome_da_tabela` (`pandas_executor.py`): com
**exatamente uma** tabela no payload, um `from` ausente ou igual a `"producao"` cai nela, qualquer
que seja o nome real. Coberta por `TestCompatibilidadeLegado` em `tests/test_multibase.py`.

⛔ A ponte **não** vale com duas ou mais tabelas — ali "producao" não é apelido de nada, e adivinhar
qual das N devolveria o número de uma base com o rótulo de outra.

## O que mais mudou

`execute_plan` passou a **levantar** `TabelaNaoEncontradaError` em vez de devolver
`{"error": "Tabela 'x' nao encontrada."}`. Fecha o **T8**.

⚠️ A diferença importa: um dict com `error` dentro chega ao card como **card vazio, em silêncio**,
enquanto uma exceção nomeada aparece no log e na tela. Com uma tabela só isso nunca acontecia — o
`from` era sobrescrito. Com multi-base vira o modo de falha mais provável: o planejador escrevendo o
nome errado da planilha.

## Se algo der errado

| sintoma | causa provável |
|---|---|
| Um card específico ficou vazio | o `from` daquele card não é `"producao"` nem o nome real da base. Veja o CloudWatch: a mensagem lista as tabelas disponíveis |
| **Todos** os cards de uma base ficaram vazios | ⛔ a ponte de compatibilidade não está funcionando. É regressão do bloco — reverta o Lambda para a versão anterior antes de investigar |
| `TabelaNaoEncontradaError` no log do chat | esperado se o planejador inventou nome. Antes disso virava card vazio calado; agora aparece |
| O CI passou e o Lambda está velho | `update-function-code` sem `--publish` (C4b). Confira `ezbr_sha256`, nunca o `version` |
