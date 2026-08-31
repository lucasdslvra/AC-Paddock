import { auth } from "@/auth";
import { recordDeletion } from "@/lib/admin/deletion-log";
import {
  diffMod,
  MOD_SNAPSHOT_SELECT,
  recordContributions,
  toModSnapshot,
} from "@/lib/mods/contributions";
import { canDeleteMod } from "@/lib/mods/permissions";
import { buildModUpdateData, modPatchSchema, toFieldErrors } from "@/lib/mods/schema";
import { modInclude, serializeMod } from "@/lib/mods/serialize";
import { buildTagReplaceWrite } from "@/lib/mods/tags-store";
import { prisma } from "@/lib/prisma";
import { upsertSessionUser } from "@/lib/session-user";
import { currentSoiree } from "@/lib/soirees/current";
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

  const soiree = await currentSoiree();

  try {
    // L'état d'avant, et pas seulement l'image : c'est de sa comparaison avec l'état
    // d'après que sort le fil des contributions de la fiche (cahier §2.2). Le comparer
    // plutôt que lire le corps de la requête évite d'inscrire une correction là où le
    // formulaire a simplement renvoyé les champs inchangés.
    const [existing, member] = await Promise.all([
      prisma.mod.findUnique({ where: { id }, select: MOD_SNAPSHOT_SELECT }),
      // Corriger la fiche d'un autre est souvent la première écriture d'un membre : sa
      // ligne `User` peut ne pas exister encore, et c'est elle que signe le fil.
      upsertSessionUser(session.user),
    ]);
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
      include: modInclude(session.user.id, soiree),
    });

    // Cahier §2.2 — ce que cette édition a changé, inscrit au fil de la fiche. Après
    // l'écriture : une mise à jour refusée ne doit pas laisser la trace d'une
    // correction qui n'a pas eu lieu.
    const changes = diffMod(toModSnapshot(existing), toModSnapshot(mod));
    await recordContributions(mod.id, member.id, changes);

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

    return Response.json(serializeMod(mod, soiree?.id ?? null));
  } catch (error) {
    console.error(`PATCH /api/mods/${id}`, error);
    return Response.json({ error: "La fiche n'a pas pu être enregistrée." }, { status: 500 });
  }
}

/**
 * US-B4 — suppression d'une fiche, réservée à son auteur ou à un admin.
 * Ses associations `ModTag` (US-C1) et ses `Vote` (US-F1) partent avec elle, via le
 * `onDelete: Cascade` posé sur leurs relations. Les tags eux-mêmes survivent : ils
 * appartiennent au vocabulaire commun, pas à la fiche. `SoireeMod` (US-G2) suit le
 * même modèle.
 *
 * US-K2 — l'opération laisse une entrée au journal des suppressions : c'est la seule
 * trace qui restera d'une fiche effacée.
 */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/mods/[id]">) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Connexion requise." }, { status: 401 });
  }

  const { id } = await ctx.params;

  try {
    const [mod, actor] = await Promise.all([
      // `name` et le compte de votes ne servent qu'au journal (US-K2) : ils sont lus
      // ici parce que, après la suppression, plus rien ne peut les donner.
      prisma.mod.findUnique({
        where: { id },
        select: { authorId: true, imageUrl: true, name: true, _count: { select: { votes: true } } },
      }),
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

    // US-K2 — les suppressions d'un admin sur la fiche d'un autre sont de la
    // modération, et c'est ce que le journal doit rendre lisible. Celles d'un auteur
    // sur sa propre fiche (US-B4) y figurent aussi, marquées comme telles : un journal
    // qui n'en montrerait que la moitié n'expliquerait pas l'autre.
    await recordDeletion({
      target: "MOD",
      targetId: id,
      label: mod.name,
      detail: `${mod._count.votes} vote${mod._count.votes > 1 ? "s" : ""}`,
      asAdmin: actor.id !== mod.authorId,
      actorId: actor.id,
    });

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
