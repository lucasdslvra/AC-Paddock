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
  images: { remotePatterns },
};

export default nextConfig;
