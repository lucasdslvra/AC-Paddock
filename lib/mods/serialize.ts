import type {
  ModLinkModel,
  ModModel,
  ModTagModel,
  SoireeModModel,
  TagModel,
  UserModel,
} from "@/lib/generated/prisma/models";
import type { SoireeContext } from "@/lib/soirees/current";
import { NO_GUILD } from "@/lib/soirees/scope";

/**
 * Relations à charger avec une fiche pour pouvoir la sérialiser ou l'afficher.
 * Une seule construction partagée par toutes les lectures (routes API et pages) :
 * ajouter une relation ici la rend disponible partout, et `ModWithRelations` ne peut pas
 * se désynchroniser d'un `include` oublié quelque part.
 *
 * Les tags sortent triés par nom : l'ordre de la table d'association n'a aucun sens
 * pour un lecteur, et un ordre stable évite que les pastilles sautent d'une fiche à
 * l'autre après une édition.
 *
 * Le paramètre est l'identifiant Discord du membre connecté — celui que porte la
 * session, pas l'`id` de sa ligne `User`, qui n'existe pas forcément encore. Le filtre
 * passe donc par la relation : une jointure de plus, mais aucun aller-retour
 * supplémentaire pour savoir si ce membre a déjà voté (US-F1).
 */
export const MOD_VOTE_HISTORY_LENGTH = 7;

export function modInclude(viewerDiscordId: string, soiree: SoireeContext) {
  return {
    author: true,
    tags: { include: { tag: true }, orderBy: { tag: { name: "asc" } } },
    // Le total des votes de la fiche, toutes soirées confondues. Il n'est plus affiché
    // — le compteur d'une carte est celui de la soirée en cours, et il repart de zéro à
    // chaque nouvelle — mais c'est lui que trie `MOD_ORDER_BY.votes` (US-E4) : un tri
    // sur le score du soir mettrait tout le catalogue à égalité hors soirée.
    _count: { select: { votes: true } },
    // Cahier §2.2 — les liens secondaires ajoutés par les membres, dans leur ordre
    // d'ajout : la fiche les affiche à la suite du lien principal, qui reste `url`.
    links: { include: { addedBy: true }, orderBy: { createdAt: "asc" } },
    // US-G2/G3/G4 — les dernières soirées où la fiche a été engagée, la plus récente
    // d'abord. Elles servent deux fois :
    //
    //   · la première est l'engagement dans la soirée en cours, s'il y en a un — c'est
    //     ce qui rend la fiche votable, et rien d'autre ;
    //   · les sept forment l'historique que dessinent les barres de la carte, seul
    //     endroit où se lit encore la popularité d'une fiche.
    //
    // La borne haute est la date de la soirée en cours, pas « les plus récentes » :
    // une soirée programmée dans trois semaines n'a pas eu lieu, ses zéros ne diraient
    // rien. Sans soirée en cours, la borne est maintenant — donc les soirées passées.
    //
    // Le serveur borne l'autre dimension : une fiche est commune à tout le monde, son
    // histoire ne l'est pas. Les barres d'un membre racontent les soirées de son groupe,
    // pas celles d'un autre serveur qui a joué la même voiture.
    soirees: {
      where: {
        soiree: {
          guildId: soiree.guildId ?? NO_GUILD,
          date: { lte: soiree.current?.date ?? new Date() },
        },
      },
      orderBy: { soiree: { date: "desc" } },
      take: MOD_VOTE_HISTORY_LENGTH,
      include: {
        _count: { select: { votes: true } },
        // Deux besoins dans une seule relation, parce que Prisma ne sait pas inclure
        // deux fois la même :
        //
        //   · les votes du membre connecté, sur n'importe laquelle de ces soirées —
        //     c'est `myVotes`, et lui seul dit ce que le « − » a à retirer ;
        //   · **tous** les votes de la soirée en cours, pour savoir *qui* a voté.
        //     Depuis l'empilement, le compte des votes n'est plus le compte des
        //     votants : quatre voix peuvent être celles d'un seul membre, et la fiche
        //     l'annonçait comme « 4 autres membres ». Il faut les lignes pour le dire.
        //
        // La seconde branche ne porte que sur la soirée en cours : les six autres
        // n'affichent qu'une barre, et charger leurs votants coûterait à chaque carte
        // du catalogue ce que personne ne regarde.
        votes: {
          where: soiree.current
            ? {
                OR: [
                  { user: { discordId: viewerDiscordId } },
                  { soireeMod: { soireeId: soiree.current.id } },
                ],
              }
            : { user: { discordId: viewerDiscordId } },
          select: {
            id: true,
            user: { select: { discordId: true, username: true, avatarUrl: true } },
          },
        },
      },
    },
  } as const;
}

/** Une fiche telle que `modInclude` la ramène. */
export type ModWithRelations = ModModel & {
  author: UserModel;
  tags: (ModTagModel & { tag: TagModel })[];
  _count: { votes: number };
  links: (ModLinkModel & { addedBy: UserModel })[];
  /**
   * Les `MOD_VOTE_HISTORY_LENGTH` dernières soirées où la fiche a été engagée, la plus
   * récente d'abord. La soirée en cours y figure en tête si la fiche y est engagée.
   */
  soirees: (SoireeModModel & {
    _count: { votes: number };
    /**
     * Une ligne par vote (voir `modInclude`) : pour la soirée en cours, tous ceux
     * qu'a reçus l'engagement ; pour les précédentes, seulement ceux du membre
     * connecté. C'est le votant attaché à chaque ligne qui distingue les deux.
     */
    votes: { id: string; user: Pick<UserModel, "discordId" | "username" | "avatarUrl"> }[];
  })[];
};

/**
 * US-G3 — ce qu'il faut savoir pour voter depuis une carte ou une fiche : sur quelle
 * ligne le vote s'écrit, et où en est le compte dans la soirée. `null` quand la fiche
 * n'est pas engagée dans la soirée en cours, ou qu'aucune soirée n'est ouverte — le
 * bouton est alors désactivé, avec la raison.
 */
export interface ApiModEngagement {
  soireeModId: string;
  /** Votes de cette fiche **dans la soirée en cours** — pas son total (voir `votes`). */
  votes: number;
  /**
   * Qui a voté ce soir sur cette fiche, du plus gros paquet de voix au plus petit.
   *
   * Une entrée par **membre**, et non par vote : depuis l'empilement, `votes` ci-dessus
   * ne dit plus combien de personnes se cachent derrière le score — un seul membre peut
   * en porter huit. La fiche a besoin des deux comptes pour ne pas transformer quatre
   * voix en quatre votants, et des visages pour les montrer.
   *
   * Le membre connecté y figure comme les autres : c'est à l'affichage de le mettre à
   * part, lui seul sachant que son propre compteur bouge avant le serveur.
   */
  voters: ApiModVoter[];
}

/** Un membre ayant voté pour une fiche ce soir, et le poids de sa pile. */
export interface ApiModVoter {
  discordId: string;
  username: string;
  avatarUrl: string | null;
  /** Combien de votes ce membre a empilés sur cette seule fiche (au moins un). */
  votes: number;
}

/**
 * Un lien secondaire de la fiche (cahier §2.2). Le lien principal, lui, reste le champ
 * `url` : il n'est pas dans cette liste.
 */
export interface ApiModLink {
  id: string;
  /** Intitulé saisi, ou `null` — la fiche affiche alors le domaine du lien. */
  label: string | null;
  url: string;
  /** Pseudo du membre qui l'a ajouté, que la fiche affiche sous le lien. */
  addedBy: string;
}

/** Forme d'un mod telle qu'exposée par l'API (dates sérialisées en ISO). */
export interface ApiMod {
  id: string;
  type: ModModel["type"];
  name: string;
  /**
   * Le lien externe de la fiche, ou `null` : le champ est facultatif (cahier §2.2), et
   * une fiche sans lien est une fiche incomplète — le catalogue la marque comme telle.
   */
  url: string | null;
  description: string | null;
  imageUrl: string | null;
  /**
   * US-H1 — l'URL publique du fichier déposé sur Cloudflare R2, ou `null` si la fiche
   * n'en a pas (ou plus : le fichier saute 24 h après son dépôt, cahier §2.7, et c'est
   * alors cette colonne qui est vidée).
   */
  fileUrl: string | null;
  /** Le moment du dépôt, en ISO. C'est de lui que court le délai de 24 h. */
  fileUploadedAt: string | null;
  /** Noms des tags, sous leur forme normalisée (US-C1). */
  tags: string[];
  /**
   * Nombre total de votes de la fiche, tous membres et toutes soirées confondus.
   * Plus affiché nulle part comme un score — le compteur visible est celui de la
   * soirée en cours — mais c'est la clé du tri « par votes » du catalogue (US-E4).
   */
  votes: number;
  /**
   * US-G4 — les votes reçus lors des dernières soirées où la fiche a été engagée, de
   * la plus ancienne à la plus récente. Ce sont des comptes bruts : c'est l'interface
   * qui en fait des hauteurs de barres, elle seule sait sur quoi les rapporter.
   *
   * Au plus `MOD_VOTE_HISTORY_LENGTH` valeurs, et souvent moins : une fiche jamais
   * engagée n'en a aucune.
   */
  voteHistory: number[];
  /**
   * Combien de votes le membre qui a demandé la fiche a placés sur elle dans la soirée
   * en cours — `0` s'il n'en a mis aucun, ou si elle n'y est pas engagée. Un compte, et
   * non un booléen : la réserve du soir s'empile sur un même mod (`VOTE_QUOTA`).
   */
  myVotes: number;
  /** US-G3 — `null` si la fiche n'est pas engagée dans la soirée en cours. */
  engagement: ApiModEngagement | null;
  /** Cahier §2.2 — les liens alternatifs, dans leur ordre d'ajout. */
  links: ApiModLink[];
  author: { discordId: string; username: string; avatarUrl: string | null };
  createdAt: string;
  updatedAt: string;
}

/**
 * Les lignes de vote d'un engagement, repliées en un votant par membre.
 *
 * L'ordre est celui des piles, la plus haute d'abord, et le pseudo départage les égaux :
 * la fiche n'affiche que les premiers visages, et il vaut mieux que ce soient toujours
 * les mêmes d'un rechargement à l'autre.
 */
function tallyVoters(votes: ModWithRelations["soirees"][number]["votes"]): ApiModVoter[] {
  const byMember = new Map<string, ApiModVoter>();

  for (const { user } of votes) {
    const seen = byMember.get(user.discordId);
    if (seen) {
      seen.votes += 1;
      continue;
    }
    byMember.set(user.discordId, { ...user, votes: 1 });
  }

  return [...byMember.values()].sort(
    (a, b) => b.votes - a.votes || a.username.localeCompare(b.username),
  );
}

export function serializeMod(
  mod: ModWithRelations,
  currentSoireeId: string | null,
  /**
   * L'identifiant Discord du membre pour qui la fiche est sérialisée — le même que
   * celui passé à `modInclude`. C'est lui qui sépare ses votes de ceux des autres dans
   * la liste que ramène la soirée en cours.
   */
  viewerDiscordId: string,
): ApiMod {
  // `soirees` arrive de la plus récente à la plus ancienne, bornée à la soirée en
  // cours : celle-ci ne peut donc être qu'en tête. On compare quand même l'identifiant
  // plutôt que de prendre `[0]` de confiance — une fiche non engagée ce soir a bien une
  // première entrée, mais c'est celle d'une soirée passée.
  const engagement = mod.soirees.find((entry) => entry.soireeId === currentSoireeId);

  return {
    id: mod.id,
    type: mod.type,
    name: mod.name,
    url: mod.url,
    description: mod.description,
    imageUrl: mod.imageUrl,
    fileUrl: mod.fileUrl,
    fileUploadedAt: mod.fileUploadedAt?.toISOString() ?? null,
    // La table d'association ne sert qu'au stockage : l'API n'expose que les noms.
    tags: mod.tags.map(({ tag }) => tag.name),
    votes: mod._count.votes,
    // Les barres se lisent de gauche à droite dans l'ordre du temps : on retourne
    // l'ordre de la base, qui sert d'abord à trouver la soirée en cours.
    voteHistory: mod.soirees.map((entry) => entry._count.votes).reverse(),
    // Les votes de la soirée en cours arrivent tous, votant compris : le compte de ce
    // membre est le nombre de lignes qui portent son identifiant, pas leur total.
    myVotes: engagement?.votes.filter((vote) => vote.user.discordId === viewerDiscordId).length ?? 0,
    engagement: engagement
      ? {
          soireeModId: engagement.id,
          votes: engagement._count.votes,
          voters: tallyVoters(engagement.votes),
        }
      : null,
    links: mod.links.map((link) => ({
      id: link.id,
      label: link.label,
      url: link.url,
      addedBy: link.addedBy.username,
    })),
    author: {
      discordId: mod.author.discordId,
      username: mod.author.username,
      avatarUrl: mod.author.avatarUrl,
    },
    createdAt: mod.createdAt.toISOString(),
    updatedAt: mod.updatedAt.toISOString(),
  };
}
