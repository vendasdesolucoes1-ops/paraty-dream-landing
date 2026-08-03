// Helper compartilhado das ferramentas WhatsApp.
//
// Motivo de existir: a Evolution guarda contatos/chats no banco DELA por
// instância, e esses registros SOBREVIVEM à troca de aparelho. Quando o QR da
// instância é lido por outro celular, a agenda antiga continua lá e vaza para
// as ferramentas como se fosse do telefone atual (foi exatamente o que
// aconteceu: contatos sincronizados em 23/07 pelo celular pessoal apareceram
// depois que a instância foi reconectada com o número comercial).
//
// Regra adotada: toda ferramenta consulta o estado real da instância antes de
// qualquer coisa e descarta dado anterior ao início da sessão atual.

export interface EvolutionSession {
  connectionStatus: string;
  ownerJid: string | null;
  ownerNumber: string | null;
  profileName: string | null;
  // Momento em que o aparelho atual passou a valer. Tudo que a Evolution
  // gravou antes disso é herança do aparelho anterior.
  sessionSince: Date | null;
}

export async function getEvolutionSession(instance: {
  api_url: string;
  api_key: string;
  instance_name: string;
}): Promise<EvolutionSession> {
  const url = `${instance.api_url.replace(/\/$/, "")}/instance/fetchInstances?instanceName=${encodeURIComponent(
    instance.instance_name,
  )}`;
  const response = await fetch(url, { headers: { apikey: instance.api_key } });
  if (!response.ok) {
    throw new Error(`Evolution API fetchInstances error: ${await response.text()}`);
  }

  const result = await response.json();
  const list = Array.isArray(result) ? result : [result];
  const found = list.find(
    (i: Record<string, unknown>) => (i?.name ?? i?.instanceName) === instance.instance_name,
  );
  if (!found) throw new Error("Instância não encontrada na Evolution API.");

  const ownerJid: string | null = found.ownerJid ?? null;
  const ownerNumber = ownerJid ? ownerJid.replace(/@.*$/, "").replace(/\D/g, "") : null;
  const disconnectionAt = found.disconnectionAt ? new Date(found.disconnectionAt) : null;

  return {
    connectionStatus: String(found.connectionStatus ?? "close"),
    ownerJid,
    ownerNumber,
    profileName: found.profileName ?? null,
    sessionSince: disconnectionAt && !isNaN(disconnectionAt.getTime()) ? disconnectionAt : null,
  };
}

// Guarda usada por todas as ferramentas: sem aparelho conectado, nenhuma
// ferramenta opera — melhor erro claro do que devolver dado velho do banco.
export function assertConnected(session: EvolutionSession) {
  if (session.connectionStatus !== "open") {
    throw new Error(
      "A instância não está conectada. Leia o QR Code novamente antes de usar as ferramentas.",
    );
  }
}

// true = registro é de uma sessão anterior (outro celular) e deve ser ignorado.
//
// IMPORTANTE: o corte usa SOMENTE `createdAt`. Ao ler o QR com um aparelho
// novo, o Baileys re-sincroniza e a Evolution dá UPDATE em toda a base antiga
// (medido: 717 contatos criados em 08/07 e 09/07 receberam updatedAt às 01:45
// logo após a reconexão). Usar updatedAt fazia a agenda do celular anterior
// reaparecer inteira como se fosse do aparelho atual — foi o caso dos números
// "misturados" de DDDs desconhecidos. `createdAt` é a única marca que a
// re-sincronização não reescreve.
export function isFromPreviousSession(
  session: EvolutionSession,
  record: { createdAt?: unknown; updatedAt?: unknown },
): boolean {
  if (!session.sessionSince) return false;
  const created = record.createdAt ? new Date(String(record.createdAt)) : null;
  if (!created || isNaN(created.getTime())) return false;
  return created.getTime() < session.sessionSince.getTime();
}

