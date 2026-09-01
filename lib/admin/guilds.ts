import "server-only";
import { fetchGuildWidgetName } from "@/lib/discord";
import { prisma } from "@/lib/prisma";
import type { ApiAuthorizedGuild, ApiGuildAccess } from "./settings";

/**
 * Un identifiant de serveur Discord (snowflake) : 17 à 20 chiffres. Les serveurs créés
 * récemment en ont 19 ; la borne large évite d'avoir à la rouvrir quand Discord
 * franchira le chiffre suivant.
 */
const GUILD_ID_PATTERN = /^\d{17,20}$/;

export const GUILD_NAME_MAX_LENGTH = 60;

export function isGuildId(value: string): boolean {
  return GUILD_ID_PATTERN.test(value);
}

/**
 * « 150348…5849 » — de quoi reconnaître le bon serveur sans afficher l'identifiant en
 * entier. Il n'est pas secret (n'importe quel membre le lit dans Discord), mais l'écran
 * sert à vérifier une configuration, pas à la recopier.
 */
export function maskGuildId(guildId: string): string {
  return guildId.length <= 10 ? guildId : `${guildId.slice(0, 6)}…${guildId.slice(-4)}`;
}

/** Le serveur de la configuration de déploiement, s'il est renseigné. */
export function configuredGuildId(): string | null {
  return process.env.DISCORD_GUILD_ID || null;
}

/**
 * Tous les serveurs qui donnent accès : celui du déploiement et ceux ouverts depuis
 * l'espace admin. C'est la seule autorité sur « ce membre peut-il entrer ? » (cahier
 * §2.1) — `auth.ts` s'y réfère à chaque connexion.
 *
 * Une base injoignable ne ferme pas la porte au serveur d'origine : il vient de
 * l'environnement, et le refuser transformerait une panne de base en panne de
 * connexion. Les serveurs ajoutés, eux, sont bel et bien inconnus tant qu'on ne peut
 * pas les lire — leurs membres devront réessayer.
 */
export async function authorizedGuildIds(): Promise<Set<string>> {
  const ids = new Set<string>();

  const configured = configuredGuildId();
  if (configured) ids.add(configured);

  try {
    const rows = await prisma.authorizedGuild.findMany({ select: { guildId: true } });
    for (const row of rows) ids.add(row.guildId);
  } catch (error) {
    console.error("authorizedGuildIds", error);
  }

  return ids;
}

/**
 * Le panneau « ACCÈS » : le serveur du déploiement d'abord, puis les serveurs ajoutés,
 * du plus ancien au plus récent.
 *
 * Le nom est cherché à trois endroits, dans cet ordre : celui saisi à l'ajout, celui
 * qu'une connexion a rapporté (`User.guildName` — Discord donne toujours le nom au
 * membre lui-même), puis rien. Le widget public n'est pas interrogé ici : il faudrait
 * un appel réseau par serveur à chaque affichage de la page, pour un nom qu'on a déjà
 * la plupart du temps.
 *
 * `viewerGuildId` sert à marquer, dans la liste, le serveur par lequel celui qui
 * regarde est entré : c'est celui que le formulaire de création de soirée propose par
 * défaut, et le seul dont il puisse dire « le tien ».
 */
export async function readGuildAccess(viewerGuildId: string | null = null): Promise<ApiGuildAccess> {
  const configured = configuredGuildId();

  const [rows, seen] = await Promise.all([
    prisma.authorizedGuild.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        guildId: true,
        name: true,
        locked: true,
        addedBy: { select: { username: true } },
      },
    }),
    // Le nom rapporté par la connexion la plus récente de chaque serveur.
    prisma.user.findMany({
      where: { guildId: { not: null }, guildName: { not: null } },
      distinct: ["guildId"],
      orderBy: { lastSeenAt: "desc" },
      select: { guildId: true, guildName: true },
    }),
  ]);

  const seenNames = new Map(seen.map((user) => [user.guildId, user.guildName]));

  const guilds: ApiAuthorizedGuild[] = rows.map((row) => ({
    id: row.id,
    guildId: row.guildId,
    guildIdMasked: maskGuildId(row.guildId),
    name: row.name ?? seenNames.get(row.guildId) ?? null,
    locked: row.locked,
    fromConfig: false,
    addedBy: row.addedBy.username,
    isViewerGuild: row.guildId === viewerGuildId,
  }));

  if (configured) {
    guilds.unshift({
      // Pas de ligne en base : rien à modifier ni à supprimer, d'où l'identifiant nul.
      id: null,
      guildId: configured,
      guildIdMasked: maskGuildId(configured),
      name: seenNames.get(configured) ?? null,
      // Il ne se retire que dans la configuration de déploiement — c'est ce qui rend
      // impossible de se verrouiller dehors depuis cet écran.
      locked: true,
      fromConfig: true,
      addedBy: null,
      isViewerGuild: configured === viewerGuildId,
    });
  }

  return { guilds, configuredGuildId: configured };
}

/**
 * Ouvre l'accès à un serveur. Le nom saisi l'emporte ; sans lui, on tente le widget
 * public de Discord — c'est la seule source de nom accessible sans être membre du
 * serveur, et elle ne répond que si l'admin de ce serveur l'a activée.
 */
export async function addAuthorizedGuild(input: {
  guildId: string;
  name: string | null;
  actorId: string;
}) {
  const name = input.name ?? (await fetchGuildWidgetName(input.guildId));

  return prisma.authorizedGuild.create({
    data: { guildId: input.guildId, name, addedById: input.actorId },
    select: { id: true, guildId: true, name: true, locked: true },
  });
}
