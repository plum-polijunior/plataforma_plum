# B21 · A planilha já cadastrada para de virar base duplicada — manual do 👤

⭐ **É o bloco mais barato da Etapa 3 e o que mais mordia.** Até agora, colar o link de uma planilha
que já é uma base criava uma **segunda base idêntica**, em silêncio — e nada na tela dizia qual das
duas o chat usa.

A causa era uma linha: a busca por rascunho filtrava `status = 'processing'`, então base **ativa**
nunca era encontrada e o cadastro caía direto no `insert`.

**Front puro.** Sem migration, sem Edge Function, sem Lambda.

## Antes

Nada. Este bloco não depende de nenhum outro estar no ar.

## Publicar

```sh
git push
```

A Vercel publica o front no push. ⭐ **Nenhum deploy de Edge Function é necessário**, e isso não é
sorte: o B21 não inventou ação nenhuma, só mudou a consulta que o front já fazia ao Supabase. ⇒ **A
assimetria do I-14 não existe aqui** — não há contrato entre front e Edge mudando, então não há
janela nem ponte a construir.

## ⭐⭐ O que confirmar

### 1. A planilha já cadastrada é recusada

Vá em **Bases de Dados → Conectar Nova Planilha** e cole o link de uma base que **já está ativa**.

⭐ **O que deve acontecer:** um diálogo *"Essa planilha já está cadastrada"*, com o nome da base. Duas
saídas, e **nenhuma das duas cria base**:

- **Colar outro link** — fecha e devolve ao passo 1;
- **Abrir a base** — sai do cadastro e cai já dentro do **"Editar Esquema"** daquela base, que é onde
  fica o *Reler a planilha* do B22.

⛔ **Confira no banco, não na tela** (I-12). A tela pode estar mostrando uma lista em cache:

```sql
select id, name, status, google_sheet_gid, created_at
  from public.datasets
 where google_sheet_id = 'ID_DA_SUA_PLANILHA'
 order by created_at desc;
```

Tem de continuar com **uma linha só**. Se apareceu outra "Nova Planilha" em `processing`, o bloco não
está no ar — confira se o deploy da Vercel terminou.

### 2. ⚠️ Outra ABA do mesmo arquivo continua sendo base nova

Abra outra aba da **mesma** planilha, copie o link (a URL muda o `#gid=`), e cole.

⭐ **Tem de seguir para o cadastro normalmente.** Uma base é uma aba: cada uma tem cabeçalho, grão e
formatação próprios. Se este caso for recusado, o bloco está casando só pelo arquivo e não pela aba —
é regressão.

⚠️ E o contrário também vale: a **primeira** aba de toda planilha tem `gid = 0`, que é um valor
legítimo. Se colar o link da primeira aba de uma base já cadastrada e ela **não** for reconhecida, o
código voltou a testar a veracidade do número em vez de comparar com `null`.

### 3. O rascunho continua sendo retomado

Comece um cadastro, pare no meio (feche a aba do navegador), volte e cole o mesmo link.

⭐ Tem de aparecer o toast *"Rascunho encontrado"* e voltar ao passo onde você parou — exatamente
como antes. O B21 não mexeu nisso; só deixou de esconder a base ativa.

### 4. ⛔ O link de "Publicar na web" é recusado com mensagem própria

Na planilha: **Arquivo → Compartilhar → Publicar na web**, e copie o endereço gerado
(`.../spreadsheets/d/e/2PACX-.../pubhtml`). Cole no cadastro.

⭐ **O que deve acontecer:** *"Esse é o link de 'Publicar na web', que não dá acesso à planilha…"*,
com a instrução de copiar o endereço da barra.

⚠️ **Por que isto entrou num bloco sobre base duplicada.** A regex do id para no primeiro `/`, então
**toda** planilha publicada devolvia `id: "e"`. Enquanto o id era só um parâmetro de leitura isso era
uma falha isolada e barulhenta. Com o B21 ele virou **chave de identidade** — e duas planilhas
publicadas diferentes passariam a ser "a mesma base", com a segunda sendo recusada apontando para a
primeira. Colisão de identidade é pior que erro de leitura, porque ela não parece erro.

### 5. A segunda porta: o "Salvar URL" do Editar Esquema

Abra uma base ativa → **Editar Esquema** → no campo de conexão, cole o link de **outra** base já
cadastrada e clique em **Salvar URL**.

⭐ Tem de recusar, dizendo qual base já usa aquela aba. ⚠️ Este caminho é pior que duplicar: daria
duas bases com **dicionários diferentes** lendo a mesma aba, e cada card responderia pelo dicionário
que por acaso fosse consultado.

## O que este bloco NÃO faz

⛔ **Não compara o conjunto de colunas.** A pendência C14 supunha que a detecção não podia ser pela
URL, e que teria de ser pelo conteúdo. Não é verdade: o mesmo documento dá o mesmo `id` em qualquer
forma de link (`/edit`, `?usp=sharing`, com ou sem `#gid`), e há teste disso em
`src/lib/google-sheets.test.ts`. Casar por assinatura de colunas é justamente o que o B13 abandonou
de propósito — duas planilhas diferentes com as mesmas colunas se confundiam.

⛔ **Não apaga base duplicada que já existe.** Se você já tem duas, apagar leva os cards e a matriz de
permissões junto, por CASCADE. Decida qual fica olhando `dashboard_cards.dataset_id`.

## Se algo der errado

| sintoma | causa provável |
|---|---|
| Cola o link de base ativa e o cadastro segue normal | o front antigo ainda está no ar. Confira o deploy da Vercel |
| A **primeira aba** de uma base ativa não é reconhecida | o `gid = 0` voltou a ser tratado como ausente. O desvio tem de ser `ref.gid === null`, nunca `!ref.gid` |
| Outra aba do mesmo arquivo é recusada | o `google_sheet_gid` saiu da chave da consulta — está casando só pelo arquivo |
| "Abrir a base" não abre nada | o `onAbrirBase` não chegou ao `DatabasePipeline`, ou o refetch não achou o id. Ver `idParaAbrir` em `Cfgdatabase.tsx` |
| Uma planilha cujo id **começa** com `e` é recusada | a guarda do link publicado perdeu a barra final: tem de ser `/d/e/`, não `/d/e` |
