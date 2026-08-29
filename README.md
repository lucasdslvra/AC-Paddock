This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Base de données

Postgres hébergé sur Supabase, accédé via Prisma (driver adapter `pg`).

1. Renseigne dans `.env.local` (Supabase → Project Settings → Database → Connection string) :
   - `DATABASE_URL` : transaction pooler, port 6543 — utilisé par l'app.
   - `DIRECT_URL` : session pooler, port 5432 — utilisé par le CLI Prisma, le transaction
     pooler ne supporte pas le DDL.

   Le host direct `db.<ref>.supabase.co` est en IPv6 uniquement sur le plan gratuit :
   passe par le pooler. Pense à percent-encoder les caractères spéciaux du mot de passe
   (`$` → `%24`…) : Next.js fait de l'expansion de variables en lisant `.env.local` et
   tronquerait silencieusement un mot de passe contenant un `$`.
2. `npx prisma generate` (lancé automatiquement au `npm install` via `postinstall`) —
   le client est généré dans `lib/generated/prisma`, non versionné.

La migration initiale (`prisma/migrations/20260829000000_init`) a été appliquée
directement sur la base Supabase puis enregistrée dans l'historique Prisma
(`prisma migrate resolve --applied`) : `npx prisma migrate status` doit répondre
« Database schema is up to date ».

Les tables ont RLS activé sans aucune policy : l'API REST publique de Supabase ne
renvoie rien, et Prisma (rôle propriétaire) n'est pas concerné par RLS.


## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
