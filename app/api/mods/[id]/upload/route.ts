import { auth } from "@/auth";
import { maxModFileBytes } from "@/lib/admin/config";
import { ARCHIVE_SIGNATURE_BYTES, sniffArchiveMime } from "@/lib/mods/archive";
import {
  ALLOWED_MOD_FILE_EXTENSIONS,
  announcedModFileMime,
  describeModFileProblem,
  formatFileSize,
  modFileExtensionForMime,
  uploadDisabledReason,
} from "@/lib/mods/file";
import { modInclude, serializeMod } from "@/lib/mods/serialize";
import { releaseStorage, reserveStorage, storageFullMessage } from "@/lib/mods/storage-quota";
import { prisma } from "@/lib/prisma";
import {
  buildModFileKey,
  deleteModFile,
  headModFile,
  modFileKeyFromUrl,
  modFilePublicUrl,
  presignModFileUpload,
  readModFileHead,
  UPLOAD_URL_TTL_SECONDS,
  type StoredModFile,
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
 * d'une requête à 4,5 Mo, quand le réglage admin (US-K3) va jusqu'à 1 Go. Il a un
 * corollaire — un client peut déposer un objet puis ne jamais confirmer. Ces objets
 * orphelins ne sont référencés par aucune fiche ; c'est une règle de cycle de vie du
 * bucket qui les ramasse (voir .env.local.example), pas cette route.
 *
 * Cahier §2.2 : l'upload est ouvert à tous les membres, pas au seul auteur de la fiche
 * — c'est déjà ce que dit US-H4 du ré-upload. Il est en revanche réservé aux mods
 * **engagés dans la soirée en cours** : un fichier ne vit que 24 h (cahier §2.7), le
 * déposer sur une fiche que personne n'a engagée reviendrait à le voir expirer sans
 * avoir servi. C'est aussi ce qui borne ce que le bucket porte à un instant donné, et
 * rend tenable le plafond de 1 Go d'US-K3.
 *
 * Un second plafond, global celui-là, borne ce que le bucket porte en tout
 * (`MAX_TOTAL_STORAGE_BYTES`) : sans lui, dix fichiers de 1 Go sortiraient du palier
 * gratuit de Cloudflare sans qu'aucune règle ne s'y oppose. Comme un objet n'apparaît
 * dans le bucket qu'une fois l'envoi terminé, la place est **retenue** dès la signature
 * (lib/mods/storage-quota.ts) et rendue à la confirmation.
 *
 * US-H2 — la validation est en deux couches, parce qu'elles ne protègent pas de la même
 * chose. Avant de signer, la route relit l'extension et la taille annoncée : ça épargne
 * un envoi de 100 Mo à qui s'est trompé de fichier. Avant d'écrire dans la fiche, elle
 * va regarder l'objet lui-même — sa taille réelle, et ses premiers octets. Seule cette
 * seconde couche est opposable : tout ce que dit la première vient du client.
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
    const [mod, maxBytes, soiree] = await Promise.all([
      prisma.mod.findUnique({ where: { id }, select: { id: true } }),
      maxModFileBytes(),
      soireeContext(session),
    ]);

    if (!mod) {
      return Response.json({ error: "Cette fiche n'existe pas." }, { status: 404 });
    }

    // La soirée en cours est celle du serveur de ce membre (`soireeContext`) : un mod
    // engagé dans la soirée d'un autre groupe ne lui ouvre rien. 409 et non 403 — le
    // membre a bien le droit, c'est la fiche qui n'est pas dans l'état voulu, et ça se
    // répare d'un clic sur « Engager ».
    if (!soiree.current) {
      return Response.json({ error: uploadDisabledReason(false) }, { status: 409 });
    }

    const engaged = await prisma.soireeMod.findUnique({
      where: { soireeId_modId: { soireeId: soiree.current.id, modId: id } },
      select: { id: true },
    });
    if (!engaged) {
      return Response.json({ error: uploadDisabledReason(true) }, { status: 409 });
    }

    const problem = describeModFileProblem({ name: filename, size }, maxBytes);
    if (problem) {
      // 413 pour le dépassement de taille, 415 pour un format refusé, comme la route
      // des images d'aperçu : lisible côté client sans lire le corps de la réponse.
      return Response.json({ error: problem }, { status: size > maxBytes ? 413 : 415 });
    }

    const key = buildModFileKey(id, filename);

    // La place est retenue avant de signer : au retour de cette route, le membre part
    // envoyer son fichier, et rien ne le recroisera avant la confirmation.
    const expiresAt = new Date(Date.now() + UPLOAD_URL_TTL_SECONDS * 1000);
    const reservation = await reserveStorage(key, id, size, expiresAt);
    if (!reservation.ok) {
      // 507 : la demande est valide, c'est la place qui manque. Le message dit combien
      // il reste et que ça se libère tout seul — « c'est plein » n'indiquerait pas quoi
      // faire.
      return Response.json(
        { error: storageFullMessage(reservation.usage) },
        { status: 507 },
      );
    }

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
 * US-H2 — ce que l'objet réellement déposé doit vérifier avant que la fiche le
 * référence : sa taille, et son format lu dans ses propres octets.
 *
 * Renvoie la réponse de refus, ou `null` si l'objet peut être rattaché. Retirer du
 * bucket ce qui est refusé fait partie du contrat : un objet qu'aucune fiche ne
 * référencera n'a plus de raison d'y occuper de la place.
 *
 * C'est ici, et pas au moment de signer, que la validation est opposable : tout ce que
 * la route sait avant l'envoi lui vient du client.
 */
async function rejectStoredFile(
  key: string,
  stored: StoredModFile,
  maxBytes: number,
): Promise<Response | null> {
  /** Retire l'objet, au mieux : la règle de cycle de vie du bucket repassera derrière. */
  const discard = (why: string) =>
    deleteModFile(key).catch((error) => console.error(`Retrait — ${why}`, error));

  // Un objet vide n'a pas d'octets à examiner, et une requête `Range` dessus échouerait
  // en 416 plutôt qu'en un refus lisible.
  if (stored.size === 0) {
    await discard("fichier vide");
    return Response.json({ error: "Le fichier déposé est vide." }, { status: 400 });
  }

  // La taille réelle, et non celle que le client avait annoncée pour obtenir sa
  // signature : rien dans l'URL signée ne borne ce qui peut y être écrit.
  if (stored.size > maxBytes) {
    await discard("fichier trop lourd");
    return Response.json(
      {
        error:
          `Fichier trop lourd : ${formatFileSize(stored.size)} déposés pour ` +
          `${formatFileSize(maxBytes)} autorisés. Passe plutôt par un lien externe.`,
      },
      { status: 413 },
    );
  }

  // Le format réel. L'extension et le type MIME du navigateur viennent tous deux du nom
  // du fichier : renommer suffit à les faire mentir. Huit octets suffisent à trancher
  // (lib/mods/archive.ts), et une requête `Range` évite de rapatrier l'archive entière.
  const announced = announcedModFileMime(key.split("/").pop() ?? "");
  const actual = sniffArchiveMime(await readModFileHead(key, ARCHIVE_SIGNATURE_BYTES));

  if (!actual) {
    await discard("format non reconnu");
    return Response.json(
      {
        error:
          "Ce fichier n'est pas une archive : son contenu ne correspond à aucun des " +
          `formats acceptés (${ALLOWED_MOD_FILE_EXTENSIONS.join(", ")}).`,
      },
      { status: 415 },
    );
  }

  if (actual !== announced) {
    await discard("extension trompeuse");
    return Response.json(
      {
        error:
          `Ce fichier est en réalité une archive ${modFileExtensionForMime(actual)}, ` +
          "pas ce que son extension annonce. Renomme-le avant de le déposer.",
      },
      { status: 415 },
    );
  }

  return null;
}

/**
 * Confirmation : l'objet est là, la fiche peut le référencer.
 *
 * Le serveur ne croit le client sur rien — ni sur la taille, ni sur le format : il va
 * voir (`rejectStoredFile`). C'est le seul endroit où le plafond d'US-K3 et les formats
 * d'US-H2 sont vraiment opposables, l'URL signée ne portant ni l'un ni les autres.
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
    // La réservation a fait son office : ou bien l'objet est dans le bucket, où il compte
    // désormais pour ce qu'il pèse vraiment, ou bien l'envoi a échoué et il n'y a rien à
    // retenir. Libérée avant les refus qui suivent, pour qu'un fichier rejeté ne garde
    // pas sa place jusqu'à l'expiration de l'URL signée.
    await releaseStorage(key);

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

    const rejection = await rejectStoredFile(key, stored, maxBytes);
    if (rejection) return rejection;

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

    return Response.json(serializeMod(mod, soiree.current?.id ?? null, session.user.id));
  } catch (error) {
    console.error(`PUT /api/mods/${id}/upload`, error);
    return Response.json({ error: "Le fichier n'a pas pu être rattaché à la fiche." }, { status: 500 });
  }
}
