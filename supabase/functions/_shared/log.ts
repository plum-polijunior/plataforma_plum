import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";

import {
  type CaminhoLog,
  type ClienteDeLog,
  criarRegistradorCom,
  criarRegistradorVerificado,
  type DadosDoTurno,
  type LinhaDeLog,
} from "./log_core.ts";

/**
 * Escrita em `plum_logs` — a observabilidade do chat.
 *
 * Este arquivo é só o fio: monta o client do Supabase com o JWT de quem
 * perguntou e entrega para o `log_core.ts`, onde mora a lógica e onde ela é
 * testada. **A regra de que o log nunca derruba a pergunta é implementada lá**,
 * e o motivo da separação está documentado no cabeçalho daquele arquivo.
 *
 * O client é montado com o JWT do usuário, e não com `service_role` — mesma
 * postura do resto do `ai-plum-chat`, onde há um comentário explicando que
 * *"service role aqui transformaria um bug de filtro em vazamento entre
 * organizações"*. Abrir `service_role` só para gravar log contrariaria isso
 * numa função que já foi palco do I-01.
 */

export {
  type CaminhoLog,
  type ClienteDeLog,
  criarRegistradorCom,
  criarRegistradorVerificado,
  type DadosDoTurno,
  type EtapaLog,
  type LinhaDeLog,
  montarLinha,
  type StatusLog,
} from "./log_core.ts";

/**
 * Devolve uma função que grava uma linha de log, já amarrada ao turno.
 *
 * Uso no chamador:
 * ```ts
 * const registrar = criarRegistrador(authHeader, { sessaoId, turnoId, datasetId });
 * await registrar({ etapa: "guard", status: "ok", latenciaMs: 812 });
 * ```
 *
 * ⚠️ Sem `authHeader` (ou sem `sessaoId`/`turnoId`) ele vira um no-op silencioso
 * em vez de lançar. É deliberado: durante a Etapa 0 o front ainda pode estar
 * numa versão que não manda esses campos, e uma pergunta sem log é muito melhor
 * que uma pergunta que falha por causa do log.
 */
export function criarRegistrador(
  authHeader: string | null,
  turno: Partial<DadosDoTurno>,
  caminho: CaminhoLog = "legado",
): (linha: LinhaDeLog) => Promise<void> {
  const podeRegistrar = Boolean(authHeader && turno.sessaoId && turno.turnoId);

  if (!podeRegistrar) {
    // Uma linha, uma vez, para o silêncio não virar mistério em produção.
    console.warn(
      "[log] turno incompleto (sessao/turno/auth ausentes) — pergunta segue sem registro",
    );
    return criarRegistradorCom(null, turno, caminho);
  }

  const cliente = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader! } } },
  ) as unknown as ClienteDeLog;

  return criarRegistradorCom(cliente, turno, caminho);
}
