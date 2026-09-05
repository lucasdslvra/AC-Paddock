# AC Paddock

Application web privée pour un groupe d'amis qui joue à **Assetto Corsa** ensemble.
On y propose des mods — véhicules et circuits — avant une soirée de jeu, le groupe vote,
et l'application dit ce qui sera roulé et où le télécharger.

Elle remplace ce qui se passait avant dans Discord : des liens collés au fil de la
discussion, perdus deux jours plus tard, et un « on joue quoi ce soir ? » à décider dans
les dix minutes qui précèdent. Le catalogue est commun, les fiches s'enrichissent à
plusieurs, et le classement du soir se fait avant le soir.

Le cahier des charges d'origine est dans [backlog/cahier-des-charges-mods-ac.md](backlog/cahier-des-charges-mods-ac.md).
Il est cité dans tout le code et dans ce document sous la forme « cahier §2.4 ».

**Ce que le projet n'est pas** : un outil communautaire. L'accès est réservé aux membres
d'un serveur Discord donné, il n'y a pas d'inscription, pas de mot de passe, pas de
modération à l'échelle. Deux contraintes ont guidé presque toutes les décisions
techniques : **budget d'hébergement nul** (paliers gratuits de Vercel, Supabase et
Cloudflare) et **maintenance par une seule personne, sur son temps libre**.

---

## Table des matières

- [Le cycle d'une soirée](#le-cycle-dune-soirée)
- [Les écrans](#les-écrans)
- [Stack technique](#stack-technique)
- [Mise en route](#mise-en-route)
- [Organisation du dépôt](#organisation-du-dépôt)
- [Modèle de données](#modèle-de-données)
- [Routes API](#routes-api)
- [Les règles, en détail](#les-règles-en-détail)
  - [Accès : Discord, serveurs, rôles](#accès--discord-serveurs-rôles)
  - [Les fiches, en usage wiki](#les-fiches-en-usage-wiki)
  - [Tags](#tags)
  - [Détection de doublons](#détection-de-doublons)
  - [Catalogue](#catalogue)
  - [Soirées, votes et places](#soirées-votes-et-places)
  - [Fichiers de mod](#fichiers-de-mod)
  - [Images d'aperçu](#images-daperçu)
  - [Espace admin](#espace-admin)
  - [Notifications Discord](#notifications-discord)
  - [Tâches planifiées](#tâches-planifiées)
- [Déploiement](#déploiement)
- [Conventions du code](#conventions-du-code)

---

## Le cycle d'une soirée

C'est le cœur du domaine ; tout le reste en découle.

**1. Le catalogue se remplit, en continu.** N'importe quel membre propose une fiche de
mod : type (véhicule ou circuit), nom, lien externe, description, tags, image d'aperçu.
Avant l'enregistrement, l'application cherche si une fiche proche existe déjà — nom
similaire, ou même lien — et propose d'aller la compléter plutôt que d'en créer une
seconde. Une fiche appartient ensuite à tout le monde : chacun peut la corriger,
l'enrichir, y ajouter un lien miroir. Seul son auteur (ou un admin) peut la supprimer.

**2. Un admin programme une soirée** : une date, une heure, éventuellement un thème
(« touge only », « rallye »). Elle appartient au serveur Discord de son groupe, et le
salon de ce serveur en est prévenu.

**3. Les membres engagent des mods.** Engager, c'est mettre une fiche du catalogue au
programme de la soirée. Sans limite de nombre, et sans être l'auteur de la fiche.

**4. On vote, jusqu'à 30 minutes avant le départ.** Chaque membre dispose d'une réserve
par soirée : **8 votes véhicule et 3 votes circuit**. Il les répartit comme il veut, et
peut en empiler plusieurs sur le même mod pour le pousser. Le classement se met à jour en
direct, séparément pour les véhicules et pour les circuits.

**5. Le vote ferme, le sort tranche les égalités.** La soirée retient **les 8 véhicules
les plus votés et le circuit le plus voté**. Les ex æquo sur la ligne de coupe sont
départagés par un tirage au sort fait à cet instant précis — pas avant, pas à chaque
affichage.

**6. La fenêtre de retrait s'ouvre** : de la fermeture du vote jusqu'à 2 h après le
départ, un bouton télécharge les mods retenus les uns après les autres.

**7. Les fichiers disparaissent, les fiches restent.** Tout fichier déposé s'efface 24 h
après son envoi, et ceux des mods non retenus partent dès la fermeture du vote. Le
catalogue, lui, ne perd rien : la soirée rejoint l'historique avec ce qu'elle a retenu, et
chaque fiche garde la liste des soirées où elle a tourné.

```text
catalogue ──► engagement ──► vote ──┃ 30 min ┃── DÉPART ──── 2 h ────┃──► historique
   (continu)     (libre)      (quotas)  ▲                             ▲
                                    vote clos                    retrait clos
                                    tirage au sort              fichiers effacés
                                    retrait ouvert
```

---

## Les écrans

| Route | Écran |
| --- | --- |
| `/` | Connexion (« Se connecter avec Discord »). Prérendue, sans session ; un membre déjà connecté est dévié vers `/catalogue` par [proxy.ts](proxy.ts). |
| `/catalogue` | La grille des fiches : filtres par type et par tags, recherche, tri, pagination. |
| `/mods/[id]` | La fiche : lien, description, tags, liens secondaires, panneau de vote, panneau de fichier, fil des contributions, soirées où elle a tourné. |
| `/mods/nouveau`, `/mods/[id]/modifier` | Le formulaire — le même composant dans les deux cas. |
| `/soiree` | La soirée en cours : les deux classements, le vote, l'engagement, le panneau de retrait. |
| `/soiree/[id]` | Une soirée précise. |
| `/historique` | Les soirées passées et ce qu'elles ont retenu. |
| `/admin` | Modération, journal des suppressions, membres, serveurs autorisés, stockage, réglages. Réservé aux admins. |

L'interface est en français, responsive (le vote se fait souvent depuis un téléphone) et
propose un thème clair/sombre.

---

## Stack technique

| | |
| --- | --- |
| Framework | **Next.js 16** (App Router, React 19), TypeScript |
| Base de données | **PostgreSQL** sur Supabase, via **Prisma 7** (driver adapter `pg`) |
| Authentification | **Auth.js / NextAuth v5**, provider Discord, sessions JWT |
| Images d'aperçu | **Supabase Storage** (bucket public `mod-images`), ré-encodage `sharp` |
| Fichiers de mod | **Cloudflare R2** (S3-compatible), URL pré-signées |
| Validation | **Zod** |
| Styles | **Tailwind CSS v4**, tokens CSS maison — pas de bibliothèque de composants |
| Hébergement | **Vercel** |
| Planification | **pg_cron + pg_net** côté Supabase, crons Vercel en filet |

> **Attention** : ce projet tourne sur Next.js 16, dont les conventions diffèrent des
> versions précédentes (`middleware.ts` devenu `proxy.ts`, typages `PageProps` /
> `RouteContext` générés, `after()`…). La documentation de la version installée est dans
> `node_modules/next/dist/docs/` — voir [AGENTS.md](AGENTS.md).

---

## Mise en route

### Prérequis

Node 20+, un projet **Supabase**, un bucket **Cloudflare R2**, et une application
**Discord** (Developer Portal → OAuth2), avec pour URL de redirection
`http://localhost:3000/api/auth/callback/discord`.

### 1. Variables d'environnement

```bash
cp .env.local.example .env.local
```

[.env.local.example](.env.local.example) documente chaque variable et où la trouver. Les
pièges à connaître :

- **`DATABASE_URL`** doit pointer sur le *transaction pooler* (port 6543), utilisé par
  l'app ; **`DIRECT_URL`** sur le *session pooler* (port 5432), utilisé par le CLI Prisma
  — le transaction pooler ne supporte pas le DDL. L'hôte direct `db.<ref>.supabase.co`
  est en IPv6 seul sur le plan gratuit : passer par le pooler.
- **Percent-encoder les caractères spéciaux du mot de passe** (`$` → `%24`, `@` → `%40`).
  Next.js fait de l'expansion de variables en lisant `.env.local` et tronquerait
  silencieusement un mot de passe contenant un `$`.
- **`DISCORD_GUILD_ID`** est le serveur du déploiement. Il n'a pas de ligne en base, et
  c'est volontaire : quoi qu'on retire depuis l'espace admin, il autorise encore
  quelqu'un à entrer — impossible de se verrouiller dehors.
- **`CRON_SECRET`** protège les routes de maintenance ; sans lui, elles refusent de
  tourner.

### 2. Base de données

```bash
npx prisma generate      # lancé automatiquement au npm install (postinstall)
npx prisma migrate deploy
npx prisma migrate status   # doit répondre « Database schema is up to date »
```

Le client Prisma est généré dans `lib/generated/prisma`, non versionné.

La migration initiale (`20260829000000_init`) a été appliquée à la main sur Supabase puis
enregistrée dans l'historique (`prisma migrate resolve --applied`) ; les suivantes
s'appliquent normalement. Toutes les tables ont **RLS activé sans aucune policy** : l'API
REST publique de Supabase ne renvoie rien, et Prisma (rôle propriétaire) n'est pas
concerné par RLS.

### 3. Stockage

- **Supabase** → Storage → New bucket → `mod-images`, coché **public**. Types autorisés en
  écriture : `image/webp`, `image/png`, `image/jpeg`.
- **Cloudflare R2** → un bucket privé en écriture, exposé en lecture par son *Public
  Development URL* ou un domaine personnalisé, et un token API « Object Read & Write »
  limité à ce bucket.

Le bucket R2 demande en plus une **politique CORS** (Bucket → Settings → CORS Policy).
Le fichier d'un mod ne traverse pas l'application : c'est le navigateur qui `PUT` dans le
bucket, sur une URL signée — une requête cross-origin, que R2 refuse en pré-vol tant que
l'origine n'est pas déclarée. Chaque origine d'où part un upload doit y figurer :

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000", "https://ac-paddock.vercel.app"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 3600
  }
]
```

R2 compare les origines **caractère pour caractère** : pas de joker de sous-domaine, donc
les URL de *preview* Vercel (`ac-paddock-git-<branche>-….vercel.app`), qui changent à
chaque branche, n'uploadent pas tant qu'on ne les ajoute pas une à une — ou qu'on ne teste
l'upload que sur le domaine de production. Le token « Object Read & Write » ne peut pas
lire cette politique (`GetBucketCors` répond 403) : elle se règle au tableau de bord.

Un oubli ici ne se voit que dans la console du navigateur — l'application, elle, ne
reçoit rien : le `POST` qui signe l'URL réussit, et c'est l'envoi suivant, direct vers
Cloudflare, qui est bloqué avant même de partir.

`SUPABASE_URL` est lue par [next.config.ts](next.config.ts) pour autoriser l'hôte des
images dans `next/image`. **`next.config.ts` n'est évalué qu'au démarrage** : après avoir
renseigné cette variable, redémarrer `next dev`.

### 4. Lancer

```bash
npm install
npm run dev      # http://localhost:3000
npm run lint
npm run build
```

### 5. Se donner le rôle admin

Aucun admin n'est désigné par l'application — `User.role` vaut `MEMBER` par défaut.
Après une première connexion, passer sa ligne à `ADMIN` en base (éditeur SQL Supabase ou
`npx prisma studio`).

### 6. Facultatif : la planification horaire

`prisma/cron/expired-mod-files.sql` installe `pg_cron`, `pg_net` et le job horaire qui
appelle la route de maintenance. À exécuter **une fois** dans l'éditeur SQL de Supabase.
Ce n'est pas une migration Prisma : ça ne décrit pas le schéma dont l'application dépend,
et un échec y bloquerait des migrations qui n'y sont pour rien. Sans lui, le cron
quotidien de `vercel.json` sert de filet.

---

## Organisation du dépôt

```text
app/                 Routes App Router — pages et API
  api/               Les route handlers (voir « Routes API »)
  admin/             L'espace admin ; son layout porte le garde de rôle
  catalogue/  soiree/  historique/  mods/
components/          Composants partagés entre les écrans
lib/
  admin/             Garde de rôle, réglages, journal, serveurs autorisés
  discord/           Webhooks et contenu des annonces
  mods/              Fiches : schémas, requêtes, tags, doublons, fichiers, images
  soirees/           Soirée en cours, phases, quotas, votes, ex æquo, clôture
  r2/  supabase/     Les deux stockages
  prisma.ts          Le client, mémorisé et instancié paresseusement
auth.ts              Configuration NextAuth + contrôle d'appartenance au serveur
proxy.ts             Déviation de « / » pour un membre déjà connecté
prisma/              Schéma, migrations, script cron
backlog/             Cahier des charges et backlog d'origine
```

La logique métier vit dans `lib/`, jamais dans les composants ni dans les routes : une
règle qui vaut pour deux routes (le quota de votes, par exemple) est écrite une fois et
appelée deux fois. Les modules serveur portent `import "server-only"`.

---

## Modèle de données

Le schéma complet, avec ses justifications, est dans
[prisma/schema.prisma](prisma/schema.prisma) — c'est le document de référence.

| Table | Rôle |
| --- | --- |
| `User` | Membre Discord : pseudo, avatar, rôle, serveur où son appartenance a été constatée, dernière connexion. |
| `Mod` | La fiche : type, nom, lien, `urlKey` (forme normalisée du lien), description, image, fichier. |
| `ModLink` | Liens secondaires (miroir, pack de textures…), avec leur intitulé et leur auteur. |
| `ModContribution` | Le fil des corrections d'une fiche : qui a touché à quoi, et quand. |
| `Tag`, `ModTag` | Vocabulaire libre, normalisé, alimenté par les membres. |
| `Soiree` | Date, thème facultatif, serveur Discord propriétaire. |
| `SoireeMod` | Un mod engagé dans une soirée. `tieBreak` porte le tirage au sort. |
| `Vote` | Une ligne par vote placé — plusieurs par membre et par mod sont possibles. |
| `AuthorizedGuild` | Serveurs Discord ouverts depuis l'espace admin, avec leur webhook. |
| `DeletionLog` | Le journal des suppressions — la seule trace d'un contenu effacé. |
| `AppConfig` | Réglages clé/valeur modifiables sans migration. |
| `ModFileReservation` | Une place retenue dans le bucket, le temps qu'un envoi aboutisse. |

Deux écarts assumés par rapport au cahier §4 :

- la table `Session` du cahier s'appelle ici **`Soiree`** — `Session` est déjà le type de
  NextAuth, présent dans presque chaque route sous la forme `const session = await auth()` ;
- `Vote.soireeModId` est **nullable**, uniquement pour ne pas effacer les votes écrits par
  le MVP, qui n'avait pas de notion de soirée. Plus rien n'en crée.

---

## Routes API

Toutes exigent une session valide, sauf mention contraire.

### Fiches

| Route | Ce qu'elle fait |
| --- | --- |
| `GET /api/mods` | Le catalogue : `tags`, `type`, `search`, `sort`, `page`. |
| `POST /api/mods` | Crée une fiche. |
| `PATCH`·`DELETE /api/mods/[id]` | Édition wiki (toute session), suppression (auteur ou admin). La fiche elle-même se lit par la page, pas par l'API. |
| `GET /api/mods/search?name=` | Recherche floue, pour la détection de doublons. |
| `GET /api/mods/check-url?url=` | Un lien déjà enregistré ailleurs ? |
| `POST /api/mods/[id]/links`, `DELETE …/links/[linkId]` | Liens secondaires. |
| `POST`·`PUT /api/mods/[id]/upload` | Signe une URL d'envoi, puis confirme le dépôt. |
| `POST`·`DELETE /api/mods/[id]/vote` | Voter depuis le catalogue ou la fiche. |

### Soirées

| Route | Ce qu'elle fait |
| --- | --- |
| `GET /api/soirees`, `POST` | Liste ; création réservée aux admins. |
| `GET`·`DELETE /api/soirees/[id]` | Lecture ; suppression réservée aux admins. |
| `POST /api/soirees/[id]/mods`, `DELETE …/mods/[modId]` | Engager, désengager. |
| `POST`·`DELETE /api/soirees/[id]/mods/[modId]/vote` | Voter depuis la page soirée. |

### Divers, admin et maintenance

| Route | Ce qu'elle fait |
| --- | --- |
| `GET /api/tags`, `DELETE /api/tags/[name]` | Autocomplétion ; suppression réservée aux admins. |
| `GET /api/me` | `{ isAdmin }` — pour l'affichage de l'onglet Admin. |
| `GET /api/stats` | Compteurs fiches / votes / soirées. |
| `POST`·`DELETE /api/uploads/mod-image` | Image d'aperçu. |
| `GET`·`PATCH /api/admin/config` | Réglages. |
| `GET /api/admin/deletions` | Journal des suppressions. |
| `GET`·`POST /api/admin/guilds`, `PATCH`·`DELETE …/[id]` | Serveurs autorisés et leurs webhooks. |
| `GET`·`DELETE /api/admin/storage` | Occupation du bucket ; vidage forcé. |
| `GET /api/maintenance/expired-files` | Balayage des fichiers expirés — `Authorization: Bearer $CRON_SECRET`. |
| `GET /api/maintenance/orphan-images` | Balayage des images orphelines — même contrat. |

---

## Les règles, en détail

### Accès : Discord, serveurs, rôles

La connexion demande les scopes `identify` et `guilds`. Au callback, `signIn`
([auth.ts](auth.ts)) appelle `GET /users/@me/guilds` et vérifie que le membre appartient à
**l'un des serveurs autorisés** : celui du déploiement (`DISCORD_GUILD_ID`) ou l'un de ceux
ouverts depuis l'espace admin (`AuthorizedGuild`). Sinon, l'accès est refusé avec un
message explicite. Pas de whitelist à maintenir : le serveur Discord *est* la liste.

C'est le seul moment où l'appartenance est connue — Discord ne dit qu'au membre lui-même à
quels serveurs il appartient. Elle est donc recopiée sur sa ligne `User` (`guildId`,
`guildName`, `lastSeenAt`) au passage, avec sa date : « membre de X » sans le moment où ça
a été constaté ne vaudrait rien.

La session dure **30 jours glissants** (`updateAge` la repousse au plus une fois par jour).
Conséquence à connaître : quelqu'un qui quitte le serveur Discord garde l'accès jusqu'à
l'expiration de son jeton — la vérification n'a lieu qu'à la connexion. C'est assumé pour
ce contexte (cahier §2.1).

Le **rôle**, lui, n'est pas dans la session : il est relu en base à chaque requête. Une
promotion ou une rétrogradation prend donc effet tout de suite, sans reconnexion.

Le serveur d'appartenance découpe une partie de l'application : une soirée appartient à un
serveur, « la soirée en cours » se lit par serveur, les annonces partent dans le salon de
ce serveur. Le **catalogue reste commun** — un mod est un mod.

### Les fiches, en usage wiki

**Éditer** : `PATCH /api/mods/[id]` n'exige qu'une session, aucune restriction d'auteur
(cahier §2.2). `authorId` n'est jamais modifié, l'auteur d'origine reste affiché.

La route suit une vraie sémantique PATCH : une clé absente laisse le champ intact, une clé
présente à `""` ou `null` l'efface (`buildModUpdateData`,
[lib/mods/schema.ts](lib/mods/schema.ts)). Quand l'image change, l'ancienne est retirée du
bucket dans la foulée.

Le lien principal est **facultatif** : on propose souvent un mod de mémoire, et refuser la
fiche pour ça reviendrait à perdre la proposition entière plutôt qu'un seul champ. Le
catalogue marque les fiches sans lien pour qu'un autre membre vienne le poser.

**Supprimer** : `DELETE /api/mods/[id]` est réservé à l'auteur ou à un admin
(`canDeleteMod`, [lib/mods/permissions.ts](lib/mods/permissions.ts)). L'image part du
bucket, les `ModTag`, `Vote` et `SoireeMod` suivent en cascade, et une ligne est écrite au
journal — la seule trace qui reste.

**Le fil des contributions.** Une fiche à plusieurs mains ne garde d'un membre que ce
qu'il a laissé : une description remplacée, un tag retiré ne se voient nulle part, et
`updatedAt` ne dit ni qui ni quoi. `ModContribution` répond à « qui a touché à ça, et
quand ? ». La **création** n'y est pas écrite : `authorId` et `createdAt` la disent déjà,
y compris pour les fiches antérieures à la table — elle est reconstituée à la lecture
([lib/mods/contributions.ts](lib/mods/contributions.ts)).

Le formulaire de création et celui d'édition sont le **même composant**,
[components/ModForm.tsx](components/ModForm.tsx), paramétré par la présence d'une fiche
existante.

### Tags

Vocabulaire libre alimenté par les membres, normalisé avant d'atteindre la base
(`normalizeTagName`, [lib/mods/tags.ts](lib/mods/tags.ts)) : minuscules, accents retirés,
mots liés par des tirets. `Drift`, `drift` et un `DRIFT` entouré d'espaces désignent donc
la même ligne, et
le `@unique` sur `Tag.name` le fait respecter — c'est ce qui répond au « éviter les
doublons/variantes » du cahier §2.2, que l'autocomplétion seule ne garantit pas. La même
normalisation s'applique au terme cherché.

L'écriture passe par `createMany` + `skipDuplicates` puis relecture
([lib/mods/tags-store.ts](lib/mods/tags-store.ts)) : passer par la contrainte d'unicité
plutôt que par un `findMany` suivi d'un `create` évite qu'enregistrer deux fiches avec le
même tag neuf au même instant fasse échouer la seconde. En PATCH, `tags` suit la sémantique
des autres champs : absent = inchangé, présent = l'ensemble est **remplacé**, vide = tous
retirés. Maximum 8 tags par fiche.

Au filtrage, les tags se **combinent en ET** — un `some` par tag dans le `where`. Un seul
`in` répondrait « au moins un », qui n'est pas la question du cahier §2.3.

Un tag survit à la dernière fiche qui le portait : il appartient au vocabulaire commun.
Seul un admin peut en supprimer un — c'est un acte de modération, pas d'édition :
l'autocomplétion recopie sinon les fautes de frappe de fiche en fiche.

### Détection de doublons

Une fiche par mod, enrichie par tout le monde : le cahier §2.4 demande de repérer une
fiche existante *avant* d'en créer une seconde, **sans jamais bloquer** — le membre garde
toujours « Créer quand même ».

**Sur le nom.** `GET /api/mods/search?name=silvia` renvoie jusqu'à 5 fiches proches. La
migration `20260829200000_duplicate_detection` installe `pg_trgm` et pose un index GIN
trigram sur `Mod.name`. Deux façons d'être proche, réunies par un OU et toutes deux
servies par cet index : l'opérateur de similarité `%`, qui rattrape fautes de frappe et
variantes (`silvia s15` ↔ `Silvia S-15`), et `ILIKE '%…%'`, qui rattrape le cas inverse —
un terme court contenu dans un nom long, où la similarité globale reste sous le seuil.
L'opérateur et `similarity()` sont **qualifiés par leur schéma** (`OPERATOR(extensions.%)`) :
le `search_path` du rôle de connexion n'entre pas en jeu.

**Sur le lien.** `GET /api/mods/check-url?url=…` compare une forme normalisée
(`normalizeModUrl`, [lib/mods/url.ts](lib/mods/url.ts)) : protocole et `www.` retirés,
ancre supprimée, paramètres de suivi écartés (`utm_*`, `fbclid`, `ref`, le `usp` des
partages Drive…), paramètres restants triés, slash final coupé, minuscules.

```text
https://WWW.RaceDepartment.com/downloads/silvia.1234/?utm_source=discord#reviews
→ racedepartment.com/downloads/silvia.1234
```

Le résultat est stocké dans la colonne indexée `Mod.urlKey` : la vérification est une
lecture par index, pas un balayage. Elle n'est **pas** `@unique` — le doublon doit rester
possible. Un lien illisible n'est pas une erreur ici (le champ est en cours de saisie) :
la route répond « aucune correspondance », et c'est la validation du formulaire qui
refusera l'enregistrement.

**Dans le formulaire** ([lib/mods/useDuplicates.ts](lib/mods/useDuplicates.ts)), et
uniquement à la création — à l'édition, la fiche se trouverait elle-même. La recherche par
nom est débouncée (250 ms, à partir de 3 caractères) ; celle du lien part **au blur et au
collage**, pas à la frappe : une URL n'a de sens qu'entière.

**L'aller-retour ne coûte pas la saisie.** « Voir la fiche existante » n'a d'intérêt que si
y aller ne fait pas perdre ce qui est déjà tapé — sinon personne ne clique et la détection
ne sert à rien. Avant de quitter le formulaire, la saisie complète est mise de côté dans le
`sessionStorage` de l'onglet ([lib/mods/draft.ts](lib/mods/draft.ts)), relue avec un schéma
Zod parce que rien ne garantit ce qu'on retrouve dans un stockage navigateur. Le lien porte
`?brouillon=1`, que la fiche lit côté serveur pour afficher « Reprendre ma fiche ». Au
retour, les champs sont repeuplés **dès l'initialisation de l'état**, pas dans un effet :
pas de formulaire vide qui se remplirait après coup.

### Catalogue

`GET /api/mods` sert la grille. Tous les paramètres sont optionnels et se combinent :

| Paramètre | Valeurs |
| --- | --- |
| `tags` | `drift,jdm` — combinés en **ET** |
| `type` | `CAR` / `TRACK` (absent = tous) |
| `search` | fragment du nom, insensible à la casse |
| `sort` | `date` (défaut) / `votes` |
| `page` | 1-indexée, 24 fiches par page |

**Un seul analyseur pour deux URL.** [lib/mods/query.ts](lib/mods/query.ts) définit la
requête catalogue — valeurs acceptées, valeurs par défaut, `parseModQuery` et sa réciproque
— et les deux côtés s'en servent : la route lit l'URL de la requête, la page lit la sienne.
Un filtre écrit dans `/catalogue?…` part donc tel quel dans l'appel API, et une valeur
bricolée à la main retombe des deux côtés sur la même valeur par défaut : une URL malformée
affiche un catalogue, jamais une erreur.

**L'URL est la seule source de vérité** des filtres : la sélection survit à un
rechargement, se partage par lien, et une pastille cliquée sur une fiche y mène
directement. Tout changement de filtre ramène en page 1 — rester en page 4 après avoir
coché un tag afficherait une page vide alors que des résultats existent.

**Compteurs et total** viennent d'un seul `groupBy` par type, calculé en ignorant le type
sélectionné mais en tenant compte de la recherche et des tags : « Circuits · 0 » doit
rester lisible pendant qu'on regarde les véhicules.

**La recherche** part en `ILIKE '%…%'`, servi par l'index trigram. La saisie passe d'abord
par `escapeLikeWildcards` ([lib/mods/like.ts](lib/mods/like.ts)) : Prisma insère la valeur
telle quelle entre ses deux `%`, donc sans échappement taper `%` ramènerait tout le
catalogue, et `silvia_s15` ne trouverait pas la fiche qui porte exactement ce nom. C'est
une recherche de **filtrage**, à ne pas confondre avec `GET /api/mods/search`, qui répond à
une autre question par une similarité classée.

**Les deux tris se terminent par `{ id: "desc" }`.** Ce n'est pas décoratif : deux fiches
créées dans la même milliseconde s'échangeraient d'une page à l'autre, et la pagination par
décalage en sauterait une tout en en montrant une autre deux fois.

**Côté interface**, [lib/mods/useCatalogue.ts](lib/mods/useCatalogue.ts) fait une requête
par état de filtre, annulée dès que l'état change — sans quoi une réponse lente partie sur
`drift` pourrait arriver après celle partie sur `drift + jdm` et réafficher la liste large
par-dessus l'étroite. `isLoading` n'y est pas un état à part : la réponse retenue porte la
requête à laquelle elle répond, et charger, c'est « la dernière réponse ne répond pas à la
requête courante ». La réponse précédente reste affichée, estompée, pendant que la suivante
arrive.

### Soirées, votes et places

#### Engager

Une soirée accueille **autant de véhicules et de circuits qu'on veut** : engager reste sans
limite, et n'importe quel membre le peut, pas seulement l'auteur de la fiche. C'est le vote
qui est contingenté, et c'est lui qui trie — si chacun pouvait voter pour tout, trente
voitures ressortiraient trente fois à égalité.

Seul un **admin** crée une soirée. Il n'y a pas de colonne « en cours » : l'état se déduit
de la date, et une colonne à maintenir se serait désynchronisée dès la première soirée
passée sans que personne ne la bascule. La soirée en cours est la prochaine à venir pour le
serveur du membre (`currentSoiree`, [lib/soirees/current.ts](lib/soirees/current.ts)).

#### Voter : deux réserves, deux nombres de places

Par membre et par soirée, dans [lib/soirees/quota.ts](lib/soirees/quota.ts) :

| Type | Votes par membre | Mods retenus à la fin |
| --- | --- | --- |
| Véhicules | 8 (`VOTE_QUOTA.CAR`) | les 8 plus votés (`RETAINED_COUNT.CAR`) |
| Circuits | 3 (`VOTE_QUOTA.TRACK`) | le plus voté (`RETAINED_COUNT.TRACK`) |

Les deux côtés ne se ressemblent pas, et c'est voulu. Une soirée se joue avec une **grille**
de voitures : chacun compose la sienne, la grille du soir est la somme des préférences. On
ne roule en revanche que sur **un** circuit : les trois votes servent à dire « l'un de ces
trois me va », pour qu'un second choix largement partagé l'emporte sur un premier choix
isolé.

Ce sont des constantes, pas des réglages d'`AppConfig` : les règles du jeu du groupe, pas un
paramètre d'exploitation comme la taille des uploads.

Un mod sans le moindre vote n'est **jamais** retenu, même quand la soirée compte moins
d'engagements que de places : « les 8 véhicules les plus votés » ne veut pas dire « les 8
premiers de la liste ».

**Les votes s'empilent.** Un membre peut placer plusieurs voix sur le même mod, dans la
limite de sa réserve — c'est ce qui permet de pousser un choix plutôt que de simplement le
cocher. Une ligne `Vote` par voix placée : le classement se trie **en base**, et Prisma ne
sait ordonner une relation que par `_count`, jamais par la somme d'une colonne. Une ligne
par vote garde donc intacts le tri du soir, celui du catalogue et tous les comptages, au
prix de quelques lignes de plus dans une table qui en compte peu.

Ce qui n'a plus d'unicité n'a plus d'idempotence : deux POST identiques écrivent deux
votes, et c'est le comportement voulu — « voter encore » est une action à part entière. Le
`DELETE` retire la dernière voix placée, pas toutes.

**Le refus, côté serveur.** `castVote` ([lib/soirees/vote.ts](lib/soirees/vote.ts)) porte
la règle pour les deux routes de vote — celle du catalogue et celle de la page soirée
écrivent la même ligne, elles doivent compter la même chose. Elle compte les votes déjà
placés par ce membre, dans cette soirée, **sur ce type**, et refuse le vote de trop en
**409** avec une phrase qui dit quoi faire.

Le comptage et l'écriture tiennent dans une transaction ouverte par un verrou consultatif
`pg_advisory_xact_lock`, haché sur `membre : soirée : type`. Sans lui, deux votes partis en
même temps se comptent l'un l'autre comme absents, passent tous les deux le contrôle, et le
membre place un neuvième véhicule. Le verrou ne gêne personne d'autre : deux membres, ou le
même sur l'autre type, ne hachent pas la même clé.

#### Les ex æquo, tirés au sort à la fermeture

Les places retenues tombent souvent au milieu d'une égalité : quatre véhicules à deux voix
pour les deux dernières places. Départager par ordre d'engagement, comme le classement le
faisait, revenait à donner les places à celui qui avait cliqué le premier, des heures avant
que le vote ne dise quoi que ce soit. **À voix égales, c'est le sort qui tranche** — et
seulement entre égaux : dans l'exemple, deux des quatre mods à deux voix passent, et les
mods à une voix restent derrière quel que soit leur tirage.

Le tirage a lieu **à la fermeture du vote**, pas à l'engagement : tirer à l'engagement
reviendrait à connaître le vainqueur d'une égalité avant le premier vote. Tant que le vote
est ouvert, `SoireeMod.tieBreak` vaut `NULL` et le classement affiché n'est qu'une
projection ; ses ex æquo s'y rangent par ordre d'engagement — un ordre d'attente, qui ne
décide de rien, et la page le dit sous la barre quand l'égalité tombe pile à la coupe.

`drawTieBreaks` ([lib/soirees/tie-break.ts](lib/soirees/tie-break.ts)) écrit le tirage en
tête de chaque lecture de classement : un seul `UPDATE`, une valeur `random()` par ligne,
sous condition que le vote soit fermé et que le tirage n'ait pas déjà eu lieu. C'est donc la
première lecture qui suit la fermeture qui tire, et **une seule fois** — deux lectures
simultanées ne tirent pas deux fois, la seconde attend les lignes verrouillées puis ne
trouve plus rien à `NULL`. Pas de tâche planifiée : le vote ferme 30 min avant une heure
quelconque, un cron quotidien ne serait jamais à l'heure.

Rejouer le tirage à chaque affichage serait le vrai défaut : la fermeture du vote est
exactement l'instant où s'ouvre le retrait des fichiers retenus, et la liste changerait de
mods pendant que le groupe télécharge. La valeur est donc en base, et c'est elle que lisent
les deux tris — celui de PostgreSQL (`RANKING_ORDER`) et celui de la page, qui reclasse en
direct sur les votes optimistes (`rankSection`). Les deux retiennent exactement les mêmes
mods.

Le tirage appartient à l'engagement, donc à la soirée : un mod malchanceux un soir repart
avec une autre chance le suivant.

#### Les trois phases

Le vote ne peut pas rester ouvert jusqu'au départ — il faut le temps d'installer ce qui
sort. Trois moments, dans [lib/soirees/phase.ts](lib/soirees/phase.ts) :

| Phase | Quand | Ce qui est possible |
| --- | --- | --- |
| `OPEN` | jusqu'à T−30 min | voter, engager, retirer un engagement |
| `LOCKED` | T−30 min → T+2 h | télécharger les mods retenus |
| `OVER` | après T+2 h | rien — la soirée se relit |

Un seul basculement, pas deux réglages qui pourraient se croiser : **ce qui n'est plus
votable est téléchargeable**. Et le retrait dure deux heures après le départ, pour le
retardataire et pour celui dont l'installation a raté.

À ne pas confondre avec « la soirée en cours », qui se compte en **jours** : la soirée de ce
soir le reste jusqu'au lendemain, alors que son vote a fermé à 20 h 30. Deux bornes
différentes, deux questions différentes.

Le serveur applique ces bornes partout où l'on écrit : les deux routes de vote (POST **et**
DELETE — retirer un vote après la fermeture déplacerait le classement autant qu'en ajouter
un), l'engagement, et le désengagement. Ce dernier fait exception pour les admins : la
modération doit pouvoir faire disparaître un contenu à n'importe quelle heure.

Côté page, la soirée porte une horloge : `now` descend du rendu serveur — sans quoi le
premier rendu du navigateur différerait — puis la page prend le relais toutes les 15 s. La
bascule se voit donc sans rechargement.

#### Le retrait des mods retenus

Un bouton, et les 8 véhicules + le circuit partent l'un après l'autre
([components/SoireeDownloadPanel.tsx](components/SoireeDownloadPanel.tsx)).

Pas d'archive construite par le serveur : `Mod.fileUrl` est l'URL publique de l'objet R2, et
le navigateur va la chercher directement — comme au dépôt, le fichier ne transite jamais par
l'application. Un `.zip` de neuf mods aurait fait passer jusqu'à 1 Go par fichier dans une
fonction Vercel qui plafonne bien en dessous, en temps comme en volume, pour un budget
d'hébergement nul. Le « d'un coup » se joue donc côté navigateur — d'où deux détails qui n'en
sont pas : les clics sont **espacés** (lancés dans la même boucle, les navigateurs n'en
retiennent qu'un), et le panneau prévient que le navigateur demandera l'autorisation de
télécharger plusieurs fichiers.

Les mods retenus dont le fichier manque ou a expiré ne sont pas passés sous silence : ils
sont listés avec leur lien externe. Une soirée où trois voitures sur huit n'ont pas été
déposées doit se voir avant le départ, pas se découvrir au moment de rouler. Le dépôt reste
d'ailleurs ouvert pendant toute la fenêtre — c'est justement le moment où l'on s'aperçoit
qu'un fichier manque.

#### L'historique

L'historique ne montre pas le haut d'un classement mêlé mais **ce que chaque soirée a
retenu** : les véhicules dans `pastSoireeInclude`, le circuit par une requête à part
(`retainedTracks`, [lib/soirees/past.ts](lib/soirees/past.ts)). Prisma ne sait pas prendre
« les huit premiers véhicules **et** le premier circuit » dans une seule relation, et un
`take` sur le classement mêlé aurait affiché une soirée sans son circuit — le seul mod dont
il n'y en a qu'un. Chaque fiche affiche de son côté les soirées où elle a tourné
([lib/mods/played.ts](lib/mods/played.ts)).

### Fichiers de mod

Le lien externe reste la méthode privilégiée. L'upload sert aux mods difficiles à héberger
ailleurs, et il est **temporaire par construction** (cahier §2.7).

**Formats acceptés** : `.zip`, `.rar`, `.7z`. **Plafond par fichier** : réglable de 20 Mo à
1 Go depuis l'espace admin (1 Go par défaut).

**Le dépôt suppose un engagement.** Un fichier ne peut être déposé que sur un mod **engagé
dans la soirée en cours** du serveur du membre. La raison tient au §2.7 : le fichier ne vit
que 24 h. Le déposer sur une fiche que personne n'a mise au programme, c'est le voir expirer
sans avoir servi. La route refuse en **409** — pas 403 : le membre a bien le droit, c'est la
fiche qui n'est pas dans l'état voulu, et un clic sur « Engager » le répare. C'est aussi
cette règle qui rend tenable le plafond de 1 Go : ce n'est jamais tout le catalogue qui pèse
à la fois, mais la poignée de mods d'une soirée, et pendant 24 h au plus.

**Le trajet du fichier.** `POST /api/mods/[id]/upload` valide, réserve la place et renvoie
une **URL pré-signée** ; le navigateur écrit directement dans R2 ; `PUT` confirme. Le
fichier ne transite jamais par une fonction Vercel.

À la confirmation, le fichier déposé est **relu** : taille réelle, et surtout **signature des
premiers octets** ([lib/mods/archive.ts](lib/mods/archive.ts)). L'extension et le type MIME
viennent tous deux du client — renommer `charge.exe` en `mod.zip` suffit à les faire mentir
les deux. Les premiers octets, eux, ne se renomment pas. Un fichier qui n'est pas l'archive
qu'il annonce est retiré du bucket et refusé en **415**.

**Le quota global du bucket.** Le plafond par fichier borne *un* envoi, pas leur somme.
`MAX_TOTAL_STORAGE_BYTES` (10 Go) borne ce que le bucket porte en tout, pour rester dans le
palier gratuit de Cloudflare. L'occupation est mesurée **sur le bucket** (`ListObjectsV2`),
pas déduite de la base : c'est ce que Cloudflare facture, et ça comprend ce que la base
ignore — les objets d'envois abandonnés, ou qu'un retrait raté a laissés.

**La réservation.** Un objet n'apparaît dans le bucket qu'une fois l'envoi *terminé* —
jusqu'à une heure pour 1 Go. Pendant ce temps un envoi en vol ne pèse rien de mesurable, et
deux membres qui démarrent ensemble passeraient tous les deux le même contrôle. D'où
`ModFileReservation` : une ligne posée à la signature, retirée à la confirmation, comptée
dans le total tant que l'envoi est en vol. Les lignes périmées sont ignorées à la lecture et
ramassées par le balayage horaire. La réservation lit puis écrit sans verrou : deux demandes
rigoureusement simultanées peuvent réserver toutes les deux. C'est assumé — la fenêtre se
compte en millisecondes et le dépassement possible est borné par un fichier, là où sans
réservation du tout elle durait une heure.

Quand la place manque, la route refuse en **507** avec un message qui dit combien il reste et
que ça se libère tout seul.

**L'expiration.** `sweepExpiredModFiles` ([lib/mods/expired-files.ts](lib/mods/expired-files.ts))
cherche les fiches dont `fileUploadedAt` dépasse 24 h et dont `fileUrl` est encore
renseigné, retire l'objet de R2, **puis** vide les deux colonnes. L'ordre n'est pas
indifférent : vider `fileUrl` d'abord laisserait, si le retrait échoue, un objet que plus
rien ne désigne — donc introuvable au balayage suivant, et téléchargeable par qui en a gardé
l'URL. En cas d'échec, la fiche est laissée en l'état et repassera au tour suivant.

Le même balayage emporte les fichiers des mods **non retenus** dès qu'une soirée est
tranchée (`sweepUnretainedModFiles`, [lib/soirees/closing.ts](lib/soirees/closing.ts)) :
sept voitures sur quinze ne serviront pas, et elles occupent le bucket pour rien pendant que
le groupe télécharge les autres.

Entre l'échéance et le balayage il s'écoule jusqu'à une heure. Pendant ce temps `fileUrl`
est encore renseigné, mais le panneau affiche « EXPIRÉ », ne propose plus le téléchargement,
et rouvre le dépôt.

**Dans tous les cas, la fiche ne bouge pas** : nom, lien, description, tags, votes,
historique. Vider le bucket fait disparaître des fichiers, jamais du catalogue.

### Images d'aperçu

Bucket Supabase Storage `mod-images`, en **public** : `Mod.imageUrl` stocke une URL
directement affichable, sans signature à renouveler.

L'upload passe toujours par `POST /api/uploads/mod-image`, côté serveur, avec la clé secrète
`sb_secret_…` — elle ne doit jamais atteindre le navigateur. La route vérifie la session, le
type MIME et la taille, puis renvoie l'URL publique. `POST /api/mods` refuse toute
`imageUrl` qui ne vient pas de ce bucket.

**Compression à l'upload** ([lib/mods/image-processing.ts](lib/mods/image-processing.ts)) :
JPG, PNG et WebP acceptés en entrée, réduction à 1600 px sur le plus grand côté, WebP
qualité 80, métadonnées supprimées. Sur une photo de 2048×2048, ~79 % d'octets en moins sans
différence visible — les deux endroits où l'image s'affiche sont une vignette de 52 px et
une bande de 700 px au plus. L'orientation EXIF est appliquée **avant** que les métadonnées
soient retirées, sinon les photos de téléphone ressortent couchées. Si le ré-encodage pèse
plus lourd que l'original (PNG déjà minuscule, WebP déjà optimisé), l'original est conservé ;
le JPEG fait exception et reste toujours normalisé, à cause de l'EXIF.

**Le nettoyage des orphelines.** Une image est déposée *avant* que la fiche existe. Deux
mécanismes évitent qu'elle reste pour rien : la **suppression immédiate** quand le formulaire
remplace ou retire une image déjà envoyée (`DELETE /api/uploads/mod-image`, qui refuse en 409
toute image déjà référencée par une fiche), et un **balayage de rattrapage** qui liste le
bucket, soustrait les `Mod.imageUrl` connus et supprime le reste au-delà d'un délai de grâce
de 6 h — ce délai protège les formulaires encore ouverts, et le balayage rattrape l'onglet
fermé sans publier, cas qu'aucun appel client ne peut couvrir.

### Espace admin

**Le garde de rôle** est appelé par chaque route — `requireAdmin`
([lib/admin/guard.ts](lib/admin/guard.ts)) — et non porté par `proxy.ts` : la documentation
de `proxy` prévient qu'il ne doit pas dépendre de modules partagés, il est optimisé pour être
déployé sur le CDN, loin de la base, et c'est en base que vit le rôle.

```ts
const guard = await requireAdmin();
if (!guard.ok) return guard.response;   // 401 si déconnecté, 403 sinon
guard.actor;                            // { id, role }
```

[app/admin/layout.tsx](app/admin/layout.tsx) fait la même vérification côté écrans et renvoie
un non-admin **au catalogue**, pas à la page de connexion : il est bien connecté, c'est cette
section-là qui ne le concerne pas. Une page ajoutée sous `/admin` est donc protégée sans que
personne n'ait à y penser. L'onglet « Admin » de l'en-tête n'apparaît que pour un admin, via
`GET /api/me` — une route volontairement hors de `/api/admin/*`, qui répond
`{ isAdmin: false }` plutôt qu'un 403. Masquer un lien ne protège rien ; ce sont le layout et
les gardes qui refusent l'accès.

**Ce que l'écran permet** : modérer les fiches et les tags, supprimer une soirée, lire le
journal, voir les membres et par quel serveur ils sont entrés, ouvrir ou fermer l'accès à un
serveur Discord et régler son webhook, lire l'occupation du bucket et le vider, régler la
taille maximale des uploads.

**Le journal des suppressions.** Une suppression est irréversible et ne laisse rien derrière
elle ; sans `DeletionLog`, « qui a effacé la fiche qu'on cherche ? » n'aurait aucune réponse.
Trois choix s'y lisent :

- **le nom est recopié**, pas référencé — la ligne effacée ne peut plus le donner, et
  `targetId` ne pointe donc sur rien : c'est ce qui rattache l'entrée à un lien mort partagé
  ailleurs (« /mods/xyz renvoie 404 » : le journal dit pourquoi) ;
- **les suppressions d'un auteur sur sa propre fiche y figurent aussi**, marquées
  `asAdmin: false`. Un journal qui n'en montrerait que la moitié n'expliquerait pas l'autre ;
- **l'écriture du journal n'échoue jamais bruyamment** : le contenu est déjà parti, une trace
  manquante ne doit pas ressortir en 500.

**Les réglages** vivent dans une table clé/valeur `AppConfig` : un réglage de plus ne doit pas
coûter une migration. La valeur est stockée en texte, et c'est
[lib/admin/settings.ts](lib/admin/settings.ts) qui sait la lire et porte les bornes. Une clé
absente n'est pas une anomalie — la table ne contient que ce que quelqu'un a réellement
changé, et le code retombe sur sa valeur par défaut ; une valeur devenue illisible est
traitée pareil, plutôt que de faire échouer un upload sur un réglage cassé. Le plafond porte
sur le **fichier du mod**, pas sur l'image d'aperçu, qui garde sa limite en dur : elle est
ré-encodée avant stockage, sa borne est celle de ce que `sharp` doit accepter de lire.

**Le vidage forcé.** `DELETE /api/admin/storage` vide le bucket entièrement, sans condition
d'âge, et remet à zéro les `fileUrl`. C'est le levier de secours : quota atteint et pas envie
d'attendre, ou tâche planifiée jamais mise en place. Il porte sur le **bucket**, pas sur les
fiches — les objets abandonnés entre la signature d'une URL et sa confirmation n'apparaissent
dans aucune colonne, et ce sont eux qu'une reprise en main a le plus besoin d'emporter. Le
bouton demande confirmation en deux temps, sans `window.confirm` : le premier clic transforme
le bouton en une phrase qui dit ce qui va disparaître, le second exécute.

### Notifications Discord

Le groupe vivait sur des liens éparpillés dans Discord, et tout a été rapatrié ici. La
notification est le **chemin de retour** — le salon reste l'endroit où l'on *apprend* qu'il se
passe quelque chose, sans redevenir celui où on en discute. Trois annonces : une soirée
programmée, une soirée annulée, un mod proposé.

L'annulation n'est pas dans le backlog, qui ne parle que de la création. Elle y a pourtant
plus sa place encore : quelqu'un a peut-être déjà bloqué sa soirée, et une soirée qui
disparaît sans un mot se découvre en rouvrant une page vide. Elle ne part que pour une soirée
**qui n'a pas encore commencé**, et elle est la seule des trois **sans lien** : la page a
disparu avec la soirée, et un titre cliquable qui mène à un 404 est pire que pas de lien.

**Un webhook, pas un bot** : un bot demanderait une application Discord, un jeton à faire
tourner et un processus qui écoute. Il n'y a rien à écouter — l'application parle, Discord se
contente de l'afficher.

Trois modules, trois responsabilités : [lib/discord/webhook.ts](lib/discord/webhook.ts) le
transport (il ne sait qu'envoyer et **ne lève jamais** — la soirée ou la fiche est déjà écrite
quand il part, un salon injoignable n'a pas à ressortir en 500 chez le membre ; délai de garde
de 5 s), [lib/discord/notify.ts](lib/discord/notify.ts) ce que les messages racontent,
[lib/admin/guilds.ts](lib/admin/guilds.ts) à quel salon les envoyer.

**Après la réponse, pas pendant.** Les routes de création appellent leur notification dans un
`after()` : le membre voit sa fiche ou sa soirée sans attendre Discord, et l'envoi survit
quand même à la fin de la requête, y compris en serverless.

**Rien de ce qui part ne peut mentionner personne.** Le contenu vient de champs saisis par les
membres, et un webhook a le droit de réveiller tout un serveur : chaque envoi porte
`allowed_mentions: { parse: [] }`. Un `@everyone` dans un nom de fiche s'affiche, et ne
notifie rien.

**Le lien du message** est fabriqué à partir de l'hôte par lequel la requête vient d'entrer,
pas d'une variable d'environnement de plus : c'est exactement l'adresse que le membre a sous
les yeux. Si elle est illisible, le message part sans lien plutôt que pas du tout.

**Un salon par serveur.** Depuis que plusieurs serveurs ont accès, un webhook unique voudrait
dire que le salon d'un groupe reçoit ce que fait l'autre — alors qu'ils ne se croisent nulle
part ailleurs. `AuthorizedGuild` porte donc `webhookUrl` (nul par défaut : ouvrir l'accès à un
serveur ne doit pas se mettre à écrire dans un salon dont personne n'a donné l'adresse) et
`notify`, l'interrupteur, distinct de l'URL — taire un groupe quelques semaines ne doit pas
coûter son adresse, qu'il faudrait retrouver ensuite.

| Annonce | Serveur visé | Pourquoi |
| --- | --- | --- |
| Soirée créée | celui de la soirée | Elle lui appartient déjà — un admin peut en programmer une pour un groupe dont il n'est pas. |
| Soirée annulée | celui de la soirée | Même serveur, message inverse. Il dit ce qu'elle emportait, et rappelle que les fiches restent au catalogue. |
| Mod proposé | celui de l'auteur | Un groupe est prévenu de ce que **les siens** proposent. Le catalogue reste commun : les autres verront la fiche, sans avoir été réveillés pour une proposition de gens qu'ils ne croiseront jamais en soirée. |

**Le webhook est un secret** — qui l'a peut écrire dans le salon. Trois conséquences : il **ne
ressort jamais du serveur** (l'API n'en donne qu'une forme tronquée, assez pour vérifier
lequel c'est, jamais assez pour le recopier — d'où un champ de saisie qui part toujours vide :
on ne *modifie* pas un webhook, on en *pose un nouveau*) ; **l'URL est validée contre Discord**
à l'entrée comme juste avant l'envoi, sans quoi l'espace admin deviendrait un moyen de faire
poster le serveur vers n'importe quelle adresse, avec le contenu des fiches dedans ; et il se
renseigne **à deux moments**, à l'ouverture de l'accès ou plus tard, parce que c'est rarement
au même instant qu'on a l'identifiant du serveur et l'URL du webhook sous la main.

### Tâches planifiées

| Quoi | Où | Fréquence |
| --- | --- | --- |
| Fichiers expirés + réservations + mods non retenus | `pg_cron` → `/api/maintenance/expired-files` | horaire |
| Idem, en filet | `vercel.json` | quotidien, 5 h |
| Images orphelines | `vercel.json` | quotidien, 4 h |
| Tirage au sort des ex æquo | à la première lecture après fermeture | — |

Les deux routes de maintenance exigent `Authorization: Bearer $CRON_SECRET` et refusent de
tourner si le secret n'est pas défini. En local, on les appelle à la main avec le même
en-tête.

**Pourquoi `pg_cron` et pas seulement Vercel** : le cahier §2.7 demande *plusieurs passages
par jour* pour que la fenêtre réelle soit « 24 h » et non « 24 h + la période du job », or les
crons Vercel sont limités à un déclenchement quotidien sur le plan Hobby. `pg_cron` tourne à
l'heure, gratuitement. Le cron Vercel reste comme filet : tant que `pg_cron` n'est pas en
place, les fichiers s'effacent quand même — avec une fenêtre de 24 à 48 h, ce qui vaut mieux
que jamais.

**Pourquoi `pg_net` appelle l'application, pas Cloudflare.** Le cahier proposait que `pg_net`
s'adresse directement à l'API R2. Supprimer un objet R2 demande une signature AWS SigV4 — une
chaîne de HMAC-SHA256 à écrire en plpgsql, et surtout les identifiants Cloudflare recopiés
dans la base. La base appelle donc la route de maintenance, qui a déjà le SDK et les clés : les
identifiants R2 ne vivent qu'à un seul endroit. L'URL de l'application et le `CRON_SECRET`
sont rangés dans **Supabase Vault**, pas en clair dans la définition du job : `cron.job` est
une table lisible, et ce secret vaut droit de déclencher la maintenance.

---

## Déploiement

Vercel, branche `main`. Reporter toutes les variables de `.env.local.example` dans les
réglages du projet, et ajouter l'URL de production aux redirections OAuth de l'application
Discord (`https://<domaine>/api/auth/callback/discord`).

`vercel.json` déclare les deux crons quotidiens. Les migrations s'appliquent avec
`npx prisma migrate deploy` (sur `DIRECT_URL`).

Le client Prisma est instancié **paresseusement et mémorisé** ([lib/prisma.ts](lib/prisma.ts)) :
`next build` importe les route handlers pour les analyser, et l'absence de `DATABASE_URL` au
moment du build ne doit pas faire échouer la compilation — l'erreur doit tomber à la première
requête. La mémorisation, elle, n'est pas un confort : sans elle, chaque accès de propriété
ouvrirait son propre pool, jamais refermé, ce qui saturait le pooler Supabase pendant le
build. Le pool est plafonné à 5 connexions par instance.

---

## Conventions du code

- **Le code et l'interface sont en français.** Les commentaires expliquent *pourquoi*, pas
  *quoi* — ils portent les décisions et ce qu'on a écarté. C'est la mémoire du projet : ce
  document en est le résumé, le code en est le détail.
- **Les règles métier vivent dans `lib/`**, jamais dans un composant ni dupliquées entre deux
  routes. Un quota, une phase, une permission s'écrivent une fois.
- **Le serveur ne fait jamais confiance au client** : les bornes de phase, les quotas, les
  rôles et les formats de fichier sont vérifiés côté serveur, même quand l'interface les
  applique déjà. Un bouton éteint est un confort, pas une protection.
- **Les messages d'erreur disent quoi faire.** « Quota atteint » n'aide personne ; « tes 8
  votes véhicules sont placés, retires-en un pour voter ailleurs » si.
- **Les secrets ne sortent pas du serveur** : clé Supabase, identifiants R2, webhooks Discord.
- Les traces d'un contenu supprimé survivent au contenu (journal des suppressions, fil des
  contributions) — c'est la seule façon de répondre à « qu'est-ce qui s'est passé ? ».
