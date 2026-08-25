---
status: vigente
camada: ambos
atualizado_em: 2026-08-25
---

# Incidentes e lições

> **O que este arquivo é:** o que já deu errado e qual regra nasceu disso. Formato fixo:
> **incidente → causa → regra**.
> **O que este arquivo NÃO é:** narrativa de investigação (os documentos que a continham foram
> apagados em 2026-08-14 — o que sobrou é a regra), nem lista de bugs abertos (é `20-pendencias.md`).
>
> ⭐ **Por que ele existe:** quase toda regra estranha do `CLAUDE.md` é cicatriz. Sem a cicatriz
> registrada, a regra parece burocracia e alguém a remove.

---

## I-01 · 2026-07-22 · Escalonamento de privilégio no cadastro (OWASP A01)

**O que aconteceu:** o trigger `handle_new_user()` lia `organization_id` e `status` de
`raw_user_meta_data` — campo **controlado pelo cliente**. Qualquer pessoa entrava em qualquer
organização já como membro **ativo**, sem aprovação de ninguém.

**Causa raiz:** confundir *segredo portador digitado* com *declaração de identidade*. O trigger
tratou como fato algo que era apenas afirmação do cliente.

**Regras que nasceram** (todas em `CLAUDE.md` §4, e é por isso que elas existem):

1. Nada é decidido a partir de `raw_user_meta_data`. Aceita-se `join_code`; nunca
   `organization_id`, `status` ou `role_id`.
2. `status` é sempre decisão do servidor — `pendente` em todo cadastro.
3. Escopo de tenant sempre por `organization_id = public.current_org_id()`, nunca subquery direta
   em `profiles` dentro de policy (causa recursão de RLS).
4. Toda policy de leitura checa **status**, não só organização (`is_active_member()`).
5. **Nenhuma policy de UPDATE em `profiles` alcança o próprio registro** (`id <> auth.uid()`).
6. Toda função `SECURITY DEFINER` tem `SET search_path = …, pg_temp`, com `pg_temp`
   obrigatoriamente **por último** — senão dá sequestro via `pg_temp.profiles`.
7. `organizations` nunca em SELECT público.
8. Fail-closed: claim ausente **nega**.

⭐ **A lição transferível:** o erro não foi de validação, foi de **categoria**. Antes de validar um
campo, pergunte se ele deveria existir naquele lugar.

⚠️ **A narrativa completa (o post-mortem) foi apagada em 2026-08-14.** O que resta é o resumo acima
e as oito regras — que é o que importa. Detalhe forense: `git log`.

---

## I-02 · 2026-08-11 · O Agente C multiplicou dois números e chamou de faturamento

**O que aconteceu:** o Agente C recebeu `{unidades: 1.480, preco_medio: 57,50}` e respondeu
"faturamento de R$ 85.100,00". Multiplicou os dois no texto.

**Por que o número está errado:** `soma(qtd) × média(preço)` não é receita. Só coincide quando todo
item custa o mesmo — na base real os preços iam de R$ 2,50 a R$ 90,00.

**Causa raiz:** R-02 ("a IA planeja, o código executa") protegia o *planejamento*, não o
*sintetizador*. O Agente C tinha dois números certos na mão e a conta parecia óbvia.

**Regra que nasceu — R-13:** **só o Python multiplica.** Nenhum agente sintetizador faz conta, nem
quando os dois números estão no resultado e a operação parece trivial. Se falta um número, a
resposta diz que falta.

⭐ **A lição transferível, e ela vale para todo o remake:** garantia de determinismo tem de cobrir
**cada** etapa em que um número pode ser produzido, não só a principal. Quando o arquiteto passar
a compor 6 bindings em vez de 2, a superfície desse erro cresce — ver `30-decisoes.md` D-037.

---

## I-03 · 2026-08-10 a 2026-08-12 · O deploy de Edge Function que ninguém entende

**O que aconteceu, em três correções sucessivas:**

1. Acreditava-se que a integração nativa GitHub↔Supabase publicava a cada push. **Não publica:**
   as 5 funções tinham `updated_at` idêntico e não se moveram depois de três merges que mudaram
   `supabase/functions/**`.
2. Concluiu-se então que o check "Supabase Preview" reportava `success` sem publicar nada.
   **Também errado.**
3. Medição de 2026-08-12: no push de `e203320` o check rodou `18:38:17Z → 18:38:22Z` e
   `dashboard-execute` e `dashboard-agent` ficaram com `updated_at` **exatamente** `18:38:22Z`. Já
   `ai-plum-chat`, cujo `index.ts` era o **único** que aquele push mudava, **não foi tocada** — só
   subiu num `functions deploy` manual, 49 min depois.

**Estado atual do conhecimento:** o check é um **publicador de cobertura desconhecida**. Não se
sabe o critério de seleção dele.

**Regras que nasceram:**

- Publique **à mão** a função que você mexeu:
  `npx supabase functions deploy <nome> --project-ref rjwidarrsykufuifzunu`.
- **Confirme que subiu:** `ezbr_sha256` tem de mudar. `version` sobe sozinho em mudança de secret,
  sem código novo — **não serve de prova**.
- ⚠️ Vale o inverso também: uma função que você **não** mexeu pode ter sido republicada pelo push
  de outra pessoa. Divergência entre `_shared/*` empacotado em consumidores diferentes pode
  aparecer sem ninguém ter feito deploy.
- `_shared/` é empacotado **por função**, não compartilhado em runtime. `query_plan.ts` →
  `ai-plum-chat` + `dashboard-execute` + `dashboard-agent`. Publicar um só deixa cópias
  divergentes do interpretador de RBAC em produção.

⭐ **A lição transferível:** o código no repositório **não é** o que está rodando. Antes de depurar
comportamento de Edge Function, confirme a versão implantada — senão você analisa linhas que
produção nunca executou.

**Consequência que durou oito dias:** a exceção deliberada de `ai-plum-chat` — `30-decisoes.md`
D-028, encerrada em 2026-08-20.

⚠️ **Um número deste relato não bate com a medição de 2026-08-20.** Acima está registrado que as
funções ficaram com `updated_at` `18:38:22Z`; a Management API diz `2026-08-12 15:51:31.617 UTC`, e
`updated_at` só anda para a frente. O **fenômeno** está confirmado — cinco funções com o mesmo
carimbo até o milissegundo, o que nenhum deploy manual produz —, mas o relógio anotado veio de outra
fonte que não a API. Quem revisitar isto, corrija a partir da medição, não daqui.

---

## I-04 · 2026-08-11 · O `gid` da aba era jogado fora na escrita

**O que aconteceu:** `extrairSheetId` descartava o `gid` da URL colada pelo usuário. O banco
guardava só o nome da aba, e o executor lia a aba errada quando o nome divergia.

**Causa raiz — e é um padrão, não um caso isolado:** ⭐ **o caminho de escrita descartava
informação que o caminho de leitura precisava.** O mesmo padrão acontece de novo hoje: o mapa
`cabeçalho original → nome normalizado` vive em `datasets.sketch`, e `sketch` vira `NULL` quando a
base fica ativa. É por isso que a normalização precisa ser **recalculada** no executor em vez de
consultada.

**Regras que nasceram:** `extrairSheetRef` devolve `id` **e** `gid`; `gid` tem precedência sobre o
nome; `gid` inexistente é erro, nunca fallback.

⚠️ **E a armadilha adjacente:** `gid = 0` é a primeira aba, um valor legítimo. `if (!gid)` /
`if not gid` manda a primeira aba de toda planilha para o caminho errado. Compare com
`null`/`None`.

---

## I-05 · 2026-08-11 · `walkArithmetic` autorizava plano sem olhar os operandos

**O que aconteceu:** quando a expressão aritmética foi liberada em agregações
(`{"agg":"sum","col":{"op":"mul","args":["qtd","preco"]}}`), `addCol` descartava o que não era
string. Um nó de expressão não contribuía com **coluna nenhuma** — e o plano era autorizado sem
ninguém olhar os operandos. Bypass de RBAC de coluna.

**Regra que nasceu:** **toda coluna dentro de uma expressão passa pelo RBAC.** `extractColumns`
tem de andar recursivamente por qualquer estrutura nova que possa conter nome de coluna.

⭐ **A lição transferível, e é a mais importante para o remake:** **cada forma nova na gramática do
Query Plan é um lugar novo onde uma coluna pode se esconder do RBAC.** Isso vale para `overrides`,
para `pedidos[]`, para `vocabulario.col` e para qualquer campo que o remake acrescentar. A pergunta
de revisão é sempre: *essa forma nova pode conter um nome de coluna que `extractColumns` não
alcança?*

---

## I-06 · 2026-08-12 · A classe de tema escuro vazava para a landing após logout

**O que aconteceu:** o usuário ligava o tema escuro no produto, saía da conta, e a landing page e
o `/auth` apareciam escuros.

**Causa raiz:** o `useEffect` de `use-tema.ts` aplicava a classe `tema-escuro` em
`document.documentElement` — o `<html>`, **nó único para a SPA inteira** — e não tinha limpeza.
Logout desmontava o `DashboardLayout` mas não tocava o `<html>`. Landing, `/auth` e 404 não têm
opinião própria sobre tema, então herdavam a paleta por cascata.

**Correção:** `return () => classList.remove(...)` no próprio efeito (fecha o caso normal, porque o
hook só desmonta ao sair do produto) **e** um efeito defensivo idêntico em `Index.tsx`,
`Auth.tsx` e `NotFound.tsx` (fecha o resto).

⭐ **A lição transferível:** efeito que escreve em nó global precisa de limpeza, e a suposição
"o componente sempre desmonta antes de a outra tela aparecer" é falsa numa SPA.

---

## I-07 · 2026-08-08 · O 403 que tinha duas causas diferentes

**O que aconteceu:** `execute_plan` no chat retornava 403 "base nao encontrada". Corrigido — e
apareceu um 403 **diferente**, agora de `aws4fetch` → Function URL do Lambda.

**Causa raiz do segundo:** uma Function URL com `AuthType=AWS_IAM` exige **três** coisas, não uma:
`lambda:InvokeFunctionUrl` **e** `lambda:InvokeFunction` na policy de identidade de
`plum-edge-invoker`, **e** uma resource-based policy no próprio Lambda
(`aws lambda add-permission`).

**Regra que nasceu:** `infra/aws/provision.sh` e `infra/aws/valores-supabase.sh` incluem os três
passos. A fonte única de verdade de como subir o executor é `infra/aws/PASSO-A-PASSO.md` — não
duplicar em outro lugar.

⭐ **A lição transferível:** mesmo código de erro, causa diferente. Corrigir a primeira causa e ver
o erro persistir não significa que a correção falhou.

---

## I-08 · 2026-08-11 · A base que não abria — e o pipeline que nunca lê a planilha

**O que aconteceu:** aba errada, planilha não compartilhada com a service account, cabeçalho
divergente e coluna sem título **não apareceram na hora de conectar a base**. Apareceram dias
depois, no chat, como erro.

**Causa raiz:** ⭐ **o pipeline de importação nunca lê a planilha.** As 5 etapas leem o **arquivo**
no navegador (`FileReader`); o Google Sheets só é lido na primeira pergunta ou no primeiro card.

**Estado:** ✅ **corrigido pelo B12/B13, em 2026-08-25** — e não pelo passo de verificação que este
incidente propunha. A saída foi mais radical: em vez de conferir o arquivo contra a planilha no
fim, o arquivo **deixou de existir**. A planilha é a fonte desde a etapa 0, então não há mais duas
versões da verdade para divergirem, e os quatro sintomas aparecem na hora de conectar —
`cabecalhos_da_planilha` devolve `colisoes` e `colunas_sem_titulo`, e a etapa 1 trava.

⚠️ **A causa raiz acima está preservada de propósito, mas não descreve mais o produto.** "O
pipeline nunca lê a planilha" foi verdade até o B13 e é falso hoje; ver a linha invertida em
`03-erros-comuns.md`.

⭐ **A lição que sobrevive** é a que vale para a próxima vez: quando o caminho de escrita e o de
leitura têm **fontes diferentes**, nenhuma validação no meio fecha a divergência — só unificar a
fonte fecha. É o mesmo padrão que o `gid` descartado (I-04).

⭐ **Onde isso resolve sozinho:** a checagem de `requisitos` do catálogo de padrões (ver
`21-melhorias-do-plum-vendido.md`) força uma leitura real no fim do onboarding — o problema morre
como efeito colateral.

---

## I-09 · 2026-08-21 · O executor caiu porque o Dockerfile listava arquivo por arquivo

**O que aconteceu:** um push publicou o Lambda sem um módulo novo (`query_engine/metadados.py`, do
B03 do remake). A função subiu e todo pedido morreu em
`Runtime.ImportModuleError: cannot import name 'metadados' from 'query_engine'`. Executor fora do ar
até o push seguinte.

**Causa raiz:** ⭐ **o `Dockerfile` enumerava os módulos um a um** (`COPY sheets.py`,
`COPY main.py`, …) e ninguém acrescentou a linha do arquivo novo. Nada avisava: `main.py` importava
o módulo, o arquivo existia no disco, e **os testes rodam contra o repositório, não contra a
imagem** — `npm run test:py` local e o pytest do CI passaram os dois.

⚠️ **O que transformou o erro em queda:** o `query-engine.yml` roda `aws lambda
update-function-code` **antes** do passo *"Conferir que a função responde"*. A imagem quebrada
substitui a boa e só depois o smoke test avisa — **não existe janela em que o deploy seja verificado
antes de valer**.

**Correção:** `COPY *.py`, que elimina a classe inteira. `tests/` não entra porque `COPY` com glob
não é recursivo.

**Estado:** o Dockerfile está corrigido. ⚠️ **A ordem do workflow continua como está** — inverter
exige publicar versão, testar e promover alias, que é mudança de infraestrutura. Registrado em
`20-pendencias.md`.

⭐ **A lição, e ela é mais geral que o Docker:** *um teste que roda contra o repositório não diz nada
sobre o artefato publicado.* Vale igual para o `_shared/` das Edge Functions, que é empacotado por
função — o `npm test` passa com o código certo enquanto uma função no ar carrega outro.

**É o I-03 por um mecanismo novo:** o que está no repositório não é o que está rodando. Da primeira
vez foi o deploy que não aconteceu; desta, o deploy aconteceu com menos código do que o repositório
tinha.

---

## I-10 · 2026-08-21 · O teste que passava por sorte, e o lixo de memória do pandas

**O que aconteceu:** o CI reprovou `test_periodo.py::test_gabarito_semanal_da_base_de_vendas` com
`FloatingPointError: overflow encountered in multiply`, bloqueando o deploy do executor. O mesmo
teste passava na máquina de quem investigou — **com a mesma pandas 2.2.3 e a mesma numpy 2.2.1**.

**Causa raiz:** ⭐ o `cast_from_unit_vectorized` do pandas aloca o vetor de frações com `np.empty` e
roda `np.round(..., 13)` sobre ele **inteiro** — inclusive nas posições que correspondem a `NaN`,
onde há **lixo de memória** e não zero. O traceback do CI mostrava `-1.77e+307` e `1.40e-321` num
vetor que deveria ser todo NaN; `np.round` multiplica por 10¹³ e aquilo estoura.

O `_fmt_data` entregava a coluna inteira ao `to_datetime(..., unit="D")` — e numa coluna de datas
**textuais** o vetor numérico é 100% NaN, ou seja, 100% lixo.

**Correção:** só o subconjunto numérico válido entra na conversão. Sem NaN na entrada, a fatia não
inicializada deixa de existir.

⭐ **A lição, e ela não é sobre pandas:** *"passa aqui e falha lá" nem sempre é ambiente.* A
investigação começou procurando diferença de plataforma e de versão — e não havia nenhuma. Era
**sorte**. Antes de atribuir uma falha a ambiente, vale perguntar se o teste depende de algo não
determinístico; um teste que lê memória não inicializada falha em qualquer lugar, eventualmente.

⚠️ **E um erro de método que custou tempo:** foram levantadas duas hipóteses (RLS/policy e diferença
Linux×Windows) antes de pedir o **traceback**, que resolveu em um minuto. Mensagem de erro sem stack
não identifica causa — e pedir o stack é mais barato que qualquer teoria.

**De brinde, o teto errado:** o primeiro corte de faixa usou 2.958.465 (o limite do Excel). Um teste
de regressão o derrubou na hora: `datetime64[ns]` conta nanossegundos num int64 desde 1970 e acaba
em **2262-04-11**, serial 132.320.

---

## Padrões que aparecem em mais de um incidente

⭐ Vale ler esta seção antes de qualquer alteração grande. São os erros que este time comete mais
de uma vez:

| Padrão | Incidentes | Pergunta de revisão |
|---|---|---|
| **Confundir afirmação do cliente com fato** | I-01 | esse dado é um segredo digitado, ou uma declaração de identidade? |
| **Forma nova esconde coluna do RBAC** | I-05 | `extractColumns` alcança essa estrutura? |
| **Escrita descarta o que a leitura precisa** | I-04 | essa informação vai ser necessária depois? onde ela persiste? |
| **Garantia que cobre uma etapa só** | I-02 | em quantos lugares um número pode ser produzido? |
| **O que está no repo ≠ o que está rodando** | I-03, I-09 | qual é a versão implantada? |
| ⭐ **Teste que roda contra o repositório, não contra o artefato** | I-09 | esse teste passaria se o build tivesse esquecido um arquivo? |
| ⭐ **"Passa aqui e falha lá" atribuído a ambiente** | I-10 | é ambiente mesmo, ou o teste depende de algo não determinístico? |
| ⚠️ **Teoria antes do stack trace** | I-10 | eu tenho o traceback, ou só a mensagem? |
| **Erro só aparece longe da causa** | I-08, I-03 | esse erro tinha como aparecer antes, com alguém olhando a tela? |
| **Falsy usado onde zero é legítimo** | I-04 | `0` é um valor válido aqui? |

---

## I-11 · 2026-08-25 · ⭐⭐ Nada neste repositório typechecava — e um `ReferenceError` chegou à tela

**O que aconteceu:** o passo 2 do cadastro morreu com `setFormattedDataSamples is not defined` na
primeira resposta do Agente 3. `setFormattedDataSamples`, `setFormattingRules`,
`setSemanticDefinitions`, `formatQuery` e `isFormatRefining` eram usados em **20 lugares** de
`DatabasePipeline.tsx` e declarados em **nenhum**.

**Causa imediata:** as cinco linhas de `useState` ficavam encostadas no fim do handler do
`FileReader`. O B13 removeu o upload de arquivo e levou-as de carona, sem tocar em nenhum dos usos.

**⭐ Causa raiz, e é ela que importa: os três comandos de verificação do projeto são cegos para
isso.**

| comando | o que se acreditava | o que ele faz |
|---|---|---|
| `npm run build` | "typecheck + build" (CLAUDE.md §1) | é `vite build`. **esbuild só REMOVE tipos**, não os checa |
| `npx tsc --noEmit` | "só tipagem" (CLAUDE.md §1) | checa **ZERO arquivos**: o `tsconfig.json` da raiz tem `"files": []` e só *references* |
| `npm test` | vitest | cobre módulos puros; nenhum componente de React |

⇒ Eu rodei `npm run build` e `npm test` depois de **cada** alteração daquela sessão e reportei
"verde" três vezes. Os dois passavam com 40 identificadores inexistentes no arquivo.

**E havia mais escondido atrás disso.** Na primeira vez que alguém rodou `deno check` no
`ai-plum-chat`, apareceram **19 erros** — 18 pré-existentes. O maior grupo: `EtapaLog` listava só as
quatro etapas do caminho legado, enquanto o código gravava `porteiro`, `reconhecedor`, `planejador`,
`interprete` e `executor` desde o B06.

**As regras:**

1. ⭐ **Os comandos que enxergam são `npx tsc -p tsconfig.app.json --noEmit` (para `src/`) e
   `deno check <arquivo>` (para `supabase/functions/`).** Nenhum dos dois está no CI.
2. ⛔ **"O build passou" não é evidência de nada neste repositório.** Antes de dizer isso, confira o
   que o comando faz — o `package.json`, não a documentação.
3. ⚠️ **`tsconfig.json` com `"files": []` e só *references* não checa nada sem `--build`.** Silêncio
   do `tsc` não é aprovação; pode ser lista vazia.
4. **Código que vive encostado no que vai ser apagado é apagado junto.** Estado de componente mora
   com o outro estado, no topo — não no fim do handler que por acaso o introduziu.

---

## I-12 · 2026-08-25 · A métrica do critério de pronto nunca foi gravada

**O que aconteceu:** `plum_logs.presuncoes_qtd` era `NULL` em **toda** linha, desde o B07.

**Causa:** a coluna existe na migration, e o `handleAdHocPlanejar` sempre passou
`presuncoesQtd: plano.presuncoes.length`. Mas `LinhaDeLog` **não declarava** o campo e `montarLinha`
**não o mapeava** para a coluna. O objeto literal do chamador era, portanto, um erro de tipo — que
nada checava (ver I-11).

**⭐ Por que dói:** o critério de pronto do B15, escrito no plano, é *"efeito esperado, e vale medir:
menos presunções. Se o número não cair, o dicionário não está sendo lido de verdade."* O número não
estava sendo gravado — o critério **não tinha como ser avaliado**, e ninguém teria descoberto isso
olhando a tela.

⚠️ **A linha de base não é recuperável.** "Quantas presunções o A3 declarava antes do dicionário" não
existe em lugar nenhum. O B15 começa a medir sem ter com o que comparar.

**As regras:**

1. ⭐ **Métrica que sustenta um critério de pronto é conferida no BANCO antes de o bloco começar**,
   com um `select` de verdade. O comentário do próprio `montarLinha` já avisava — *"um nome de coluna
   errado aqui vira `null` silencioso no banco em vez de erro"* — e o caso aconteceu por **omissão**,
   não por typo, que é pior: um typo aparece na revisão, uma ausência não.
2. **Campo novo em `LinhaDeLog` anda com o mapeamento em `montarLinha` e com um caso em
   `log_core.test.ts`.** O teste de mapeamento existia e não cobria este campo; agora cobre.
