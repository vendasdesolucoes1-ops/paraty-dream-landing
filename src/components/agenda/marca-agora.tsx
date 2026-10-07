/** Marca "agora" entre o que já passou e o que falta no dia de hoje. */
export function MarcaAgora() {
  return (
    <div
      role="separator"
      aria-label="Agora"
      className="relative my-1 flex animate-swap items-center gap-2 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-danger"
    >
      <span className="h-2 w-2 shrink-0 rounded-full bg-danger ring-4 ring-danger/15" />
      Agora
      <span aria-hidden className="h-px flex-1 bg-danger/30" />
    </div>
  );
}
