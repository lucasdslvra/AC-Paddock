import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ProcessedImage } from "@/lib/mods/image-processing";

export const MOD_IMAGES_BUCKET = "mod-images";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} manquant : renseigne-le dans .env.local (voir .env.local.example).`);
  }
  return value;
}

// Instanciation paresseuse, comme pour Prisma : l'absence de configuration ne doit pas
// faire échouer le build, seulement la requête qui en a besoin.
let cached: SupabaseClient | undefined;

function storageClient(): SupabaseClient {
  if (!cached) {
    // Clé secrète (« service_role » dans l'ancien format) : elle contourne les policies
    // RLS du Storage et ne doit jamais sortir du serveur. Tous les uploads passent par
    // nos routes API.
    const key = requireEnv("SUPABASE_SECRET_KEY");
    if (key.startsWith("sb_publishable_")) {
      throw new Error(
        "SUPABASE_SECRET_KEY contient une clé publiable : prends la clé secrète " +
          "(Project Settings → API Keys → Secret keys), sinon le Storage refuse l'écriture.",
      );
    }
    cached = createClient(requireEnv("SUPABASE_URL"), key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}

/** Préfixe public des objets du bucket — sert aussi à valider une imageUrl reçue. */
export function modImagesPublicPrefix(): string {
  return `${requireEnv("SUPABASE_URL").replace(/\/$/, "")}/storage/v1/object/public/${MOD_IMAGES_BUCKET}/`;
}

export function isModImageUrl(url: string): boolean {
  return url.startsWith(modImagesPublicPrefix());
}

/** Chemin de l'objet dans le bucket, ou null si l'URL ne vient pas de chez nous. */
export function modImagePath(url: string): string | null {
  const prefix = modImagesPublicPrefix();
  if (!url.startsWith(prefix)) return null;
  const path = url.slice(prefix.length);
  // Un chemin vide ou contenant « .. » ne peut pas venir de notre upload.
  return path && !path.includes("..") ? path : null;
}

export async function deleteModImages(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await storageClient().storage.from(MOD_IMAGES_BUCKET).remove(paths);
  if (error) {
    throw new Error(`Suppression dans Supabase Storage impossible : ${error.message}`);
  }
}

export interface StoredModImage {
  path: string;
  createdAt: Date;
}

/** Tout le contenu du bucket, pagination comprise (la liste est plafonnée par appel). */
export async function listModImages(): Promise<StoredModImage[]> {
  const pageSize = 1000;
  const files: StoredModImage[] = [];

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await storageClient()
      .storage.from(MOD_IMAGES_BUCKET)
      .list("", { limit: pageSize, offset });

    if (error) {
      throw new Error(`Lecture du bucket impossible : ${error.message}`);
    }
    if (!data || data.length === 0) break;

    for (const file of data) {
      const stamp = file.created_at ?? file.updated_at;
      // Sans date exploitable on considère l'objet comme tout juste créé : le balayage
      // le laissera tranquille plutôt que de risquer de supprimer un fichier récent.
      files.push({ path: file.name, createdAt: stamp ? new Date(stamp) : new Date() });
    }
    if (data.length < pageSize) break;
  }

  return files;
}

/** Dépose l'image (déjà compressée) dans le bucket et renvoie son URL publique. */
export async function uploadModImage(image: ProcessedImage): Promise<string> {
  // Nom aléatoire : on ne réutilise jamais le nom d'origine, qui est contrôlé par
  // l'utilisateur et pourrait collisionner ou contenir n'importe quoi.
  const path = `${crypto.randomUUID()}.${image.extension}`;

  const { error } = await storageClient()
    .storage.from(MOD_IMAGES_BUCKET)
    .upload(path, image.data, {
      contentType: image.contentType,
      cacheControl: "31536000",
      upsert: false,
    });

  if (error) {
    throw new Error(`Upload vers Supabase Storage impossible : ${error.message}`);
  }

  return `${modImagesPublicPrefix()}${path}`;
}
