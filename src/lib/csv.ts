export function downloadCsv(
  filename: string,
  headers: string[],
  rows: (string | number | null)[][],
  opcoes: {
    /** Separador de colunas. O Excel em pt-BR espera ";". */
    separador?: string;
    /** BOM UTF-8 no início: sem ele o Excel abre acentos quebrados. */
    bom?: boolean;
  } = {},
) {
  const separador = opcoes.separador ?? ",";
  const escape = (value: string | number | null) => {
    const str = value == null ? "" : String(value);
    if (str.includes(separador) || str.includes('"') || str.includes("\n") || str.includes("\r")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csv = [headers, ...rows].map((row) => row.map(escape).join(separador)).join("\n");
  const blob = new Blob([opcoes.bom ? String.fromCharCode(0xfeff) + csv : csv], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
