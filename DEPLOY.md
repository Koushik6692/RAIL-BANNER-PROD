# Rail Banner Studio — Production deploy

Clean production app (sibling of the prototype). Shared project library for ~5 named users. Host on **Vercel** + **Cloudflare R2**.

## Features

- Named logins (`APP_USERS`)
- Home: **New project** + **Recent projects** (everyone sees all)
- Save / reopen full timeline + Hornbrooker banners
- Export MP4 (download) + store in project export history on R2

## Env vars (Vercel + local `.env`)

### Auth (required for login)

```env
APP_USERS=[{"username":"anna","password":"change-me","displayName":"Anna"},{"username":"ben","password":"change-me","displayName":"Ben"},{"username":"cara","password":"change-me","displayName":"Cara"},{"username":"dan","password":"change-me","displayName":"Dan"},{"username":"eva","password":"change-me","displayName":"Eva"}]
APP_AUTH_SECRET=long-random-string-32-chars-min
```

### Cloudflare R2 (required for shared media + exports)

| Variable | Example |
|----------|---------|
| `R2_BUCKET_NAME` | `rail-banner-prod` |
| `R2_ACCOUNT_ID` | `…` |
| `R2_ACCESS_KEY_ID` | `…` |
| `R2_SECRET_ACCESS_KEY` | `…` |
| `R2_PUBLIC_DOMAIN` | `https://pub-xxxx.r2.dev` |
| `R2_UPLOAD_IN_DEV` | `true` (local only) |

### R2 CORS

Allow your Vercel origin + `http://localhost:3000`:

```json
[
  {
    "AllowedOrigins": [
      "https://YOUR-APP.vercel.app",
      "http://localhost:3000"
    ],
    "AllowedMethods": ["GET", "HEAD", "PUT"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag", "Content-Length"],
    "MaxAgeSeconds": 3600
  }
]
```

## Local run

```bash
cd Rail-Banner-Prod
npm install
npm run dev
```

Opens on **http://localhost:3000**.

Without R2, project JSON is stored under `./data/projects` (local only). Media uploads still need R2 for multi-user sharing.

## Vercel

1. Import this folder as a new Vercel project (or set Root Directory to `Rail-Banner-Prod` if monorepo)
2. Paste env vars
3. Deploy
4. Update R2 CORS with the production URL

## Smoke test

1. Login as Anna → New project → upload video → add template → **Save**
2. Export → file downloads + “saved to project history”
3. Logout → login as Ben → same project appears under Recent → open + re-download export

## Notes

- Prototype folder is untouched; this app is the clean production surface
- No Hostinger shared hosting — Next.js API routes need Node (Vercel / VPS)
