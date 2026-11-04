import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { coordenadasDoLinkMaps } from "@/lib/agente-mapa";
import {
  BUCKET_MATERIAIS,
  TIPOS_MATERIAL,
  mensagemDeErro,
  nomeArquivoSeguro,
} from "@/lib/agente-ia";
import type { MaterialAgenteTipo } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Campo } from "@/components/ajustes/campos";

// materiais_agente não está nos tipos gerados do Supabase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const VAZIO = {
  tipo: "foto" as MaterialAgenteTipo,
  titulo: "",
  descricao: "",
  url: "",
  linkMaps: "",
  latitude: "",
  longitude: "",
  endereco: "",
};

function numero(v: string): number | null {
  const n = Number(v.trim().replace(",", "."));
  return v.trim() && Number.isFinite(n) ? n : null;
}

/** Cadastro de um material novo (arquivo enviado, link externo ou pin). */
export function MaterialFormDialog({ proximaOrdem }: { proximaOrdem: number }) {
  const queryClient = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [form, setForm] = useState(VAZIO);
  const [arquivo, setArquivo] = useState<File | null>(null);

  const tipoAtual = TIPOS_MATERIAL.find((t) => t.valor === form.tipo);
  const ehLocal = form.tipo === "localizacao";
  const lat = numero(form.latitude);
  const lng = numero(form.longitude);
  const coordenadasOk = lat != null && lng != null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const urlOk = /^https?:\/\/\S+$/i.test(form.url.trim());
  const valido =
    Boolean(form.titulo.trim()) && (ehLocal ? coordenadasOk : Boolean(arquivo) || urlOk);

  function colarLinkMaps(texto: string) {
    const c = coordenadasDoLinkMaps(texto);
    setForm((f) => ({
      ...f,
      linkMaps: texto,
      ...(c ? { latitude: String(c.latitude), longitude: String(c.longitude) } : {}),
    }));
  }

  const salvar = useMutation({
    mutationFn: async () => {
      let url: string | null = ehLocal ? null : form.url.trim() || null;
      let mime: string | null = null;
      if (!ehLocal && arquivo) {
        const caminho = `${form.tipo}/${crypto.randomUUID()}-${nomeArquivoSeguro(arquivo.name)}`;
        const { error: erroUpload } = await supabase.storage
          .from(BUCKET_MATERIAIS)
          .upload(caminho, arquivo, { contentType: arquivo.type || undefined, upsert: false });
        if (erroUpload) throw erroUpload;
        url = supabase.storage.from(BUCKET_MATERIAIS).getPublicUrl(caminho).data.publicUrl;
        mime = arquivo.type || null;
      }
      const { error } = await db.from("materiais_agente").insert({
        tipo: form.tipo,
        titulo: form.titulo.trim(),
        descricao: form.descricao.trim() || null,
        url,
        mime_type: mime,
        latitude: ehLocal ? lat : null,
        longitude: ehLocal ? lng : null,
        endereco: ehLocal ? form.endereco.trim() || null : null,
        ativo: true,
        ordem: proximaOrdem,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Material cadastrado. A Sophia já pode enviar.");
      void queryClient.invalidateQueries({ queryKey: ["materiais-agente"] });
      setForm(VAZIO);
      setArquivo(null);
      setAberto(false);
    },
    onError: (e) => toast.error(mensagemDeErro(e, "Não foi possível salvar o material.")),
  });

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        setAberto(v);
        if (!v) {
          setForm(VAZIO);
          setArquivo(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" aria-hidden />
          Adicionar material
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">Novo material</DialogTitle>
          <DialogDescription>
            O título e a descrição ajudam a Sophia a escolher o que enviar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Campo id="material_tipo" label="Tipo">
            <Select
              value={form.tipo}
              onValueChange={(v) => {
                setForm((f) => ({ ...f, tipo: v as MaterialAgenteTipo }));
                setArquivo(null);
              }}
            >
              <SelectTrigger id="material_tipo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS_MATERIAL.map((t) => (
                  <SelectItem key={t.valor} value={t.valor}>
                    {t.rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>

          <Campo id="material_titulo" label="Título" obrigatorio>
            <Input
              id="material_titulo"
              placeholder={ehLocal ? "Ex.: Portaria do condomínio" : "Ex.: Vista aérea da praia"}
              value={form.titulo}
              onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
            />
          </Campo>

          <Campo
            id="material_descricao"
            label="Descrição"
            dica="Opcional. Quando usar este material."
          >
            <Textarea
              id="material_descricao"
              rows={2}
              value={form.descricao}
              onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
            />
          </Campo>

          {ehLocal ? (
            <>
              <Campo
                id="material_link_maps"
                label="Colar link do Google Maps"
                dica={
                  form.linkMaps && !coordenadasDoLinkMaps(form.linkMaps)
                    ? "Não achei coordenadas neste link. Link curto (maps.app.goo.gl) não serve: abra-o e copie o endereço completo da barra do navegador."
                    : "Preenche latitude e longitude sozinho."
                }
              >
                <Input
                  id="material_link_maps"
                  placeholder="https://www.google.com/maps/place/…/@-23.21,-44.71,17z"
                  value={form.linkMaps}
                  onChange={(e) => colarLinkMaps(e.target.value)}
                />
              </Campo>
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo id="material_lat" label="Latitude" obrigatorio>
                  <Input
                    id="material_lat"
                    inputMode="decimal"
                    placeholder="-23.2178"
                    value={form.latitude}
                    onChange={(e) => setForm((f) => ({ ...f, latitude: e.target.value }))}
                  />
                </Campo>
                <Campo id="material_lng" label="Longitude" obrigatorio>
                  <Input
                    id="material_lng"
                    inputMode="decimal"
                    placeholder="-44.7131"
                    value={form.longitude}
                    onChange={(e) => setForm((f) => ({ ...f, longitude: e.target.value }))}
                  />
                </Campo>
              </div>
              <Campo id="material_endereco" label="Endereço" dica="Opcional, vai junto do pin.">
                <Input
                  id="material_endereco"
                  value={form.endereco}
                  onChange={(e) => setForm((f) => ({ ...f, endereco: e.target.value }))}
                />
              </Campo>
            </>
          ) : (
            <>
              <Campo
                id="material_arquivo"
                label="Enviar arquivo"
                dica={
                  arquivo
                    ? `${arquivo.name} · ${(arquivo.size / 1024 / 1024).toFixed(1)} MB`
                    : undefined
                }
              >
                <Input
                  id="material_arquivo"
                  type="file"
                  accept={tipoAtual?.aceita || undefined}
                  onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
                />
              </Campo>
              <Campo
                id="material_url"
                label="Ou colar um link"
                dica="Link público (por exemplo, do Drive ou YouTube). Ignorado se você enviar um arquivo."
              >
                <Input
                  id="material_url"
                  placeholder="https://…"
                  value={form.url}
                  disabled={Boolean(arquivo)}
                  onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                />
              </Campo>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setAberto(false)} disabled={salvar.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => salvar.mutate()} disabled={!valido || salvar.isPending}>
            {salvar.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {salvar.isPending ? (arquivo ? "Enviando..." : "Salvando...") : "Salvar material"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
