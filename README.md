# Plataforma Plum 🧠

Plataforma de processamento de dados e Chatbot impulsionada por IA. A aplicação é construída com React + Vite + TypeScript e utiliza o **Supabase** (Postgres + Edge Functions) como backend para orquestrar dados e inteligência artificial.

## Arquitetura do Banco de Dados (Supabase)

O banco de dados relacional (PostgreSQL) foi modelado para suportar **multitenancy** (múltiplas empresas isoladas), controle de acesso (RBAC) e o armazenamento do dicionário semântico gerado pelas IAs.

### Principais Tabelas

1. **`organizations`**
   - **Descrição:** Representa os clientes/empresas da plataforma. Garante que os dados sejam segregados (Multitenant).
   - **Campos chaves:** `id`, `name`, `status`.

2. **`roles` & `profiles`**
   - **Descrição:** Controle de Identidade e Acesso (RBAC). A tabela `profiles` estende o usuário de Auth nativo do Supabase (`auth.users`), associando-o a uma Organização e a uma Role.
   - **Campos chaves:** `organization_id`, `role_id` (admin, editor, viewer).

3. **`datasets` (Base de Dados do Usuário)**
   - **Descrição:** O coração do nosso Query Engine. Como os dados brutos reais residem no Google Sheets, o Plum não duplica esses dados. Em vez disso, esta tabela guarda os metadados gerados pela IA.
   - **Campos chaves:**
     - `google_sheet_id`: Link oficial da planilha gerada no Google Sheets para consultas futuras em tempo real.
     - `schema_metadata` (jsonb): ⭐ *O "Cérebro" da tabela.* Armazena um JSON consolidado com as descrições semânticas de cada coluna (para o Chatbot entender o significado) e as regras de limpeza aplicadas. Isso evita múltiplas colunas relacionais rígidas e permite escalabilidade infinita.

> Todas as tabelas são protegidas por Row Level Security (RLS) para garantir que um usuário só consiga ver dados e bases de dados pertencentes à sua própria `organization_id`.

---

## Edge Functions & Agentes de IA

Para evitar sobrecarregar o cliente front-end e garantir a segurança da API Key, a plataforma utiliza uma única **Edge Function (Deno)** no Supabase chamada `ai-agents`. Ela funciona como um roteador de agentes, otimizando os "Cold Starts" e poupando limites do plano Free.

Essa função se conecta à API do **Google Gemini (gemini-3.5-flash / gemini-pro)** e orquestra 5 subagentes distintos através da engenharia de prompt (system_instruction):

### Agentes Orquestrados

*   **Agente 0 (Guardião):** 
    Valida a segurança e o escopo do input do usuário, barrando *prompt injections* ou perguntas fora de contexto (ex: receitas, piadas). Retorna apenas "PERMITIDO" ou "BLOQUEADO".
*   **Agente 1 (Previsão Semântica):** 
    Lê o cabeçalho das colunas enviadas e as 5 primeiras linhas de amostra, gerando definições ricas do significado da coluna para a Query Engine (Chatbot) consumir no futuro. (Retorna JSON).
*   **Agente 2 (Refinamento Contínuo):** 
    Lê as edições feitas manualmente pelo usuário sobre a semântica da coluna e atua como Engenheiro de Prompt, reescrevendo a descrição para ficar perfeitamente otimizada para o LLM final ler. (Retorna JSON).
*   **Agente 3 (Formatação / Limpeza):** 
    Age como um Engenheiro de Dados. Formata valores de forma padronizada para banco de dados (ex: remove símbolos de R$, transforma em números inteiros, limpa datas). Gera um JSON duplo com as amostras formatadas e um dicionário exato de **regras aplicadas por coluna**.
*   **Agente 3.1 (Refinamento de Formatação):** 
    Um assistente interativo onde o usuário entra no "loop" de formatação. O agente pega o JSON das regras do Agente 3, analisa a crítica do usuário e gera os dados corrigidos instantaneamente.
*   **Agente de Suporte (Colunas):** 
    Agente de conversação em texto puro para tirar dúvidas do usuário no Front-end sobre por que certas colunas foram ou não detectadas durante a fase de Upload.

---

## Fluxo do Database Pipeline (Front-end)

A interface `DatabasePipeline.tsx` consome os Agentes passo-a-passo:
1. **Upload Invisível (Front-end):** A planilha (`.csv`/`.xlsx`) é lida localmente no navegador via `FileReader`. O Plum **nunca** faz upload da base bruta inteira para os servidores do Supabase. Apenas os nomes das colunas (convertidos para `snake_case`) e as 5 primeiras linhas são enviados para a IA analisar.
2. **Revisão de Colunas:** O usuário revisa as tags extraídas e pode perguntar ao **Agente de Suporte** caso falte alguma.
3. **Formatação (Agente 3 & 3.1):** A IA formata os dados e devolve as regras (`formattingRules`). O Front-end mostra o JSON e o chat do Agente 3.1 permite refinamento em tempo real.
4. **Semântica (Agente 1 & 2):** A IA tenta prever os significados das colunas (`semanticDefinitions`). O usuário altera os conceitos e o Agente 2 melhora o texto.
5. **Finalização & Exportação (Fase 5):** O Front-end mescla os JSONs das etapas 3 e 4 num grande JSON Estruturado. Essa mescla é salva no banco de dados Postgres (`schema_metadata`) enquanto a base de dados final e limpa será exportada para o Google Sheets.

---

## Setup Local

```sh
# Instalar dependências e rodar frontend
npm install
npm run dev

# Subir Edge Functions localmente na porta 9999
npx supabase functions serve
```
