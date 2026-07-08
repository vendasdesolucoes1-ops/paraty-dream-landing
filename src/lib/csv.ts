export function parseContactsCsv(text: string): { nome: string; telefone: string }[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return [];

  const firstCols = lines[0].split(",").map((c) => c.trim().toLowerCase());
  const hasHeader = firstCols.includes("nome") || firstCols.includes("telefone");
  const dataLines = hasHeader ? lines.slice(1) : lines;

  return dataLines
    .map((line) => {
      const [nome, telefone] = line.split(",").map((c) => c.trim());
      return { nome: nome ?? "", telefone: (telefone ?? nome ?? "").replace(/\D/g, "") };
    })
    .filter((row) => row.telefone.length > 0);
}

export function parseManualContacts(text: string): { nome: string; telefone: string }[] {
  return text
    .split(/[\n,]/)
    .map((raw) => raw.replace(/\D/g, ""))
    .filter((phone) => phone.length > 0)
    .map((telefone) => ({ nome: "", telefone }));
}

export function downloadCsv(
  filename: string,
  headers: string[],
  rows: (string | number | null)[][],
) {
  const escape = (value: string | number | null) => {
    const str = value == null ? "" : String(value);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csv = [headers, ...rows].map((row) => row.map(escape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
