import { requireAdmin } from "@/lib/admin/guard";
import {
  addAuthorizedGuild,
  configuredGuildId,
  GUILD_NAME_MAX_LENGTH,
  isGuildId,
  readGuildAccess,
} from "@/lib/admin/guilds";
import type { ApiGuildAccess } from "@/lib/admin/settings";

/** La liste des serveurs autorisés, pour l'espace admin (US-K1). */
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  try {
    const access: ApiGuildAccess = await readGuildAccess();
    return Response.json(access);
  } catch (error) {
    console.error("GET /api/admin/guilds", error);
    return Response.json(
      { error: "Les serveurs autorisés n'ont pas pu être chargés." },
      { status: 500 },
    );
  }
}

/**
 * Ouvre l'accès à un serveur Discord supplémentaire (cahier §2.1 : l'accès est réservé
 * aux membres du serveur — au pluriel, désormais).
 *
 * Réservé aux admins, comme toute la section : ajouter un serveur, c'est ouvrir la
 * porte à tout un groupe.
 */
export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Corps de requête illisible." }, { status: 400 });
  }

  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return Response.json({ error: "Corps de requête invalide." }, { status: 400 });
  }

  const body = payload as Record<string, unknown>;
  const guildId = typeof body.guildId === "string" ? body.guildId.trim() : "";
  const rawName = typeof body.name === "string" ? body.name.trim() : "";

  if (!isGuildId(guildId)) {
    return Response.json(
      {
        error: "Formulaire invalide.",
        fieldErrors: { guildId: "Un identifiant de serveur est une suite de 17 à 20 chiffres." },
      },
      { status: 400 },
    );
  }

  if (rawName.length > GUILD_NAME_MAX_LENGTH) {
    return Response.json(
      {
        error: "Formulaire invalide.",
        fieldErrors: { name: `Le nom ne doit pas dépasser ${GUILD_NAME_MAX_LENGTH} caractères.` },
      },
      { status: 400 },
    );
  }

  // Le serveur du déploiement autorise déjà l'accès : une ligne de plus ne changerait
  // rien, sinon donner l'illusion qu'on peut le retirer d'ici.
  if (guildId === configuredGuildId()) {
    return Response.json(
      {
        error: "Formulaire invalide.",
        fieldErrors: { guildId: "Ce serveur est déjà celui de la configuration." },
      },
      { status: 409 },
    );
  }

  try {
    await addAuthorizedGuild({
      guildId,
      name: rawName || null,
      actorId: guard.actor.id,
    });
  } catch (error) {
    // `@unique` sur `guildId` : la course entre deux admins finit ici, et le résultat
    // voulu est déjà en base.
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      return Response.json(
        {
          error: "Formulaire invalide.",
          fieldErrors: { guildId: "Ce serveur est déjà autorisé." },
        },
        { status: 409 },
      );
    }
    console.error("POST /api/admin/guilds", error);
    return Response.json({ error: "Ce serveur n'a pas pu être ajouté." }, { status: 500 });
  }

  try {
    // On renvoie la liste relue : le nom affiché peut venir du widget Discord ou d'une
    // connexion passée, pas de ce que le formulaire a envoyé.
    const access: ApiGuildAccess = await readGuildAccess();
    return Response.json(access, { status: 201 });
  } catch (error) {
    console.error("POST /api/admin/guilds (relecture)", error);
    return Response.json({ error: "Serveur ajouté, mais la liste n'a pas pu être relue." }, { status: 500 });
  }
}
