---
status: vigente
camada: ambos
atualizado_em: 2026-09-03
---

# Erros comuns — o que se acredita e é falso

> **O que este arquivo é:** a lista das crenças erradas que este repositório produz em quem chega.
> Cada linha aponta para onde está a explicação — **este arquivo não explica nada em profundidade,
> de propósito**.
>
> ⭐ **Leia antes de qualquer outra coisa técnica.** Ele existe porque o repo tem documentos
> superados que não avisam que estão superados, e um agente em one shot acredita no primeiro que
> abrir.

---

## Sobre o produto

| ❌ Crença errada | ✅ Verdade | Onde conferir |
|---|---|---|
| A Plataforma Plum **é** o produto vendido | É uma **demo** plug-and-play. O vendido é a implementação vertical | `02-plataforma-vs-implementacao.md` |
| ⭐ Os 4 clientes usam **esta** plataforma, então mudar aqui os afeta | **Não usam.** A implementação deles é um deploy separado (Supabase, Lambda e service account próprios). Aqui só há devs e demo. ⚠️ Saber que "é uma demo" **não** imuniza contra este erro — ver o caso de 2026-08-18 | `02-plataforma-vs-implementacao.md` |
| O Plum é um produto de dashboard / BI | É consulta e interpretação em linguagem natural. Dashboard é uma superfície, não a tese | `01-o-que-e-o-plum.md` |
| O Plum é aquele agente de WhatsApp | Aquilo é o **legado single-tenant** da Poli Júnior, outro sistema. A plataforma foi construída depois, do zero | `01-o-que-e-o-plum.md` |
| O Plum cria planilhas para o cliente | Nunca. O cliente cola a URL da **própria** planilha e compartilha com a service account como Leitor | `30-decisoes.md` D-018 |
| "0 clientes pagantes" | Desatualizado. **4 vendas, ticket médio ~R$ 23k** — mas o que se comprou foi a organização da base | `10-visao-comercial.md` |
| O Plum vende facilidade de consulta | É o que ele **faz**; não é o que sustenta o preço. A tese do remake é interpretação e decisão | `10-visao-comercial.md` |

## Sobre dados e escrita

| ❌ Crença errada | ✅ Verdade | Onde conferir |
|---|---|---|
| O Plum pode alterar dados do cliente | **Nunca.** R-01, só `GET`, escopo `readonly`, sem Drive API | `30-decisoes.md` D-018 |
| O PRD do Plum descreve o banco | Aquele PRD (apagado em 2026-08-14) descrevia `tenants`, `tenant_users`, `data_dictionary` — **nada disso existe**. A verdade é `supabase/migrations/` | `00-LEIA-PRIMEIRO.md` |
| Um dataset = uma planilha inteira | Um dataset é **uma aba**, escolhida por `google_sheet_gid` | `CLAUDE.md` §3 |
| `google_sheet_tab` (o nome da aba) manda | O **`gid`** manda; o nome é fallback só quando o `gid` é nulo | `30-decisoes.md` D-016 |
| `gid = 0` significa "sem aba definida" | `0` é a **primeira aba**, valor legítimo. `if (!gid)` quebra toda planilha | `31-incidentes-e-licoes.md` I-04 |
| Joins entre planilhas são suportados | **Bloqueados** (R-11). O remake propõe cruzar **depois** da agregação, sem join | `30-decisoes.md` D-035 |
| O cadastro começa com um upload de arquivo | **Não existe upload** desde o B13. Cola-se o link, e a planilha é a fonte desde a etapa 0 — não há `FileReader` no front | `01-o-que-e-o-plum.md` |
| O pipeline de importação não lê a planilha | **Lê, e desde a primeira tela** — cabeçalho na etapa 0, 20 linhas na etapa 2. Era verdade até o B13, e o I-08 nasceu disso | `31-incidentes-e-licoes.md` I-08 |
| A tabela antes-vs-depois da formatação sempre existiu | Foi **documentada** desde sempre e **renderizada só em 2026-08-25**. Até então a revisão era só a frase da IA | `30-decisoes.md` D-048 |
| `npm run build` faz typecheck | ⛔ **Não faz.** É `vite build` — esbuild só REMOVE tipos. E `npx tsc --noEmit` na raiz checa **zero arquivos** (`"files": []`). Os que enxergam: `npx tsc -p tsconfig.app.json --noEmit` e `deno check` | `31-incidentes-e-licoes.md` I-11 |
| "O build passou" significa que compila | Significa que o esbuild não reclamou. Um `ReferenceError` de 40 identificadores inexistentes passou por ele | `31-incidentes-e-licoes.md` I-11 |
| `plum_logs.presuncoes_qtd` tem dado histórico | Era **`NULL` em toda linha** até 2026-08-25: a coluna existia, o código a passava, o mapeamento não a incluía | `31-incidentes-e-licoes.md` I-12 |
| O A2 Reconhecedor roda no chat | **Saiu do caminho em 2026-08-25.** O A3 lê o dicionário escrito no cadastro; `reconhecedor` não aparece em turno novo | `30-decisoes.md` D-049 |
| ⭐⭐ O A3 é o "reconhecedor" | ⛔ **Não. O A3 é o `planejador`** (`a3_planejador.ts`). `reconhecedor` era o nome do **A2** — justamente o agente que o cadastro substituiu. Confundir os dois inverte quem morreu, e é reprodutível: o identificador `reconhecedor` continua vivo no tipo `Papel`, no `log_core.ts` e no CHECK de `plum_logs.etapa`, sem nada avisando que o agente não existe | `30-decisoes.md` D-049 |
| ⭐ A action `ad_hoc_reconhecer` é resto do A2 morto | ⛔ **É o nome do PRIMEIRO TURNO, e está viva.** O B15 manteve o nome e trocou o conteúdo: hoje é A1 → dicionário → vocabulário, um LLM só. Apagá-la junto com o A2 derruba o chat | `30-decisoes.md` D-054 |
| O cliente pode descrever ou criar um agente | **Não.** `quando_usar` e capacidades de cada A3 são **código nosso** (`_shared/agentes.ts`), publicado por deploy. O cliente escreve o que os **dados** significam; o administrador, o que os **agentes** sabem fazer | `30-decisoes.md` D-054 |
| A definição semântica que o usuário escreve chega ao chat | Só desde 2026-08-25. Antes ela era **apenas o hash** da chave do cache do A2 — o remake havia regredido nisso | `30-decisoes.md` D-049 |

## Sobre o executor

| ❌ Crença errada | ✅ Verdade | Onde conferir |
|---|---|---|
| O executor roda em EC2 | **Lambda**, imagem de container, Function URL com `AuthType=AWS_IAM`. Houve um plano de EC2, abandonado | `infra/aws/PASSO-A-PASSO.md` |
| O executor consulta o Supabase | **Nunca.** Motorista cego: recebe payload assinado com colunas já resolvidas | `30-decisoes.md` D-008 |
| O executor decide autorização | Ele **reconfere** `allowed_columns` como segunda barreira. A decisão vive na Edge Function | `30-decisoes.md` D-008 |
| O cache do executor está desligado | **Ligado desde 2026-08-07**, TTL 15 min. Documentação antiga dizia o contrário | `30-decisoes.md` D-011 |
| k-anonimato protege as respostas | **Removido em 2026-08-08.** `suppressed_groups` continua no retorno, sempre `0`. `dashboard_k_min` é vestigial | `30-decisoes.md` D-012 |
| `limit` no plano protege contra base grande | Corta a **saída**. A entrada é protegida por checagem antes do parse (`RowLimitExceeded`) | `30-decisoes.md` D-015 |
| Coluna não carregada faz o filtro ser ignorado | É **erro** (`MissingColumnError`). Ignorar daria o total da base com o rótulo do recorte | `30-decisoes.md` D-014 |
| O executor não sabe lidar com várias tabelas | ⭐ **Sabe desde sempre** — `execute_plan(plan, tables)` resolve `plan["from"]` contra o dicionário de tabelas. Quem não sabe é o `main.py`, que monta `{"producao": df}` e **sobrescreve** `plano["from"] = "producao"`, descartando o `from` do planejador. ⚠️ Esse caminho nunca executou em produção: compila, não rodou | `20-pendencias.md` T8 |
| O executor sempre avisa quando algo falta | ⛔ Para **tabela** inexistente ele devolve `{"error": …}` em vez de levantar, ao contrário de coluna. Com multi-planilha isso vira card vazio em silêncio | `20-pendencias.md` T8 |

## Sobre chat, agentes e deploy

| ❌ Crença errada | ✅ Verdade | Onde conferir |
|---|---|---|
| O chat cacheia respostas | Cacheia o **plano**, nunca o resultado — senão pularia o RBAC por definição | `30-decisoes.md` D-024 |
| O cache de plano vale para a organização | Escopo é **por usuário** (RLS de `plum_chat` é `auth.uid() = user_id`) | `30-decisoes.md` D-025 |
| `plum_chat.assunto` é usada | **Vestigial** desde 2026-08-12: não é escrita nem lida | `30-decisoes.md` D-026 |
| O Z-dash bloqueia por segurança | É **fail-open de propósito** — é economia de custo. Quem protege dado é o RBAC | `30-decisoes.md` D-023 |
| ⚠️ Push publica a Edge Function | Publica com **cobertura desconhecida**. Publique à mão e confira `ezbr_sha256` | `31-incidentes-e-licoes.md` I-03 |
| `_shared/` é compartilhado em runtime | É empacotado **por função**. Publicar um consumidor só deixa cópias divergentes do RBAC | `supabase/functions/CLAUDE.md` |
| Divergência de `_shared/` avisa de algum jeito | ⚠️ **Não avisa.** É invisível até alguém emitir a forma nova — os dois lados ficam internamente coerentes e nenhum teste pega | `30-decisoes.md` D-028 |
| `version` provando que o deploy subiu | `version` sobe em mudança de secret, sem código novo. Só `ezbr_sha256` prova | `31-incidentes-e-licoes.md` I-03 |
| ⭐ **RLS substituindo GRANT** | ⚠️ São camadas independentes. Sem `GRANT`, o Postgres recusa antes de olhar policy, com `permission denied for table` — que **não parece** erro de RLS. Cinco vezes neste projeto | `supabase/migrations/CLAUDE.md` |
| ⭐ Teste verde significando artefato certo | ⚠️ Os testes rodam contra o **repositório**, não contra a imagem nem contra o bundle. Um `COPY` faltando no Dockerfile passa por toda a suíte e derruba o Lambda | `31-incidentes-e-licoes.md` I-09 |
| ⭐ Deletar um dataset apaga só o dataset | ⛔ **`dashboard_cards` e `role_permissions` são `ON DELETE CASCADE`**: somem junto todos os cards daquela base e a matriz de permissões curada à mão. `plum_chat` e `plum_logs` são `SET NULL` e ficam órfãos. E recadastrar sem deletar gera **uuid novo**, que órfã os cards do mesmo jeito | `20-pendencias.md` C13 |
| ⭐ `auth.uid()` funcionando no SQL Editor | ⚠️ Lá a sessão é `postgres`, **sem JWT** — `auth.uid()` devolve `NULL`, `user_id = NULL` não casa com nada e `sum()` sobre zero linhas volta `NULL`. Parece "gastei zero" e é "não achei linha". SQL de conferência não pode depender de token | `execucao/B10-registro-amostra/MANUAL.md` |
| ⭐⭐ `new Date().toISOString().slice(0,10)` dá "hoje" | ⛔ Dá **hoje em UTC**, e o Brasil é UTC−3: das 21h à meia-noite é o dia seguinte, o chat filtra amanhã e *"quanto vendi hoje"* responde **zero** — que parece um fato. Use `dataDeHoje()` de `_shared/hoje.ts`, **por requisição**, nunca no escopo do módulo | `30-decisoes.md` D-053 |
| O executor entende "este mês" | ⛔ Só entende **literal**. Quem traduz período relativo em intervalo absoluto no `where` é o A3, com a data de hoje que recebe no prompt — e o intervalo traduzido vira **presunção declarada** | `30-decisoes.md` D-053 |
| A regra de data do card é a mesma do chat | ⚠️ É o **oposto**. O card fica salvo e é reexecutado por meses: "últimos 30 dias" em datas fixas **congela a janela** e ninguém percebe. No card, prefira não filtrar por data ou agrupar com `trunc` | `30-decisoes.md` D-053 |
| ⚠️ Publicar só a Edge Function (ou só o front) é seguro | ⛔ Quando a **forma** do retorno muda, os dois são par indivisível — e o sintoma é silencioso. Front antigo com `ai-agents` novo deixa **todas** as definições do cadastro em branco, sem erro na tela; o perigo não é a tela vazia, é **salvar** por cima dela | `execucao/B14-ai-agents-e-dicionario/MANUAL.md` |

## Sobre front e segurança

| ❌ Crença errada | ✅ Verdade | Onde conferir |
|---|---|---|
| `/dashboard` é o dashboard | É **"Minha Organização"** — membros, cargos, permissões. O dashboard é `/inicio` | `20-pendencias.md` |
| O tema escuro é a classe `.dark` | O tema do produto é `.tema-escuro`, um **terceiro** mecanismo. `.dark` hoje não tem consumidor | `30-decisoes.md` D-029 |
| Mudar `status` no banco reflete no acesso | ⚠️ **Claims só são reemitidas no login.** O usuário precisa sair e entrar | `CLAUDE.md` §4 |
| ⭐⭐ Cair em outra URL depois do SSO = build com URL de dev embutida | ⛔ **Não existe URL embutida no front** — o `redirectTo` é `${window.location.origin}/inicio`, calculado em runtime (`Auth.tsx:141`). Aterrissar em endereço alheio significa que o Supabase **rejeitou** aquele origin e caiu no **Site URL**. O conserto é a allow-list, não o código | `CLAUDE.md` §4 |
| O `Site URL` do Supabase basta para o SSO | São **dois** campos: o `Site URL` é só o *fallback*; quem **autoriza** o `redirectTo` é a lista `Redirect URLs`, e ela precisa do sufixo `/**` — sem ele só a raiz passa, e `/inicio` cai no fallback | `CLAUDE.md` §4 |
| A migration é aplicada pelo CI | **Manual**, colada no SQL Editor do painel, de propósito | `30-decisoes.md` D-005 |
| Segurança é problema da implementação | **Mecanismo** é da plataforma; **política de sensibilidade** é da implementação | `30-decisoes.md` D-039 |
| `join_mode = 'share_id'` no banco | O SQL versionado diz `'share_id'`, o dump de produção diz `'codigo'`. Importe as constantes de `src/lib/organizacao.ts`, **nunca** inline | `CLAUDE.md` §8 |
| O rascunho do cadastro sempre foi retomado | Até 2026-08-25 ele restaurava o estado e caía no **passo 1** de qualquer jeito: o toast prometia *"recuperamos o seu progresso"* e a pessoa refazia tudo, pagando de novo os agentes 1 e 3 | `src/components/DatabasePipeline.tsx` |
| O rascunho guarda o cabeçalho da planilha | ⚠️ **Não, e é de propósito.** O cabeçalho vem **sempre da planilha**, que pode ter mudado entre sessões — o rascunho devolve só o que foi **decidido** (regras, definições, papéis, grão, observações). Coluna que sumiu some da tela; coluna nova aparece vazia | `30-decisoes.md` D-049 |

---

## Sobre este próprio conjunto de documentos

| ❌ Crença errada | ✅ Verdade |
|---|---|
| `zz_remake/V1`, `V2`, `V3` são especificação | São a **conversa** do remake, com propostas que se contradizem de propósito ao longo das versões. A conclusão está em `contexto/` |
| ⭐⭐ "V3 é conversa, então posso ignorar" | ⛔ **Existem DOIS documentos com V3 no nome.** `REMAKE-PLUM-tese-e-arquitetura_V3.md` é conversa e se ignora. `PLANO-implementacao-remake_V3.md` é o **plano de execução autoritativo** — substitui o V2, e é citado por `02-plataforma-vs-implementacao.md` e por `30-decisoes.md` D-046. ⚠️ **Distinga pelo NOME, nunca pela pasta nem pelo número:** desde 2026-09-03 os dois vivem dentro de `zz_remake/`, e a antiga regra "distinga pela pasta" deixou de funcionar |
| Um caminho `zz_remake_implementation/…` citado por aí ainda existe | ⚠️ A pasta virou `zz_remake/zz_remake_implementation/` em 2026-09-03. As **migrations aplicadas** (`20260818100000`, `20260818110000`) ainda citam o caminho antigo e **não foram corrigidas de propósito**: migration aplicada é imutável. Traduza o caminho ao ler |
| O V2 do plano de implementação ainda vale | **Superado pelo V3**, que tirou o remake do ambiente paralelo e o pôs direto em produção — cai a Etapa 0 inteira da V2 (Supabase novo, Lambda de dev, service account nova). A V2 fica marcada, não apagada (D-041), como plano B; a branch `newnew_plum` está parada em `1a0b67e` |
| `contexto/12-visao-tecnologica.md` descreve o que está no ar | Descreve **para onde vamos**. O que está no ar é o `CLAUDE.md` |
| Existe uma pasta de arquivo histórico | Existia (`docs/`, `contexto/90-arquivo/`) e foi **apagada em 2026-08-14**. O porquê ficou em `30-decisoes.md`; a narrativa, só no `git log` |
| `Cfgdatabase.tsx` tem a matriz de permissões, numa aba `?tab=permissoes` | ⛔ **Não tem, e nunca teve.** Não há `Tabs` nem `useSearchParams` naquela página. A matriz mora em `Dashboard.tsx` (que é "Minha Organização", aba "Cargos & Permissões") — e movê-la para lá é a pendência **P9**, nunca aplicada. O `CLAUDE.md` da raiz e o `src/CLAUDE.md` afirmavam isso; corrigido em 2026-09-03 |
| Para saber se a planilha já foi cadastrada, é preciso comparar as colunas | ⛔ **Não é** — e comparar colunas é justamente o que o B13 abandonou (duas planilhas diferentes com as mesmas colunas se confundiam). O mesmo documento dá o mesmo `google_sheet_id` em qualquer forma de link; a chave é `id` + `gid` (D-055). ⚠️ A pendência C14 afirmava o contrário e estava errada |
| Uma base v1 vira v2 quando alguém relê a planilha | ⛔ **Não vira, de propósito.** `conferido = versao >= 2` afirma que uma PESSOA conferiu papel e grão de cada coluna; a reconciliação do B22 só casa nomes. Promover faria o A3 parar de declarar presunção sobre conceitos que ninguém leu (D-056) |

---

⭐ **Encontrou uma crença errada que não está aqui?** Acrescente a linha. Este arquivo é o de maior
retorno por linha do repositório — cada entrada evita uma hora de alguém investigando algo que já
se sabe.
