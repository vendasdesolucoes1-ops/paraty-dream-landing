import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDataLonga, saudacao, tempoRelativo } from "@/lib/format";
import { LeadFormDialog } from "@/components/dashboard/lead-form-dialog";

/**
 * "Atualizado há 2 min" + botão para atualizar agora. A tela se atualiza
 * sozinha (a cada 60 s e ao vivo); isto dá confiança de que o número é recente.
 */
function Atualizado({ desde }: { desde: number }) {
  const queryClient = useQueryClient();
  const buscando = useIsFetching({ queryKey: ["dash"] }) > 0;
  const [, forcar] = useState(0);
  useEffect(() => {
    const t = setInterval(() => forcar((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  return (
    <button
      type="button"
      onClick={() => queryClient.invalidateQueries({ queryKey: ["dash"] })}
      disabled={buscando}
      title="Atualizar agora"
      className="group/atual inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[0.8125rem] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait"
    >
      <RefreshCw
        className={`h-3.5 w-3.5 transition-transform duration-500 group-hover/atual:rotate-90 ${buscando ? "animate-spin" : ""}`}
        aria-hidden
      />
      <span className="tabular-nums" aria-live="polite">
        {buscando
          ? "Atualizando…"
          : desde
            ? `Atualizado ${tempoRelativo(new Date(desde))}`
            : "Atualizar"}
      </span>
    </button>
  );
}

const Destaque = ({ children }: { children: ReactNode }) => (
  <strong className="font-semibold text-foreground">{children}</strong>
);

function plural(n: number, um: string, varios: string) {
  return `${n} ${n === 1 ? um : varios}`;
}

/**
 * Abertura da página: data em caixa-alta, saudação na serifa da marca e uma
 * frase que resume o dia com os números que mais importam.
 */
export function Cabecalho({
  primeiroNome,
  pendencias,
  visitasHoje,
  novosHoje,
  atualizadoEm,
}: {
  primeiroNome?: string;
  pendencias?: number;
  visitasHoje?: number;
  novosHoje?: number;
  atualizadoEm: number;
}) {
  const pronto = pendencias !== undefined && visitasHoje !== undefined && novosHoje !== undefined;
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          <span aria-hidden className="relative flex h-2 w-2">
            <span className="absolute inset-0 animate-ping rounded-full bg-success/50 motion-reduce:hidden" />
            <span className="relative h-2 w-2 rounded-full bg-success" />
          </span>
          {formatDataLonga(new Date())}
        </p>
        <h1 className="mt-3 text-balance font-display text-[2.6rem] font-medium leading-[1.02] tracking-[-0.025em] text-foreground sm:text-[3.4rem]">
          {saudacao()}
          {primeiroNome ? `, ${primeiroNome}` : ""}
        </h1>
        <p className="mt-3 max-w-xl text-pretty text-[1.0625rem] leading-relaxed text-muted-foreground">
          {pronto ? (
            <>
              Você tem <Destaque>{plural(pendencias, "pendência", "pendências")}</Destaque>,{" "}
              <Destaque>{plural(visitasHoje, "visita", "visitas")}</Destaque> hoje e{" "}
              <Destaque>{plural(novosHoje, "lead novo", "leads novos")}</Destaque> desde a
              meia‑noite.
            </>
          ) : (
            <span className="inline-block h-5 w-80 max-w-full animate-pulse rounded bg-muted align-middle" />
          )}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Atualizado desde={atualizadoEm} />
        <Button asChild variant="outline">
          <Link to="/dashboard/agenda">
            <CalendarDays className="h-4 w-4" aria-hidden />
            Agenda
          </Link>
        </Button>
        <LeadFormDialog />
      </div>
    </header>
  );
}
