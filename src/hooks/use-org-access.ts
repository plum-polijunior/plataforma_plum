import { useState, useEffect } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/**
 * Estados de acesso pós-login, conforme a spec de SSO por domínio:
 *
 *  - `anonimo`   → sem sessão, manda para /auth
 *  - `sem-org`   → autenticado mas sem organização (domínio não verificado,
 *                  não mapeado, ou provedor público). Não vê dado nenhum.
 *  - `pendente`  → vinculado à org, aguardando liberação do admin. Acesso
 *                  limitado: NÃO lê dados.
 *  - `ativo`     → acesso liberado ao dashboard da org.
 *  - `bloqueado` → rejeitado / desativado pelo admin.
 */
export type OrgAccessState =
  | "carregando"
  | "anonimo"
  | "sem-org"
  | "pendente"
  | "ativo"
  | "bloqueado";

export interface OrgAccess {
  state: OrgAccessState;
  session: Session | null;
  organizationId: string | null;
  organizationName: string | null;
  roleName: string | null;
}

/** Claims injetadas pelo Custom Access Token Hook. */
interface PlumClaims {
  organization_id?: string | null;
  profile_status?: string | null;
  role_name?: string | null;
}

function lerClaims(session: Session | null): PlumClaims | null {
  const token = session?.access_token;
  if (!token) return null;
  try {
    const payload = token.split(".")[1];
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as PlumClaims;
  } catch {
    return null;
  }
}

function statusParaEstado(status: string | null | undefined, orgId: string | null): OrgAccessState {
  if (!orgId) return "sem-org";
  switch (status) {
    case "ativo":
      return "ativo";
    case "pendente":
      return "pendente";
    case "rejeitado":
    case "desativado":
      return "bloqueado";
    default:
      return "sem-org";
  }
}

export function useOrgAccess(): OrgAccess {
  const [access, setAccess] = useState<OrgAccess>({
    state: "carregando",
    session: null,
    organizationId: null,
    organizationName: null,
    roleName: null,
  });

  useEffect(() => {
    let cancelado = false;

    async function resolver(session: Session | null) {
      if (!session) {
        // Se estamos no meio do callback do SSO (tem access_token na URL),
        // o Supabase ainda está processando. Não podemos setar "anonimo"
        // senão o roteador destrói a URL antes de salvar a sessão!
        if (window.location.hash.includes("access_token=") || window.location.hash.includes("error=")) {
          return;
        }

        if (!cancelado) {
          setAccess({
            state: "anonimo",
            session: null,
            organizationId: null,
            organizationName: null,
            roleName: null,
          });
        }
        return;
      }

      // Caminho preferencial: claims do JWT (servidor é a fonte da verdade).
      const claims = lerClaims(session);
      let orgId = claims?.organization_id ?? null;
      let status = claims?.profile_status ?? null;
      let roleName = claims?.role_name ?? null;

      // Fallback para sessões emitidas antes do hook entrar no ar.
      if (status === null || status === undefined) {
        const { data } = await supabase
          .from("profiles")
          .select("organization_id, status, roles(name)")
          .eq("id", session.user.id)
          .maybeSingle();

        orgId = (data?.organization_id as string | null) ?? null;
        status = (data?.status as string | null) ?? null;
        roleName =
          ((data as unknown as { roles?: { name?: string } } | null)?.roles?.name) ?? null;
      }

      let orgName: string | null = null;
      if (orgId) {
        const { data: org } = await supabase
          .from("organizations")
          .select("name")
          .eq("id", orgId)
          .maybeSingle();
        orgName = org?.name ?? null;
      }

      if (!cancelado) {
        setAccess({
          state: statusParaEstado(status, orgId),
          session,
          organizationId: orgId,
          organizationName: orgName,
          roleName,
        });
      }
    }

    supabase.auth.getSession().then(({ data: { session } }) => resolver(session));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      resolver(session);
    });

    return () => {
      cancelado = true;
      subscription.unsubscribe();
    };
  }, []);

  return access;
}
