import { useState } from "react";
import { Cabecalho } from "@/components/vidro/Cabecalho";
import { Fundo } from "@/components/vidro/Fundo";
import { Rail } from "@/components/vidro/Rail";
import { TelaBases } from "@/components/vidro/TelaBases";
import { TelaChat } from "@/components/vidro/TelaChat";
import { TelaMembros } from "@/components/vidro/TelaMembros";
import { TelaOrganizacao } from "@/components/vidro/TelaOrganizacao";
import { TelaPipeline } from "@/components/vidro/TelaPipeline";
import type { Tela } from "@/components/vidro/dados-demo";
import { alternar, TEMA_INICIAL, type Tema } from "@/components/vidro/tema";
import "@/components/vidro/vidro.css";

/**
 * Direção Vidro — proposta de ambiente interno, em tema claro e escuro.
 *
 * Port do protótipo `Plum Interno - Vidro v2.dc.html` para React. É uma
 * PROPOSTA VISUAL navegável, não a plataforma: os dados vêm de
 * `components/vidro/dados-demo.ts`, não há Supabase, não há sessão e nenhuma
 * das cinco telas escreve nada. A rota fica fora do `DashboardLayout` porque
 * traz o próprio shell e o próprio tema.
 *
 * ⚠️ ESTA DIREÇÃO CONTRARIA O `DESIGN.md`, e isso é a decisão que ela pede.
 * A §1 define, para App UI, fundo "plano, sem gradiente, sem glow, sem vidro",
 * sombra "nenhuma" e movimento "só transição de estado, nada decorativo"; a §10
 * abre a lista de reprovação automática com "gradiente ou glow atrás de
 * número". O Vidro é exatamente o oposto nos três pontos. Ver o balanço
 * completo em `docs/direcao-vidro.md` — nada disso encosta no tema do produto,
 * que continua em `src/index.css`, intacto.
 */
export default function Vidro() {
  const [tela, setTela] = useState<Tela>("chat");
  const [tema, setTema] = useState<Tema>(TEMA_INICIAL);

  return (
    // `data-tema` é o gancho de toda a cascata do `vidro.css`, e vive só aqui —
    // o `.dark` do produto não é tocado.
    <div className="v-raiz" data-tema={tema}>
      <Fundo tema={tema} />

      <div className="relative flex h-full gap-3.5 p-3.5">
        <Rail tela={tela} onNavegar={setTela} />

        <div className="flex min-w-0 flex-1 flex-col gap-3.5">
          <Cabecalho tela={tela} tema={tema} onAlternarTema={() => setTema(alternar)} onNavegar={setTela} />

          {tela === "chat" && <TelaChat />}
          {tela === "bases" && <TelaBases onNavegar={setTela} />}
          {tela === "pipeline" && <TelaPipeline />}
          {tela === "org" && <TelaOrganizacao onNavegar={setTela} />}
          {tela === "membros" && <TelaMembros />}
        </div>
      </div>
    </div>
  );
}
