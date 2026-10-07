// Painel do acervo de fundos — a fonte primária de imagem do Imagery Engine.
// Fotos reais do empreendimento entram por upload manual aqui; imagens geradas
// aprovadas pelo validator são arquivadas automaticamente pelo pipeline.
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ImagePlus, Images, Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Pill } from "@/components/ds/pill";
import { Campo, SeloIcone } from "@/components/ajustes/campos";
import { EmptyState } from "@/components/dashboard/empty-state";
import { atraso } from "@/components/ds/reveal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

// Espelha _shared/acervo.ts e o CHECK de imagery_acervo.tag_tipo.
const BRAND_SLUG = "moradas_paraty";
const BUCKET = "imagery";
const ACERVO_PREFIX = "acervo";
const SIGNED_URL_TTL = 60 * 60 * 24 * 365;

const TAGS = [
  { value: "aerea", label: "Aérea do loteamento" },
  { value: "paisagem", label: "Paisagem / serra" },
  { value: "arquitetura", label: "Paraty histórica" },
  { value: "agua", label: "Rio / cachoeira" },
  { value: "detalhe", label: "Detalhe / textura" },
  { value: "vida", label: "Vida / cotidiano" },
];

const TAG_LABEL = Object.fromEntries(TAGS.map((t) => [t.value, t.label]));

type AcervoItem = {
  id: string;
  file_path: string;
  file_url: string;
  tag_tipo: string;
  origem: string;
  titulo: string | null;
  contem_pessoas: boolean;
  uso_count: number;
  last_used_at: string | null;
  ativo: boolean;
  created_at: string;
};

export function AcervoPanel() {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [tag, setTag] = useState("aerea");
  const [contemPessoas, setContemPessoas] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [filtro, setFiltro] = useState("todas");

  const { data: itens, isLoading } = useQuery({
    queryKey: ["imagery-acervo", filtro],
    queryFn: async () => {
      let q = supabase
        .from("imagery_acervo")
        .select("*")
        .eq("brand_slug", BRAND_SLUG)
        .order("created_at", { ascending: false });
      if (filtro !== "todas") q = q.eq("tag_tipo", filtro);
      const { data, error } = await q;
      if (error) {
        console.error("[imagery-acervo] falha ao carregar:", {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        });
        throw error;
      }
      return data as unknown as AcervoItem[];
    },
  });

  const uploadFiles = async (files: FileList) => {
    setUploading(true);
    let ok = 0;
    let falhas = 0;

    for (const file of Array.from(files)) {
      try {
        const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `${ACERVO_PREFIX}/${tag}/${crypto.randomUUID()}.${ext}`;

        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
        if (upErr) throw upErr;

        // Bucket privado: a URL assinada é a única forma de exibir, e é a mesma
        // que o pipeline entrega ao compose. Nada aqui torna o bucket público.
        const { data: signed, error: signErr } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(path, SIGNED_URL_TTL);
        if (signErr) throw signErr;

        const { error: insErr } = await supabase.from("imagery_acervo").insert({
          brand_slug: BRAND_SLUG,
          file_path: path,
          file_url: signed.signedUrl,
          tag_tipo: tag,
          origem: "upload_manual",
          titulo: file.name.replace(/\.[^.]+$/, ""),
          contem_pessoas: contemPessoas,
        });
        if (insErr) throw insErr;
        ok++;
      } catch (e) {
        falhas++;
        console.error("[imagery-acervo] upload falhou:", file.name, e);
      }
    }

    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
    queryClient.invalidateQueries({ queryKey: ["imagery-acervo"] });

    if (ok) toast.success(`${ok} foto(s) adicionada(s) ao acervo.`);
    if (falhas) toast.error(`${falhas} foto(s) não puderam ser enviadas.`);
  };

  const removeMutation = useMutation({
    mutationFn: async (item: AcervoItem) => {
      // Remove o registro primeiro: é ele que alimenta a seleção. O arquivo sai
      // em seguida, e uma falha ali não deixa a foto voltar a ser escolhida.
      const { error } = await supabase.from("imagery_acervo").delete().eq("id", item.id);
      if (error) throw error;
      await supabase.storage.from(BUCKET).remove([item.file_path]);
    },
    onSuccess: () => {
      toast.success("Foto removida do acervo.");
      queryClient.invalidateQueries({ queryKey: ["imagery-acervo"] });
    },
    onError: () => toast.error("Não foi possível remover a foto."),
  });

  const total = itens?.length ?? 0;
  const manuais = (itens ?? []).filter((i) => i.origem === "upload_manual").length;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-start gap-3 space-y-0 p-6">
        <SeloIcone icone={Images} />
        <div className="min-w-0">
          <CardTitle className="text-[1.0625rem] leading-snug">Acervo de fundos</CardTitle>
          <p className="mt-1 max-w-2xl text-[0.8125rem] leading-relaxed text-muted-foreground">
            Fotos reais do empreendimento são a fonte principal das artes. O gerador só cria imagem
            nova quando não há foto compatível no acervo.
          </p>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 border-t border-border pt-6">
        <div className="grid gap-5 rounded-2xl border border-dashed border-border bg-background p-5 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="grid gap-5 sm:grid-cols-2">
            <Campo label="Tipo da foto">
              <Select value={tag} onValueChange={setTag}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TAGS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Campo>

            <div className="flex items-start gap-2.5 pt-1 sm:pt-7">
              <Checkbox
                id="contem-pessoas"
                checked={contemPessoas}
                onCheckedChange={(v) => setContemPessoas(v === true)}
              />
              <Label htmlFor="contem-pessoas" className="text-sm font-normal leading-snug">
                Contém pessoas identificáveis
                <span className="block text-xs text-muted-foreground">
                  Fotos marcadas nunca são escolhidas automaticamente.
                </span>
              </Label>
            </div>
          </div>

          <div>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => e.target.files?.length && uploadFiles(e.target.files)}
            />
            <Button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="w-full sm:w-auto"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <ImagePlus className="h-4 w-4" aria-hidden />
              )}
              {uploading ? "Enviando..." : "Adicionar fotos"}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm tabular-nums text-muted-foreground">
            {total} foto(s) no acervo · {manuais} real(is) do empreendimento
          </p>
          <Select value={filtro} onValueChange={setFiltro}>
            <SelectTrigger className="w-56" aria-label="Filtrar por tipo de foto">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todos os tipos</SelectItem>
              {TAGS.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div aria-hidden className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square w-full rounded-xl" />
            ))}
          </div>
        ) : total === 0 ? (
          <EmptyState
            icon={Images}
            title="Nenhuma foto ainda."
            description="Suba as aéreas do loteamento para o gerador parar de inventar imagem."
          />
        ) : (
          <ul key={filtro} className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
            {(itens ?? []).map((item, i) => (
              <li key={item.id} className="animate-swap" style={atraso(i, 35, 350)}>
                <div className="card-hover group relative overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
                  <img
                    src={item.file_url}
                    alt={item.titulo ?? item.tag_tipo}
                    loading="lazy"
                    className="aspect-square w-full object-cover transition-transform duration-500 ease-[var(--ease-out)] group-hover:scale-[1.05] motion-reduce:transform-none"
                  />

                  <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-1 p-2">
                    <Pill
                      className={cn(
                        "text-[0.65rem] shadow-sm",
                        item.origem === "upload_manual"
                          ? "bg-primary text-primary-foreground"
                          : "bg-card text-foreground",
                      )}
                    >
                      {TAG_LABEL[item.tag_tipo] ?? item.tag_tipo}
                    </Pill>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="icon"
                          variant="secondary"
                          className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                          title="Remover do acervo"
                          aria-label="Remover do acervo"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-danger" aria-hidden />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remover do acervo?</AlertDialogTitle>
                          <AlertDialogDescription>
                            A foto deixa de ser usada em novos posts. As artes já geradas com ela
                            continuam intactas.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => removeMutation.mutate(item)}
                            className="bg-danger text-primary-foreground hover:bg-danger/90"
                          >
                            Remover
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>

                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-forest-deep/80 to-transparent p-2 pt-8">
                    <p className="text-[0.68rem] leading-snug text-ivory">
                      {item.origem === "upload_manual" ? "Foto real" : "Gerada · aprovada"} ·{" "}
                      {item.uso_count} uso(s)
                      {item.contem_pessoas ? " · com pessoas" : ""}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
