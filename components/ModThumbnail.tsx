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
      width={size}
      height={size}
      onError={() => setFailedSrc(src)}
      className="flex-none rounded-sm object-cover"
      style={{ width: size, height: size }}
    />
  );
}
