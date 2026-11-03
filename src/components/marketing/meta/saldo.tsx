// Saldo da conta de anúncios, ao vivo: lido direto da Meta (função meta-saldo)
// a cada minuto, independente da sincronização diária. Fica no topo da Visão
// geral e da aba Anúncios, com aviso quando o saldo ou o limite está acabando.
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Bloco, LINK_BLOCO } from "@/components/ds/bloco";
import { Pill } from "@/components/ds/pill";
import { FaixaIndicadores, FaixaStatus, Indicador } from "@/components/marketing/meta/pecas";
import { alertaSaldo, haQuanto } from "@/lib/marketing-calculos";
import { formatarMoeda } from "@/lib/moeda";
import { ErroSaldo, useSaldoMeta } from "@/lib/marketing-meta";
import { cn } from "@/lib/utils";

/** Re-renderiza a cada 10 s para o "atualizado há…" andar sozinho. */
function useRelogio(ms = 10_000) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return agora;
}

export function SaldoAoVivo() {
  const q = useSaldoMeta();
  const agora = useRelogio();
  const s = q.data;
  const moeda = s?.moeda;
  const carregando = q.isPending;
  const alerta = s ? alertaSaldo(s) : null;
  // O limite de gastos da conta segura os anúncios mesmo com saldo sobrando.
  const limiteAbaixoDoSaldo =
    s &&
    s.restanteLimite != null &&
    s.saldoDisponivel != null &&
    s.restanteLimite < s.saldoDisponivel
      ? { restante: s.restanteLimite, saldo: s.saldoDisponivel }
      : null;

  const acao = (
    <span className="flex items-center gap-2">
      {s ? (
        <span className="text-[0.75rem] text-muted-foreground" aria-live="polite">
          Atualizado {haQuanto(s.consultadoEm, agora)}
        </span>
      ) : null}
      <button
        type="button"
        className={LINK_BLOCO}
        onClick={() => q.refetch()}
        disabled={q.isFetching}
        aria-label="Atualizar saldo agora"
      >
        <RefreshCw className={cn("h-3.5 w-3.5", q.isFetching && "animate-spin")} aria-hidden />
        Atualizar
      </button>
    </span>
  );

  return (
    <Bloco
      titulo="Saldo da conta de anúncios"
      descricao={
        <span className="inline-flex flex-wrap items-center gap-2">
          <Pill tone={q.isError ? "danger" : "success"} dot>
            {q.isError ? "Sem conexão" : "Ao vivo"}
          </Pill>
          <span>
            Direto da Meta, atualiza a cada minuto
            {s?.nome ? ` · ${s.nome}` : ""}
          </span>
        </span>
      }
      acao={acao}
    >
      {q.isError ? (
        <ErroDoSaldo erro={q.error} />
      ) : (
        <div className="space-y-4">
          {alerta && alerta.nivel !== "ok" ? (
            <FaixaStatus
              saude={{
                nivel: alerta.nivel,
                titulo: alerta.nivel === "erro" ? "Anúncios parados" : "Saldo acabando",
                detalhe: alerta.texto,
              }}
            />
          ) : null}
          {limiteAbaixoDoSaldo ? (
            <FaixaStatus
              saude={{
                nivel: "atencao",
                titulo: "Limite de gastos abaixo do saldo",
                detalhe: `O limite de gastos restante (${formatarMoeda(limiteAbaixoDoSaldo.restante, moeda)}) é menor que o saldo (${formatarMoeda(limiteAbaixoDoSaldo.saldo, moeda)}): os anúncios param quando o limite acabar, mesmo com saldo. Aumente o limite no Gerenciador de Anúncios.`,
              }}
            />
          ) : null}
          <FaixaIndicadores colunas={4}>
            {s && !s.prepaga ? (
              <Indicador
                rotulo="A cobrar"
                destaque
                carregando={carregando}
                valor={s.aCobrar}
                formatar={(n) => formatarMoeda(n, moeda)}
                rodape={s.formaPagamento ?? "Gasto acumulado ainda não cobrado"}
              />
            ) : (
              <Indicador
                rotulo="Saldo disponível"
                destaque
                carregando={carregando}
                valor={s?.saldoDisponivel}
                formatar={(n) => formatarMoeda(n, moeda)}
                rodape={s ? "Créditos pré-pagos na Meta" : undefined}
              />
            )}
            <Indicador
              rotulo="Gasto hoje"
              carregando={carregando}
              valor={s?.gastoHoje}
              formatar={(n) => formatarMoeda(n, moeda)}
            />
            <Indicador
              rotulo="Média por dia"
              carregando={carregando}
              valor={s?.mediaDiaria7d}
              formatar={(n) => formatarMoeda(n, moeda)}
              rodape={
                s?.diasRestantes != null
                  ? `Dura cerca de ${Math.floor(s.diasRestantes)} dia(s), com impostos`
                  : "Últimos 7 dias"
              }
            />
            <Indicador
              rotulo={s?.limiteGasto != null ? "Restante do limite" : "Gasto total da conta"}
              carregando={carregando}
              valor={s?.limiteGasto != null ? s.restanteLimite : s?.gastoTotal}
              formatar={(n) => formatarMoeda(n, moeda)}
              rodape={
                s?.limiteGasto != null
                  ? `Limite de ${formatarMoeda(s.limiteGasto, moeda)}`
                  : s
                    ? "Sem limite de gasto definido"
                    : undefined
              }
            />
          </FaixaIndicadores>
        </div>
      )}
    </Bloco>
  );
}

function ErroDoSaldo({ erro }: { erro: unknown }) {
  const tokenInvalido = erro instanceof ErroSaldo && erro.tokenInvalido;
  return (
    <FaixaStatus
      saude={{
        nivel: "erro",
        titulo: "Não foi possível ler o saldo",
        detalhe: tokenInvalido
          ? "O token da Meta expirou ou foi revogado. Gere um novo e atualize META_ACCESS_TOKEN."
          : erro instanceof Error
            ? erro.message
            : "Falha ao consultar a Meta. Tentamos de novo em 1 minuto.",
      }}
    />
  );
}
