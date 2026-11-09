// Texto do aviso por WhatsApp ao vendedor quando um lead é atribuído a ele
// (Edge Function avisar-vendedor). Puro, para ser testado sem Deno.

const ORIGEM: Record<string, string> = {
  whatsapp: "WhatsApp",
  anuncio_whatsapp: "Anúncio (WhatsApp)",
  formulario_meta: "Formulário Meta",
  lp: "Site",
  indicacao: "Indicação",
  instagram: "Instagram",
  whatsapp_contato: "Contatos do WhatsApp",
  google_maps: "Google Maps",
};

/** 5524999998888 → "(24) 99999-8888". Fora do padrão, volta como veio. */
function formatarTelefone(bruto: string): string {
  const d = bruto.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return bruto;
}

function linkWhatsapp(bruto: string): string | null {
  const d = bruto.replace(/\D/g, "");
  if (d.length < 10) return null;
  return `https://wa.me/${d.startsWith("55") ? d : `55${d}`}`;
}

export function montarAviso(lead: Record<string, unknown>, manual: boolean): string {
  const texto = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
  const telefone = texto(lead.telefone);
  const origem = texto(lead.origem);
  const detalheOrigem = texto(lead.formulario_nome) || texto(lead.campanha_nome);
  const interesse = [
    texto(lead.objetivo),
    lead.metragem_interesse ? `${texto(lead.metragem_interesse)} m²` : "",
  ].filter(Boolean);

  const linhas = [
    manual ? "*Lead atribuído a você* 📌" : "*Novo lead para você* 📲",
    "",
    `*Nome:* ${texto(lead.nome) || "sem nome"}`,
    `*WhatsApp:* ${telefone ? formatarTelefone(telefone) : "não informado"}`,
  ];
  if (origem) {
    linhas.push(
      `*Origem:* ${ORIGEM[origem] ?? origem}${detalheOrigem ? ` — ${detalheOrigem}` : ""}`,
    );
  }
  if (texto(lead.cidade)) linhas.push(`*Cidade:* ${texto(lead.cidade)}`);
  if (interesse.length) linhas.push(`*Interesse:* ${interesse.join(" · ")}`);

  const link = telefone ? linkWhatsapp(telefone) : null;
  linhas.push("");
  if (link) linhas.push(`Chamar agora: ${link}`);
  linhas.push(
    manual
      ? "O lead foi passado para você no CRM. O histórico completo está lá."
      : "Atribuído pela fila de rodízio. O histórico completo está no CRM.",
  );
  return linhas.join("\n");
}
