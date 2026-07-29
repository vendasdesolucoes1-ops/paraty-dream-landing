// Painel do acervo de fundos — a fonte primária de imagem do Imagery Engine.
// Fotos reais do empreendimento entram por upload manual aqui; imagens geradas
// aprovadas pelo validator são arquivadas automaticamente pelo pipeline.
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ImagePlus, Images, Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
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
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg font-display text-primary flex items-center gap-2">
          <Images className="h-5 w-5 text-gold" />
          Acervo de fundos
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Fotos reais do empreendimento são a fonte principal das artes. O gerador só cria imagem
          nova quando não há foto compatível no acervo.
        </p>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Tipo da foto</Label>
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
            </div>

            <div className="flex items-start gap-2 pt-1 sm:pt-7">
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
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <ImagePlus className="h-4 w-4 mr-2" />
              )}
              {uploading ? "Enviando..." : "Adicionar fotos"}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="text-sm text-muted-foreground">
            {total} foto(s) no acervo · {manuais} real(is) do empreendimento
          </p>
          <Select value={filtro} onValueChange={setFiltro}>
            <SelectTrigger className="w-56">
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
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square w-full rounded-lg" />
            ))}
          </div>
        ) : total === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Nenhuma foto ainda. Suba as aéreas do loteamento para o gerador parar de inventar
            imagem.
          </p>
        ) : (
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 xl:grid-cols-5">
            {(itens ?? []).map((item) => (
              <div key={item.id} className="group relative overflow-hidden rounded-lg border">
                <img
                  src={item.file_url}
                  alt={item.titulo ?? item.tag_tipo}
                  className="aspect-square w-full object-cover"
                />

                <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-1 p-1.5">
                  <Badge
                    className={cn(
                      "font-normal text-[10px]",
                      item.origem === "upload_manual"
                        ? "bg-forest-deep text-ivory hover:bg-forest-deep"
                        : "bg-sand-light text-forest-deep hover:bg-sand-light",
                    )}
                  >
                    {TAG_LABEL[item.tag_tipo] ?? item.tag_tipo}
                  </Badge>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="icon"
                        variant="secondary"
                        className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                        title="Remover do acervo"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle className="font-display">
                          Remover do acervo?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          A foto deixa de ser usada em novos posts. As artes já geradas com ela
                          continuam intactas.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => removeMutation.mutate(item)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Remover
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>

                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-forest-deep/80 to-transparent p-1.5 pt-6">
                  <p className="text-[10px] text-ivory">
                    {item.origem === "upload_manual" ? "Foto real" : "Gerada · aprovada"} ·{" "}
                    {item.uso_count} uso(s)
                    {item.contem_pessoas ? " · com pessoas" : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
