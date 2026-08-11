# Fase 4 e 5a — a Página Inicial, do zero ao ar

**Data:** 2026-08-10 e 2026-08-11 · **Branch:** `feat/pagina-inicial-dashboard`

---

## Resumo estruturado

### 1. O que foi feito

A **Página Inicial** (`/inicio`) saiu do zero e foi ao ar: um mural onde cada card
é uma pergunta guardada que se recalcula sozinha. Dá para criar card escrevendo a
pergunta em português, ver o número **antes** de publicar, e trocar a forma de
visualização (número, barras, parte-do-todo, pizza, tabela).

O motor e o banco já existiam desde agosto; **o que faltava era a tela** — e ela
nunca tinha sido construída porque `dashboard-execute` jamais havia sido chamada
uma única vez.

### 2. Decisão técnica

**A fase inteira foi aditiva, por construção, e isso foi verificável por
`git diff` a cada passo.** Nenhuma linha do chat (`ai-plum-chat`, `PlumChat.tsx`),
do executor Python ou do interpretador de Query Plan foi alterada. A única exceção
está declarada e justificada: 3 linhas em `dashboard-execute` (`force?: boolean`),
numa função que **não era chamada por ninguém** até esta fase — logo, sem
possibilidade de quebrar fluxo de usuário.

A alternativa descartada foi a que o time havia sugerido: rotear por palavra-chave
dentro do chat (`if pergunta contém "dashboard"`). Recusada por três motivos —
é frágil ("monta um gráfico do faturamento por mês" não contém a palavra), o
projeto já tem dívida ativa por decidir comportamento com keyword-match em texto
livre (`query_engine/urgent.md`), e uma aba própria já declara a intenção pelo
clique.

Também descartado: reusar a ação `execute_plan` do chat para a prévia. Ela faz
exatamente o necessário, mas a decisão foi **duplicar pelo isolamento** — com o
custo escrito e as cinco checagens de autorização transcritas na mesma ordem.

### 3. Integrações tocadas

| O quê | Estado |
|---|---|
| `supabase/functions/dashboard-agent/` | **Nova.** Duas ações: `gerar_card` (Gemini) e `executar_previa` (executor, sem gravar) |
| `supabase/functions/dashboard-execute/` | +3 linhas: `force?: boolean` pula o cache de snapshot |
| `supabase/migrations/20260811120000_grant_snapshots_service_role.sql` | **Nova.** Devolve o GRANT de escrita ao `service_role` |
| `dashboard_cards`, `dashboard_card_snapshots` | Passam a ser lidas e escritas de verdade pela primeira vez |
| `src/integrations/supabase/types.ts` | Ganha as duas tabelas do dashboard **e** `plum_chat`, que faltava desde sempre |

### 4. Safeguard

Cinco defeitos reais foram encontrados, e **nenhum estava no código do dashboard**
— todos apareceram porque a bateria de verificação existia:

| Bug | Como não volta |
|---|---|
| Snapshots nunca gravados (`permission denied`) | Migration com bloco de verificação que imprime OK/FALTANDO para 5 privilégios |
| Intervalo de datas excluindo o primeiro dia | Regra 6 no prompt do agente, com o número real do incidente escrito nela |
| Mensagem de cota do Gemini nunca chegando ao usuário | A função devolve **200 com `card.erro`** em vez de 5xx — `functions.invoke` trata não-2xx como falha de transporte e descarta a explicação |
| Card recusado por alias de `order_by` lido como coluna | A tela passou a **importar `extractColumns`** de `_shared/` em vez de ter a própria cópia |
| Aba `Sheet1` inexistente | Corrigido pelo time em paralelo (`gid`); a Etapa −1 do plano ganhou o passo de conferir |

### 5. Como validar

```sh
npm run dev            # abrir http://localhost:8080/inicio
npx tsc -p tsconfig.app.json --noEmit   # 0 erros (o `npm run build` NÃO tipa)
npm test               # 54 verdes
```

Na tela: criar um card com *"qual o faturamento por forma de pagamento?"*, conferir
que a prévia aparece antes de publicar, e que o total bate **R$ 9.229,27** na base
sintética. Depois, no SQL Editor:

```sql
select count(*) from public.dashboard_card_snapshots;   -- > 0 = cache gravando
```

### 6. Lacunas e pendências

- **[LACUNA: `npm run build` não faz typecheck** — o time — D.O.D.: `package.json`
  com `tsc -p tsconfig.app.json --noEmit && vite build`, ou pelo menos o
  `CLAUDE.md` deixando de afirmar que ele tipa]
- **[LACUNA: `TODOS.md` #11, #12 e #13** — quem cuida do `query_engine` e do
  onboarding — D.O.D.: cabeçalho normalizado, aviso de Local da planilha, e escala
  de percentual resolvida na ingestão]
- **[LACUNA: Fase 5b** — plano escrito, aguardando validação — D.O.D.: agrupar por
  período e gráfico de linha]
- **[LACUNA: chave do Gemini no tier gratuito** — quem administra a chave — D.O.D.:
  20 req/dia hoje, e os tiers têm **políticas diferentes de uso dos dados**]
- **[LACUNA: `DESIGN.md` desatualizado em 4 pontos** — eu ou quem pegar — D.O.D.:
  §3 e §10 refletindo o que está na tela]

---

# Parte 2 — Explicação didática

## O Plum é um restaurante

Essa imagem carrega tudo o mais.

```
   VOCÊ            O GARÇOM            A COZINHA
   pergunta   →    escreve a      →    faz a conta
                   comanda
                   (a IA)              (o Python)
```

Você faz o pedido. O **garçom é a inteligência artificial**: entende o que você
quis dizer e escreve uma comanda. **Ele nunca cozinha** — não sabe, e se tentasse,
inventaria o prato. A **cozinha é um programa comum**: não conversa, não opina,
faz exatamente o que está escrito. Por isso a conta sai certa.

> **A regra que sustenta o produto:** a IA **planeja**, o computador **calcula**.
> Nenhum número na tela saiu da cabeça da IA.

Isso existe porque IA é ótima para entender frases e **ruim para fazer contas** —
ela chuta com confiança. Um programa comum nunca chuta.

---

## Como a IA calcula sem ver os dados

Esta é a parte que mais gera dúvida, então vale devagar.

### O que a IA recebe, exatamente

Quando você pergunta *"qual o faturamento por loja?"*, a IA recebe **duas coisas**:

1. A sua pergunta.
2. O **dicionário da base** — o `schema_metadata`.

E o dicionário é **só isto**, por coluna:

```json
{
  "columns": {
    "valor_total_r": {
      "semantic_definition": "Valor total da venda em reais, já com desconto",
      "formatting_rule": { "type": "moeda_brl", "params": {} }
    },
    "loja_filial": {
      "semantic_definition": "Unidade física ou canal onde a venda ocorreu",
      "formatting_rule": { "type": "texto_trim_maiusculas", "params": {} }
    }
  }
}
```

**Nenhuma linha da planilha está aí.** Nem uma venda, nem um cliente, nem um CPF.
Só o **nome** de cada coluna, o que ela **significa** e como ela deve ser **lida**.

É a diferença entre entregar o **cardápio** e entregar a **despensa**. O garçom lê
o cardápio para escrever a comanda; ele nunca precisa entrar na despensa.

### O que a IA devolve

Uma **comanda** — que no código se chama Query Plan. É um JSON com a receita do
cálculo, e nada mais:

```json
{
  "from": "producao",
  "target_columns": ["loja_filial", "valor_total_r"],
  "select": [{ "expr": { "agg": "sum", "col": "valor_total_r" }, "as": "total" }],
  "group_by": ["loja_filial"]
}
```

Traduzindo: *"some a coluna `valor_total_r`, separando por `loja_filial`"*.

Repare que **não há número nenhum aqui**. A IA disse *o que fazer*, não *qual é o
resultado*. Ela não teria como saber o resultado — ela nunca viu as vendas.

### Quem faz a conta

A comanda vai para a cozinha (o executor em Python, rodando na AWS). **Ela** lê a
planilha, aplica a receita e devolve só o resultado somado:

```json
{ "columns": ["loja_filial", "total"],
  "rows": [{ "loja_filial": "E-COMMERCE", "total": 3493.90 }, ...] }
```

A cozinha tem uma regra que não admite exceção: **é proibido devolver linhas
brutas**. Todo plano precisa ter pelo menos uma soma, média ou contagem. Pedir
"liste todos os pedidos" é impossível por construção — o programa recusa.

### O caminho completo, e onde cada um para

```
sua pergunta ────────► IA ────────► comanda ────────► cozinha ────────► total
                       │                              │
                  vê o dicionário               vê a planilha
                  NÃO vê a planilha             NÃO fala com a IA
```

As duas peças **nunca se encontram**. A IA não tem como pedir uma linha; a cozinha
não tem como perguntar nada à IA.

### A ressalva honesta

Há **um** lugar onde dado real vai para a IA, e não é este: no **cadastro** de uma
planilha nova, 5 linhas de exemplo são enviadas para o Gemini entender o formato
das colunas. Está registrado como pendência conhecida (`TODOS.md` #6) e é de outra
parte do sistema.

Ou seja: *"a IA nunca lê seus dados"* é verdade para o dashboard e para o chat, e
**falso para o onboarding**. A frase não deve ir para contrato sem essa
qualificação.

---

## Como um card nasce

Um card é **uma pergunta guardada**. Você pergunta uma vez, e a resposta fica no
mural, sempre atualizada.

```
   1. você escreve          2. o agente monta        3. PRÉVIA
      a pergunta         →     a comanda          →     você vê o número
                                                        de verdade
                                                          │
   5. o card entra          4. você clica          ◄──────┘
      no mural          ◄      "Publicar"
```

**Nada é gravado até o "Publicar".** Fechar o diálogo não deixa rastro.

### Por que a prévia existe

Porque o card vai para a página inicial de **toda a organização** e se re-executa
sozinho para sempre. Um card errado não é um erro particular: é um número errado
na cara de todo mundo, todos os dias.

E isso não é hipotético — na verificação desta fase, um card de intervalo de datas
devolveu **R$ 1.626,57** onde o correto era **R$ 2.387,92**, porque o agente
excluiu o primeiro dia do intervalo. Sem gabarito, ninguém teria percebido.

### As cinco travas antes de gravar

Cada uma existe por um erro concreto:

1. **Coluna existe?** Se o agente inventar um nome, o erro que apareceria seria
   *"seu cargo não pode ver"* — mentira que manda a pessoa investigar permissão em
   vez do plano.
2. **Tipo de gráfico dentro do enum.** O banco tem um `CHECK`; `"pie"` ali
   quebraria o `INSERT`.
3. **Campos que a segurança exige.** A regra de escrita pede `created_by = você`;
   esquecer faz o banco recusar sem dizer qual condição falhou.
4. **Posição explícita.** A coluna não tem `UNIQUE` e todo card nasceria em 0 — a
   ordem da grade mudaria a cada carregamento.
5. **Botão travado durante a gravação.** Sem `UNIQUE`, dois cliques criam dois
   cards idênticos. Aconteceu de verdade, com o `INSERT` rodado duas vezes.

---

## Quem vê o quê

| | Quem vê |
|---|---|
| **Existência e título do card** | Todo membro ativo da organização |
| **O número dentro dele** | Só quem tem **todas** as colunas do cálculo liberadas no cargo |

Sem permissão, o card aparece **sem valor nenhum**, com um aviso. E repare: o Plum
**se recusa** a calcular escondendo a coluna proibida — um número calculado pela
metade pareceria certo e ninguém notaria.

⚠️ **O título é público dentro da organização.** Um card chamado "Salário médio por
cargo" é lido por todo mundo, mesmo por quem nunca verá o valor. Foi decisão
consciente: esconder de verdade exige filtragem no servidor. Quem cria card não põe
segredo no título.

---

## Por que o número às vezes tem alguns minutos

A planilha mora no Google, e o Google limita **60 pedidos por minuto**. Se cada
abertura do mural relesse tudo, seis pessoas juntas já estourariam o limite.

Então o Plum guarda o resultado por um tempinho. O card **sempre diz a idade**
("calculado há 4 min") e tem um botão para recalcular na hora.

E se a cozinha estiver fora do ar? O card mostra **o último número que deu certo**,
com a idade escrita — nunca uma tela de erro. Um número de uma hora atrás é mais
útil que um erro.

*(Este mecanismo esteve **quebrado em silêncio** a fase inteira: o servidor não
tinha permissão de escrever o histórico, e `dashboard-execute` foi escrita para
não derrubar a resposta quando isso falha. O dashboard funcionava sem cache
nenhum. Uma migration corrigiu.)*

---

## As formas de ver o mesmo número

No menu de cada card há **"Ver como"**:

| Forma | Quando faz sentido |
|---|---|
| **Número** | Um valor só |
| **Barras** | Comparar categorias |
| **Parte do todo** | Quanto cada categoria pesa no total |
| **Pizza** | Idem, em ângulo |
| **Tabela** | Sempre — é a única que nunca distorce |

Duas coisas não óbvias:

**A escolha é sua, não do card.** Ela fica no seu navegador e não muda a tela dos
outros. O card é da organização; o jeito de ler é de cada um — inclusive de quem
precisa de tabela por usar leitor de tela.

**O menu só oferece o que não mente.** "Parte do todo" não aparece em cards de
média: somar médias não produz um todo, e a barra desenharia um comprimento sem
significado.

### Sobre a cor

Cada card tem **um matiz**; dentro dele, a variação é de **luminosidade** — mais
claro é maior. Isso permitiu passar de 3 para 6 categorias sem perder legibilidade.

Os números por trás: a faixa utilizável de luminosidade neste tema é estreita
(entre 82% e 52%, porque abaixo disso a cor some no fundo quase preto). Trinta
pontos divididos por 6 degraus dá 6 pontos cada — indistinguível. A saída foi a
escala **multi-matiz**, em que luminosidade, matiz e saturação caminham juntos.
Verificado por cálculo de contraste: o pior caso é 4,91:1, acima do piso de 3:1.

Acima de 6 categorias os dois limites quebram: o salto de luminância entre
vizinhos cai a zero, **e** uma fatia de 1% tem 4 pixels num card de 420px. Por isso
o excedente vira "Outros" — que é expansível, e avisa quando ficou grande demais.

---

## O que ainda não dá

**"Faturamento por mês" não funciona.** A planilha guarda a data completa e a
cozinha ainda não sabe juntar dias em meses. Dá para **filtrar** um período; o que
falta é **agrupar** por período. É a Fase 5b, com plano já escrito.

**Gráfico de linha** depende disso — linha sem agrupamento por período desenharia
um ponto por dia.

**Medidor** precisa de uma meta, e não existe onde guardar.

**Delta e tendência** ("subiu 12% vs. o mês passado") precisam de histórico. Ele
começou a acumular em 2026-08-11, quando a migration destravou os snapshots.

---

## Três coisas que a verificação encontrou e ninguém sabia

**1. O typecheck deste projeto nunca rodou.** `npm run build` é só `vite build`
(o Vite transpila sem checar tipo) e `npx tsc --noEmit` na raiz não entra nos
projetos referenciados — sai calado. O comando que verifica é
`tsc -p tsconfig.app.json --noEmit`, e ele acusava **13 erros** em `PlumChat.tsx`,
porque a tabela `plum_chat` nunca entrou no `types.ts`. Corrigido.

Descoberto porque um identificador inexistente passou pelos dois comandos e virou
tela preta no navegador.

**2. Planilha em Local errado troca dia com mês.** Um CSV brasileiro importado num
Google Sheets com Local "Estados Unidos" faz `05/01/2026` virar 1º de maio. **Doze
dos ~30 dias de todo mês ficam errados, em silêncio** — e o Plum não tem como
perceber, porque o número gravado é legítimo, só aponta para o dia errado.
Registrado como `TODOS.md` #12.

**3. O cabeçalho da planilha nunca é normalizado na leitura.** O `sheets.py`
compara o cabeçalho **cru** contra o nome em `snake_case` — e o comentário da
própria função afirma o contrário. Atinge todo Sheets em português. `TODOS.md` #11.

---

## Como isso foi construído

Vale registrar o método, porque ele é a razão de os cinco defeitos terem
aparecido antes de um cliente vê-los.

**Um plano escrito antes do código**, com decisões fechadas e o porquê de cada uma.
Ele previu 8 etapas; a execução encontrou **10 furos no próprio plano** numa
revisão crítica antes de começar — incluindo dois que travariam a execução no meio.

**Um princípio de isolamento verificável.** Não "vamos ter cuidado", e sim: *se
`git diff` listar `ai-plum-chat`, `query_engine` ou uma migration, saiu do plano*.

**Duas válvulas de reversão.** A rota nasceu **sem link na sidebar** — quem sabia a
URL testava, ninguém mais encontrava. O link entrou num commit separado de uma
linha, depois de tudo verificado. Reverter a aba não desfaz a fase.

**Uma parada obrigatória para revisão visual**, antes de o diálogo de criação e a
gestão serem construídos em cima do layout.

**Uma bateria de verificação com gabarito conferido à mão** — e o princípio de que
**conferência de valor se faz em base sintética**. Abrir a planilha de um cliente
para checar se o card somou certo é, ele próprio, um acesso a dado pessoal.
