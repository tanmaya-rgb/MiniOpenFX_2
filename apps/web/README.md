# apps/web — MiniOpenFX frontend

Vite + React + TypeScript + Tailwind CSS. Talks to `apps/api` over HTTP using a static dev API
key (see `.env.local.example`).

```bash
cp .env.local.example .env.local   # then fill in VITE_API_KEY from apps/api/.env
npm run dev -w apps/web            # from the repo root
```

See the repo root README for the full setup (Docker, migrations, seed) and `../../FRONTEND.md`
for the API contract this app is built against.
