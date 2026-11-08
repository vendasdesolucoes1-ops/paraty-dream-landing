import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Campo } from "@/components/ajustes/campos";
import { formatTelefone } from "@/lib/format";
import { normalizarTelefone, type VendedorRodizio } from "@/lib/rodizio-formato";
import { useConsultorResponsavel, usePendenciasIa, useSalvarConsultor } from "@/lib/rodizio";

const OUTRA = "__outra__";

/**
 * Consultor responsável: quem recebe a visita e os avisos quando o lead está
 * sem vendedor (rodízio desligado, fila vazia ou todos no limite). A Sophia
 * só pode ser ligada com ele cadastrado.
 */
export function ConsultorPlanoB({ vendedores }: { vendedores: VendedorRodizio[] }) {
  const { data: atual, isLoading } = useConsultorResponsavel();
  const { data: pendencias } = usePendenciasIa();
  const salvar = useSalvarConsultor();
  const comTelefone = vendedores.filter((v) => v.ativo && v.tem_telefone);

  const [escolha, setEscolha] = useState<string>("");
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");

  useEffect(() => {
    if (!atual) return;
    const vinculado = atual.vendedor_id && vendedores.some((v) => v.id === atual.vendedor_id);
    setEscolha(vinculado ? atual.vendedor_id! : OUTRA);
    setNome(atual.nome);
    setTelefone(formatTelefone(atual.telefone));
  }, [atual, vendedores]);

  const vendedor = vendedores.find((v) => v.id === escolha);
  const tel = vendedor ? normalizarTelefone(vendedor.telefone ?? "") : normalizarTelefone(telefone);
  const nomeFinal = vendedor ? vendedor.nome : nome.trim();
  const valido = !!nomeFinal && typeof tel === "string" && tel !== "invalido";

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (!valido || typeof tel !== "string") return;
    salvar.mutate({ vendedor_id: vendedor?.id ?? null, nome: nomeFinal, telefone: tel });
  }

  const faltaConsultor = (pendencias ?? []).some((p) => /consultor/i.test(p));

  return (
    <form onSubmit={enviar} className="space-y-4 rounded-xl border border-border bg-background p-5">
      {faltaConsultor ? (
        <p
          role="alert"
          className="rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-[0.8125rem]"
        >
          A Sophia não pode ser ligada enquanto não houver um consultor responsável com WhatsApp.
        </p>
      ) : atual ? (
        <p className="text-[0.8125rem] text-muted-foreground">
          Hoje: <span className="font-medium text-foreground">{atual.nome}</span>
          {atual.telefone ? ` · ${formatTelefone(atual.telefone)}` : ""}
        </p>
      ) : null}

      <Campo id="consultor-escolha" label="Quem é o consultor responsável">
        <Select value={escolha} onValueChange={setEscolha} disabled={isLoading}>
          <SelectTrigger id="consultor-escolha">
            <SelectValue placeholder="Escolha um vendedor ou outra pessoa" />
          </SelectTrigger>
          <SelectContent>
            {comTelefone.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.nome} · {formatTelefone(v.telefone)}
              </SelectItem>
            ))}
            <SelectItem value={OUTRA}>Outra pessoa (não é vendedor)</SelectItem>
          </SelectContent>
        </Select>
      </Campo>

      {escolha === OUTRA ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id="consultor-nome" label="Nome">
            <Input id="consultor-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
          </Campo>
          <Campo
            id="consultor-telefone"
            label="WhatsApp (com DDD)"
            dica={
              tel === "invalido" ? (
                <span className="text-danger">Use DDD + número.</span>
              ) : undefined
            }
          >
            <Input
              id="consultor-telefone"
              inputMode="tel"
              placeholder="(24) 99999-9999"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
            />
          </Campo>
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={!valido || salvar.isPending}>
          {salvar.isPending ? "Salvando..." : "Salvar consultor"}
        </Button>
      </div>
    </form>
  );
}
