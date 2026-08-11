/**
 * Indicador de "pensando": três pontos em fase defasada.
 *
 * O atraso vai em `style` e não em classe utilitária porque `animation` é
 * atalho e zera `animation-delay`; fora do estilo inline, quem ganha depende da
 * ordem em que o CSS foi emitido.
 */
export function Pontinhos() {
  return (
    <div className="flex gap-1">
      {[0, 0.18, 0.36].map((atraso) => (
        <span key={atraso} className="v-ponto" style={{ animationDelay: `${atraso}s` }} />
      ))}
    </div>
  );
}
