import type { NextConfig } from "next";
import type { RemotePattern } from "next/dist/shared/lib/image-config";

const remotePatterns: RemotePattern[] = [
  { protocol: "https", hostname: "cdn.discordapp.com", pathname: "/avatars/**" },
];

// Images d'aperçu des mods (US-B2) : le host dépend du projet Supabase configuré,
// on le dérive de SUPABASE_URL plutôt que de le figer dans le dépôt.
if (process.env.SUPABASE_URL) {
  remotePatterns.push({
    protocol: "https",
    hostname: new URL(process.env.SUPABASE_URL).hostname,
    pathname: "/storage/v1/object/public/**",
  });
}

const nextConfig: NextConfig = {
  images: {
    remotePatterns,
    // 75 est la qualité par défaut de Next 16, et la seule autorisée tant qu'on ne la
    // déclare pas ici. 90 est réservée aux vignettes : à 64 ou 128 px de large, le
    // surcoût en octets est négligeable, alors que les artefacts de compression, eux,
    // se voient — une carrosserie de voiture réduite à cette taille part vite en pâté.
    qualities: [75, 90],
  },
};

export default nextConfig;
