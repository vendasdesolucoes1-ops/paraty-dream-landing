import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Campo } from "@/components/ajustes/campos";

// Janelas de horário de visita (issue #56). Mesmo formato que a Sophia lê em
// supabase/functions/_shared/janela-visita.ts — mudar um é mudar o outro.
const CHAVE = "janelas_visita";
const FUSO = "America/Sao_Paulo";
const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

interface DiaEditavel {
  ativo: boolean;
  inicio: string;
  fim: string;
}

interface JanelasSalvas {
  dias: { dia: number; inicio: string; fim: string }[];
  duracao_min: number;
  fuso: string;
}

const PADRAO: JanelasSalvas = {
  dias: [1, 2, 3, 4, 5]
    .map((dia) => ({ dia, inicio: "09:00", fim: "17:00" }))
    .concat({
      dia: 6,
      inicio: "09:00",
      fim: "16:00",
    }),
  duracao_min: 60,
  fuso: FUSO,
};

function lerSalvas(valor: string | null | undefined): JanelasSalvas {
  try {
    const obj = JSON.parse(valor ?? "");
    if (obj && Array.isArray(obj.dias)) {
      return {
        dias: obj.dias,
        duracao_min: Number(obj.duracao_min) || PADRAO.duracao_min,
        fuso: typeof obj.fuso === "string" && obj.fuso ? obj.fuso : FUSO,
      };
    }
  } catch {
    // Valor ausente ou quebrado: o painel mostra o padrão, como a Sophia usa.
  }
  return PADRAO;
}

/** Uma janela por dia no painel; dias desligados ficam com o horário de sugestão. */
function paraEdicao(salvas: JanelasSalvas): DiaEditavel[] {
  return DIAS.map((_, dia) => {
    const janela = salvas.dias.find((d) => d.dia === dia);
    return janela
      ? { ativo: true, inicio: janela.inicio, fim: janela.fim }
      : { ativo: false, inicio: "09:00", fim: "17:00" };
  });
}

export function JanelasVisitaCard() {
  const queryClient = useQueryClient();
  const [dias, setDias] = useState<DiaEditavel[]>(() => paraEdicao(PADRAO));
  const [duracao, setDuracao] = useState(String(PADRAO.duracao_min));

  const { data: salvas } = useQuery({
    queryKey: ["config", CHAVE],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("configuracoes")
        .select("valor")
        .eq("chave", CHAVE)
        .maybeSingle();
      if (error) throw error;
      return lerSalvas(data?.valor);
    },
  });

  useEffect(() => {
    if (salvas) {
      setDias(paraEdicao(salvas));
      setDuracao(String(salvas.duracao_min));
    }
  }, [salvas]);

  const duracaoMin = Number(duracao);
  const duracaoInvalida = !Number.isInteger(duracaoMin) || duracaoMin < 15 || duracaoMin > 480;
  const diaInvalido = dias.some((d) => d.ativo && (!d.inicio || !d.fim || d.inicio >= d.fim));

  const saveMutation = useMutation({
    mutationFn: async () => {
      const valor: JanelasSalvas = {
        dias: dias
          .map((d, dia) => ({ dia, inicio: d.inicio, fim: d.fim, ativo: d.ativo }))
          .filter((d) => d.ativo)
          .map(({ dia, inicio, fim }) => ({ dia, inicio, fim })),
        duracao_min: duracaoMin,
        fuso: salvas?.fuso ?? FUSO,
      };
      const { error } = await supabase
        .from("configuracoes")
        .upsert({ chave: CHAVE, valor: JSON.stringify(valor) }, { onConflict: "chave" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Horários de visita salvos.");
      queryClient.invalidateQueries({ queryKey: ["config", CHAVE] });
    },
    onError: () => toast.error("Erro ao salvar os horários de visita."),
  });

  const alterarDia = (indice: number, mudanca: Partial<DiaEditavel>) =>
    setDias((atual) => atual.map((d, i) => (i === indice ? { ...d, ...mudanca } : d)));

  return (
    <Card>
      <CardContent className="max-w-xl space-y-5 pt-6">
        <div className="divide-y divide-border">
          {dias.map((d, i) => (
            <div key={DIAS[i]} className="flex flex-wrap items-center gap-3 py-2.5">
              <Switch
                id={`janela-dia-${i}`}
                checked={d.ativo}
                onCheckedChange={(ativo) => alterarDia(i, { ativo })}
                aria-label={`Visitas ${DIAS[i].toLowerCase()}`}
              />
              <label htmlFor={`janela-dia-${i}`} className="w-20 text-sm font-medium">
                {DIAS[i]}
              </label>
              {d.ativo ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Input
                    type="time"
                    className="h-9 w-28"
                    value={d.inicio}
                    onChange={(e) => alterarDia(i, { inicio: e.target.value })}
                    aria-label={`Início ${DIAS[i].toLowerCase()}`}
                  />
                  às
                  <Input
                    type="time"
                    className="h-9 w-28"
                    value={d.fim}
                    onChange={(e) => alterarDia(i, { fim: e.target.value })}
                    aria-label={`Fim ${DIAS[i].toLowerCase()}`}
                  />
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">Sem visitas</span>
              )}
            </div>
          ))}
        </div>

        <Campo
          id="janela-duracao"
          label="Duração de cada visita (minutos)"
          dica="Usada para ver se a visita cabe na janela e se conflita com outra do mesmo vendedor."
        >
          <Input
            id="janela-duracao"
            type="number"
            min={15}
            max={480}
            step={15}
            className="w-32"
            value={duracao}
            onChange={(e) => setDuracao(e.target.value)}
          />
        </Campo>

        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || duracaoInvalida || diaInvalido}
        >
          {saveMutation.isPending ? "Salvando..." : "Salvar horários"}
        </Button>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Horário de Paraty. A Sophia só propõe visitas nestas janelas; um pedido fora delas, ou em
          conflito com a agenda do vendedor, entra na agenda como “A confirmar” e o vendedor é
          avisado.
        </p>
      </CardContent>
    </Card>
  );
}
