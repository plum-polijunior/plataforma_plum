# Incidente 2026-07-22 — Escalonamento de privilégio via `raw_user_meta_data`

**Severidade:** Alta · **Classe:** OWASP A01 (Broken Access Control)
**Status:** correção escrita · ⬜ aplicada · ⬜ levantamento concluído

---

## O que era

`public.handle_new_user()` lia `organization_id` **e** `status` de
`new.raw_user_meta_data` — campo preenchido livremente pelo cliente na chamada
de `signUp`. O banco obedecia.

```js
supabase.auth.signUp({
  email, password,
  options: { data: { organization_id: '<uuid alvo>', status: 'ativo' } }
})
```

Resultado: entrada em **qualquer organização**, já como membro **ativo**, sem
aprovação de ninguém. Não exigia ferramenta nem conhecimento especial — apenas
o console do navegador e dois campos a mais.

**Agravante:** a policy de `UPDATE` em `profiles` permitia que qualquer membro
alterasse qualquer perfil da mesma organização, inclusive o próprio `status`.
Um membro `pendente` se auto-promovia a `ativo`.

**Alcance:** com `status = 'ativo'`, todas as policies de RLS existentes
liberavam leitura de `datasets`, `role_permissions`, `roles` e `profiles` da
organização — nenhuma delas checava status.

## Origem

Introduzido junto com o fluxo de organizações em `login_supabase.sql`
(linhas 63–71). O front alimentava o padrão em `Auth.tsx` enviando
`status: 'pendente'` no cadastro e `status: 'ativo'` na criação de org.

---

## Correção

Commit isolado, separado do PR de SSO, para que a data do fix seja
respondível: **`supabase/migrations/20260722110000_hotfix_escalonamento_privilegio.sql`**

1. `status` nunca mais é lido do cliente — definido no servidor (`'ativo'`
   só para quem cria a própria organização, `'pendente'` nos demais casos).
2. `organization_id` do cliente vira org **candidata**, validada contra
   `organizations`.
3. `UPDATE` em `profiles` restrito a admins e proibido sobre o próprio
   registro.
4. `INSERT` arbitrário em `organizations` removido; `anon` perde escrita no
   control plane.

O roteamento por domínio (SSO) vai na migration seguinte, `20260722120000`,
deliberadamente separado.

---

## Runbook — ordem obrigatória

> A ordem importa: o levantamento lê `raw_user_meta_data` de registros
> existentes. Aplicar a migration antes **não apaga** esse rastro (o campo é
> histórico e não é reescrito), mas rodar o levantamento primeiro elimina
> qualquer dúvida sobre contaminação.

1. **Backup do schema** (`Database → Backups`, ou `pg_dump --schema-only`).
2. **Rodar o levantamento:**
   `supabase/forensics/2026-07-22_levantamento_escalonamento.sql` — somente
   leitura, 6 consultas.
3. **Registrar o resultado na seção abaixo**, inclusive se for "nada".
4. **Aplicar o hotfix** `20260722110000` — em staging se existir; se não
   existir, em produção mesmo, em horário de baixo uso. *A brecha aberta é
   pior que o risco da migration.*
5. **Aplicar a migration de SSO** `20260722120000`.
6. **Rodar os testes:** `supabase/tests/sso_dominio_test.sql`.
7. **Registrar o hook** no painel (`Authentication → Hooks`) — ver
   [SSO-DOMINIO.md](./SSO-DOMINIO.md).

---

## Limitações do levantamento

Registrar junto com o resultado, porque muda o que se pode afirmar:

- **Não existe tabela de auditoria** no schema anterior.
- **`profiles` não tem `updated_at`** — é impossível saber *quando* um status
  mudou, ou *quem* mudou.
- Portanto: as consultas detectam **anomalias**, não provam exploração.
  Consulta 1 vazia é evidência forte de que ninguém passou. Consulta 1 com
  linhas exige conferência **uma a uma** — não descartar em bloco.
- O padrão legítimo do front (`status: 'pendente'` no cadastro comum,
  `is_admin_setup: 'true'` na criação de org) **também** aparece na Consulta 1.
  A coluna `triagem` separa o esperado do que precisa investigação.

---

## Resultado do levantamento

> ⬜ **A PREENCHER** — obrigatório mesmo que o resultado seja "nada encontrado".

| Campo | Valor |
|---|---|
| Data/hora da execução | |
| Quem executou | |
| Consulta 1 — total de linhas | |
| Consulta 1 — linhas marcadas `>>> INVESTIGAR` | |
| Consulta 2 — membros ativos de domínio divergente | |
| Consulta 3 — orgs com múltiplos domínios | |
| Consulta 4 — ativos com e-mail de provedor público | |
| Consulta 5 — ativos sem `is_admin_setup` | |
| Consulta 6 — usuários / perfis / orgs | |

**Conclusão:** ⬜ nenhum indício · ⬜ indícios encontrados (detalhar abaixo)

**Contas conferidas individualmente:**

| E-mail | Organização | Status | Veredito | Ação tomada |
|---|---|---|---|---|
| | | | | |

**Se houver indícios confirmados, avaliar:**
- Rebaixar as contas afetadas para `pendente` e reconferir com o admin da org.
- Notificar os clientes cujos dados possam ter sido acessados.
- Verificar se houve leitura de `datasets` dessas orgs.

---

## Dívida técnica aberta por este incidente

| Item | Detalhe |
|---|---|
| `share_id` de 4 caracteres | Espaço de busca pequeno (~1,7M combinações alfanuméricas) — varrível. Risco hoje contido: só define org candidata, e o pior caso é virar `pendente` numa org errada. **Requer que aprovar um pendente seja ato de conferência, não formalidade.** Avaliar rate limit na rota de busca. |
| Sem `updated_at` em `profiles` | Impede forense de mudanças de status. Considerar coluna + trigger. |
| Edge Functions não versionadas | `send-auth-email` e `ai-agents` têm fonte solta na raiz do repo, fora de `supabase/functions/`. Deploy manual pelo painel, sem rastreabilidade. |
| RLS sem checagem de status | Corrigido na migration de SSO, mas nasceu junto com o schema — revisar qualquer policy futura pelo mesmo critério. |
