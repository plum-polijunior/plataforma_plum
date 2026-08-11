import { useState } from "react";
import type { Tela } from "@/components/direcao-a/dados-demo";
import { Shell } from "@/components/direcao-a/Shell";
import { TelaBases } from "@/components/direcao-a/TelaBases";
import { TelaChat } from "@/components/direcao-a/TelaChat";
import { TelaLogin } from "@/components/direcao-a/TelaLogin";
import { TelaMembros } from "@/components/direcao-a/TelaMembros";
import { TelaOrganizacao } from "@/components/direcao-a/TelaOrganizacao";
import { TelaPipeline } from "@/components/direcao-a/TelaPipeline";

/**
 * Direção A — proposta de ambiente interno claro.
 *
 * Port do protótipo `Plum Interno - Direcao A clara.dc.html` para React. É uma
 * PROPOSTA VISUAL navegável, não a plataforma: todos os dados vêm de
 * `components/direcao-a/dados-demo.ts`, não há Supabase, não há sessão e
 * "Entrar" só troca o estado local. Por isso a rota fica fora do
 * `DashboardLayout` — passar pelo guard de org exigiria login real e
 * esconderia justamente a tela de login que está em avaliação.
 *
 * Nenhuma rota existente foi alterada. Quando uma tela for aprovada, ela migra
 * para a página real correspondente (o mapa está em `docs/direcao-a.md`) e o
 * componente equivalente sai daqui.
 */
export default function DirecaoA() {
  const [tela, setTela] = useState<Tela>("chat");
  const [logado, setLogado] = useState(true);

  return (
    // `direcao-a` é o gancho do CSS escopado em `src/index.css` (barra de
    // rolagem e cor de link). O tema claro para aqui: `<html class="dark">`
    // continua valendo para o resto do app.
    <div className="direcao-a flex h-screen flex-col overflow-hidden bg-white font-geist text-sm text-plum-ink antialiased">
      {logado ? (
        <Shell tela={tela} onNavegar={setTela} onSair={() => setLogado(false)}>
          {tela === "chat" && <TelaChat />}
          {tela === "bases" && <TelaBases onNavegar={setTela} />}
          {tela === "pipeline" && <TelaPipeline />}
          {tela === "org" && <TelaOrganizacao onNavegar={setTela} />}
          {tela === "membros" && <TelaMembros />}
        </Shell>
      ) : (
        <TelaLogin
          onEntrar={() => {
            setLogado(true);
            setTela("chat");
          }}
        />
      )}
    </div>
  );
}
