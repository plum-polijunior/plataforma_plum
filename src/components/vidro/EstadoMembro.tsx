/**
 * Coluna de estado de um membro: ou o par recusar/aprovar, ou o selo "Ativo".
 * Aparece nas duas telas que listam gente — Organização e Membros.
 */
export function EstadoMembro({ pendente }: { pendente: boolean }) {
  if (!pendente) {
    return (
      <span className="v-ok rounded-full bg-[color:var(--ok-fundo)] px-[11px] py-1 text-[11.5px] font-medium">
        Ativo
      </span>
    );
  }

  return (
    <div className="flex gap-[7px]">
      <button type="button" className="v-ctrl rounded-[9px] px-3 py-1.5 text-xs">
        Recusar
      </button>
      <button type="button" className="v-btn rounded-[9px] px-[13px] py-[7px] text-xs font-medium">
        Aprovar
      </button>
    </div>
  );
}
