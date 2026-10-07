// Painel da Brand Bible — regras de marca que alimentam os prompts da IA.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, BookOpen } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Pill, type Tone } from "@/components/ds/pill";
import { Bloco } from "@/components/ds/bloco";
import { SkeletonRows } from "@/components/ds/query-state";
import { atraso } from "@/components/ds/reveal";
import { Campo, SeloIcone } from "@/components/ajustes/campos";
import { EmptyState } from "@/components/dashboard/empty-state";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

const TYPE_TONE: Record<string, Tone> = {
  rule: "neutral",
  tone: "info",
  fact: "success",
  visual: "accent",
  banned: "danger",
};

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
    <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
      <Card className="h-fit lg:sticky lg:top-6">
        <CardHeader className="flex-row items-center gap-3 space-y-0 p-6 pb-5">
          <SeloIcone icone={BookOpen} />
          <CardTitle className="text-[1.0625rem] leading-snug">Nova diretriz</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 border-t border-border pt-6">
          <Campo label="Tipo">
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
          <Campo id="brand_title" label="Título">
            <Input
              id="brand_title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: Nunca usar emoji"
            />
          </Campo>
          <Campo id="brand_content" label="Conteúdo">
            <Textarea
              id="brand_content"
              rows={5}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Descreva a regra como você explicaria para um redator novo."
            />
          </Campo>
          <Button
            className="w-full"
            disabled={!title.trim() || addMutation.isPending}
            onClick={() => addMutation.mutate()}
          >
            <Plus className="h-4 w-4" aria-hidden />
            {addMutation.isPending ? "Salvando..." : "Adicionar diretriz"}
          </Button>
        </CardContent>
      </Card>

      <Bloco titulo="Brand Bible">
        {isLoading ? (
          <SkeletonRows rows={3} className="h-24" />
        ) : (assets ?? []).length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="Nenhuma diretriz salva."
            description="A IA usa a Brand Bible padrão do Moradas de Paraty."
          />
        ) : (
          <ul className="space-y-3">
            {(assets ?? []).map((asset, i) => (
              <li key={asset.id} className="animate-swap" style={atraso(i, 45, 360)}>
                <div
                  className={cn(
                    "flex items-start gap-4 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)] transition-[opacity,border-color] duration-200 hover:border-foreground/25",
                    !asset.is_active && "opacity-60",
                  )}
                >
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill tone={TYPE_TONE[asset.type] ?? "neutral"}>
                        {TYPES.find((t) => t.value === asset.type)?.label ?? asset.type}
                      </Pill>
                      <span className="text-[0.9375rem] font-semibold">{asset.title}</span>
                    </div>
                    {asset.content ? (
                      <p className="whitespace-pre-wrap text-[0.875rem] leading-relaxed text-muted-foreground">
                        {asset.content}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Switch
                      aria-label={`${asset.is_active ? "Desativar" : "Ativar"} diretriz ${asset.title}`}
                      checked={asset.is_active}
                      onCheckedChange={(v) => toggleMutation.mutate({ id: asset.id, is_active: v })}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground hover:bg-danger-soft hover:text-danger"
                      onClick={() => deleteMutation.mutate(asset.id)}
                      aria-label={`Remover diretriz ${asset.title}`}
                      title="Remover diretriz"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Bloco>
    </div>
  );
}
