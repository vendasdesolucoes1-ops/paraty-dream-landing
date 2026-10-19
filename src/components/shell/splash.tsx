import { FlorParaty } from "@/components/marca";

/**
 * Abertura do painel: o emblema aparece dentro de um anel que se desenha e
 * pulsa, e o nome da marca entra logo abaixo. Aparece enquanto a sessão é
 * verificada; leva ~1 s, e some sem salto quando a tela chega.
 */
export function Splash() {
  return (
    <div
      role="status"
      aria-label="Carregando o painel"
      className="flex h-[100dvh] flex-col items-center justify-center gap-7 bg-canvas"
    >
      <div className="relative flex h-28 w-28 items-center justify-center">
        <span
          aria-hidden
          className="absolute inset-0 rounded-full bg-accent/25 motion-safe:animate-[pulse-ring_2s_var(--ease-out)_infinite]"
        />
        <svg
          aria-hidden
          viewBox="0 0 100 100"
          className="absolute inset-0 h-full w-full -rotate-90"
        >
          <circle cx="50" cy="50" r="47" fill="none" stroke="var(--border)" strokeWidth="1.5" />
          <circle
            cx="50"
            cy="50"
            r="47"
            fill="none"
            stroke="var(--gold)"
            strokeWidth="2"
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray={1}
            className="motion-safe:animate-[ring-draw_1.4s_var(--ease-out)_both]"
          />
        </svg>
        <FlorParaty className="h-14 w-14 text-gold motion-safe:animate-[fade-up-soft_700ms_var(--ease-out)_200ms_both]" />
      </div>
      <div className="text-center motion-safe:animate-[fade-up-soft_700ms_var(--ease-out)_450ms_both]">
        {/* Mesmo par tipográfico da marca (Montserrat + Playfair), não o
            font-display do painel — aqui é assinatura, não título de tela. */}
        <p className="marca-rotulo text-[0.6rem] tracking-[0.34em] text-muted-foreground">
          Moradas de
        </p>
        <p className="marca-display mt-1 text-[1.75rem] font-bold tracking-[0.03em] text-foreground">
          PARATY
        </p>
      </div>
    </div>
  );
}
