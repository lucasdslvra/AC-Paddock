import { auth } from "@/auth";
import { canDeleteMod } from "@/lib/mods/permissions";
import { buildModUpdateData, modPatchSchema, toFieldErrors } from "@/lib/mods/schema";
import { modInclude, serializeMod } from "@/lib/mods/serialize";
import { buildTagReplaceWrite } from "@/lib/mods/tags-store";
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

    // Même sémantique PATCH que pour les champs scalaires : « tags » absent du corps
    // laisse les tags en place, « tags » présent remplace l'ensemble — un tableau vide
    // les retire donc tous. Le formulaire renvoie toujours la liste complète (US-C1).
    //
    // Résolu après le 404 : l'écriture crée les tags manquants, et une requête sur une
    // fiche inexistante n'a pas à laisser de tags neufs derrière elle.
    const tagWrite =
      "tags" in payload && parsed.data.tags
        ? await buildTagReplaceWrite(parsed.data.tags)
        : undefined;

    const mod = await prisma.mod.update({
      where: { id },
      data: { ...data, ...(tagWrite && { tags: tagWrite }) },
      include: modInclude(session.user.id),
    });

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

/**
 * US-B4 — suppression d'une fiche, réservée à son auteur ou à un admin.
 * Ses associations `ModTag` (US-C1) et ses `Vote` (US-F1) partent avec elle, via le
 * `onDelete: Cascade` posé sur leurs relations. Les tags eux-mêmes survivent : ils
 * appartiennent au vocabulaire commun, pas à la fiche. SessionMod suivra le même
 * modèle (Epic G).
 */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/mods/[id]">) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Connexion requise." }, { status: 401 });
  }

  const { id } = await ctx.params;

  try {
    const [mod, actor] = await Promise.all([
      prisma.mod.findUnique({ where: { id }, select: { authorId: true, imageUrl: true } }),
      // Le rôle n'est pas dans la session : on le relit en base, ce qui évite qu'une
      // session ouverte avant un changement de rôle garde d'anciens droits.
      prisma.user.findUnique({
        where: { discordId: session.user.id },
        select: { id: true, role: true },
      }),
    ]);

    if (!mod) {
      return Response.json({ error: "Cette fiche n'existe pas." }, { status: 404 });
    }

    if (!canDeleteMod(actor, mod)) {
      return Response.json(
        { error: "Seuls l'auteur de la fiche et les admins peuvent la supprimer." },
        { status: 403 },
      );
    }

    await prisma.mod.delete({ where: { id } });

    // Plus aucune fiche ne référence l'image : on la retire du bucket. Un échec ici ne
    // doit pas faire échouer la suppression, le balayage périodique ramassera.
    if (mod.imageUrl) {
      const path = modImagePath(mod.imageUrl);
      if (path) {
        try {
          await deleteModImages([path]);
        } catch (error) {
          console.error("Suppression de l'image de la fiche", error);
        }
      }
    }

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error(`DELETE /api/mods/${id}`, error);
    return Response.json({ error: "La fiche n'a pas pu être supprimée." }, { status: 500 });
  }
}
