// Painel da Brand Bible — regras de marca que alimentam os prompts da IA.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, BookOpen } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type BrandAsset = {
  id: string;
  type: string;
  title: string;
  content: string | null;
  is_active: boolean;
};

const TYPES = [
  { value: "rule", label: "Regra" },
  { value: "tone", label: "Tom de voz" },
  { value: "fact", label: "Fato oficial" },
  { value: "visual", label: "Direção visual" },
  { value: "banned", label: "Proibido" },
];

export function BrandAssetsPanel() {
  const queryClient = useQueryClient();
  const [type, setType] = useState("rule");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const { data: assets, isLoading } = useQuery({
    queryKey: ["brand-assets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brand_assets")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as unknown as BrandAsset[];
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["brand-assets"] });

  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("brand_assets")
        .insert({ type, title, content, is_active: true });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Diretriz adicionada.");
      setTitle("");
      setContent("");
      invalidate();
    },
    onError: () => toast.error("Não foi possível salvar a diretriz."),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("brand_assets").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: () => toast.error("Não foi possível atualizar a diretriz."),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("brand_assets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Diretriz removida.");
      invalidate();
    },
    onError: () => toast.error("Não foi possível remover a diretriz."),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <Card className="shadow-sm h-fit">
        <CardHeader>
          <CardTitle className="text-lg font-display text-primary flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-gold" />
            Nova diretriz
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="brand_title">Título</Label>
            <Input
              id="brand_title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: Nunca usar emoji"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="brand_content">Conteúdo</Label>
            <Textarea
              id="brand_content"
              rows={5}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Descreva a regra como você explicaria para um redator novo."
            />
          </div>
          <Button
            className="w-full"
            disabled={!title.trim() || addMutation.isPending}
            onClick={() => addMutation.mutate()}
          >
            <Plus className="h-4 w-4 mr-2" />
            {addMutation.isPending ? "Salvando..." : "Adicionar diretriz"}
          </Button>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-display text-primary">Brand Bible</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
          ) : (assets ?? []).length === 0 ? (
            <p className="py-10 text-center text-muted-foreground">
              Nenhuma diretriz salva. A IA usa a Brand Bible padrão do Moradas de Paraty.
            </p>
          ) : (
            (assets ?? []).map((asset) => (
              <div
                key={asset.id}
                className="flex items-start gap-4 rounded-lg border p-4"
              >
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-normal">
                      {TYPES.find((t) => t.value === asset.type)?.label ?? asset.type}
                    </Badge>
                    <span className="font-medium">{asset.title}</span>
                  </div>
                  {asset.content ? (
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {asset.content}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Switch
                    checked={asset.is_active}
                    onCheckedChange={(v) =>
                      toggleMutation.mutate({ id: asset.id, is_active: v })}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => deleteMutation.mutate(asset.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
