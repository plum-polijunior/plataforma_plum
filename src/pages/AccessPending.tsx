import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Clock, ShieldAlert, Building2, LogOut, Plus, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import plumLogo from "@/assets/plum-logo.png";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { OrgAccessState } from "@/hooks/use-org-access";

interface AccessPendingProps {
  state: Extract<OrgAccessState, "sem-org" | "pendente" | "bloqueado">;
  email?: string | null;
  organizationName?: string | null;
}

const CONTEUDO = {
  "sem-org": {
    icone: Building2,
    titulo: "Nenhuma organização vinculada",
    descricao:
      "Seu e-mail não corresponde a nenhum domínio corporativo verificado no Plum. " +
      "Peça ao administrador da sua empresa para cadastrar e verificar o domínio, " +
      "ou para te enviar o ID de acesso da organização.",
  },
  pendente: {
    icone: Clock,
    titulo: "Aguardando liberação",
    descricao:
      "Sua conta foi vinculada à organização, mas o acesso aos dados depende da " +
      "aprovação de um administrador. Você será notificado assim que for liberado.",
  },
  bloqueado: {
    icone: ShieldAlert,
    titulo: "Acesso indisponível",
    descricao:
      "Seu acesso a esta organização foi recusado ou desativado por um administrador. " +
      "Entre em contato com o responsável da sua empresa.",
  },
} as const;

/**
 * A moldura das três telas desta página, criada em 2026-08-12 (Direção A).
 *
 * Os três `return` repetiam o mesmo wrapper palavra por palavra — `min-h-screen`
 * mais um glow `blur-3xl` absoluto mais um cartão `glass shadow-xl`. Repaginar
 * três cópias à mão é como elas divergem. Componente só de apresentação: não
 * recebe nem decide nada de sessão, cargo ou organização.
 *
 * Saíram o glow e o `glass`: os dois são vocabulário da landing (vidro sobre
 * fundo escuro) e o `DESIGN.md` §1 os proíbe em tela de produto, onde a
 * separação é hairline de 1px e não sombra.
 */
function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center">
          <img src={plumLogo} alt="" className="mb-3 h-12 w-12 object-contain" />
          <span className="font-display text-lg font-semibold tracking-[-0.01em] text-foreground">
            Plum
          </span>
        </div>
        <div className="rounded-xl border border-border bg-secondary p-8">{children}</div>
      </div>
    </div>
  );
}

export default function AccessPending({ state, email, organizationName }: AccessPendingProps) {
  const { icone: Icone, titulo, descricao } = CONTEUDO[state];
  const { toast } = useToast();
  const [criando, setCriando] = useState(false);
  const [nomeOrg, setNomeOrg] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [sucesso, setSucesso] = useState(false);

  // Leitura síncrona do localStorage para evitar flash de tela e bug do StrictMode
  const [pendingSSOOrgName, setPendingSSOOrgName] = useState(() => localStorage.getItem("plum_pending_org_name"));

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  useEffect(() => {
    if (state === "sem-org" && pendingSSOOrgName) {
      const autoCreate = async () => {
        // Não removemos o localStorage AQUI, para evitar que o React StrictMode 
        // destrua a intenção do usuário antes de completar a requisição.
        try {
          const { error } = await supabase.rpc("criar_organizacao", { p_nome: pendingSSOOrgName });
          if (error) throw error;
    
          localStorage.removeItem("plum_pending_org_name");
          setSucesso(true);
        } catch (err: any) {
          localStorage.removeItem("plum_pending_org_name");
          setPendingSSOOrgName(null); // Volta pra tela de erro normal
          toast({
            title: "Erro ao criar organização (SSO)",
            description: err.message,
            variant: "destructive",
          });
        }
      };
      
      autoCreate();
    }
  }, [state, pendingSSOOrgName, toast]);

  // Quem chega aqui sem organização precisa de uma saída: ou pede o código de
  // convite ao admin, ou cria a própria organização. Sem isto o usuário que
  // confirma o e-mail e entra fica num beco sem saída.
  const handleCriarOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    try {
      const { error } = await supabase.rpc("criar_organizacao", { p_nome: nomeOrg });
      if (error) throw error;

      setSucesso(true);
    } catch (err: any) {
      toast({
        title: "Erro ao criar organização",
        description: err.message,
        variant: "destructive",
      });
      setEnviando(false);
    }
  };

  const handleEntrarNoPlum = async () => {
    setEnviando(true);
    // Limpa o hash do SSO da URL para que o Supabase não use o token antigo
    window.history.replaceState(null, "", window.location.pathname);
    // Força o refresh da sessão para obter o JWT com o organization_id
    await supabase.auth.refreshSession();
  };

  if (sucesso) {
    return (
      <Moldura>
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="space-y-6 text-center"
        >
          {/* `ok` em vez de `bg-green-500/20 text-green-500`: era uma das 7 cores
              cruas do repo, e agora é token de estado dos dois temas. */}
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-ok-line bg-ok-bg text-ok">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <div className="space-y-2">
            <h2 className="font-display text-[26px] font-semibold tracking-[-0.02em] text-foreground">
              Organização criada
            </h2>
            <p className="text-sm leading-[1.6] text-text-soft">
              Seu ambiente já está pronto. Você é o administrador dele.
            </p>
          </div>
          <Button className="w-full" onClick={handleEntrarNoPlum} disabled={enviando}>
            {enviando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {enviando ? "Entrando…" : "Entrar no Plum"}
          </Button>
        </motion.div>
      </Moldura>
    );
  }

  if (state === "sem-org" && pendingSSOOrgName) {
    return (
      <Moldura>
        <div className="space-y-5 text-center">
          <Loader2 className="mx-auto h-9 w-9 animate-spin text-primary" />
          <div>
            <h2 className="font-display text-lg font-semibold tracking-[-0.01em] text-foreground">
              Configurando o ambiente
            </h2>
            <p className="mt-2 text-sm leading-[1.6] text-text-soft">
              Criando a organização{" "}
              <strong className="font-semibold text-foreground">{pendingSSOOrgName}</strong> e
              vinculando a sua conta…
            </p>
          </div>
        </div>
      </Moldura>
    );
  }

  return (
    <Moldura>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {/* Ícone sem círculo colorido atrás: o item 2 da lista de reprovação do
            `DESIGN.md` §10 é exatamente "ícone dentro de círculo colorido como
            decoração de seção". O ícone sozinho, na tinta suave, informa igual. */}
        <Icone className="mb-4 h-7 w-7 text-primary" strokeWidth={1.8} />

        <h2 className="mb-2 font-display text-[22px] font-semibold leading-[1.2] tracking-[-0.02em] text-foreground">
          {titulo}
        </h2>
        <p className="text-sm leading-[1.6] text-text-soft">{descricao}</p>

        {(organizationName || email) && (
          <dl className="mt-6 space-y-1.5 border-t border-border pt-5 text-[13px]">
            {organizationName && (
              <div className="flex gap-2">
                <dt className="text-muted-foreground">Organização</dt>
                <dd className="truncate font-medium text-foreground">{organizationName}</dd>
              </div>
            )}
            {email && (
              <div className="flex gap-2">
                <dt className="text-muted-foreground">Conta</dt>
                <dd className="truncate font-medium text-foreground">{email}</dd>
              </div>
            )}
          </dl>
        )}

        {state === "sem-org" && (
          <div className="mt-6 border-t border-border pt-5">
            {!criando ? (
              <Button variant="outline" className="w-full" onClick={() => setCriando(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Criar uma organização
              </Button>
            ) : (
              <form onSubmit={handleCriarOrg} className="space-y-3">
                <Label htmlFor="nome-org" className="text-[12.5px] font-medium text-secondary-foreground">
                  Nome da empresa
                </Label>
                <Input
                  id="nome-org"
                  value={nomeOrg}
                  onChange={(e) => setNomeOrg(e.target.value)}
                  placeholder="Ex: Minha Empresa Ltda"
                  required
                  minLength={2}
                />
                <p className="text-xs leading-[1.5] text-muted-foreground">
                  Você será o administrador. Um código de convite de 12 caracteres será gerado
                  para a sua equipe.
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    className="flex-1"
                    onClick={() => setCriando(false)}
                    disabled={enviando}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" className="flex-1" disabled={enviando}>
                    {enviando ? "Criando…" : "Criar"}
                  </Button>
                </div>
              </form>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={handleLogout}
          className="mt-5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors duration-150 hover:text-foreground"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sair desta conta
        </button>
      </motion.div>
    </Moldura>
  );
}
