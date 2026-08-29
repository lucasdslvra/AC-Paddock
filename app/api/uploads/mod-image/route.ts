import { auth } from "@/auth";
import { describeImageProblem, MAX_IMAGE_BYTES } from "@/lib/mods/image";
import { compressModImage } from "@/lib/mods/image-processing";
import { prisma } from "@/lib/prisma";
import { deleteModImages, modImagePath, uploadModImage } from "@/lib/supabase/storage";

/**
 * US-B2 — dépôt d'une image d'aperçu.
 * L'upload est séparé de la création de la fiche : à la création le mod n'existe pas
 * encore, et à l'édition (US-B3) on veut pouvoir remplacer l'image seule. La route
 * renvoie l'URL publique, que l'appelant place ensuite dans `Mod.imageUrl`.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Connexion requise." }, { status: 401 });
  }

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return Response.json({ error: "Requête illisible." }, { status: 400 });
  }

  if (!(file instanceof File)) {
    return Response.json({ error: "Aucun fichier reçu." }, { status: 400 });
  }

  const problem = describeImageProblem(file);
  if (problem) {
    // 413 pour le dépassement de taille, 415 pour un format refusé : ça reste lisible
    // côté client même sans lire le corps de la réponse.
    return Response.json({ error: problem }, { status: file.size > MAX_IMAGE_BYTES ? 413 : 415 });
  }

  const original = Buffer.from(await file.arrayBuffer());

  let compressed;
  try {
    compressed = await compressModImage(original, file.type);
  } catch (error) {
    // sharp refuse un fichier illisible : c'est une erreur de l'appelant, pas du serveur.
    console.error("Compression de l'image", error);
    return Response.json({ error: "Cette image n'a pas pu être lue." }, { status: 400 });
  }

  try {
    const url = await uploadModImage(compressed);
    return Response.json(
      { url, originalBytes: original.byteLength, storedBytes: compressed.data.byteLength },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST /api/uploads/mod-image", error);
    return Response.json({ error: "L'image n'a pas pu être envoyée." }, { status: 500 });
  }
}

/**
 * Suppression d'une image qui n'a jamais été rattachée à une fiche : image remplacée
 * ou retirée dans le formulaire. Une image déjà référencée par un mod est intouchable
 * ici — sinon n'importe quel membre pourrait vider l'aperçu d'une fiche existante.
 */
export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Connexion requise." }, { status: 401 });
  }

  let url: unknown;
  try {
    ({ url } = await request.json());
  } catch {
    return Response.json({ error: "Requête illisible." }, { status: 400 });
  }

  if (typeof url !== "string") {
    return Response.json({ error: "URL manquante." }, { status: 400 });
  }

  const path = modImagePath(url);
  if (!path) {
    return Response.json({ error: "Cette image ne vient pas du bucket." }, { status: 400 });
  }

  try {
    const referenced = await prisma.mod.count({ where: { imageUrl: url } });
    if (referenced > 0) {
      return Response.json(
        { error: "Cette image est utilisée par une fiche." },
        { status: 409 },
      );
    }

    await deleteModImages([path]);
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("DELETE /api/uploads/mod-image", error);
    return Response.json({ error: "L'image n'a pas pu être supprimée." }, { status: 500 });
  }
}
