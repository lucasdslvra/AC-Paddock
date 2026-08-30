import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { upsertSessionUser } from "@/lib/session-user";
import { currentSoireeId, startOfToday } from "@/lib/soirees/current";
import { canCreateSoiree } from "@/lib/soirees/permissions";
import { soireeInputSchema, toSoireeFieldErrors } from "@/lib/soirees/schema";
import type { ApiSoireeSummary } from "@/lib/soirees/serialize";

/**
 * Liste des soirées, de la plus proche à la plus ancienne.
 *
 * Le backlog ne demande que `GET /api/soirees/[id]` (US-G4), mais le sélecteur de mods
 * comme l'historique ont besoin de savoir quelles soirées existent — et sans cette
 * route, chacun devrait redécouvrir la règle de « la soirée en cours » de son côté.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Connexion requise." }, { status: 401 });
  }

  try {
    const [soirees, currentId] = await Promise.all([
      prisma.soiree.findMany({
        orderBy: { date: "desc" },
        include: { createdBy: true, _count: { select: { mods: true } } },
      }),
      currentSoireeId(),
    ]);

    const body: ApiSoireeSummary[] = soirees.map((soiree) => ({
      id: soiree.id,
      name: soiree.name,
      date: soiree.date.toISOString(),
      createdBy: {
        discordId: soiree.createdBy.discordId,
        username: soiree.createdBy.username,
        avatarUrl: soiree.createdBy.avatarUrl,
      },
      isCurrent: soiree.id === currentId,
      modCount: soiree._count.mods,
    }));

    return Response.json(body);
  } catch (error) {
    console.error("GET /api/soirees", error);
    return Response.json({ error: "Les soirées n'ont pas pu être chargées." }, { status: 500 });
  }
}

/**
 * US-G1 — création d'une soirée, réservée aux admins (cahier §2.6 : c'est
 * l'admin/organisateur qui crée les soirées).
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Connexion requise." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Corps de requête illisible." }, { status: 400 });
  }

  const parsed = soireeInputSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      { error: "Formulaire invalide.", fieldErrors: toSoireeFieldErrors(parsed.error) },
      { status: 400 },
    );
  }

  // Une soirée dans le passé serait créée déjà archivée : personne ne pourrait y
  // engager quoi que ce soit ni y voter, puisque `currentSoiree` ne regarde que
  // l'avenir. Le seuil est le même qu'elle — le début du jour, pas l'instant présent,
  // pour qu'on puisse programmer une soirée pour ce soir à 21 h en la créant à 22 h.
  if (parsed.data.date < startOfToday()) {
    return Response.json(
      { error: "Formulaire invalide.", fieldErrors: { date: "Cette date est déjà passée." } },
      { status: 400 },
    );
  }

  try {
    // Le rôle n'est pas dans la session : on le relit en base, ce qui évite qu'une
    // session ouverte avant un changement de rôle garde d'anciens droits. L'upsert
    // sert des deux côtés — c'est aussi la ligne `User` que la clé étrangère exige.
    const actor = await upsertSessionUser(session.user);

    if (!canCreateSoiree(actor)) {
      return Response.json(
        { error: "Seuls les admins créent les soirées." },
        { status: 403 },
      );
    }

    const soiree = await prisma.soiree.create({
      data: { name: parsed.data.name ?? null, date: parsed.data.date, createdById: actor.id },
    });

    return Response.json({ id: soiree.id }, { status: 201 });
  } catch (error) {
    console.error("POST /api/soirees", error);
    return Response.json({ error: "La soirée n'a pas pu être créée." }, { status: 500 });
  }
}
