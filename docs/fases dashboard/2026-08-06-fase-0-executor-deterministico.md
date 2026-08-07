# Fase 0 — O executor determinístico

**Data:** 2026-08-06 · **Branch:** `plataforma` · **Estado:** serviço completo e
testado (41 testes). Deploy da infraestrutura e Edge Function ainda pendentes.

---

## 1. Por que esta fase existiu

O PLUM tinha um problema que ninguém tinha escrito em lugar nenhum. Em
`src/pages/PlumChat.tsx`, linha 144:

```ts
// 4. Executa Python Pandas (MOCK)
const mockPythonVetor = { rows: [{ valor: "Simulado" }], msg: "Execução do Pandas pendente da API Python." };
```

Traduzindo: quando alguém perguntava "qual foi o faturamento em julho", o chat
chamava o Agente Z (que aprovava), chamava o Agente A (que montava um plano de
consulta correto), e então **inventava** o resultado. O Agente C recebia a
string `"Simulado"` e escrevia em cima dela uma frase executiva bem redigida.
Nenhum número real jamais foi calculado.

E existia um segundo problema encaixado no primeiro. O arquivo
`query_engine/pandas_executor.py`, com 442 linhas boas, **não era importado por
nada**. Um `grep` por `execute_plan` fora do próprio arquivo retornava zero
resultados. O motor existia e estava desligado.

Por isso a Fase 0 bloqueia todo o resto: dashboard, insights proativos e
simulador What-If dependem, todos, de o sistema saber somar uma coluna de
verdade. Um dashboard construído sobre o mock seria uma tela bonita que mente
com convicção, o que é pior do que não ter tela.

---

## 2. O que é o "executor determinístico", em linguagem de gente

A promessa comercial do PLUM é que a inteligência artificial nunca lê os dados
do cliente. Isso, escrito assim, é impossível: alguém precisa ler as linhas
para somar uma coluna. A promessa que **é** possível, e que este código
implementa, tem quatro partes:

1. Nenhuma linha bruta entra no contexto de um modelo de linguagem.
2. Nenhuma linha bruta é gravada em disco pelo PLUM.
3. Só atravessa a fronteira um vetor agregado que passou por teste de anonimato.
4. Cada uma das três acima tem teste automatizado que derruba o build.

A divisão de trabalho fica assim:

```
   Pergunta do usuário
        │
        ▼
   ┌─────────────────┐   A IA lê só o DICIONÁRIO (nomes e tipos de coluna).
   │  Agente A (LLM) │   Ela nunca vê uma linha. Produz um plano em JSON.
   └────────┬────────┘
            │  { select: [{agg:"sum", col:"faturamento"}], group_by:["regiao"] }
            ▼
   ┌─────────────────┐   Este código. Não sabe qual foi a pergunta, não sabe
   │   ESTE SERVIÇO  │   do que se trata o negócio. Lê as colunas, faz a conta,
   │  (Motorista     │   apaga o que identifica pessoa, devolve o resumo.
   │    Cego)        │
   └────────┬────────┘
            │  [{regiao:"Sul", total:8403.50}, {regiao:"Norte", total:7203.00}]
            ▼
   ┌─────────────────┐   A IA recebe só esse resumo. Escreve a frase final.
   │  Agente C (LLM) │
   └─────────────────┘
```

"Motorista Cego" é o nome que o PRD do chat já usava: o motorista dirige até o
endereço que está no papel, e não sabe o que tem dentro do pacote.

---

## 3. O que foi construído

Sete arquivos novos e uma reforma no executor que já existia.

```
query_engine/
├── pandas_executor.py   ← reformado: k-anonimato, papéis de coluna, falha alta
├── config.py            ← NOVO: lê segredos sem que eles toquem o repositório
├── security.py          ← NOVO: as quatro barreiras
├── sheets.py            ← NOVO: lê o Google Sheets em uma viagem só
├── main.py              ← NOVO: o endpoint em lote (FastAPI)
├── lambda_handler.py    ← NOVO: cola entre a AWS e o FastAPI
├── Dockerfile           ← NOVO: imagem para Lambda
├── requirements.txt     ← NOVO
├── pytest.ini           ← NOVO: o repositório não tinha framework de teste
└── tests/
    ├── test_privacidade.py  ← 17 testes: k-anonimato, linha bruta, regressões
    ├── test_seguranca.py    ← 15 testes: assinatura, frescor, permissão
    └── test_endpoint.py     ←  9 testes: a cadeia inteira, sem rede
```

### 3.1 As quatro correções no executor

Três eram bugs adormecidos que o chat tolerava e que o dashboard amplificaria,
porque um card fica na tela o dia inteiro e ninguém reformula a pergunta.

**Correção 1: o filtro que sumia em silêncio.**

Antes, quando o plano filtrava por uma coluna que não tinha sido carregada, o
código fazia isto:

```python
if col not in df.columns:
    print(f"[executor] Aviso: coluna '{col}' nao encontrada no DataFrame.")
    return pd.Series([True] * len(df), index=df.index)   # tudo verdadeiro
```

"Tudo verdadeiro" significa que o filtro deixa passar todas as linhas, ou seja,
**o filtro deixa de existir**. Na prática: um card chamado "Faturamento de
julho" mostrava o faturamento histórico total. Número errado, com etiqueta
convincente. E o aviso saía por `print`, que some no log de um container.

Agora levanta exceção. Card quebrado se conserta em minutos; card mentindo dura
meses.

**Correção 1b: o mesmo bug no agrupamento.** Este só apareceu porque o teste da
correção 1 puxou o fio: `group_by` com coluna inexistente era descartado em
silêncio e a consulta caía para um total único. O plano pede "por região" e
volta um número só, com o rótulo de agrupado. Mesma classe de mentira, mesmo
tratamento.

**Correção 2: a proteção de percentual que nunca funcionou.**

```python
_PCT_COLS = {
    #definir      ← ficou assim
}
```

O código tinha uma trava para nunca somar coluna de percentual (somar 10% com
20% não dá 30% de nada) e a lista de quais colunas eram percentuais estava
vazia. A trava nunca disparou. E ela **nunca poderia** funcionar assim, porque
uma constante global não serve num sistema multiempresa: a coluna de percentual
da Poli Júnior tem um nome e a do laticínio tem outro.

A informação já existia no lugar certo: o Agente 3, no onboarding, escreve uma
`cleaning_rule` para cada coluna. Agora o papel de cada coluna viaja junto com
o plano, derivado dessa regra. O executor deixou de ter conhecimento global.

**Correção 3: o limite que protegia o lado errado.**

```python
limit = plan.get("limit", 200)
df_out = df_out.head(limit)      # roda DEPOIS da agregação
```

Isso corta o resultado, não a leitura. Uma planilha de 400 mil linhas entrava
inteira na memória e o processo morria antes de chegar no corte. Agora o teto
é verificado antes, e vem dos metadados da planilha (uma resposta minúscula),
não do conteúdo.

### 3.2 O k-anonimato: por que "agregado" não quer dizer "anônimo"

Esta é a parte que a proposta original do dashboard não tinha visto, e é o furo
de LGPD mais sério que apareceu.

A ideia intuitiva é: se eu só devolvo somas e médias, ninguém consegue
identificar uma pessoa. Isso é falso.

```
   Base:  funcionario | salario
          Ana         | 12.000
          Bruno       |  9.500
          Carla       | 15.200

   Plano: SUM(salario) GROUP BY funcionario

   Resultado "agregado":
          Ana   → 12.000
          Bruno →  9.500
          Carla → 15.200      ← isto é a folha de pagamento
```

Cada grupo tem uma linha só, então a "soma" do grupo **é** o valor da linha. O
agregado está vestido de agregado e não é um.

A proteção é um piso: todo grupo do resultado precisa ter no mínimo `k` linhas
de origem. Abaixo disso, o grupo é apagado antes de o vetor sair, e a contagem
de apagados volta junto para a interface poder explicar o buraco na tela.
`k = 5` é o padrão de mercado.

```
   Sul    ┃ 6 linhas ┃ passa
   Norte  ┃ 5 linhas ┃ passa
   Ilha   ┃ 2 linhas ┃ SUPRIMIDO     → suppressed_groups: 1
```

Como esta trava vive no executor, e o executor é compartilhado, **o chat herda
a proteção de graça** no dia em que o time do chat ligar o executor real.

E existe o caso sem agrupamento nenhum: um filtro que isola duas pessoas e soma
o salário delas é tão identificável quanto a linha. Esse caso também é barrado.

### 3.3 O bloqueio de linha bruta

Este apareceu durante a implementação e não estava previsto. `execute_plan`
com um `select` sem nenhuma função de agregação devolvia
`df[colunas].head(limit)`, ou seja, **linhas cruas da planilha do cliente**.
Isso viola a parte 3 da promessa ("só atravessa a fronteira um vetor
agregado").

Agora um plano sem agregação é recusado. Se um dia alguém quiser um card de
tabela mostrando linhas individuais, isso passa a exigir uma decisão explícita,
com nome e responsável, em vez de acontecer por acidente.

### 3.4 As quatro barreiras de segurança

Aqui está o fato que muda a postura de segurança do produto inteiro. Em
`src/components/DatabasePipeline.tsx`, linha 703, o onboarding pede que o
cliente compartilhe a planilha com:

```
plum-polijunior@plataforma-plum.iam.gserviceaccount.com
```

É **uma única identidade, global, que tem leitura na planilha de todos os
clientes**. Ela vai viver dentro deste serviço. Isso significa que o isolamento
entre empresas, neste caminho, não é garantido pelo banco de dados: este
caminho nunca toca o Postgres, então o RLS não protege nada aqui. O isolamento
é garantido por código, e por isso são quatro barreiras e não uma.

```
  Requisição chega
        │
        ▼
  ① SigV4 da AWS         O endpoint usa auth AWS_IAM. Sem credencial da AWS,
     (infraestrutura)     a requisição nem chega ao código.
        │
        ▼
  ② HMAC do payload      Segredo DIFERENTE da credencial da AWS. Quem tiver a
     (security.py)        chave da AWS ainda não consegue forjar payload.
        │                 Comparação em tempo constante.
        ▼
  ③ Frescor              Payload vale por 2 minutos. Nos dois sentidos: relógio
     (security.py)        adiantado não vira payload eternamente válido.
        │
        ▼
  ④ Conjunto de colunas  resolved_columns ⊆ allowed_columns. Comparação de
     (security.py)        CONJUNTO, sem interpretar o plano.
        │
        ▼
  ⑤ (de graça)           Só as colunas autorizadas são carregadas da planilha.
     (sheets + executor)  Se o plano tocar qualquer outra, o executor levanta
                          MissingColumnError — porque a correção 1 fez ele
                          parar de ignorar coluna ausente.
```

A barreira ⑤ é a mais elegante e não custou nada: ela cai no colo por causa da
correção do filtro silencioso. Um plano que declare `resolved_columns` limpo
mas referencie `margem_lucro` por dentro passa pela barreira ④ e morre na ⑤,
porque `margem_lucro` simplesmente não existe no DataFrame carregado.

**Por que a barreira ④ não interpreta o plano.** A extração recursiva de
colunas (percorrer `select`, `where` aninhado, `group_by`, `order_by`) acontece
uma vez só, na Edge Function. Dois interpretadores, um em TypeScript e outro em
Python, concordariam nos casos simples e divergiriam num aninhamento de três
níveis. E quando duas travas de segurança discordam, quem passa é a mais
frouxa. Um interpretador, dois pontos de aplicação.

### 3.5 Uma viagem ao Google, não seis

O PRD do chat já avisava que a API do Google Sheets corta em 60 requisições por
minuto. Com uma leitura por card, seis cards de um dashboard viravam seis
viagens à mesma planilha, muitas vezes lendo colunas que se sobrepõem. Dez
pessoas da mesma empresa abrindo o dashboard às 8h estouravam a cota, exatamente
no horário que o produto promete atender.

O endpoint é **em lote por dataset**: recebe N planos, junta as colunas de
todos, faz um `batchGet` só, monta um DataFrame só, e roda os N planos em cima
dele.

```
   Antes:  card1 → GET colunas A,B     ┐
           card2 → GET colunas A,C     │  6 requisições
           card3 → GET colunas B,D     ┘

   Agora:  6 planos → 1 batchGet de A,B,C,D → 6 resultados
```

E a resposta é **por card**, nunca por lote: um card com coluna proibida
devolve `forbidden` e os outros cinco continuam funcionando. Um card ruim não
pode derrubar o dashboard inteiro.

---

## 4. A hospedagem: AWS Lambda com imagem de container

### Por que Lambda e não as outras opções da AWS

| Opção | Por que não foi escolhida |
|---|---|
| ECS Fargate + ALB | O balanceador é custo fixo mensal antes da primeira requisição. Para carga de rajada às 8h, você paga o dia inteiro por um recurso ocioso. |
| App Runner | Mais simples que Fargate, mas mantém instância provisionada. Custo fixo sem tráfego. |
| EC2 | Mais barato no papel, e você passa a ser responsável por patch de sistema operacional. Numa empresa júnior com rotatividade de time, esse é o passivo que ninguém herda. |
| **Lambda + container** | Escala a zero, cobra por invocação, aguenta pandas (imagem até 10GB), e o endpoint pode ser fechado por IAM em vez de por um header inventado. |

O contra do Lambda é o cold start com pandas, de alguns segundos. Duas decisões
tomadas antes já o neutralizam: o endpoint em lote faz **uma** invocação por
carregamento de dashboard em vez de seis, e a degradação prevista no design
serve o resultado anterior com selo de "calculado há X" quando estoura o tempo.
O cold start deixa de ser falha e vira um carimbo de idade.

### Como a credencial chega lá sem passar pelo repositório

```
   Repositório Git                    NUNCA contém segredo algum
        │
        │ push na branch plataforma
        ▼
   GitHub Actions ──── OIDC ────► Role da AWS
        │                          (o GitHub não guarda chave de longa duração;
        │                           troca a identidade do workflow por
        │                           credencial temporária)
        │ docker push
        ▼
      ECR (a imagem também não contém segredo)
        │
        ▼
   Lambda ──── role de execução ────► SSM Parameter Store (SecureString/KMS)
        │                               /plum/prod/google-sa-json
        │                               /plum/prod/hmac-secret
        │
        │ lido no cold start pela extensão AWS Parameters and Secrets
        │ (localhost:2773, com cache local)
        ▼
   memória do processo · morre com o container · nunca vai para disco
```

Três propriedades:

1. **O JSON da service account não existe em arquivo em lugar nenhum**: nem no
   repositório, nem na imagem, nem em variável de ambiente. As variáveis de
   ambiente guardam o **caminho** do parâmetro (`/plum/prod/google-sa-json`),
   nunca o valor.
2. **O GitHub nunca guarda chave AWS permanente.** `AWS_DEPLOY_ROLE_ARN` é o
   endereço de uma role, não uma credencial, e a política de confiança dessa
   role aceita só este repositório e esta branch.
3. **Parameter Store no tier padrão não cobra por parâmetro**, ao contrário do
   Secrets Manager. Confirme o preço vigente antes de fechar, mas é essa a
   razão da escolha para o porte do PLUM.

O `config.py` tenta três caminhos, nessa ordem: extensão da AWS (o normal em
Lambda), SDK boto3 (para quem roda na própria máquina com credencial AWS), e
variável de ambiente com sufixo `_VALUE` (**só teste local**, e o código
registra um aviso em log quando cai aí).

---

## 5. Os testes: 41, e o que cada grupo prova

O repositório **não tinha nenhum framework de teste** antes desta fase. O
`package.json` tinha `dev`, `build`, `lint` e `preview`, e os únicos testes
eram dois arquivos `.sql`.

```
cd query_engine && python -m pytest
41 passed in 1.46s
```

| Arquivo | Testes | O que prova |
|---|---|---|
| `test_privacidade.py` | 17 | Grupo pequeno é suprimido; supressão é reportada; agregado único sobre base pequena também cai; plano sem agregação é recusado; nenhum identificador aparece na saída; e as quatro formas de coluna ausente (filtro simples, `and`/`or` de três níveis, `group_by`, `select`) levantam exceção. |
| `test_seguranca.py` | 15 | Assinatura ausente, forjada, feita com outro segredo, e corpo adulterado depois de assinado. Payload velho e payload do futuro. Coluna fora da permissão, e cargo sem nenhuma coluna. |
| `test_endpoint.py` | 9 | A cadeia inteira sem rede: caminho feliz com supressão, 401 sem assinatura, 401 com segredo errado, 401 expirado, card proibido **sem gerar leitura no Google**, um card barrado não derruba os outros, seis cards fazem uma leitura só, e a quinta barreira pegando um plano que mente sobre o que usa. |

Os testes têm marcadores: `pytest -m invariante` roda só as garantias de
privacidade, `pytest -m regressao` roda só as provas de que um comportamento
quebrado não voltou.

**Por que isso importa mais do que cobertura em geral:** enquanto esses testes
estiverem verdes, a frase "os dados do cliente não vão para a IA" é uma
propriedade verificável do sistema. Se um deles ficar vermelho, ela volta a ser
uma frase de apresentação. Não conserte o teste; conserte o código.

---

## 6. O que ainda não está pronto

Ser preciso aqui importa mais do que parecer completo.

**O que está pronto:** todo o código do serviço, testado.

**O que não está:**

1. **Nada foi implantado.** Não existe conta AWS provisionada, repositório ECR,
   função Lambda, parâmetro no SSM, nem role de OIDC. O workflow do GitHub
   Actions está escrito e nunca rodou.
2. **A Edge Function não existe.** Ela é quem valida o JWT do usuário, consulta
   o RLS, extrai as colunas do plano e assina o payload. Sem ela, este serviço
   não tem quem o chame legitimamente. É a tarefa T10 do plano.
3. **O chat continua usando o mock.** `PlumChat.tsx:144` não foi tocado, porque
   aquele arquivo tem outro dono. Ligar o chat ao executor real é conversa de
   time, não mudança técnica.
4. **`google_sheet_id` continua vazio no banco.** O onboarding grava
   `google_sheet_url`; este serviço espera o ID. A tarefa T9 resolve, e também
   depende de outro dono.

---

# Resumo estruturado

## Nome da task: T2 + T2b — Falha alta em coluna ausente

**1. O que foi feito**
`_eval_single` e o caminho de agrupamento do `pandas_executor.py` deixaram de
ignorar coluna inexistente em silêncio e passaram a levantar
`MissingColumnError`. O `print` virou `logger.error`.

**2. Decisão técnica**
Escolhi falhar alto em vez de registrar e continuar. Um card quebrado é visível
e se conserta em minutos; um card que mostra o total histórico com o rótulo
"julho" pode durar meses e contamina a confiança em todos os outros cards.
Descartei duas alternativas: (a) uma flag `strict=True` só para o dashboard,
que deixaria o bug vivo no chat; (b) devolver o resultado com um campo
`warnings`, que continuaria exibindo o número errado.

**3. Integrações tocadas**
`query_engine/pandas_executor.py`. Nenhum endpoint ou schema.

**4. Safeguard**
O bug: `return pd.Series([True] * len(df))` transformava "coluna do filtro não
existe" em "não há filtro", devolvendo a agregação sobre a tabela inteira. A
mesma classe existia no agrupamento, onde `group_by` inválido era descartado e
a consulta virava um total único. Agora as duas rotas levantam exceção, e há
quatro testes de regressão cobrindo filtro simples, `and`/`or` aninhado em três
níveis, `group_by` e `select`.

**5. Como validar**
```bash
cd query_engine && python -m pytest -m regressao
```
Devem passar 4 testes. Para ver falhar de propósito, troque o `raise` por um
`return pd.Series([True] * len(df))` e rode de novo.

**6. Lacunas e pendências**
[LACUNA: o chat vai passar a receber exceção onde antes recebia número — o dono
de `src/pages/PlumChat.tsx` precisa tratar o erro na conversa — D.O.D.: uma
pergunta com coluna inexistente gera mensagem compreensível, sem tela quebrada
e sem número inventado.]

---

## Nome da task: T3 — Papéis de coluna vindos do payload

**1. O que foi feito**
Removi as constantes globais `_PCT_COLS` e `_STRING_COLS` (ambas vazias, com um
`#definir` que nunca foi preenchido) e criei o parâmetro `column_roles`, mais a
função `roles_from_formatting_rules` que deriva os papéis da `cleaning_rule` que
já existe no `schema_metadata`.

**2. Decisão técnica**
Constante global de nome de coluna não funciona em produto multiempresa: cada
cliente nomeia as colunas do jeito dele. Passar o papel no payload mantém o
executor sem conhecimento global, que é o padrão de Motorista Cego do PRD.
Descartei a heurística por nome de coluna (regex procurando "percent", "pct",
"taxa"), que erra em silêncio quando o cliente chama a coluna de "conversão", e
descartei instruir o Agente A por prompt, que dependeria de o modelo obedecer e
tiraria do executor determinístico o papel de rede de segurança.

**3. Integrações tocadas**
`query_engine/pandas_executor.py` (assinatura de `execute_plan` e
`execute_plan_with_formatting`). A Edge Function precisará enviar
`column_roles` derivado de `datasets.schema_metadata`.

**4. Safeguard**
N/A — não era bug de comportamento, era proteção que nunca chegou a funcionar.

**5. Como validar**
```bash
cd query_engine && python -m pytest tests/test_privacidade.py -k percentual
```
Uma base de 12 linhas com 10,0 em cada: com o papel `percent` declarado, a soma
vira média e o resultado é 10,0; sem papel declarado, o resultado é 120,0,
porque o executor obedece o plano e não adivinha.

**6. Lacunas e pendências**
[LACUNA: `schema_metadata` não tem um campo de papel semântico explícito, então
a derivação é por texto da `cleaning_rule` — o dono do onboarding
(`DatabasePipeline.tsx`) resolve com a tarefa T16 — D.O.D.:
`schema_metadata.columns[x].role` gravado como enum na criação do dataset, e
`roles_from_formatting_rules` vira fallback para bases antigas.]

---

## Nome da task: T4 + T4b — k-anonimato e bloqueio de linha bruta

**1. O que foi feito**
Todo grupo do resultado com menos de `k_min` linhas de origem é suprimido antes
do vetor sair, e a contagem volta em `suppressed_groups`. Planos sem nenhuma
agregação passaram a ser recusados com `RawRowsBlocked`.

**2. Decisão técnica**
`k_min = 5` como padrão, configurável por organização, aplicado dentro do
executor e não na camada acima. Colocar no executor faz o chat herdar a
proteção de graça no dia em que ele for ligado ao motor real, e garante que não
existe caminho que passe por fora. Descartei privacidade diferencial: ela
resolve também o ataque por diferença entre duas consultas, mas adiciona ruído
calibrado ao resultado, o que colide frontalmente com a promessa de "precisão
matemática de 100%" do PRD, e é desproporcional ao estágio do produto.

**3. Integrações tocadas**
`query_engine/pandas_executor.py`. O retorno ganhou a chave
`suppressed_groups`, que a interface precisa consumir para explicar o buraco na
tela.

**4. Safeguard**
O bug conceitual: "agregado" estava sendo tratado como sinônimo de "anônimo".
`SUM(salario) GROUP BY funcionario` numa base com uma linha por pessoa devolve a
folha de pagamento vestida de agregado, e esse vetor iria direto para o Agente
C, que é um modelo de linguagem. Além disso, um `select` sem agregação devolvia
`df[colunas].head(limit)`, ou seja, linhas cruas. Cinco testes marcados
`invariante` cobrem os dois casos, incluindo um que varre a saída procurando
qualquer identificador da base de origem.

**5. Como validar**
```bash
cd query_engine && python -m pytest -m invariante
```
Devem passar 8 testes. O mais direto de ler é
`test_p3_agregado_unico_sobre_base_pequena_e_suprimido`: dois diretores, soma de
salário, resultado vazio com `suppressed_groups: 1`.

**6. Lacunas e pendências**
[LACUNA: `k_min` ainda não é configurável por organização no banco, só por
variável de ambiente do serviço — quem implementar a tarefa T8 (migration)
resolve — D.O.D.: coluna de configuração por organização, lida pela Edge
Function e enviada no payload assinado.]
[LACUNA: ataque de diferenciação (rodar duas consultas com filtros levemente
diferentes e subtrair) continua possível — registrado no item 5 do `TODOS.md` —
D.O.D.: revisitar quando entrar cliente de setor regulado, saúde, financeiro
ou RH.]

---

## Nome da task: T5 — Teto de linhas antes do parse

**1. O que foi feito**
O tamanho da base é verificado contra `max_rows` antes de qualquer
processamento, tanto em `execute_plan` quanto em `sheets.load_columns`, e o erro
nomeia o tamanho encontrado e o limite.

**2. Decisão técnica**
Em `sheets.py` o teto vem dos **metadados** da planilha (`rowCount`), que é uma
resposta minúscula, e não do conteúdo. Falhar com erro nomeado em vez de
paginar foi escolha deliberada: se um cliente tem 400 mil linhas, ele precisa
saber que o PLUM ainda não é a ferramenta certa para aquela base, e o time
precisa saber que existe demanda por base grande. Paginar esconderia as duas
informações. Descartei streaming com agregação incremental, que resolve de
verdade mas reescreve o núcleo do executor e não é trivial para mediana e
percentil; ficou registrado no item 2 do `TODOS.md`.

**3. Integrações tocadas**
`query_engine/pandas_executor.py` e `query_engine/sheets.py`.

**4. Safeguard**
O bug: `df_out.head(limit)` roda depois da agregação, então o `limit` do plano
nunca protegeu a entrada. Uma planilha grande entrava inteira em memória e
matava o container antes de chegar no corte, derrubando junto os cards de todos
os outros clientes que estivessem naquele container.

**5. Como validar**
```bash
cd query_engine && python -m pytest tests/test_privacidade.py -k teto
```
Base de 1000 linhas com `max_rows=500` levanta `RowLimitExceeded`, e a mensagem
contém os dois números.

**6. Lacunas e pendências**
[LACUNA: `max_rows` está em variável de ambiente do serviço, não por
organização — mesma migration da tarefa T8 — D.O.D.: limite por organização
lido pela Edge Function e enviado no payload.]

---

## Nome da task: T6 — Camada de segurança do serviço

**1. O que foi feito**
`security.py` com verificação de HMAC-SHA256 em tempo constante sobre o corpo
cru, janela de frescor de dois minutos nos dois sentidos, e comparação de
conjunto `resolved_columns ⊆ allowed_columns`. `config.py` lê os segredos do
SSM Parameter Store sem que eles toquem o repositório, a imagem ou variável de
ambiente.

**2. Decisão técnica**
Defesa em profundidade com segredos independentes: a credencial IAM da AWS
protege o endpoint, e um segredo separado assina o payload, então vazar um não
basta para explorar o outro. O `sheet_id` vive **dentro** do payload assinado,
o que impede quem chama de escolher qual planilha ler. A verificação de coluna
é comparação de conjunto e não interpretação do plano: dois interpretadores em
duas linguagens divergiriam em aninhamento profundo, e quando duas travas
discordam quem passa é a mais frouxa. Descartei header com token compartilhado
como única proteção (se o token vazar, o atacante escolhe qualquer planilha) e
descartei IAM sozinho (não protege contra bug na própria Edge Function).

**3. Integrações tocadas**
Contrato novo entre a Edge Function e o serviço: `POST /execute` com header
`X-Plum-Signature` e corpo `ExecutionPayload` (`sheet_id`, `tab`, `plans[]`,
`allowed_columns`, `column_roles`, `k_min`, `max_rows`, `issued_at`). Dois
parâmetros novos no SSM: `/plum/prod/google-sa-json` e `/plum/prod/hmac-secret`.

**4. Safeguard**
N/A — é código novo, não correção. Mas ele fecha um risco que estava aberto no
desenho: a service account `plum-polijunior@plataforma-plum.iam.gserviceaccount.com` tem leitura
na planilha de todos os clientes, e o design original não dizia como o serviço
autenticaria quem o chama.

**5. Como validar**
```bash
cd query_engine && python -m pytest tests/test_seguranca.py tests/test_endpoint.py
```
24 testes. O mais ilustrativo é
`test_corpo_alterado_invalida_a_assinatura`: assina um payload, troca o
`sheet_id` para o de outra empresa, e a verificação recusa.

**6. Lacunas e pendências**
[LACUNA: a barreira ① (SigV4 com auth `AWS_IAM` no Function URL) é
configuração de infraestrutura e ainda não existe — quem provisionar a AWS
resolve — D.O.D.: `aws lambda get-function-url-config` retorna
`AuthType: AWS_IAM`, e um `curl` sem assinatura recebe 403 da própria AWS.]
[LACUNA: a Edge Function precisa assinar com SigV4 a partir do Deno — quem
implementar a tarefa T10 resolve — D.O.D.: uma chamada real do Supabase chega
ao Lambda e volta com resultado.]

---

## Nome da task: T7 — Cliente do Google Sheets em lote

**1. O que foi feito**
`sheets.py` lê cabeçalho e número de linhas numa chamada, e as colunas de todos
os cards do dataset num único `batchGet`. Erros do Google são traduzidos para
frases que a pessoa final entende.

**2. Decisão técnica**
Agrupar as leituras resolve a cota de 60 requisições por minuto na origem, em
vez de adiar o problema com cache. Seis cards do mesmo dataset passam de seis
viagens ao Google para uma. `spreadsheets.get` com `includeGridData` limitado à
primeira linha devolve o `rowCount` e o cabeçalho juntos, então a checagem de
tamanho custa uma chamada, não duas. O cache de metadados guarda só nome de
coluna e contagem de linhas: nenhum dado de cliente. Descartei o cache de
coluna com TTL que o PRD do chat previa: ele reduz muito no uso repetido, mas
mantém N chamadas no primeiro carregamento do dia, que é exatamente o pior
momento. Ficou registrado no item 1 do `TODOS.md`.

**3. Integrações tocadas**
API do Google Sheets v4: `spreadsheets.get` e `spreadsheets.values.batchGet`,
ambos somente leitura. Escopo `spreadsheets.readonly`. O PLUM não escreve na
planilha do cliente.

**4. Safeguard**
N/A — código novo.

**5. Como validar**
```bash
cd query_engine && python -m pytest tests/test_endpoint.py -k uma_leitura
```
Seis cards do mesmo dataset produzem exatamente uma chamada de leitura. O teste
conta as invocações com um dublê no lugar do Google.

**6. Lacunas e pendências**
[LACUNA: nunca foi executado contra o Google de verdade, só contra dublê —
quem provisionar a AWS e o SSM resolve — D.O.D.: um `POST /execute` assinado
contra uma planilha real de teste devolve o mesmo número conferido à mão.]
[LACUNA: o serviço espera `datasets.google_sheet_id`, que está vazio no banco
porque o onboarding grava `google_sheet_url` — tarefa T9, dono do onboarding —
D.O.D.: todo dataset com `status='active'` tem `google_sheet_id` não nulo.]

---

## Nome da task: T1 — Serviço FastAPI e imagem para Lambda

**1. O que foi feito**
`main.py` com `POST /execute` (lote por dataset, resposta por card) e
`GET /health`; `lambda_handler.py` com o adaptador Mangum; `Dockerfile` sobre a
imagem oficial do Lambda para Python 3.12; `requirements.txt`.

**2. Decisão técnica**
AWS Lambda com imagem de container, escolhido contra ECS Fargate (custo fixo do
balanceador antes da primeira requisição), App Runner (instância provisionada
ociosa) e EC2 (passivo de patch de sistema operacional numa equipe com
rotatividade). O contra do Lambda é o cold start com pandas, neutralizado por
duas decisões anteriores: o endpoint em lote faz uma invocação por dashboard em
vez de seis, e a degradação prevista serve o resultado anterior com selo de
idade quando estoura o tempo. A resposta é por card, e não por lote, para que um
card com problema não apague o dashboard inteiro.

**3. Integrações tocadas**
Endpoints novos: `POST /execute` e `GET /health`. Nenhum schema de banco.
Infraestrutura nova a provisionar: ECR, função Lambda, Function URL com auth
`AWS_IAM`, dois parâmetros no SSM, role de execução e role de deploy por OIDC.

**4. Safeguard**
N/A — código novo.

**5. Como validar**
Localmente, sem AWS e sem Google:
```bash
cd query_engine && python -m pytest tests/test_endpoint.py
```
Depois do deploy:
```bash
aws lambda invoke --function-name plum-query-engine \
  --payload '{"version":"2.0","rawPath":"/health","requestContext":{"http":{"method":"GET","path":"/health"}},"headers":{}}' \
  --cli-binary-format raw-in-base64-out /tmp/r.json && cat /tmp/r.json
```

**6. Lacunas e pendências**
[LACUNA: nenhuma infraestrutura AWS existe — quem tiver acesso à conta resolve
— D.O.D.: ECR criado, Lambda respondendo `/health`, Function URL com
`AuthType: AWS_IAM`, os dois parâmetros no SSM como SecureString, e a role de
OIDC com política de confiança restrita a este repositório e a esta branch.]
[LACUNA: região `sa-east-1` está fixa no workflow por suposição de menor
latência — quem provisionar confirma — D.O.D.: região escolhida e refletida no
workflow.]
[LACUNA: sem observabilidade além do log padrão — sem dono definido — D.O.D.:
alarme no CloudWatch para taxa de erro e para duração no percentil 95.]

---

## Nome da task: T11 + T12 — Infraestrutura de teste e invariantes

**1. O que foi feito**
`pytest.ini` com marcadores `invariante` e `regressao`, e 41 testes divididos em
três arquivos. O repositório não tinha framework de teste nenhum antes desta
fase.

**2. Decisão técnica**
Comecei pela fronteira de segurança em vez de perseguir cobertura ampla, porque
os invariantes críticos (comparação de conjunto, k-anonimato, bloqueio de linha
bruta, verificação de assinatura) são funções puras que não precisam de banco
nem de rede, e são exatamente os que não podem quebrar. Testes de ponta a ponta
com navegador e a avaliação de qualidade do Agente A ficaram deferidos, e estão
mapeados no plano de teste. Descartei testar só o executor: a camada de
segurança é onde mora o risco de vazamento entre empresas.

**3. Integrações tocadas**
N/A — apenas arquivos de teste e configuração.

**4. Safeguard**
Indireto, e é o mais importante do documento: enquanto os testes marcados
`invariante` estiverem verdes, a afirmação "os dados do cliente não vão para a
IA" é uma propriedade verificável do sistema. Se um deles ficar vermelho, ela
volta a ser uma frase de apresentação. O workflow do GitHub Actions roda a
suíte em todo pull request, então uma regressão não entra na branch.

**5. Como validar**
```bash
cd query_engine && python -m pytest          # 41 passando
cd query_engine && python -m pytest -m invariante   # só as garantias de privacidade
cd query_engine && python -m pytest -m regressao    # só as provas anti-recaída
```

**6. Lacunas e pendências**
[LACUNA: o lado TypeScript não tem teste nenhum — vitest ainda não foi
instalado, e a extração recursiva de colunas da Edge Function é a peça mais
crítica sem cobertura — quem implementar a tarefa T10 resolve — D.O.D.: vitest
configurado, script `test` no `package.json`, e seis casos cobrindo coluna
proibida em cada posição possível do plano (`select`, `where` aninhado,
`group_by`, `order_by`, `target_columns`).]
[LACUNA: os testes de ponta a ponta com navegador e a avaliação do Agente A
seguem deferidos — itens 3 e 4 do `TODOS.md` — D.O.D.: os seis fluxos mapeados
no plano de teste rodando em CI.]
