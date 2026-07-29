// Ficha do cliente comprador: dados cadastrais, compras (um lote cada) e os
// documentos de cada compra. Os documentos ficam sob a compra, não sob o
// cliente — assim escritura e planta do lote A não se misturam com as do B.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, MapPin, MessageCircle, Pencil, Plus, Upload } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import {
  COMPRA_STATUS_OPTIONS,
  type Cliente,
  type Compra,
  type CompraWithLote,
  type DocumentoWithLead,
} from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DocumentoCard } from "@/components/documentos/documento-card";
import { DocumentoPreviewDialog } from "@/components/documentos/documento-preview-dialog";
import { DocumentoUploadDialog } from "@/components/documentos/documento-upload-dialog";
import { ClienteFormDialog } from "@/components/clientes/cliente-form-dialog";
import { CompraFormDialog } from "@/components/clientes/compra-form-dialog";

const STATUS_LABEL = Object.fromEntries(COMPRA_STATUS_OPTIONS.map((o) => [o.value, o.label]));

const STATUS_CLASS: Record<string, string> = {
  ativo: "bg-forest-deep text-ivory hover:bg-forest-deep",
  quitado: "bg-gold text-forest-deep hover:bg-gold",
  inadimplente: "bg-destructive text-destructive-foreground hover:bg-destructive",
  distratado: "bg-muted text-muted-foreground hover:bg-muted",
};

function formatBrl(value: number | null): string {
  if (value === null) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  // Datas vêm como YYYY-MM-DD; montar com new Date() aplicaria fuso e podia
  // exibir o dia anterior.
  const [ano, mes, dia] = value.slice(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
}

function Campo({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm">{value?.trim() ? value : "—"}</p>
    </div>
  );
}

function CompraCard({
  compra,
  onEdit,
  onPreviewDocumento,
}: {
  compra: CompraWithLote;
  onEdit: () => void;
  onPreviewDocumento: (documento: DocumentoWithLead) => void;
}) {
  // Prefixo "documentos" de propósito: o delete no DocumentoCard invalida
  // ["documentos"] e o React Query casa por prefixo, então a lista se atualiza.
  const { data: documentos, isLoading } = useQuery({
    queryKey: ["documentos", "compra", compra.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documentos")
        .select("*, lead:leads(id, nome), processo:processos(id, titulo, categoria)")
        .eq("compra_id", compra.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as DocumentoWithLead[];
    },
  });

  const titulo = compra.lote
    ? `Lote ${compra.lote.numero_lote}${compra.lote.quadra ? ` · Quadra ${compra.lote.quadra}` : ""}`
    : "Compra sem lote definido";

  return (
    <Card className="shadow-sm">
      <CardContent className="p-4 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-display text-lg text-primary flex items-center gap-2">
              <MapPin className="h-4 w-4 text-gold shrink-0" />
              {titulo}
            </p>
            <p className="text-xs text-muted-foreground">
              {compra.numero_contrato ? `Contrato ${compra.numero_contrato} · ` : ""}
              {formatDate(compra.data_compra)}
              {compra.lote?.metragem ? ` · ${compra.lote.metragem} m²` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={cn("font-normal", STATUS_CLASS[compra.status])}>
              {STATUS_LABEL[compra.status] ?? compra.status}
            </Badge>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
              <Pencil className="h-4 w-4" />
              <span className="sr-only">Editar compra</span>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Campo label="Valor total" value={formatBrl(compra.valor_total)} />
          <Campo label="Entrada" value={formatBrl(compra.valor_entrada)} />
          <Campo
            label="Parcelamento"
            value={
              compra.num_parcelas
                ? `${compra.num_parcelas}x de ${formatBrl(compra.valor_parcela)}`
                : "—"
            }
          />
          <Campo label="Escritura" value={compra.escritura_emitida ? "Emitida" : "Não emitida"} />
        </div>

        {compra.observacoes ? (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{compra.observacoes}</p>
        ) : null}

        <Separator />

        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-primary flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Documentos desta compra
          </p>
          <DocumentoUploadDialog
            defaultCompraId={compra.id}
            trigger={
              <Button variant="outline" size="sm">
                <Upload className="h-4 w-4 mr-1" />
                Anexar
              </Button>
            }
          />
        </div>

        {isLoading ? (
          <Skeleton className="h-20 w-full rounded-lg" />
        ) : (documentos ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum documento anexado — escritura, planta e contrato entram aqui.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(documentos ?? []).map((documento) => (
              <DocumentoCard
                key={documento.id}
                documento={documento}
                onClick={() => onPreviewDocumento(documento)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ClienteFichaSheet({
  cliente,
  open,
  onOpenChange,
}: {
  cliente: Cliente | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [editandoCliente, setEditandoCliente] = useState(false);
  const [compraDialogOpen, setCompraDialogOpen] = useState(false);
  const [compraEditando, setCompraEditando] = useState<Compra | undefined>(undefined);
  const [documentoPreview, setDocumentoPreview] = useState<DocumentoWithLead | null>(null);

  const { data: compras, isLoading } = useQuery({
    queryKey: ["compras", cliente?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("compras")
        .select("*, lote:lotes(id, numero_lote, quadra, metragem)")
        .eq("cliente_id", cliente!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as CompraWithLote[];
    },
    enabled: Boolean(cliente?.id) && open,
  });

  const endereco = cliente
    ? [
        [cliente.endereco, cliente.numero].filter(Boolean).join(", "),
        cliente.complemento,
        cliente.bairro,
        [cliente.cidade, cliente.uf].filter(Boolean).join(" / "),
        cliente.cep,
      ]
        .filter((parte) => parte && parte.trim())
        .join(" · ")
    : "";

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          {cliente ? (
            <>
              <SheetHeader>
                <SheetTitle className="font-display text-2xl text-primary flex items-center gap-2">
                  {cliente.nome}
                  {cliente.telefone ? (
                    <a
                      href={`https://wa.me/${cliente.telefone.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noreferrer"
                      title="Abrir WhatsApp"
                    >
                      <MessageCircle className="h-4 w-4 text-muted-foreground hover:text-primary" />
                    </a>
                  ) : null}
                </SheetTitle>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                <Card className="shadow-sm">
                  <CardContent className="p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-primary">Dados do comprador</p>
                      <Button variant="outline" size="sm" onClick={() => setEditandoCliente(true)}>
                        <Pencil className="h-4 w-4 mr-1" />
                        Editar
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <Campo label="CPF" value={cliente.cpf} />
                      <Campo label="RG" value={cliente.rg} />
                      <Campo label="Telefone" value={cliente.telefone} />
                      <Campo label="E-mail" value={cliente.email} />
                      <Campo label="Nascimento" value={formatDate(cliente.data_nascimento)} />
                      <Campo label="Estado civil" value={cliente.estado_civil} />
                      <Campo label="Profissão" value={cliente.profissao} />
                    </div>
                    <Campo label="Endereço" value={endereco} />
                    {cliente.observacoes ? (
                      <Campo label="Observações" value={cliente.observacoes} />
                    ) : null}
                  </CardContent>
                </Card>

                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display text-xl text-primary">
                    Compras{compras?.length ? ` (${compras.length})` : ""}
                  </h3>
                  <Button
                    size="sm"
                    onClick={() => {
                      setCompraEditando(undefined);
                      setCompraDialogOpen(true);
                    }}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Nova compra
                  </Button>
                </div>

                {isLoading ? (
                  <Skeleton className="h-40 w-full rounded-xl" />
                ) : (compras ?? []).length === 0 ? (
                  <Card>
                    <CardContent className="p-8 text-center text-sm text-muted-foreground">
                      Nenhuma compra registrada. Cadastre o contrato para vincular o lote e anexar a
                      documentação.
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-4">
                    {(compras ?? []).map((compra) => (
                      <CompraCard
                        key={compra.id}
                        compra={compra}
                        onEdit={() => {
                          setCompraEditando(compra);
                          setCompraDialogOpen(true);
                        }}
                        onPreviewDocumento={setDocumentoPreview}
                      />
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      {cliente ? (
        <>
          <ClienteFormDialog
            open={editandoCliente}
            onOpenChange={setEditandoCliente}
            cliente={cliente}
          />
          <CompraFormDialog
            open={compraDialogOpen}
            onOpenChange={setCompraDialogOpen}
            clienteId={cliente.id}
            compra={compraEditando}
          />
        </>
      ) : null}

      <DocumentoPreviewDialog
        documento={documentoPreview}
        open={Boolean(documentoPreview)}
        onOpenChange={(v) => {
          if (!v) setDocumentoPreview(null);
        }}
      />
    </>
  );
}
