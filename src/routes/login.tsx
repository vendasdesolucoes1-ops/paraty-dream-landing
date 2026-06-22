import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [{ title: "Acessar o Sistema — Moradas de Paraty" }],
  }),
  component: LoginPlaceholder,
});

function LoginPlaceholder() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="max-w-md w-full text-center space-y-6">
        <p className="eyebrow text-muted-foreground">Acesso restrito</p>
        <h1 className="text-4xl text-primary">Sistema em breve</h1>
        <p className="text-muted-foreground">
          A área de acesso para corretores e clientes está em construção.
        </p>
        <Link
          to="/"
          className="inline-block eyebrow text-primary border-b border-primary pb-1 hover:text-accent hover:border-accent transition-colors"
        >
          Voltar ao site
        </Link>
      </div>
    </div>
  );
}
