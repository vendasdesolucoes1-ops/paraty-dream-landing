// Componentes do chat de WhatsApp, compartilhados entre o modal de Conversas do
// CRM e a aba "Testar Agente" do painel do Agente IA — as duas telas precisam
// ser indistinguíveis.
import { Check, CheckCheck, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { BOLHA_LEAD, BOLHA_NOSSA } from "@/components/whatsapp/chat-theme";

/**
 * Ticks do WhatsApp: um risco = enviado ao servidor, dois = entregue,
 * dois azuis = lido. Só aparecem nas mensagens que saíram daqui.
 */
export function StatusTicks({ status }: { status: string | null }) {
  if (status === "failed") {
    return <span title="Falha no envio">⚠️</span>;
  }
  if (status === "pending" || !status) {
    return <Clock className="inline h-3 w-3 opacity-60" aria-label="Enviando" />;
  }
  if (status === "sent") {
    return <Check className="inline h-3 w-3 opacity-60" aria-label="Enviado" />;
  }
  const lido = status === "read";
  return (
    <CheckCheck
      className={cn("inline h-3 w-3", lido ? "text-sky-500" : "opacity-60")}
      aria-label={lido ? "Lido" : "Entregue"}
    />
  );
}

/** Uma bolha da conversa, com horário e (quando é nossa) os ticks de status. */
export function ChatBubble({
  texto,
  nossa,
  horario,
  status,
}: {
  texto: string | null;
  nossa: boolean;
  horario: string;
  status?: string | null;
}) {
  return (
    <div className={cn("flex", nossa ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "relative max-w-[78%] px-2.5 py-1.5 text-sm text-neutral-900 shadow-sm",
          // O "rabinho" da bolha: canto quadrado só do lado de quem falou.
          nossa ? "rounded-lg rounded-tr-sm" : "rounded-lg rounded-tl-sm",
        )}
        style={{ background: nossa ? BOLHA_NOSSA : BOLHA_LEAD }}
      >
        {/* whitespace-pre-wrap preserva as quebras que o agente manda;
            break-words evita link longo estourar a bolha. */}
        <p className="whitespace-pre-wrap break-words">
          {texto || <span className="italic opacity-60">(sem texto)</span>}
        </p>
        <span className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-neutral-500">
          {horario}
          {nossa && status !== undefined ? <StatusTicks status={status ?? null} /> : null}
        </span>
      </div>
    </div>
  );
}

/** Separador de dia da conversa. */
export function ChatDateSeparator({ label }: { label: string }) {
  return (
    <div className="flex justify-center py-2">
      <span className="rounded-md bg-background/85 px-2 py-0.5 text-[11px] text-muted-foreground shadow-sm">
        {label}
      </span>
    </div>
  );
}
