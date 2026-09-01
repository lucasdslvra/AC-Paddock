import "server-only";
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { modFileExtension } from "@/lib/mods/file";

/**
 * US-H1 — le bucket Cloudflare R2 où atterrissent les fichiers de mod (cahier §7).
 *
 * R2 parle le dialecte S3 : c'est le SDK d'AWS qui l'adresse, avec un endpoint de
 * compte et une région factice. Les images d'aperçu, elles, restent sur Supabase
 * Storage (lib/supabase/storage.ts) — deux stockages parce qu'ils ne portent pas la
 * même chose : une image vit aussi longtemps que la fiche, un `.zip` 24 h (cahier §2.7),
 * et c'est l'absence de frais de sortie de R2 qui décide pour le second.
 *
 * Le fichier ne transite jamais par l'application : la route signe une URL, le
 * navigateur écrit directement dans le bucket. C'est la seule forme qui tienne sur
 * Vercel, dont les fonctions plafonnent le corps d'une requête à 4,5 Mo là où le
 * réglage admin monte à 200 Mo.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} manquant : renseigne-le dans .env.local (voir .env.local.example).`);
  }
  return value;
}

export function modFilesBucket(): string {
  return process.env.R2_BUCKET ?? "mods-ac-files";
}

// Instanciation paresseuse, comme pour Supabase et Prisma : une configuration absente
// ne doit pas faire échouer le build, seulement la requête qui en a besoin.
let cached: S3Client | undefined;

function r2(): S3Client {
  if (!cached) {
    cached = new S3Client({
      // R2 n'a pas de régions : le SDK en exige une, « auto » est celle que Cloudflare
      // documente.
      region: "auto",
      endpoint: `https://${requireEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
        secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
      },
    });
  }
  return cached;
}

/**
 * Le domaine public du bucket (`https://pub-….r2.dev`, ou un domaine personnalisé),
 * sans slash final. C'est le préfixe de tout ce qui s'écrit dans `Mod.fileUrl`, et donc
 * aussi ce qui permet de vérifier qu'une URL reçue vient bien de chez nous.
 */
export function modFilesPublicPrefix(): string {
  return requireEnv("R2_PUBLIC_URL").replace(/\/$/, "");
}

export function modFilePublicUrl(key: string): string {
  return `${modFilesPublicPrefix()}/${key}`;
}

/** La clé de l'objet dans le bucket, ou `null` si l'URL ne vient pas du bucket. */
export function modFileKeyFromUrl(url: string): string | null {
  const prefix = `${modFilesPublicPrefix()}/`;
  if (!url.startsWith(prefix)) return null;
  const key = url.slice(prefix.length);
  return key && !key.includes("..") ? key : null;
}

/**
 * La clé sous laquelle déposer un fichier : `<modId>/<uuid>/<nom d'origine>`.
 *
 * Trois segments, chacun pour une raison. L'identifiant de la fiche en tête pour que la
 * route de confirmation puisse vérifier qu'une clé signée pour une fiche n'est pas
 * réutilisée sur une autre. L'UUID parce qu'un ré-upload (US-H4) ne doit jamais écraser
 * l'objet précédent tant que la fiche le référence encore. Le nom d'origine en dernier
 * parce que `Mod` n'a pas de colonne pour lui : c'est là qu'il est conservé, et c'est
 * lui que le navigateur proposera au téléchargement.
 *
 * Le nom est réécrit — il vient de l'utilisateur, et une clé d'objet n'a pas à porter
 * ses espaces, ses accents ni ses slashs.
 */
export function buildModFileKey(modId: string, filename: string): string {
  const extension = modFileExtension(filename);
  const base = filename
    .slice(0, filename.length - extension.length)
    .normalize("NFD")
    // Les diacritiques décomposés par NFD : « é » devient « e », pas « _ ».
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 80);

  return `${modId}/${crypto.randomUUID()}/${base || "mod"}${extension}`;
}

/** Combien de temps une URL d'upload signée reste valable. */
const UPLOAD_URL_TTL_SECONDS = 15 * 60;

/**
 * Une URL d'écriture à durée de vie courte, que le navigateur consomme en `PUT`.
 *
 * Seul le type est signé, pas la taille : `Content-Length` dans la signature ferait
 * dépendre l'upload d'un en-tête que le navigateur pose lui-même, et un écart de
 * signature se lit côté client comme un 403 sans explication. La taille est donc
 * vérifiée après coup, sur l'objet réellement déposé (`headModFile`), là où elle n'est
 * plus une promesse du client.
 */
export function presignModFileUpload(key: string, contentType: string): Promise<string> {
  return getSignedUrl(
    r2(),
    new PutObjectCommand({ Bucket: modFilesBucket(), Key: key, ContentType: contentType }),
    { expiresIn: UPLOAD_URL_TTL_SECONDS },
  );
}

export interface StoredModFile {
  size: number;
  contentType: string | null;
}

/** Ce que le bucket contient sous cette clé, ou `null` s'il n'y a rien. */
export async function headModFile(key: string): Promise<StoredModFile | null> {
  try {
    const head = await r2().send(
      new HeadObjectCommand({ Bucket: modFilesBucket(), Key: key }),
    );
    return { size: head.ContentLength ?? 0, contentType: head.ContentType ?? null };
  } catch (error) {
    // Un objet absent se signale par un 404 ; tout le reste est une vraie panne et doit
    // remonter, sans quoi « pas de fichier » masquerait une erreur de configuration.
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404) return null;
    throw error;
  }
}

export async function deleteModFile(key: string): Promise<void> {
  await r2().send(new DeleteObjectCommand({ Bucket: modFilesBucket(), Key: key }));
}
