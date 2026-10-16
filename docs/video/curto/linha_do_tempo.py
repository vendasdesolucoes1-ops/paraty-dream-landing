#!/usr/bin/env python3
"""Monta a linha do tempo do vídeo curto a partir dos áudios de cada fala.

Saídas (em saida/):
  tempos.json   cenas (início/fim) e falas (início/duração/texto), lido por cenas.html
  narracao.wav  todas as falas posicionadas no tempo exato
  legendas.srt  uma legenda por fala, com o tempo real do áudio
"""
import json, os, subprocess
AQUI = os.path.dirname(os.path.abspath(__file__))
S = os.path.join(AQUI, "saida"); os.makedirs(S, exist_ok=True)
ABERTURA, ENTRADA_CENA, ENTRE_FALAS, SAIDA_CENA, FINAL = 4.0, 1.5, 0.7, 1.4, 6.0

def dur(p):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p]))

r = json.load(open(os.path.join(AQUI, "roteiro.json")))
t, cenas, falas = 0.0, [], {}
for i, c in enumerate(r["cenas"]):
    ini = t
    t += ABERTURA if i == 0 else ENTRADA_CENA
    for j, b in enumerate(c["batidas"]):
        d = dur(os.path.join(AQUI, "audio", f"{b}.mp3"))
        falas[b] = {"inicio": round(t, 3), "duracao": round(d, 3), "texto": r["falas"][b], "cena": c["id"]}
        t += d + (ENTRE_FALAS if j < len(c["batidas"]) - 1 else 0)
    t += FINAL if i == len(r["cenas"]) - 1 else SAIDA_CENA
    cenas.append({"id": c["id"], "inicio": round(ini, 3), "fim": round(t, 3)})
total = round(t, 3)
json.dump({"total": total, "cenas": cenas, "falas": falas}, open(os.path.join(S, "tempos.json"), "w"), ensure_ascii=False, indent=1)

def ts(x):
    h, rest = divmod(x, 3600); m, s = divmod(rest, 60)
    return f"{int(h):02}:{int(m):02}:{s:06.3f}".replace(".", ",")
srt = [f"{n}\n{ts(f['inicio'])} --> {ts(f['inicio'] + f['duracao'])}\n{f['texto']}\n" for n, f in enumerate(falas.values(), 1)]
open(os.path.join(S, "legendas.srt"), "w").write("\n".join(srt))

ent, fil = [], []
for k, (b, f) in enumerate(falas.items()):
    ent += ["-i", os.path.join(AQUI, "audio", f"{b}.mp3")]
    ms = int(f["inicio"] * 1000)
    fil.append(f"[{k}:a]aresample=48000,adelay={ms}|{ms}[v{k}]")
fil.append("".join(f"[v{k}]" for k in range(len(falas))) + f"amix=inputs={len(falas)}:normalize=0,apad=whole_dur={total}[out]")
subprocess.check_call(["ffmpeg", "-y", "-loglevel", "error", *ent, "-filter_complex", ";".join(fil), "-map", "[out]",
                       "-ac", "2", "-ar", "48000", os.path.join(S, "narracao.wav")])
print("total", total, "s;", [(c["id"], c["inicio"], c["fim"]) for c in cenas])
