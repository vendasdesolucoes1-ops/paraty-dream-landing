// Leitura de coordenadas a partir de um link do Google Maps, para o material
// "Localização" da Sophia. Sem imports com alias: é testado direto pelo Node
// (node --test src/lib/agente-mapa.test.ts).

export interface Coordenadas {
  latitude: number;
  longitude: number;
}

const NUM = "(-?\\d{1,3}(?:\\.\\d+)?)";
const SEP = "\\s*(?:,|%2C)\\s*";

// Ordem importa: o pin exato (!3d…!4d…) e os parâmetros de busca vêm antes do
// "@lat,lng", que é o centro do mapa na tela e não necessariamente o local.
const PADROES: RegExp[] = [
  new RegExp(`!3d${NUM}!4d${NUM}`),
  new RegExp(`[?&](?:q|query|ll|destination|daddr)=${NUM}${SEP}${NUM}`, "i"),
  new RegExp(`@${NUM}${SEP}${NUM}`),
];

function valida(lat: number, lng: number): Coordenadas | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { latitude: lat, longitude: lng };
}

/**
 * Extrai latitude e longitude de links como `.../@-23.21,-44.71,17z`,
 * `...?q=-23.21,-44.71` ou `...?api=1&query=-23.21,-44.71`. Também aceita o
 * par colado sozinho (`-23.21, -44.71`). Devolve null quando não encontra.
 * Links encurtados (maps.app.goo.gl) não trazem coordenadas: abra o link e
 * copie o endereço completo da barra do navegador.
 */
export function coordenadasDoLinkMaps(texto: string): Coordenadas | null {
  const bruto = (texto ?? "").trim();
  if (!bruto) return null;

  const soPar = bruto.match(new RegExp(`^${NUM}${SEP}${NUM}$`));
  if (soPar) return valida(Number(soPar[1]), Number(soPar[2]));

  for (const padrao of PADROES) {
    const m = bruto.match(padrao);
    if (m) {
      const c = valida(Number(m[1]), Number(m[2]));
      if (c) return c;
    }
  }
  return null;
}

/** Link para abrir o ponto no Google Maps. */
export function linkMapsDe(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
}
