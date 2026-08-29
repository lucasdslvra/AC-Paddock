import { auth } from "@/auth";
import { modInputSchema, toFieldErrors } from "@/lib/mods/schema";
import { serializeMod } from "@/lib/mods/serialize";
import { prisma } from "@/lib/prisma";

/**
 * US-B1 — création d'une fiche de mod.
 * Toutes les routes hors login exigent une session valide (cahier §3) : la
 * vérification d'appartenance au serveur Discord a déjà eu lieu au callback
 * d'authentification, une session signée suffit donc ici.
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

  const parsed = modInputSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      { error: "Formulaire invalide.", fieldErrors: toFieldErrors(parsed.error) },
      { status: 400 },
    );
  }

  try {
    // La session porte l'identité Discord, pas un id de ligne User : on
    // crée/rafraîchit l'auteur avant de poser la clé étrangère.
    const author = await prisma.user.upsert({
      where: { discordId: session.user.id },
      update: {
        username: session.user.name ?? undefined,
        avatarUrl: session.user.image ?? null,
      },
      create: {
        discordId: session.user.id,
        username: session.user.name ?? "membre",
        avatarUrl: session.user.image ?? null,
      },
    });

    const mod = await prisma.mod.create({
      data: { ...parsed.data, authorId: author.id },
      include: { author: true },
    });

    return Response.json(serializeMod(mod), { status: 201 });
  } catch (error) {
    console.error("POST /api/mods", error);
    return Response.json({ error: "La fiche n'a pas pu être enregistrée." }, { status: 500 });
  }
}
