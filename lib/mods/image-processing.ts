import "server-only";
import sharp from "sharp";

/**
 * Plus grande dimension conservée. Les deux endroits où l'image s'affiche sont la
 * vignette du catalogue (52 px) et la bande d'aperçu de la fiche — au plus 700 px de
 * large sur grand écran, 100vw en dessous de 1024 px. Même à 2× de densité de pixels,
 * 1600 px couvre largement : au-delà, `next/image` réduirait l'image de toute façon.
 */
const MAX_DIMENSION = 1600;

/** WebP à 80 : le pas suivant coûte beaucoup d'octets pour un gain invisible ici. */
const WEBP_QUALITY = 80;

export interface ProcessedImage {
  data: Buffer;
  contentType: string;
  extension: string;
}

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Ré-encode l'image avant stockage : redimensionnement, passage en WebP et suppression
 * des métadonnées (EXIF compris — ça allège, et ça évite de publier la géolocalisation
 * d'une photo prise au téléphone).
 */
export async function compressModImage(input: Buffer, sourceType: string): Promise<ProcessedImage> {
  // `image/jpg` est un alias que certains clients envoient : on le ramène au vrai type.
  const type = sourceType === "image/jpg" ? "image/jpeg" : sourceType;

  const encoded = await sharp(input)
    // Applique l'orientation EXIF avant qu'elle ne soit supprimée, sinon les photos
    // prises au téléphone ressortent couchées.
    .rotate()
    .resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: WEBP_QUALITY, effort: 5 })
    .toBuffer();

  // Sur un fichier déjà très optimisé — un WebP entrant, souvent — le ré-encodage peut
  // peser plus lourd que l'original : dans ce cas on garde l'original. Le JPEG fait
  // toujours ré-encodé — c'est le format qui transporte l'orientation et les
  // métadonnées EXIF (géolocalisation comprise) qu'on tient à supprimer.
  if (type !== "image/jpeg" && encoded.byteLength >= input.byteLength) {
    return { data: input, contentType: type, extension: EXTENSIONS[type] };
  }

  return { data: encoded, contentType: "image/webp", extension: "webp" };
}
