import { cn } from "@/lib/utils";

/** Mini-gráfico de colunas para dentro de um indicador. O último valor ganha o dourado. */
export function Sparkbars({ valores, label }: { valores: number[]; label: string }) {
  const maximo = Math.max(...valores, 1);
  return (
    <div role="img" aria-label={label} className="flex h-9 items-end gap-[3px]">
      {valores.map((v, i) => (
        <span
          key={i}
          className={cn(
            "w-[5px] rounded-[2px]",
            i === valores.length - 1 ? "bg-accent" : "bg-chart-1/25",
          )}
          style={{ height: `${v === 0 ? 8 : Math.max(14, (v / maximo) * 100)}%` }}
        />
      ))}
    </div>
  );
}
