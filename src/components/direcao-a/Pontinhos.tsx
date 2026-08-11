/**
 * Indicador de "pensando" da Direção A: três pontos em fase defasada.
 *
 * Existe separado de `@/components/PlumThinkingBar` de propósito — aquele é do
 * tema escuro atual e traz o próprio cromo. Este é só o glifo.
 */
export function Pontinhos() {
  return (
    <div className="flex gap-1">
      {/* Atraso inline, não em classe: `animate-*` é o shorthand `animation`,
          que zera `animation-delay`. Fora do estilo inline, quem ganha depende
          da ordem que o Tailwind emitir. */}
      {[0, 0.18, 0.36].map((atraso) => (
        <span
          key={atraso}
          style={{ animationDelay: `${atraso}s` }}
          className="h-[5px] w-[5px] animate-pl-dot rounded-full bg-plum-brand"
        />
      ))}
    </div>
  );
}
