# Vídeo curto para o dono (~1min52)

Versão de 2 minutos, com narração (voz Danilo, ElevenLabs `eleven_v4`), música de
fundo que abaixa sob a voz e efeitos sincronizados com cada animação.

Os textos estão em `roteiro.json` (14 falas, 6 cenas). As animações em `cenas.html`
entram na palavra exata da fala (`data-b` = fala, `data-w` = palavra), e cada
elemento com `data-som` gera uma deixa de efeito sonoro.

## Montar do zero

```bash
cd docs/video
python3 curto/linha_do_tempo.py            # tempos.json, legendas.srt, narracao.wav
node curto/inspecionar.mjs --quadros 12,40 # cues.json (+ quadros de conferência)
python3 curto/mixar.py                     # trilha.wav: voz + música + efeitos, -16 LUFS
node render.mjs --pagina curto/cenas.html --tempos curto/saida/tempos.json \
  --legendas --saida curto/saida/video-mudo.mp4
ffmpeg -i curto/saida/video-mudo.mp4 -i curto/saida/trilha.wav -c:v copy \
  -c:a aac -b:a 192k -shortest curto/saida/moradas-dono-2min.mp4
```

Áudios gerados ficam em `audio/` (narração, f01–f14) e `sfx/` (música e efeitos,
`eleven_text_to_sound_v2`). Para trocar uma fala: gerar o novo `fXX.mp3` e rodar
de novo a partir de `linha_do_tempo.py`. Sem legenda: abrir `cenas.html?sem-legenda`.
Todos os dados exibidos são fictícios.
