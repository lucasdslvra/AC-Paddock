import Image from "next/image";
import { AvatarPlaceholder } from "./AvatarPlaceholder";

interface ModThumbnailProps {
  src?: string;
  name: string;
  size: number;
}

/** Vignette du catalogue : l'image d'aperçu si la fiche en a une, le motif rayé sinon. */
export function ModThumbnail({ src, name, size }: ModThumbnailProps) {
  if (!src) {
    return <AvatarPlaceholder size={size} variant="thumb" />;
  }

  return (
    <Image
      src={src}
      alt={`Aperçu de ${name}`}
      width={size}
      height={size}
      className="flex-none rounded-sm object-cover"
      style={{ width: size, height: size }}
    />
  );
}
