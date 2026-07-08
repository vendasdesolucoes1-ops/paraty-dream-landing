import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Lead {
  nome: string;
  email: string;
  telefone: string;
  cidade: string;
  metragem: "250m²" | "250-350m²" | "450m²" | "";
  tipo: "Residencial" | "Comercial" | "";
  criadoEm: string;
}

const empty: Lead = {
  nome: "",
  email: "",
  telefone: "",
  cidade: "",
  metragem: "",
  tipo: "",
  criadoEm: "",
};

const WEBHOOK_URL = "https://mokgxoygbjvtketoyraf.supabase.co/functions/v1/whatsapp-webhook";

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return digits.startsWith("55") ? digits : `55${digits}`;
}

function parseMetragem(value: Lead["metragem"]): number | null {
  const match = value.match(/\d+/);
  return match ? Number(match[0]) : null;
}

async function triggerAiAgent(telefone: string, nome: string) {
  const { data: instance } = await supabase
    .from("whatsapp_instances")
    .select("instance_name")
    .in("status", ["connected", "open"])
    .limit(1)
    .maybeSingle();

  // No connected WhatsApp instance yet — the lead is already saved, just skip the AI handoff.
  if (!instance) return;

  const timestamp = Date.now();

  await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event: "messages.upsert",
      instance: instance.instance_name,
      data: {
        key: {
          remoteJid: `${telefone}@s.whatsapp.net`,
          fromMe: false,
          id: `LP_${timestamp}_${telefone}`,
        },
        message: {
          conversation:
            "Olá! Vim pelo site do Moradas de Paraty e gostaria de mais informações sobre os lotes.",
        },
        pushName: nome,
        messageTimestamp: Math.floor(timestamp / 1000),
      },
    }),
  });
}

export function LeadForm() {
  const [lead, setLead] = useState<Lead>(empty);
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = <K extends keyof Lead>(k: K, v: Lead[K]) => setLead((l) => ({ ...l, [k]: v }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!lead.nome.trim() || !lead.telefone.trim()) {
      setError("Nome e telefone são obrigatórios.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const telefoneNormalizado = normalizePhone(lead.telefone);

      const { data: vendedorId } = await supabase.rpc("get_next_round_robin_salesperson");

      const { error: insertError } = await supabase.from("leads").insert({
        nome: lead.nome,
        email: lead.email || null,
        telefone: telefoneNormalizado,
        cidade: lead.cidade || null,
        metragem_interesse: parseMetragem(lead.metragem),
        tipo_lote_interesse: lead.tipo ? lead.tipo.toLowerCase() : null,
        origem: "lp",
        status_crm: "novo",
        vendedor_id: vendedorId ?? null,
      });

      if (insertError) throw insertError;

      setSent(true);
      setLead(empty);

      // Fire-and-forget: kick off the AI agent's WhatsApp handoff without blocking the UI.
      triggerAiAgent(telefoneNormalizado, lead.nome).catch(() => {});

      setTimeout(() => setSent(false), 6000);
    } catch {
      setError("Não foi possível enviar seu contato agora. Tente novamente em instantes.");
    } finally {
      setSubmitting(false);
    }
  };

  const field =
    "w-full bg-transparent border-b border-border focus:border-primary outline-none py-3 text-foreground placeholder:text-muted-foreground transition-colors";
  const label = "eyebrow text-muted-foreground block mb-1";

  return (
    <form onSubmit={onSubmit} className="space-y-7">
      <div>
        <label className={label} htmlFor="nome">
          Nome completo
        </label>
        <input
          id="nome"
          required
          value={lead.nome}
          onChange={(e) => update("nome", e.target.value)}
          className={field}
          placeholder="Como podemos te chamar"
        />
      </div>

      <div className="grid sm:grid-cols-2 gap-7">
        <div>
          <label className={label} htmlFor="email">
            E-mail
          </label>
          <input
            id="email"
            type="email"
            required
            value={lead.email}
            onChange={(e) => update("email", e.target.value)}
            className={field}
            placeholder="seu@email.com"
          />
        </div>
        <div>
          <label className={label} htmlFor="telefone">
            Telefone / WhatsApp
          </label>
          <input
            id="telefone"
            required
            value={lead.telefone}
            onChange={(e) => update("telefone", e.target.value)}
            className={field}
            placeholder="(00) 00000-0000"
          />
        </div>
      </div>

      <div>
        <label className={label} htmlFor="cidade">
          Cidade
        </label>
        <input
          id="cidade"
          required
          value={lead.cidade}
          onChange={(e) => update("cidade", e.target.value)}
          className={field}
          placeholder="Onde você mora"
        />
      </div>

      <div className="grid sm:grid-cols-2 gap-7">
        <div>
          <label className={label} htmlFor="metragem">
            Metragem ideal
          </label>
          <select
            id="metragem"
            required
            value={lead.metragem}
            onChange={(e) => update("metragem", e.target.value as Lead["metragem"])}
            className={`${field} appearance-none cursor-pointer`}
          >
            <option value="" disabled>
              Selecione
            </option>
            <option value="250m²">250 m²</option>
            <option value="250-350m²">250 a 350 m²</option>
            <option value="450m²">450 m²</option>
          </select>
        </div>
        <div>
          <label className={label} htmlFor="tipo">
            Tipo de lote
          </label>
          <select
            id="tipo"
            required
            value={lead.tipo}
            onChange={(e) => update("tipo", e.target.value as Lead["tipo"])}
            className={`${field} appearance-none cursor-pointer`}
          >
            <option value="" disabled>
              Selecione
            </option>
            <option value="Residencial">Residencial</option>
            <option value="Comercial">Comercial</option>
          </select>
        </div>
      </div>

      <div className="pt-4">
        <button
          type="submit"
          disabled={submitting}
          className="group inline-flex items-center gap-3 bg-primary text-primary-foreground px-10 py-4 eyebrow hover:bg-foreground transition-colors w-full sm:w-auto justify-center disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {submitting ? "Enviando..." : "Enviar"}
          {!submitting && (
            <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
          )}
        </button>
        {sent && (
          <p className="mt-4 text-sm text-forest">
            Recebemos seu contato! Em breve nossa equipe entrará em contato pelo WhatsApp.
          </p>
        )}
        {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
      </div>
    </form>
  );
}
