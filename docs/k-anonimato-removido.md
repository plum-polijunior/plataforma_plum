# Por que o k-anonimato foi removido (2026-08-08)

Decisão de produto, não bug de código: a supressão por k-anonimato (premissa P3 do design
doc do `query_engine`) foi removida do `pandas_executor.py`. Este documento registra o
raciocínio, pra quem chegar depois não achar que é uma regressão de segurança.

## O que a regra fazia

Todo resultado do executor já era agregado (soma, média, contagem — nunca linha bruta, ver
R-02). O k-anonimato ia além disso: exigia que todo **grupo** do resultado (uma linha do
`GROUP BY`, ou a base inteira quando não havia agrupamento) tivesse no mínimo `k_min` linhas
de origem por trás — padrão 5. Grupo com menos linhas era removido do resultado antes de sair,
e a contagem virava `suppressed_groups`.

A ideia por trás é real e bem estabelecida em privacidade de dados: se o "grupo" que está
sendo agregado é, na prática, uma pessoa (ex.: `SOMA(peças não conformes) AGRUPADO POR
funcionário`, e um funcionário só aparece numa linha), a agregação não protege nada — o
"agregado" é a própria linha da pessoa, só que com um nome mais bonito.

## Por que deixou de valer a pena

O k-anonimato só protege alguma coisa quando o **eixo de agrupamento coincide com um
indivíduo identificável** — agrupar por pessoa, por CPF, por matrícula, por e-mail. Na
esmagadora maioria das planilhas reais que o Plum conecta, isso não é o que acontece: as
linhas são organizadas por **data, por evento, por categoria de produto, por região, por
turno** — dimensões que não identificam uma pessoa mesmo quando o grupo é pequeno. "Quantas
peças não conformes em 10/02/2026" agrupa por **dia**, não por funcionário; um grupo de 2
linhas nesse caso é só "um dia com poucos registros", não "os dados privados de alguém".

Nesse cenário — que é o cenário típico — o k_min padrão de 5 não estava comprando privacidade
real. Estava comprando **falsos negativos**: qualquer filtro que isolasse um recorte com menos
de 5 linhas de origem (um dia específico, uma combinação de filtros um pouco mais específica,
uma base pequena de cliente novo) virava "não foram encontrados registros" — indistinguível,
pra quem pergunta, de "esse dado realmente não existe". Isso não é um efeito raro: é o
resultado esperado do k_min=5 em qualquer planilha de porte pequeno/médio, que é a maioria da
base de clientes do Plum hoje. O custo em confiabilidade percebida do chat (parece que ele não
sabe responder) superava, de forma consistente, o benefício de privacidade que a regra
gerava nesses casos.

## O que continua protegendo dados, sem mudança

Remover k-anonimato não abriu a porta pra vazar linha bruta — essas proteções são
independentes e continuam de pé, sem exceção:

- **R-01/R-02 (agregação obrigatória, sempre).** `RawRowsBlocked` recusa qualquer plano sem
  `select` ou sem função de agregação. Isso nunca foi condicionado a `k_min` — mesmo antes da
  remoção, um plano sem agregação era recusado independente do valor de `k_min`. O que saía do
  executor sempre foi um número calculado, nunca uma linha da planilha do cliente.
- **RBAC de coluna** (`allowed_columns` por cargo/dataset). Continua controlando quais colunas
  cada cargo vê. Isso é ortogonal ao k-anonimato — decide o quê é visível, não quantas linhas
  de origem precisam sustentar um número.
- **Isolamento de tenant** (RLS + `organization_id` + JWT). Inalterado.
- **`suppressed_groups`** continua no formato de resposta do executor, por compatibilidade com
  quem consome (Agente C, cards do dashboard) — só que agora é sempre `0`.

## Quando essa decisão merece ser revisitada

O raciocínio acima depende de uma premissa: **a dimensão de agrupamento não é uma pessoa.**
Se um cliente específico tiver uma base onde perguntas legítimas agrupam por indivíduo — RH,
folha de pagamento, dados de saúde, qualquer base onde "funcionário"/"paciente"/"CPF" é o
próprio eixo de análise — o argumento deste documento não se aplica a essa base, e vale
reabrir a conversa sobre alguma proteção equivalente (nem que seja configurável só para esses
casos, não como regra global). Ver `TODOS.md` item 5 (privacidade diferencial) e
`CLAUDE.md` R-12 pelo registro histórico do que existia e por quê foi removido.

## O que foi alterado

- `query_engine/pandas_executor.py`: removida a supressão por tamanho de grupo em
  `_grouped_agg` e no agregado único; `RawRowsBlocked` deixou de ser condicionado a `k_min`
  (agora é incondicional); parâmetro `k_min` removido de `execute_plan` e
  `execute_plan_with_formatting`.
- `query_engine/main.py`, `config.py`, `security.py`: removida a leitura/plumbing de `k_min`
  (payload, env var `PLUM_K_MIN`, `default_k_min()`).
- `supabase/functions/dashboard-execute/index.ts` e `ai-plum-chat/index.ts`: removida a
  leitura de `organizations.dashboard_k_min` e o envio de `k_min` no payload assinado ao
  Lambda. A coluna `dashboard_k_min` continua existindo no banco (vestigial, sem leitura em
  nenhum código) — não foi feita migration de remoção, por não ser destrutiva nem necessária.
- `supabase/functions/ai-plum-chat/index.ts`: prompt do Agente C deixou de mencionar
  `suppressed_groups`/k-anonimato, já que o campo é sempre `0` agora.
- Testes atualizados em `query_engine/tests/test_privacidade.py`,
  `test_seguranca.py`, `test_endpoint.py` e `supabase/functions/_shared/query_plan.test.ts`
  (o teste de supressão foi substituído por um teste que confirma que grupos pequenos **não**
  são mais suprimidos — proteção contra reintrodução acidental).
- `plano-k-anonimato-por-cargo.md` (bypass só pro Admin) ficou superado por esta decisão mais
  ampla — marcado como obsoleto, não apagado.
