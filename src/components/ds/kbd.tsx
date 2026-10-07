import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Tecla de atalho: <Kbd>⌘</Kbd><Kbd>K</Kbd>. */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-muted px-1 font-sans text-[0.68rem] font-medium text-muted-foreground",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
