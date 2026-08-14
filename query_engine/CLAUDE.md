# query_engine/ — o que esta pasta esconde

Roda como **imagem de container em AWS Lambda**, atrás de Function URL com `AuthType=AWS_IAM`.
Como subir/operar: **`infra/aws/PASSO-A-PASSO.md`** — fonte única, não duplicar.

⚠️ **`implementation.md` descreve a arquitetura EC2 ABANDONADA.** É histórico.
⚠️ **`prd.md` §6 diz que o cache está desligado — está LIGADO** desde 2026-08-07 (TTL 15 min).

## 1. Motorista cego — a regra que define esta pasta

O executor **não recebe a pergunta**, não conhece a intenção de negócio e **nunca consulta o
Supabase**. Ele obedece um payload assinado que já traz o conjunto de colunas resolvido e
autorizado. Toda decisão de autorização vive na Edge Function que chamou; aqui só se **reconfere**
`allowed_columns` como segunda barreira.

Se você se pegar querendo ler algo do banco aqui, o desenho está errado.

## 2. As quatro barreiras (`security.py`)

SigV4 (infra, antes do Python rodar) · HMAC-SHA256 sobre o corpo, com segredo **diferente** da
credencial AWS · frescor · RBAC de coluna. Vazar uma não basta para forjar a outra.

## 3. Proteções do `pandas_executor.py` — nenhuma é opcional

| Proteção | Por quê |
|---|---|
| `RawRowsBlocked` | todo plano precisa de agregação. ⚠️ Em revisão pelo remake (`contexto/30-decisoes.md` D-033) |
| `RowLimitExceeded` **antes do parse** | o `limit` do plano corta a saída, nunca protegeu a entrada |
| `MissingColumnError` | coluna referenciada e não carregada é **erro**. Filtro ignorado em silêncio devolveria o total da base com o rótulo do recorte — número errado com etiqueta convincente |

⚠️ **k-anonimato foi REMOVIDO em 2026-08-08.** `suppressed_groups` continua no retorno por
compatibilidade, sempre `0`. **Não reintroduzir nada dessa família** — ver
`contexto/30-decisoes.md` D-012.

## 4. `sheets.py` — três coisas não óbvias

- **Um `batchGet` por dataset**, não por pergunta/card (limite de 60 req/min do Google).
- **Resolve `gid → nome da aba`**, com cache próprio de 15 min. `gid` inexistente é **erro**, nunca
  fallback para o nome. ⚠️ `gid = 0` é a primeira aba, valor legítimo — compare com `None`.
- **Normaliza o cabeçalho** (`normalizar_coluna`) — é a contraparte Python de `src/lib/colunas.ts`.

## 5. ⚠️ A normalização de coluna é metade de um contrato entre duas linguagens

Mexeu em `normalizar_coluna`? Mexa em `src/lib/colunas.ts` **e nas duas tabelas de 26 casos**
(`query_engine/tests/test_sheets.py` e `src/lib/colunas.test.ts`). Divergir aqui não vira bypass —
vira "coluna não encontrada". Ver `contexto/30-decisoes.md` D-017.

## 6. Segredos e testes

Segredos vêm do **SSM Parameter Store** (`config.py`) — nunca `.env` com valor.
`npm run test:py` roda o pytest. O CI só publica no Lambda se `npm test` **e** o pytest passarem —
são as barreiras de privacidade/segurança que não podem regredir em silêncio.
