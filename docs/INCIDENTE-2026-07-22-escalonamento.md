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

## Resultado do levantamento — CONCLUÍDO em 22/07/2026

**Conclusão: nenhum indício de exploração externa.**

| Campo | Valor |
|---|---|
| Data da conclusão | 22/07/2026 |
| Total de contas na base | **9** |
| Organizações | 6, **todas de teste** |
| Contas `@polijunior.com.br` | 4 |
| Contas `@gmail.com` | 5 (contas pessoais do time, usadas para testar o login) |
| Contas `pendente` | 1 |
| Clientes reais na plataforma | **nenhum** |
| RLS habilitada | sim, nas 6 tabelas de `public` |

**Contas conferidas:**

| E-mail | Organização | Status | Veredito |
|---|---|---|---|
| bernardo.machado@polijunior.com.br | NI | ativo | teste interno |
| bernardohenriquesgm06a@gmail.com | NI | ativo | teste interno |
| jose.quental@polijunior.com.br | Los Inovadores | ativo | teste interno |
| ricardo.moussalli@polijunior.com.br | Caqui | ativo | teste interno |
| kakamoussalli@gmail.com | Caqui | ativo | teste interno |
| carlos.jaques@polijunior.com.br | Jaques | ativo | teste interno |
| carlosrichelieu1@gmail.com | Jaques | pendente | teste interno |
| alexandredelbim@gmail.com | Babygoat | ativo | teste interno |
| allekka5454@gmail.com | Babygoat2 | ativo | teste interno |

**Nota metodológica.** A consulta baseada em `raw_user_meta_data ? 'status'` mostrou-se
inútil como indicador de anomalia: o próprio front enviava esse campo em **todo** cadastro
(`Auth.tsx:107` e `Auth.tsx:173` na versão anterior ao hotfix). O que fechou a auditoria foi
a conferência nominal das contas com o time.

**Correção de contagem.** O levantamento inicial registrou 8 contas; a consulta ao banco
retornou **9**. Uma conta ficou fora da conferência nominal original. Como todas as 6
organizações são de teste e não há cliente real na plataforma, o impacto é nulo — mas o
número correto é 9.

**Veredito:** a vulnerabilidade S-01 foi identificada e corrigida **antes** de qualquer
cliente real entrar na plataforma. Janela de exposição curta, sem dado de terceiro atrás
dela. Nenhuma notificação a titular de dados é necessária.

---

## Achado colateral — `polijunior.com.br` em 4 organizações

`bernardo.machado` (NI), `jose.quental` (Los Inovadores), `ricardo.moussalli` (Caqui) e
`carlos.jaques` (Jaques) compartilham o mesmo domínio de e-mail.

Como `organization_domains.domain` tem constraint `UNIQUE`, **um domínio mapeia para no
máximo uma organização**. Verificar `polijunior.com.br` faria apenas uma das quatro receber
roteamento automático.

Não é defeito: é o modelo de tenant por domínio funcionando. Consequência operacional
registrada: as 6 organizações existentes recebem `join_mode = 'share_id'` no backfill da
migration `20260722130000`, nunca `'dominio'`.

---

## Dívida técnica aberta por este incidente

| Item | Detalhe |
|---|---|
| 🔴 **`Leads` aberta para qualquer autenticado** | Policy `Allow authenticated all on Leads` (`ALL`, `qual: true`) — qualquer conta autenticada, de qualquer organização, **lê, altera e apaga** todo o pipeline comercial da Poli Júnior. Mantida intocada por decisão explícita (D-13). Risco hoje aceito porque só há contas do próprio time na base. **Gatilho: fechar esta policy ANTES da criação do primeiro usuário de cliente real.** A partir desse momento, qualquer conta de cliente tem acesso total aos leads. A policy de `INSERT` anônimo (formulário da landing) é legítima e permanece. |
| ~~`share_id` de 4 caracteres~~ | ✅ **Resolvido** na `20260722130000`: `join_code` de 12 caracteres com aleatoriedade criptográfica e `UNIQUE`. `share_id` segue preenchido e aceito por compatibilidade com as orgs de teste. |
| ~~Sem `updated_at` em `profiles`~~ | ✅ **Resolvido** na `20260722130000`: coluna + trigger, mais a tabela append-only `profile_changes_audit` registrando `status`, `role_id` e `organization_id` (quem, de → para, quando). |
| Edge Functions não versionadas | `send-auth-email` e `ai-agents` têm fonte solta na raiz do repo, fora de `supabase/functions/`. Deploy manual pelo painel, sem rastreabilidade. |
| RLS sem checagem de status | Corrigido na migration de SSO, mas nasceu junto com o schema — revisar qualquer policy futura pelo mesmo critério. |
