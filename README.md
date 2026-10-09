# Vera · asistente de voz de GCPeasa Vector

Este repositorio publica el Worker **vera-voz** en Cloudflare cada vez que se sube un cambio a `main`.

- `src/backend.js` y `vector-voz.js`: código fuente (backend y widget).
- `build.py`: genera `vera-voz-worker.js` (el Worker con el widget incluido).
- `vera-voz-worker.js`: lo que se publica.
- `wrangler.toml`: configuración de publicación. Conserva las llaves (Secrets) y variables del panel.

Las llaves de IA (GROQ_API_KEY, MISTRAL_API_KEY, GEMINI_API_KEY) viven solo en Cloudflare como Secrets; nunca en este repositorio.
