import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
} from "recharts";
import { Users, UserPlus, Map, Headset } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { LEAD_STATUS_COLUMNS, LEAD_ORIGEM_OPTIONS, type Lead } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/dashboard/")({
  head: () => ({ meta: [{ title: "Dashboard — Moradas de Paraty" }] }),
  component: DashboardHome,
});

// Categorical palette validated for CVD safety and >=3:1 contrast on the card surface.
const CHART_GREEN = "#2E7D4F";
const ORIGEM_COLORS: Record<string, string> = {
  lp: "#2E7D4F",
  whatsapp: "#B8842A",
  indicacao: "#2273A6",
  instagram: "#B4552D",
};

const ORIGEM_LABELS = Object.fromEntries(LEAD_ORIGEM_OPTIONS.map((o) => [o.value, o.label]));
const STATUS_LABELS = Object.fromEntries(LEAD_STATUS_COLUMNS.map((s) => [s.value, s.label]));

const STATUS_BADGE_STYLES: Record<string, string> = {
  novo: "bg-sky-100 text-sky-800",
  qualificado: "bg-indigo-100 text-indigo-800",
  agendado: "bg-amber-100 text-amber-800",
  visitou: "bg-violet-100 text-violet-800",
  proposta: "bg-orange-100 text-orange-800",
  fechado: "bg-emerald-100 text-emerald-800",
  perdido: "bg-red-100 text-red-800",
};

function startOfTodayIso() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.toISOString();
}

function useDashboardData() {
  return useQuery({
    queryKey: ["dashboard-home"],
    queryFn: async () => {
      const today = startOfTodayIso();

      const [leadsRes, lotesDisponiveisRes, takeoversRes] = await Promise.all([
        supabase.from("leads").select("*").order("created_at", { ascending: false }),
        supabase
          .from("lotes")
          .select("id", { count: "exact", head: true })
          .eq("status", "disponivel"),
        supabase
          .from("ai_agent_human_takeover")
          .select("id", { count: "exact", head: true })
          .is("resolved_at", null),
      ]);

      const firstError = leadsRes.error ?? lotesDisponiveisRes.error ?? takeoversRes.error;
      if (firstError) throw firstError;

      const leads = (leadsRes.data ?? []) as Lead[];
      const leadsHoje = leads.filter((l) => l.created_at >= today).length;

      const porStatus = LEAD_STATUS_COLUMNS.map((s) => ({
        status: s.label,
        total: leads.filter((l) => l.status_crm === s.value).length,
      }));

      const porOrigem = LEAD_ORIGEM_OPTIONS.map((o) => ({
        name: o.label,
        value: leads.filter((l) => l.origem === o.value).length,
        origem: o.value,
      })).filter((o) => o.value > 0);

      const last7: { dia: string; total: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const day = new Date();
        day.setHours(0, 0, 0, 0);
        day.setDate(day.getDate() - i);
        const next = new Date(day);
        next.setDate(next.getDate() + 1);
        last7.push({
          dia: day.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
          total: leads.filter(
            (l) => l.created_at >= day.toISOString() && l.created_at < next.toISOString(),
          ).length,
        });
      }

      return {
        totalLeads: leads.length,
        leadsHoje,
        lotesDisponiveis: lotesDisponiveisRes.count ?? 0,
        takeovers: takeoversRes.count ?? 0,
        porStatus,
        porOrigem,
        last7,
        ultimosLeads: leads.slice(0, 5),
      };
    },
    refetchInterval: 60_000,
  });
}

const tooltipStyle = {
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--card)",
  fontSize: 12,
};

function DashboardHome() {
  const { data, isLoading } = useDashboardData();

  const hoje = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const metricCards = [
    { label: "Total de leads", value: data?.totalLeads, icon: Users },
    { label: "Leads novos hoje", value: data?.leadsHoje, icon: UserPlus },
    { label: "Lotes disponíveis", value: data?.lotesDisponiveis, icon: Map },
    { label: "Atendimentos humanos ativos", value: data?.takeovers, icon: Headset },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display text-primary">Bem-vindo ao Moradas de Paraty</h1>
        <p className="text-muted-foreground capitalize">{hoje}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {metricCards.map(({ label, value, icon: Icon }) => (
          <Card key={label} className="shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-forest-deep/10 text-forest-deep flex items-center justify-center shrink-0">
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                {isLoading ? (
                  <Skeleton className="h-7 w-10 mb-1" />
                ) : (
                  <p className="text-2xl font-semibold leading-tight">{value ?? 0}</p>
                )}
                <p className="text-xs text-muted-foreground truncate">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-display text-primary">Leads por status</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data?.porStatus} layout="vertical" margin={{ left: 8, right: 24 }}>
                  <CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="0" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                  <YAxis
                    type="category"
                    dataKey="status"
                    width={82}
                    tick={{ fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--muted)" }} />
                  <Bar
                    dataKey="total"
                    name="Leads"
                    fill={CHART_GREEN}
                    barSize={16}
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-display text-primary">Leads por origem</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : data && data.porOrigem.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={data.porOrigem}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                    stroke="var(--card)"
                    strokeWidth={2}
                  >
                    {data.porOrigem.map((entry) => (
                      <Cell key={entry.origem} fill={ORIGEM_COLORS[entry.origem]} />
                    ))}
                  </Pie>
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-20">
                Nenhum lead com origem registrada ainda.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-display text-primary">
            Leads nos últimos 7 dias
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-56 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data?.last7} margin={{ left: 8, right: 24, top: 8 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />
                <XAxis dataKey="dia" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis
                  allowDecimals={false}
                  width={32}
                  tick={{ fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Line
                  type="monotone"
                  dataKey="total"
                  name="Leads"
                  stroke={CHART_GREEN}
                  strokeWidth={2}
                  dot={{ r: 3, fill: CHART_GREEN }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-lg font-display text-primary">
            Últimos leads recebidos
          </CardTitle>
          <Link
            to="/dashboard/crm"
            className="text-sm text-forest-deep hover:text-accent underline underline-offset-4"
          >
            Ver todos
          </Link>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ) : !data || data.ultimosLeads.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      Nenhum lead recebido ainda.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.ultimosLeads.map((lead) => (
                    <TableRow key={lead.id}>
                      <TableCell className="font-medium">{lead.nome}</TableCell>
                      <TableCell>{lead.telefone ?? "—"}</TableCell>
                      <TableCell>
                        {lead.origem ? (ORIGEM_LABELS[lead.origem] ?? lead.origem) : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={`font-normal ${STATUS_BADGE_STYLES[lead.status_crm] ?? ""}`}
                        >
                          {STATUS_LABELS[lead.status_crm] ?? lead.status_crm}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(lead.created_at).toLocaleDateString("pt-BR")}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
