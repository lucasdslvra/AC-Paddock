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


## Édition des fiches (US-B3)

Usage wiki : `PATCH /api/mods/[id]` n'exige qu'une session valide, aucune restriction
d'auteur. `authorId` n'est jamais modifié, l'auteur d'origine reste affiché sur la fiche.

La route suit une vraie sémantique PATCH : seules les clés présentes dans le corps sont
modifiées, une clé absente laisse le champ intact, une clé présente à `""` ou `null`
l'efface (`buildModUpdateData` dans [lib/mods/schema.ts](lib/mods/schema.ts)). Quand
l'image change, l'ancienne est retirée du bucket dans la foulée.

Le formulaire de création et celui d'édition sont le même composant,
[components/ModForm.tsx](components/ModForm.tsx), paramétré par la présence d'une fiche
existante. La détection de doublons est désactivée à l'édition, où la fiche se
trouverait elle-même.

## Suppression des fiches (US-B4)

`DELETE /api/mods/[id]` est réservé à l'auteur de la fiche ou à un admin
(`canDeleteMod` dans [lib/mods/permissions.ts](lib/mods/permissions.ts)). Le rôle est
relu en base à chaque requête plutôt que porté par la session : un changement de rôle
prend effet tout de suite, sans attendre une reconnexion.

L'image de la fiche est retirée du bucket dans la foulée. Les associations
(`ModTag`, `Vote`, `SessionMod`) n'existent pas encore ; quand elles arriveront, leur
relation vers `Mod` devra porter `onDelete: Cascade` — le rappel est dans
`prisma/schema.prisma`.

Aucun admin n'est désigné pour l'instant : `User.role` vaut `MEMBER` par défaut. Pour
en promouvoir un, passer son rôle à `ADMIN` en base.

## Stockage des images (US-B2)

Les images d'aperçu des mods vont dans un bucket Supabase Storage nommé `mod-images`,
en **public** : `Mod.imageUrl` stocke une URL directement affichable, sans signature à
renouveler. Le bucket doit exister (Storage → New bucket → `mod-images`, coché public).

L'upload passe toujours par `POST /api/uploads/mod-image`, côté serveur, avec la clé
secrète (`sb_secret_…`) — elle ne doit jamais être exposée au navigateur. La route vérifie la
session, le type MIME et la taille, puis renvoie l'URL publique que le formulaire place
dans `imageUrl`. `POST /api/mods` refuse toute `imageUrl` qui ne vient pas de ce bucket.

Le host Supabase est ajouté aux `images.remotePatterns` de `next.config.ts` à partir de
`SUPABASE_URL` — sans cette variable, `next/image` refusera d'afficher les vignettes.
`next.config.ts` n'est évalué qu'au démarrage : après avoir ajouté ou changé
`SUPABASE_URL`, **redémarre `next dev`**, un rechargement de `.env.local` ne suffit pas.

### Compression à l'upload

Formats acceptés en entrée : **JPG et PNG** uniquement (`image/jpeg`, `image/jpg`,
`image/png`). Le bucket n'autorise en écriture que `image/webp`, `image/png` et
`image/jpeg`.

Les images sont ré-encodées côté serveur avant d'atteindre le bucket
([lib/mods/image-processing.ts](lib/mods/image-processing.ts)) : réduction à 1600 px sur
le plus grand côté, WebP qualité 80, métadonnées supprimées. Sur une photo de
2048×2048, ça donne ~79 % d'octets en moins sans différence visible — les deux endroits
où l'image s'affiche sont une vignette de 52 px et une bande d'aperçu de 700 px de
large au plus, et `next/image` réduit encore derrière.

L'orientation EXIF est appliquée avant que les métadonnées soient retirées, sinon les
photos de téléphone ressortent couchées. Si le ré-encodage pèse plus lourd que
l'original — possible sur un PNG déjà minuscule — l'original est conservé ; le JPEG fait
exception et reste toujours normalisé, à cause de l'EXIF.

## Nettoyage des images orphelines

Une image est déposée dans le bucket *avant* que la fiche existe. Deux mécanismes
évitent qu'elle y reste pour rien :

1. **Suppression immédiate** — quand le formulaire remplace ou retire une image déjà
   envoyée, il appelle `DELETE /api/uploads/mod-image`. La route refuse (409) toute
   image déjà référencée par une fiche, pour qu'on ne puisse pas vider l'aperçu d'un
   mod existant par ce chemin.
2. **Balayage de rattrapage** — `GET /api/maintenance/orphan-images` liste le bucket,
   soustrait les `Mod.imageUrl` connus, et supprime le reste au-delà d'un délai de
   grâce de 6 h (`ORPHAN_GRACE_MS`). Ce délai protège les formulaires encore ouverts.
   C'est ce qui rattrape l'onglet fermé sans publier, cas qu'aucun appel client ne peut
   couvrir.

La route de balayage exige `Authorization: Bearer $CRON_SECRET` et refuse de tourner
si `CRON_SECRET` n'est pas défini. `vercel.json` la déclenche tous les jours à 4 h ;
en local, on peut l'appeler à la main avec le même en-tête.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
