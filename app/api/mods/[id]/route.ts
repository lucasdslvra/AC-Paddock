import { auth } from "@/auth";
import { buildModUpdateData, modPatchSchema, toFieldErrors } from "@/lib/mods/schema";
import { serializeMod } from "@/lib/mods/serialize";
import { prisma } from "@/lib/prisma";
import { deleteModImages, isModImageUrl, modImagePath } from "@/lib/supabase/storage";

/**
 * US-B3 — édition d'une fiche, usage wiki.
 * N'importe quel membre connecté peut modifier n'importe quelle fiche : aucune
 * restriction d'auteur ici (cahier §2.2). L'auteur d'origine n'est jamais touché,
 * il reste affiché sur la fiche quelles que soient les contributions ultérieures.
 */
export async function PATCH(request: Request, ctx: RouteContext<"/api/mods/[id]">) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Connexion requise." }, { status: 401 });
  }

  const { id } = await ctx.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Corps de requête illisible." }, { status: 400 });
  }

  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return Response.json({ error: "Corps de requête invalide." }, { status: 400 });
  }

  const parsed = modPatchSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      { error: "Formulaire invalide.", fieldErrors: toFieldErrors(parsed.error) },
      { status: 400 },
    );
  }

  if (parsed.data.imageUrl && !isModImageUrl(parsed.data.imageUrl)) {
    return Response.json(
      { error: "Formulaire invalide.", fieldErrors: { imageUrl: "Image inconnue : dépose-la via le formulaire." } },
      { status: 400 },
    );
  }

  const data = buildModUpdateData(payload as Record<string, unknown>, parsed.data);

  try {
    const existing = await prisma.mod.findUnique({ where: { id }, select: { imageUrl: true } });
    if (!existing) {
      return Response.json({ error: "Cette fiche n'existe pas." }, { status: 404 });
    }

    const mod = await prisma.mod.update({ where: { id }, data, include: { author: true } });

    // L'ancienne image n'est plus référencée : on la retire du bucket. Si ça échoue,
    // le balayage périodique la ramassera — pas de raison de faire échouer l'édition.
    if (existing.imageUrl && existing.imageUrl !== mod.imageUrl) {
      const path = modImagePath(existing.imageUrl);
      if (path) {
        try {
          await deleteModImages([path]);
        } catch (error) {
          console.error("Suppression de l'ancienne image", error);
        }
      }
    }

    return Response.json(serializeMod(mod));
  } catch (error) {
    console.error(`PATCH /api/mods/${id}`, error);
    return Response.json({ error: "La fiche n'a pas pu être enregistrée." }, { status: 500 });
  }
}
