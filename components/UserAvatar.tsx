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
      width={size}
      height={size}
      className="flex-none rounded-full object-cover"
      style={{
        width: size,
        height: size,
        border: ring ? "2px solid var(--color-amber)" : undefined,
      }}
    />
  );
}
