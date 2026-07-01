import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LEAD_ORIGEM_OPTIONS, type Lead } from "@/lib/types";
import { WhatsappHistoryDialog } from "@/components/dashboard/whatsapp-history-dialog";

const ORIGEM_LABELS = Object.fromEntries(LEAD_ORIGEM_OPTIONS.map((o) => [o.value, o.label]));

export function LeadCard({ lead, hasHumanTakeover }: { lead: Lead; hasHumanTakeover?: boolean }) {
  return (
    <Card className="shadow-sm">
      <CardContent className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium text-sm leading-tight">{lead.nome}</p>
          <div className="flex items-center gap-1 shrink-0">
            <Badge variant="outline" className="text-xs font-normal">
              {lead.score} pts
            </Badge>
            <WhatsappHistoryDialog leadId={lead.id} leadName={lead.nome} />
          </div>
        </div>

        {lead.telefone ? <p className="text-xs text-muted-foreground">{lead.telefone}</p> : null}

        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {lead.cidade ? <span>{lead.cidade}</span> : null}
          {lead.metragem_interesse ? <span>{lead.metragem_interesse} m²</span> : null}
        </div>

        <div className="flex flex-wrap gap-1">
          {lead.origem ? (
            <Badge variant="secondary" className="text-xs font-normal">
              {ORIGEM_LABELS[lead.origem] ?? lead.origem}
            </Badge>
          ) : null}
          {hasHumanTakeover ? (
            <Badge className="text-xs font-normal bg-amber-100 text-amber-800 hover:bg-amber-100">
              Atendimento humano
            </Badge>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
