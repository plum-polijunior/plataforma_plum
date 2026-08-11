import { BARRAS } from "./dados-demo";
import plumLockup from "@/assets/plum-lockup.png";

/** Logos de marca ficam inline: `lucide-react` não traz ícones de terceiros. */
function IconeGoogle() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.6 12.2c0-.7-.1-1.4-.2-2H12v4h6a5 5 0 0 1-2.2 3.3v2.8h3.6c2.1-2 3.2-4.8 3.2-8.1" />
      <path fill="#34A853" d="M12 23c2.9 0 5.4-1 7.2-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.6 1.1-2.8 0-5.2-1.9-6-4.4H2.3v2.9A11 11 0 0 0 12 23" />
      <path fill="#FBBC05" d="M6 14.2a6.6 6.6 0 0 1 0-4.2V7.1H2.3a11 11 0 0 0 0 9.9z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3 .6 4.1 1.6l3.1-3.1A11 11 0 0 0 2.3 7.1L6 10c.8-2.5 3.2-4.6 6-4.6" />
    </svg>
  );
}

function IconeMicrosoft() {
  return (
    <svg width="15" height="15" viewBox="0 0 23 23" aria-hidden>
      <path fill="#F25022" d="M0 0h11v11H0z" />
      <path fill="#7FBA00" d="M12 0h11v11H12z" />
      <path fill="#00A4EF" d="M0 12h11v11H0z" />
      <path fill="#FFB900" d="M12 12h11v11H12z" />
    </svg>
  );
}

interface Props {
  onEntrar: () => void;
}

export function TelaLogin({ onEntrar }: Props) {
  return (
    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 min-h-0">
      <div className="relative flex items-center justify-center p-10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_400px_at_30%_20%,#F5E4EC,transparent_70%)]" />

        <div className="relative w-full max-w-[360px] animate-pl-up">
          <div className="mb-11 flex items-center gap-2.5">
            <img src={plumLockup} alt="Plum" className="block h-[42px] w-auto object-contain" />
          </div>

          <h1 className="mb-2 font-display text-[30px] font-semibold leading-[1.15] tracking-[-0.025em]">
            Entrar na plataforma
          </h1>
          <p className="mb-8 text-sm leading-[1.55] text-plum-text-soft">Acesse os dados da sua operação.</p>

          <div className="mb-6 flex flex-col gap-2">
            <button
              type="button"
              className="flex h-[42px] items-center justify-center gap-[9px] rounded-[9px] border border-plum-line-strong bg-plum-surface text-[13.5px] font-medium text-plum-ink transition-all duration-150 hover:border-plum-line-hover hover:bg-plum-surface-hover"
            >
              <IconeGoogle />
              Continuar com Google
            </button>
            <button
              type="button"
              className="flex h-[42px] items-center justify-center gap-[9px] rounded-[9px] border border-plum-line-strong bg-plum-surface text-[13.5px] font-medium text-plum-ink transition-all duration-150 hover:border-plum-line-hover hover:bg-plum-surface-hover"
            >
              <IconeMicrosoft />
              Continuar com Microsoft
            </button>
          </div>

          <div className="mb-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-plum-line" />
            <span className="text-[10.5px] uppercase tracking-[0.1em] text-plum-muted">ou com email</span>
            <div className="h-px flex-1 bg-plum-line" />
          </div>

          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              onEntrar();
            }}
          >
            <div className="flex flex-col gap-[7px]">
              <label htmlFor="da-email" className="text-[12.5px] font-medium text-plum-text">
                Email corporativo
              </label>
              <input
                id="da-email"
                type="email"
                placeholder="voce@empresa.com.br"
                className="h-[42px] rounded-[9px] border border-plum-line-strong bg-plum-surface px-[13px] text-[13.5px] text-plum-ink outline-none transition-[border-color,box-shadow] duration-150 focus:border-plum-brand focus:shadow-[0_0_0_3px_#F5E4EC]"
              />
            </div>

            <div className="flex flex-col gap-[7px]">
              <div className="flex items-baseline justify-between">
                <label htmlFor="da-senha" className="text-[12.5px] font-medium text-plum-text">
                  Senha
                </label>
                <a href="#" className="text-xs">
                  Esqueci minha senha
                </a>
              </div>
              <input
                id="da-senha"
                type="password"
                placeholder="••••••••••"
                className="h-[42px] rounded-[9px] border border-plum-line-strong bg-plum-surface px-[13px] text-[13.5px] text-plum-ink outline-none transition-[border-color,box-shadow] duration-150 focus:border-plum-brand focus:shadow-[0_0_0_3px_#F5E4EC]"
              />
            </div>

            <button
              type="submit"
              className="mt-1 h-[42px] rounded-[9px] bg-plum-brand text-sm font-medium text-white transition-[background,transform] duration-150 hover:-translate-y-px hover:bg-plum-brand-hover"
            >
              Entrar
            </button>
          </form>

          <p className="mt-7 text-center text-[12.5px] text-plum-muted">
            Primeiro acesso?{" "}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                onEntrar();
              }}
            >
              Use seu código de convite
            </a>
          </p>
        </div>
      </div>

      {/* Painel de prova social. Escondido no mobile: é decorativo, e a coluna
          de 400px não sobrevive a uma tela estreita sem virar ruído. */}
      <div className="relative hidden items-center justify-center overflow-hidden border-l border-plum-line bg-plum-surface p-12 md:flex">
        <div className="absolute inset-0 bg-[radial-gradient(500px_500px_at_70%_40%,#F5E4EC,transparent_65%)]" />

        <div className="relative w-full max-w-[400px]">
          <div className="mb-5 text-[11px] uppercase tracking-[0.1em] text-plum-muted">Dentro do Plum</div>

          <div
            style={{ animationDelay: "0.1s" }}
            className="animate-pl-up overflow-hidden rounded-[14px] border border-plum-line bg-white"
          >
            <div className="flex items-center gap-2 border-b border-plum-line px-[18px] py-4">
              <div className="h-[7px] w-[7px] rounded-full bg-plum-brand" />
              <span className="text-xs text-plum-text-soft">PLUM Chat</span>
            </div>

            <div className="flex flex-col gap-4 p-[18px]">
              <div className="max-w-[80%] self-end rounded-[14px_14px_4px_14px] bg-plum-brand px-[14px] py-2.5 text-[13px] leading-[1.5] text-white">
                Qual foi o ticket médio por região no último trimestre?
              </div>

              <div className="max-w-[88%] text-[13px] leading-[1.6] text-plum-text">
                O ticket médio consolidado foi de <span className="font-medium text-plum-ink">R$ 1.284</span>. Sudeste
                lidera com R$ 1.510 e Norte fecha em R$ 890.
              </div>

              <div className="flex h-16 items-end gap-1.5 pt-1">
                {BARRAS.map((b) => (
                  <div
                    key={b.regiao}
                    className="flex-1 origin-bottom animate-pl-grow rounded-t-[3px] bg-gradient-to-b from-plum-brand-soft to-plum-brand"
                    style={{ height: b.altura, animationDelay: b.atraso }}
                  />
                ))}
              </div>
            </div>
          </div>

          <p className="mt-6 text-sm leading-[1.6] text-plum-text-soft">
            Pergunte em português. O Plum entende o significado de cada coluna das suas bases e responde com o dado
            tratado.
          </p>
        </div>
      </div>
    </div>
  );
}
