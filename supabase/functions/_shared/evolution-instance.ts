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
export function isFromPreviousSession(
  session: EvolutionSession,
  record: { createdAt?: unknown; updatedAt?: unknown },
): boolean {
  if (!session.sessionSince) return false;
  const stamps = [record.updatedAt, record.createdAt]
    .map((s) => (s ? new Date(String(s)) : null))
    .filter((d): d is Date => d !== null && !isNaN(d.getTime()));
  if (stamps.length === 0) return false;
  // Usa o carimbo mais recente: se o contato voltou a ter atividade depois da
  // reconexão, ele pertence também ao aparelho atual.
  const latest = Math.max(...stamps.map((d) => d.getTime()));
  return latest < session.sessionSince.getTime();
}
