import { Link } from "@tanstack/react-router";
import type { UseQueryResult } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, MessageCircle } from "lucide-react";
import type { ItemAcao } from "@/lib/dashboard-queries";
import { formatHora, linkWhatsapp, rotuloDia, tempoRelativo } from "@/lib/format";
import { cn } from "@/lib/utils";

const FRASE: Record<ItemAcao["motivo"], (i: ItemAcao) => string> = {
  humano: () => "A IA está pausada nessas conversas até alguém responder.",
  visita_a_confirmar: (i) =>
    `Visita marcada com data a confirmar — ${rotuloDia(i.desde).toLowerCase()} às ${formatHora(i.desde)}.`,
  proposta_parada: (i) => `Proposta sem movimento ${tempoRelativo(i.desde)}. Vale um retorno.`,
  qualificado: (i) =>
    `Qualificado pela Sophia ${tempoRelativo(i.desde)} e ainda sem visita marcada.`,
};

const BOTAO_CLARO =
  "inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition-[background-color,transform,box-shadow] duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-forest-deep";

/**
 * O destaque da tela: a primeira coisa a fazer agora, escolhida pela ordem de
 * urgência da fila. Uma pessoa abre o painel de manhã e já sabe por onde
 * começar, sem varrer lista nenhuma.
 */
export function Foco({
  query,
  aoVerFila,
}: {
  query: UseQueryResult<ItemAcao[]>;
  aoVerFila: () => void;
}) {
  const itens = query.data;
  const primeiro = itens?.[0];
  const restantes = itens ? Math.max(0, itens.length - 1) : 0;

  const wa = primeiro?.lead ? linkWhatsapp(primeiro.lead.telefone) : null;

  return (
    <section
      aria-label="Comece por aqui"
      className="relative isolate overflow-hidden rounded-2xl bg-forest-deep text-ivory shadow-[0_1px_2px_oklch(0.2_0.06_255/0.25),0_20px_40px_-24px_oklch(0.2_0.06_255/0.6)] ring-1 ring-white/10 dark:ring-white/15"
    >
      {/* Textura: brilho dourado no canto e linhas de relevo ao fundo. */}
      <div
        aria-hidden
        className="absolute -right-24 -top-32 -z-10 h-80 w-80 rounded-full bg-gold/25 blur-3xl animate-drift"
      />
      <svg
        aria-hidden
        className="absolute inset-y-0 right-0 -z-10 h-full w-2/3 text-white/[0.07]"
        viewBox="0 0 400 200"
        preserveAspectRatio="xMaxYMid slice"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
      >
        {Array.from({ length: 9 }, (_, i) => (
          <path
            key={i}
            d={`M-20 ${150 + i * 9} C 80 ${95 + i * 8}, 160 ${190 - i * 6}, 260 ${120 + i * 7} S 380 ${60 + i * 10}, 430 ${90 + i * 8}`}
          />
        ))}
      </svg>

      <div className="flex flex-col gap-6 px-6 py-6 sm:px-8 sm:py-7 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 max-w-2xl">
          <p className="flex items-center gap-2 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-gold">
            <span aria-hidden className="h-px w-5 bg-gold/70" />
            Comece por aqui
          </p>

          {query.isPending ? (
            <div className="mt-4 space-y-3" aria-hidden>
              <div className="h-9 w-72 max-w-full animate-pulse rounded bg-white/10" />
              <div className="h-4 w-96 max-w-full animate-pulse rounded bg-white/10" />
            </div>
          ) : query.isError ? (
            <>
              <h2 className="mt-3 font-display text-[2rem] font-medium leading-tight">
                Não foi possível carregar a fila
              </h2>
              <button
                type="button"
                onClick={() => query.refetch()}
                className="mt-3 text-sm font-medium text-gold underline-offset-4 hover:underline"
              >
                Tentar de novo
              </button>
            </>
          ) : !primeiro ? (
            <>
              <h2 className="mt-3 flex items-center gap-3 font-display text-[2rem] font-medium leading-tight tracking-[-0.01em] sm:text-[2.35rem]">
                <CheckCircle2 className="h-8 w-8 shrink-0 text-gold" aria-hidden />
                Fila zerada. Bom trabalho.
              </h2>
              <p className="mt-2 text-[0.9375rem] leading-relaxed text-ivory/70">
                Nada pendente agora. Qualificados sem visita, propostas paradas e visitas a
                confirmar aparecem aqui assim que surgirem.
              </p>
            </>
          ) : (
            <>
              <h2 className="mt-3 text-balance font-display text-[2rem] font-medium leading-[1.08] tracking-[-0.015em] sm:text-[2.45rem]">
                {primeiro.motivo === "humano"
                  ? `${primeiro.quantidade ?? 0} ${(primeiro.quantidade ?? 0) === 1 ? "conversa espera" : "conversas esperam"} um humano`
                  : (primeiro.lead?.nome ?? "Lead sem nome")}
              </h2>
              <p className="mt-2 text-[0.9375rem] leading-relaxed text-ivory/70">
                {FRASE[primeiro.motivo](primeiro)}
              </p>
            </>
          )}
        </div>

        {primeiro ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2.5">
            {wa ? (
              <a
                href={wa}
                target="_blank"
                rel="noreferrer"
                className={cn(BOTAO_CLARO, "bg-gold text-forest-deep hover:bg-gold/90")}
              >
                <MessageCircle className="h-4 w-4" aria-hidden />
                Chamar no WhatsApp
              </a>
            ) : null}
            {primeiro.lead ? (
              <Link
                to="/dashboard/crm"
                search={{ lead: primeiro.lead.id }}
                className={cn(
                  BOTAO_CLARO,
                  wa
                    ? "bg-white/10 text-ivory hover:bg-white/15"
                    : "bg-gold text-forest-deep hover:bg-gold/90",
                )}
              >
                Abrir ficha
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            ) : (
              <Link
                to="/dashboard/crm"
                className={cn(BOTAO_CLARO, "bg-gold text-forest-deep hover:bg-gold/90")}
              >
                Abrir CRM
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            )}
          </div>
        ) : null}
      </div>

      {restantes > 0 ? (
        <button
          type="button"
          onClick={aoVerFila}
          className="flex w-full items-center justify-between border-t border-white/10 bg-black/10 px-6 py-3 text-left text-[0.8125rem] text-ivory/70 transition-colors hover:bg-black/20 hover:text-ivory focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold sm:px-8"
        >
          <span>
            Depois disso: <strong className="font-semibold text-ivory">{restantes}</strong>{" "}
            {restantes === 1 ? "item" : "itens"} na fila de trabalho
          </span>
          <span className="flex items-center gap-1 font-medium">
            Ver fila <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </span>
        </button>
      ) : null}
    </section>
  );
}
