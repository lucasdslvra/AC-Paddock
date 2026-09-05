import Image from "next/image";
import { AvatarPlaceholder } from "./AvatarPlaceholder";

interface UserAvatarProps {
  src?: string | null;
  name?: string | null;
  size: number;
  ring?: boolean;
}

/** Real Discord avatar when we have one, striped placeholder otherwise. */
export function UserAvatar({ src, name, size, ring = false }: UserAvatarProps) {
  if (!src) {
    return <AvatarPlaceholder size={size} ring={ring} />;
  }

  return (
    <Image
      src={src}
      alt={name ? `Avatar de ${name}` : "Avatar Discord"}
      // Deux fois la taille d'affichage, comme `ModThumbnail` : à 20 px, le palier 1×
      // tombait sur 32 px de large. Voir le commentaire là-bas.
      width={size * 2}
      height={size * 2}
      quality={90}
      className="flex-none rounded-full object-cover"
      style={{
        width: size,
        height: size,
        border: ring ? "2px solid var(--color-amber)" : undefined,
      }}
    />
  );
}
