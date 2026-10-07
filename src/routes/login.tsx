import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [{ title: "Acessar o Sistema — Moradas de Paraty" }],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (signInError) {
      setError("E-mail ou senha inválidos.");
      return;
    }

    navigate({ to: "/dashboard" });
  }

  return (
    <div className="grid min-h-[100dvh] bg-background lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      {/* Painel da marca: azul profundo, relevo em linhas que se desenham e brilho dourado à deriva. */}
      <aside className="relative isolate hidden overflow-hidden bg-forest-deep text-ivory lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          aria-hidden
          className="absolute -right-24 -top-24 -z-10 h-[28rem] w-[28rem] rounded-full bg-gold/25 blur-3xl animate-drift"
        />
        <svg
          aria-hidden
          className="absolute inset-x-0 bottom-0 -z-10 h-3/5 w-full text-white/[0.12]"
          viewBox="0 0 600 360"
          preserveAspectRatio="xMidYMax slice"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
        >
          {Array.from({ length: 14 }, (_, i) => (
            <path
              key={i}
              pathLength={1}
              className="animate-draw"
              style={{ animationDelay: `${300 + i * 90}ms` }}
              d={`M-20 ${230 + i * 9} C 110 ${150 + i * 7}, 230 ${300 - i * 6}, 350 ${210 + i * 6} S 540 ${120 + i * 8}, 640 ${170 + i * 7}`}
            />
          ))}
        </svg>

        <Logo variante="completo" className="h-24 w-auto animate-swap" />

        <div className="max-w-md">
          <p className="flex items-center gap-2 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-gold animate-swap [animation-delay:200ms]">
            <span aria-hidden className="h-px w-5 bg-gold/70" />
            Painel de vendas
          </p>
          <h2 className="mt-4 text-balance font-display text-[2.9rem] font-medium leading-[1.05] tracking-[-0.02em] animate-swap [animation-delay:300ms]">
            Cada contato, no momento certo.
          </h2>
          <p className="mt-4 text-[0.9375rem] leading-relaxed text-ivory/65 animate-swap [animation-delay:400ms]">
            Leads, visitas, lotes e documentos do Moradas de Paraty num só lugar.
          </p>
        </div>
      </aside>

      <main className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm animate-swap space-y-8">
          <div className="space-y-2">
            <Logo variante="emblema" className="mb-6 h-12 w-12 lg:hidden" />
            <p className="flex items-center gap-2 text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <span aria-hidden className="h-px w-5 bg-accent" />
              Acesso restrito
            </p>
            <h1 className="font-display text-[2.6rem] font-medium leading-none tracking-[-0.02em] text-foreground">
              Entrar
            </h1>
            <p className="text-[0.9375rem] text-muted-foreground">
              Use suas credenciais para acessar o sistema.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@empresa.com"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            {error ? (
              <p
                role="alert"
                className="animate-swap rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger"
              >
                {error}
              </p>
            ) : null}

            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? "Entrando…" : "Entrar"}
            </Button>
          </form>

          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Voltar para o site
          </Link>
        </div>
      </main>
    </div>
  );
}
