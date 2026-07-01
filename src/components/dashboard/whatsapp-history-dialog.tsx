import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { WhatsappMessage } from "@/lib/types";

export function WhatsappHistoryDialog({ leadId, leadName }: { leadId: string; leadName: string }) {
  const [open, setOpen] = useState(false);

  const { data: messages, isLoading } = useQuery({
    queryKey: ["whatsapp-messages", leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_messages")
        .select("*")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as WhatsappMessage[];
    },
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7" title="Histórico do WhatsApp">
          <MessageCircle className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>WhatsApp — {leadName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-2 max-h-96 overflow-y-auto">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando mensagens...</p>
          ) : !messages || messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma mensagem encontrada.</p>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={cn("flex", message.from_me ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                    message.from_me ? "bg-forest-deep text-ivory" : "bg-muted text-foreground",
                  )}
                >
                  {message.content}
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
