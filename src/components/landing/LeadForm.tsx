import { useState, type FormEvent } from "react";
import { ChevronDown } from "lucide-react";
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

/** Só os dígitos do número nacional (DDD + telefone), sem o 55 do país. */
function digitosNacionais(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  // Quem cola o número com o código do país (+55 11 9...) chega com 12-13 dígitos.
  if (digits.length > 11 && digits.startsWith("55")) return digits.slice(2, 13);
  return digits.slice(0, 11);
}

/** (11) 98765-4321 enquanto a pessoa digita. */
function formatarTelefone(raw: string): string {
  const d = digitosNacionais(raw);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  const ddd = d.slice(0, 2);
  const resto = d.slice(2);
  if (resto.length <= 4) return `(${ddd}) ${resto}`;
  const corte = resto.length === 9 ? 5 : 4;
  return `(${ddd}) ${resto.slice(0, corte)}-${resto.slice(corte)}`;
}

/** DDD válido (11 a 99) + 8 ou 9 dígitos. */
function telefoneValido(raw: string): boolean {
  const d = digitosNacionais(raw);
  return (d.length === 10 || d.length === 11) && Number(d.slice(0, 2)) >= 11;
}

/** Formato gravado no CRM e usado pela Sophia: 55 + DDD + número. */
function normalizePhone(raw: string): string {
  return `55${digitosNacionais(raw)}`;
}

function parseMetragem(value: Lead["metragem"]): number | null {
  const match = value.match(/\d+/);
  return match ? Number(match[0]) : null;
}

export function LeadForm() {
  const [lead, setLead] = useState<Lead>(empty);
  // Campo isca: invisível para pessoas, preenchido por robôs que completam
  // todo input da página. Cada envio real dispara IA e WhatsApp, então um
  // robô aqui custaria dinheiro e queimaria o número.
  const [isca, setIsca] = useState("");
  const [enviadoPara, setEnviadoPara] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [telefoneTocado, setTelefoneTocado] = useState(false);

  const update = <K extends keyof Lead>(k: K, v: Lead[K]) => setLead((l) => ({ ...l, [k]: v }));

  const telefoneComErro =
    telefoneTocado && lead.telefone.length > 0 && !telefoneValido(lead.telefone);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (isca.trim()) {
      // Finge sucesso: o robô não aprende que foi barrado.
      setEnviadoPara("você");
      return;
    }

    if (!lead.nome.trim()) {
      setError("Informe seu nome.");
      return;
    }
    if (!telefoneValido(lead.telefone)) {
      setTelefoneTocado(true);
      setError("Confira o telefone: use DDD + número, como (24) 99999-9999.");
      document.getElementById("telefone")?.focus();
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
          p_nome: lead.nome.trim(),
          p_email: lead.email.trim() || null,
          p_telefone: telefoneNormalizado,
          p_cidade: lead.cidade.trim() || null,
          p_metragem_interesse: parseMetragem(lead.metragem),
          p_tipo_lote_interesse: lead.tipo ? lead.tipo.toLowerCase() : null,
        },
      );

      if (rpcError) throw rpcError;

      setEnviadoPara(lead.nome.trim().split(/\s+/)[0] || "você");
      setLead(empty);
      setTelefoneTocado(false);

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
            nome: lead.nome.trim(),
            cidade: lead.cidade.trim() || null,
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

  if (enviadoPara) {
    return (
      <div className="space-y-5 py-6 text-center sm:text-left" role="status" aria-live="polite">
        <p className="eyebrow text-accent">Contato recebido</p>
        <p className="font-display text-4xl leading-tight text-primary">Obrigado, {enviadoPara}!</p>
        <p className="text-muted-foreground">
          Em instantes nossa equipe fala com você no WhatsApp com os lotes disponíveis e as datas de
          visita. Fique de olho nas mensagens.
        </p>
        <button
          type="button"
          onClick={() => setEnviadoPara(null)}
          className="text-sm text-primary underline underline-offset-4 hover:text-foreground"
        >
          Enviar outro contato
        </button>
      </div>
    );
  }

  const field =
    "w-full bg-transparent border-b border-border focus:border-primary outline-none py-3 text-foreground placeholder:text-muted-foreground transition-colors";
  const label = "eyebrow text-muted-foreground block mb-1";

  return (
    <form onSubmit={onSubmit} className="space-y-7" noValidate>
      <div>
        <label className={label} htmlFor="nome">
          Nome
        </label>
        <input
          id="nome"
          name="nome"
          required
          autoComplete="name"
          value={lead.nome}
          onChange={(e) => update("nome", e.target.value)}
          className={field}
          placeholder="Como podemos te chamar"
        />
      </div>

      <div className="grid sm:grid-cols-2 gap-7">
        <div>
          <label className={label} htmlFor="telefone">
            WhatsApp
          </label>
          <input
            id="telefone"
            name="telefone"
            type="tel"
            inputMode="tel"
            required
            autoComplete="tel-national"
            value={lead.telefone}
            onChange={(e) => update("telefone", formatarTelefone(e.target.value))}
            onBlur={() => setTelefoneTocado(true)}
            aria-invalid={telefoneComErro}
            aria-describedby={telefoneComErro ? "telefone-erro" : undefined}
            className={`${field} ${telefoneComErro ? "border-destructive" : ""}`}
            placeholder="(24) 99999-9999"
          />
          {telefoneComErro ? (
            <p id="telefone-erro" className="mt-2 text-xs text-destructive">
              Use DDD + número.
            </p>
          ) : null}
        </div>
        <div>
          <label className={label} htmlFor="cidade">
            Cidade
          </label>
          <input
            id="cidade"
            name="cidade"
            autoComplete="address-level2"
            value={lead.cidade}
            onChange={(e) => update("cidade", e.target.value)}
            className={field}
            placeholder="Onde você mora"
          />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-7">
        <div>
          <label className={label} htmlFor="metragem">
            Metragem ideal
          </label>
          <div className="relative">
            <select
              id="metragem"
              name="metragem"
              value={lead.metragem}
              onChange={(e) => update("metragem", e.target.value as Lead["metragem"])}
              className={`${field} appearance-none cursor-pointer pr-6`}
            >
              <option value="">Ainda não sei</option>
              <option value="250m²">250 m²</option>
              <option value="250-350m²">250 a 350 m²</option>
              <option value="450m²">450 m²</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          </div>
        </div>
        <div>
          <label className={label} htmlFor="tipo">
            Tipo de lote
          </label>
          <div className="relative">
            <select
              id="tipo"
              name="tipo"
              value={lead.tipo}
              onChange={(e) => update("tipo", e.target.value as Lead["tipo"])}
              className={`${field} appearance-none cursor-pointer pr-6`}
            >
              <option value="">Ainda não sei</option>
              <option value="Residencial">Residencial</option>
              <option value="Comercial">Comercial</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      </div>

      <div>
        <label className={label} htmlFor="email">
          E-mail <span className="normal-case tracking-normal">(opcional)</span>
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          value={lead.email}
          onChange={(e) => update("email", e.target.value)}
          className={field}
          placeholder="seu@email.com"
        />
      </div>

      {/* Isca para robôs: fora da tela, fora do Tab e escondida de leitores. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="empresa">Empresa</label>
        <input
          id="empresa"
          name="empresa"
          tabIndex={-1}
          autoComplete="off"
          value={isca}
          onChange={(e) => setIsca(e.target.value)}
        />
      </div>

      <div className="pt-2">
        <button
          type="submit"
          disabled={submitting}
          className="group inline-flex items-center gap-3 rounded-full bg-primary text-primary-foreground px-10 py-4 eyebrow hover:bg-foreground transition-colors w-full sm:w-auto justify-center disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          {submitting ? "Enviando..." : "Quero agendar minha visita"}
          {!submitting && (
            <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
          )}
        </button>
        {error && (
          <p className="mt-4 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
          Ao enviar, você concorda em ser contatado pela equipe do Moradas de Paraty por WhatsApp.
          Seus dados são usados só para este atendimento.
        </p>
      </div>
    </form>
  );
}
