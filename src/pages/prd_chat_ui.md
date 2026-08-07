# PRD: Interface do Chat (/plum), Integração do Google Sheets & Gerenciamento de Schemas

## 1. Visão Geral
Criação da página oficial de conversação no diretório `/plum`, conectada ao backend pela Edge Function `ai-plum-chat` e salvando histórico em tempo real na tabela `plum-chat` no Supabase. 
Esta PRD também detalha a melhoria de UX na conexão do Google Sheets na Etapa 5 (modelo exclusivo de compartilhamento), a interface dedicada para edição contínua de schemas, e correções de referências da rota `/cfgdatabase` nas Edge Functions.

---

## 2. Correção Pendente no Backend (Edge Functions)
- **Atualização da rota `/cfgdatabase`**: Na importação dos dados da planilha pela IA (em "Minhas Bases de Dados"), faz-se necessário revisar as Edge Functions de IA e chamadas de resposta webhooks/helpers para assegurar que não há resquícios apontando para rotas antigas de dashboard do tempo em que as telas não eram oficialmente separadas.

---

## 3. Especificação da Interface do Chat (/plum)

### 3.1 Layout & Componentes Visualmente Complexos (Instagram Direct style)
- **Esclarecimento sobre a Dúvida de Layout:** O chat ocupará toda a tela central, mas manterá a barra lateral de navegação (Sidebar preta à esquerda com links de *Minha Organização* e *Minhas Bases de Dados*). Isso evita criar um "beco sem saída" e preserva a unidade do sistema e atalhos globais de menu.
- **Seletor Único de Base de Dados:** No topo da área principal da tela, o usuário selecionará em um menu suspenso (*Dropdown / Select*) **com qual planilha conectada quer conversar por vez** (ex: "Faturamento 2025"). O chat interage individualmente por base.
- **Balões de Mensagens com Fade e Timestamps:**
  - Todas as caixas de mensagens, de usuário e do assistente, utilizarão animações suaves de transição (*fade-in / slide-up*) usando CSS moderno.
  - Exibição visível e nítida no rodapé ou lateral inferior do balão constando **Hora e Data do Envio** (ex: `14:05 · 06/08/2026`).

---

### 3.2 Experiência de Processamento: A Barra de Progresso Simples & Humanizada
Substituímos a frase estática *"Plum está pensando"* por uma barra visual simulando a porcentagem de análise de dados.

- **Comportamento Curvado de Velocidade:**
  - **0% a 40% (Rápida - 8% ao tempo):** Conectando à base e validando contexto.
  - **40% a 90% (Média - 2.5% ao tempo):** Planejando a extração matemática e acionando Pandas.
  - **90% a 99% (Muito Lenta - 0.2% ao tempo):** Sintetizando linguagem natural final.

#### 💡 Sugestão de Código (Fake Progress Bar)
```tsx
import { useState, useEffect } from "react";
import { Progress } from "@/components/ui/progress";

export function PlumThinkingBar({ isProcessing }: { isProcessing: boolean }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!isProcessing) {
      setProgress(0);
      return;
    }
    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev < 40) return prev + 8;
        if (prev < 90) return prev + 2.5;
        if (prev < 99) return prev + 0.2;
        return prev;
      });
    }, 200);

    return () => clearInterval(timer);
  }, [isProcessing]);

  if (!isProcessing && progress === 0) return null;

  return (
    <div className="w-full max-w-xs space-y-1.5 py-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex justify-between text-xs text-muted-foreground font-medium">
        <span>Analisando base e calculando...</span>
        <span>{Math.floor(progress)}%</span>
      </div>
      <Progress value={progress} className="h-1.5 bg-muted/30 overflow-hidden" />
    </div>
  );
}
```

---

## 4. Edição de Schemas Sem Retrabalho (Página `/cfgdatabase`)

Em *"Gerencie suas planilhas conectadas e os schemas extraídos pela IA"*, ao clicar em um dataset pronto para **Editar Esquema**, a interface renderizará um painel de edição sem exigir o envio de um novo arquivo do zero:
1. **Edição do Link do Google Sheets:** Possibilitar alterar a URL do Sheets ou re-verificar permissões diretamente no painel.
2. **Edição Semântica com os Agentes de Refinamento:** Utilizar as funções do `ai-agents` (`refine_format`) em uma tela onde o cliente envia ordens (ex: *"Formate todas as datas para PT-BR"*) sobre os metadados existentes e os salva imediatamente no banco.

---

## 5. Arquitetura Exclusiva de Integração: Planilha Original do Cliente

Por decisão arquitetural e de segurança focada no mercado corporativo, o Plum **NÃO criará planilhas automaticamente**. A única forma oficial de funcionamento exigirá que o usuário forneça sua própria base.

**Como funcionará a Etapa 5 (Conexão do Sheets):**
1. O usuário cola no input da Plataforma Plum a URL da sua planilha atual de trabalho.
2. O Plum exibe o e-mail oficial do robô (ex: `plum-polijunior@plataforma-plum.iam.gserviceaccount.com`).
3. O sistema exibe um mini-tutorial instruindo claramente o usuário a fazer o seguinte fluxo no Google Sheets:
   - Clicar no botão **"Compartilhar"** no topo direito da planilha.
   - Copiar e colar o e-mail fornecido pelo Plum no campo de pessoas.
   - **Manter a permissão como "Leitor"** (isso quebra objeções de segurança corporativa).
   - Clicar em **"Concluído"**.

**Benefício Direto:** O cliente não precisa migrar seus dados, histórico, automatizações de marketing ou fórmulas para um arquivo novo. Toda a governança de acesso continua sendo dele, e manter a permissão restrita a "Leitor" transmite total segurança para departamentos de T.I.

---

## 6. Modelagem de Banco de Dados & Privacidade

### Tabela `plum-chat` no Supabase
| Coluna | Tipo | Observação |
| :--- | :--- | :--- |
| `id` | `uuid` | PK Default |
| `organization_id`| `uuid` | Isolamento estrito entre Tenants (RLS) |
| `user_id` | `uuid` | Referência a quem emitiu a requisição |
| `role` | `varchar(20)`| `'user'` ou `'assistant'` |
| `content` | `text` | Pergunta original ou Resposta do assistente |
| `assunto` | `varchar` | NOVO: Tema da pergunta sintetizado pela IA. (Nulo para as respostas da Plum, preenchido na pergunta do usuário). |
| `created_at` | `timestamptz` | Exibir data/hora no balão do frontend |

### 🧠 Categorização Inteligente de Assuntos no Chat
A nova coluna `assunto` permitirá no futuro gerar dashboards de uso, entender as dores das empresas e buscar no histórico rapidamente. Abaixo, sugestões de categorias clássicas do mundo corporativo:
- `Faturamento / Receita`
- `Controle de Estoque / Logística`
- `Desempenho de Vendas`
- `Recursos Humanos / Colaboradores`
- `Análise de Custos`
- `Presença / Engajamento`
- `Comparação de Períodos`
- `Outros`

> [!TIP]
> **Quem deve gerar o Assunto?**
> A recomendação arquitetural é delegar a síntese do `assunto` para o **Agente Z (Guardião de Contexto e Viabilidade)**. 
> 
> **Por quê?** O Agente Z já é a primeira IA a ler a mensagem para decidir se ela faz sentido para o negócio (filtrando piadas ou escopos errados). É extremamente eficiente instruí-lo a devolver um JSON contendo `{"is_valid": true, "assunto": "Faturamento / Receita"}` na mesma chamada. Assim, o Agente A fica focado unicamente na lógica matemática complexa do *Pandas Query Plan*, sem sofrer alucinações ou *"prompt bloat"*.

> [!IMPORTANT]
> **Privacidade Inicial das Conversas**
> Inicialmente o escopo do chat é **100% privado por usuário**. A política RLS no PostgreSQL irá garantir que um colaborador só consiga ler ou resgatar da tabela `plum-chat` as mensagens que ele mesmo iniciou, sem que colegas ou gestores interceptem seus relatórios na mesma tela. No futuro, haverá a possibilidade técnica (já registrada) de se tornar público dentro da org via aprovação explícita (Insight Card).
