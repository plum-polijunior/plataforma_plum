# Separação Oficial da Página de Bases de Dados e Matriz de Permissões

Este plano detalha a refatoração arquitetural para desvincular definitivamente o gerenciamento de dados e permissões de bases de dados da página de gestão corporativa (`Dashboard.tsx`), centralizando todo o domínio de dados na página dedicada `Cfgdatabase.tsx` (rota `/cfgdatabase`).

## User Review Required

> [!IMPORTANT]
> **Nova Organização Visual em Cfgdatabase.tsx**
> A página `Cfgdatabase.tsx` passará a contar com duas abas principais (*Tabs*):
> 1. **Bases Conectadas**: Para conexão de planilhas e visualização de dicionários semânticos extraídos pela IA.
> 2. **Matriz de Permissões por Cargo**: Para definir exatamente quais bases e colunas cada cargo (ex: Vendedor, Gerente) pode consultar com o chat inteligente.

> [!NOTE]
> **Foco do Dashboard.tsx**
> A página `Dashboard.tsx` tornará a carregar de forma significativamente mais leve e clara, dedicada unicamente aos dados da Empresa, membros ativos/pendentes e criação/listagem de Cargos.

## Open Questions

> [!TIP]
> **Redirecionamento Rápido no Dashboard**
> Na aba "Cargos & Permissões" do `Dashboard.tsx`, recomendamos substituir o botão que abria o modal de colunas por um botão **"Configure no CfgDatabase &rarr;"** que redirecione diretamente para `/cfgdatabase?tab=permissoes`. Isso mantém a navegação fluida sem poluir o Dashboard com código da base de dados. Você concorda com esse fluxo?

## Proposed Changes

### Roteamento & Componentização Oficial

#### [MODIFY] [App.tsx](file:///c:/Bernardo/Computa%C3%A7%C3%A3o/Plataforma%20Plum/src/App.tsx)
- Ajustar a importação para apontar para o novo arquivo oficial do componente: `import CfgDatabase from "./pages/Cfgdatabase";`.
- Atualizar a rota `/cfgdatabase` para utilizar o elemento `<CfgDatabase />`.

#### [MODIFY] [Cfgdatabase.tsx](file:///c:/Bernardo/Computa%C3%A7%C3%A3o/Plataforma%20Plum/src/pages/Cfgdatabase.tsx)
- Renomear o componente principal de `DatabasePage` para `CfgDatabase`.
- Integrar a leitura de parâmetros de URL (`useSearchParams`) para permitir abrir diretamente na aba de permissões quando redirecionado do Dashboard.

---

### Migração da Lógica da Matriz de Permissões de Colunas

#### [MODIFY] [Dashboard.tsx](file:///c:/Bernardo/Computa%C3%A7%C3%A3o/Plataforma%20Plum/src/pages/Dashboard.tsx)
- **Remover Estado de Banco de Dados**: Excluir os estados `datasets`, `allRolePermissions`, `editingRole`, `rolePermissions` e `isSavingPermissions`.
- **Remover Consultas e Handlers de Datasets**: Limpar de `fetchData()` as buscas nas tabelas `datasets` e `role_permissions`. Excluir as funções auxiliares `getDatasetColumns`, `handleOpenPermissionModal`, `handleToggleDataset`, `handleToggleColumn`, `handleSetAllColumns` e `handleSavePermissions`.
- **Limpeza de UI**: Remover integralmente o `<Dialog>` da Matriz de Acesso no final do arquivo.
- **Botão de Atalho**: Na listagem de Cargos, alterar o botão *"Configurar Colunas &rarr;"* para *"Acesso às Bases &rarr;"*, executando `navigate("/cfgdatabase?tab=permissoes")`.

#### [MODIFY] [Cfgdatabase.tsx](file:///c:/Bernardo/Computa%C3%A7%C3%A3o/Plataforma%20Plum/src/pages/Cfgdatabase.tsx)
- **Implementação de Abas (*Tabs*)**: Adicionar o componente `<Tabs>` separando a visualização de "Bases Conectadas" e "Permissões de Acesso".
- **Migração do Estado e Consultas de Permissão**: Adicionar a busca de `roles` e da tabela associativa `role_permissions` ao `useEffect` de carregamento.
- **Interface da Matriz de Acesso**: Recriar de forma otimizada a interface de seleção de cargos, datasets autorizados e seleção rápida/granular das colunas liberadas para a consulta dos agentes inteligentes.

## Verification Plan

### Automated Tests
- Verificar via terminal a verificação de tipos do TypeScript e build do React sem erros de compilação:
  ```powershell
  npm run build
  ```
  *(Opção secundária rápida caso o comando de compilação TS esteja configurado no Vite).*

### Manual Verification
- Acessar `/dashboard` no navegador:
  - Navegar até a aba *Cargos & Permissões* e clicar no botão *Acesso às Bases*. Confirmar o redirecionamento imediato para a nova tela.
- Acessar `/cfgdatabase`:
  - Validar se as abas **Bases de Dados** e **Permissões de Acesso por Cargo** funcionam alternadamente de forma fluida.
  - Testar a marcação e desmarcação de colunas autorizadas em um cargo na aba de permissões e verificar a persistência correta das mudanças no banco de dados do Supabase ao clicar em *Salvar*.
