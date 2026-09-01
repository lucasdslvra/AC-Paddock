import { auth } from "@/auth";
import { maxModFileBytes } from "@/lib/admin/config";
import { describeModFileProblem, formatFileSize } from "@/lib/mods/file";
import { modInclude, serializeMod } from "@/lib/mods/serialize";
import { prisma } from "@/lib/prisma";
import {
  buildModFileKey,
  deleteModFile,
  headModFile,
  modFileKeyFromUrl,
  modFilePublicUrl,
  presignModFileUpload,
} from "@/lib/r2/storage";
import { soireeContext } from "@/lib/soirees/current";

/**
 * US-H1 — dépôt du fichier d'un mod sur Cloudflare R2.
 *
 * En deux temps, et le fichier ne traverse jamais l'application :
 *
 *   · `POST` valide la demande (taille, format) et renvoie une URL d'écriture signée,
 *     valable quelques minutes, plus l'URL publique que l'objet aura ;
 *   · le navigateur écrit directement dans le bucket, ce qui lui donne au passage la
 *     progression réelle de l'envoi (US-H1, barre de progression) ;
 *   · `PUT` confirme : le serveur va voir ce qui a réellement été déposé, et c'est
 *     seulement alors qu'il écrit `fileUrl` et `fileUploadedAt`.
 *
 * Le détour est la seule forme qui tienne : les fonctions Vercel plafonnent le corps
 * d'une requête à 4,5 Mo, quand le réglage admin (US-K3) va jusqu'à 200 Mo. Il a un
 * corollaire — un client peut déposer un objet puis ne jamais confirmer. Ces objets
 * orphelins ne sont référencés par aucune fiche ; c'est une règle de cycle de vie du
 * bucket qui les ramasse (voir .env.local.example), pas cette route.
 *
 * Cahier §2.2 : l'upload est ouvert à tous les membres, pas au seul auteur de la fiche
 * — c'est déjà ce que dit US-H4 du ré-upload.
 */

/** Le type sous lequel tout est déposé, et donc celui que la signature couvre. */
const UPLOAD_CONTENT_TYPE = "application/octet-stream";

export async function POST(request: Request, ctx: RouteContext<"/api/mods/[id]/upload">) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Connexion requise." }, { status: 401 });
  }

  const { id } = await ctx.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Requête illisible." }, { status: 400 });
  }

  const { filename, size } = (payload ?? {}) as Record<string, unknown>;
  if (typeof filename !== "string" || !filename.trim()) {
    return Response.json({ error: "Nom de fichier manquant." }, { status: 400 });
  }
  if (typeof size !== "number" || !Number.isFinite(size) || size < 0) {
    return Response.json({ error: "Taille de fichier manquante." }, { status: 400 });
  }

  try {
    // Le plafond est relu en base à chaque demande : celui que le navigateur a reçu
    // avec la page peut dater d'avant un changement dans l'espace admin.
    const [mod, maxBytes] = await Promise.all([
      prisma.mod.findUnique({ where: { id }, select: { id: true } }),
      maxModFileBytes(),
    ]);

    if (!mod) {
      return Response.json({ error: "Cette fiche n'existe pas." }, { status: 404 });
    }

    const problem = describeModFileProblem({ name: filename, size }, maxBytes);
    if (problem) {
      // 413 pour le dépassement de taille, 415 pour un format refusé, comme la route
      // des images d'aperçu : lisible côté client sans lire le corps de la réponse.
      return Response.json({ error: problem }, { status: size > maxBytes ? 413 : 415 });
    }

    const key = buildModFileKey(id, filename);

    return Response.json(
      {
        uploadUrl: await presignModFileUpload(key, UPLOAD_CONTENT_TYPE),
        contentType: UPLOAD_CONTENT_TYPE,
        key,
        fileUrl: modFilePublicUrl(key),
        maxBytes,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error(`POST /api/mods/${id}/upload`, error);
    return Response.json({ error: "L'envoi n'a pas pu être préparé." }, { status: 500 });
  }
}

/**
 * Confirmation : l'objet est là, la fiche peut le référencer.
 *
 * Le serveur ne croit pas le client sur parole — il relit la taille sur l'objet
 * réellement déposé. C'est le seul endroit où le plafond d'US-K3 est vraiment opposable :
 * l'URL signée, elle, ne porte pas de limite de taille.
 */
export async function PUT(request: Request, ctx: RouteContext<"/api/mods/[id]/upload">) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Connexion requise." }, { status: 401 });
  }

  const { id } = await ctx.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Requête illisible." }, { status: 400 });
  }

  const { key } = (payload ?? {}) as Record<string, unknown>;
  // La clé porte l'identifiant de la fiche en tête (`buildModFileKey`) : c'est ce qui
  // empêche de faire pointer une fiche vers un objet signé pour une autre.
  if (typeof key !== "string" || !key.startsWith(`${id}/`) || key.includes("..")) {
    return Response.json({ error: "Envoi inconnu." }, { status: 400 });
  }

  const soiree = await soireeContext(session);

  try {
    const [existing, maxBytes] = await Promise.all([
      prisma.mod.findUnique({ where: { id }, select: { fileUrl: true } }),
      maxModFileBytes(),
    ]);

    if (!existing) {
      return Response.json({ error: "Cette fiche n'existe pas." }, { status: 404 });
    }

    const stored = await headModFile(key);
    if (!stored) {
      return Response.json({ error: "Le fichier n'est pas arrivé. Réessaie." }, { status: 404 });
    }

    if (stored.size > maxBytes) {
      // Déposé au-delà du plafond : l'objet part, et la fiche n'en saura rien.
      await deleteModFile(key).catch((error) => console.error("Retrait du fichier trop lourd", error));
      return Response.json(
        { error: `Fichier trop lourd : ${formatFileSize(maxBytes)} maximum.` },
        { status: 413 },
      );
    }

    const mod = await prisma.mod.update({
      where: { id },
      // Cahier §2.7 — c'est cet horodatage, et lui seul, qui fait courir les 24 h. Un
      // ré-upload (US-H4) en repose un neuf, donc relance le délai.
      data: { fileUrl: modFilePublicUrl(key), fileUploadedAt: new Date() },
      include: modInclude(session.user.id, soiree),
    });

    // Le fichier que celui-ci remplace n'est plus référencé : il part. Un échec ici ne
    // doit pas faire échouer l'upload — la règle de cycle de vie du bucket ramassera.
    if (existing.fileUrl && existing.fileUrl !== mod.fileUrl) {
      const previous = modFileKeyFromUrl(existing.fileUrl);
      if (previous) {
        try {
          await deleteModFile(previous);
        } catch (error) {
          console.error("Suppression du fichier précédent", error);
        }
      }
    }

    return Response.json(serializeMod(mod, soiree.current?.id ?? null));
  } catch (error) {
    console.error(`PUT /api/mods/${id}/upload`, error);
    return Response.json({ error: "Le fichier n'a pas pu être rattaché à la fiche." }, { status: 500 });
  }
}
