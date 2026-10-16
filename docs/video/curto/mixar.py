"""Mixa a trilha do vídeo curto: narração + música (em loop, abaixando sob a voz) + efeitos.

Entradas: saida/narracao.wav e saida/tempos.json (linha_do_tempo.py), saida/cues.json
(inspecionar.mjs) e sfx/*.mp3. Saída: saida/trilha.wav, normalizada em -16 LUFS.
"""
import json
import subprocess
from pathlib import Path

AQUI = Path(__file__).parent
SAIDA = AQUI / "saida"

# Ganho base de cada efeito (dB), para os picos ficarem perto de -12 dBFS.
GANHO = {
    "clique": 9, "contagem": -4, "deslizar": -3, "digitar": -11, "logo": -4,
    "mensagem": -5, "pop": -8, "sino": -8, "sucesso": 1, "whoosh": -12,
}
MUSICA_DB = -14  # música entre as falas; a voz derruba mais ~10 dB


def main():
    tempos = json.loads((SAIDA / "tempos.json").read_text())
    total = tempos["total"]
    cues = json.loads((SAIDA / "cues.json").read_text())
    # Um whoosh em cada troca de cena (a transição dura 0,5 s).
    cues += [{"t": max(c["inicio"] - 0.35, 0), "som": "whoosh", "vol": 0} for c in tempos["cenas"][1:]]

    entradas = ["-i", str(SAIDA / "narracao.wav"), "-stream_loop", "-1", "-i", str(AQUI / "sfx/musica.mp3")]
    filtros = [
        "[0:a]aformat=sample_rates=48000:channel_layouts=stereo,asplit=2[voz][chave]",
        f"[1:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=0:{total:.3f},"
        f"volume={MUSICA_DB}dB,afade=t=in:d=1.5,afade=t=out:st={total - 4:.3f}:d=4[mus]",
        "[mus][chave]sidechaincompress=threshold=0.015:ratio=8:attack=80:release=600:makeup=1[musd]",
    ]
    rotulos = []
    for i, c in enumerate(cues):
        entradas += ["-i", str(AQUI / f"sfx/{c['som']}.mp3")]
        atraso = int(round(c["t"] * 1000))
        ganho = GANHO.get(c["som"], -6) + c.get("vol", 0)
        filtros.append(
            f"[{i + 2}:a]aformat=sample_rates=48000:channel_layouts=stereo,"
            f"volume={ganho}dB,adelay={atraso}|{atraso}[s{i}]"
        )
        rotulos.append(f"[s{i}]")
    filtros.append(
        f"[voz][musd]{''.join(rotulos)}amix=inputs={len(rotulos) + 2}:normalize=0:duration=first,"
        f"atrim=0:{total:.3f},loudnorm=I=-16:TP=-1.5:LRA=11[fim]"
    )
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", *entradas, "-filter_complex", ";".join(filtros),
         "-map", "[fim]", "-ar", "48000", str(SAIDA / "trilha.wav")],
        check=True,
    )
    print(f"{SAIDA / 'trilha.wav'}: {len(cues)} efeitos, {total:.1f} s")


if __name__ == "__main__":
    main()
