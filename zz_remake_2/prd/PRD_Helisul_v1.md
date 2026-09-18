# PLUM — Product Requirements Document

**Poli Júnior × Helisul — Inteligência Conversacional Operacional via WhatsApp**

Plum × Helisul | Product Requirements Document — Confidencial — v1.0

| Campo | Valor |
|---|---|
| Versão | 1.0 — Versão de Trabalho (Discovery & PRD para Sistemas Existentes) |
| Data | 19/06/2026 |
| Produto | Plum — Chatbot operacional via WhatsApp (Poli Júnior) |
| Contratante | Helisul |
| Responsáveis (Poli Júnior) | Gabriel Uliana, Alexandre Delbim, Ricardo Moussalli, Caio, Mairo Quental |
| Audiência | Nathali Oliveira |
| Natureza do projeto | Sistema existente em produção — substituição do Selene-bot + automação da central (NÃO greenfield, NÃO rewrite dos sistemas de origem) |
| Status | 🟡 Em discovery — pendências técnicas e de acesso em aberto |

> **Legenda de status**
>
> 🟢 definido/pronto · 🟡 parcial / em definição · ⏳ aguardando insumo · 🔴 bloqueado/crítico
>
> **Identificadores de referência cruzada:** R# = regra de negócio · RF## = requisito funcional · RNF## = requisito não-funcional · ADR-### = decisão de arquitetura · B-## = defeito/limitação do legado · Q-## = pergunta em aberto.

---

## 1. Visão Geral e Contexto do Produto

### 1.1 O que é o Plum

O Plum é uma solução de inteligência conversacional desenvolvida pela Poli Júnior que entrega dados operacionais em tempo real diretamente no WhatsApp. O produto centraliza fontes de dados dispersas, permite consultas em linguagem natural e devolve respostas objetivas no canal onde o usuário já está.

No projeto Helisul, o Plum substitui o bot de atendimento atual (Selene-bot) e automatiza o trabalho manual hoje executado pela central de atendimento: classificar a dúvida do colaborador, consultar manualmente os sistemas internos (Cavok, Onfly, Paytrack) e responder. O Plum passa a fazer essa consulta de forma automatizada via API, com verificação de permissão por número de telefone antes de qualquer entrega de dados.

### 1.2 A solução — Conectar, Consultar, Receber

- **Conectar:** integração segura com as bases de dados de origem (via API REST/JSON dos sistemas Cavok, Onfly e Paytrack).
- **Consultar:** o colaborador pergunta em linguagem natural, como faria a um colega da central.
- **Receber:** respostas diretas entregues por WhatsApp, onde o colaborador estiver e quando precisar.

### 1.3 Contexto do cliente — Helisul

A Helisul é uma empresa de transporte e operação aérea/rodoviária (helicópteros, aviões e caminhões). A operação envolve aproximadamente 300 a 400 colaboradores distribuídos em vários estados (escalas e viagens) e frota monitorada de dezenas de aeronaves. A central de atendimento responde hoje, de forma totalmente manual, dúvidas de colaboradores (motoristas, pilotos, mecânicos e demais funcionários) via WhatsApp.

Sistemas envolvidos e seu destino no projeto:

| Sistema | Função | Destino no projeto |
|---|---|---|
| Cavok | Escala, férias e folgas; base operacional ("alicerce") que alimenta os demais setores | 🔴 MANTIDO — acessado via API (leitura) |
| Onfly | Emissão de passagens, reservas de hotel e locação de veículos | 🔴 MANTIDO — acessado via API (leitura) |
| Paytrack | Reembolsos, diárias e prestação de contas | 🔴 MANTIDO — acessado via API (leitura) |
| Selene-bot | Bot atual de SAC no WhatsApp | 🟢 SERÁ SUBSTITUÍDO pelo Plum (ADR-006) |

> **Status atual da operação**
>
> **O atendimento da Helisul está em produção real.** Métricas de junho/2026: 542 usuários atendidos no mês e média de ~10 mensagens (automatizadas ou humanas ou total?) por conversa com um mesmo usuário. Ainda a quantificar: mensagens/dia, mensagens de solicitação e mensagens de erro por falta de acesso.

⏳ **[LACUNA]** Volume de usuários ativos do atendimento-mensagens/dia, mensagens de solicitação e mensagens de erro por falta de acesso — quem resolve: Helisul (Nathali / central) — D.O.D.: número médio de colaboradores ativos/mês e pico de mensagens/dia documentados. (Q-01)

---

## 2. Problema

As reuniões de mapeamento (atas I a VI, de 08/06 a 11/06/2026, com Karla, Roberto, Aline, Simone, Nathali, Bruna e Lorenzo) identificaram os seguintes gargalos.

### 2.1 Atendimento manual e descentralizado via WhatsApp

As demandas da operação concentram-se em grupos e conversas de WhatsApp de forma desestruturada. Colaboradores enviam informações incompletas, o que gera grande volume de mensagens só para coletar dados básicos (origem, destino, turno, necessidade de hotelaria e locação). A central depende de classificação humana de cada mensagem e de consulta manual aos sistemas para responder, gerando interrupções e perda de informação.

### 2.2 Sobrecarga com demandas repetitivas

A equipe gasta tempo excessivo respondendo dúvidas rotineiras: status de solicitações de diárias, regras de recebimento (diárias parciais ou integrais), confirmação de emissão de passagens, alteração de hotel e prazos de reembolso. Parte dessas dúvidas (reembolso financeiro) sequer pertence ao escopo do setor de escalas e viagens e precisa ser redirecionada (ver R14).

### 2.3 Fragmentação de sistemas e trabalho manual

A operação está distribuída entre Cavok (escala de todo o pessoal), Onfly (passagens, hotéis, carros), Paytrack (diárias e reembolsos), Proteus ERP (contábil/financeiro) e Softview (frota rodoviária), além de dezenas de planilhas paralelas em Excel/Google Sheets. O Cavok permite projeção de escala apenas para o mês vigente, exigindo planilhas paralelas e repasse manual célula a célula todo dia 10 (o sistema não aceita upload de planilha).

### 2.4 Bot atual (Selene) com baixa atuação

O bot atual de SAC (Selene/Selene-bot, citado também como SelenaBot) apenas tria os chamados e enfrenta resistência de comandantes mais experientes, com idades e níveis de familiaridade tecnológica variados. A nova solução precisa de uma interface extremamente fluida, com transcrição de áudio e leitura de imagens, e o menor atrito possível via WhatsApp.

---

## 3. Solução Proposta

O Plum atua diretamente no WhatsApp da central de atendimento, respondendo dúvidas dos colaboradores com base nas bases de dados da Helisul acessadas via API. Automatiza o que a central fazia manualmente — consulta de informações e, para alguns casos, abertura de solicitações (encaminhadas à Central). Não há painel web ou dashboard: toda interação ocorre pelo WhatsApp. O colaborador interage exclusivamente pelo WhatsApp; a central de atendimento passa a contar com uma plataforma web de gestão para acompanhar e tratar apenas as conversas que exigem contato humano (seção 3.4).

### 3.1 Arquitetura de integração técnica

A integração é realizada via APIs REST/JSON nativas de cada sistema de origem. O Plum consome os sistemas como cliente externo, não tendo acesso a repositório, servidor ou banco de dados dessas plataformas (são de terceiros). O número de telefone de origem do WhatsApp é o identificador-âncora para resolução de identidade e escopo de qualquer consulta.

> **Pendência técnica — Acesso e documentação**
>
> **Estado atual:** a equipe ainda não possui acesso à documentação dos sistemas da Helisul. Em breve serão liberados logins próprios no Cavok, Onfly e Paytrack para exploração e identificação dos pontos de integração. O stack do novo sistema já está definido, mas não foi fornecido para este documento.

⏳ **[LACUNA]** Stack confirmada do novo sistema — quem resolve: Tech Lead (Poli Júnior) — D.O.D.: tabela de stack com componentes e versões anexada ao PRD. (Q-03)

⏳ **[LACUNA]** Logins de exploração nos sistemas — quem resolve: Helisul (TI) — D.O.D.: credenciais entregues e ambientes (homologação) acessados pela equipe. (Q-04)

### 3.2 Fluxo de dados (visão técnica)

| Etapa | Componente | Descrição técnica |
|---|---|---|
| 1 | WhatsApp | Recepção da mensagem do colaborador. O número de telefone de origem é capturado pelo provedor e repassado ao Plum como metadado verificado (não vem do corpo do texto). |
| 2 | Plum — Identidade | Resolução telefone → identidade do colaborador a partir do cadastro de funcionários (telefone presente na tabela de funcionários, ata III). Falha de cadastro encerra o atendimento (R3). |
| 3 | Plum — NLP/Intenção | Interpretação da mensagem (texto, áudio transcrito ou imagem) e classificação do comando: consulta vs. solicitação, e sistema-alvo (Cavok/Onfly/Paytrack). |
| 4 | Plum — Autorização | Verificação de permissão do colaborador para o comando, escopada pelo identificador derivado do telefone. Negado → mensagem de recusa e encerramento (R9). |
| 5 | Plum — Integração API | Requisição GET (somente leitura) ao sistema correspondente, sempre parametrizada/escopada pelo titular resolvido na etapa 2. |
| 6 | Plum — Resposta | Captura dos dados e formulação da resposta em linguagem natural. Para solicitações, aciona a Central (etapa 7). |
| 7 | Central (humano) | Para comandos de solicitação, a Central recebe o aviso, processa e executa a ação manualmente nos sistemas (nenhuma escrita via API — R8/ADR-001). |
| 8 | WhatsApp Business | Entrega da resposta ao colaborador; o atendimento é retirado da fila. |

### 3.3 Comandos atendidos — consulta × solicitação

O escopo funcional cobre os comandos abaixo, derivados do fluxograma AS-IS × TO-BE e das atas. Comandos de consulta são respondidos diretamente; comandos de solicitação são encaminhados à Central.

| Sistema | Comando / pergunta do usuário | Tipo |
|---|---|---|
| Paytrack | Receberei meu reembolso? | Consulta |
| Paytrack | Diárias foram solicitadas? | Consulta |
| Paytrack | De que tipo são as diárias? | Consulta |
| Onfly/Paytrack | Qual o hotel em que estou hospedado? | Consulta |
| Paytrack | Quero reembolso | Solicitação → Central |
| Paytrack | Preciso de diária | Solicitação → Central |
| Onfly/Paytrack | Minha passagem foi solicitada? | Consulta |
| Onfly/Paytrack | Minha passagem foi emitida? | Consulta |
| Onfly/Paytrack | Qual é a origem da passagem? | Consulta |
| Onfly/Paytrack | Qual é o destino da passagem? | Consulta |
| Onfly/Paytrack | Qual é o turno da passagem? (Diurno/Noturno) | Consulta |
| Cavok | Onde é a missão? | Consulta |
| Onfly/Paytrack | Quero passagem | Solicitação → Central |
| Cavok | Quando começa e termina a minha escala? | Consulta |
| Cavok | Quando são as minhas férias? | Consulta |
| Cavok | Até quando é a minha folga? | Consulta |

### 3.4 Plataforma web de gestão da Central

Além do atendimento no WhatsApp, a solução inclui uma plataforma web de gestão usada pela central de atendimento da Helisul. Ela existe para que a equipe acompanhe e trate apenas as conversas que exigem contato humano — as demais dúvidas, plenamente automatizáveis, são resolvidas pelo Plum sem acompanhamento necessário. A plataforma organiza-se em três áreas:

- **Gestão de conversas do WhatsApp:** visão das interações que necessitam de contato humano (solicitações e casos sem acesso), com a fila de atendimento da central.
- **Alertas e avisos:** área que sinaliza, diretamente na plataforma, as conversas que precisam de ação humana da equipe Helisul, com espaço para checar os avisos pendentes.
- **Gestão de usuários:** divide as conversas em: (a) pessoas sem acesso/permissão — não cadastradas nos sistemas da Helisul (Cavok/Onfly/Paytrack) — de (b) pessoas que abrem solicitação à central (emissão de passagem, reembolso, diária etc.).
- **Regra de triagem:** só é encaminhado à fila humana o que exige contato humano; dúvidas plenamente automatizáveis não geram acompanhamento pela central.

---

## 4. Usuários e Personas

| Persona | Perfil | Uso do Plum |
|---|---|---|
| Piloto / Comandante | Tripulação aérea; parte com baixa familiaridade tecnológica e resistência a automação (Selene) | Consultar escala, férias, folga, status/emissão de passagem e diárias; abrir solicitações que vão à Central |
| Mecânico | Equipe de manutenção; fluxo de viagens com particularidades (limite de 17 dias) | Consultar escala/folga e status de passagens e diárias |
| Colaborador administrativo | Demais funcionários com demandas de viagem | Consultas de viagem e diárias; eventual autogestão (fora desta fase) |
| Central de atendimento | Atendentes que hoje classificam e consultam manualmente; recebem as solicitações encaminhadas | Recebe do Plum os comandos de solicitação para processar e executar a ação |

---

## 5. Requisitos Funcionais

### RF01 — Recepção e interpretação de mensagens no WhatsApp

- Canal do colaborador: WhatsApp (o colaborador não usa painel web nem app adicional). A gestão pela central de atendimento ocorre em plataforma web dedicada (RF09–RF12 e seção 3.4).
- Interpretação de perguntas em linguagem natural em português, sem necessidade de comandos estruturados.
- Suporte a transcrição de mensagens de áudio e leitura de imagens, dada a baixa familiaridade tecnológica de parte dos comandantes (atas IV, V e VI).
- Mensagens de erro amigáveis quando a consulta não puder ser processada (fora de escopo, dado indisponível, sistema indisponível).

### RF02 — Identificação do colaborador por telefone

- Captura do número de telefone de origem como metadado verificado da mensagem (nunca do corpo do texto).
- Resolução telefone → identidade do colaborador a partir do cadastro de funcionários (campo de telefone na tabela de funcionários, ata III). Esta informação está no Cavok.
- Encerramento do atendimento com mensagem padrão quando o telefone não estiver cadastrado (R3).

### RF03 — Classificação de intenção e roteamento por sistema

- Classificação do comando em: consulta ou solicitação; e do sistema-alvo: Cavok, Onfly ou Paytrack.
- Roteamento conforme o mapa de comandos da seção 7.
- Tratamento de comandos fora de escopo com resposta padrão e, quando aplicável, redirecionamento (ex.: reembolso ao financeiro — R14).

### RF04 — Verificação de permissão (autorização)

- Verificação obrigatória de permissão antes de qualquer busca de dados, escopada pelo identificador derivado do telefone.
- Negado → o Plum envia mensagem negando a solicitação e encerra o atendimento; Autorizado → segue para a busca de dados.

### RF05 — Consulta de dados via API (somente leitura)

- Requisições GET às APIs de Paytrack, Onfly e Cavok, sempre parametrizadas/escopadas pelo titular resolvido.
- Nenhuma operação de escrita (POST/PUT/DELETE) nos sistemas de origem (R7, ADR-001).
- Tratamento de paginação, autenticação e reautenticação conforme cada API (seção 7).

### RF06 — Formulação e entrega da resposta

- Captura dos dados retornados e formulação de resposta em linguagem natural, contextualizada (ex.: protocolo, datas, origem/destino, valor, status).
- Entrega da resposta pelo WhatsApp e retirada do atendimento da fila.

### RF07 — Encaminhamento de solicitações à Central

- Para comandos de solicitação ("Quero passagem", "Quero reembolso", "Preciso de diária"), o Plum captura os dados informados e aciona a Central.
- A Central processa a mensagem e executa a ação manualmente; o Plum não escreve nas APIs.
- ==A emissão de passagens não fica sob responsabilidade da equipe da Poli Júnior — apenas a validação/encaminhamento (premissa da ata II) - Proposta futura -> ver Etapa 2.0==

### RF08 — Tratamento de indisponibilidade e dados ausentes

- Quando a API estiver indisponível, responder com mensagem clara e, se aplicável, sugerir nova tentativa, sem inventar dados (R12, R13).
- Quando o dado existir mas estiver incompleto (ex.: B-01 — Paytrack sem data de pagamento), informar o que é conhecido e a limitação.

### RF09 — Plataforma web: gestão de conversas

- Console web para a central visualizar e tratar as conversas do WhatsApp encaminhadas para contato humano.
- Fila de atendimento com o contexto da conversa (identificação do colaborador, tipo de demanda, sistema-alvo).

### RF10 — Plataforma web: alertas e avisos

- Sinalização, na própria plataforma, das conversas que exigem ação humana da equipe Helisul.
- Área para checar avisos pendentes e registrar a tratativa.

### RF11 — Plataforma web: fila de solicitações à Central

- Recebimento das solicitações (passagem, reembolso, diária) encaminhadas pelo Plum, para execução manual pela central (R8).
- Diferenciação entre solicitação em aberto, em tratativa e concluída.

### RF12 — Plataforma web: gestão de usuários e acessos

- Distinção entre pessoas sem acesso/permissão (não cadastradas nos sistemas da Helisul) e pessoas que abrem solicitação à central.
- Registro dos casos sem acesso para tratamento pela equipe, respeitando a LGPD (RNF10).
- Controle de acesso da própria plataforma por perfil de atendente (RNF09).

---

## 6. Requisitos Não-Funcionais e Pontos de Atenção

| ID | Categoria | Requisito | Critério de aceite |
|---|---|---|---|
| RNF01 | Latência | Tempo de resposta conversacional | Resposta de consulta entregue em poucos segundos após o recebimento da mensagem (alvo a calibrar no piloto) |
| RNF02 | Segurança | Acesso às APIs de origem | Somente leitura; nenhuma operação de escrita ou deleção em Cavok/Onfly/Paytrack |
| RNF03 | Segurança | Isolamento por titular (filtro de telefone) | Tecnicamente impossível um usuário acessar dados atrelados ao telefone de terceiros (ver seção 8) |
| RNF04 | LGPD | Tratamento de dados pessoais | Dados de colaboradores tratados conforme Lei nº 13.709/2018; base legal documentada; anonimização de PII em logs; política de retenção definida |
| RNF05 | Usabilidade | Curva de aprendizado | Comandantes e motoristas realizam consultas básicas sem treinamento técnico; suporte a áudio e imagem |
| RNF06 | Confidencialidade | Isolamento entre clientes do Plum | Dados da Helisul não compartilhados com outros clientes do Plum |
| RNF07 | Confiabilidade | Tratamento de indisponibilidade de API | Falhas de integração não expõem dados parciais nem geram respostas inventadas; mensagem de erro amigável |
| RNF08 | Observabilidade | Auditoria de acessos | Registro de quem consultou o quê e quando, com PII minimizada, para rastreabilidade |
| RNF09 | Segurança | Autenticação e autorização da plataforma web | Acesso restrito a atendentes autorizados, com autenticação forte e permissões por perfil (RBAC) e menor privilégio; a plataforma é nova superfície de ataque, não coberta pelo isolamento por telefone (seção 8) |
| RNF10 | LGPD / Observabilidade | Dados e auditoria da plataforma web | Trilha de auditoria das ações dos atendentes; gestão de sessão; tratamento LGPD também para pessoas não cadastradas registradas na área de "sem acesso" (base legal e retenção definidas) |
| RNF11 | Internacionalização | Suporte a idiomas (pt/es) | O Plum deve poder responder em espanhol quando houver demanda; entrega prevista para etapa futura (Futuro Escopo) |

### RNF09/RNF10 — política de sessão e senha da Central

Definida no card I-1 (2026-08-23). Os números e o motivo de cada um:

| Parâmetro | Valor | Por quê |
|---|---|---|
| Comprimento mínimo de senha | 12 caracteres, medidos no valor normalizado (`strip().lower()`) | NIST 800-63B. Sem regra de composição: exigir maiúscula/dígito/símbolo produz "Senha@123" e o post-it no monitor — uma frase longa é mais forte e mais fácil de lembrar |
| Lista de bloqueio | constante única `RAIZES_PROIBIDAS` (`services/password_policy.py`) — marca do cliente/produto, palavras-chave ("senha", "central", "password"...) e senhas comuns por raiz ("qwerty", "admin", "123456"...), casada como **substring** do valor normalizado, mais o local-part do e-mail do próprio usuário **a partir de 4 caracteres** (sem esse piso, um endereço curto como `ti@helisul.com` reprovava qualquer senha contendo "ti" — e no boot isso vira recusa de subir com uma mensagem que não aponta a causa) | O que é adivinhável neste contexto tem nome: o do cliente e o do produto. Substring, não igualdade exata — a revisão provou que igualdade exata é inalcançável sob um mínimo de 12 caracteres (quase nenhuma senha comum tem 12 caracteres): "helisul" barra "Helisul@2026!" pela raiz, não pelo valor inteiro |
| Bloqueio por tentativas | 5 tentativas / 300 segundos | Persistido em `seguranca_usuario` para usuário **conhecido** — sobrevive a restart e vale para todos os workers. O contador zera quando a janela expira. Para e-mail **desconhecido** o bloqueio fica em memória (limite 2, abaixo) |
| Expiração de sessão | `ACCESS_TOKEN_EXPIRE_MINUTES=720` (12h) — **e 720 também é o default do código** (`config.py`), então a instância que não define a variável fica com 12h, não com outro valor. Até a revisão final da branch o default do código era `60`, e o `.env` de produção não é cópia do `.env.example`: quem seguisse o runbook sem editar ficava com 1h enquanto este documento afirmava 12h | O tamanho de um turno: o time usa a plataforma em janelas ao longo do dia, e relogar a cada hora é atrito real. Sem refresh token e sem logout por inatividade — escolhas conscientes do dono do produto, não lacunas descobertas tarde |
| Senha inicial | gerada pelo sistema (`gerar_senha()`, 16 caracteres, alfabeto sem caracteres ambíguos — O/0/l/1/I), exibida **uma única vez** e nunca mais recuperável; troca obrigatória no primeiro login (o token provisório só alcança a rota de troca de senha) | Se o admin pudesse escolher a senha inicial, escolheria a mesma para todo mundo — "Helisul@2026" passa em qualquer regra de composição. A barreira é estrutural, não convencional |
| Hash | argon2 (já em uso) | — |

**Três limites conhecidos, declarados e não escondidos:**

1. **Estação abandonada segue autenticada por até 12h.** Consequência direta da escolha de prazo fixo sem logout por inatividade. Aceito para o piloto interno; num terminal compartilhado de central de atendimento é o cenário a revisitar primeiro se a política endurecer.
2. **Bloqueio de e-mail INEXISTENTE continua em memória**, e um restart o zera. Deliberado: bloquear uma conta que não existe não protege nada, e persistir permitiria a um atacante encher a tabela com lixo. Para usuário conhecido — o caso que importa — o bloqueio está em banco e sobrevive a restart.
3. **`PLUM_ENV=prod`, `PROD` ou `staging` sobem como desenvolvimento.** Só a grafia `production` (normalizada com `.strip().lower()`) ativa as travas de boot que dependem de `PLUM_ENV` (primeiro grupo, abaixo). Vale registrar que `/ambiente.py`, na raiz do repositório, é o predicado dono-único de "isto é produção?" do lado do bot — e prescreve a polaridade oposta (allowlist do que É dev; o que não está declarado é produção), citando nominalmente o `config.py` da Central como um dos predicados divergentes que deveria substituir. Unificar os dois é mudança de design, fora do escopo deste card — **registrado como follow-up**.

**Travas que só valem com `PLUM_ENV=production`** — remover a variável do ambiente faz o comportamento parar; para quem opera o deploy entender por que o processo recusou subir; detalhadas em `central-platform/DEPLOY.md` e `central-platform/backend/.env.example`:

- `PLUM_INGEST_SECRET` não pode ser o valor default de dev;
- `JWT_SECRET` não pode ser o valor publicado, nem um placeholder no formato `<...>`, nem ter menos de 32 caracteres;
- recusa subir se `ADMIN_EMAIL` estiver definido sem `ADMIN_SENHA_INICIAL`;
- `ADMIN_SENHA_INICIAL` tem que passar na política de senha acima;
- recusa subir se, ao final do boot, não existir nenhum admin ativo;
- nenhuma conta de exemplo é criada, e as que já existirem no banco são desativadas, com auditoria de ator `sistema/boot`;
- `/docs`, `/redoc` e `/openapi.json` ficam desligados.

**Comportamentos que valem em QUALQUER ambiente** — não são travas de produção: nem `config.py` (na primeira delas) nem `initialize_default_users` (nas outras) têm guarda de `PLUM_ENV`, e continuam ativos com `PLUM_ENV=development`:

- **`JWT_SECRET` ausente derruba o boot em qualquer ambiente** (`config.py`, corpo de `Settings`: `ValueError`). É a única trava que morde em dev e em CI, e a primeira que encontra quem clona o repositório sem criar o `.env`. Ficou fora das três listas até a revisão final da branch;
- recusa subir (`AmbienteInseguro`) se `ADMIN_EMAIL` colidir com e-mail de conta de exemplo, ou apontar para uma conta existente que não é admin;
- se o admin já existir e estiver **inativo**, o boot o **reativa**. A condição é apenas `not ativo` — reativação **não** depende de `senha_trocada_em`, e a Central afirmou o contrário em cinco lugares até a revisão final. Consequência que o operador precisa conhecer: desativar essa conta pela tela de gestão **não sobrevive a um restart** (é por isso que a tela agora recusa desativá-la, abaixo);
- se o admin já existir, o boot **rotaciona** a senha para `ADMIN_SENHA_INICIAL` enquanto ele nunca tiver trocado a própria pela plataforma (`senha_trocada_em IS NULL`) **e** o valor da variável for diferente do hash gravado. Isso acontece **uma vez, não a cada restart**: a rotação exige troca no acesso seguinte, a troca preenche `senha_trocada_em`, e nenhum boot posterior toca na senha.

**A conta apontada por `ADMIN_EMAIL` é a conta de recuperação do deploy**, e a tela de gestão de acessos a trata como tal: recusa **rebaixá-la** (rebaixar faz o boot seguinte levantar `AmbienteInseguro` e a Central não subir, com a causa desconectada no tempo de quem clicou) e recusa **desativá-la** (o boot reativa e devolve a senha do `.env`, então o gesto de resposta a incidente não sobrevive ao restart). Promover a admin, reativar e gerar senha nova continuam liberados — vão na direção do que o boot exige. Trocar a conta de recuperação é editar a variável, não a tela.

**Recuperação de senha, sem canal de e-mail:** `POST /api/users/{id}/reset-password` (admin-only) gera uma senha nova pela mesma função de `POST /users`, exibe-a uma única vez na tela, marca troca obrigatória e limpa o bloqueio por tentativas. Existe porque a alternativa medida era um beco sem saída: senha gerada perdida ⇒ recriar o e-mail dá 409, não há `DELETE`, o desbloqueio não toca no hash — a conta ficava inacessível e indeletável, e o e-mail da pessoa permanentemente queimado, com a única saída sendo o banco na instância. Não vale sobre a própria conta (para a própria senha existe `POST /auth/change-password`, que pede a senha atual).

**Não implementado, e por quê:** recuperação de senha **por e-mail** (a Central não possui canal de saída — quem recupera é o admin, pela rota acima, entregando a senha por um canal que a pessoa já use), refresh token com revogação em tempo real, e 2FA. Nenhum dos três é lacuna descoberta tarde — estão explicitamente fora do escopo deste card.

---

## 7. Mapeamento de APIs e Comandos de Usuário

Esta seção consolida a análise técnica das APIs Onfly e Paytrack (com base na documentação de integração disponibilizada) e correlaciona cada comando do usuário a uma requisição técnica. ==A API do Cavok ainda não possui documentação disponível e está marcada como lacuna em todos os pontos técnicos.==

### 7.1 API Onfly (passagens, hotéis, carros)

| Atributo | Detalhe (Onfly API v2) |
|---|---|
| Protocolo / formato | REST/HTTP; respostas em JSON, sempre dentro da chave `data` |
| Autenticação | OAuth2 (`grant_type=client_credentials`). `POST /oauth/token` devolve `access_token` Bearer; `expires_in` ≈ 31.622.400 s (~366 dias). Renovação automática recomendada |
| Cabeçalho | `Authorization: Bearer <access_token>` em toda requisição |
| Leitura / escrita | GET para ler; POST para criar/editar (não usado — modo leitura) |
| Paginação | `page` e `perPage`; `meta.pagination` traz total de páginas |
| Relacionamentos | `include` puxa objetos ligados (ex.: `include=flyOrder`, `include=user,expenditureType,rdv`) |
| Filtro por data | `startDate`/`endDate` ou `startOccurrenceDate`/`endOccurrenceDate` |
| Ordenação | `sortBy` e `sortOrder` (asc/desc) |
| Permissões | `manager` (admin) · `travel_manager` (compra para outros) · `employee` (apenas para si) |
| URL base | Confirmar a URL base exata da v2 com a Onfly (documentação pública a omite) |

**Endpoints relevantes ao escopo (módulo Travel — reservas realizadas, somente leitura):**

- Aéreo: `GET /travel/consumer/fly-traveller?include=flyOrder`
- Hotel: `GET /travel/consumer/hotel-guest?include=hotelOrder`
- Carro: `GET /travel/consumer/auto-driver?include=autoOrder`

Retornam passageiro/hóspede, valor e detalhes do pedido (protocolo, datas, origem/destino, companhia, hotel, locadora).

⏳ **[LACUNA]** Credenciais Onfly (client_id/client_secret) e confirmação da URL base v2 — quem resolve: Helisul + Onfly — D.O.D.: credenciais de integração própria emitidas e token obtido em homologação. (Q-10)

⏳ **[LACUNA]** Campo/semântica de "passagem solicitada" × "passagem emitida" no modelo Onfly e como filtrar por colaborador específico (o escopo por telefone não é parâmetro nativo) — quem resolve: Tech Lead + Onfly — D.O.D.: campos de status e estratégia de filtro por titular validados. (Q-12)

### 7.2 API Paytrack (reembolsos e diárias)

| Atributo | Detalhe (Paytrack API v1) |
|---|---|
| Protocolo / formato | REST/HTTP; respostas em JSON em estrutura padronizada |
| Autenticação | API Key / Bearer Token gerado no painel ("Permite acesso a API"). Token não expira por tempo, mas pode ser revogado |
| Cabeçalho | `Authorization: Bearer <token>` · `Content-Type: application/json` · `Accept: application/json` |
| Leitura / escrita | GET para ler; POST/PUT para criar/editar (não usado — modo leitura) |
| Paginação | `page` e `per_page` (ou `limit`/`offset`); metadados com total de registros/páginas |
| Relacionamentos | `include` ou `expand` (ex.: `include=user,cost_center,category,approver,attachments`) |
| Filtro por data | `start_date`/`end_date` ou `date_from`/`date_to` (varia por módulo) |
| Webhooks | Disponíveis para eventos em tempo real (não usados nesta fase — sem avisos proativos) |
| Permissões | `manager` · `travel_manager` · `financial_manager` · `employee` |
| Códigos HTTP | 200, 201, 400, 401 (token), 403 (sem permissão), 404, 422, 429 (rate limit), 500 |
| URL base / versionamento | Confirmar URL base e versão (/v1) com a Paytrack; documentação sob demanda |

**Endpoints relevantes ao escopo:**

- Despesas/reembolsos: `GET /api/v1/expenses`, `GET /api/v1/expenses/{id}`
- Adiantamentos/diárias: `GET /api/v1/advance-payments` (status: pendente, aprovado, em uso, prestado, devolvido)
- Prestação de contas: `GET /api/v1/expense-reports`
- Hotel: `GET /api/v1/travel/hotels`
- Pagamentos: `GET /api/v1/payments`

> **Atenção — B-01 reflete-se na API**
>
> **O Paytrack registra solicitação e aprovação, mas não a data exata de pagamento (informação no Proteus).** A resposta a "Receberei meu reembolso?" deve, portanto, informar o status (ex.: aprovado/prestado) sem prometer uma data de crédito que a API não fornece.

⏳ **[LACUNA]** Token Paytrack (usuário de integração com "Permite acesso a API") e confirmação da URL base v1 — quem resolve: Helisul + Paytrack — D.O.D.: token emitido e leitura validada em homologação. (Q-10)

⏳ **[LACUNA]** CNPJ único da Helisul; no Paytrack, porém, há diferenciação por unidade de negócio nos reembolsos — confirmar se os endpoints exigem parâmetro de unidade de negócio — quem resolve: Tech Lead + Paytrack — D.O.D.: parâmetro de empresa definido e testado. (Q-11)

⏳ **[LACUNA]** Documentação da API do módulo Travel do Paytrack (endpoints aéreo/hotel, campos de status de emissão, parâmetro de unidade de negócio) — quem resolve: Helisul + Paytrack / Tech Lead — D.O.D.: spec do módulo Travel obtida e leitura validada em homologação. Sem referência pública; obter com o acesso à plataforma. (Q-13)

### 7.3 API Cavok (escala, férias e folgas)

**CRÍTICO: ainda NÃO há informações sobre a API do Cavok.** Os campos esperados são: identificador do colaborador, datas de início/fim de escala, períodos de férias (sigla FER) e de folga (siglas FR — Folga Remunerada / FS — Folga Social), além dos códigos de status de escala (T — Translado/Trânsito, SA — Dispensa Médica). Os detalhes técnicos abaixo são placeholders e não devem ser implementados sem a especificação oficial.

| Atributo | Situação |
|---|---|
| Autenticação | [LACUNA] — método desconhecido (Q-02) |
| URL base / endpoints | [LACUNA] — não inventar endpoints do Cavok (Q-02) |
| Parâmetros / filtro por titular | [LACUNA] — desconhecido (Q-02) |
| Modelo de dados / retornos | [LACUNA] — campos esperados listados acima, sem confirmação |
| Capacidade de exportação (XLS/CSV) / liberação de logins | Incerta — levantada como dúvida nas atas III e II; encaminhada à TI da Helisul |

⏳ **[LACUNA]** Documentação da API Cavok (endpoints, auth, parâmetros, retornos) — quem resolve: Helisul (TI) / Tech Lead — D.O.D.: spec da API obtida e endpoints testados em homologação. (Q-02)

⏳ **[LACUNA]** Significado e função do campo "ID" no Cavok (propósito desconhecido na demonstração) — quem resolve: Helisul (CCQ) — D.O.D.: campo documentado e papel na resolução de identidade confirmado. (Q-05)

### 7.4 Resolução telefone → identidade e escopo por titular

O número de telefone de origem (verificado pelo WhatsApp) é o ponto de partida obrigatório. Como as APIs de Onfly e Paytrack não expõem o telefone como filtro nativo, o Plum precisa primeiro resolver telefone → identidade do colaborador (CPF / id de funcionário) — provavelmente a partir do cadastro de funcionários do Cavok, onde o telefone está presente — e então escopar as consultas de Onfly/Paytrack pelo identificador do colaborador.

### 7.5 Correlação comando → requisição técnica

Em todas as linhas, a requisição é GET (leitura) escopada pelo titular resolvido a partir do telefone. "Encaminhar à Central" significa que o Plum não escreve na API (R8). Passagem e hotel devem ser verificados tanto na Onfly quanto no Paytrack (módulo Travel) antes de responder ou encaminhar.

Nas solicitações, verificar antes de encaminhar:

- reembolso → Paytrack `GET /api/v1/expenses`
- diária → Paytrack `GET /api/v1/advance-payments`
- passagem → Onfly + Paytrack Travel [LACUNA]

Havendo divergência entre plataformas, aplica-se a regra de reconciliação R16.

| Comando do usuário | Sistema / chamada | Parâmetros e retorno esperado |
|---|---|---|
| Receberei meu reembolso? | Paytrack — `GET /api/v1/expense-reports` (`include=owner,expenses,history`) | Filtro pelo colaborador resolvido; retorno: status do relatório (aprovado/prestado/...). NÃO prometer data de pagamento (B-01) |
| Diárias foram solicitadas? | Paytrack — `GET /api/v1/advance-payments` | Filtro por colaborador; retorno: existência e status (pendente/aprovado/em uso/...) |
| De que tipo são as diárias? | Paytrack — `GET /api/v1/advance-payments/{id}` ou `/api/v1/expenses` (`include=category`) | Retorno: categoria/tipo da diária (ex.: alimentação, hospedagem) |
| Qual o hotel em que estou hospedado? | 1. Paytrack — `GET /api/v1/travel/hotels` · 2. Onfly — `GET /travel/consumer/hotel-guest?include=hotelOrder` | Retorno: estabelecimento, check-in/check-out e valor. [LACUNA: definir fonte primária do dado de hotel] |
| Quero reembolso | — (solicitação) | Encaminhar à Central com os dados informados; sem escrita na API (R8) |
| Preciso de diária | — (solicitação) | Encaminhar à Central; sem escrita na API (R8) |
| Minha passagem foi solicitada? | 1. Onfly — `GET /travel/consumer/fly-traveller?include=flyOrder` · 2. Paytrack — módulo Travel (aéreo) [LACUNA: endpoint/URL base/auth sob NDA — obter no acesso, Q-13] | Retorno: existência de pedido (flyOrder) para o colaborador. [LACUNA: campo de status "solicitada"] |
| Minha passagem foi emitida? | 1. Onfly — `GET /travel/consumer/fly-traveller?include=flyOrder` · 2. Paytrack — módulo Travel (aéreo) [LACUNA: endpoint/URL base/auth sob NDA — obter no acesso, Q-13] | Retorno: status de emissão do bilhete. [LACUNA: campo que distingue emitida × solicitada] |
| Qual é a origem da passagem? | 1. Onfly — `GET /travel/consumer/fly-traveller?include=flyOrder` · 2. Paytrack — módulo Travel (aéreo) [LACUNA: endpoint/URL base/auth sob NDA — obter no acesso, Q-13] | Retorno: origem do trecho (campo do flyOrder) |
| Qual é o destino da passagem? | 1. Onfly — `GET /travel/consumer/fly-traveller?include=flyOrder` · 2. Paytrack — módulo Travel (aéreo) [LACUNA: endpoint/URL base/auth sob NDA — obter no acesso, Q-13] | Retorno: destino do trecho |
| Qual é o turno da passagem? (Diurno/Noturno) | 1. Onfly — `GET /travel/consumer/fly-traveller?include=flyOrder` · 2. Paytrack — módulo Travel (aéreo) [LACUNA: endpoint/URL base/auth sob NDA — obter no acesso, Q-13] | Retorno: data/hora do voo; o Plum deriva turno (diurno/noturno) a partir do horário |
| Onde é a missão? | [LACUNA] — "missão" não é campo nativo Onfly; provavelmente Cavok | [LACUNA: definir origem do dado "missão" (Cavok) e mapeamento] (Q-02) |
| Quero passagem | — (solicitação) | Encaminhar à Central; emissão não fica sob a equipe Poli Júnior (ata II) |
| Quando começa e termina a minha escala? | Cavok — [LACUNA] | Retorno esperado: datas de início/fim de escala. Endpoint/auth/params [LACUNA] (Q-02) |
| Quando são as minhas férias? | Cavok — [LACUNA] | Retorno esperado: período de férias (sigla FER). [LACUNA] (Q-02) |
| Até quando é a minha folga? | Cavok — [LACUNA] | Retorno esperado: fim da folga (siglas FR/FS). [LACUNA] (Q-02) |

**Exemplos de payload (Onfly e Paytrack)**

Autenticação Onfly — `POST /oauth/token`

```json
{ "grant_type":"client_credentials", "scope":"*", "client_id":"<ID>", "client_secret":"<SECRET>" }
```

→

```json
{ "token_type":"Bearer", "expires_in":31622400, "access_token":"<TOKEN>" }
```

Leitura de reserva aérea (Onfly):

```
GET /travel/consumer/fly-traveller?include=flyOrder&page=1&perPage=10
```

Leitura de despesas (Paytrack):

```
GET /api/v1/expenses?include=user,category&per_page=50
(header Authorization: Bearer <token>)
```

---

## 8. Regras de Negócio e Segurança — Filtro por Telefone

> **Princípio de segurança nº 1 — Isolamento por titular**
>
> **O número de telefone do usuário (identificado pelo WhatsApp) é o filtro principal e OBRIGATÓRIO para qualquer coleta de informação.** Toda requisição às APIs deve ser parametrizada/escopada pelo identificador do colaborador derivado do telefone de origem verificado. Deve ser tecnicamente impossível um usuário consultar, vazar ou acessar dados atrelados ao telefone de terceiros.

### 8.1 Regras de negócio numeradas

| ID | Regra de negócio / segurança |
|---|---|
| R1 | **Filtro de telefone obrigatório:** nenhuma consulta às APIs é executada sem um identificador de colaborador derivado do telefone de origem verificado. |
| R2 | **Resolução de identidade:** o telefone de origem é resolvido para a identidade do colaborador a partir do cadastro de funcionários; o identificador resultante (não o telefone bruto) escopa as chamadas às APIs. |
| R3 | **Telefone não cadastrado:** se o telefone não corresponder a nenhum colaborador, o Plum recusa o atendimento com mensagem padrão e não realiza qualquer consulta. |
| R4 | **Proibição de identificador de terceiro:** o Plum nunca aceita telefone, CPF, nome ou ID de outra pessoa como parâmetro de consulta, mesmo que informado no texto da mensagem. |
| R5 | **Origem da identidade:** o identificador usado nas APIs vem exclusivamente do telefone de origem verificado pelo provedor de mensagens — nunca de um identificador presente no corpo do texto interpretado pelo LLM. |
| R6 | **Anti-spoofing / encaminhamento:** mensagens encaminhadas ou tentativas de spoofing não alteram o titular; o escopo segue o telefone de origem real da conversa. |
| R7 | **Somente leitura:** o Plum opera as APIs de Cavok, Onfly e Paytrack apenas em modo de leitura (GET); nenhuma escrita (POST/PUT/DELETE). |
| R8 | **Solicitações vão à Central:** comandos de solicitação (passagem, reembolso, diária) não são gravados nas APIs; o Plum captura os dados e aciona a Central, que executa a ação manualmente. |
| R9 | **Autorização antes do dado:** a permissão do colaborador para o comando é verificada antes de qualquer busca; negada → recusa e encerramento. |
| R10 | **Sem avisos proativos:** nesta fase o Plum só responde mediante pergunta do usuário; não há envios programados nem alertas proativos. |
| R11 | **Fora de escopo:** comandos fora dos sistemas suportados recebem resposta padrão informando a limitação. |
| R12 | **API indisponível:** em falha de integração, o Plum informa indisponibilidade e não retorna dados parciais nem inventados. |
| R13 | **Não inventar dados:** o Plum nunca fabrica valores; só responde com o que a API retornar para o titular. |
| R14 | **Redirecionamento de reembolso:** dúvidas de reembolso financeiro que fogem ao setor de escalas/viagens são redirecionadas ao financeiro. |
| R15 | **Sem migração:** não há migração de dados históricos; as bases permanecem nos sistemas de origem (ADR-002). |
| R16 | **Reconciliação entre plataformas:** quando passagem ou hotel forem consultados em Onfly e Paytrack e os estados divergirem, o Plum responde o status mais avançado/recente e sinaliza a divergência; a fonte-da-verdade por tipo de dado deve ser confirmada com o acesso. Nunca expor dados parciais nem inventados (R12, R13). |

### 8.2 Cadeia de segurança do filtro por telefone

1. O provedor de WhatsApp entrega ao Plum o telefone de origem como metadado verificado (canal de transporte), separado do conteúdo textual.
2. O Plum resolve telefone → identidade contra o cadastro de funcionários; falha encerra o fluxo (R3).
3. O LLM recebe a mensagem do usuário apenas como conteúdo a interpretar; o identificador de titular é injetado pelo sistema, fora do alcance do texto (R5).
4. Qualquer telefone/ID/nome citado no texto é ignorado como parâmetro de escopo (R4).
5. As chamadas de API são montadas pelo backend com o identificador do titular; o LLM não constrói o filtro de identidade (R1, R5).
6. Logs minimizam PII e registram acesso para auditoria (RNF04, RNF08).

⏳ **[LACUNA]** Tratamento de números compartilhados / um telefone para mais de um colaborador, e de colaboradores sem telefone cadastrado — quem resolve: Helisul (RH/CCQ) — D.O.D.: política definida para 1:N telefone↔pessoa. (Q-09)

---

## 9. Mapeamento AS-IS × TO-BE

| Processo | AS-IS (com Selene / manual) | TO-BE (com Plum) |
|---|---|---|
| Recepção da dúvida | Colaborador envia mensagem; atendente classifica manualmente | Plum identifica telefone e classifica a intenção automaticamente |
| Identificação do usuário | Implícita / por contexto humano | Resolução telefone → identidade com verificação de permissão (R1–R6, R9) |
| Consulta aos sistemas | Acesso manual a Cavok/Onfly/Paytrack pelo atendente | Requisição automatizada via API (somente leitura), escopada pelo titular |
| Resposta ao colaborador | Atendente formula e responde; atendimento sai da fila | Plum formula resposta em linguagem natural e responde; sai da fila |
| Solicitações (passagem/diária/reembolso) | Atendente registra e executa manualmente | Plum captura dados e aciona a Central, que executa a ação (R8) |
| Triagem por bot | Selene apenas tria; baixa adesão (B-04) | Plum conduz e finaliza consultas; interface fluida com áudio/imagem |

---

## 10. Estrutura Visual e Fluxogramas

Esta seção descreve, em passo a passo, o que cada diagrama deve representar, e reserva espaço para a equipe colar as imagens correspondentes.

### 10.1 Fluxograma 1 — AS-IS × TO-BE (referência)

Diagrama comparativo das raias do fluxo legado (Selene) e do fluxo proposto (Plum), conforme o material de mapeamento da equipe.

> 🖼 **Fluxograma 4: AS-IS × TO-BE.**
>
> *Legenda — Figura 4: comparativo AS-IS × TO-BE.*
>
> https://miro.com/app/board/uXjVHFHjzzw=/

---

## 11. Restrições e Não-Objetivos

- O colaborador NÃO usa painel web: sua interação é exclusivamente pelo WhatsApp. A central de atendimento, porém, utiliza uma plataforma web de gestão (seção 3.4 e RF09–RF12) para tratar apenas as conversas que exigem contato humano (ADR-007, que substitui a ADR-002).
- Nenhuma operação de ESCRITA nos sistemas: Cavok, Onfly e Paytrack são acessados apenas em leitura via API (R7, ADR-001).
- Solicitações de passagem, diária e reembolso NÃO vão direto às plataformas: o Plum avisa a Central, que processa e executa manualmente (R8).
- O escopo atual NÃO contempla integração com sistemas de RH ou folha de pagamento da Helisul.
- Avisos proativos / envios programados NÃO fazem parte desta entrega; o Plum só responde mediante pergunta (R10, ADR-005).
- A emissão de passagens não fica sob a responsabilidade da equipe da Poli Júnior — apenas a validação/encaminhamento (premissa da ata II).

### Futuro Escopo (Etapa 2.0)

Esta seção registra itens explicitamente FORA do escopo atual, previstos para uma etapa 2.0 (sugestão da Nathali, reunião de 07/07/2026). Complementa a seção 11 (Restrições e Não-Objetivos).

- Emissão/compra autônoma de passagens pelo Plum via WhatsApp, sem passar pela execução manual da central.
- Automatização da emissão de passagens, reembolsos e diárias diretamente nas plataformas.
- Suporte a espanhol: o Plum responder a dúvidas em espanhol (ver RNF11).
- ⚠ **Segurança:** a automação de emissão/reembolso da etapa 2.0 rompe o princípio somente-leitura (R7, ADR-001), pois passa a haver ESCRITA em sistemas de terceiros em produção. Exige nova análise de risco, autorização e ADR próprios antes de entrar em escopo.

---

## 12. Premissas Técnicas

- A Helisul disponibilizará credenciais de leitura para as APIs de Onfly e Paytrack (e, quando houver, do Cavok) em ambiente de homologação antes do desenvolvimento.
- O telefone celular do colaborador está presente na tabela de funcionários e serve como filtro de identidade do Plum (ata III).
- Os colaboradores usam WhatsApp como canal principal; parte dos comandantes tem baixa familiaridade tecnológica (suporte a áudio e imagem é necessário).
- Onfly e Paytrack expõem dados de viagens/despesas via API REST/JSON, conforme guias de integração analisados (seção 7).
- O acesso aos dados de escala/férias/folga depende da viabilidade da API do Cavok, ainda não confirmada.

---

## 13. Decisões de Arquitetura (ADRs)

| ID | Decisão | Status | Justificativa |
|---|---|---|---|
| ADR-001 | APIs em modo somente-leitura; solicitações encaminhadas à Central | Aceita | Evita risco de escrita indevida em sistemas de terceiros em produção e respeita o limite de responsabilidade da equipe. Solicitações de escrita NÃO vão às plataformas: o Plum avisa a Central, que executa manualmente. Resolve a tensão entre comandos de solicitação e o princípio read-only. |
| ADR-002 | WhatsApp como canal único (sem painel web) | Substituída | [SUBSTITUÍDA pela ADR-007: a central de atendimento passa a usar plataforma web de gestão.] |
| ADR-003 | WhatsApp como canal do colaborador (sem painel para o usuário final) | Aceita | Atende o usuário onde ele já está e reduz atrito de adoção. |
| ADR-004 | Isolamento por telefone de origem verificado | Aceita | O identificador de titular vem do canal de transporte, não do texto, tornando o vazamento entre titulares tecnicamente inviável (seção 8). |
| ADR-005 | Sem avisos proativos nesta fase | Aceita | Reduz escopo e risco; o produto genérico suporta delivery programado, mas a entrega Helisul é sob demanda. |
| ADR-006 | Substituir o Selene-bot pelo Plum | Aceita | O bot atual apenas tria e tem baixa adesão; o Plum conduz e finaliza consultas. |
| ADR-007 | Plataforma web de gestão para a central (substitui a ADR-002) | Aceita | A central precisa de um console para tratar apenas as conversas que exigem contato humano (solicitações e casos sem acesso), gerir alertas e separar usuários sem acesso de solicitantes. Introduz nova superfície de segurança, tratada em RNF09/RNF10. |

---

## 14. Fases do Projeto

| Fase | Descrição | Entregáveis principais | Status |
|---|---|---|---|
| 1 — Mapeamento | Imersão e mapeamento AS-IS com a operação (Karla, Roberto, Aline/Simone, Nathali, Bruna, Lorenzo) | Atas I–VI (08–11/06/2026); fluxograma AS-IS × TO-BE | 🟢 Concluída |
| 2 — Discovery técnico | Análise das APIs Onfly e Paytrack; definição do escopo e das regras de segurança | Este PRD; mapa de comandos × APIs | 🟡 Em andamento - Validando |
| 3 — Acessos e API Cavok | Liberação de logins de exploração e obtenção da documentação da API do Cavok (Helisul/TI) | Credenciais em homologação; spec do Cavok | ⏳ Pendente |
| 4 — Desenvolvimento | Integração via API, motor de intenção/segurança e chatbot WhatsApp; substituição do Selene | MVP com consultas e encaminhamento de solicitações | ⏳ Aguarda Fase 3 |
| 5 — Piloto | Implantação com grupo reduzido; calibração de respostas e usabilidade (áudio/imagem) | Relatório de piloto; ajustes documentados | ⏳ Planejado |
| 6 — Go-Live | Implantação para toda a operação; onboarding | Sistema em produção; métricas em acompanhamento | ⏳ Planejado |

⏳ **[LACUNA]** Duração e modelo contratual do projeto — quem resolve: Poli Júnior + Helisul — D.O.D.: cronograma e contrato formalizados. (Q-07)

---

## 15. Equipe

| Nome | Papel | Organização / observação |
|---|---|---|
| Nathali Oliveira | Gestora de Escalas e Viagem (dona do processo) | Helisul — 11 anos de experiência; apoio estratégico às regras de negócio |
| Karla Marcela Cácares | Assessora de Operações | Helisul |
| Roberto Junior | Área de Operações (logística rodoviária) | Helisul |
| Aline | Gerente de Conformidade Operacional | Helisul |
| Simone | Responsável pelo CCQ (Controle de Qualidade) | Helisul |
| Bruna Solyom | Escala e Viagens (mecânicos) | Helisul |
| Lorenzo Florencio | CCO — Centro de Controle Operacional | Helisul |

---

## 16. Glossário

| Termo | Definição |
|---|---|
| Plum | Solução de inteligência conversacional da Poli Júnior que entrega dados operacionais via chatbot no WhatsApp |
| Selene / Selene-bot | Bot atual de SAC da Helisul, que apenas tria chamados; será substituído pelo Plum |
| Cavok | Sistema base da operação ("alicerce"): escala, férias e folgas; alimenta os demais setores |
| Onfly | Plataforma de emissão de passagens e reservas de hotéis e veículos |
| Paytrack | Plataforma de diárias, reembolsos e prestação de contas |
| Proteus ERP | Sistema contábil/financeiro da Helisul (fora do escopo desta entrega) |
| Softview | Sistema de planejamento e manutenção da frota rodoviária (fora do escopo) |
| CCQ | Célula de Controle de Qualidade; recebe documentos dos voos e alimenta o Cavok |
| CCO / CSIO | Centro de Controle Operacional / Centro de Segurança e Inteligência Operacional |
| Diário de Bordo | Documento por voo, tratado como "CPF da aeronave" |
| Translado (T) | Deslocamento do colaborador para iniciar a missão; também citado como Trânsito |
| FER / FR / FS / SA | Códigos de escala no Cavok: Férias / Folga Remunerada / Folga Social / Dispensa Médica |
| AOG | Aircraft on Ground — aeronave indisponível; situação operacional crítica |
| CCT / CCP | Acordo Coletivo de Trabalho; rege descanso e limites de escala dos pilotos |
| ISA | Isenção de Tarifa Aeroportuária para voos de manutenção/treinamento (processo manual) |
| Read-only | Acesso de API apenas de leitura, sem criar, alterar ou excluir registros |
| LGPD | Lei nº 13.709/2018 — proteção de dados pessoais |
| AS-IS / TO-BE | Estado atual dos processos / estado futuro com o Plum |
| MVP | Minimum Viable Product — versão mínima funcional para validação |
| D.O.D. | Definition of Done — critério verificável de conclusão de uma lacuna |

---

*Poli Júnior — Documento Confidencial*
