// =========================================================================
// RBAC — resolução do "schema permitido" para o cérebro (R-03 do PRD)
// =========================================================================
// Dada a identidade do usuário (profile -> role), monta APENAS os datasets e
// colunas que o cargo dele pode ver. É este objeto — e nada além dele — que
// vira contexto do LLM. O usuário nunca dita org/role/colunas: tudo é derivado
// no servidor a partir do profile.
//
// Cadeia:
//   profiles(organization_id, role_id)
//     -> role_permissions[role_id] -> { dataset_id, allowed_columns[] }
//        -> datasets[dataset_id].schema_metadata.columns
//           -> interseção com allowed_columns  => AllowedSchema
//
// Regra de admin: cargo 'Admin' vê todos os datasets da org, todas as colunas.
// =========================================================================
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export interface Principal {
  profileId: string;
  organizationId: string;
  roleId: string | null;
  roleName: string | null;
  status: string;
}

export interface AllowedColumn {
  name: string;
  meaning: string;
}

export interface AllowedDataset {
  datasetId: string;
  name: string;
  columns: AllowedColumn[];
}

export type AllowedSchema = AllowedDataset[];

type SchemaMetadata = {
  columns?: Record<string, { semantic_definition?: string; cleaning_rule?: string }>;
};

function columnsFromMetadata(
  meta: SchemaMetadata | null,
  filter: (col: string) => boolean,
): AllowedColumn[] {
  const cols = meta?.columns ?? {};
  return Object.entries(cols)
    .filter(([name]) => filter(name))
    .map(([name, def]) => ({ name, meaning: def?.semantic_definition ?? "" }));
}

/**
 * Monta o AllowedSchema para um principal usando um client com service_role
 * (ignora RLS; o recorte de segurança é feito explicitamente aqui).
 */
export async function resolveAllowedSchema(
  admin: SupabaseClient,
  principal: Principal,
): Promise<AllowedSchema> {
  // Admin da org: acesso total às bases da própria organização.
  const isAdmin = (principal.roleName ?? "").toLowerCase() === "admin";

  if (isAdmin) {
    const { data: datasets, error } = await admin
      .from("datasets")
      .select("id, name, schema_metadata")
      .eq("organization_id", principal.organizationId);
    if (error) throw error;
    return (datasets ?? []).map((d) => ({
      datasetId: d.id as string,
      name: (d.name as string) ?? "",
      columns: columnsFromMetadata(d.schema_metadata as SchemaMetadata, () => true),
    }));
  }

  // Sem cargo => sem acesso a dados.
  if (!principal.roleId) return [];

  // Permissões explícitas do cargo.
  const { data: perms, error: permErr } = await admin
    .from("role_permissions")
    .select("dataset_id, allowed_columns")
    .eq("role_id", principal.roleId)
    .eq("organization_id", principal.organizationId);
  if (permErr) throw permErr;
  if (!perms || perms.length === 0) return [];

  const allowedByDataset = new Map<string, Set<string>>();
  for (const p of perms) {
    const cols = (p.allowed_columns as string[] | null) ?? [];
    allowedByDataset.set(p.dataset_id as string, new Set(cols));
  }

  // Carrega só os datasets referenciados, escopados à org (defesa em profundidade).
  const datasetIds = [...allowedByDataset.keys()];
  const { data: datasets, error: dsErr } = await admin
    .from("datasets")
    .select("id, name, schema_metadata")
    .eq("organization_id", principal.organizationId)
    .in("id", datasetIds);
  if (dsErr) throw dsErr;

  const result: AllowedSchema = [];
  for (const d of datasets ?? []) {
    const allowed = allowedByDataset.get(d.id as string);
    if (!allowed || allowed.size === 0) continue;
    const columns = columnsFromMetadata(
      d.schema_metadata as SchemaMetadata,
      (name) => allowed.has(name),
    );
    if (columns.length === 0) continue;
    result.push({
      datasetId: d.id as string,
      name: (d.name as string) ?? "",
      columns,
    });
  }
  return result;
}
