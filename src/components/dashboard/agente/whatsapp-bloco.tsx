import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { History, Link2, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { readFunctionError } from "@/lib/utils";
import type { ContagemHistoricoWhatsapp } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Pill } from "@/components/ds/pill";
import { LinhaAjuste, Secao } from "@/components/ajustes/campos";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const DIAS = 30;

interface Webhook {
  url_sem_token: string;
  tem_token?: boolean;
  eventos?: string[] | null;
  ativo?: boolean | null;
}

async function invocar<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("whatsapp-historico", { body });
  if (error) throw new Error(await readFunctionError(error));
  if (!data?.ok) throw new Error(data?.error ?? "Falha ao falar com a Evolution.");
  return data as T;
}

const LINHAS_CONTAGEM: { chave: keyof ContagemHistoricoWhatsapp; rotulo: string }[] = [
  { chave: "mensagens_no_periodo", rotulo: "Mensagens no período" },
  { chave: "ja_no_crm", rotulo: "Já estão no CRM" },
  { chave: "novas", rotulo: "Novas (a importar)" },
  { chave: "novas_enviadas_pelo_numero", rotulo: "Novas enviadas pelo número" },
  { chave: "novas_recebidas", rotulo: "Novas recebidas" },
  { chave: "contatos", rotulo: "Contatos" },
  { chave: "contatos_com_lead", rotulo: "Contatos com lead" },
  { chave: "contatos_sem_lead", rotulo: "Contatos sem lead" },
  { chave: "lid_sem_telefone_ignoradas", rotulo: "Ignoradas (sem telefone)" },
  { chave: "grupos_ignorados", rotulo: "Ignoradas (grupos)" },
];

/** Webhook da Evolution e importação do histórico de mensagens para o CRM. */
export function WhatsappBloco() {
  const [webhook, setWebhook] = useState<Webhook | null>(null);
  const [contagem, setContagem] = useState<ContagemHistoricoWhatsapp | null>(null);
  const [criarLeads, setCriarLeads] = useState(false);

  const verWebhook = useMutation({
    mutationFn: () => invocar<Webhook>({ acao: "ver_webhook" }),
    onSuccess: setWebhook,
    onError: (e: Error) => toast.error(e.message),
  });

  const configurarWebhook = useMutation({
    mutationFn: () => invocar<{ url_sem_token: string }>({ acao: "configurar_webhook" }),
    onSuccess: (d) => {
      toast.success("Webhook configurado com o token de segurança.");
      setWebhook({ url_sem_token: d.url_sem_token, tem_token: true, ativo: true });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const contar = useMutation({
    mutationFn: () => invocar<ContagemHistoricoWhatsapp>({ acao: "contar", dias: DIAS }),
    onSuccess: setContagem,
    onError: (e: Error) => toast.error(e.message),
  });

  const importar = useMutation({
    mutationFn: () =>
      invocar<ContagemHistoricoWhatsapp & { gravadas?: number; leads_criados?: number }>({
        acao: "importar",
        dias: DIAS,
        criar_leads: criarLeads,
      }),
    onSuccess: (d) => {
      toast.success(
        `Histórico importado: ${d.gravadas ?? 0} mensagens gravadas` +
          (d.leads_criados ? ` e ${d.leads_criados} leads criados.` : "."),
      );
      setContagem(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const num = (n: number | undefined) => Number(n ?? 0).toLocaleString("pt-BR");

  return (
    <Secao titulo="WhatsApp">
      <div className="space-y-4 rounded-xl border border-border bg-background p-4">
        <LinhaAjuste
          titulo="Webhook da Evolution"
          descricao="É por onde as mensagens do WhatsApp chegam ao sistema. Com token, só a Evolution consegue chamar."
          controle={
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={verWebhook.isPending}
                onClick={() => verWebhook.mutate()}
              >
                {verWebhook.isPending ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <Link2 aria-hidden />
                )}
                Ver webhook
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline" disabled={configurarWebhook.isPending}>
                    {configurarWebhook.isPending
                      ? "Configurando..."
                      : "Configurar webhook com token"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="font-display">
                      Configurar o webhook?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      Isso aponta a Evolution para o webhook do sistema com o token de segurança.
                      Pode fazer antes de publicar a versão nova.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => configurarWebhook.mutate()}>
                      Configurar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          }
        />
        {webhook ? (
          <div className="animate-swap space-y-2 rounded-lg bg-muted/50 p-3 text-xs">
            <p className="break-all font-mono">{webhook.url_sem_token || "(sem URL)"}</p>
            <div className="flex flex-wrap gap-1.5">
              <Pill tone={webhook.tem_token ? "success" : "warning"}>
                {webhook.tem_token ? "Com token" : "Sem token"}
              </Pill>
              {webhook.ativo != null ? (
                <Pill tone={webhook.ativo ? "success" : "danger"}>
                  {webhook.ativo ? "Ativo" : "Desligado"}
                </Pill>
              ) : null}
              {(webhook.eventos ?? []).map((e) => (
                <Pill key={e}>{e}</Pill>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="space-y-4 rounded-xl border border-border bg-background p-4">
        <LinhaAjuste
          titulo="Histórico da Evolution"
          descricao={`Traz para o CRM as conversas dos últimos ${DIAS} dias que ainda não estão lá. Conte primeiro para ver o que entra.`}
          controle={
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={contar.isPending || importar.isPending}
                onClick={() => contar.mutate()}
              >
                {contar.isPending ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <History aria-hidden />
                )}
                {contar.isPending ? "Contando..." : `Contar últimos ${DIAS} dias`}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" disabled={!contagem || importar.isPending}>
                    {importar.isPending ? "Importando..." : "Importar"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="font-display">
                      Importar o histórico?
                    </AlertDialogTitle>
                    <AlertDialogDescription asChild>
                      <div className="space-y-2">
                        <p>
                          Entram {num(contagem?.novas)} mensagens novas (
                          {num(contagem?.novas_recebidas)} recebidas e{" "}
                          {num(contagem?.novas_enviadas_pelo_numero)} enviadas pelo número), de{" "}
                          {num(contagem?.contatos)} contatos. {num(contagem?.contatos_sem_lead)}{" "}
                          contatos ainda não têm lead.
                        </p>
                        <p>Mensagens importadas não disparam a Sophia.</p>
                      </div>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="criar_leads"
                      checked={criarLeads}
                      onCheckedChange={(v) => setCriarLeads(v === true)}
                    />
                    <Label htmlFor="criar_leads" className="text-sm font-normal">
                      Criar leads para contatos sem lead
                    </Label>
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => importar.mutate()}>
                      Importar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          }
        />
        {contagem ? (
          <div className="animate-swap overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                {LINHAS_CONTAGEM.map((l) => (
                  <tr key={l.chave}>
                    <td className="px-3 py-1.5 text-muted-foreground">{l.rotulo}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {num(contagem[l.chave])}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </Secao>
  );
}
