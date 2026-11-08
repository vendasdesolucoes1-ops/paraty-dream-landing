import { useState } from "react";
import { Loader2, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { plural, type ResultadoDistribuicao } from "@/lib/rodizio-formato";
import { useDistribuirEspera } from "@/lib/rodizio";

/**
 * Reparte os leads em espera (sem vendedor, em aberto, dos últimos 30 dias)
 * pela fila. Abre com a prévia calculada pelo próprio banco; só grava ao
 * confirmar.
 */
export function DistribuirEspera({ emEspera }: { emEspera: number }) {
  const [aberto, setAberto] = useState(false);
  const [previa, setPrevia] = useState<ResultadoDistribuicao | null>(null);
  const simular = useDistribuirEspera();
  const confirmar = useDistribuirEspera();

  function abrir() {
    setPrevia(null);
    setAberto(true);
    simular.mutate(false, { onSuccess: setPrevia });
  }

  return (
    <>
      <Button variant="outline" onClick={abrir} disabled={emEspera === 0}>
        <Shuffle className="h-4 w-4" aria-hidden />
        Distribuir leads em espera
      </Button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Distribuir leads em espera</DialogTitle>
            <DialogDescription>
              Leads sem vendedor, em aberto, que chegaram nos últimos 30 dias. Seguem a ordem da
              fila e o limite de cada um. Cada vendedor é avisado no sino.
            </DialogDescription>
          </DialogHeader>

          {simular.isPending || !previa ? (
            <div className="flex items-center gap-2 py-6 text-[0.875rem] text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Calculando a prévia...
            </div>
          ) : previa.distribuidos === 0 ? (
            <p className="py-4 text-[0.875rem] text-muted-foreground">
              Nenhum lead pode ser distribuído agora: não há ninguém com vaga na fila.
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-[0.875rem]">
                {plural(previa.distribuidos, "lead vai", "leads vão")} para a fila
                {previa.continuam_em_espera > 0
                  ? `; ${plural(previa.continuam_em_espera, "continua", "continuam")} em espera (limite do dia).`
                  : "."}
              </p>
              <ul className="divide-y divide-border rounded-xl border border-border">
                {previa.por_vendedor.map((p) => (
                  <li
                    key={p.vendedor_id}
                    className="flex items-center justify-between px-4 py-2.5 text-[0.875rem]"
                  >
                    <span>{p.nome}</span>
                    <span className="font-medium tabular-nums">{p.quantidade}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!previa || previa.distribuidos === 0 || confirmar.isPending}
              onClick={() => confirmar.mutate(true, { onSuccess: () => setAberto(false) })}
            >
              {confirmar.isPending ? "Distribuindo..." : "Confirmar distribuição"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
