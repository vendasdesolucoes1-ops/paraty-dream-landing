export function ComingSoon({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-24 space-y-3">
      <p className="eyebrow text-muted-foreground">{title}</p>
      <h2 className="text-3xl font-display text-primary">Em breve</h2>
      <p className="text-muted-foreground max-w-sm">
        Este módulo está em desenvolvimento e estará disponível em breve.
      </p>
    </div>
  );
}
