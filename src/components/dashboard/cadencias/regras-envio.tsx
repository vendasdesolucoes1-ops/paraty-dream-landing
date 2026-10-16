import { useEffect, useState, type FormEvent } from "react";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Bloco } from "@/components/ds/bloco";
import { QueryState, SkeletonRows } from "@/components/ds/query-state";
import { Campo } from "@/components/ajustes/campos";
import { useProfile } from "@/hooks/use-profile";
import { formatNumero } from "@/lib/format";
import { cn } from "@/lib/utils";
import { diaEmSaoPaulo, limiteDoDia } from "@/lib/cadencias-formato";
import {
  mensagemDeErro,
  useInstanciasLimites,
  useRegrasEnvio,
  useSalvarInstanciaLimite,
  useSalvarRegras,
  type InstanciaLimite,
  type RegrasEnvio,
} from "@/lib/cadencias";

type CamposNumericos = Exclude<keyof RegrasEnvio, "campanha_exige_base_legal" | "atualizado_em">;

const CAMPOS: { campo: CamposNumericos; rotulo: string; dica: string; passo?: string }[] = [
  {
    campo: "limite_diario",
    rotulo: "Limite diário por instância",
    dica: "Máximo de mensagens automáticas por número por dia; o resto fica para o dia seguinte.",
  },
  {
    campo: "aquecimento_dias",
    rotulo: "Dias de aquecimento",
    dica: "Por quantos dias um número novo sobe aos poucos até o limite cheio (0 desliga).",
  },
  {
    campo: "aquecimento_inicial",
    rotulo: "Limite no 1º dia de aquecimento",
    dica: "Com quantas mensagens por dia um número novo começa a rampa.",
  },
  {
    campo: "max_tentativas_sem_resposta",
    rotulo: "Tentativas sem resposta",
    dica: "Depois de tantas mensagens sem o lead responder, a cadência desiste dele.",
  },
  {
    campo: "limite_opt_out_pct",
    rotulo: "Opt-out máximo por etapa (%)",
    dica: "Se mais que isso pedir para sair numa etapa, a cadência pausa sozinha.",
    passo: "0.5",
  },
  {
    campo: "minimo_envios_para_pausa",
    rotulo: "Envios mínimos para pausar",
    dica: "A pausa por opt-out só é avaliada depois desse número de envios na etapa.",
  },
];

function FormRegras({ regras, podeEditar }: { regras: RegrasEnvio; podeEditar: boolean }) {
  const [valores, setValores] = useState<Record<CamposNumericos, string>>(() => paraTexto(regras));
  const [baseLegal, setBaseLegal] = useState(regras.campanha_exige_base_legal);
  const salvar = useSalvarRegras();

  useEffect(() => {
    setValores(paraTexto(regras));
    setBaseLegal(regras.campanha_exige_base_legal);
  }, [regras]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const numeros = Object.fromEntries(
      CAMPOS.map(({ campo }) => [campo, Number(valores[campo].replace(",", "."))]),
    ) as Record<CamposNumericos, number>;
    const invalido = CAMPOS.find(({ campo }) => {
      const n = numeros[campo];
      if (!Number.isFinite(n)) return true;
      return campo === "aquecimento_dias" ? n < 0 : n <= 0;
    });
    if (invalido) {
      toast.error(`Valor inválido em "${invalido.rotulo}".`);
      return;
    }
    if (numeros.max_tentativas_sem_resposta > 10) {
      toast.error("Tentativas sem resposta: no máximo 10.");
      return;
    }
    salvar.mutate(
      { ...numeros, campanha_exige_base_legal: baseLegal },
      {
        onSuccess: () => toast.success("Regras de envio salvas."),
        onError: (err) => toast.error(mensagemDeErro(err, "Erro ao salvar as regras.")),
      },
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]"
    >
      {!podeEditar ? (
        <p className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5" aria-hidden />
          Só administradores alteram as regras de envio.
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {CAMPOS.map(({ campo, rotulo, dica, passo }) => (
          <Campo key={campo} id={`regra-${campo}`} label={rotulo} dica={dica}>
            <Input
              id={`regra-${campo}`}
              type="number"
              inputMode="decimal"
              step={passo ?? "1"}
              min={campo === "aquecimento_dias" ? 0 : 1}
              disabled={!podeEditar}
              value={valores[campo]}
              onChange={(e) => setValores((v) => ({ ...v, [campo]: e.target.value }))}
            />
          </Campo>
        ))}
      </div>
      <label className="flex items-start justify-between gap-4 text-sm">
        <span>
          <span className="font-medium text-foreground">Campanha exige base legal</span>
          <span className="block text-xs text-muted-foreground">
            Campanha só vai para quem consentiu ou já conversou com a gente. Desligar é decisão
            jurídica, não técnica.
          </span>
        </span>
        <Switch
          checked={baseLegal}
          disabled={!podeEditar}
          onCheckedChange={setBaseLegal}
          aria-label="Campanha exige base legal"
        />
      </label>
      {podeEditar ? (
        <div className="flex justify-end">
          <Button type="submit" disabled={salvar.isPending}>
            {salvar.isPending ? "Salvando…" : "Salvar regras"}
          </Button>
        </div>
      ) : null}
    </form>
  );
}

function paraTexto(r: RegrasEnvio): Record<CamposNumericos, string> {
  return Object.fromEntries(CAMPOS.map(({ campo }) => [campo, String(r[campo])])) as Record<
    CamposNumericos,
    string
  >;
}

function LinhaInstancia({
  instancia,
  regras,
  podeEditar,
}: {
  instancia: InstanciaLimite;
  regras: RegrasEnvio | null;
  podeEditar: boolean;
}) {
  const [limite, setLimite] = useState(instancia.limite_diario?.toString() ?? "");
  const [inicio, setInicio] = useState(instancia.aquecimento_inicio ?? "");
  const salvar = useSalvarInstanciaLimite();

  useEffect(() => {
    setLimite(instancia.limite_diario?.toString() ?? "");
    setInicio(instancia.aquecimento_inicio ?? "");
  }, [instancia.limite_diario, instancia.aquecimento_inicio]);

  const mudou =
    limite !== (instancia.limite_diario?.toString() ?? "") ||
    inicio !== (instancia.aquecimento_inicio ?? "");

  const limiteHoje = regras
    ? limiteDoDia({
        limiteInstancia: instancia.limite_diario,
        limiteRegra: regras.limite_diario,
        aquecimentoInicio: instancia.aquecimento_inicio,
        aquecimentoDias: regras.aquecimento_dias,
        aquecimentoInicial: regras.aquecimento_inicial,
        hoje: diaEmSaoPaulo(),
      })
    : null;

  function gravar() {
    const n = limite.trim() === "" ? null : Number(limite);
    if (n !== null && (!Number.isInteger(n) || n <= 0)) {
      toast.error("O limite precisa ser um número inteiro maior que zero.");
      return;
    }
    salvar.mutate(
      { id: instancia.id, limite_diario: n, aquecimento_inicio: inicio || null },
      {
        onSuccess: () => toast.success(`Limites de ${instancia.instance_name} salvos.`),
        onError: (e) => toast.error(mensagemDeErro(e, "Erro ao salvar a instância.")),
      },
    );
  }

  const cheio = limiteHoje !== null && instancia.enviados_hoje >= limiteHoje;

  return (
    <TableRow>
      <TableCell className="font-medium text-foreground">{instancia.instance_name}</TableCell>
      <TableCell>
        <Input
          type="number"
          inputMode="numeric"
          min={1}
          className="h-9 w-28"
          placeholder={regras ? `Padrão (${regras.limite_diario})` : "Padrão"}
          aria-label={`Limite diário de ${instancia.instance_name}`}
          disabled={!podeEditar}
          value={limite}
          onChange={(e) => setLimite(e.target.value)}
        />
      </TableCell>
      <TableCell>
        <Input
          type="date"
          className="h-9 w-40"
          aria-label={`Início do aquecimento de ${instancia.instance_name}`}
          disabled={!podeEditar}
          value={inicio}
          onChange={(e) => setInicio(e.target.value)}
        />
      </TableCell>
      <TableCell className={cn("text-right tabular-nums", cheio && "font-semibold text-danger")}>
        {formatNumero(instancia.enviados_hoje)}
        {limiteHoje !== null ? (
          <span className="text-muted-foreground"> / {formatNumero(limiteHoje)}</span>
        ) : null}
      </TableCell>
      <TableCell className="text-right">
        {podeEditar ? (
          <Button
            size="sm"
            variant="outline"
            disabled={!mudou || salvar.isPending}
            onClick={gravar}
          >
            Salvar
          </Button>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

/** Aba "Regras de envio": a linha única de regras e os limites por instância. */
export function RegrasEnvioPainel() {
  const { profile } = useProfile();
  const podeEditar = profile?.role === "admin";
  const regras = useRegrasEnvio();
  const instancias = useInstanciasLimites();

  return (
    <div className="space-y-10">
      <Bloco
        titulo="Regras de envio"
        descricao="Valem para cadências e campanhas. A Evolution não é a API oficial: passar do ritmo é o caminho para o número ser banido."
      >
        <QueryState
          query={regras}
          skeleton={<SkeletonRows rows={3} className="h-16" />}
          isEmpty={(d) => d === null}
          empty={
            <p className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
              Regras de envio não encontradas.
            </p>
          }
        >
          {(r) => (r ? <FormRegras regras={r} podeEditar={podeEditar} /> : null)}
        </QueryState>
      </Bloco>

      <Bloco
        divisor
        titulo="Limites por instância"
        descricao="Limite próprio (vazio = o das regras) e início do aquecimento. Uso de hoje / limite de hoje, já com a rampa."
      >
        <QueryState
          query={instancias}
          skeleton={<SkeletonRows rows={2} />}
          isEmpty={(d) => d.length === 0}
          empty={
            <p className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
              Nenhuma instância de WhatsApp configurada.
            </p>
          }
        >
          {(lista) => (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Instância</TableHead>
                  <TableHead>Limite diário</TableHead>
                  <TableHead>Aquecimento desde</TableHead>
                  <TableHead className="text-right">Uso hoje</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.map((i) => (
                  <LinhaInstancia
                    key={i.id}
                    instancia={i}
                    regras={regras.data ?? null}
                    podeEditar={podeEditar}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </QueryState>
      </Bloco>
    </div>
  );
}
