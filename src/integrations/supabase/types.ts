export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string
          name: string
          join_code: string | null
          join_mode: "codigo" | "dominio"
          // Liga o caminho `ad_hoc` do remake para esta organização.
          // Conveniência de desenvolvimento, NÃO controle de segurança —
          // ver migration 20260818100000.
          remake_habilitado: boolean
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          join_code?: string | null
          join_mode?: "codigo" | "dominio"
          remake_habilitado?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          join_code?: string | null
          join_mode?: "codigo" | "dominio"
          remake_habilitado?: boolean
          created_at?: string
        }
        Relationships: []
      }
      plum_logs: {
        Row: {
          id: string
          organization_id: string
          user_id: string
          dataset_id: string | null
          sessao_id: string
          turno_id: string
          caminho: "legado" | "ad_hoc"
          etapa:
            | "guard" | "plan_query" | "execute_plan" | "synthesize_answer"
            | "porteiro" | "reconhecedor" | "planejador" | "resolvedor"
            | "autorizador" | "executor" | "interprete"
          status: "ok" | "bloqueado" | "negado" | "inviavel" | "desambiguacao" | "erro"
          codigo_erro: string | null
          modelo: string | null
          provedor: string | null
          tokens_entrada: number | null
          tokens_saida: number | null
          latencia_ms: number | null
          pedidos_qtd: number | null
          tipos_pedido: string[] | null
          linhas_origem: number | null
          linhas_brutas_entregues: number | null
          presuncoes_qtd: number | null
          rodada_extra: boolean | null
          cache_hit_a2: boolean | null
          // Saida do agente: veredito do Z, Query Plan do A, texto do C. Nunca
          // o resultado do executor nem a pergunta -- ver a migration
          // 20260818120000_plum_logs_resposta.sql.
          resposta_agente: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          // ⭐ Opcionais no Insert de propósito: o banco preenche a partir do
          // JWT (`current_org_id()` / `auth.uid()`). Mandar do cliente seria
          // reintroduzir identificador vindo do cliente (§4 regra 1).
          organization_id?: string
          user_id?: string
          dataset_id?: string | null
          sessao_id: string
          turno_id: string
          caminho: "legado" | "ad_hoc"
          etapa:
            | "guard" | "plan_query" | "execute_plan" | "synthesize_answer"
            | "porteiro" | "reconhecedor" | "planejador" | "resolvedor"
            | "autorizador" | "executor" | "interprete"
          status: "ok" | "bloqueado" | "negado" | "inviavel" | "desambiguacao" | "erro"
          codigo_erro?: string | null
          modelo?: string | null
          provedor?: string | null
          tokens_entrada?: number | null
          tokens_saida?: number | null
          latencia_ms?: number | null
          pedidos_qtd?: number | null
          tipos_pedido?: string[] | null
          linhas_origem?: number | null
          linhas_brutas_entregues?: number | null
          presuncoes_qtd?: number | null
          rodada_extra?: boolean | null
          cache_hit_a2?: boolean | null
          resposta_agente?: Json | null
          created_at?: string
        }
        // Sem Update: a tabela é append-only, e não há policy de UPDATE.
        Update: Record<string, never>
        Relationships: [
          {
            foreignKeyName: "plum_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plum_logs_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          }
        ]
      }
      roles: {
        Row: {
          id: string
          organization_id: string
          name: string
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          name: string
          created_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          name?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          }
        ]
      }
      datasets: {
        Row: {
          id: string
          organization_id: string
          name: string
          // `google_sheet_id` é a fonte da verdade (a API do Google exige o ID).
          // `google_sheet_url` existe só para exibição na tela de bases.
          // Ver migration 20260806230000_dashboard_cards.sql, bloco 4.
          google_sheet_id: string | null
          google_sheet_url: string | null
          // Nome da aba. Só é usado quando `google_sheet_gid` é nulo — nome é
          // apelido mutável, e um rename da aba quebraria a base em silêncio.
          google_sheet_tab: string
          // Identificador numérico da aba, estável a rename. Tem precedência
          // sobre `google_sheet_tab` no executor. **`0` é válido** (primeira
          // aba): qualquer `if (!gid)` aqui trata a primeira aba como ausente.
          // Ver migration 20260811000000_google_sheet_gid.sql.
          google_sheet_gid: number | null
          schema_metadata: Json | null
          sketch: Json | null
          status: string | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          name: string
          google_sheet_id?: string | null
          google_sheet_url?: string | null
          google_sheet_tab?: string
          google_sheet_gid?: number | null
          schema_metadata?: Json | null
          sketch?: Json | null
          status?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          name?: string
          google_sheet_id?: string | null
          google_sheet_url?: string | null
          google_sheet_tab?: string
          google_sheet_gid?: number | null
          schema_metadata?: Json | null
          sketch?: Json | null
          status?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "datasets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          }
        ]
      }
      role_permissions: {
        Row: {
          id: string
          organization_id: string
          role_id: string
          dataset_id: string
          allowed_columns: string[]
          created_by: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          role_id: string
          dataset_id: string
          allowed_columns?: string[]
          created_by?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          role_id?: string
          dataset_id?: string
          allowed_columns?: string[]
          created_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      profiles: {
        Row: {
          id: string
          email: string | null
          organization_id: string | null
          role_id: string | null
          status: "pendente" | "ativo" | "rejeitado" | "desativado"
          // NULL = nunca salvou preferência no servidor. Escrita só via RPC
          // definir_tema() — não existe policy de self-UPDATE em profiles.
          tema: "claro" | "escuro" | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email?: string | null
          organization_id?: string | null
          role_id?: string | null
          status?: "pendente" | "ativo" | "rejeitado" | "desativado"
          tema?: "claro" | "escuro" | null
          created_at?: string
        }
        Update: {
          id?: string
          email?: string | null
          organization_id?: string | null
          role_id?: string | null
          status?: "pendente" | "ativo" | "rejeitado" | "desativado"
          tema?: "claro" | "escuro" | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          }
        ]
      }
      organization_domains: {
        Row: {
          id: string
          organization_id: string
          domain: string
          verified: boolean
          verification_method: "admin" | "dns_txt" | null
          verified_at: string | null
          verified_by: string | null
          ms_tenant_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          domain: string
          verified?: boolean
          verification_method?: "admin" | "dns_txt" | null
          verified_at?: string | null
          verified_by?: string | null
          ms_tenant_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          domain?: string
          verified?: boolean
          verification_method?: "admin" | "dns_txt" | null
          verified_at?: string | null
          verified_by?: string | null
          ms_tenant_id?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_domains_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          }
        ]
      }
      public_email_domains: {
        Row: { domain: string }
        Insert: { domain: string }
        Update: { domain?: string }
        Relationships: []
      }
      domain_binding_audit: {
        Row: {
          id: string
          user_id: string | null
          email_domain: string | null
          organization_id: string | null
          signal: string
          result: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          email_domain?: string | null
          organization_id?: string | null
          signal: string
          result: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          email_domain?: string | null
          organization_id?: string | null
          signal?: string
          result?: string
          created_at?: string
        }
        Relationships: []
      }
      profile_changes_audit: {
        Row: {
          id: string
          profile_id: string
          organization_id: string | null
          changed_by: string | null
          field: string
          old_value: string | null
          new_value: string | null
          changed_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      // Histórico do chat, 100% privado por usuário: a RLS é `auth.uid() =
      // user_id`, nem gestor nem colega lê (CLAUDE.md §5).
      //
      // Faltava aqui desde que a tabela foi criada, e ninguém notou porque o
      // typecheck deste projeto nunca rodou de verdade: `npm run build` é só
      // `vite build`, e `tsc --noEmit` na raiz não entra nos projetos
      // referenciados. O comando que verifica é
      // `tsc -p tsconfig.app.json --noEmit`, e sem esta tabela ele acusava 13
      // erros em `PlumChat.tsx`.
      //
      // Ver migration `create_plum_chat_table.sql` — que está fora da convenção
      // de nome do CLI (sem prefixo de timestamp), como CLAUDE.md §6 registra.
      plum_chat: {
        Row: {
          id: string
          organization_id: string
          user_id: string
          // CHECK (role IN ('user','assistant')) no banco.
          role: "user" | "assistant"
          content: string
          // ⚠️ VESTIGIAL desde 2026-08-12 (migration 20260812140000): não é
          // mais escrita nem lida. O Agente Z classificava o assunto a partir
          // de uma lista aberta e o valor saía inconsistente para a mesma
          // pergunta. A coluna ficou no banco por a migration ser não
          // destrutiva (CLAUDE.md §4.9).
          assunto: string | null
          // Query Plan gerado pelo Agente A, guardado para reuso quando a
          // mesma pergunta se repete. NULL na mensagem do assistente e em
          // pergunta bloqueada pelo Agente Z.
          plan_query: Json | null
          // Base contra a qual a pergunta foi feita — faz parte da chave de
          // reuso do plano.
          dataset_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          user_id: string
          role: "user" | "assistant"
          content: string
          assunto?: string | null
          plan_query?: Json | null
          dataset_id?: string | null
          created_at?: string
        }
        Update: {
          assunto?: string | null
          content?: string
          plan_query?: Json | null
          dataset_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plum_chat_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plum_chat_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plum_chat_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          }
        ]
      }
      // Um card do dashboard é um Query Plan salvo, re-executado periodicamente.
      // Ver migration 20260806230000_dashboard_cards.sql, bloco 1.
      dashboard_cards: {
        Row: {
          id: string
          organization_id: string
          dataset_id: string
          created_by: string | null
          title: string
          // 'pinned' = nasceu de uma pergunta real; 'suggested' = proposto pelo
          // gerador (a coluna existe, o gerador ainda não).
          source: string
          origin_question: string | null
          query_plan: Json
          // Enum fechado por CHECK no banco. 'donut'/'pie' NÃO existem de
          // propósito — ver DESIGN.md §3 e §10.
          viz: "kpi" | "line" | "bar" | "stacked_bar" | "meter" | "table"
          // true=subir é bom, false=subir é ruim, null=neutro (delta sem cor).
          higher_is_better: boolean | null
          refresh_interval_minutes: number
          position: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          dataset_id: string
          // A policy de INSERT exige created_by = auth.uid(). Omitir faz o
          // Postgres recusar sem dizer qual condição falhou.
          created_by: string
          title: string
          source?: string
          origin_question?: string | null
          query_plan: Json
          viz: "kpi" | "line" | "bar" | "stacked_bar" | "meter" | "table"
          higher_is_better?: boolean | null
          refresh_interval_minutes?: number
          position?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          title?: string
          viz?: "kpi" | "line" | "bar" | "stacked_bar" | "meter" | "table"
          higher_is_better?: boolean | null
          refresh_interval_minutes?: number
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_cards_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          }
        ]
      }
      // Histórico de execuções, chaveado pela IMPRESSÃO DIGITAL DA PERMISSÃO e
      // não por role_id — revogar coluna invalida o cache sozinho. Só a Edge
      // Function escreve aqui (service role): sem policy de INSERT para
      // `authenticated`, o navegador não fabrica resultado.
      dashboard_card_snapshots: {
        Row: {
          card_id: string
          permissions_fingerprint: string
          organization_id: string
          role_id: string | null
          payload: Json
          row_count: number
          // Vestigial: o k-anonimato foi removido em 2026-08-08 e isto volta
          // sempre 0. Mantido por compatibilidade de contrato.
          suppressed_groups: number
          computed_at: string
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: "dashboard_card_snapshots_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "dashboard_cards"
            referencedColumns: ["id"]
          }
        ]
      }
      Leads: {
        Row: {
          created_at: string
          Email: string | null
          id: number
          Nome: string | null
          Telefone: string | null
        }
        Insert: {
          created_at?: string
          Email?: string | null
          id?: number
          Nome?: string | null
          Telefone?: string | null
        }
        Update: {
          created_at?: string
          Email?: string | null
          id?: number
          Nome?: string | null
          Telefone?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      resolver_codigo_organizacao: {
        Args: { p_codigo: string }
        Returns: { org_id: string; org_name: string }[]
      }
      criar_organizacao: {
        Args: { p_nome: string }
        Returns: { org_id: string; org_join_code: string }[]
      }
      definir_tema: {
        Args: { p_tema: string }
        Returns: undefined
      }
    }
    Enums: {
      user_status: "pendente" | "ativo" | "rejeitado" | "desativado"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
