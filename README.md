# Plataforma Plum 🧠

Plataforma enterprise de processamento de dados, inteligência semântica e Chatbot impulsionada por IA. A aplicação é construída com **React + Vite + TypeScript** e utiliza o **Supabase** (Postgres + Edge Functions) como backend de alta performance e segurança para orquestrar controle de acesso, dados e inteligência artificial.

---

## 🏗️ Arquitetura do Banco de Dados (Supabase)

O banco de dados relacional (PostgreSQL) foi modelado sob princípios rígidos de **Multitenancy** (isolamento total entre empresas), controle de acesso baseado em funções (**RBAC**) e proteção por **Row Level Security (RLS)** em todas as tabelas.

### Principais Tabelas

1. **`organizations`**
   - **Descrição:** Representa as empresas/organizações na plataforma.
   - **Campos chaves:** `id`, `name`, `join_code` (código criptográfico de 12 caracteres), `join_mode` (`'codigo'` ou `'dominio'`), `created_at`.
   - **Segurança:** O antigo campo `share_id` (4 caracteres) foi erradicado e substituído pelo `join_code` criptográfico.

2. **`organization_domains`**
   - **Descrição:** Mapeamento de domínios corporativos verificados e IDs de inquilinos (Google HD / Microsoft Tenant ID) para login automático via SSO.
   - **Campos chaves:** `id`, `organization_id`, `domain`, `google_hd`, `ms_tid`, `verified`.

3. **`roles` & `profiles`**
   - **Descrição:** Controle de Identidade e Acesso (RBAC). A tabela `profiles` estende a tabela nativa `auth.users`, vinculando o usuário a uma organização (`organization_id`), cargo (`role_id`) e status de aprovação (`status`: `'ativo'`, `'pendente'`, `'bloqueado'`).

4. **`datasets` (Base de Dados do Usuário)**
   - **Descrição:** O coração da nossa Query Engine. Os dados brutos residem no Google Sheets, enquanto a tabela `datasets` armazena os metadados e a inteligência gerada pelas IAs.
   - **Campos chaves:**
     - `google_sheet_id`: Identificador da planilha vinculada no Google Sheets para consultas em tempo real.
     - `schema_metadata` (jsonb): ⭐ *O "Cérebro" da base.* Guarda a definição semântica das colunas (para o Chatbot entender conceitos de negócio) e o dicionário de regras de formatação e limpeza.
     - `sketch` (jsonb): Armazena rascunhos do pipeline em andamento antes da publicação final.

5. **`domain_binding_audit`**
   - **Descrição:** Registro de auditoria para vínculos de domínio, entradas por código de convite e tentativas de cadastro.

---

## 🔐 Autenticação, SSO & Segurança (RLS & RPCs)

### Fluxo de Autenticação e Entrada em Organizações
A plataforma suporta múltiplos métodos de autenticação:
- **SSO Corporativo (Google & Microsoft Azure AD):** Roteamento automático por domínio verificado ou criação pendente com transição suave.
- **E-mail & Senha:** Login direto ou criação de nova organização.

### Funções de Segurança no Banco (Security Definer RPCs)
Para evitar vazamentos de dados e vazamentos de lista de clientes (*Tenant Enumeration*), a plataforma utiliza RPCs exclusivas executadas com privilégios de servidor:
- **`criar_organizacao(p_nome)`:** RPC que cria uma nova organização e associa o criador como Admin com `status = 'ativo'`, gerando o `join_code` criptográfico.
- **`resolver_codigo_organizacao(p_codigo)`:** RPC pública que recebe o código de convite e devolve apenas `{ org_id, org_name }`, sem expor a lista de organizações do sistema.
- **`handle_new_user()`:** Trigger acionado na criação de um usuário em `auth.users` que resolve a organização por código ou domínio de e-mail e define o status inicial.

---

## 🤖 Edge Functions & Agentes de IA (`ai-agents`)

A plataforma utiliza **Edge Functions (Deno)** no Supabase para proteger API Keys e centralizar a orquestração dos modelos do **Google Gemini (gemini-3.5-flash)**.

A Edge Function primária chamando-se `ai-agents` atua como um roteador otimizado de agentes:

| Agente | Ação (`action`) | Função |
| :--- | :--- | :--- |
| **Agente 0 (Guardião)** | `guard` | Valida a segurança e o escopo do prompt do usuário, bloqueando *prompt injections* e tópicos fora de contexto. Retorna `"PERMITIDO"` ou `"BLOQUEADO"`. |
| **Agente 1 (Previsão Semântica)** | `predict_semantics` | Analisa os cabeçalhos e amostras de dados, gerando descrições semânticas precisas para o Chatbot entender o significado de cada coluna. |
| **Agente 2 (Refinamento Contínuo)** | `refine_semantics` | Otimiza descrições semânticas editadas pelo usuário para maximizar a compreensão por modelos LLM. |
| **Agente 3 (Formatação / Limpeza)** | `format_data` | Analisa 5 linhas de dados de amostra e gera um objeto `formattingRules` com as regras de limpeza por coluna + `formattedSamples` com os dados transformados. |
| **Agente 3.1 (Refinamento de Formatação)** | `refine_format` | Recebe as `formattingRules` atuais e o feedback do usuário, alterando **apenas as regras solicitadas** e re-aplicando às amostras de dados. |
| **Agente de Suporte** | `column_support` | Assistente interativo no frontend para tirar dúvidas do usuário durante o upload sobre colunas não identificadas. |

> **Outras Edge Functions:**
> - **`send-auth-email`**: Envio de e-mails transacionais (boas-vindas, solicitações de acesso e notificações de aprovação).

---

## 🔄 Fluxo do Database Pipeline (5 Etapas)

A interface [DatabasePipeline.tsx](file:///c:/Bernardo/Computa%C3%A7%C3%A3o/Plataforma%20Plum/src/components/DatabasePipeline.tsx) guia o usuário através de um pipeline em 5 etapas:

1. **Etapa 1: Upload Invisível (Front-end):** A planilha (`.csv`/`.xlsx`) é lida localmente no navegador via `FileReader`. Nenhum dado bruto sensível é enviado inteiro para o servidor; apenas o cabeçalho e 5 linhas de amostra são processados.
2. **Etapa 2: Revisão de Colunas:** Normalização dos nomes para `snake_case` e suporte tira-dúvidas sobre o cabeçalho da linha 1.
3. **Etapa 3: Formatação (Agentes 3 & 3.1):** A IA sugere regras de limpeza (`formattingRules`) e exibe o "Antes vs Depois". O usuário pode usar o chat interativo com o **Agente 3.1** para fazer ajustes pontuais que são refletidos em tempo real.
4. **Etapa 4: Semântica (Agentes 1 & 2):** A IA gera a definição de negócio de cada coluna (`semanticDefinitions`). O usuário pode ajustar os conceitos.
5. **Etapa 5: Finalização & Persistência:** Os metadados consolidados (`schema_metadata`) são salvos na tabela `datasets` do Postgres no Supabase, enquanto a base de dados tratada é vinculada ao Google Sheets.

---

## 🚀 Setup & Desenvolvimento Local

```sh
# 1. Instalar dependências
npm install

# 2. Iniciar servidor de desenvolvimento (Vite)
npm run dev

# 3. Validar tipagem TypeScript
npx tsc --noEmit

# 4. (Opcional) Executar Edge Functions localmente
npx supabase functions serve
```
