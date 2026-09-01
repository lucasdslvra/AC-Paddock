// US-H2 — reconnaissance du format réel d'un fichier déposé, par sa signature.
//
// L'extension et le type MIME annoncé viennent tous deux du client : le premier est le
// nom que l'utilisateur a donné au fichier, le second ce que son navigateur a déduit de
// ce nom. Ni l'un ni l'autre ne dit ce que le fichier *est* — renommer `charge.exe` en
// `mod.zip` suffit à les faire mentir les deux. Les premiers octets, eux, ne se
// renomment pas : c'est sur eux que porte la vérification avant écriture définitive.
//
// Pur, et sans accès réseau : la lecture des octets est l'affaire de lib/r2/storage.ts,
// la reconnaissance est ici pour rester vérifiable seule.

/**
 * Une signature de format : les octets attendus en tête de fichier, et le type MIME
 * qu'ils désignent.
 *
 * Plusieurs entrées peuvent porter le même type — une archive ZIP commence par
 * `PK\x03\x04` quand elle contient quelque chose, mais par `PK\x05\x06` quand elle est
 * vide et `PK\x07\x08` quand elle est découpée en volumes.
 */
interface ArchiveSignature {
  mime: string;
  bytes: readonly number[];
}

const ARCHIVE_SIGNATURES: readonly ArchiveSignature[] = [
  // ZIP — « PK », les initiales de Phil Katz, suivies du type d'enregistrement.
  { mime: "application/zip", bytes: [0x50, 0x4b, 0x03, 0x04] },
  { mime: "application/zip", bytes: [0x50, 0x4b, 0x05, 0x06] },
  { mime: "application/zip", bytes: [0x50, 0x4b, 0x07, 0x08] },
  // RAR v5 avant RAR v4 : les deux commencent par « Rar!\x1a\x07 », et la signature de
  // la v4 est un préfixe de rien du tout — c'est le septième octet qui les sépare.
  // L'ordre ne changerait donc rien ici, mais il évite d'avoir à le vérifier.
  { mime: "application/vnd.rar", bytes: [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00] },
  { mime: "application/vnd.rar", bytes: [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00] },
  // 7z — « 7z » suivi de quatre octets fixes.
  { mime: "application/x-7z-compressed", bytes: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c] },
];

/**
 * Combien d'octets il faut lire en tête d'un objet pour pouvoir se prononcer : la plus
 * longue des signatures ci-dessus. C'est ce que la route demande au bucket — inutile de
 * rapatrier un fichier de 100 Mo pour en regarder les huit premiers octets.
 */
export const ARCHIVE_SIGNATURE_BYTES = Math.max(
  ...ARCHIVE_SIGNATURES.map((signature) => signature.bytes.length),
);

/**
 * Le type MIME réel de ces octets de tête, ou `null` si aucune signature connue ne
 * correspond — donc : ce n'est pas une des archives qu'on accepte.
 *
 * `null` couvre aussi bien un exécutable renommé qu'un fichier tronqué : dans les deux
 * cas la fiche ne doit pas le référencer, et l'appelant n'a pas à distinguer.
 */
export function sniffArchiveMime(head: Uint8Array): string | null {
  for (const { mime, bytes } of ARCHIVE_SIGNATURES) {
    if (head.length < bytes.length) continue;
    if (bytes.every((byte, index) => head[index] === byte)) return mime;
  }
  return null;
}
