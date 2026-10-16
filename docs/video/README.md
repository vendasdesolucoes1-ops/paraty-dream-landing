# Vídeo de apresentação do sistema

Vídeo animado (1920×1080, ~3 min 40 s) para apresentar o sistema à equipe e ao dono,
narrado com a voz "Danilo" da conta ElevenLabs.

| Arquivo | O que é |
| --- | --- |
| `roteiro.md` | Roteiro por cena: narração e animação |
| `narracao.json` | Texto falado de cada cena (gera as legendas) |
| `cenas.html` | As 8 cenas animadas; abra com `?play` no navegador para ver em tempo real, `?t=40` para parar num instante, `&legendas` para mostrar legendas |
| `saida/audio/cenaN.mp3` | Narração de cada cena (ElevenLabs, voz Danilo, modelo eleven_v4) |
| `sincronizar.py` | Lê os áudios e gera `saida/tempos.json`, `saida/legendas.srt` e a trilha `saida/narracao.m4a` |
| `render.mjs` | Renderiza o vídeo quadro a quadro (Playwright + ffmpeg) |
| `quadros.mjs` | Tira prints de instantes específicos para conferência |

## Gerar de novo

```bash
cd docs/video
python3 sincronizar.py                      # tempos, legendas e trilha
node render.mjs --legendas --saida saida/video-mudo.mp4
ffmpeg -i saida/video-mudo.mp4 -i saida/narracao.m4a -c copy -shortest \
  -movflags +faststart saida/moradas-de-paraty-apresentacao.mp4
```

Para mudar uma fala: edite `narracao.json` e `roteiro.md`, gere o áudio da cena de novo na
ElevenLabs (voz Danilo) salvando em `saida/audio/cenaN.mp3`, e rode os três passos acima.
A animação de cada cena se ajusta sozinha à duração da fala (`COREOGRAFIA` em `cenas.html`).
