"use client";

import Image from "next/image";
import { useState } from "react";
import { AvatarPlaceholder } from "./AvatarPlaceholder";

interface ModThumbnailProps {
  src?: string;
  name: string;
  size: number;
}

/**
 * Vignette du catalogue : l'image d'aperçu si la fiche en a une, le motif rayé sinon.
 *
 * « Sinon » couvre aussi l'image morte : `Mod.imageUrl` peut pointer vers un objet que
 * le bucket n'a plus — fichier retiré à la main, bucket recréé, projet Supabase changé.
 * Le lien reste alors valide mais la ressource a disparu, et sans ce repli la carte
 * affiche une icône cassée pendant que l'optimiseur d'images de Next relaie le 400 du
 * Storage dans la console.
 *
 * L'URL en échec est retenue plutôt qu'un simple booléen : la même vignette sert à
 * plusieurs fiches d'affilée (liste des doublons potentiels, US-D1), et un booléen
 * condamnerait l'image suivante à cause de la précédente.
 */
export function ModThumbnail({ src, name, size }: ModThumbnailProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (!src || src === failedSrc) {
    return <AvatarPlaceholder size={size} variant="thumb" />;
  }

  return (
    <Image
      src={src}
      alt={`Aperçu de ${name}`}
      // Deux fois la taille d'affichage, et non la taille elle-même : sans `sizes`,
      // `next/image` bâtit son srcset en arrondissant `width` puis `width × 2` au
      // palier supérieur de `imageSizes`. Demander 52 donnait donc « 64 px en 1×, 128
      // en 2× » — soit, sur un écran ordinaire, 64 px étalés sur une case de 52 : de
      // quoi voir la compression. Demander 104 remonte le palier 1× à 128 px, et le
      // fichier reste sous les dix kilo-octets.
      width={size * 2}
      height={size * 2}
      // Voir `images.qualities` dans `next.config.ts`.
      quality={90}
      onError={() => setFailedSrc(src)}
      className="flex-none rounded-sm object-cover"
      // Les deux dimensions sont reprises en CSS : c'est ce qui ramène la vignette à sa
      // taille d'affichage, et ce qui évite l'avertissement de `next/image` sur une
      // seule des deux dimensions surchargée.
      style={{ width: size, height: size }}
    />
  );
}
