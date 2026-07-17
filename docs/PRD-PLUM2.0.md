# Discovery & PRD — PLUM Plataforma (evolução multi-tenant do agente PLUM)

> Documento preenchido a partir do **Template — Discovery & PRD para Sistemas Existentes v1.0**.
> Convenções mantidas: `[PREENCHER: …]` (a completar), `[LACUNA: o quê — quem — D.O.D.]` (lacuna com dono e critério de fechamento), status `✅ / ⏳ / 🟡 / 🔴`, `R#` (regra de negócio), `B-##` (bug do legado), `ADR-###` (decisão arquitetural), `Q-##` (pergunta aberta).
> **Fontes deste preenchimento:** `RESUMO_PLUM_AGENTE.md` (resumo técnico dos ~10.400 linhas de Python), `[NI] Pílula Comercial 26.1` (diagnóstico comercial) e a lista de features priorizadas (Alta/Média/Baixa).

---

## Cabeçalho do documento

**Projeto:** PLUM Plataforma — evolução do agente PLUM (WhatsApp single-tenant) para SaaS multi-tenant com plataforma web
**Cliente final:** gestores, diretores e analistas das empresas-cliente (produto SaaS) **+ Poli Júnior como tenant nº 1** (dogfooding — instância interna que hoje roda sobre dados de projetos da PJ)
**Sponsor / Contratante:** Liderança do NI (Núcleo de Inovação e Empreendedorismo) — Poli Júnior
**Versão deste documento:** v0.1 — preenchimento inicial de discovery (baseline técnico + escopo das features novas + arquitetura-alvo)
**Última atualização:** Preenchimento inicial — 12/07/2026 — consolidação de RESUMO + Pílula Comercial + backlog de features
**Repositórios:**
- Backend legado (agente atual): `plum-pj-main` — [LACUNA: URL do repositório Git — Jaques/Frank — D.O.D.: link registrado + acesso de leitura confirmado para a equipe do NI]
- Frontend da plataforma: [LACUNA: repositório a criar — Tech Lead — D.O.D.: repo inicializado com scaffold aprovado (ver ADR-003)]
- Infra: EC2 `sa-east-1` + GitHub Actions (`deploy.yml`) — [LACUNA: repo de IaC/infra se houver — Fefo — D.O.D.: documentado ou marcado como "sem IaC" explicitamente]

**Drive / pasta do projeto:** [LACUNA: link da pasta do projeto no Drive do NI — Jaques — D.O.D.: pasta com este PRD + anexos]
**Status:** 🟡 Em construção

---

## Índice

1. Sumário Executivo
2. Contexto e Problema
3. Objetivos e Não-Objetivos
4. Stakeholders e Papéis
5. Arquitetura Atual (sistema legado)
6. Arquitetura-Alvo (novo sistema)
7. Análise de Paridade Funcional (manter / mudar / descontinuar)
8. Personas e Perfis de Usuário
9. Fluxos de Negócio
10. Tipos de Processo / Casos de Uso
11. Campos e Estrutura de Dados
12. Regras de Negócio
13. Templates de Documentos e Artefatos
14. Integrações Externas
15. Requisitos Não-Funcionais
16. Catálogo de Bugs do Sistema Legado
17. Dívida Técnica que NÃO deve ser herdada
18. Backlog Priorizado
19. Decisões Técnicas (ADRs)
20. Riscos e Mitigações
21. Critérios de Aceite e Definition of Done
22. Cronograma e Marcos
23. Plano de Cutover e Descomissionamento do Legado
24. Anexos e Referências

---

## 1. Sumário Executivo

### 1.1. O que é o sistema?

O **PLUM** é um assistente consultivo de dados em linguagem natural (PT-BR). O usuário pergunta ("qual o ticket médio de vendas do último mês?", "quanto faturamos?") e o PLUM responde com dados reais, sem exigir SQL, dashboard ou apoio de um analista. Comercialmente é posicionado como **sistema de "entrega"** (reduz a fricção entre a dúvida do gestor e a resposta acionável), em oposição aos **sistemas de "registro"** (ERP/CRM/BI, onde o dado fica guardado mas de difícil acesso). É **read-only por design** — nunca altera, cria ou apaga registros.

Hoje o PLUM existe como **agente single-tenant acessado só por WhatsApp**, rodando internamente na Poli Júnior sobre os dados de projetos da própria PJ (Google Sheets → Postgres). Externamente está em homologação/prospecção, ainda **sem nenhuma venda fechada**.

### 1.2. Por que reconstruir / refatorar?

O objetivo **não** é reescrever o cérebro do produto — o motor de consulta (DSL) é o ativo mais valioso e deve ser **preservado** (ver ADR-001). A reconstrução é da **camada de entrega, autenticação e multi-tenancy ao redor do motor**, pelos motivos concretos abaixo:

- **Single-tenant hardcoded.** O schema de dados (`query_engine/plum_schema.py`, tabela única `base`) e toda a canonização de negócio (núcleos `NI/NCiv/NDados/NCON/NTEC/WI`, status, `itip`, `vendedor`) estão **fixos no código para a realidade da Poli Júnior**. É impossível atender um segundo cliente sem editar o código-fonte.
- **Canal único (WhatsApp).** Não existe plataforma web. A **prioridade TOTAL do NI é ter uma plataforma** que embarque a maior parte das features (ver §3), com o WhatsApp virando **um canal entre vários**.
- **Estado só em RAM** (`main.STATE`, dict global). Reinício do container zera sessões, contexto e memória de conversa (B-03).
- **Sem autenticação de produto.** A auth atual é uma allowlist de telefones (`authorized_users`), sem SSO, sem noção de empresa/tenant, sem papéis além de `user`/`admin`.
- **Segredo commitado no repositório** (`poli-jr-chatbot-*.json`, service account Google) — risco de segurança ativo (B-04), precisa rotação imediata.
- **Conversão zero.** O diagnóstico comercial aponta que a POC "parece um produto em construção", as ATs vendem "como funciona" em vez de "custo de decidir errado", e falta uma forma de **demonstrar valor ao vivo com dados do próprio cliente**. Isso é, ao mesmo tempo, um problema comercial **e** um requisito de arquitetura (ver §1.3).

**Indicador-chave:** o PLUM está em **produção interna real na Poli Júnior** (1 tenant de fato — a própria PJ, uso de dogfooding) e em **homologação/demonstração externa**, com **0 (zero) clientes pagantes**. Isso significa: baixo risco de quebrar operação crítica de terceiros hoje, e alta liberdade para reprojetar a fundação antes da primeira venda — mas também que **ainda não existe validação de mercado**, então o produto precisa provar valor rápido (demo na AT).

### 1.3. Resultado esperado

Uma **plataforma SaaS multi-tenant** onde:

1. Qualquer empresa-cliente pode ser **provisionada como um tenant isolado**, com seus próprios usuários (SSO), seus próprios dados e seu próprio "dicionário" de dados — **sem tocar no código**.
2. O **motor DSL preservado** responde perguntas em linguagem natural sobre os dados **daquele tenant**, respeitando permissões por usuário/coluna (RBAC), por **múltiplos canais** (WhatsApp, chat na própria plataforma, e-mail opcional).
3. Existe um **subsistema de onboarding/mapeamento de dados** que — com o mesmo motor — resolve três problemas de uma vez: (a) o **checklist/questionário produtizado** que a área comercial precisa (feature Alta #2), (b) a **demo instantânea na AT** anexando uma planilha e conversando com ela (feature Alta #1), e (c) o **schema dinâmico por tenant** que substitui o `plum_schema` hardcoded. *Esta unificação é o ponto central deste PRD: a mesma peça técnica ataca a "conversão zero" e viabiliza o multi-tenant.*

### 1.4. Prazo e equipe

- **Duração:** [PREENCHER: estimativa depende do modelo de multi-tenancy escolhido (ADR-004). Baseline proposto neste PRD: ~10 sprints de 2 semanas para Altíssima + Alta; ver §18 e §22.]
- **Equipe:** NI / Poli Júnior — Jaques (Sr. Dev / liderança técnica NI), Frank Rocha (Tech Lead), Augusto Cabral "Guto" (Produto/Comercial), Mairo "Mairão", Paim, David, Fefo, Brunão (analistas/devs por frente — ver §4). [LACUNA: alocação de horas/semana por pessoa — Jaques — D.O.D.: quadro de capacidade por sprint]
- **Modelo contratual:** produto interno do NI (não há contratante externo pagante nesta fase). Desenvolvimento contínuo priorizado pela liderança do NI.

### 1.5. Status atual (12/07/2026)

- 🟢 Agente PLUM (DSL + legado) **funcional em produção interna** na PJ, via WhatsApp, sobre dados de projetos da PJ.
- 🟢 Motor DSL (`query_engine/`) maduro: planner LLM (Gemini 2.5 Flash) → validação → execução determinística em pandas, com 19 arquivos de teste.
- 🟡 Camada comercial (ATs, propostas, Express vs Enterprise) definida na Pílula 26.1, mas **sem ferramenta de demo** que a sustente.
- ⏳ Plataforma web: **não existe** (a construir).
- ⏳ Multi-tenancy, SSO, RBAC de produto, RLS, persistência de sessão: **não existem** (a construir).
- 🔴 Segredo (service account) commitado no repo — **ação imediata** (B-04).

---

## 2. Contexto e Problema

### 2.1. Histórico do projeto

| Período | Evento |
|---|---|
| 2025 (H1) | PLUM concebido como POC interna da PJ: consulta de dados de projetos via WhatsApp. Motor legado (catálogo de 22 ferramentas fixas). |
| 2025 (H2) | Introdução do **motor DSL** (`plum_answer_dsl`, flag `PLUM_USE_DSL_ENGINE=True`) como motor primário; legado vira *safety net*. ETL Sheets→Postgres estabilizado (`TRUNCATE + INSERT` atômico após bug de dupla contagem). |
| 11/03/2025 | **Pílula Comercial 26.1** (Augusto Cabral): diagnóstico de "conversão zero", reposicionamento "bot técnico → ferramenta estratégica", definição de Express vs Enterprise. |
| ~mai/2026 | Template de Discovery & PRD para sistemas existentes v1.0 (base: e-Estágios). |
| 12/07/2026 | **Este documento (v0.1):** decisão de evoluir o PLUM para plataforma multi-tenant, embarcando as features priorizadas. |
| [data] | [LACUNA: data de aprovação deste PRD pela liderança do NI — Jaques/Guto — D.O.D.: aprovação registrada na §24.6] |

### 2.2. Dores atuais confirmadas

Dores confirmadas por documento/fonte (o discovery com o cliente final externo ainda não ocorreu — ver Q-01):

- **Conversão zero / POC não convence** — confirmado na Pílula Comercial 26.1: "POC Poli Júnior não agrega todo o valor necessário, parece um produto em construção".
- **ATs vendem "como funciona", não "custo de decidir errado"** — confirmado na Pílula 26.1.
- **Setup de R$ 31k assusta em contextos simples** → necessidade de "Versão Light / Express" — confirmado na Pílula 26.1.
- **"Armadilha do ERP"** (objeções de clientes em SAP/Totvs) — confirmado na Pílula 26.1; contorno via "Espelho de Dados" (.xlsx/.csv diário).
- **Impossível atender >1 empresa sem editar código** — confirmado no RESUMO (schema/canonização hardcoded).
- **Sessões/contexto perdidos em restart** — confirmado no RESUMO §11.5 (estado em RAM).
- **Painel admin de usuários provavelmente quebrado** — confirmado no RESUMO §11.1 (`db.admin_crud` não existe, mas `flow_config` o chama) → B-01.
- **Segredo exposto no repositório** — confirmado no RESUMO §11.6 → B-04.
- [LACUNA: dores reais de gestores das empresas-alvo (validar em AT de diagnóstico com cliente externo real, não só via código/POC) — Guto + analista de produto — D.O.D.: pelo menos 1 AT gravada/anotada com as "3 perguntas críticas" e o "custo do silêncio" preenchidos conforme checklist da Pílula]

### 2.3. Implicações estratégicas

- **A plataforma é pré-requisito da primeira venda, não um luxo.** A "conversão zero" tem causa dupla: (1) falta de superfície de produto (só WhatsApp, sem plataforma/dashboard onde o gestor "veja" o valor) e (2) falta de demo com dados reais na AT. Ambas são resolvidas pela plataforma + subsistema de onboarding (§1.3).
- **O motor DSL é o diferencial defensável.** É o que já funciona e o que os concorrentes de "registro" não têm. Toda a reconstrução deve **protegê-lo e generalizá-lo**, não substituí-lo.
- **Multi-tenancy é decisão de segurança, não só de engenharia.** Vazar dado de um cliente para outro seria fatal para um produto que se vende como "seguro e read-only". O isolamento precisa ser garantido em **todas as camadas**, inclusive dentro do agente de IA (ver ADR-004, §15.3, R-05).
- **Dependência do NDados para Enterprise.** Vendas Enterprise (SAP/Totvs/Databricks) exigem ETL/tratamento e viram "venda casada" com o Núcleo de Dados. A arquitetura precisa de um **conector de dados plugável** que comece simples (Express: Sheets/Excel/CSV/SQL) e deixe a porta aberta para Enterprise.

---

## 3. Objetivos e Não-Objetivos

### 3.1. Objetivos (in-scope)

Resultados verificáveis:

- **O1 — Plataforma multi-tenant operacional:** provisionar um novo tenant (empresa-cliente) com usuários próprios, dados próprios e schema próprio **sem alterar código-fonte**. *(Base da "prioridade TOTAL".)*
- **O2 — Motor DSL tenant-aware:** o mesmo motor de consulta responde sobre os dados de qualquer tenant, dirigido por um **dicionário de dados por tenant** (substitui `plum_schema` hardcoded), com isolamento garantido.
- **O3 — Autenticação de produto:** login por **SSO** (Google via Supabase) com fluxo de duas etapas — SSO autentica identidade; **usuário mestre** autoriza acesso às bases (feature Alta #4).
- **O4 — RBAC:** controle de acesso por usuário, com **2 níveis iniciais (mestre / padrão)**, extensível a permissões por base e por coluna (feature Alta #3).
- **O5 — Segurança por camadas:** backend separado do frontend, **RLS** no banco, read-only enforced no plano de dados, segredos em cofre (feature Alta #5).
- **O6 — Onboarding + Demo por planilha:** anexar uma planilha e conversar com ela ao vivo (demo na AT); e checklist produtizado de dados críticos/extras (features Alta #1 e #2, unificadas).
- **O7 — Validação determinística de dados:** detectar e **alertar** (sem alterar) dados obviamente errados, por código, com regras configuráveis por tenant (features Alta #7 / Média #2).
- **O8 — Multi-canal:** plataforma como canal principal de conversa, com WhatsApp mantido e e-mail opcional (feature Média #1).
- **O9 — Dashboard + insights:** painel de indicadores do tenant, com o PLUM explicando variações ("por que esse indicador mudou") (feature Média #3).
- **O10 — Proatividade:** notificações/perguntas recorrentes ("no dia Z, quer o mesmo dado de sempre?") e aba de perguntas frequentes por tenant (feature Média #4).

### 3.2. Não-Objetivos (out-of-scope da fase 1)

- **N1 — Integração nativa com SAP/Totvs/Databricks.** Fase 1 mira **Express** (Sheets/Excel/CSV/SQL). Enterprise entra depois, via conector plugável + NDados. *Justificativa: Pílula 26.1 ("não tente a integração nativa imediata", "Espelho de Dados"). ADR-005.*
- **N2 — Escrita/alteração de dados do cliente.** PLUM permanece **read-only**. *Justificativa: pilar de segurança e argumento de venda. R-01.*
- **N3 — Geração de dashboards de BI complexos / predições de IA.** O foco é entrega de resposta/insight rápido, não substituir Power BI nem prever o futuro. *Justificativa: "Filtro de Simplicidade" da Pílula 26.1.*
- **N4 — Follow-up automático de leads e métricas de ROI do PLUM.** São prioridade Baixa; ficam para depois do core (§18.4). *Justificativa: baixo impacto de curto prazo (nota 3/3 na própria lista).*
- **N5 — App mobile nativo.** Plataforma web responsiva + WhatsApp cobrem mobilidade na fase 1. *Justificativa: reduzir superfície; reavaliar pós-validação.*
- **N6 — Rebranding completo (nova LP + logo).** Feature Alta #6 é "decidir depois"; tratamos como trilha paralela de baixo acoplamento técnico (§18.2). *Justificativa: não bloqueia arquitetura.*

---

## 4. Stakeholders e Papéis

### 4.1. Equipe do projeto

| Papel | Responsável | Empresa | Responsabilidades |
|---|---|---|---|
| Product Manager / Comercial | Augusto Cabral ("Guto") | Poli Júnior (NI) | Visão de produto, processo comercial (ATs/propostas), validação de valor, [LACUNA: e-mail — Guto — D.O.D.: contato registrado] |
| Tech Lead / Senior Dev | Frank Rocha | Poli Júnior (NI) | Arquitetura, ADRs, revisão técnica |
| Sr. Dev / Liderança NI | Jaques | Poli Júnior (NI) | Liderança técnica do NI, coordenação das frentes, este PRD |
| Frente Demo + Checklist | Mairo ("Mairão"), Paim | Poli Júnior (NI) | Onboarding/demo por planilha (Alta #1) e checklist de dados (Alta #2) |
| Frente RBAC + SSO | David, Fefo, Brunão | Poli Júnior (NI) | Auth/SSO (Alta #4), RBAC (Alta #3), política de segurança/RLS (Alta #5) |
| Cliente Final (operador) | Gestores/diretores/analistas do tenant | Empresa-cliente | Donos das perguntas de negócio; usuários principais. [LACUNA: cliente-piloto externo definido — Guto — D.O.D.: empresa-piloto nomeada com sponsor identificado] |
| Sponsor Institucional | Liderança do NI | Poli Júnior | Patrocínio, go/no-go |
| Suporte Técnico / Infra | [LACUNA: responsável por EC2/AWS e cofre de segredos — Fefo? — D.O.D.: dono de infra nomeado] | Poli Júnior | EC2 `sa-east-1`, CloudWatch, Supabase, acessos |

> Observação sobre nomes: a lista de features cita "Mairão", "Paim", "David", "Fefo", "Brunão". [LACUNA: confirmar mapeamento nome↔papel e sobrenomes/e-mails — Jaques — D.O.D.: tabela de contatos completa]

### 4.2. Cadência de reuniões

| Tipo | Frequência | Participantes | Duração |
|---|---|---|---|
| Daily interna | Diária | Frentes técnicas (Mairão, Paim, David, Fefo, Brunão) | 15min |
| Sync de produto | Quinzenal | Jaques + Frank + Guto | 30–60min |
| Demo / homologação | A cada fim de fase | Equipe + cliente-piloto (quando houver) | 60min |
| Validação técnica (multi-tenancy/segurança) | Sob demanda | Frank + frente RBAC/SSO | 60min |
| Validação de propostas (comercial) | Contínua | Guto + analistas de produto | — |

> A cadência acima é uma proposta baseada no template; [LACUNA: confirmar rituais reais do NI — Jaques — D.O.D.: cadência aprovada].

---

## 5. Arquitetura Atual (sistema legado)

### 5.1. Visão geral

Monólito **Flask** (webhook único `/webhook`) empacotado em **Docker** (Python 3.11), rodando em uma **EC2** (`sa-east-1`). O WhatsApp (Meta Cloud API) chama o webhook; `main.router()` roteia por `stage` e conteúdo para três fluxos (IA, Botões, Config). O modo IA delega ao **motor DSL** em `agent.py` (LLM Gemini → plano DSL JSON → validação → execução em **pandas** sobre um DataFrame único chamado `base`, carregado do Postgres). A fonte da verdade de negócio é **Google Sheets**, sincronizada para o **Postgres/RDS** por scripts ETL offline. Estado de sessão vive **apenas em RAM** (`main.STATE`, dict global). Single-tenant: todo o schema e a canonização são específicos da Poli Júnior.

Padrão arquitetural identificado: **webhook monolítico + pipeline "LLM-planeja / código-executa"** (a IA nunca toca o dado diretamente; ela só produz um plano que é validado e executado deterministicamente — é isso que dá o antídoto contra alucinação de números).

### 5.2. Stack técnico completo

| Componente | Software | Versão | Container / serviço | Porta |
|---|---|---|---|---|
| OS / Runtime | Python | 3.11 (`Dockerfile`) | container único | — |
| App principal | Flask (`main.py`) | — | container `plum` | 5000 (interno) → 5003 (host EC2) |
| NLU / LLM | Google Gemini | `gemini-2.5-flash` | via `google-generativeai>=0.8.3` | — |
| Execução de consulta | pandas / numpy | — | in-process | — |
| Auth / IAM | allowlist própria (`authorized_users`) | — | Postgres | — |
| Banco de dados | PostgreSQL / **AWS RDS** | [LACUNA: versão do Postgres — Fefo — D.O.D.: `SELECT version()` colado] | RDS | 5432 |
| Object Storage | — (não usa; serve `MANUAL_PLUM.pdf` via rota Flask) | — | — | — |
| Cache | in-memory (dict, TTL 300s no `sheets_loader`; dedup de msg TTL 600s) | — | RAM | — |
| Reverse proxy | [LACUNA: há Nginx/ALB à frente da EC2? — Fefo — D.O.D.: topologia de rede confirmada] | — | — | — |
| Conteinerização | Docker | — | 1 container | — |
| Observabilidade | AWS CloudWatch (`awslogs`) + tabela `ai_interactions` (auditoria) | — | CloudWatch `sa-east-1` | — |
| CI/CD | GitHub Actions (`appleboy/ssh-action`): `git reset --hard` → `docker build --no-cache` → run | — | — | — |
| ETL | scripts Python (`sync_sheets_postgres`, `sync_forms_to_postgres`, `sync_logs_sheets`) | — | [LACUNA: como são agendados? cron? Action? manual? — Jaques — D.O.D.: gatilho de cada sync documentado] | — |
| Integrações Google | `gspread` + `google-auth` (Sheets/Forms) | — | service account JSON | — |

### 5.3. DNS e roteamento

[LACUNA: domínio(s) do webhook, certificado TLS, mapeamento para a EC2:5003 — Fefo — D.O.D.: FQDN + cert + rota registrados; confirmar se o Meta aponta para IP+porta ou para um domínio com proxy]

### 5.4. Inconsistências identificadas entre fontes

Discrepâncias entre nomes/documentação e comportamento real do código (todas do RESUMO §11):

- `sheets_loader.py` **não lê Sheets** — lê Postgres via `db.get_all_projects()`. Nome enganoso. `[B-05]`
- Runtime consulta `SELECT * FROM projetos`, mas o ETL grava em `projetos_consolidado`. Pode existir view/alias — ou é bug de nome de tabela. `[B-02]` — [LACUNA: rodar `\d projetos` e `\d projetos_consolidado` no RDS e verificar se `projetos` é view/alias — Jaques/Frank — D.O.D.: DDL das duas relações colado + veredito (view / alias / bug)]
- `flow_config.py` chama `db.admin_crud(...)`, função **inexistente** em `database.py`. `[B-01]`
- Imports duplicados/redundantes em `agent.py` (cabeçalho repetido; `re`/`calendar` reimportados localmente). `[B-06]`
- Canonização de núcleo/status/nome **duplicada** entre `planner_llm._apply_where_patches` e fallbacks do `pandas_executor`. `[B-07]`

### 5.5. Acessos disponíveis

| Sistema | URL | Login | Senha / método | Quem detém |
|---|---|---|---|---|
| EC2 (SSH) | [LACUNA] | [LACUNA] | chave em cofre | [LACUNA: Fefo?] |
| RDS Postgres | [LACUNA] | `DB_USER` | cofre | [LACUNA] |
| Meta WhatsApp (App/Number) | business.facebook.com | — | `WHATSAPP_TOKEN`/`PHONE_NUMBER_ID` no cofre | [LACUNA] |
| Google Cloud (service account) | console.cloud.google.com | `poli-jr-chatbot-*@…` | **⚠️ JSON commitado — ROTACIONAR (B-04)** | [LACUNA] |
| Gemini API | — | — | `GEMINI_API_KEY` (cofre) | [LACUNA] |

> ⚠️ Senhas de produção **não** ficam neste documento. [LACUNA: definir cofre oficial (1Password/Vault/Doppler) e migrar todos os segredos — Fefo — D.O.D.: cofre criado + todos os segredos migrados + `.env`/JSON removidos do repo e do histórico Git]

### 5.6. Contas de teste por perfil

| Perfil | Credencial de teste | Disponível desde |
|---|---|---|
| Usuário `user` (WhatsApp) | número autorizado em `authorized_users` | [LACUNA] |
| Usuário `admin` (WhatsApp) | número com `role='admin'` | [LACUNA] |
| Não autorizado (fluxo de bloqueio) | qualquer número fora da allowlist | ✅ (comportamento coberto por teste) |

### 5.7. Acesso ao servidor / infra

[LACUNA: procedimento SSH/console da EC2 + acesso ao console AWS `sa-east-1` — Fefo — D.O.D.: runbook com host, método de autenticação, usuário e passo-a-passo registrado no cofre]

### 5.8. Repositório de código-fonte do legado

Pasta de origem: `plum-pj-main`. [LACUNA: URL do Git + direitos de leitura/escrita para toda a equipe do NI — Jaques/Frank — D.O.D.: repo clonado e validado; artefatos críticos exportados: `plum_schema.py`, migrations/DDL do RDS, `docs/MANUAL_PLUM.md`, `.github/workflows/deploy.yml`]

---

## 6. Arquitetura-Alvo (novo sistema)

### 6.1. Princípios norteadores

1. **Preservar o cérebro, reconstruir a casca.** O motor DSL (`query_engine/` + extração determinística) é ativo estratégico; a reconstrução é da camada de entrega, auth e multi-tenancy. (ADR-001)
2. **Plataforma-first, canal-agnóstico.** A plataforma web é a superfície principal; WhatsApp/e-mail são canais plugáveis sobre o mesmo motor. (ADR-002)
3. **Isolamento de tenant como invariante de segurança.** Todo dado, toda query e todo passo do agente são escopados por `tenant_id`. Vazamento entre tenants é falha crítica. (ADR-004, R-05)
4. **Configuração > código.** Adicionar um cliente = criar dados de configuração (tenant, dicionário de dados, conectores, papéis), nunca editar o código-fonte.
5. **Read-only e LGPD por design.** Nunca escreve no dado do cliente; segregação/classificação de sensibilidade e RLS em todas as tabelas. (R-01, §15.4)
6. **Determinismo sobre a IA.** A IA planeja; o código valida e executa. Nenhuma resposta numérica sai de texto livre do LLM. (R-02)

### 6.2. Stack confirmada

> Status: ✅ decidido / 🟡 recomendado neste PRD, pendente de aprovação em ADR / ⏳ a definir.

| Camada | Tecnologia | Status | ADR |
|---|---|---|---|
| Frontend (plataforma) | React (SPA) — provável base gerada no **Lovable** + componentes próprios; Tailwind | 🟡 | ADR-003 |
| Backend / API | **FastAPI** (Python) — hospeda o motor DSL preservado; substitui o webhook Flask | 🟡 | ADR-003 |
| Banco de dados (control plane) | **Supabase Postgres** (tenants, usuários, papéis, config, dicionário de dados, conversas, feedback, auditoria) | 🟡 | ADR-004 |
| Banco de dados (data plane) | por tenant: schema/DB isolado **ou** conexão read-only à fonte do cliente (conector plugável) | 🟡 | ADR-004, ADR-005 |
| Autenticação | **Supabase Auth** (Google SSO nativo) + autorização em 2 etapas (SSO → liberação pelo mestre) | 🟡 | ADR-006 |
| Autorização / RBAC | papéis `mestre`/`padrão` (extensível) + **RLS** por `tenant_id` e por permissão de base/coluna | 🟡 | ADR-006 |
| Object Storage | **Supabase Storage** (uploads de planilhas para onboarding/demo) | 🟡 | ADR-005 |
| Motor de consulta (NLU→dado) | **preservado**: planner LLM (Gemini) → validação → pandas, tornado **tenant-aware** | ✅ (preservar) | ADR-001, ADR-007 |
| Camada de backend/segurança | backend separado do front; **Edge Functions** (Supabase) para rotas sensíveis/webhooks + FastAPI para o motor | 🟡 | ADR-006 |
| Estado / sessão | **persistente** (Postgres/Supabase; opcional Redis para cache) — sai da RAM | 🟡 | ADR-008 |
| Adaptadores de canal | WhatsApp (Meta Cloud API — reaproveita `whatsapp.py`), chat da plataforma, e-mail (opcional) | 🟡 | ADR-009 |
| Geração de artefatos | exportação de respostas/insights (PDF/CSV) — leve; herda `renderers.py` | ⏳ | — |
| Workflow / automação | **n8n + Evolution** apenas para follow-up (Baixa) e disparos agendados de proatividade | ⏳ | ADR-010 |
| E-mail | [LACUNA: provedor (Resend/SES/SMTP) — Tech Lead — D.O.D.: provedor escolhido em ADR] | ⏳ | — |
| Conteinerização | Docker (mantém) | ✅ | — |
| Observabilidade | CloudWatch + `ai_interactions` (mantém) + logs estruturados por tenant | 🟡 | — |
| CI/CD | GitHub Actions (mantém padrão; adiciona pipeline do frontend) | 🟡 | — |

### 6.3. Diagramas

[LACUNA: produzir diagrama C4 (Context + Container + Component) após ADR-004 (multi-tenancy) e ADR-003 (stack) fecharem — Frank — D.O.D.: 3 diagramas anexados]

**Esboço textual da arquitetura-alvo (para orientar o C4):**

```
                         ┌─────────────────────────────────────────────┐
                         │              PLATAFORMA WEB (React)           │
                         │  chat • dashboard • onboarding/demo • admin   │
                         └───────────────┬─────────────────────────────┘
                                         │ HTTPS (JWT Supabase)
        Canais externos                  ▼
   WhatsApp (Meta) ─┐        ┌───────────────────────────────┐   RLS por tenant_id
   E-mail (opc.)  ──┼──────► │  BACKEND / API (FastAPI)        │◄──────────────────┐
   Chat plataforma ─┘        │  ┌──────────────────────────┐   │                   │
                             │  │ Channel Adapters          │   │            ┌──────────────┐
                             │  ├──────────────────────────┤   │            │  CONTROL PLANE │
                             │  │ Tenant Resolver + Auth    │───┼───────────►│  (Supabase PG) │
                             │  ├──────────────────────────┤   │            │  tenants        │
                             │  │ MOTOR DSL (preservado)    │   │            │  users/roles    │
                             │  │  planner(Gemini)→validate │   │            │  data_dictionary│
                             │  │  →pandas (tenant-aware)   │   │            │  connectors     │
                             │  ├──────────────────────────┤   │            │  conversations  │
                             │  │ Data Connector (plugável) │   │            │  sessions       │
                             │  └───────────┬──────────────┘   │            │  audit/feedback │
                             └──────────────┼──────────────────┘            └──────────────┘
                                            ▼  (read-only)
                         ┌────────────────────────────────────────────┐
                         │              DATA PLANE (por tenant)          │
                         │  Express: Google Sheets / Excel / CSV / SQL   │
                         │  (replicado p/ schema isolado OU lido direto) │
                         │  Enterprise (fase 2): SAP/Totvs via NDados    │
                         └────────────────────────────────────────────┘
```

**Decisão central (a mais importante desta arquitetura):** o `plum_schema.py` (schema fixo da PJ) vira uma entidade de dados — o **dicionário de dados por tenant** (`data_dictionary`, §11). O prompt do planner passa a ser **montado dinamicamente** a partir do dicionário do tenant corrente; a canonização de núcleos/status/sinônimos (hoje hardcoded para a PJ) vira **configuração por tenant**. Isso é o que transforma o PLUM de ferramenta-da-PJ em produto.

### 6.4. Modelo de dados de alto nível

[LACUNA: diagrama ER com as entidades do control plane + relação com o data plane — Frank — D.O.D.: diagrama + dicionário de dados (ver §11 para o rascunho das entidades)]

---

## 7. Análise de Paridade Funcional

Legado (agente WhatsApp single-tenant) → Novo (plataforma multi-tenant). Peça-chave: mostrar o que muda.

| # | Funcionalidade do legado | Decisão | Motivo | Referência |
|---|---|---|---|---|
| F-01 | Consulta em linguagem natural via motor DSL (planner→validate→pandas) | ✅ Manter idêntica (preservar) | É o diferencial do produto | ADR-001 |
| F-02 | Schema/canonização hardcoded (`plum_schema`, núcleos/status/itip da PJ) | 🔄 Manter com mudança | Vira **dicionário de dados por tenant** (config, não código) | R-06, §11 |
| F-03 | Auth por allowlist de telefone (`authorized_users`) | 🔄 Manter com mudança | Vira SSO + RBAC + `tenant_users` multi-tenant | ADR-006, R-04 |
| F-04 | Canal WhatsApp (Meta Cloud API, `whatsapp.py`) | 🔄 Manter com mudança | Vira **um adaptador de canal** entre vários | ADR-009 |
| F-05 | Modo Botões (navegação Núcleo→Vendedor→Projeto) | 🔄 Manter com mudança | Navegação guiada é PJ-específica; generalizar como "navegação por dimensões do tenant" **ou** descontinuar no canal web em favor do chat livre | ADR-009 / Q-04 |
| F-06 | Modo Config (CRUD de usuários via WhatsApp) | ❌ Descontinuar (no WhatsApp) | Admin de usuários passa para a **plataforma** (tela de admin do tenant); além disso está quebrado (B-01) | ADR-006 |
| F-07 | Estado de sessão em RAM (`main.STATE`) | 🔄 Manter com mudança | Vira **estado persistente** por (tenant, canal, usuário) | ADR-008, R-07 |
| F-08 | Motor legado (22 ferramentas fixas) como fallback | ❌ Descontinuar (consolidar no DSL) | Reduzir superfície; DSL já cobre a maioria; migrar as 2 exceções (`risco_operacional`, `resumo_projeto`) para planos DSL | §17, ADR-001 |
| F-09 | Auditoria `ai_interactions` + feedback (nota 1-5) | ✅ Manter | Observabilidade essencial; escopar por tenant | §15.6 |
| F-10 | ETL Sheets→Postgres (carga atômica) | 🔄 Manter com mudança | Vira **conector de dados por tenant** (Express); Sheets é só uma das fontes | ADR-005 |
| F-11 | Coalescência de mensagens IA (janela 0.9s) | ✅ Manter | Boa UX (captura correções antes de consultar); reaproveitar por canal | — |
| F-12 | Manual em PDF servido por rota Flask | 🔄 Manter com mudança | Vira ajuda/onboarding na plataforma; por tenant | §13 |
| F-13 | ➕ Plataforma web, dashboard, onboarding/demo, proatividade, validação de dados | ➕ Adicionar (não existia) | Núcleo deste PRD (features Alta/Média) | §18 |

> Funcionalidades em "Descontinuar" (F-06, F-08) precisam ser comunicadas: o CRUD via WhatsApp e o motor legado saem. Como o único operador atual é a PJ (tenant nº 1), o impacto é interno e controlado.

---

## 8. Personas e Perfis de Usuário

### 8.1. Usuário Mestre (admin do tenant)
- **Quem é:** administrador designado pela empresa-cliente (ex.: gestor de TI, dono da área piloto). Não quer perder tempo aprovando gente uma a uma, mas precisa controlar quem vê o quê.
- **Objetivos no sistema:** provisionar/aprovar usuários do tenant; conceder acesso a bases; definir permissões por base/coluna; conectar fontes de dados; revisar o dicionário de dados; ver uso/auditoria.
- **Rotas / telas:** `/admin/usuarios`, `/admin/bases`, `/admin/conectores`, `/admin/dicionario`, `/admin/auditoria`.
- **Permissões especiais:** conceder/revogar acesso (o passo 2 do SSO — ver R-04); ver dados sensíveis conforme classificação.
- **Volume estimado:** [LACUNA: nº de mestres por tenant (tipicamente 1–3) — Produto — D.O.D.: número confirmado com piloto]
- **Ferramentas paralelas hoje:** planilhas de controle de acesso, e-mail.

### 8.2. Usuário Padrão (consulta)
- **Quem é:** gestor/analista/vendedor que consome dados. Pode ser o **decisor** (diretor/executivo — vê o PLUM como "segurança", como diz a Pílula) ou a **ponta** (vendedor/operador — vê como ferramenta).
- **Objetivos:** perguntar em linguagem natural; receber resposta acionável em segundos; no canal que estiver (WhatsApp em campo, plataforma no escritório); ver seu dashboard.
- **Rotas / telas:** `/chat`, `/dashboard`, `/faq`; e o número do WhatsApp do tenant.
- **Permissões:** limitadas pela RBAC (ex.: "vendedor vê suas vendas; diretor vê a margem" — exemplo da própria Pílula).
- **Volume estimado:** [LACUNA: usuários ativos por tenant — Produto — D.O.D.: faixa por porte de cliente]
- **Ferramentas paralelas hoje:** pedir para o BI/TI rodar query; abrir Power BI; esperar relatório por e-mail.

### 8.3. Admin da Plataforma (Poli Júnior / NI)
- **Quem é:** equipe do NI que opera o SaaS (provisiona novos tenants, monitora saúde, dá suporte).
- **Objetivos:** criar tenant; acompanhar métricas globais; suporte na transição (uso assistido); gerenciar billing/planos (Express/Enterprise).
- **Rotas / telas:** `/superadmin/tenants`, `/superadmin/saude`, `/superadmin/planos`.
- **Permissões:** cross-tenant **apenas para operação/suporte**, com auditoria — nunca leitura casual de dados de cliente. [LACUNA: política de acesso da PJ a dados de tenant (suporte precisa de consentimento? mascaramento?) — Fefo/Jurídico — D.O.D.: política escrita + implementada]
- **Volume estimado:** equipe do NI.

### 8.4. Comercial / Consultor de Negócios (CN)
- **Quem é:** vendedor da PJ conduzindo a AT (papel central da Pílula 26.1).
- **Objetivos:** rodar a **demo ao vivo** anexando uma planilha (nossa pré-pronta, depois a do cliente) durante a AT; preencher o **checklist** de dados críticos/extras; classificar o projeto (Express/Enterprise).
- **Rotas / telas:** `/demo` (playground de demo), `/checklist`.
- **Ferramentas paralelas hoje:** slides da Pílula, POC genérica que "parece em construção".

> Segmentação de negócio (para o pitch, não para RBAC), da Pílula 26.1: **Comercial/Vendas** (top performers, ticket médio, meta), **Operações/Logística** (gargalos, prazos, campo), **Financeiro** (fluxo de caixa, inadimplência, margem), **TI/Segurança** (compliance, LGPD, "não quebrar o banco" → contornar com read-only).

---

## 9. Fluxos de Negócio

### 9.1. Visão geral dos processos do legado

| Processo (id) | Nome | Versão | Status no legado |
|---|---|---|---|
| FL-IA | Modo IA (consulta em linguagem natural) | DSL (primário) + legado (fallback) | ✅ correto (motor primário) / 🟡 fallback legado ainda ativo |
| FL-BTN | Modo Botões (navegação guiada) | — | ✅ correto (mas PJ-específico) |
| FL-CFG | Modo Config (CRUD de usuários) | — | 🐛 com bug (B-01, `admin_crud` inexistente) |
| ETL-1 | Sheets → Postgres (`sync_sheets_postgres`) | carga atômica | ✅ correto |
| ETL-2 | Forms → `authorized_users` (`sync_forms_to_postgres`) | upsert | ✅ correto |
| ETL-3 | `ai_interactions` → Sheets (`sync_logs_sheets`) | append incremental | ✅ correto |

### 9.2. Fluxos-alvo no novo sistema

**Fluxo A — Onboarding + Demo por planilha (features Alta #1 e #2 unificadas).** *É o fluxo que ataca a "conversão zero" e, ao mesmo tempo, produz o dicionário de dados do tenant.*

```
START (CN na AT, OU cliente no self-service)
 → [Ator: CN/Cliente] anexa planilha
     → caminho MVP (fase A): usa PLANILHA DEMO pré-pronta da PJ (fixa) → chat imediato
     → caminho pleno (fase B): usa planilha DO CLIENTE (arbitrária)
 → [Sistema] valida upload (formato .xlsx/.csv/Sheets; tamanho; nº de abas)
 → [Sistema] INFERÊNCIA DE SCHEMA (pandas): detecta colunas, tipos, amostras
 → [Sistema] rascunho do DICIONÁRIO DE DADOS
     → gera descrições/sinônimos sugeridos (LLM, uso ONE-SHOT no onboarding, não em runtime)
     → aplica o CHECKLIST: marca campos CRÍTICOS (obrigatórios p/ avançar) vs EXTRAS ("legal ter")
         → condição: falta campo crítico → bloqueia avanço, pede complemento
         → condição: só faltam extras → permite avançar com aviso
 → [Ator: CN/Cliente] REVISA e ajusta o dicionário (human-in-the-loop)  ← obrigatório (R-06)
 → [Sistema] provisiona TENANT DEMO efêmero + carrega dados no data plane isolado
 → [Ator] conversa com o PLUM sobre a planilha AO VIVO (mesmo motor DSL, tenant-aware)
     → "simulação ao vivo" que a Pílula 26.1 pede no slide de Mapeamento de Consultas
 → decisão comercial:
     → fechou → tenant efêmero PROMOVIDO a tenant real (dados + dicionário preservados)
     → não fechou → tenant demo expira (retenção definida em §15.4)
 → END
```

**Fluxo B — Consulta multi-tenant (modo IA, caminho feliz tenant-aware).** *Evolução do fluxo atual do RESUMO §12, com isolamento adicionado.*

```
START (mensagem chega por um canal: WhatsApp / chat plataforma / e-mail)
 → [Sistema] Channel Adapter normaliza a mensagem (texto, id, remetente)
 → [Sistema] TENANT RESOLVER: resolve tenant_id a partir do canal
     → WhatsApp: pelo PHONE_NUMBER_ID/identidade do número → tenant
     → Plataforma: pelo JWT (Supabase) → tenant + user
 → [Sistema] AUTH + RBAC: usuário existe, está 'ativo', mestre liberou acesso à base? (R-04)
     → não autorizado → resposta de bloqueio (+ caminho de solicitação de acesso)
 → [Sistema] carrega SESSÃO PERSISTENTE (tenant, canal, user) — não mais RAM (R-07)
 → [Sistema] coalescência de mensagens (janela ~0.9s) para capturar correções (F-11)
 → [MOTOR DSL, tenant-aware]:
     → monta prompt do planner com o DICIONÁRIO DO TENANT (não o schema fixo)
     → planner (Gemini, temp=0, JSON) → PLANO DSL
     → validate_plan: version==1, from ∈ schema DO TENANT, colunas ∈ allowed_cols DO TENANT,
                      agg ∈ AGG_FUNCS, joins BLOQUEADOS, limit 1..500
     → aplica FILTRO DE TENANT no plano (invariante: todo plano é escopado ao tenant) (R-05)
     → aplica RBAC de COLUNA: remove/mascara colunas que o usuário não pode ver (R-03)
     → carrega DataFrame do DATA PLANE DO TENANT (conector; cache por tenant)
     → reforço determinístico de filtros (identificador de pessoa/dimensão/período)
     → execute_plan (pandas) → linhas + conflitos de nome
 → [Sistema] renderização determinística (sem LLM) → resposta por canal
 → [Sistema] auditoria (ai_interactions, escopada por tenant) + feedback a cada N interações
 → END
```

**Fluxo C — Validação determinística de dados (features Alta #7 / Média #2).** *"Não mudar o dado, só alertar." Sem IA — por código.*

```
START (gatilho: no onboarding/ingest OU sob demanda no dashboard)
 → [Sistema] carrega o dataset do tenant + as REGRAS de validação do tenant (config)
 → para cada regra (tipagem, faixa, unicidade, relação entre colunas, formato):
     → varre a base aplicando a regra (vetorizado em pandas)
     → registra ANOMALIAS (linha, coluna, regra violada, severidade) — NUNCA altera o dado
 → [Sistema] agrega e ALERTA (badge no dashboard / mensagem no canal)
     → ex.: "12 projetos com data_fim < data_inicio", "valor negativo em 3 linhas", "CNPJ no campo vendedor"
 → END
```

> Nota de engenharia: parte dessas regras já existe embrionária no legado (ex.: `sync_sheets_postgres.clean_vendedor`/`is_valid_pj_id` que rejeitam CNPJ/razão social no campo vendedor; dedup de `_id_duplicado_antigo`). No novo sistema elas viram um **motor de regras configurável por tenant**, e o comportamento muda de "rejeitar/limpar em silêncio" para "**alertar sem alterar**" (R-08). Como identificar o "contexto" (pergunta aberta na lista de features): via **tipo declarado da coluna no dicionário** — não por IA.

**Fluxo D — Proatividade / notificação (feature Média #4).**

```
START (agendador dispara, ex.: diário/semanal por tenant)
 → [Sistema] lê CONSULTAS RECORRENTES do usuário (histórico de conversas persistido)
     → detecta padrão: "usuário pede X toda segunda"
 → [Sistema] respeita a JANELA de canal:
     → WhatsApp: fora da janela de 24h → usa MENSAGEM TEMPLATE aprovada (a "janela que não existe mais" citada na lista de features = as sessões de 24h da Meta; requer template) [Q-06]
     → Plataforma: notificação in-app (sem janela)
 → [Sistema] pergunta "quer o dado de sempre agora?" → se sim, roda Fluxo B
 → END
```

### 9.3. Diferenças por contexto / variante

| Aspecto | Express (Plug-and-Play) | Enterprise (fase 2, feat. NDados) |
|---|---|---|
| Fonte de dados | Google Sheets / Excel / CSV / SQL estruturado | SAP / Totvs / Databricks / RDS / legado sem API |
| Conexão | conector direto ou "Espelho de Dados" (.xlsx/.csv diário em nuvem) | ETL/tratamento pelo NDados; conector dedicado |
| Onboarding | self-service / demo por planilha | projeto (PRD detalhado, gestão de mudança) |
| Multi-tenancy do data plane | schema/DB isolado no Supabase **ou** leitura direta | tipicamente isolado + camada de tratamento |
| Preço | setup light (resolve objeção do R$ 31k) | setup completo (venda casada) |
| Canal | plataforma + WhatsApp | idem + integrações específicas |

### 9.4. Lacunas em fluxos

- [LACUNA: no Fluxo A, quem "possui" o dicionário sugerido pelo LLM até a revisão? há trilha de auditoria da revisão humana? — Mairão/Paim — D.O.D.: modelo de revisão definido + campo de "revisado por/em" no dicionário]
- [LACUNA: no Fluxo B multi-canal, como um mesmo usuário-humano é reconciliado entre WhatsApp (telefone) e plataforma (e-mail/SSO)? — David/Fefo — D.O.D.: regra de identidade única por (tenant, pessoa) definida — ver R-09]
- [Q-04: manter o modo Botões no canal WhatsApp ou aposentar em favor do chat livre? — Produto/Frank — resolvido → vira F-05 definitivo + ADR]

---

## 10. Tipos de Processo / Casos de Uso

| Tipo | Descrição | Status no novo sistema |
|---|---|---|
| UC-01 | Consultar dado em linguagem natural (multi-tenant, RBAC) | 🟡 Em andamento (motor existe; falta tenant-awareness) |
| UC-02 | Login por SSO + liberação de acesso pelo mestre | ⏳ A implementar (Alta #4) |
| UC-03 | Provisionar tenant e conectar fonte de dados | ⏳ A implementar (Altíssima) |
| UC-04 | Onboarding: upload de planilha → dicionário de dados | ⏳ A implementar (Alta #1/#2) |
| UC-05 | Demo ao vivo na AT (chat sobre planilha anexada) | ⏳ A implementar (Alta #1) |
| UC-06 | Gerir usuários e permissões do tenant (mestre) | ⏳ A implementar (substitui F-06 quebrado) |
| UC-07 | Validar dados e alertar anomalias (sem alterar) | ⏳ A implementar (Alta #7 / Média #2) |
| UC-08 | Conversar pela plataforma (chat web) | ⏳ A implementar (Média #1) |
| UC-09 | Conversar por WhatsApp (canal preservado) | ✅ Implementado (legado) → 🔄 migrar p/ tenant-aware |
| UC-10 | Ver dashboard + pedir "por que este indicador mudou" | ⏳ A implementar (Média #3) |
| UC-11 | Receber proatividade/notificação recorrente | ⏳ A implementar (Média #4) |
| UC-12 | Consultar FAQ do tenant (perguntas frequentes) | ⏳ A implementar (Média #4) |
| UC-13 | Dar/coletar feedback da resposta (nota 1-5) | ✅ Implementado (legado) → manter |
| UC-14 | Follow-up automático ao entrar na plataforma | ⏳ A implementar (Baixa) |
| UC-15 | Métricas de ROI/desempenho do PLUM (antes/depois) | ⏳ A implementar (Baixa) |

---

## 11. Campos e Estrutura de Dados

> Rascunho do **control plane** (Supabase Postgres). Toda tabela com dado de tenant tem `tenant_id` + **RLS** (R-05). Nomes finais e migrations dependem de ADR-004/006 e de validação do time.

### 11.1. `tenants`

| Campo | Tipo | Obrigatório | Validação | Origem |
|---|---|---|---|---|
| `id` | uuid | ✅ | PK | sistema |
| `nome` | text | ✅ | — | admin plataforma |
| `plano` | enum(`express`,`enterprise`) | ✅ | — | comercial |
| `status` | enum(`demo`,`ativo`,`suspenso`) | ✅ | — | sistema |
| `sso_dominio` | text | ⏳ | domínio de e-mail p/ auto-associação (ex.: `@empresa.com`) | mestre |
| `data_plane_ref` | jsonb | ✅ | referência ao data plane (schema/DB isolado ou conector) | sistema |
| `retencao_demo_dias` | int | — | default p/ tenants demo | sistema |
| `created_at` | timestamptz | ✅ | — | sistema |

### 11.2. `tenant_users` (RBAC — evolui `authorized_users`)

| Campo | Tipo | Obrigatório | Validação | Origem |
|---|---|---|---|---|
| `id` | uuid | ✅ | PK | sistema |
| `tenant_id` | uuid | ✅ | FK `tenants` + RLS | sistema |
| `auth_user_id` | uuid | ✅ | FK Supabase Auth | SSO |
| `email` | text | ✅ | do SSO | SSO |
| `telefone` | text | — | E.164; usado p/ canal WhatsApp (herda `limpar_telefone`) | mestre/usuário |
| `nome` | text | ✅ | — | SSO/mestre |
| `role` | enum(`mestre`,`padrao`) | ✅ | 2 níveis iniciais (Alta #3) | mestre |
| `status` | enum(`pendente`,`ativo`,`revogado`) | ✅ | **`pendente` até o mestre liberar** (R-04) | sistema/mestre |
| `bases_liberadas` | uuid[] | — | quais bases este usuário acessa | mestre |
| `created_at` | timestamptz | ✅ | — | sistema |

### 11.3. `tenant_bases` (fontes/bases de dados do tenant)

| Campo | Tipo | Obrigatório | Validação | Origem |
|---|---|---|---|---|
| `id` | uuid | ✅ | PK | sistema |
| `tenant_id` | uuid | ✅ | FK + RLS | sistema |
| `nome` | text | ✅ | — | mestre |
| `conector_tipo` | enum(`sheets`,`excel`,`csv`,`sql`,`enterprise`) | ✅ | — | mestre |
| `conector_config` | jsonb | ✅ | credenciais **referenciam cofre**, nunca segredo inline (R-10) | mestre |
| `modo` | enum(`replica_isolada`,`leitura_direta`) | ✅ | ADR-005 | sistema |
| `read_only` | bool | ✅ | **sempre true** (R-01) | sistema |
| `ultimo_sync` | timestamptz | — | — | sistema |

### 11.4. `data_dictionary` ⭐ (substitui `plum_schema.py` hardcoded — entidade mais importante)

Uma linha por coluna de cada base do tenant. **É o que torna o motor DSL tenant-aware.**

| Campo | Tipo | Obrigatório | Validação | Origem |
|---|---|---|---|---|
| `id` | uuid | ✅ | PK | sistema |
| `tenant_id` | uuid | ✅ | FK + RLS | sistema |
| `base_id` | uuid | ✅ | FK `tenant_bases` | sistema |
| `coluna` | text | ✅ | nome físico na fonte | inferência |
| `rotulo` | text | ✅ | nome amigável (para prompt e UI) | inferência + revisão humana |
| `tipo` | enum(`texto`,`numero`,`moeda`,`data`,`percentual`,`categoria`,`id`) | ✅ | dirige validação e render | inferência + revisão |
| `descricao` | text | ✅ | vai para o prompt do planner (papel do `SCHEMA_DESCRIPTIONS`) | LLM (sugestão) + revisão |
| `sinonimos` | text[] | — | apelidos que o usuário pode usar (papel de `SINONIMOS_NUCLEO`) | revisão |
| `valores_canonicos` | jsonb | — | mapa sinônimo→valor (papel de `STATUS_SINONIMOS_MAP`) | revisão |
| `is_data_ref` | bool | — | marca a coluna de data canônica para filtros temporais (papel de `data_ref`) | revisão |
| `criticidade` | enum(`critico`,`extra`) | ✅ | **checklist** (Alta #2): crítico bloqueia avanço | revisão |
| `sensibilidade` | enum(`alta`,`moderada`,`baixa`) | ✅ | classificação LGPD (Pílula) | revisão |
| `rbac_min_role` | enum(`padrao`,`mestre`) ou grupo | — | RBAC de coluna (R-03) | mestre |
| `revisado_por` / `revisado_em` | uuid / timestamptz | ✅ | trilha da revisão humana (R-06) | sistema |

### 11.5. `sessions` (estado persistente — substitui `main.STATE` em RAM)

| Campo | Tipo | Obrigatório | Validação | Origem |
|---|---|---|---|---|
| `id` (session_id) | uuid | ✅ | renova após 45min de inatividade (herda regra atual) | sistema |
| `tenant_id` / `user_id` / `canal` | uuid / uuid / enum | ✅ | escopo | sistema |
| `stage` | text | ✅ | estado do fluxo | sistema |
| `memoria_conversa` | jsonb | — | últimas 12 mensagens (herda) | sistema |
| `contexto` | jsonb | — | `contexto_projeto`, `last_structured_rows`, `_last_dsl_plan`, pendências (herda `main.STATE`) | sistema |
| `preferred_name` | text | — | "me chama de X" (herda) | usuário |
| `updated_at` | timestamptz | ✅ | TTL/expiração | sistema |

### 11.6. `conversations` / `messages` (para proatividade e FAQ — feature Média #4)

- Conversas por canal + tabela unificada (a própria lista de features pede: "bancos de conversas do wpp separado do banco de conversas [da plataforma] e uma tabela com as conversas juntas"). Modelo: `messages(id, tenant_id, user_id, canal, session_id, direcao, texto, plano_dsl, created_at)` + view/tabela materializada `conversations_unificada`. Alimenta detecção de recorrência (Fluxo D) e FAQ (perguntas mais frequentes por tenant).

### 11.7. `data_validation_rules` (feature Alta #7 / Média #2)

- `id, tenant_id, base_id, coluna(s), tipo_regra(faixa|unicidade|relacao|formato|tipagem), parametros(jsonb), severidade, ativo`. Executadas pelo Fluxo C.

### 11.8. Auditoria e feedback (preservar do legado, escopar por tenant)

- `ai_interactions` (herda: `created_at, telefone, user_name, session_id, message_id, user_text, tool_name, tool_params jsonb, rows_affected, latency_ms, result_status, error_code, response_text`) **+ `tenant_id`**.
- `ai_response_feedback` (unique `(user_id, answer_id)`) e `plum_general_feedback` (upsert `(user_id, session_id)`) **+ `tenant_id`**.

### 11.9. Variáveis críticas herdadas do legado

| Variável (legado) | Tipo | Decisão no novo sistema |
|---|---|---|
| `nucleo` (NI/NCiv/NDados/…) | categoria | Vira coluna genérica no `data_dictionary` do tenant PJ; **não** é conceito de plataforma |
| `itip_venda`/`itip_real` | número | Idem — métrica PJ-específica; só existe no dicionário da PJ |
| `data_ref` (data canônica) | data | Vira flag `is_data_ref` no dicionário (regra de reconstrução de data continua no executor) |
| `_id_duplicado_antigo` / `conflitos_nome` | flag | Vira parte do motor de validação (Fluxo C) + aviso de desambiguação |
| `_AVISOS_NOME_DUPLICADO` (global mutável) | canal lateral | **Descontinuar** o global; passar aviso via retorno estruturado (§17) |

---

## 12. Regras de Negócio

> Fonte "código" = derivada do RESUMO/comportamento atual; precisa **confirmação de produto** para virar regra de produto (não só de PJ).

**R-01 — Read-only absoluto:** o PLUM nunca cria, altera ou apaga dado do cliente, em nenhuma camada. Conectores são `read_only=true` por construção. *Fonte: Pílula 26.1 + design. Pilar de venda e de segurança.*

**R-02 — IA planeja, código executa:** nenhuma resposta numérica é gerada por texto livre do LLM. O LLM só produz um **plano DSL** que é validado e executado deterministicamente em pandas. *Fonte: código (motor DSL). É o antídoto anti-alucinação da Pílula (Objeção #4).*

**R-03 — RBAC de coluna:** um usuário só vê colunas cujo `rbac_min_role`/grupo ele satisfaz (ex.: "vendedor vê vendas, diretor vê margem"). O motor **remove/mascara** colunas não permitidas antes de executar/renderizar. *Fonte: Pílula (hierarquia de acesso) + feature Alta #3.* [LACUNA: granularidade (por coluna? por linha? por valor, ex. "vendedor só vê as PRÓPRIAS vendas"?) — Produto/David — D.O.D.: matriz de permissões do piloto]

**R-04 — SSO ≠ autorização (2 etapas):** autenticar por SSO cria o usuário como `pendente`. O **usuário mestre** precisa **liberar acesso às bases** antes de qualquer consulta. *Fonte: feature Alta #4 (⚠️ "não basta cadastrar com SSO, o adm vai ter que liberar o acesso").*

**R-05 — Isolamento de tenant como invariante:** todo plano DSL, toda query e todo carregamento de dados são **escopados por `tenant_id`**; RLS ativa em todas as tabelas; nenhum passo do agente pode cruzar tenants. *Fonte: ADR-004 + §2.3. Violação = incidente crítico.*

**R-06 — Dicionário revisado por humano:** o schema/dicionário sugerido automaticamente (inferência + LLM) **só entra em produção após revisão humana** (campo `revisado_por/em`). *Fonte: risco de alucinação de schema; substitui a segurança que o `plum_schema` fixo dava.*

**R-07 — Estado persistente:** sessão/contexto/memória vivem em store persistente (não RAM); sobrevivem a restart. Renovação de sessão após **45min** de inatividade (herda regra atual). *Fonte: B-03 + feature de plataforma.*

**R-08 — Validação alerta, não corrige:** o motor de validação de dados **apenas sinaliza** anomalias; nunca altera o dado do cliente. *Fonte: feature Alta #7 (⚠️ "não devemos mudar os dados, apenas dar um alerta").*

**R-09 — Identidade única por (tenant, pessoa):** uma pessoa pode acessar por múltiplos canais (WhatsApp por telefone, plataforma por SSO) mas é **um único usuário** dentro do tenant, com permissões unificadas. *Fonte: derivada do multi-canal (Média #1).* [LACUNA: regra de reconciliação telefone↔e-mail — David/Fefo — D.O.D.: definida em §9.4]

**R-10 — Segredos em cofre:** nenhuma credencial (Gemini, service account, DB, WhatsApp, conectores de tenant) fica em código, repo ou neste documento — só referências ao cofre. *Fonte: B-04.*

**R-11 — Limites do plano DSL (segurança de consulta):** `version==1`; `from` ∈ schema do tenant; colunas ∈ `allowed_cols` do tenant; agregações ∈ {sum,avg,min,max,count}; `order_by.dir` ∈ {asc,desc}; `limit` 1..500; **joins bloqueados**. *Fonte: `plan_validation.py` (mantém, agora por tenant).*

**R-12 — Classificação de sensibilidade (LGPD):** toda coluna tem `sensibilidade` (alta/moderada/baixa); colunas de alta sensibilidade recebem proteção adicional (mascaramento em logs, RBAC mais restrito). *Fonte: Pílula 26.1 (Objeção #3) + §15.4.*

> ⚠️ Atenção a colisões de numeração ao adicionar regras em iterações futuras — reorganizar em vez de repetir IDs (erro observado no PRD-base: dois `R14`).

---

## 13. Templates de Documentos e Artefatos

### 13.1. Manual do PLUM
- **Localização atual:** `docs/MANUAL_PLUM.md` → gerado em PDF por `scripts_gerar_manual_pdf.py`, servido pela rota Flask `/manual/plum.pdf`.
- **Variações:** hoje único (PJ). No novo sistema: **por tenant** (o manual reflete o dicionário/capacidades daquele tenant).
- **Campos editáveis:** catálogo de perguntas suportadas, exemplos.
- **Decisão:** vira **ajuda/onboarding embutido na plataforma** (não mais PDF por rota); manter export PDF opcional.

### 13.2. Respostas/insights exportáveis
- Saídas do PLUM (tabelas, somas, comparações) formatadas por `renderers.py` (BRL `R$ 1.234,56`, períodos). No novo sistema: opção de **exportar** resposta/insight (CSV/PDF) a partir do dashboard.
- **Necessidade jurídica:** nenhuma (não são documentos legais). [se surgir relatório "oficial" para cliente, revisar]

### 13.3. Mensagens-template de WhatsApp (para proatividade — Fluxo D)
- Fora da janela de 24h da Meta, notificações proativas exigem **templates aprovados**. [LACUNA: catálogo de templates + submissão/aprovação na Meta — David/Brunão — D.O.D.: pelo menos 1 template aprovado para "resumo recorrente"] — ver Q-06.

### 13.4. Estratégia de versionamento
- Dicionário de dados versionado no Postgres (histórico de `data_dictionary`); templates de mensagem versionados; **mudança de dicionário não reprocessa** respostas antigas por padrão.

---

## 14. Integrações Externas

### 14.1. Meta WhatsApp Cloud API
- **Status:** ✅ ativa (legado, `whatsapp.py`) → 🔄 virar adaptador multi-tenant.
- **Tipo:** REST (envio) + webhook (recebimento). **Criticidade:** alta.
- **Credenciais:** `WHATSAPP_TOKEN`, `PHONE_NUMBER_ID`, `VERIFY_TOKEN` (cofre).
- **Camada de desacoplamento:** interface `ChannelAdapter` (ADR-009).
- [LACUNA: um número por tenant ou número compartilhado com roteamento? — David — D.O.D.: modelo de numeração definido (impacta Tenant Resolver, Fluxo B)]

### 14.2. Google Gemini API
- **Status:** ✅ ativa (`gemini-2.5-flash`, `temperature=0`, `response_mime_type=application/json`, via `llm_guard`). **Criticidade:** alta (é o planner).
- **Credenciais:** `GEMINI_API_KEY` (cofre — **rotacionar**, ver B-04).
- **Camada de desacoplamento:** `llm_guard.call_llm_with_guard` (timeout/retries) já isola o provedor — bom ponto de troca de LLM se preciso (a Pílula cita "escolha de LLM conforme compliance do cliente").

### 14.3. Google Sheets / Forms (`gspread` + `google-auth`)
- **Status:** ✅ ativa (ETL) → 🔄 vira **um conector Express** entre outros.
- **Criticidade:** média (fonte de dados da PJ; será uma das fontes de tenant).
- **Credenciais:** service account JSON (**commitado — remover do repo, B-04**).

### 14.4. Supabase (Auth + DB + Storage + Edge Functions)
- **Status:** ⏳ a implementar (control plane, auth SSO, storage de uploads, edge functions). **Criticidade:** crítica.
- **Documentação:** oficial Supabase.

### 14.5. n8n + Evolution API (follow-up e disparos — prioridade Baixa/Média)
- **Status:** ⏳ a implementar. **Criticidade:** baixa (follow-up Baixa #1) a média (agendador de proatividade). **Camada de desacoplamento:** manter fora do caminho crítico de consulta.

### 14.6. E-mail (canal opcional — Média #1)
- **Status:** ⏳ a implementar. [LACUNA: provedor — Tech Lead — D.O.D.: ADR de e-mail].

### 14.7. AWS (EC2 + CloudWatch, `sa-east-1`)
- **Status:** ✅ ativa (deploy + logs). **Decisão:** manter para o backend/motor; avaliar se o control plane fica 100% Supabase. [LACUNA: topologia final AWS×Supabase — Frank/Fefo — D.O.D.: diagrama de deploy].

---

## 15. Requisitos Não-Funcionais

### 15.1. Performance
- Latência de resposta de consulta (modo IA): alvo p95 ≤ **~15s** (limitado pelo LLM planner; guard atual: timeout 12–14s + 2 retries). [PREENCHER: SLA de produto após medir em multi-tenant]
- Carregamento de dashboard: [PREENCHER — alvo ≤ 2s].
- Upload/onboarding de planilha: inferência de schema em ≤ **10s** para planilhas típicas (< 50k linhas). [LACUNA: teto de tamanho de planilha suportado no Express — Mairão — D.O.D.: limite definido + testado].
- Cache de dados por tenant: herdar TTL 300s do `sheets_loader`, agora por (tenant, base).

### 15.2. Capacidade
- Volume por tenant: [PREENCHER — nº de linhas, nº de bases, nº de usuários por porte].
- Nº de tenants simultâneos alvo na fase 1: [LACUNA: meta de tenants pagantes em 6–12 meses — Guto — D.O.D.: meta comercial registrada].
- Concorrência: hoje `psycopg2 ThreadedConnectionPool` (min 2, max 10). Repensar pooling por tenant no FastAPI. [LACUNA: estratégia de pool multi-tenant — Frank].

### 15.3. Segurança
- HTTPS obrigatório em toda a plataforma e webhooks.
- **RLS** ativa em todas as tabelas com `tenant_id` (isolamento — R-05).
- **Read-only enforced** no data plane (R-01).
- Backend separado do frontend; rotas sensíveis/webhooks em Edge Functions (feature Alta #5).
- Política de senhas: N/A para usuários (SSO); para service accounts/tokens → rotação periódica + cofre (R-10).
- Tokens/sessão: JWT do Supabase (frontend↔API); sessão de conversa persistente com expiração (R-07).
- Proteções: rate limiting por tenant/usuário; validação estrita do plano DSL (R-11) já mitiga "SQL injection semântico"; joins bloqueados.
- **Isolamento dentro do agente de IA:** quando o data plane é compartilhado (modo `replica_isolada` no mesmo Postgres), verificar escopo de tenant **a cada passo** (planner, validação, carga, execução). *A própria lista de features levanta isso como ⚠️.*
- [LACUNA: pentest/threat model do vazamento entre tenants — Fefo — D.O.D.: checklist de isolamento aprovado + testes automatizados de "tenant A não vê dado de tenant B"].

### 15.4. LGPD / Privacidade
- Classificação de sensibilidade por coluna (alta/moderada/baixa — R-12), herdada do conceito da Pílula.
- Anonimização/mascaramento de colunas sensíveis em logs (`ai_interactions`) e para papéis sem permissão.
- Direitos do titular por tenant (acesso/retificação/exclusão) — [LACUNA: como um titular exerce direitos se o dado é do cliente e o PLUM é read-only? provavelmente encaminha ao tenant — Jurídico/Fefo — D.O.D.: fluxo LGPD documentado].
- Retenção: tenant `demo` expira em `retencao_demo_dias`; dados de tenant ativo seguem contrato. [PREENCHER política de retenção].
- DPO: [LACUNA — Poli Júnior — D.O.D.: DPO/encarregado nomeado].

### 15.5. Compatibilidade
- Browsers: últimas 2 versões de Chrome/Firefox/Safari/Edge.
- Mobile: **web responsiva** (não há app nativo na fase 1 — N5) + WhatsApp.
- Acessibilidade: WCAG 2.1 AA como referência. [PREENCHER nível de compromisso].

### 15.6. Observabilidade
- Logs estruturados por tenant; auditoria via `ai_interactions` (mantém).
- Métricas: request rate, latência do planner (`latency_ms` já capturado), taxa de erro (`error_code`: `LLM_TIMEOUT`/`LLM_ERROR`), WAU e nº de consultas por usuário (métrica de sucesso da Pílula).
- Tracing: [PREENCHER — se adotar OpenTelemetry].
- Alertas: [LACUNA: quais eventos alertam (falha de sync, pico de erro do LLM, tentativa de acesso cross-tenant) e para onde — Fefo — D.O.D.: regras de alerta configuradas no CloudWatch].

---

## 16. Catálogo de Bugs do Sistema Legado

> Todo bug tem **safeguard** no novo sistema. Fonte: RESUMO §11.

### 16.1. Bugs críticos (impacto em dados / segurança)

| # | Processo / Tela | Bug | Manifestação | Safeguard no novo sistema |
|---|---|---|---|---|
| B-01 | Modo Config (`flow_config`) | `db.admin_crud(...)` chamado mas **inexistente** em `database.py` | Painel admin de CRUD de usuários provavelmente quebra em runtime | CRUD de usuários migra para a **plataforma** (tela de admin, F-06 descontinuado no WhatsApp) com testes de integração |
| B-02 | Runtime de consulta | Runtime lê `SELECT * FROM projetos`; ETL grava em `projetos_consolidado` | Possível leitura de tabela errada/desatualizada (ou depende de view não documentada) | Conector por tenant com **nome de fonte explícito** no `tenant_bases`; teste que valida fonte lida == fonte escrita; resolver a divergência antes do cutover (ver LACUNA em §5.4) |
| B-04 | Repositório | Service account Google (`poli-jr-chatbot-*.json`) **commitado** | Credencial exposta no histórico Git | **Rotacionar credencial imediatamente**; remover do repo e do histórico (git-filter-repo/BFG); todos os segredos no cofre (R-10). ⚠️ **Ação fora do cronograma — fazer já.** |

### 16.2. Bugs funcionais / de robustez

| # | Processo / Tela | Bug | Safeguard no novo sistema |
|---|---|---|---|
| B-03 | Estado de sessão | `main.STATE` só em RAM → restart do container zera sessões/contexto | Estado **persistente** (`sessions`, §11.5) + testes de "sessão sobrevive a restart" (R-07) |
| B-05 | Carga de dados | `sheets_loader` **não lê Sheets** (lê Postgres) — nome enganoso | Renomear para o que faz (`dataset_loader`/`tenant_data_loader`); conector explícito por tipo de fonte |
| B-06 | `agent.py` | Imports duplicados/redundantes (cabeçalho repetido, `re`/`calendar` locais) | Lint/CI (ruff/flake8) no pipeline; limpeza na extração do motor para o FastAPI |
| B-07 | Canonização | Núcleo/status/nome canonizados em **dois lugares** (`planner_llm._apply_where_patches` e fallbacks do `pandas_executor`) | Canonização vira **config do dicionário por tenant** (fonte única); remover duplicação |

### 16.3. Bugs herdados de documentações anteriores

| ID | Descrição | Status |
|---|---|---|
| — | (sem PRD anterior do PLUM; este é o primeiro) | N/A |

- [LACUNA: validar em runtime quais dos itens §11 do RESUMO ainda persistem (esp. B-01 e B-02) antes do cutover — Jaques/Frank — D.O.D.: cada bug com status definitivo (reproduzido / já corrigido / não reproduzido)]

---

## 17. Dívida Técnica que NÃO deve ser herdada

Anti-requisitos — o novo sistema **falha** se reproduzir:

- **Schema/canonização hardcoded no código.** Nunca mais colunas/núcleos/status fixos em `.py` — tudo via `data_dictionary` por tenant. (justificativa: é o bloqueio nº 1 do multi-tenant)
- **Estado só em RAM.** Nenhum estado de sessão/contexto volátil. (B-03)
- **Segredos em repo/código.** (B-04, R-10)
- **Premissa single-tenant em qualquer lugar.** Toda query/consulta escopada por tenant. (R-05)
- **Dois motores coexistindo.** Consolidar no DSL; migrar `risco_operacional` e `resumo_projeto` para planos DSL e **aposentar** o catálogo legado de 22 ferramentas. (F-08)
- **Canal lateral por variável global mutável** (`_AVISOS_NOME_DUPLICADO`). Avisos devem viajar no **retorno estruturado** do executor.
- **Webhook monolítico Flask** como única porta de entrada. Substituir por API (FastAPI) + adaptadores de canal.
- **CRUD de usuário por chat.** Administração é responsabilidade da plataforma. (F-06)
- **Nomes de módulo enganosos** (`sheets_loader` que não lê Sheets). (B-05)

---

## 18. Backlog Priorizado

> **Unidade:** sprint de 2 semanas (consistente com a linguagem da Pílula). Estimativas são **grosseiras** (discovery); refinar em planning.
>
> **Nota sobre a ordenação vs. sua lista de features:** três itens que você marcou como "Alta" — **RBAC (#3), SSO (#4) e política de segurança/RLS (#5)** — são **fundação que bloqueia todo o resto**, então subiram para a categoria **Altíssima (bloqueia tudo)** do template. Suas prioridades foram respeitadas; o que mudou foi a **sequência por dependência técnica**. O mapeamento completo feature→item está em §18.5.

### 18.1. Prioridade altíssima (bloqueia tudo)

| # | Item | Critério de aceite | Estimativa |
|---|---|---|---|
| A1 | **Fundação multi-tenant + control plane** (Supabase: `tenants`, `tenant_users`, `tenant_bases`; FastAPI skeleton hospedando o motor extraído do Flask) | Provisionar 2 tenants de teste isolados; nenhuma query cruza tenant (R-05); motor DSL roda sob FastAPI sem regressão vs. Flask | 3 |
| A2 | **Auth SSO + RBAC (mestre/padrão) + fluxo de 2 etapas** (Alta #4, #3) | Login Google via Supabase; usuário nasce `pendente`; mestre libera acesso a base; usuário sem liberação é bloqueado (R-04) | 2 |
| A3 | **RLS em todas as tabelas + backend separado + Edge Functions p/ rotas sensíveis** (Alta #5) | Teste automatizado "tenant A não lê linha de tenant B"; front não acessa dado sem passar pela API/RLS | 1.5 |
| A4 | **Motor DSL tenant-aware** (dicionário dinâmico substitui `plum_schema`; prompt do planner montado do dicionário; canonização por tenant; RBAC de coluna R-03) | Mesma pergunta responde certo em 2 tenants com schemas diferentes; coluna sem permissão é mascarada; validação do plano usa `allowed_cols` do tenant (R-11) | 3 |
| A5 | **Conector de dados Express + persistência de sessão** (Sheets/Excel/CSV/SQL, read-only; `sessions` fora da RAM) | Conectar uma planilha e consultar; sessão sobrevive a restart (R-07); read-only garantido (R-01) | 2 |

*Subtotal altíssima: ~11.5 sprints* (com paralelismo entre frentes RBAC/SSO e motor, o tempo de calendário é menor — ver §22).

### 18.2. Prioridade alta

| # | Item | Critério de aceite | Estimativa |
|---|---|---|---|
| H1 | **Onboarding: upload de planilha → inferência de schema → checklist produtizado** (Alta #1 fase B + Alta #2) | Upload gera dicionário rascunho com tipos/sinônimos; checklist separa crítico×extra e **bloqueia** avanço sem crítico; revisão humana registrada (R-06) | 2.5 |
| H2 | **Demo ao vivo na AT** (Alta #1 fase A) | Planilha demo pré-pronta + chat funcional para o CN usar na AT; caminho de "promover demo → tenant real" | 1.5 |
| H3 | **Plataforma web (shell) + chat na plataforma** (base de tudo que é visual; começa aqui pois H1/H2 precisam de UI) | Login, navegação, tela de chat funcional consumindo a API | 2 |
| H4 | **Validação determinística de dados (alerta, não corrige)** (Alta #7 / Média #2) | Motor de regras por tenant; detecta anomalias óbvias (faixa, relação, tipagem, unicidade) e alerta sem alterar (R-08) | 1 |
| H5 | **Branding: cores da plataforma/LP + troca de logo** (Alta #6) | Tema aplicado; assets trocados. *Trilha paralela, baixo acoplamento (N6)* | 0.5 |

### 18.3. Prioridade média

| # | Item | Critério de aceite | Estimativa |
|---|---|---|---|
| M1 | **Multi-canal: migrar WhatsApp p/ adaptador tenant-aware + e-mail opcional** (Média #1) | WhatsApp e chat da plataforma usam o mesmo motor; identidade única por (tenant, pessoa) (R-09) | 1.5 |
| M2 | **Dashboard + insights ("por que este indicador mudou")** (Média #3) | Painel por tenant; PLUM explica variação de indicador; "transformar dados em insights acionáveis" | 2 |
| M3 | **Proatividade + FAQ por tenant** (Média #4) | Detecção de consulta recorrente; notificação in-app + WhatsApp template (janela 24h, Q-06); aba de perguntas frequentes | 2 |

### 18.4. Prioridade baixa / nice-to-have

| # | Item | Critério de aceite | Estimativa |
|---|---|---|---|
| L1 | **Follow-up automático ao entrar na plataforma** (Baixa #1) | Fluxo via n8n/Evolution; disparo no momento certo da jornada | 1 |
| L2 | **Métricas de ROI/desempenho do PLUM (antes/depois)** (Baixa #2) | Comparativo de eficiência por tenant; começar "na mão" com poucos clientes | 1 |

**Total estimado:** ~11.5 (altíssima) + ~7.5 (alta) + ~5.5 (média) + ~2 (baixa) = **~26.5 sprints de esforço** + buffer de QA + deploy + uso assistido. Com **2–3 frentes em paralelo**, o calendário de Altíssima+Alta fica em torno de **~10 sprints (~20 semanas)** — ver §22. [LACUNA: validar estimativas com a capacidade real da equipe — Jaques — D.O.D.: planning com pontos/velocity]

### 18.5. Mapeamento feature (sua lista) → backlog

| Sua feature | Prioridade original | Item backlog | Tier final |
|---|---|---|---|
| #1 Planilha → demo automática | Alta | H2 (fase A) + H1 (fase B) | Alta |
| #2 Checklist/questionário de dados | Alta | H1 | Alta |
| #3 RBAC (mestre/padrão) | Alta | A2 | **Altíssima** (fundação) |
| #4 Login via SSO (por empresa) | Alta | A2 + A1 | **Altíssima** (fundação) |
| #5 Política de segurança (RLS, backend separado, edge) | Alta | A3 | **Altíssima** (fundação) |
| #6 Cores/LP + logo | Alta | H5 | Alta (paralela) |
| #7 IA reconhece dados errados (alerta, por código) | Alta | H4 | Alta |
| Média #1 Plataforma como canal principal (+e-mail) | Média | M1 (+ H3 para a plataforma) | Média/Alta |
| Média #2 (repetição do #7) | Média | H4 | Alta |
| Média #3 Dashboard + insights | Média | M2 | Média |
| Média #4 Proatividade + FAQ | Média | M3 | Média |
| Baixa #1 Follow-up automático | Baixa | L1 | Baixa |
| Baixa #2 Métricas de ROI | Baixa | L2 | Baixa |

---

## 19. Decisões Técnicas (ADRs)

**ADR-001: Preservar o motor DSL, reconstruir a casca (refatoração parcial, não rewrite).**
- **Decisão:** manter `query_engine/` + extração determinística de `agent.py` como núcleo; reconstruir roteamento, auth, estado, multi-tenancy e UI ao redor.
- **Motivo:** o motor "LLM-planeja / código-executa" é maduro (19 arquivos de teste), é o antídoto anti-alucinação e é o diferencial de venda. Reescrevê-lo seria destruir valor e reintroduzir risco.
- **Alternativas:** rewrite total (rejeitado: custo/risco); manter tudo e só multiplicar instâncias (rejeitado: não vira produto, não escala comercialmente).
- **Status:** 🟡 Em análise (recomendação forte) — **Data:** 12/07/2026

**ADR-002: Plataforma web como superfície primária; canais plugáveis.**
- **Decisão:** construir plataforma web (React) como produto principal; WhatsApp/e-mail viram adaptadores de canal.
- **Motivo:** "prioridade TOTAL" do NI; resolve a "conversão zero" (lugar para o gestor ver valor) e habilita dashboard/onboarding/proatividade.
- **Status:** 🟡 Em análise — **Data:** 12/07/2026

**ADR-003: FastAPI (backend) + React (frontend, base Lovable).**
- **Decisão:** substituir o webhook Flask por API FastAPI que hospeda o motor; frontend React (provável scaffold Lovable + Supabase).
- **Motivo:** FastAPI é async, tipado, alinhado com a experiência do time (migração do MAISA para FastAPI/Python); o motor DSL é framework-agnóstico (pandas/Gemini), então a troca não toca o cérebro. Lovable+Supabase é o stack de front/BaaS já dominado pelo time.
- **Alternativas:** manter Flask (rejeitado para um produto com API/plataforma); Next.js SSR (avaliar se SEO da LP importar).
- **Status:** 🟡 Em análise — **Data:** 12/07/2026

**ADR-004: Modelo de multi-tenancy — control plane compartilhado (RLS) + data plane isolável por tenant.**
- **Decisão:** control plane único no Supabase com **RLS por `tenant_id`**; data plane **plugável**: por padrão `replica_isolada` (schema/DB do tenant) e, quando fizer sentido, `leitura_direta` da fonte do cliente.
- **Motivo:** equilibra custo (não subir uma instância inteira por cliente, viabilizando o Express barato) com isolamento forte; a lista de features levanta exatamente o trade-off "instâncias isoladas (mais tranquilo) vs. base compartilhada com isolamento lógico". O híbrido cobre os dois.
- **Alternativas:** instância 100% isolada por tenant (rejeitado como padrão: caro para Express, ok para Enterprise específico); base 100% compartilhada com só `tenant_id` (rejeitado: risco de isolamento no data plane).
- **Status:** 🟡 Em análise — **É o ADR mais importante; decidir cedo, pois define o schema e a estimativa** — **Data:** 12/07/2026

**ADR-005: Conector de dados Express-first, plugável, read-only.**
- **Decisão:** fase 1 suporta Sheets/Excel/CSV/SQL; "Espelho de Dados" (.xlsx/.csv em nuvem) como contorno de ERP; Enterprise (SAP/Totvs) fase 2 via NDados.
- **Motivo:** Pílula 26.1 (foco Express; não integrar ERP nativamente já).
- **Status:** 🟡 Em análise — **Data:** 12/07/2026

**ADR-006: Auth Supabase (Google SSO) + autorização em 2 etapas + RBAC 2 níveis.**
- **Decisão:** SSO autentica; mestre autoriza acesso a bases; papéis `mestre`/`padrão` extensíveis; RLS + RBAC de coluna.
- **Motivo:** features Alta #3/#4; SSO nativo do Supabase; ⚠️ SSO ≠ autorização (R-04).
- **Status:** 🟡 Em análise — **Data:** 12/07/2026

**ADR-007: Estado de sessão persistente.**
- **Decisão:** mover `main.STATE` para store persistente (Postgres/Supabase; Redis opcional p/ cache).
- **Motivo:** B-03; multi-canal e plataforma exigem estado durável.
- **Status:** 🟡 Em análise — **Data:** 12/07/2026

**ADR-008: Dicionário de dados por tenant substitui schema hardcoded.**
- **Decisão:** `plum_schema.py` (fixo) → tabela `data_dictionary` (§11.4); prompt do planner montado dinamicamente; canonização por tenant.
- **Motivo:** único caminho para multi-tenant sem editar código; unifica com onboarding/checklist/demo.
- **Status:** 🟡 Em análise — **Data:** 12/07/2026

**ADR-009: Camada de adaptadores de canal.**
- **Decisão:** interface `ChannelAdapter` (WhatsApp reaproveitando `whatsapp.py`, chat web, e-mail); Tenant Resolver por canal.
- **Status:** 🟡 Em análise — **Data:** 12/07/2026

**ADR-010: Automação (n8n/Evolution) fora do caminho crítico.**
- **Decisão:** usar n8n+Evolution só para follow-up (Baixa) e disparos agendados de proatividade; consulta em tempo real não depende disso.
- **Status:** 🟡 Em análise — **Data:** 12/07/2026

---

## 20. Riscos e Mitigações

| ID | Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|---|
| RK-1 | **Vazamento de dados entre tenants** | Média | Crítico | RLS + escopo de tenant em todo passo do agente (R-05); testes automatizados de isolamento; threat model (§15.3) |
| RK-2 | **Credencial commitada já foi exposta** | Alta | Crítico | Rotação imediata + limpeza de histórico (B-04); auditar acessos anteriores da service account |
| RK-3 | **Alucinação sobre schema arbitrário de tenant** | Média | Alto | Dicionário revisado por humano (R-06); validação de plano por `allowed_cols` do tenant (R-11); read-only (R-01) |
| RK-4 | **"Garbage in": planilha do cliente suja** | Alta | Médio | Motor de validação alerta anomalias (H4/R-08); checklist bloqueia campos críticos ausentes (H1) |
| RK-5 | **Janela de 24h do WhatsApp bloqueia proatividade** | Alta | Médio | Mensagens-template aprovadas na Meta (§13.3, Q-06); priorizar notificação in-app na plataforma |
| RK-6 | **Escopo grande + muitas frentes/donos → dispersão** | Alta | Alto | Sequência por dependência (§18); Altíssima primeiro; frentes paralelas com contrato de interface claro |
| RK-7 | **Estimativas otimistas (discovery)** | Alta | Médio | Refinar em planning; buffer de QA/uso assistido; releases incrementais |
| RK-8 | **Dependência do NDados para Enterprise atrasa vendas** | Média | Médio | Fase 1 Express-first (N1); Enterprise como trilha separada |
| RK-9 | **Custo de LLM cresce com nº de tenants/consultas** | Média | Médio | `_plano_deterministico` (bypassa LLM em perguntas frequentes) já ajuda; cache por tenant; monitorar `latency_ms`/custo |
| RK-10 | **Sem cliente-piloto real → construir no escuro** | Média | Alto | Definir piloto cedo (Q-01); demo (H2) como instrumento de discovery na AT |
| RK-11 | **Divergência `projetos`×`projetos_consolidado` esconde bug de dado** | Média | Alto | Resolver antes do cutover (LACUNA §5.4 / B-02) |

---

## 21. Critérios de Aceite e Definition of Done

### 21.1. DoD por user story
- Testes automatizados (mínimo: integração para fluxos críticos + **teste de isolamento de tenant** quando tocar dado)
- Documentação técnica atualizada (inclusive ADR se houver decisão)
- Demo realizada; aprovação do PM (Guto/Jaques)

### 21.2. DoD por sprint
- Demo com stakeholders; retrospectiva; backlog reordenado

### 21.3. DoD por fase
- **Fase 1 (Discovery):** este documento aprovado pela liderança do NI
- **Fase 2 (Fundação):** multi-tenant + auth + RLS + motor tenant-aware em homologação, com PJ como tenant nº 1
- **Fase 3 (Onboarding/Demo):** CN consegue rodar demo na AT com planilha; onboarding gera dicionário
- **Fase 4 (QA):** bug bash + testes de isolamento + regressão do motor aprovados
- **Fase 5 (Go-live):** primeiro tenant externo em produção + handover

### 21.4. Critérios de Go-Live (primeiro tenant externo)
- 100% dos bugs críticos resolvidos (B-01, B-02, B-04)
- **Testes de isolamento de tenant verdes** (R-05)
- Read-only comprovado no data plane (R-01)
- Segredos 100% em cofre; nada no repo (R-10)
- Backup configurado e testado; pipeline CI/CD (backend + frontend) funcionando
- Onboarding + demo funcionais; RBAC/SSO validados com o piloto
- Uso assistido planejado (gestão de mudança da Pílula)
- Aprovação formal de [PREENCHER: Jaques + Frank + Guto + sponsor do NI]

---

## 22. Cronograma e Marcos

> Calendário assume **2–3 frentes em paralelo** (motor/dados; RBAC/SSO/segurança; frontend). Semanas aproximadas.

| Fase | Semanas | Marco | Status |
|---|---|---|---|
| Discovery | 1–2 | Este PRD aprovado + ADR-004 decidido | 🟡 |
| Fundação (A1–A5) | 3–12 | Multi-tenant + SSO/RBAC + RLS + motor tenant-aware + conector Express; **PJ vira tenant nº 1** | ⏳ |
| Onboarding & Demo (H1–H3) + Validação (H4) + Branding (H5) | 9–18 (sobrepõe fundação) | Demo na AT funcional; onboarding gera dicionário; alerta de dados | ⏳ |
| Multi-canal & Dashboard & Proatividade (M1–M3) | 16–24 | Plataforma como canal principal + dashboard + proatividade | ⏳ |
| QA & Uso assistido | 24–26 | Testes de isolamento/regressão; primeiro tenant externo | ⏳ |
| Baixa (L1–L2) | pós-go-live | Follow-up + métricas de ROI | ⏳ |

- [LACUNA: datas absolutas dependem da capacidade da equipe e do início — Jaques — D.O.D.: cronograma com datas no planning]

---

## 23. Plano de Cutover e Descomissionamento do Legado

> Situação particular: o "legado" é a instância interna da PJ. Ele **não morre** — ele **vira o tenant nº 1** da plataforma nova.

### 23.1. Estratégia de transição
**Operação paralela → migração por fases.** O agente Flask atual continua servindo a PJ no WhatsApp enquanto a plataforma é construída. Quando o backend tenant-aware estiver estável, a PJ é provisionada como tenant nº 1 e o número de WhatsApp da PJ é **repontado** para o novo backend (adaptador). Só depois disso o Flask antigo é desligado.
- *Justificativa:* zero downtime para o uso interno; a PJ vira o melhor caso de teste de multi-tenancy (dogfooding real).

### 23.2. Migração de dados históricos
- Dados de projetos da PJ (hoje em `projetos`/`projetos_consolidado`) passam a ser o **dataset do tenant PJ**, via conector (Sheets continua como fonte, ou replica isolada). **Antes de migrar**, resolver B-02 (qual tabela é a verdade). Auditoria (`ai_interactions`) e feedback: manter histórico, adicionar `tenant_id` retroativo = PJ.
- **ADR de migração:** [LACUNA: decidir migrar histórico de conversas/auditoria ou começar limpo no tenant PJ — Jaques/Frank — D.O.D.: ADR explícita]

### 23.3. Comunicação com usuários finais
- Usuários internos da PJ (os que já usam o WhatsApp): comunicar a nova plataforma + login SSO; treinamento gravado curto (gestão de mudança).
- Materiais de apoio: manual embutido (§13.1); canal de suporte na transição.

### 23.4. Plano de rollback
- Manter o container Flask antigo **deployável** e o número de WhatsApp reversível ao webhook antigo por N dias. Gatilho de rollback: falha de isolamento, indisponibilidade do motor no FastAPI, ou regressão grave de respostas.

### 23.5. Critério de descomissionamento do Flask legado
- PJ operando como tenant nº 1 no novo backend por **≥ 30 dias sem incidentes**; paridade de respostas validada; nenhuma dependência restante do webhook antigo; aprovação do sponsor. Só então desligar a EC2/container antigo e arquivar o repo `plum-pj-main`.

---

## 24. Anexos e Referências

### 24.1. Documentos do fornecedor anterior
- N/A (produto desenvolvido internamente pelo NI; sem fornecedor terceiro).

### 24.2. Documentos do cliente
- N/A nesta fase (sem cliente externo pagante). A obter no discovery do piloto (Q-01).

### 24.3. Entregáveis do projeto atual
- Este documento — Discovery & PRD PLUM Plataforma v0.1
- `RESUMO_PLUM_AGENTE.md` — resumo técnico do agente (~10.400 linhas)
- `[NI] Pílula Comercial 26.1` — diagnóstico e processo comercial
- Lista de features priorizadas (Alta/Média/Baixa)

### 24.4. Materiais ainda a obter
| Item | Quem fornece | Quando | Status |
|---|---|---|---|
| URL do repo `plum-pj-main` + acessos | Jaques/Frank | — | ⏳ |
| DDL de `projetos` vs `projetos_consolidado` (RDS) | Jaques/Frank | — | ⏳ |
| Cofre de segredos + rotação da service account | Fefo | **urgente** | 🔴 |
| Acessos EC2/RDS/Meta/Google | Fefo | — | ⏳ |
| Cliente-piloto externo definido | Guto | — | ⏳ |
| Decisão ADR-004 (multi-tenancy) | Frank + liderança | Discovery | ⏳ |

### 24.5. Glossário
| Termo | Definição |
|---|---|
| PLUM | Assistente consultivo de dados em linguagem natural via chat, read-only (produto do NI) |
| Motor DSL | Pipeline "LLM planeja → valida → executa em pandas"; o cérebro do PLUM |
| DSL (plano) | JSON `{version, type, from, select, where, group_by, order_by, limit}` que descreve a consulta; joins bloqueados |
| Tenant | Uma empresa-cliente isolada na plataforma |
| Control plane | Banco de configuração/operação (tenants, usuários, dicionário, conversas) — Supabase |
| Data plane | Onde vivem os dados de negócio do tenant (fonte conectada ou réplica isolada) |
| Dicionário de dados | Metadados por coluna do tenant (tipo, descrição, sinônimos, criticidade, sensibilidade, RBAC) — substitui `plum_schema` |
| Usuário mestre | Admin do tenant; libera acesso a bases (passo 2 do SSO) |
| RLS | Row-Level Security (Postgres/Supabase): isolamento por `tenant_id` |
| RBAC | Controle de acesso por papel/permissão (mestre/padrão; por base/coluna) |
| Express / Enterprise | Trilhas comerciais: Plug-and-Play (Sheets/Excel/SQL) vs. complexa (ERP/ETL, feat. NDados) |
| Espelho de Dados | Contorno de ERP: exportar .xlsx/.csv diário para nuvem em vez de integração nativa |
| ITIP / Núcleo (NI/NCiv/…) | Métricas/dimensões PJ-específicas; no produto viram apenas colunas no dicionário da PJ |
| NDados | Núcleo de Dados da Poli Júnior (parceiro em vendas Enterprise) |
| CN | Consultor de Negócios (vendedor que conduz a AT) |
| AT | Apresentação Técnica (etapa comercial) |

### 24.6. Histórico de revisões
| Versão | Data | Autor | Mudanças |
|---|---|---|---|
| 0.1 | 12/07/2026 | [PREENCHER: Jaques] | Preenchimento inicial a partir de RESUMO + Pílula Comercial + backlog de features |
| 0.2 | — | — | [após decisão ADR-004 e discovery do piloto] |

### 24.7. Resumo de lacunas ainda abertas
| # | Lacuna | Quem resolve | Quando | D.O.D. |
|---|---|---|---|---|
| Q-01 | Cliente-piloto externo + dores reais (AT de diagnóstico) | Guto | — | 1 AT documentada com "3 perguntas críticas" + "custo do silêncio" |
| Q-02 | Decisão ADR-004 (modelo de multi-tenancy) | Frank + liderança | Discovery | ADR aprovada |
| Q-03 | Divergência `projetos` × `projetos_consolidado` (B-02) | Jaques/Frank | Antes do cutover | DDL colado + veredito |
| Q-04 | Manter modo Botões no WhatsApp ou aposentar? | Produto/Frank | Fase Fundação | Decisão registrada (F-05) |
| Q-05 | Granularidade do RBAC (coluna? linha? "próprias vendas"?) | Produto/David | Fase A2/A4 | Matriz de permissões do piloto |
| Q-06 | Templates de WhatsApp para proatividade (janela 24h) | David/Brunão | Fase M3 | ≥ 1 template aprovado na Meta |
| Q-07 | Identidade única (tenant, pessoa) entre canais (R-09) | David/Fefo | Fase M1 | Regra de reconciliação definida |
| Q-08 | Teto de tamanho de planilha no Express | Mairão | Fase H1 | Limite definido + testado |
| Q-09 | Política de acesso da PJ (superadmin) a dados de tenant | Fefo/Jurídico | Antes do 1º tenant externo | Política escrita + implementada |
| Q-10 | Provedor de e-mail (canal opcional) | Frank | Fase M1 | ADR de e-mail |
| Q-11 | Migrar histórico de conversas/auditoria no cutover? | Jaques/Frank | Fase de cutover | ADR de migração |
| Q-12 | DPO / encarregado LGPD | Poli Júnior | — | Nomeado |

---

## Apêndice A — Anti-patterns evitados neste preenchimento

1. **Bugs sem safeguard** → §16 tem coluna de safeguard para todos os B-##.
2. **TODOs sem dono** → toda lacuna usa `[LACUNA: o quê — quem — D.O.D.]`.
3. **Migração de dados implícita** → §23.2 + ADR de migração (Q-11) explícitos.
4. **Stack só pela documentação** → stack do legado extraída do RESUMO do código real; divergências viraram B-02/B-05.
5. **Regras só com TI** → discovery do cliente final externo marcado como Q-01 (pendente, não presumido).
6. **Não-objetivos ausentes** → §3.2 preenchida (N1–N6).
7. **Cronograma sem cutover** → §23 completa (o legado vira tenant nº 1).
8. **Numeração colidida** → IDs R-/B-/ADR-/Q-/F-/UC- sequenciais; revisar a cada fechamento de versão.

*Fim do documento — PRD PLUM Plataforma v0.1.*

