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

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return digits.startsWith("55") ? digits : `55${digits}`;
}

function parseMetragem(value: Lead["metragem"]): number | null {
  const match = value.match(/\d+/);
  return match ? Number(match[0]) : null;
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

      // Idempotent create/update via a SECURITY DEFINER RPC. Re-submitting the
      // same phone (unique index) updates the existing lead's contact fields
      // instead of 409ing, and preserves its CRM progress (status_crm,
      // vendedor_id, origem). anon gets no direct SELECT/UPDATE on leads.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: leadId, error: rpcError } = await (supabase.rpc as any)(
        "upsert_lead_from_form",
        {
          p_nome: lead.nome,
          p_email: lead.email || null,
          p_telefone: telefoneNormalizado,
          p_cidade: lead.cidade || null,
          p_metragem_interesse: parseMetragem(lead.metragem),
          p_tipo_lote_interesse: lead.tipo ? lead.tipo.toLowerCase() : null,
        },
      );

      if (rpcError) throw rpcError;

      setSent(true);
      setLead(empty);

      // Fire-and-forget: everything that needs the new lead's id and elevated
      // access (round-robin assignment, origin history entry, WhatsApp AI
      // handoff) runs in the enrich-lead Edge Function with service_role.
      supabase.functions
        .invoke("enrich-lead", {
          body: {
            // O id vem do RPC: a abordagem da Sophia passa a depender do lead
            // ter sido de fato persistido, em vez de a edge function reencontrá-lo
            // pelo telefone e arriscar não achar.
            lead_id: leadId ?? null,
            telefone: telefoneNormalizado,
            nome: lead.nome,
            cidade: lead.cidade || null,
            metragem: lead.metragem || null,
            tipo: lead.tipo || null,
          },
        })
        .catch((e) => {
          // Fire-and-forget não pode virar silêncio: se o enriquecimento
          // falhar, o lead está salvo mas fica sem vendedor e sem a abordagem
          // da Sophia — e ninguém saberia.
          console.error("[LeadForm] enrich-lead falhou:", e);
        });

      setTimeout(() => setSent(false), 6000);
    } catch (e) {
      // O catch sem variável engolia o erro do PostgREST por completo: a tela
      // mostrava a mensagem genérica e o console ficava limpo, o que tornava
      // impossível descobrir a causa de uma falha em produção.
      const erro = e as { code?: string; message?: string; details?: string; hint?: string };
      console.error("[LeadForm] falha ao enviar o formulário:", {
        code: erro?.code,
        message: erro?.message,
        details: erro?.details,
        hint: erro?.hint,
        erroCompleto: e,
      });
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
            Recebemos seus dados! Nossa equipe entrará em contato em breve.
          </p>
        )}
        {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
      </div>
    </form>
  );
}
