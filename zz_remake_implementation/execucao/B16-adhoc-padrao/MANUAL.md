# B16 · `ad_hoc` como padrão — manual do 👤

⭐ **É o bloco de uma linha de SQL, e o de maior consequência da etapa:** o remake deixa de ser
opt-in e passa a ser o caminho de toda organização desta plataforma.

## Antes

⚠️ **B11 é a pré-condição real, não o B15.** As bases da demo continuam em `schema_metadata` v1 e não
serão recadastradas (recadastrar cria uuid novo e órfã os cards — C13). Se o leitor único não
tolerasse a v1, virar o padrão transformaria toda base esquecida em **chat quebrado**. Ele tolera,
com default por campo, e `versao: 1` faz o A3 declarar mais presunção em vez de errar calado.

⇒ Antes de aplicar, confirme que uma base v1 responde. Faça uma pergunta numa base **que você não
recadastrou** e veja se ela responde pelo `ad_hoc`. Se ela quebrar, **pare aqui** — o B16 multiplica
esse problema por todas as bases antigas.

## Aplicar

⛔ **Migration não é aplicada por CLI neste projeto.** Copie o SQL no **SQL Editor do painel
Supabase** e rode, lendo o bloco de verificação no fim:

```
supabase/migrations/20260825120000_adhoc_como_padrao.sql
```

Os cinco itens da verificação têm de sair `OK`. O que mais importa é **`DEFAULT da coluna e true`** —
sem ele, organização criada amanhã nasceria no caminho legado e ninguém notaria: o chat responderia,
só pela cadeia antiga, e a única pista seria a ausência de linhas `ad_hoc` no `plum_logs` daquela
organização.

**Nenhum deploy.** Nenhuma função muda; o leitor da chave já existe desde o B06.

## Depois

```sql
select name, remake_habilitado from organizations order by created_at;
```

Todas `true`. Faça uma pergunta em cada base que existe — inclusive as v1 que você não recadastrou.

## ⭐ O rollback, e por que ele justifica a ordem

Voltar é **um UPDATE, sem deploy, com efeito imediato**:

```sql
update public.organizations set remake_habilitado = false;
```

É isso que torna defensável a ordem que você escolheu: virar o padrão **antes** da suíte de
avaliação (B17). Apontar o chat para um caminho que ninguém mediu é um risco real — e vale dizer uma
vez, sem enfeite. O que o limita é o custo de desfazer ser próximo de zero.

⚠️ A chave não deixa de existir; ela **troca de papel**. Era conveniência de desenvolvimento, passa a
ser escape hatch de emergência. O comentário da coluna no banco diz isso, e o bloco de verificação
confere que diz.

## ⚠️⚠️ Isto não alcança os quatro clientes pagantes

Eles usam a 🔧 **implementação** — deploy Supabase totalmente separado, com o próprio banco. Esta
migration roda no projeto da **plataforma** (`rjwidarrsykufuifzunu`) e não os toca.

Confundir os dois é *"o erro mais comum e mais caro"* deste projeto. Ver
`contexto/02-plataforma-vs-implementacao.md`.
