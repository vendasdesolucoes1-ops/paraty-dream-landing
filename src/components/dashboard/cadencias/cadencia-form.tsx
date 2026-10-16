import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Paperclip, Plus, Repeat, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Chip } from "@/components/ds/chip";
import { FormGaveta } from "@/components/visoes/form-gaveta";
import { Campo, Secao } from "@/components/ajustes/campos";
import { TemplateEditor } from "@/components/dashboard/cadencias/template-editor";
import { supabase } from "@/lib/supabase";
import { COLUNAS_INSTANCIA_PAINEL, LEAD_STATUS_COLUMNS } from "@/lib/types";
import type { LeadStatus, WhatsappInstance } from "@/lib/types";
import {
  GATILHOS,
  MODOS,
  REFERENCIAS,
  mensagemDeErro,
  useSalvarCadencia,
  type Cadencia,
  type CadenciaForm,
  type EtapaForm,
} from "@/lib/cadencias";
import {
  descreverDeslocamento,
  formatIntervaloPg,
  parseIntervalo,
  partesDoTemplate,
  type Deslocamento,
} from "@/lib/cadencias-formato";

// O Select do Radix não aceita valor vazio.
const INSTANCIA_PADRAO = "padrao";

/** Etapa no formulário: o deslocamento já separado em dias e horas. */
interface EtapaEditavel extends Omit<EtapaForm, "deslocamento"> {
  desloc: Deslocamento;
}

function etapaNova(gatilho: CadenciaForm["gatilho"], ordem: number): EtapaEditavel {
  const visita = gatilho === "visita_agendada";
  return {
    id: crypto.randomUUID(),
    referencia: visita ? "visita" : ordem === 1 ? "inscricao" : "anterior",
    desloc: { dias: visita ? -1 : 1, horas: 0, minutos: 0 },
    hora_fixa: visita ? "10:00" : null,
    modo: "template",
    template: "",
    ativa: true,
    midia: null,
  };
}

function formVazio(): Omit<CadenciaForm, "etapas"> {
  return {
    id: null,
    nome: "",
    descricao: "",
    gatilho: "manual",
    ativa: false,
    pausa_ao_responder: true,
    status_crm_validos: null,
    instance_id: null,
  };
}

/** Número inteiro de um input, aceitando "-" no meio da digitação. */
function inteiro(v: string): number {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}

function validar(base: Omit<CadenciaForm, "etapas">, etapas: EtapaEditavel[]): string | null {
  if (!base.nome.trim()) return "Dê um nome à cadência.";
  if (etapas.length === 0) return "Inclua ao menos uma etapa.";
  for (const [i, e] of etapas.entries()) {
    const n = i + 1;
    if (partesDoTemplate(e.template).length === 0 && !e.midia) {
      return `A etapa ${n} está sem texto.`;
    }
    if (e.referencia === "visita" && base.gatilho !== "visita_agendada") {
      return `Etapa ${n}: "Data da visita" só vale em cadência de visita agendada.`;
    }
    const total = e.desloc.dias * 1440 + e.desloc.horas * 60 + e.desloc.minutos;
    if (total < 0 && e.referencia !== "visita") {
      return `Etapa ${n}: tempo negativo só faz sentido antes da visita.`;
    }
  }
  return null;
}

/**
 * Criar ou editar uma cadência e as etapas. Campanha não passa por aqui: é
 * criada pelo disparador em Ferramentas.
 */
export function CadenciaFormGaveta({
  open,
  onOpenChange,
  cadencia,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Nula para criar uma nova. */
  cadencia: Cadencia | null;
}) {
  const [base, setBase] = useState(formVazio);
  const [etapas, setEtapas] = useState<EtapaEditavel[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const salvar = useSalvarCadencia();

  useEffect(() => {
    if (!open) return;
    setErro(null);
    if (cadencia) {
      setBase({
        id: cadencia.id,
        nome: cadencia.nome,
        descricao: cadencia.descricao ?? "",
        gatilho: cadencia.gatilho === "campanha" ? "manual" : cadencia.gatilho,
        ativa: cadencia.ativa,
        pausa_ao_responder: cadencia.pausa_ao_responder,
        status_crm_validos: cadencia.status_crm_validos,
        instance_id: cadencia.instance_id,
      });
      setEtapas(
        cadencia.etapas.map((e) => ({
          id: e.id,
          referencia: e.referencia,
          desloc: parseIntervalo(e.deslocamento),
          hora_fixa: e.hora_fixa ? e.hora_fixa.slice(0, 5) : null,
          modo: e.modo,
          template: e.template,
          ativa: e.ativa,
          midia: e.midia,
        })),
      );
    } else {
      setBase(formVazio());
      setEtapas([etapaNova("manual", 1)]);
    }
    // Só ao abrir (ou trocar de cadência): um refetch em segundo plano não pode
    // apagar o que está sendo digitado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cadencia?.id]);

  const { data: instancias } = useQuery({
    queryKey: ["whatsapp-instances"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_instances")
        .select(COLUNAS_INSTANCIA_PAINEL)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as WhatsappInstance[];
    },
  });

  function mudarEtapa(i: number, parcial: Partial<EtapaEditavel>) {
    setEtapas((lista) => lista.map((e, j) => (j === i ? { ...e, ...parcial } : e)));
  }

  function mover(i: number, delta: -1 | 1) {
    setEtapas((lista) => {
      const j = i + delta;
      if (j < 0 || j >= lista.length) return lista;
      const nova = [...lista];
      [nova[i], nova[j]] = [nova[j], nova[i]];
      return nova;
    });
  }

  function alternarStatusCrm(s: LeadStatus) {
    setBase((b) => {
      const atual = new Set(b.status_crm_validos ?? []);
      if (atual.has(s)) atual.delete(s);
      else atual.add(s);
      return { ...b, status_crm_validos: atual.size > 0 ? [...atual] : null };
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problema = validar(base, etapas);
    setErro(problema);
    if (problema) return;
    salvar.mutate(
      {
        form: {
          ...base,
          etapas: etapas.map(({ desloc, ...e }) => ({
            ...e,
            deslocamento: formatIntervaloPg(desloc),
          })),
        },
        anteriores: cadencia?.etapas ?? [],
      },
      {
        onSuccess: () => {
          toast.success(cadencia ? "Cadência atualizada." : "Cadência criada.");
          onOpenChange(false);
        },
        onError: (e) => setErro(mensagemDeErro(e, "Erro ao salvar a cadência.")),
      },
    );
  }

  const gatilhoInfo = GATILHOS.find((g) => g.value === base.gatilho);

  return (
    <FormGaveta
      open={open}
      onOpenChange={onOpenChange}
      icone={Repeat}
      titulo={cadencia ? "Editar cadência" : "Nova cadência"}
      subtitulo="Sequência de mensagens de follow-up pelo WhatsApp."
      descricao="Defina quando o lead entra e o que recebe em cada etapa."
      formId="form-cadencia"
      onSubmit={handleSubmit}
      rotuloSalvar={cadencia ? "Salvar" : "Criar cadência"}
      rotuloAtalho="salvar"
      salvando={salvar.isPending}
      erro={erro}
    >
      <Secao titulo="Cadência">
        <Campo id="cad-nome" label="Nome" obrigatorio>
          <Input
            id="cad-nome"
            maxLength={120}
            value={base.nome}
            onChange={(e) => setBase({ ...base, nome: e.target.value })}
            placeholder="Ex.: Reengajar quem sumiu"
          />
        </Campo>
        <Campo id="cad-descricao" label="Descrição">
          <Textarea
            id="cad-descricao"
            rows={2}
            maxLength={500}
            value={base.descricao ?? ""}
            onChange={(e) => setBase({ ...base, descricao: e.target.value })}
          />
        </Campo>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo id="cad-gatilho" label="Quando o lead entra" dica={gatilhoInfo?.dica}>
            <Select
              value={base.gatilho}
              onValueChange={(v) => setBase({ ...base, gatilho: v as CadenciaForm["gatilho"] })}
            >
              <SelectTrigger id="cad-gatilho">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GATILHOS.map((g) => (
                  <SelectItem key={g.value} value={g.value}>
                    {g.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
          <Campo id="cad-instancia" label="Instância" dica="Padrão: a instância principal.">
            <Select
              value={base.instance_id ?? INSTANCIA_PADRAO}
              onValueChange={(v) =>
                setBase({ ...base, instance_id: v === INSTANCIA_PADRAO ? null : v })
              }
            >
              <SelectTrigger id="cad-instancia">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={INSTANCIA_PADRAO}>Padrão</SelectItem>
                {(instancias ?? []).map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.instance_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
        </div>
        <label className="flex items-start justify-between gap-4 text-sm">
          <span>
            <span className="font-medium text-foreground">Pausar quando o lead responder</span>
            <span className="block text-xs text-muted-foreground">
              A conversa segue com a equipe; a cadência pode ser retomada pela ficha.
            </span>
          </span>
          <Switch
            checked={base.pausa_ao_responder}
            onCheckedChange={(v) => setBase({ ...base, pausa_ao_responder: v })}
          />
        </label>
        <label className="flex items-start justify-between gap-4 text-sm">
          <span>
            <span className="font-medium text-foreground">Ligada</span>
            <span className="block text-xs text-muted-foreground">
              Desligada, nenhuma etapa sai e ninguém novo entra.
            </span>
          </span>
          <Switch checked={base.ativa} onCheckedChange={(v) => setBase({ ...base, ativa: v })} />
        </label>
        <Campo
          label="Etapas do funil em que vale"
          dica="O lead sair dessas etapas conta como conversão e encerra a cadência. Nenhuma marcada: qualquer etapa."
        >
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Etapas do funil">
            {LEAD_STATUS_COLUMNS.map((s) => (
              <Chip
                key={s.value}
                ativo={base.status_crm_validos?.includes(s.value) ?? false}
                onClick={() => alternarStatusCrm(s.value)}
              >
                {s.label}
              </Chip>
            ))}
          </div>
        </Campo>
      </Secao>

      <Secao
        titulo="Etapas"
        descricao="Em ordem. Cada etapa sai depois do tempo indicado, dentro da janela de envio e do limite diário."
      >
        <ol className="space-y-4">
          {etapas.map((e, i) => (
            <li
              key={e.id}
              className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground">Etapa {i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {descreverDeslocamento(e.desloc, e.referencia, e.hora_fixa)}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={i === 0}
                  onClick={() => mover(i, -1)}
                  aria-label={`Subir etapa ${i + 1}`}
                >
                  <ArrowUp className="h-4 w-4" aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={i === etapas.length - 1}
                  onClick={() => mover(i, 1)}
                  aria-label={`Descer etapa ${i + 1}`}
                >
                  <ArrowDown className="h-4 w-4" aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-danger hover:text-danger"
                  onClick={() => setEtapas((l) => l.filter((_, j) => j !== i))}
                  aria-label={`Remover etapa ${i + 1}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Campo id={`etapa-ref-${e.id}`} label="Contar a partir de">
                  <Select
                    value={e.referencia}
                    onValueChange={(v) =>
                      mudarEtapa(i, { referencia: v as EtapaEditavel["referencia"] })
                    }
                  >
                    <SelectTrigger id={`etapa-ref-${e.id}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REFERENCIAS.filter(
                        (r) => r.value !== "visita" || base.gatilho === "visita_agendada",
                      ).map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Campo>
                <Campo
                  id={`etapa-modo-${e.id}`}
                  label="Modo"
                  dica={MODOS.find((m) => m.value === e.modo)?.dica}
                >
                  <Select
                    value={e.modo}
                    onValueChange={(v) => mudarEtapa(i, { modo: v as EtapaEditavel["modo"] })}
                  >
                    <SelectTrigger id={`etapa-modo-${e.id}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MODOS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Campo>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <Campo
                  id={`etapa-dias-${e.id}`}
                  label="Dias"
                  dica={e.referencia === "visita" ? "Negativo = antes" : undefined}
                >
                  <Input
                    id={`etapa-dias-${e.id}`}
                    type="number"
                    inputMode="numeric"
                    step={1}
                    min={e.referencia === "visita" ? -30 : 0}
                    max={90}
                    value={e.desloc.dias}
                    onChange={(ev) =>
                      mudarEtapa(i, { desloc: { ...e.desloc, dias: inteiro(ev.target.value) } })
                    }
                  />
                </Campo>
                <Campo id={`etapa-horas-${e.id}`} label="Horas">
                  <Input
                    id={`etapa-horas-${e.id}`}
                    type="number"
                    inputMode="numeric"
                    step={1}
                    min={-23}
                    max={23}
                    value={e.desloc.horas}
                    onChange={(ev) =>
                      mudarEtapa(i, { desloc: { ...e.desloc, horas: inteiro(ev.target.value) } })
                    }
                  />
                </Campo>
                <Campo id={`etapa-hora-${e.id}`} label="Às (opcional)">
                  <div className="flex items-center gap-1">
                    <Input
                      id={`etapa-hora-${e.id}`}
                      type="time"
                      value={e.hora_fixa ?? ""}
                      onChange={(ev) => mudarEtapa(i, { hora_fixa: ev.target.value || null })}
                    />
                    {e.hora_fixa ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => mudarEtapa(i, { hora_fixa: null })}
                        aria-label="Tirar horário fixo"
                      >
                        <X className="h-4 w-4" aria-hidden />
                      </Button>
                    ) : null}
                  </div>
                </Campo>
              </div>

              <Campo
                id={`etapa-texto-${e.id}`}
                label="Mensagem"
                dica={
                  e.modo === "ia_aprovacao"
                    ? "Serve de base para a IA; alguém aprova antes de sair."
                    : "Use || para quebrar em mais de uma mensagem."
                }
              >
                <TemplateEditor
                  id={`etapa-texto-${e.id}`}
                  value={e.template}
                  onChange={(v) => mudarEtapa(i, { template: v })}
                  variaveis={
                    base.gatilho === "visita_agendada"
                      ? ["primeiro_nome", "data_visita", "hora_visita"]
                      : ["primeiro_nome"]
                  }
                />
              </Campo>

              {e.midia ? (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Paperclip className="h-3.5 w-3.5" aria-hidden />
                  Anexo: {e.midia.nome ?? e.midia.tipo}
                </p>
              ) : null}

              <label className="flex items-center justify-between gap-4 text-sm">
                <span className="text-muted-foreground">Etapa ligada</span>
                <Switch checked={e.ativa} onCheckedChange={(v) => mudarEtapa(i, { ativa: v })} />
              </label>
            </li>
          ))}
        </ol>
        <Button
          type="button"
          variant="outline"
          onClick={() => setEtapas((l) => [...l, etapaNova(base.gatilho, l.length + 1)])}
        >
          <Plus className="h-4 w-4" aria-hidden />
          Adicionar etapa
        </Button>
      </Secao>
    </FormGaveta>
  );
}
