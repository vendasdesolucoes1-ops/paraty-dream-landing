import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ACESSOS_OPCIONAIS } from "@/lib/acessos";

/**
 * O que o vendedor enxerga além do CRM. O CRM é sempre liberado; admin e
 * gestor veem tudo, então o campo só aparece para o papel "vendedor".
 */
export function AcessosCampo({
  valor,
  onChange,
  desabilitado = false,
  idBase,
}: {
  valor: string[];
  onChange: (acessos: string[]) => void;
  desabilitado?: boolean;
  idBase: string;
}) {
  const alternar = (chave: string, marcado: boolean) =>
    onChange(marcado ? [...new Set([...valor, chave])] : valor.filter((a) => a !== chave));

  return (
    <div className="space-y-3 rounded-xl border border-border bg-background px-4 py-3.5">
      <div className="flex items-start gap-3">
        <Checkbox id={`${idBase}-crm`} checked disabled aria-readonly />
        <div className="min-w-0">
          <Label htmlFor={`${idBase}-crm`} className="font-medium">
            CRM
          </Label>
          <p className="text-[0.8125rem] text-muted-foreground">
            Sempre liberado: os leads dele no funil.
          </p>
        </div>
      </div>
      {ACESSOS_OPCIONAIS.map((a) => (
        <div key={a.valor} className="flex items-start gap-3">
          <Checkbox
            id={`${idBase}-${a.valor}`}
            checked={valor.includes(a.valor)}
            disabled={desabilitado}
            onCheckedChange={(v) => alternar(a.valor, v === true)}
          />
          <div className="min-w-0">
            <Label htmlFor={`${idBase}-${a.valor}`} className="font-medium">
              {a.rotulo}
            </Label>
            <p className="text-[0.8125rem] text-muted-foreground">{a.descricao}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
