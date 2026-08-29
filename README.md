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
« Database schema is up to date ». Les suivantes s'appliquent normalement, avec
`npx prisma migrate deploy`.

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

L'image de la fiche est retirée du bucket dans la foulée. Ses associations `ModTag`
partent avec elle (`onDelete: Cascade`, US-C1) ; `Vote` et `SessionMod` suivront le même
modèle quand ils arriveront — le rappel est dans `prisma/schema.prisma`.

Aucun admin n'est désigné pour l'instant : `User.role` vaut `MEMBER` par défaut. Pour
en promouvoir un, passer son rôle à `ADMIN` en base.

## Tags (US-C1, US-C2)

Modèle `Tag` + table d'association `ModTag` (`prisma/schema.prisma`). Les deux relations
de `ModTag` portent `onDelete: Cascade` : supprimer une fiche ou un tag ne laisse jamais
d'association orpheline. Un tag survit en revanche à la dernière fiche qui le portait —
il appartient au vocabulaire commun.

### Normalisation

Tout tag passe par `normalizeTagName` ([lib/mods/tags.ts](lib/mods/tags.ts)) avant
d'atteindre la base : minuscules, accents retirés, mots liés par des tirets. `Drift`,
`drift` et `  DRIFT ` désignent donc la même ligne `Tag`, et le `@unique` sur
`Tag.name` le fait respecter. C'est ce qui répond au « éviter les doublons/variantes »
du cahier §2.2 — l'autocomplétion seule n'y suffit pas, rien n'empêche de taper à côté.

Cette normalisation vaut aussi pour le terme cherché : `GET /api/tags?query=Drift`
trouve `drift` sans comparaison insensible à la casse côté base.

### Écriture

`POST /api/mods` et `PATCH /api/mods/[id]` acceptent un tableau `tags` de noms. La
logique « findOrCreate » est dans [lib/mods/tags-store.ts](lib/mods/tags-store.ts) :
`createMany` + `skipDuplicates`, puis relecture. Passer par la contrainte d'unicité
plutôt que par un `findMany` suivi d'un `create` évite qu'enregistrer deux fiches avec
le même tag neuf au même instant fasse échouer la seconde.

En PATCH, `tags` suit la même sémantique que les autres champs : clé absente = tags
inchangés, clé présente = l'ensemble est **remplacé** (d'où le `deleteMany` préalable),
tableau vide = tous retirés. Le formulaire renvoie toujours la liste complète.

Un mod est plafonné à 8 tags (`MAX_TAGS_PER_MOD`).

### Lecture et filtrage

`GET /api/mods?tags=drift,jdm` filtre le catalogue. Les formes `?tags=drift&tags=jdm` et
`?tags[]=…` sont acceptées aussi. Les tags se **combinent en ET** : la fiche doit porter
tous les tags demandés, ce qui donne un `some` par tag dans le `where` — un seul `in`
répondrait « au moins un », qui n'est pas la question posée par le cahier §2.3.

Toutes les lectures de fiches partagent l'objet `modInclude`
([lib/mods/serialize.ts](lib/mods/serialize.ts)), pour qu'aucune ne puisse oublier de
charger les tags. Ils ressortent triés par nom.

### Interface

[components/TagInput.tsx](components/TagInput.tsx) — multi-select avec autocomplétion
sur `GET /api/tags` (les plus utilisés d'abord, avec leur nombre de fiches), création à
la volée, navigation clavier, virgule et entrée pour valider, retour arrière pour
retirer la dernière pastille.

Le filtre du catalogue vit dans les **query params de l'URL** (`/catalogue?tags=drift,jdm`),
pas dans un état local : la sélection survit à un rechargement, se partage par lien, et
une pastille cliquée sur une fiche de mod y mène directement. `useSearchParams` impose
une frontière `Suspense`, d'où le découpage `page.tsx` (serveur) /
`CatalogueView.tsx` (client).

La grille du catalogue affiche encore les fiches de démonstration de `lib/mock-data.ts` :
son branchement sur `GET /api/mods` appartient à US-E1. En attendant, la liste des tags
du panneau latéral est l'union des vrais tags (API) et de ceux des fiches de démo ; la
seconde moitié disparaîtra avec les mocks.

## Détection de doublons (US-D1, US-D2, US-D3)

Une fiche par mod, enrichie par tout le monde : le cahier §2.4 demande de repérer une
fiche existante *avant* d'en créer une seconde, sans jamais bloquer la création — le
membre garde toujours « Créer quand même ».

### Recherche floue sur le nom (US-D1)

`GET /api/mods/search?name=silvia` renvoie jusqu'à 5 fiches proches, la plus probable
d'abord. La migration `20260829200000_duplicate_detection` installe l'extension
`pg_trgm` (schéma `extensions`, celui de Supabase) et pose un index GIN trigram sur
`Mod.name`.

Deux façons d'être « proche », réunies par un OU, toutes deux servies par cet index :

- `%`, l'opérateur de similarité trigram — il rattrape fautes de frappe et variantes
  d'orthographe (`silvia s15` ↔ `Silvia S-15`) ;
- `ILIKE '%…%'` — il rattrape le cas inverse, un terme court contenu dans un nom long,
  où la similarité globale reste sous le seuil.

L'opérateur et `similarity()` sont **qualifiés par leur schéma**
(`OPERATOR(extensions.%)`) : le `search_path` du rôle de connexion n'entre pas en jeu.
Prisma ne sachant pas décrire un index GIN trigram, celui-ci est créé à la main dans la
migration — le rappel est dans `prisma/schema.prisma`.

### Vérification du lien (US-D2)

`GET /api/mods/check-url?url=…` répond `{ "match": <fiche> | null }`.

La comparaison porte sur une forme normalisée du lien, `normalizeModUrl`
([lib/mods/url.ts](lib/mods/url.ts)) : protocole et `www.` retirés, ancre supprimée,
paramètres de suivi (`utm_*`, `fbclid`, `ref`, le `usp` des partages Drive…) écartés,
paramètres restants triés, slash final coupé, le tout en minuscules.

    https://WWW.RaceDepartment.com/downloads/silvia.1234/?utm_source=discord#reviews
    → racedepartment.com/downloads/silvia.1234

Ce résultat est stocké dans la colonne indexée `Mod.urlKey`, écrite à chaque création
et à chaque édition du lien : la vérification est une lecture par index, pas un
balayage du catalogue. La colonne n'est **pas** `@unique` — le doublon doit rester
possible.

Un lien illisible n'est pas une erreur ici (le champ est en cours de saisie) : la route
répond simplement « aucune correspondance », et c'est la validation du formulaire qui
refusera l'enregistrement.

Le passage en minuscules suit le cahier (« casse ») et rend théoriquement égales deux
adresses qui ne différeraient que par la casse de leur chemin — un identifiant Drive,
par exemple. C'est assumé : la détection avertit, elle ne bloque pas.

### Dans le formulaire (US-D3)

Les deux vérifications vivent dans [lib/mods/useDuplicates.ts](lib/mods/useDuplicates.ts)
et ne sont actives qu'à la **création** : à l'édition, la fiche se trouverait elle-même.

- `useSimilarMods` — appel debounce (250 ms) pendant la saisie du nom, à partir de 3
  caractères ; les fiches proches s'affichent sous le champ, chacune avec un « Voir la
  fiche ». Comme pour l'autocomplétion des tags, la requête précédente est annulée pour
  qu'une réponse lente n'écrase pas une plus récente.
- `useUrlDuplicate` — appel **au blur et au collage** du champ lien, pas à la frappe :
  une URL n'a de sens qu'entière. Le collage précède la mise à jour de la valeur du
  champ, d'où la relecture au tour de boucle suivant. Un même lien n'est interrogé
  qu'une fois.

En cas de correspondance, un bandeau « Ce mod existe peut-être déjà » propose les deux
sorties du cahier : **Voir la fiche existante** (lien vers la fiche) ou **Créer quand
même**, qui écarte l'avertissement pour ce lien précis — il ne réapparaît pas au blur
suivant, et le lien saisi est conservé tel quel.

### L'aller-retour ne coûte pas la saisie

« Voir la fiche existante » n'a d'intérêt que si y aller ne fait pas perdre ce qui est
déjà tapé — sinon personne ne clique, et la détection ne sert à rien.

Avant de quitter le formulaire, la saisie complète (type, nom, lien, description, tags,
et l'URL de l'image déjà déposée) est mise de côté dans le `sessionStorage` de l'onglet
— [lib/mods/draft.ts](lib/mods/draft.ts), relue avec un schéma Zod parce que rien ne
garantit ce qu'on retrouve dans un stockage navigateur. Le lien porte en plus
`?brouillon=1`, ce que la page de la fiche lit côté serveur pour afficher un bandeau
**Reprendre ma fiche**.

Au retour, `ModForm` repeuple ses champs depuis le brouillon **dès l'initialisation de
son état**, pas dans un effet : pas de formulaire vide qui se remplirait après coup.
Rien n'est lu pendant le rendu serveur, et le formulaire n'est de toute façon affiché
qu'une fois la session connue. Un bandeau discret signale la reprise et offre
« repartir de zéro » (qui libère au passage l'image envoyée). Le lien du brouillon est
re-vérifié à l'affichage, pour que l'avertissement de doublon soit exact.

Le brouillon est effacé à la publication et sur « Annuler ». Il ne survit pas à la
fermeture de l'onglet (`sessionStorage`, pas `localStorage`) — et comme il n'est écrit
qu'au moment de partir voir une fiche, revenir par le bouton *retour* du navigateur
retrouve la saisie aussi.

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
