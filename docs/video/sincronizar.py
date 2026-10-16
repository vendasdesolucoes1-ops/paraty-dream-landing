#!/usr/bin/env python3
"""Lê os áudios de saida/audio/cenaN.mp3 e gera:
  - saida/tempos.json  (duração de cada cena + legendas, lido por cenas.html)
  - saida/narracao.m4a (trilha única, cada fala começa ENTRADA s após o início da cena)
  - saida/legendas.srt
Legendas: o texto de narracao.json é quebrado em trechos curtos e o tempo de
cada um é proporcional ao número de caracteres (aproximação da fala)."""
import json, os, re, subprocess
AQUI = os.path.dirname(os.path.abspath(__file__))
S = os.path.join(AQUI, "saida")
ENTRADA, SAIDA_CENA = 1.0, 1.6

def dur(p):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p]))

def trechos(texto, maximo=80):
    partes = re.split(r"(?<=[.!?…:;])\s+", texto)
    saida = []
    for p in partes:
        while len(p) > maximo:
            corte = p.rfind(",", 0, maximo)
            corte = corte if corte > 30 else p.rfind(" ", 0, maximo)
            saida.append(p[: corte + 1].strip()); p = p[corte + 1 :].strip()
        if p: saida.append(p)
    return saida

textos = json.load(open(os.path.join(AQUI, "narracao.json")))
duracoes, legendas, srt, n, t0 = [], {}, [], 1, 0.0
for i, texto in enumerate(textos, 1):
    a = dur(os.path.join(S, "audio", f"cena{i}.mp3"))
    d = round(ENTRADA + a + SAIDA_CENA, 2)
    duracoes.append(d)
    pedacos = trechos(texto)
    total = sum(len(p) for p in pedacos)
    t, linhas = ENTRADA, []
    for p in pedacos:
        fim = t + a * len(p) / total
        linhas.append({"inicio": round(t, 2), "fim": round(fim, 2), "texto": p})
        def ts(x):
            x += t0; h, r = divmod(x, 3600); m, s = divmod(r, 60)
            return f"{int(h):02}:{int(m):02}:{s:06.3f}".replace(".", ",")
        srt.append(f"{n}\n{ts(t)} --> {ts(fim)}\n{p}\n"); n += 1
        t = fim
    legendas[i] = linhas
    t0 += d

json.dump({"duracoes": duracoes, "legendas": legendas}, open(os.path.join(S, "tempos.json"), "w"), ensure_ascii=False, indent=1)
open(os.path.join(S, "legendas.srt"), "w").write("\n".join(srt))

# Trilha: cada áudio com atraso = início da cena + ENTRADA.
entradas, filtros, ini = [], [], 0.0
for i, d in enumerate(duracoes, 1):
    entradas += ["-i", os.path.join(S, "audio", f"cena{i}.mp3")]
    ms = int((ini + ENTRADA) * 1000)
    filtros.append(f"[{i-1}:a]adelay={ms}|{ms}[a{i}]")
    ini += d
mix = "".join(f"[a{i}]" for i in range(1, len(duracoes) + 1))
filtros.append(f"{mix}amix=inputs={len(duracoes)}:normalize=0,apad=whole_dur={ini}[out]")
subprocess.check_call(["ffmpeg", "-y", "-loglevel", "error", *entradas, "-filter_complex", ";".join(filtros),
                       "-map", "[out]", "-c:a", "aac", "-b:a", "192k", os.path.join(S, "narracao.m4a")])
print("cenas:", duracoes, "total:", round(ini, 1), "s")
