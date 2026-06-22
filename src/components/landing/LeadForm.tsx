import { useState, type FormEvent } from "react";

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

export function LeadForm() {
  const [lead, setLead] = useState<Lead>(empty);
  const [sent, setSent] = useState(false);

  const update = <K extends keyof Lead>(k: K, v: Lead[K]) =>
    setLead((l) => ({ ...l, [k]: v }));

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const payload: Lead = { ...lead, criadoEm: new Date().toISOString() };
    // Estrutura pronta para integração futura com CRM
    console.log("[Moradas de Paraty] novo lead:", payload);
    setSent(true);
    setLead(empty);
    setTimeout(() => setSent(false), 6000);
  };

  const field =
    "w-full bg-transparent border-b border-border focus:border-primary outline-none py-3 text-foreground placeholder:text-muted-foreground transition-colors";
  const label = "eyebrow text-muted-foreground block mb-1";

  return (
    <form onSubmit={onSubmit} className="space-y-7">
      <div>
        <label className={label} htmlFor="nome">Nome completo</label>
        <input id="nome" required value={lead.nome} onChange={(e) => update("nome", e.target.value)} className={field} placeholder="Como podemos te chamar" />
      </div>

      <div className="grid sm:grid-cols-2 gap-7">
        <div>
          <label className={label} htmlFor="email">E-mail</label>
          <input id="email" type="email" required value={lead.email} onChange={(e) => update("email", e.target.value)} className={field} placeholder="seu@email.com" />
        </div>
        <div>
          <label className={label} htmlFor="telefone">Telefone / WhatsApp</label>
          <input id="telefone" required value={lead.telefone} onChange={(e) => update("telefone", e.target.value)} className={field} placeholder="(00) 00000-0000" />
        </div>
      </div>

      <div>
        <label className={label} htmlFor="cidade">Cidade</label>
        <input id="cidade" required value={lead.cidade} onChange={(e) => update("cidade", e.target.value)} className={field} placeholder="Onde você mora" />
      </div>

      <div className="grid sm:grid-cols-2 gap-7">
        <div>
          <label className={label} htmlFor="metragem">Metragem ideal</label>
          <select id="metragem" required value={lead.metragem} onChange={(e) => update("metragem", e.target.value as Lead["metragem"])} className={`${field} appearance-none cursor-pointer`}>
            <option value="" disabled>Selecione</option>
            <option value="250m²">250 m²</option>
            <option value="250-350m²">250 a 350 m²</option>
            <option value="450m²">450 m²</option>
          </select>
        </div>
        <div>
          <label className={label} htmlFor="tipo">Tipo de lote</label>
          <select id="tipo" required value={lead.tipo} onChange={(e) => update("tipo", e.target.value as Lead["tipo"])} className={`${field} appearance-none cursor-pointer`}>
            <option value="" disabled>Selecione</option>
            <option value="Residencial">Residencial</option>
            <option value="Comercial">Comercial</option>
          </select>
        </div>
      </div>

      <div className="pt-4">
        <button
          type="submit"
          className="group inline-flex items-center gap-3 bg-primary text-primary-foreground px-10 py-4 eyebrow hover:bg-foreground transition-colors w-full sm:w-auto justify-center"
        >
          Enviar
          <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
        </button>
        {sent && (
          <p className="mt-4 text-sm text-forest">
            Recebemos seu interesse. Em breve nossa equipe entrará em contato.
          </p>
        )}
      </div>
    </form>
  );
}
