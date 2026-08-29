import { useMemo, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Loteamento3D, type LotView } from "@/components/loteamento-3d/Loteamento3D";
import { AREA_SUMMARY, LAYOUT_LOTS } from "@/lib/loteamento-3d/loteamento";
import type { Lote, LoteStatus } from "@/lib/types";

const STATUS_COLORS: Record<LoteStatus, string> = {
  disponivel: "#22c55e",
  reservado: "#f59e0b",
  vendido: "#ef4444",
};

const STATUS_LABELS: Record<LoteStatus, string> = {
  disponivel: "Disponível",
  reservado: "Reservado",
  vendido: "Vendido",
};

export function Loteamento3DView({
  lotes,
  onSelectLote,
}: {
  lotes: Lote[];
  onSelectLote: (lote: Lote) => void;
}) {
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);
  const [showHouses, setShowHouses] = useState(true);
  const [flyMode, setFlyMode] = useState(false);
  const [locked, setLocked] = useState(false);

  const byNumber = useMemo(() => {
    const map = new Map<number, Lote>();
    for (const lote of lotes) {
      const n = Number.parseInt(lote.numero_lote, 10);
      if (!Number.isNaN(n)) map.set(n, lote);
    }
    return map;
  }, [lotes]);

  // Planta esquemática (reconstruída do Quadro de Áreas, ver loteamento-3d/loteamento.ts)
  // casada com o status real do banco pelo número do lote. Um lote cujo
  // numero_lote não é um inteiro dentro da planta simplesmente não aparece em
  // 3D — continua visível normalmente nas visões Tabela e Planta.
  const lots: LotView[] = useMemo(
    () =>
      LAYOUT_LOTS.map((ll) => {
        const db = byNumber.get(ll.number);
        return {
          ...ll,
          id: db?.id ?? null,
          status: db?.status ?? "disponivel",
          valor: db?.valor ?? null,
          observacoes: db?.observacoes ?? null,
        };
      }),
    [byNumber],
  );

  const stats = useMemo(
    () => ({
      total: lots.length,
      disponivel: lots.filter((l) => l.status === "disponivel").length,
      reservado: lots.filter((l) => l.status === "reservado").length,
      vendido: lots.filter((l) => l.status === "vendido").length,
    }),
    [lots],
  );

  const handleSelect = (lot: LotView) => {
    setSelectedNumber(lot.number);
    const db = byNumber.get(lot.number);
    if (!db) {
      toast.info(`Lote ${lot.number} ainda não está cadastrado — cadastre pela aba Tabela.`);
      return;
    }
    onSelectLote(db);
  };

  return (
    <div className="space-y-3">
      <div
        className="relative rounded-lg border overflow-hidden bg-card"
        style={{ height: "min(75vh, 720px)" }}
      >
        <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
          <Button
            variant={flyMode ? "default" : "outline"}
            size="sm"
            onClick={() => setFlyMode((v) => !v)}
          >
            {flyMode ? "Modo voo: ON" : "Modo voo"}
          </Button>
          <Button
            variant={showHouses ? "default" : "outline"}
            size="sm"
            onClick={() => setShowHouses((v) => !v)}
          >
            {showHouses ? "Casas: ON" : "Casas: OFF"}
          </Button>
        </div>

        <div className="absolute bottom-3 left-3 z-10 rounded-lg border bg-card/90 backdrop-blur p-3 text-xs shadow-sm space-y-1.5 min-w-40">
          <p className="font-display text-sm text-primary mb-1">Legenda</p>
          {(Object.keys(STATUS_LABELS) as LoteStatus[]).map((status) => (
            <div key={status} className="flex items-center gap-2">
              <span
                className="h-3 w-3 rounded-sm shrink-0"
                style={{ backgroundColor: STATUS_COLORS[status] }}
              />
              <span className="text-muted-foreground">{STATUS_LABELS[status]}</span>
              <span className="ml-auto tabular-nums">{stats[status]}</span>
            </div>
          ))}
          <p className="pt-1.5 mt-1.5 border-t text-muted-foreground">{stats.total} lotes</p>
        </div>

        <ClientOnly
          fallback={
            <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
              Carregando visualização 3D…
            </div>
          }
        >
          <Loteamento3D
            lots={lots}
            selectedNumber={selectedNumber}
            onSelect={handleSelect}
            showHouses={showHouses}
            flyMode={flyMode}
            onLockChange={setLocked}
          />
        </ClientOnly>

        {flyMode && (
          <>
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
              <div className="h-4 w-4 rounded-full border-2 border-white/80 shadow" />
            </div>
            <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-lg border bg-card/90 backdrop-blur px-4 py-2 text-xs shadow-sm">
              {locked ? (
                <span>
                  <b>W A S D</b> mover · <b>Mouse</b> olhar · <b>Espaço/Q</b> subir e descer ·{" "}
                  <b>Shift</b> turbo · <b>Esc</b> liberar o cursor
                </span>
              ) : (
                <span>Clique na cena para começar a voar</span>
              )}
            </div>
          </>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Planta esquemática reconstruída a partir do Quadro de Áreas —{" "}
        {AREA_SUMMARY.totalM2.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} m²,{" "}
        {AREA_SUMMARY.totalLotes} lotes. Clique num lote colorido para editar seu status.
      </p>
    </div>
  );
}
