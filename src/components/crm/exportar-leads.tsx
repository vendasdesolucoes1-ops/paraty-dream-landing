import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { downloadCsv } from "@/lib/csv";
import { ORIGEM_LABEL, STATUS_LABEL } from "@/lib/lead-status";
import { supabase } from "@/lib/supabase";
import type { LeadOrigem, LeadStatus } from "@/lib/types";

/** Os mesmos filtros que o quadro do CRM aplica na tela. */
export interface FiltrosExportacao {
  busca: string;
  /** "todas" ou o valor de leads.origem. */
  origem: string;
  mostrarTestes: boolean;
}

interface LeadExportado {
  nome: string;
  telefone: string | null;
  email: string | null;
  cidade: string | null;
  status_crm: LeadStatus;
  origem: LeadOrigem | null;
  created_at: string;
  vendedor: { nome: string | null } | null;
}

// PostgREST corta cada resposta em 1000 linhas; buscamos em páginas.
const PAGINA = 1000;

const CABECALHO = [
  "Nome",
  "Telefone",
  "E-mail",
  "Cidade",
  "Etapa",
  "Origem",
  "Vendedor",
  "Criado em",
];

const dataHora = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

/** Tira acento e caixa — o mesmo critério da busca do quadro. */
function normalizar(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Evita injeção de fórmula: o Excel executa células que começam com =, +, -
 * ou @. Telefone como "+55…" continua intacto (sinal seguido de dígito).
 */
function celulaSegura(valor: string | null): string {
  if (!valor) return "";
  if (/^[=@\t\r]/.test(valor) || /^[+-][^\d]/.test(valor)) return `'${valor}`;
  return valor;
}

async function buscarLeads(filtros: FiltrosExportacao): Promise<LeadExportado[]> {
  const todos: LeadExportado[] = [];
  for (let inicio = 0; ; inicio += PAGINA) {
    // Sem filtro de vendedor aqui: a RLS de leads já recorta a carteira, então
    // o vendedor só exporta o que enxerga.
    let query = supabase
      .from("leads")
      .select(
        "nome, telefone, email, cidade, status_crm, origem, created_at, vendedor:vendedores(nome)",
      )
      .is("deletado_em", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(inicio, inicio + PAGINA - 1);
    if (!filtros.mostrarTestes) query = query.eq("is_teste", false);
    if (filtros.origem !== "todas") query = query.eq("origem", filtros.origem);

    const { data, error } = await query;
    if (error) throw error;
    const pagina = (data ?? []) as unknown as LeadExportado[];
    todos.push(...pagina);
    if (pagina.length < PAGINA) break;
  }

  // A busca do quadro ignora acento; filtrar aqui garante o mesmo resultado.
  const termo = normalizar(filtros.busca.trim());
  const digitos = filtros.busca.replace(/\D/g, "");
  if (!termo) return todos;
  return todos.filter(
    (lead) =>
      normalizar(lead.nome).includes(termo) ||
      normalizar(lead.cidade ?? "").includes(termo) ||
      normalizar(lead.email ?? "").includes(termo) ||
      (digitos.length >= 3 && (lead.telefone ?? "").replace(/\D/g, "").includes(digitos)),
  );
}

/** Botão do cabeçalho do CRM: baixa em CSV os leads que os filtros atuais mostram. */
export function ExportarLeads({ filtros }: { filtros: FiltrosExportacao }) {
  const [exportando, setExportando] = useState(false);

  async function exportar() {
    setExportando(true);
    try {
      const leads = await buscarLeads(filtros);
      if (leads.length === 0) {
        toast.info("Nenhum lead para exportar com os filtros atuais.");
        return;
      }

      const linhas = leads.map((lead) => [
        celulaSegura(lead.nome),
        celulaSegura(lead.telefone),
        celulaSegura(lead.email),
        celulaSegura(lead.cidade),
        STATUS_LABEL[lead.status_crm] ?? lead.status_crm,
        lead.origem ? (ORIGEM_LABEL[lead.origem] ?? lead.origem) : "",
        celulaSegura(lead.vendedor?.nome ?? null),
        dataHora.format(new Date(lead.created_at)),
      ]);

      const hoje = new Date().toISOString().slice(0, 10);
      downloadCsv(`leads-${hoje}.csv`, CABECALHO, linhas, { separador: ";", bom: true });

      // Registro de auditoria. Falhar aqui não desfaz o download já entregue.
      // `exportacoes` ainda não está nos tipos gerados do Supabase.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("exportacoes").insert({
        tipo: "leads",
        total_registros: leads.length,
        filtros: {
          busca: filtros.busca.trim() || null,
          origem: filtros.origem,
          mostrar_testes: filtros.mostrarTestes,
        },
      });
      if (error) console.error("[exportar-leads] registro da exportação falhou:", error.message);

      toast.success(leads.length === 1 ? "1 lead exportado." : `${leads.length} leads exportados.`);
    } catch (e) {
      toast.error("Não foi possível exportar os leads.", {
        description: (e as Error)?.message,
      });
    } finally {
      setExportando(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={exportar}
      disabled={exportando}
      title="Baixar em CSV os leads que os filtros atuais mostram"
    >
      {exportando ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}
      Exportar CSV
    </Button>
  );
}
