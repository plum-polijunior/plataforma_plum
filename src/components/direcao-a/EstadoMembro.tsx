/**
 * Coluna de estado de um membro: ou o par aprovar/recusar, ou o selo "Ativo".
 * Some nas duas telas que listam gente (Organização e Membros).
 */
export function EstadoMembro({ pendente }: { pendente: boolean }) {
  if (!pendente) {
    return (
      <span className="rounded-full bg-plum-ok-bg px-2.5 py-[3px] text-[11.5px] text-plum-ok">Ativo</span>
    );
  }

  return (
    <div className="flex gap-[7px]">
      <button
        type="button"
        className="rounded-[7px] border border-plum-line-strong px-[11px] py-[5px] text-xs text-plum-text-soft transition-all duration-150 hover:border-plum-danger-line hover:text-plum-danger"
      >
        Recusar
      </button>
      <button
        type="button"
        className="rounded-[7px] bg-plum-brand px-3 py-1.5 text-xs font-medium text-white transition-all duration-150 hover:bg-plum-brand-hover"
      >
        Aprovar
      </button>
    </div>
  );
}
