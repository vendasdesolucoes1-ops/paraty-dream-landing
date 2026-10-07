import type { UseQueryResult } from "@tanstack/react-query";
import { AlertCircle, RotateCw } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Os três estados que toda seção com dados tem — carregando, erro, vazio — com
 * a mesma cara em todas as telas. Cada seção carrega sozinha: uma consulta
 * lenta ou com erro não segura nem derruba o resto da página.
 */
export function QueryState<T>({
  query,
  skeleton,
  isEmpty,
  empty,
  erroClassName,
  children,
}: {
  query: Pick<UseQueryResult<T>, "data" | "isPending" | "isError" | "refetch" | "isRefetching">;
  skeleton: ReactNode;
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
  /** Margem extra do bloco de erro (ex.: `mx-5` dentro de um Panel `flush`). */
  erroClassName?: string;
  children: (data: T) => ReactNode;
}) {
  if (query.isPending) return <>{skeleton}</>;

  if (query.isError || query.data === undefined) {
    return (
      <div
        role="alert"
        className={`flex flex-col items-start gap-3 rounded-md border border-dashed border-border px-4 py-5 text-sm ${erroClassName ?? ""}`}
      >
        <span className="flex items-center gap-2 text-foreground">
          <AlertCircle className="h-4 w-4 text-danger" aria-hidden />
          Não foi possível carregar.
        </span>
        <button
          type="button"
          onClick={() => query.refetch()}
          disabled={query.isRefetching}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[0.8rem] text-foreground hover:bg-muted disabled:opacity-60"
        >
          <RotateCw
            className={`h-3.5 w-3.5 ${query.isRefetching ? "animate-spin" : ""}`}
            aria-hidden
          />
          Tentar de novo
        </button>
      </div>
    );
  }

  if (isEmpty?.(query.data) && empty) return <>{empty}</>;

  return <>{children(query.data)}</>;
}

/** Linhas cinza pulsando no formato do conteúdo que vai chegar. */
export function SkeletonRows({
  rows = 4,
  className = "h-10",
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={`${className} skeleton-shimmer rounded-lg bg-muted`} />
      ))}
    </div>
  );
}

/** Vazio dentro de um painel: uma frase do que vai aparecer ali e, se houver, o que fazer. */
export function PanelEmpty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
      <p className="max-w-xs">{children}</p>
      {action}
    </div>
  );
}
