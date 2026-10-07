import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "accent";

const TONES: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-info-soft text-info",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  accent: "bg-accent/15 text-foreground",
};

const DOTS: Record<Tone, string> = {
  neutral: "bg-muted-foreground",
  info: "bg-info",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  accent: "bg-accent",
};

/** Etiqueta curta de estado. A cor vem do tom; nunca de classe de paleta solta. */
export function Pill({
  tone = "neutral",
  dot = false,
  children,
  className,
}: {
  tone?: Tone;
  dot?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[0.72rem] font-medium leading-5",
        TONES[tone],
        className,
      )}
    >
      {dot ? <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", DOTS[tone])} /> : null}
      {children}
    </span>
  );
}
