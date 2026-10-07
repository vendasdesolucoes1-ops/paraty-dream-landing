import { iniciais } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Círculo com iniciais. Sem foto: o CRM não guarda imagem de lead nem de vendedor. */
export function Avatar({
  nome,
  size = "md",
  className,
}: {
  nome: string | null | undefined;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-secondary font-medium text-secondary-foreground",
        size === "sm" ? "h-7 w-7 text-[0.68rem]" : "h-9 w-9 text-xs",
        className,
      )}
    >
      {iniciais(nome)}
    </span>
  );
}
