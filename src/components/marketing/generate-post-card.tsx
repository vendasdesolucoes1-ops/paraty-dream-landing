import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sparkles, Download, Send, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useInstagramConfig } from "@/components/marketing/instagram-settings-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface GeneratedPost {
  titulo: string;
  copy: string;
  hashtags: string[];
  imagem_url: string;
}

const emptyForm = {
  tema: "",
  tipo_lote: "",
  metragem: "",
  valor: "",
  destaque: "",
};

export function GeneratePostCard({ onPublished }: { onPublished?: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [result, setResult] = useState<GeneratedPost | null>(null);
  const [copyText, setCopyText] = useState("");
  const [hashtagsText, setHashtagsText] = useState("");
  const [postId, setPostId] = useState<string | null>(null);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false);

  const { data: instagramConfig } = useInstagramConfig();

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!form.tema.trim()) throw new Error("Informe o tema do post.");

      const { data, error } = await supabase.functions.invoke("generate-post", {
        body: {
          tema: form.tema,
          tipo_lote: form.tipo_lote || undefined,
          metragem: form.metragem || undefined,
          valor: form.valor || undefined,
          destaque: form.destaque || undefined,
        },
      });
      if (error || data?.error) throw new Error(data?.error ?? error?.message ?? "erro");
      return data as GeneratedPost;
    },
    onSuccess: async (data) => {
      setResult(data);
      setCopyText(data.copy);
      setHashtagsText(data.hashtags.join(" "));
      setPublishedUrl(null);

      const { data: inserted, error } = await supabase
        .from("posts_marketing")
        .insert({
          titulo: data.titulo,
          copy_texto: data.copy,
          hashtags: data.hashtags.join(" "),
          imagem_url: data.imagem_url,
          status: "rascunho",
        })
        .select("id")
        .single();

      if (!error && inserted) {
        setPostId(inserted.id);
        queryClient.invalidateQueries({ queryKey: ["posts-marketing"] });
      }
    },
    onError: (error: Error) => toast.error(error.message || "Erro ao gerar o post."),
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      if (!postId) throw new Error("Gere o post antes de publicar.");
      const { data, error } = await supabase.functions.invoke("publish-instagram", {
        body: {
          post_id: postId,
          copy_texto: copyText,
          hashtags: hashtagsText.split(/\s+/).filter(Boolean),
          imagem_url: result?.imagem_url,
          instagram_token: instagramConfig?.instagram_token,
          instagram_user_id: instagramConfig?.instagram_user_id,
        },
      });
      if (error || !data?.success) throw new Error(data?.error ?? error?.message ?? "erro");
      return data as { success: true; instagram_post_id: string };
    },
    onSuccess: (data) => {
      toast.success("Post publicado no Instagram!");
      setPublishedUrl(`https://www.instagram.com/p/${data.instagram_post_id}`);
      queryClient.invalidateQueries({ queryKey: ["posts-marketing"] });
      onPublished?.();
    },
    onError: (error: Error) => toast.error(error.message || "Erro ao publicar no Instagram."),
  });

  function handlePublishClick() {
    if (!instagramConfig?.instagram_token || !instagramConfig?.instagram_user_id) {
      setTokenDialogOpen(true);
      return;
    }
    publishMutation.mutate();
  }

  async function handleDownload() {
    if (!result?.imagem_url) return;
    const response = await fetch(result.imagem_url);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${result.titulo || "post"}-moradas-de-paraty.png`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg font-display text-primary flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-gold" />
          Gerador de post
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tema">Tema do post</Label>
            <Input
              id="tema"
              placeholder="Ex: Lote disponível 250m², Fim de semana em Paraty, Natureza e qualidade de vida..."
              value={form.tema}
              onChange={(e) => setForm((f) => ({ ...f, tema: e.target.value }))}
            />
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Tipo de lote</Label>
              <Select
                value={form.tipo_lote || "nao_especificar"}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, tipo_lote: v === "nao_especificar" ? "" : v }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nao_especificar">Não especificar</SelectItem>
                  <SelectItem value="Residencial">Residencial</SelectItem>
                  <SelectItem value="Comercial">Comercial</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="metragem">Metragem</Label>
              <Input
                id="metragem"
                type="number"
                placeholder="Opcional"
                value={form.metragem}
                onChange={(e) => setForm((f) => ({ ...f, metragem: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="valor">Valor a partir de (R$)</Label>
              <Input
                id="valor"
                placeholder="Opcional"
                value={form.valor}
                onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="destaque">Destaque especial</Label>
            <Input
              id="destaque"
              placeholder="Ex: Últimas unidades, Condições especiais de pagamento..."
              value={form.destaque}
              onChange={(e) => setForm((f) => ({ ...f, destaque: e.target.value }))}
            />
          </div>

          <Button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
            <Sparkles className="h-4 w-4 mr-2" />
            {generateMutation.isPending ? "Gerando..." : "Gerar Post com IA"}
          </Button>
        </div>

        {generateMutation.isPending ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Gerando copy e imagem com IA...</p>
            <Skeleton className="aspect-square w-full max-w-md rounded-lg" />
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : result ? (
          <div className="space-y-4 border-t pt-6">
            <img
              src={result.imagem_url}
              alt={result.titulo}
              className="aspect-square w-full max-w-md rounded-lg object-cover border"
            />

            <div className="space-y-2 max-w-md">
              <Label>Título</Label>
              <p className="font-medium">{result.titulo}</p>
            </div>

            <div className="space-y-2 max-w-md">
              <Label htmlFor="copy-text">Copy</Label>
              <Textarea
                id="copy-text"
                rows={5}
                value={copyText}
                onChange={(e) => setCopyText(e.target.value)}
              />
            </div>

            <div className="space-y-2 max-w-md">
              <Label htmlFor="hashtags-text">Hashtags</Label>
              <Textarea
                id="hashtags-text"
                rows={2}
                value={hashtagsText}
                onChange={(e) => setHashtagsText(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" />
                Baixar imagem
              </Button>
              <Button onClick={handlePublishClick} disabled={publishMutation.isPending}>
                <Send className="h-4 w-4 mr-2" />
                {publishMutation.isPending ? "Publicando..." : "Publicar no Instagram"}
              </Button>
            </div>

            {publishedUrl ? (
              <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 font-normal">
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                <a href={publishedUrl} target="_blank" rel="noreferrer">
                  Publicado no Instagram
                </a>
              </Badge>
            ) : null}
          </div>
        ) : null}
      </CardContent>

      <Dialog open={tokenDialogOpen} onOpenChange={setTokenDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configure o Instagram primeiro</DialogTitle>
            <DialogDescription>
              Para publicar diretamente no Instagram, preencha o Instagram User ID e o Access Token
              na seção "Configurações do Instagram" abaixo, na página de Marketing.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setTokenDialogOpen(false)}>Entendi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
