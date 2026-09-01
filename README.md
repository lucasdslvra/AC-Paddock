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
(US-C1), ses `Vote` (US-F1) et ses `SoireeMod` (US-G2) partent avec elle
(`onDelete: Cascade`). La suppression laisse une entrée au journal (US-K2, plus bas) :
c'est la seule trace qui reste d'une fiche effacée.

Aucun admin n'est désigné par l'application : `User.role` vaut `MEMBER` par défaut. Pour
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

La grille du catalogue est branchée sur `GET /api/mods` (voir la section suivante) : la
liste des tags du panneau latéral vient donc entièrement de `GET /api/tags`, avec leur
nombre réel de fiches.

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

## Catalogue (US-E1, US-E2, US-E3, US-E4)

`GET /api/mods` sert la grille du catalogue. Tous ses paramètres sont optionnels et se
combinent :

| Paramètre | Valeurs | US |
| --- | --- | --- |
| `tags` | `drift,jdm` — combinés en **ET** | US-C2 |
| `type` | `CAR` / `TRACK` (absent = tous) | US-E2 |
| `search` | fragment du nom, insensible à la casse | US-E3 |
| `sort` | `date` (défaut) / `votes` | US-E4 |
| `page` | 1-indexée, 24 fiches par page | US-E1 |

La réponse n'est plus un tableau nu mais un objet `ModListResponse` : `mods`, `page`,
`perPage`, `total`, `pageCount` et `counts` (le nombre de fiches par type, pour les
compteurs du filtre).

### Un seul analyseur pour deux URL

[lib/mods/query.ts](lib/mods/query.ts) définit la requête catalogue — les valeurs
acceptées, celles par défaut, `parseModQuery` et sa réciproque
`modQueryToSearchParams` — et les deux côtés s'en servent : la route API lit l'URL de
la requête, le catalogue lit celle de la page. Un filtre écrit dans `/catalogue?…` part
donc tel quel dans l'appel API, et une valeur inconnue ou bricolée à la main retombe des
deux côtés sur la même valeur par défaut : une URL malformée affiche un catalogue, jamais
une erreur.

Comme pour les tags (US-C2), **l'URL est la seule source de vérité** des filtres : la
sélection survit à un rechargement et se partage par lien. Tout changement de filtre
ramène en page 1 — rester en page 4 après avoir coché un tag afficherait une page vide
alors que des résultats existent.

### Compteurs et total

Un seul `groupBy` par type donne d'un coup les compteurs du filtre *et* le total de la
requête, qui n'en est que la somme (ou la ligne du type choisi). Ces compteurs sont
calculés en ignorant le type sélectionné mais en tenant compte de la recherche et des
tags : « Circuits · 0 » doit rester lisible pendant qu'on regarde les véhicules, sinon
le filtre annonce des résultats qu'il n'a pas.

### Recherche (US-E3)

`contains` + `mode: "insensitive"` part en `ILIKE '%…%'`, servi par l'index GIN trigram
posé sur `Mod.name` par la migration `20260829200000_duplicate_detection`. La saisie
passe d'abord par `escapeLikeWildcards` ([lib/mods/like.ts](lib/mods/like.ts)) : Prisma
insère la valeur telle quelle entre ses deux `%`, donc sans échappement taper `%`
ramènerait tout le catalogue, et `silvia_s15` ne trouverait pas la fiche qui porte
exactement ce nom.

C'est une recherche de **filtrage**, à ne pas confondre avec `GET /api/mods/search`
(US-D1), qui répond à une autre question — « une fiche proche existe-t-elle déjà ? » —
par une similarité trigram classée.

Le champ est débouncé (`SEARCH_DEBOUNCE_MS`) et garde sa propre valeur pendant la
frappe : passer par l'URL à chaque lettre lancerait une requête par caractère.

### Tri (US-E4)

`sort=votes` classe par nombre de votes décroissant, agrégé par la base
(`{ votes: { _count: "desc" } }` dans `MOD_ORDER_BY`,
[app/api/mods/route.ts](app/api/mods/route.ts)). Les fiches à égalité — le cas le plus
courant, zéro vote — se départagent par date, comme dans l'autre tri.

Les deux tris se terminent par `{ id: "desc" }`. Ce n'est pas décoratif : deux fiches
créées dans la même milliseconde s'échangeraient d'une page à l'autre, et la pagination
par décalage en sauterait une tout en en montrant une autre deux fois.

### Côté interface

[lib/mods/useCatalogue.ts](lib/mods/useCatalogue.ts) fait la requête, une par état de
filtre, annulée dès que l'état change — sans quoi une réponse lente partie sur `drift`
pourrait arriver après celle partie sur `drift + jdm` et réafficher la liste large
par-dessus la liste étroite. `isLoading` n'y est pas un état à part : la réponse retenue
porte la requête à laquelle elle répond, et charger, c'est « la dernière réponse ne
répond pas à la requête courante ».

La réponse précédente reste affichée, estompée, pendant que la suivante arrive : les
cartes se périment un instant plutôt que de disparaître à chaque lettre tapée.

Les fiches arrivent en JSON et passent par `apiModToView`
([lib/mods/view.ts](lib/mods/view.ts)) pour prendre la forme attendue par `ModCard`.
`toModView`, qui part d'une ligne Prisma (fiche détail), repasse désormais par cette même
fonction : une fiche s'affiche pareil qu'elle vienne d'un `findUnique` ou d'un `fetch`.

`voteHistory` (le petit histogramme des cartes) ne décore que les fiches de
démonstration : le vote réel n'a pas d'historique jour par jour à en tirer. Les
compteurs FICHES / VOTES de l'en-tête viennent encore de `lib/mock-data.ts`.

## Votes (US-F1, US-F2)

Modèle `Vote` (`prisma/schema.prisma`), une ligne par membre et par fiche. L'unicité
est portée par la base — `@@unique([userId, modId])` — pas par une vérification
préalable : deux clics partis en même temps ne peuvent pas produire deux votes.

Le cahier §4 rattache le vote à un `SessionMod`. Le MVP vote « sans notion formelle de
soirée » (cahier §6), donc `Vote` pointe directement sur la fiche ; l'Epic G ajoutera
`sessionModId` à côté plutôt que de réécrire la table.

### Les routes

`POST /api/mods/[id]/vote` enregistre le vote, `DELETE` le retire
([app/api/mods/[id]/vote/route.ts](app/api/mods/[id]/vote/route.ts)). Le backlog ne
demande que le POST, mais le bouton qu'il décrit a deux états : sans le DELETE, l'état
actif serait sans retour.

Les deux verbes sont idempotents (`skipDuplicates` d'un côté, `deleteMany` de l'autre) et
répondent le même objet, `VoteState` ([lib/mods/vote.ts](lib/mods/vote.ts)) : le total
de la fiche et l'état du membre. Une requête rejouée — réseau capricieux, double clic —
redit donc la même chose au lieu d'inverser le vote, ce qu'une bascule côté serveur ne
garantirait pas.

Voter est souvent la première écriture d'un membre : sa ligne `User` n'existe pas
forcément encore, et `upsertSessionUser` ([lib/session-user.ts](lib/session-user.ts)) la
crée au passage — la même que celle utilisée à la création d'une fiche.

### Le compteur (US-F2)

`modInclude` ([lib/mods/serialize.ts](lib/mods/serialize.ts)) est devenu une fonction
prenant l'identifiant Discord du membre connecté. Elle ramène en une seule requête le
total (`_count.votes`) et le vote de ce membre — filtré par la relation, pas par un `id`
de ligne `User` qui n'existe pas forcément. `ApiMod` expose donc `votes` et `hasVoted`,
et chaque carte du catalogue sait s'afficher sans requête supplémentaire.

### Côté interface

`useVote` ([lib/mods/useVote.ts](lib/mods/useVote.ts)) porte la mécanique, partagée par
la carte du catalogue et par le panneau de la fiche détail : deux dessins, un seul
comportement. Le compteur bouge avant la réponse du serveur — voter est l'action la plus
banale de l'application, souvent faite depuis un téléphone — puis la réponse remplace la
valeur optimiste par le compte réel, les votes des autres membres compris. Un échec la
remet exactement où elle était, avec un message.

L'état local l'emporte ensuite sur les valeurs venues du serveur : la carte survit à un
re-rendu du catalogue (changement de tri, de page) sans que le bouton ne retombe une
seconde sur l'ancien compte.

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

## Espace admin (US-K1, US-K2, US-K3)

### Le garde de rôle (US-K1)

Le contrôle est un garde appelé par chaque route — `requireAdmin` dans
[lib/admin/guard.ts](lib/admin/guard.ts) — et non un `proxy.ts` (l'ex-`middleware.js`,
renommé en Next.js 16). La documentation de `proxy` prévient qu'il ne doit pas dépendre
de modules partagés : il est optimisé pour être déployé sur le CDN, loin de la base, et
c'est en base que vit le rôle. Le garde le relit donc à chaque requête, comme partout
ailleurs dans le projet — un changement de rôle prend effet tout de suite.

```ts
const guard = await requireAdmin();
if (!guard.ok) return guard.response;   // 401 si déconnecté, 403 sinon
guard.actor;                            // { id, role }
```

Il couvre `/api/admin/*` (`config`, `deletions`) et les deux suppressions réservées à
l'admin décrites plus bas.

Côté écrans, [app/admin/layout.tsx](app/admin/layout.tsx) fait la même vérification et
renvoie un non-admin au catalogue — pas à la page de connexion : il est bien connecté,
c'est cette section-là qui ne le concerne pas. Le layout porte aussi l'en-tête sombre
« ESPACE ADMIN », si bien qu'une page ajoutée sous `/admin` est protégée sans que
personne n'ait à y penser.

L'onglet « Admin » de l'en-tête n'apparaît que pour un admin. Le rôle n'étant pas dans
la session, `useIsAdmin` le demande à `GET /api/me` — une route volontairement hors de
`/api/admin/*`, qui répond `{ isAdmin: false }` plutôt qu'un 403. Masquer un lien ne
protège rien ; c'est le layout et les gardes qui refusent l'accès.

### Modération et journal (US-K2)

| Route | Réservée à | Emporte avec elle |
| --- | --- | --- |
| `DELETE /api/mods/[id]` | auteur **ou** admin (US-B4) | tags associés, votes, engagements |
| `DELETE /api/tags/[name]` | admin | les associations `ModTag` — les fiches restent |
| `DELETE /api/soirees/[id]` | admin | les engagements et les votes de la soirée |

Les deux nouvelles suppressions étendent les routes de ressource existantes plutôt que
d'ouvrir un `/api/admin/tags/…` parallèle : c'est la même ressource, avec une exigence
de rôle en plus.

Supprimer un tag est un acte de modération, pas d'édition : le vocabulaire est alimenté
librement par les membres (cahier §2.2), et l'autocomplétion (US-C1) recopie ensuite les
fautes de frappe de fiche en fiche. Supprimer une soirée sert surtout à réparer une date
fautive — y compris celle en cours, qui capte alors les votes de tout le monde ; la
suivante prend sa place sans qu'on ait rien à basculer, `currentSoiree` la déduit de la
date.

Chaque suppression écrit une ligne dans `DeletionLog` (`recordDeletion`,
[lib/admin/deletion-log.ts](lib/admin/deletion-log.ts)), affichée dans le journal de
`/admin`. Trois choix s'y lisent :

- **le nom est recopié**, pas référencé : la ligne effacée ne peut plus le donner, et
  `targetId` ne pointe donc sur rien — c'est ce qui rattache l'entrée à un lien mort
  partagé ailleurs (« /mods/xyz renvoie 404 » : le journal dit pourquoi) ;
- **les suppressions d'un auteur sur sa propre fiche y figurent aussi**, marquées
  `asAdmin: false`. Un journal qui n'en montrerait que la moitié n'expliquerait pas
  l'autre ;
- **l'écriture du journal n'échoue jamais bruyamment** : le contenu est déjà parti, une
  trace manquante ne doit pas ressortir en 500. L'échec reste dans les logs serveur.

### Taille maximale des uploads (US-K3)

Table clé/valeur `AppConfig` : le backlog demande « table/clé de configuration », et un
réglage de plus ne doit pas coûter une migration. La valeur est stockée en texte, c'est
[lib/admin/settings.ts](lib/admin/settings.ts) qui sait la lire et qui porte les bornes
— 20 à 200 Mo, 100 par défaut. Une clé absente n'est pas une anomalie : la table ne
contient que ce que quelqu'un a réellement changé, et le code retombe sur sa valeur par
défaut. Une valeur devenue illisible est traitée pareil, plutôt que de faire échouer un
upload sur un réglage cassé.

Le réglage porte sur le **fichier du mod** — le .zip du cahier §2.2 — et pas sur l'image
d'aperçu (US-B2), qui garde sa limite en dur : elle est ré-encodée avant stockage, sa
borne est celle de ce que `sharp` doit accepter de lire, pas une question d'espace
disque.

`maxModFileBytes()` ([lib/admin/config.ts](lib/admin/config.ts)) est la lecture que les
routes d'upload du fichier de mod (US-H1/H2) doivent faire. **Ces routes n'existent pas
encore** : la valeur est administrable et persistée, mais rien ne la consomme tant que
l'Epic H n'est pas faite. C'est le seul point du backlog K qui reste en attente, et il
attend une autre US.

## Notifications Discord (US-L1, US-L2)

Le cahier §1 donne la raison d'être de l'application : le groupe vivait sur des liens
éparpillés dans Discord, et tout a été rapatrié ici. La notification est le chemin de
retour — le salon reste l'endroit où l'on **apprend** qu'il se passe quelque chose, sans
redevenir celui où on en discute. Trois annonces : une soirée programmée et une soirée
annulée (US-L1), un mod proposé (US-L2).

L'annulation n'est pas dans le backlog, qui ne parle que de la création. Elle y a
pourtant plus sa place encore : quelqu'un a peut-être déjà bloqué sa soirée, et une
soirée qui disparaît sans un mot se découvre en rouvrant une page vide. Elle ne part
que pour une soirée **qui n'a pas encore commencé** — trier les anciennes est du
rangement, et le groupe n'a rien à en apprendre. Le seuil est l'instant présent, pas le
début du jour de `currentSoiree` : une soirée dont l'heure est passée a eu lieu, on ne
l'annule plus à personne. Elle est aussi la seule des trois **sans lien** : la
page a disparu avec la soirée, et un titre cliquable qui mène à un 404 est pire que pas
de lien.

Un webhook, pas un bot : le backlog laisse le choix, et un bot demanderait une
application Discord, un jeton à faire tourner et un processus qui écoute. Il n'y a rien
à écouter — l'application parle, Discord se contente de l'afficher.

Trois modules, trois responsabilités :

- [lib/discord/webhook.ts](lib/discord/webhook.ts) — le transport. Il ne sait qu'envoyer,
  et **ne lève jamais** : la soirée ou la fiche est déjà écrite quand il part, un salon
  injoignable ou un webhook supprimé n'ont pas à ressortir en 500 chez le membre.
  L'échec reste dans les logs serveur, seul endroit d'où il puisse être corrigé. Un
  délai de garde de 5 s empêche une invocation de rester ouverte sur un Discord muet ;
- [lib/discord/notify.ts](lib/discord/notify.ts) — ce que les messages racontent ;
- [lib/admin/guilds.ts](lib/admin/guilds.ts) — à quel salon les envoyer.

**Après la réponse, pas pendant.** Les deux routes de création appellent leur
notification dans un [`after()`](app/api/mods/route.ts) : le membre voit sa fiche ou sa
soirée sans attendre que Discord réponde, et l'envoi survit quand même à la fin de la
requête — `after` garde l'invocation ouverte, y compris en serverless.

**Rien de ce qui part ne peut mentionner personne.** Le contenu vient de champs saisis
par les membres — nom d'un mod, description, tags —, et un webhook a le droit de
réveiller tout un serveur : chaque envoi porte donc `allowed_mentions: { parse: [] }`.
Un `@everyone` dans un nom de fiche s'affiche, et ne notifie rien.

**Le lien du message** est fabriqué à partir de l'hôte par lequel la requête vient
d'entrer (`requestOrigin`), pas d'une variable d'environnement de plus : c'est
exactement l'adresse que le membre a sous les yeux. Si elle est illisible, le message
part sans lien plutôt que pas du tout.

### Un salon par serveur (US-L2)

Les annonces ne sont pas globales. Depuis que plusieurs serveurs ont accès, un webhook
unique voudrait dire que le salon d'un groupe reçoit ce que fait l'autre — alors qu'ils
ne se croisent nulle part ailleurs. `AuthorizedGuild` porte donc deux colonnes de plus
(migration `20260901200000_guild_webhooks`) :

- `webhookUrl` — le salon de ce groupe. Nul par défaut : ouvrir l'accès à un serveur ne
  doit pas se mettre à écrire dans un salon dont personne n'a donné l'adresse ;
- `notify` — l'interrupteur de ce salon, distinct de l'URL. Taire un groupe quelques
  semaines ne doit pas coûter son adresse, qu'il faudrait retrouver ensuite.

`guildWebhookUrl(guildId)` est la seule autorité sur « où envoyer », et répond `null`
dans tous les cas où il n'y a rien à envoyer : pas de webhook, interrupteur fermé,
serveur inconnu, base injoignable. Le salon est résolu **au moment de l'envoi** : couper
les annonces d'un serveur ne rattrape pas ce qui est déjà parti, mais rien de ce qui est
encore en vol ne passe outre.

Qui est prévenu de quoi :

| Annonce | Serveur visé | Pourquoi |
| --- | --- | --- |
| Soirée créée (US-L1) | celui de la soirée (`Soiree.guildId`) | Elle lui appartient déjà — un admin peut en programmer une pour un groupe dont il n'est pas. |
| Soirée annulée (US-L1) | celui de la soirée | Même serveur, message inverse. Il dit ce qu'elle emportait — engagements et votes partent avec elle (`onDelete: Cascade`) — et rappelle que les fiches, elles, restent au catalogue. |
| Mod proposé (US-L2) | celui de l'auteur | Un groupe est prévenu de ce que **les siens** proposent. Le catalogue reste commun : les autres verront la fiche, sans avoir été réveillés pour une proposition de gens qu'ils ne croiseront jamais en soirée. |

Le serveur du déploiement fait exception, comme partout : il n'a pas de ligne en base —
c'est ce qui rend impossible de se verrouiller dehors depuis l'espace admin — donc son
salon reste dans `DISCORD_WEBHOOK_URL`, à côté de `DISCORD_GUILD_ID`. Pas de ligne, pas
d'interrupteur non plus : pour lui, la présence de la variable **est** l'interrupteur.

### Le webhook est un secret

Qui l'a peut écrire dans le salon. Trois conséquences, toutes visibles dans le code :

- **il ne ressort jamais du serveur.** `ApiAuthorizedGuild.webhook` n'en porte qu'une
  forme tronquée (`maskWebhookUrl` : « discord.com/…/1403926…/•••• »), assez pour
  vérifier qu'il y en a un et lequel, jamais assez pour le recopier. Conséquence directe
  sur l'écran : on ne **modifie** pas un webhook, on en **pose un nouveau** — le champ
  de saisie part toujours vide, parce qu'il n'a rien à pré-remplir ;
- **l'URL est validée contre Discord** (`isDiscordWebhookUrl`), à l'entrée comme juste
  avant l'envoi. Sans ce contrôle, l'espace admin devient un moyen de faire poster le
  serveur vers n'importe quelle adresse, avec le contenu des fiches dedans. Un admin est
  de confiance ; une confiance n'a pas à être une capacité ;
- **il se renseigne à deux moments** : à l'ouverture de l'accès (`POST /api/admin/guilds`,
  champ facultatif) et plus tard depuis la ligne du serveur (`PATCH
  /api/admin/guilds/[id]`). C'est rarement au même moment qu'on a l'identifiant du
  serveur et l'URL du webhook sous la main.

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

## Expiration des fichiers de mod (US-H3)

Cahier §2.7 : **tout fichier déposé saute 24 h après son upload**, quelle que soit la
date de la soirée à laquelle le mod est associé. La fiche, elle, n'est jamais supprimée
— nom, lien, description, votes et historique restent.

`sweepExpiredModFiles` (`lib/mods/expired-files.ts`) cherche les fiches dont
`fileUploadedAt` dépasse 24 h et dont `fileUrl` est encore renseigné, retire l'objet de
Cloudflare R2, puis vide les deux colonnes. L'ordre n'est pas indifférent : l'objet part
**avant** que la fiche l'oublie. Vider `fileUrl` d'abord laisserait, si le retrait
échoue, un objet que plus rien ne désigne — donc introuvable au balayage suivant, et
téléchargeable par qui en a gardé l'URL. En cas d'échec la fiche est laissée en l'état
et repassera à l'heure suivante.

`GET /api/maintenance/expired-files` expose ce balayage, avec le même contrat que celui
des images orphelines : `Authorization: Bearer $CRON_SECRET`, et refus de tourner si le
secret n'est pas défini.

### La planification

Elle vit dans la base, pas dans `vercel.json` : le cahier §2.7 demande **plusieurs
passages par jour** pour que la fenêtre réelle soit « 24 h » et non « 24 h + la période
du job », or les crons Vercel sont limités à un déclenchement quotidien sur le plan
Hobby. `pg_cron` tourne à l'heure, gratuitement.

`prisma/cron/expired-mod-files.sql` contient tout : les extensions, les secrets, la
fonction et le job. À exécuter **une fois** dans l'éditeur SQL de Supabase — ce n'est
pas une migration Prisma, parce que ça ne décrit pas le schéma dont l'application
dépend et qu'un échec y bloquerait des migrations qui n'y sont pour rien.

### pg_net appelle l'application, pas Cloudflare

Le cahier proposait que `pg_net` s'adresse directement à l'API R2. Supprimer un objet R2
demande une signature AWS SigV4 — une chaîne de HMAC-SHA256 à écrire en plpgsql, et
surtout les identifiants Cloudflare recopiés dans la base. La base appelle donc la route
de maintenance, qui a déjà le SDK et les clés : `pg_cron` et `pg_net` restent l'un et
l'autre à leur poste, et les identifiants R2 ne vivent qu'à un seul endroit.

L'URL de l'application et le `CRON_SECRET` sont rangés dans **Supabase Vault**, pas en
clair dans la définition du job : `cron.job` est une table lisible, et ce secret vaut
droit de déclencher la maintenance.

### Entre l'échéance et le balayage

Il s'écoule jusqu'à une heure. Pendant ce temps `fileUrl` est encore renseigné, mais
`modFileLifetime` marque le fichier expiré : le panneau affiche « EXPIRÉ », ne propose
plus le téléchargement, et rouvre le dépôt.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
