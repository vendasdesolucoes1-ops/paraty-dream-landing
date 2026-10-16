import { useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import {
  VARIAVEIS_TEMPLATE,
  previewTemplate,
  variaveisDesconhecidas,
} from "@/lib/cadencias-formato";

/**
 * Texto de uma etapa (ou de uma campanha) com as variáveis à mão e a prévia de
 * como chega no WhatsApp: cada `||` vira uma mensagem separada.
 */
export function TemplateEditor({
  id,
  value,
  onChange,
  disabled,
  variaveis = VARIAVEIS_TEMPLATE,
  placeholder = "Oi {{primeiro_nome}}, tudo bem?||Ficou alguma dúvida sobre os lotes?",
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  /** Variáveis oferecidas (campanha não tem visita, então só o nome). */
  variaveis?: readonly (typeof VARIAVEIS_TEMPLATE)[number][];
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const partes = previewTemplate(value);
  const desconhecidas = variaveisDesconhecidas(value);

  function inserir(texto: string) {
    const el = ref.current;
    if (!el) {
      onChange(value + texto);
      return;
    }
    const ini = el.selectionStart ?? value.length;
    const fim = el.selectionEnd ?? value.length;
    onChange(value.slice(0, ini) + texto + value.slice(fim));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(ini + texto.length, ini + texto.length);
    });
  }

  return (
    <div className="space-y-2">
      <Textarea
        id={id}
        ref={ref}
        rows={4}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <span>Inserir:</span>
        {variaveis.map((v) => (
          <button
            key={v}
            type="button"
            disabled={disabled}
            onClick={() => inserir(`{{${v}}}`)}
            className="rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-[0.7rem] text-foreground hover:bg-muted disabled:opacity-60"
          >
            {`{{${v}}}`}
          </button>
        ))}
        <button
          type="button"
          disabled={disabled}
          onClick={() => inserir("||")}
          className="rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-[0.7rem] text-foreground hover:bg-muted disabled:opacity-60"
          title="Separa em outra mensagem"
        >
          || nova mensagem
        </button>
      </div>
      {desconhecidas.length > 0 ? (
        <p role="alert" className="rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
          {desconhecidas.map((v) => `{{${v}}}`).join(", ")}{" "}
          {desconhecidas.length === 1
            ? "não é variável conhecida e vai"
            : "não são variáveis conhecidas e vão"}{" "}
          sair como está no texto.
        </p>
      ) : null}
      {partes.length > 0 ? (
        <div className="space-y-1.5 rounded-xl bg-muted/60 p-3" aria-label="Prévia da mensagem">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Prévia ({partes.length} {partes.length === 1 ? "mensagem" : "mensagens"})
          </p>
          {partes.map((p, i) => (
            <p
              key={i}
              className="w-fit max-w-full whitespace-pre-wrap break-words rounded-lg rounded-tl-sm bg-card px-3 py-2 text-[0.8125rem] text-foreground shadow-sm"
            >
              {p}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
