---
status: vigente
camada: ambos
atualizado_em: 2026-08-14
---

# Decisões

> **O que este arquivo é:** o registro do **porquê**. Uma entrada por decisão, com o que foi
> rejeitado junto.
> **O que este arquivo NÃO é:** documentação de como as coisas funcionam (isso é `CLAUDE.md` e
> `12-visao-tecnologica.md`), nem lista de tarefas (é `20-pendencias.md`).
>
> ⭐ **Por que ele existe:** um agente ou uma pessoa nova reconstrói *o que* o código faz lendo o
> código. Não reconstrói *por que* — e é a falta do porquê que faz alguém "consertar" de volta
> uma decisão deliberada. Toda vez que uma escolha for feita, acrescente uma linha aqui.

**Formato:** `D-nnn` · data · decisão · por quê · o que foi rejeitado · status.
Ordem: mais antiga primeiro, para que a numeração nunca mude.

---

## Fundação e segurança

### D-001 · 2026-07-22 · Nenhuma decisão de autorização vem de `raw_user_meta_data`
**Decisão:** o cliente só pode enviar um *segredo portador digitado* (`join_code`), nunca uma
*declaração de identidade* (`organization_id`, `status`, `role_id`).
**Por quê:** o trigger de cadastro lia `organization_id` e `status` de um campo controlado pelo
cliente. Qualquer pessoa entrava em qualquer organização já como membro ativo (OWASP A01).
**Rejeitado:** validar o metadata "com mais cuidado" — a categoria do campo é o problema, não o
rigor da validação.
**Status:** vigente. Ver `31-incidentes-e-licoes.md` e `CLAUDE.md` §4.

### D-002 · 2026-07-22 · `status` é sempre decisão do servidor
**Decisão:** todo cadastro nasce `pendente`. `ativo` só para quem cria a própria organização, via
RPC `criar_organizacao()`.
**Por quê:** mesma raiz de D-001. Status é autorização; autorização não se pede, se concede.
**Status:** vigente.

### D-003 · 2026-07-22 · Nenhuma policy de UPDATE em `profiles` alcança o próprio registro
**Decisão:** a policy ativa exige `id <> auth.uid()`.
**Por quê:** sem isso o usuário se auto-promove a Admin.
**Consequência viva:** qualquer escrita do próprio usuário no seu perfil precisa de RPC
`SECURITY DEFINER` de coluna única — foi assim que `profiles.tema` foi feito (D-020).
**Status:** vigente.

### D-004 · 2026-07-22 · `organizations` nunca é exposta em SELECT público
**Decisão:** usar a RPC `resolver_codigo_organizacao`, que devolve só `{org_id, org_name}`.
**Por quê:** o SELECT público vazava a lista de clientes.
**Status:** vigente.

### D-005 · — · Migrations são manuais, pelo SQL Editor do painel
**Decisão:** `supabase/config.toml` só tem `project_id`; o SQL é colado no painel.
**Por quê:** decisão consciente de manter o passo destrutivo com humano no meio. Migrations são
idempotentes e não destrutivas por convenção, e terminam com bloco autoverificável.
**Rejeitado:** `supabase db push` no CI.
**Status:** vigente, de propósito.

### D-006 · — · Fail-closed em claim ausente
**Decisão:** claim de JWT ausente **nega** acesso, nunca concede.
**Por quê:** renomear uma claim de um lado só faria o RLS parar de casar em silêncio. O cenário
(j) do teste de SSO protege exatamente isso.
**Status:** vigente.

---

## Executor e privacidade

### D-007 · — · A IA planeja, o código executa (R-02)
**Decisão:** nenhum número sai de texto livre de LLM. O LLM emite Query Plan; pandas executa.
**Por quê:** é o antídoto anti-alucinação e o principal argumento de venda contra "IA inventa
número".
**Status:** vigente, e é o invariante mais importante do produto.

### D-008 · — · Motorista cego: o executor não consulta o Supabase
**Decisão:** o Lambda recebe um payload assinado com o conjunto de colunas **já resolvido e
autorizado**. Ele não vê a pergunta, não sabe a intenção, não faz SQL.
**Por quê:** concentra toda decisão de autorização na Edge Function, onde existem JWT e RLS. Um
executor que consultasse o banco teria de confiar em `organization_id` vindo do payload.
**Status:** vigente.

### D-009 · — · Duas camadas independentes entre Edge Function e Lambda
**Decisão:** SigV4 (`AuthType=AWS_IAM`, resolvido pela infra antes do Python rodar) **e**
HMAC-SHA256 sobre o corpo, com segredo **diferente** da credencial AWS.
**Por quê:** vazar uma não basta para forjar a outra.
**Status:** vigente.

### D-010 · — · Um `batchGet` por dataset, não por pergunta ou card (decisão 11A)
**Decisão:** agrupar a união das colunas de todos os cards/pedidos numa única chamada por
dataset.
**Por quê:** a API do Google Sheets limita a 60 req/min. Uma chamada por card estoura com 6 cards
e um refresh.
**Consequência:** é exatamente o formato de lote que o contrato `/resolver` precisa (D-030).
**Status:** vigente.

### D-011 · 2026-08-07 · Cache de dados com TTL de 15 min, LIGADO
**Decisão:** `query_engine/cache.py`, chave por planilha + aba + conjunto exato de colunas.
Cabeçalho e contagem de linhas têm cache próprio, separado, também 15 min.
**Por quê:** sem cache, cada pergunta é uma leitura do Sheets e o limite de req/min vira o teto do
produto.
**Custo aceito consciente:** linha bruta do cliente fica até 15 min na memória do processo.
⚠️ Documentação anterior a esta data (o PRD do query engine, apagado em 2026-08-14) dizia que o cache
estava **desligado**. Se você encontrar essa afirmação em algum lugar, está errada.
**Status:** vigente.

### D-012 · 2026-08-08 · k-anonimato REMOVIDO
**Decisão:** a supressão de grupo com menos de `k_min` linhas de origem saiu do
`pandas_executor.py`. `suppressed_groups` continua no retorno por compatibilidade, sempre `0`.
`organizations.dashboard_k_min` fica vestigial no banco.
**Por quê:** k-anonimato só protege quando o eixo de agrupamento **coincide com um indivíduo
identificável**. Nas planilhas reais do Plum as linhas são organizadas por data, evento,
categoria, região, turno — dimensões que não identificam ninguém mesmo em grupo pequeno. O
`k_min = 5` não comprava privacidade; comprava **falso negativo**: qualquer recorte com menos de
5 linhas virava "não foram encontrados registros", indistinguível de "esse dado não existe".
**Rejeitado:** k-anonimato por cargo (proposta descartada junto).
⭐ **Não reintroduzir nada dessa família** sem decisão de produto equivalente. Regras
*estatísticas* sobre distribuição que ninguém controla falham de forma dependente da base.
**Status:** vigente.

### D-013 · — · Agregação obrigatória (`RawRowsBlocked`), sem exceção
**Decisão:** todo plano precisa de pelo menos uma função de agregação.
**Status:** ⚠️ **em revisão pelo remake** — ver D-033. Continua vigente no código de hoje.

### D-014 · — · Coluna referenciada e não carregada é ERRO, não filtro ignorado
**Decisão:** `MissingColumnError`.
**Por quê:** um filtro descartado em silêncio devolveria o total da base inteira com o rótulo do
recorte pedido — um número errado com etiqueta convincente.
**Status:** vigente.

### D-015 · — · Teto de linhas verificado ANTES do parse
**Decisão:** `RowLimitExceeded` a partir dos metadados da planilha.
**Por quê:** o `limit` do plano corta a **saída**, nunca protegeu a entrada.
**Status:** vigente.

---

## Dados e schema

### D-016 · 2026-08-11 · `google_sheet_gid` manda; o nome da aba é fallback
**Decisão:** o banco guarda o `gid`; o executor traduz `gid → nome` na leitura.
**Por quê:** a API do Google exige o nome da aba no range, mas nome é apelido mutável — guardar o
nome funciona até alguém renomear a aba, e a base quebra sem ninguém ter mexido nela. O `gid` não
muda com rename.
**Corolários:** `gid` que não existe mais é **erro**, nunca fallback silencioso para o nome (R-08).
⚠️ `gid = 0` é a primeira aba, valor legítimo — comparar com `null`/`None`, nunca com falsy.
**Status:** vigente.

### D-017 · — · Nome de coluna é contrato entre duas linguagens, com duplicação aceita
**Decisão:** `normalizarNomeDeColuna` em TS (`src/lib/colunas.ts`) e `normalizar_coluna` em
Python (`query_engine/sheets.py`), espelhadas, com **tabela de 26 casos replicada nos testes dos
dois lados**.
**Por quê:** não há como compartilhar código entre o browser e o Lambda. Diferente do Query Plan,
divergir aqui **não vira bypass** — vira "coluna não encontrada", porque o RBAC já foi aplicado
sobre os nomes normalizados.
**Saída preferível no futuro:** `schema_metadata` guardar o cabeçalho original por coluna, o que
elimina a normalização em Python. Não é retroativo — o original das bases atuais já foi perdido.
**Status:** vigente.

### D-018 · — · O Plum nunca escreve na planilha do cliente (R-01)
**Decisão:** só HTTP `GET`, escopo `spreadsheets.readonly`, sem Drive API. O cliente compartilha
a planilha com a service account como **Leitor**.
**Por quê:** é o contorno da objeção de TI/Segurança e da "armadilha do ERP", e é pilar de venda
antes de ser decisão técnica.
**Status:** vigente, e reafirmado pelo remake (a escrita que gera valor é a da Maisa, no mundo,
não na base).

### D-019 · 2026-08-12 · Domínio de SSO tem trava no servidor
**Decisão:** trigger `guardar_dominio_da_org` recusa provedor público na **escrita**, normaliza
para minúsculas e força `verified_by`/`verified_at` no servidor.
**Por quê:** antes, a policy `FOR ALL` deixava um admin reivindicar `gmail.com` por `curl` e
capturar todo cadastro novo com aquele e-mail. A denylist só era consultada no login.
**Status:** vigente. Migration `20260812120000`.

### D-020 · 2026-08-12 · `profiles.tema` só é escrito por RPC
**Decisão:** RPC `definir_tema()`, `SECURITY DEFINER`, que só sabe escrever essa coluna.
**Por quê:** D-003 — abrir self-UPDATE em `profiles` reabriria a autopromoção.
**Status:** vigente.

---

## Agentes e chat

### D-021 · — · `dashboard-agent` tem prompt de planejamento próprio (D1 original)
**Decisão:** o Agente Tarsila do Amaral não reusa o prompt do Agente A do chat.
**Por quê:** card e resposta de chat têm requisitos diferentes de saída (`title`, `viz`,
`higher_is_better`).
**Custo:** mexeu na gramática do plano? mexeu nos **dois**.
**Status:** vigente.

### D-022 · — · A pergunta crua nunca vai para o log (D4 original)
**Decisão:** `origin_question` fica `NULL`; os logs `[gerar_card/z-dash]` e `[gerar_card/tarsila]`
não registram a pergunta.
**Por quê:** é texto livre digitado sem pensar. Já foi decidido não guardar isso no banco;
reintroduzir pelo log seria contornar a própria decisão.
**Status:** vigente.

### D-023 · 2026-08-11 · O Z-dash é fail-open, de propósito
**Decisão:** rede, timeout, cota, JSON inválido, enum desconhecido — tudo deixa a pergunta passar.
**Por quê:** ele é **economia de custo, não controle de segurança**. Quem protege dado é o RBAC em
`executar_previa`. Fechar aqui transformaria um soluço do Gemini em "o produto não cria mais
cards".
⚠️ **Contraste deliberado:** um guardião voltado ao cliente final (Plum Externo) tem de ser
fail-**closed**. O critério é *para que serve o guardião*, não "guardião fecha".
**Custo aceito:** uma requisição Gemini a mais em toda geração de card — a cota é por requisição,
então a quantidade de cards/dia cai pela metade. Aceito para impedir o pior caso, que não era
erro: um card estruturalmente válido, com título fora de contexto, **publicável** no dashboard.
**Status:** vigente.

### D-024 · 2026-08-12 · O chat reusa o PLANO, nunca o RESULTADO
**Decisão:** se a mesma pessoa fez exatamente a mesma pergunta na mesma base e o plano saiu
idêntico `REPETICOES_PARA_REUSAR` vezes, pula o Agente A e reusa `plum_chat.plan_query`.
**Por quê:** cachear o número pularia o RBAC por definição — exigiria
`permissions_fingerprint` na chave, como `dashboard_card_snapshots` faz. O plano reusado continua
entrando por `execute_plan` e passando por `authorizePlan` com o `allowed_columns` de quem
pergunta **agora**.
⚠️ **Plano com data absoluta nunca é guardado** (`planoTemData`): "quanto faturei hoje" vira
`["2026-08-12", …]` e reusar amanhã devolveria o dia errado em silêncio.
**Rejeitado:** estender o cache a datas relativas — ver
`contexto/30-decisoes.md` D-024.
**Status:** vigente.

### D-025 · 2026-08-12 · Escopo do reuso é por USUÁRIO, não por organização
**Decisão:** contar repetições só do próprio usuário.
**Por quê:** a RLS de `plum_chat` é `auth.uid() = user_id` e o chat é declarado 100% privado por
usuário. Contar as repetições da empresa exigiria RPC `SECURITY DEFINER`.
**Consequência aceita:** o reuso dispara pouco, porque exige a **mesma** pessoa repetindo. Há log
de hit e miss para medir antes de ampliar.
**Status:** vigente.

### D-026 · 2026-08-12 · `plum_chat.assunto` foi aposentada, não dropada
**Decisão:** a coluna fica no banco, comentada como morta. O Agente Z parou de preenchê-la.
**Por quê:** era `STRING` livre com lista aberta de exemplos no prompt; a mesma pergunta saía
"Vendas" numa execução e "Venda" na seguinte. E D-005 exige migration não destrutiva.
⭐ **Caiu a implementação, não a intenção:** montar sugestões a partir das perguntas reais
continua sendo boa ideia — ver `20-pendencias.md`.
**Status:** vigente.

### D-027 · 2026-08-11 · Formato da resposta do chat é Markdown restrito
**Decisão:** parágrafo, lista com `- ` e `**negrito**` só no valor principal. Sem título, tabela,
link ou emoji. Renderiza `src/components/RespostaMarkdown.tsx`, e **só** na bolha do assistente.
**Por quê:** a do usuário é texto literal — interpretar Markdown na pergunta reescreveria o que
ele digitou.
**Custo:** é um par. Prompt novo com front antigo entrega `- ` literal ao usuário.
**Status:** vigente.

### D-028 · 2026-08-12 · A Fase 5b NÃO publicou `ai-plum-chat` (D7 original)
**Decisão:** `ai-plum-chat` está em produção com uma cópia **antiga** de
`_shared/query_plan.ts`, de propósito.
**Por quê:** para não subir o repositório por cima de alteração não versionada nessa função.
**Por que é seguro:** só enquanto o prompt do Agente A não emitir `group_by: [{col, trunc}]`. O
chat nunca gera a forma nova, então a cópia antiga nunca a encontra.
⚠️ **Quem ligar agrupamento por período no chat tem de publicar `ai-plum-chat` ANTES de mudar o
prompt.** Na ordem inversa, a coluna de data não entra em `resolved_columns` e a pergunta morre em
`MissingColumnError` — falha fechada, mas confusa de diagnosticar.
**Status:** vigente. Ver `supabase/functions/CLAUDE.md`.

---

## Front e design

### D-029 · 2026-08-12 · `:root` é o tema claro; `.dark` fica sem consumidor
**Decisão:** Direção A — `:root` claro com a marca `#7A2F56`. Landing e app saíram do `.dark`. O
tema escuro do produto logado é um **terceiro** mecanismo, `.tema-escuro`, aplicado em
`document.documentElement`.
**Por quê não o inverso:** o Radix renderiza `Dialog`/`Select`/`Popover` em portal no `body`, fora
da árvore do layout — um wrapper claro no app daria a todo diálogo o tema errado.
⚠️ Se `.dark` voltar a ser usado, `--glow-*`, `--glass-*` e `--gradient-*` precisam ser
redefinidos lá dentro: foram retunados de roxo para vinho e só existem em `:root`.
**Status:** vigente.

### D-030 · 2026-08-11 · Todo login pousa em `/inicio`
**Decisão:** os três caminhos de entrada (senha, SSO, criação de organização) apontam para
`/inicio`.
**Por quê:** `/dashboard` é "Minha Organização", tela de administração que a maioria não precisa
ver toda vez.
⚠️ Os três não compartilham constante — mexeu em um, mexa nos três.
**Status:** vigente.

---

## Remake (propostas — nada aqui está implementado)

### D-031 · 2026-08-14 · O Plum é uma consulta de dados para a IA, não para o usuário
**Decisão:** o Plum é **arquiteto + motor**. Sequência: usuário → Plum (que análise essa pergunta
exige?) → Plum (resolve os dados) → LLM (interpreta) → usuário. A LLM nunca recebe a pergunta
crua nem fala direto com o usuário.
**Por quê:** LLM solta não sabe o que não sabe, improvisa o caminho (mesma pergunta, números
diferentes) e não sabe o que é caro.
**Status:** proposta. Ver `12-visao-tecnologica.md`.

### D-032 · 2026-08-14 · O contrato `/resolver` é público e versionado
**Decisão:** pedidos nomeados, lote único, negação **por pedido**, `linhas_origem` no retorno,
`/v1/` desde o primeiro dia, mudança só aditiva.
**Por quê:** o Plum deve rodar em qualquer interface. Refazer contrato com consumidor externo é
trimestre.
**Status:** proposta.

### D-033 · 2026-08-14 · Agregação obrigatória cai; a proteção passa a ser contábil
**Decisão:** entram `registro` e `amostra` com teto de linhas; a proteção vira **orçamento de
linhas brutas por sessão** com log.
**Por quê:** teto por pedido é insuficiente — 200 pedidos × N linhas é a base inteira sem violar
teto nenhum. E, diferente de D-012, um contador é determinístico: não tem regime em que funciona
numa base e falha na outra.
**Consequência comercial:** a frase "o modelo nunca vê linha da sua base" deixa de ser verdadeira.
**Status:** proposta. Revisa D-013.

### D-034 · 2026-08-14 · `amostra` = 5 linhas
**Decisão:** o teto da amostra acompanha o que o pipeline de importação já trafega (cabeçalho + 5
linhas).
**Por quê:** 5 basta para entender **forma**. Para entender **variedade** (quantos status existem)
o `vocabulario` resolve melhor, com contagem e sem trafegar linha.
**Rejeitado:** os 20 propostos inicialmente — não havia razão para exceder o precedente.
**Status:** proposta.

### D-035 · 2026-08-14 · Joins continuam bloqueados; cruzamento acontece DEPOIS da agregação
**Decisão:** implementar "cruzamento por grão comum" — dois agregados pequenos com a mesma chave,
cruzados pela LLM. Join antes da agregação fica fora da Etapa 1.
**Por quê:** a maioria das perguntas de negócio é meta vs realizado, custo vs receita, estoque vs
venda — todas por mês/loja/SKU. Nenhuma precisa de join linha a linha.
⚠️ **Pré-requisito:** grão declarado por tabela. Cruzar "receita por mês" com "meta por
trimestre" dá número errado plausível.
**Status:** proposta. Preserva R-11.

### D-036 · 2026-08-14 · O catálogo de insights por vertical morre
**Decisão:** substituído por 🏗️ **catálogo de padrões analíticos** (~12, universais) + 🔧
**dicionário de regras de negócio** (por cliente). Mantém-se **uma** receita forte como modelo de
referência.
**Por quê:** 20 receitas de saúde valem zero no varejo — não escalam multi-tenant. O que escala é
o *repertório de análises*; o que não escala é o *significado*.
**Status:** proposta. Ver `11-visao-de-produto.md`.

### D-037 · 2026-08-14 · A IA mostra o raciocínio em vez de ser travada
**Decisão:** a resposta contém como a IA pensou e os cálculos que fez. A trava dura ("não posso
responder sem fórmula declarada") **não** é padrão da plataforma — fica disponível como regra de
negócio 🔧, por cliente.
**Por quê:** um parâmetro que trava a IA produz "desculpa, não posso responder isso" a cada
prompt, e o Plum não vai ser assim. O risco de inferência errada continua, mitigado por
**auditabilidade** em vez de recusa.
**Status:** proposta. Revisa a R-14 que havia sido sugerida como bloqueio.

### D-038 · 2026-08-14 · Gemini Flash para raciocínio rápido, Claude para pensamento
**Decisão:** abstração de provedor com papel → modelo em configuração, não no código.
**Por quê:** guardião e casamento de vocabulário não precisam de raciocínio caro; arquiteto e
intérprete precisam. Hoje a URL do Gemini está escrita em **4 lugares** em 3 Edge Functions.
⚠️ Com `amostra` ligada, a escolha de provedor passa a ser decisão de compliance.
**Status:** proposta.

### D-039 · 2026-08-14 · Mecanismo de segurança é 🏗️ plataforma; política é 🔧 implementação
**Decisão:** isolamento de tenant, RLS, RBAC, teto de linhas, orçamento e log são obrigação da
plataforma. *O que* é sensível em cada base é decidido no onboarding, com o cliente.
**Por quê:** nenhuma heurística adivinha que `obs_cliente` tem CPF colado à mão — política tem de
ser 🔧. Mas a plataforma é onde clientes reais sobem dados reais, e o incidente de 2026-07-22 foi
falha de **mecanismo**.
**Status:** proposta.

### D-040 · 2026-08-14 · Prospecção sai da Etapa 1
**Decisão:** Etapa 1 é fazer a IA analisar o banco do usuário. Maisa como tradutor, Plum Externo
e prospecção ficam na Etapa 2.
**Por quê:** foco. E, no caso da prospecção, porque a versão defensável dela depende do dado do
cliente já estar estruturado (ICP derivado da receita real), o que é resultado da Etapa 1.
**Status:** proposta.

### D-041 · 2026-08-14 · Superado é marcado, não apagado
**Decisão:** o **porquê** de uma escolha é extraído para este arquivo **antes** de qualquer documento
ser arquivado ou apagado.
**Por quê:** o porquê é a única informação que não se recompra, e `git log` é invisível para um
agente em one shot. O ruído vem de ambiguidade, não de volume.
**Exceção:** duplicata exata e arquivo gerado são apagados.
**Status:** vigente.

### D-042 · 2026-08-14 · Obsidian fica para depois
**Decisão:** a reorganização do contexto é markdown + git. Nenhuma ferramenta de vault por ora.
**Por quê:** os seis mecanismos que resolvem o problema (roteador, frontmatter de status,
`CLAUDE.md` por pasta, teto de tamanho, skill, teste de aceite) não dependem de Obsidian. E o
Obsidian premia nota atômica, que é pior para agente — 40 notas de 30 linhas custam mais que 5
arquivos coerentes.
**Reversível de graça:** a estrutura já é compatível (frontmatter YAML válido, ponto de entrada
único, pastas numeradas).
**Gatilhos para revisar:** gente não-técnica mantendo o contexto com frequência; ou este arquivo
passar de ~40 decisões.
**Status:** vigente.

### D-043 · 2026-08-14 · O arquiteto trabalha em três rodadas, e vê dado real na segunda
**Decisão:** **R1 reconhecimento** — só `metadados` de todas as tabelas (nomes, tipos, período, nº de
linhas, % de nulo), zero dado, modelo rápido, cacheável por (dataset, versão do dicionário).
**R2 aterrissagem** — das colunas candidatas apenas: `amostra` (5 linhas) + `vocabulario` das
dimensões + camada 4 do dicionário; modelo de raciocínio. **R3** — a plataforma compila e executa.
**Por quê:** mandar tudo de uma vez não funciona. Com N planilhas e dicionário de 4 camadas o prompt
explode, e **não se sabe de antemão de quais colunas mandar o vocabulário**. Com 5 planilhas × 20
colunas, R2 sem R1 exigiria 100 vocabulários e 5 amostras. R1 reduz para 3–6 colunas.
**Rejeitado:** um único prompt com dicionário completo de todas as tabelas.
**Custo aceito:** duas chamadas de LLM antes do primeiro número. Mitigado pelo cache de R1 — da
segunda pergunta na mesma base em diante, some.
❓ **Aberto:** R1 pode ser **código** em vez de LLM (casamento de termo com dicionário). Vale tentar
código primeiro — mais barato, mais rápido, determinístico.
**Status:** proposta. Revisa `12-visao-tecnologica.md` §2, que dizia que o arquiteto vê só o
dicionário.

### D-044 · 2026-08-14 · ⭐ O arquiteto NÃO emite Query Plan — emite análise declarada
**Decisão:** duas linguagens. **Alto nível**, escrito pela LLM: `{padrao, tabela, metrica, dimensao,
periodo_a, periodo_b, top}`. **Baixo nível**, escrito pela **plataforma** por compilação: os N Query
Plans que aquele padrão exige. Válvula de escape: `padrao: "ad_hoc"`, em que o arquiteto emite Query
Plan direto, com a validação de hoje.
**Por quê, em cinco pontos:** (1) o plano deixa de ser texto gerado por LLM — `col` inexistente ou
`agg` inválido ficam impossíveis por construção; (2) reprodutibilidade estrutural (mesma declaração →
mesmos planos → mesmo número), em vez de depender de `temperature: 0`; (3) o padrão fica testável sem
LLM (`compilar(declaracao) === [planos]` é teste unitário); (4) o RBAC passa a autorizar planos que a
**plataforma** gerou; (5) a LLM passa a **classificar e preencher parâmetro**, que é o que ela faz
bem, em vez de gerar consulta, que é o que ela faz pior e onde erra em silêncio.
**Rejeitado:** só `ad_hoc` (é o que existe hoje — mantém todo problema de qualidade como problema de
prompt). E rejeitado o oposto: **só** catálogo, sem escape — produziria "não consigo analisar isso"
com frequência, a trava recusada em D-037.
⭐ **Efeito colateral valioso:** a **taxa de `ad_hoc`** mede quantos padrões faltam, em perguntas
reais. Cair de 60% para 15% em três meses = o catálogo funciona. Não cair = a abstração está errada,
e você descobre com dado.
⚠️ **Risco W2:** se `ad_hoc` virar 80% do tráfego, o catálogo morre sem uso. Medir desde o dia 1.
**Status:** proposta.

### D-045 · 2026-08-14 · `vocabulario` compila para um Query Plan comum — zero mudança no executor
**Decisão:** vocabulário de dimensão é `group_by: [col] + count + order_by desc + limit 200`. O
`tipo: "vocabulario"` do contrato é açúcar resolvido na Edge Function. O casamento difuso
(`parecido_com`) roda na Edge Function sobre os ≤200 valores retornados — normalização + distância de
edição, sem LLM.
**Por quê:** respeita `RawRowsBlocked` (tem agregação), passa pelo RBAC como qualquer plano, e **roda
no executor de hoje sem uma linha de Python nova**.
⭐ **Consequência de escopo:** o executor muda em **duas** coisas no remake inteiro — `overrides` e
`amostra`. E `amostra` é a **única** que quebra `RawRowsBlocked`, o que concentra toda a discussão de
privacidade num único ponto de código: a pergunta "esse PR afrouxa a privacidade?" passa a ter
resposta binária.
**Continua necessário, e é política:** coluna em `allowed_columns` e `vocabulario_exposto = true`
(default `false`, ligado na revisão do onboarding).
**Status:** proposta.
