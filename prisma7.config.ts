// Prisma ne charge pas les fichiers .env tout seul en v7 : on pointe explicitement
// vers .env.local, le fichier déjà utilisé par Next.js pour les secrets du projet.
import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

loadEnv({ path: ".env.local", quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Le CLI (migrations, introspection) passe par DIRECT_URL — le session pooler
    // Supabase, port 5432 : le transaction pooler (6543) utilisé par l'app ne
    // supporte pas le DDL de Prisma.
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
  },
});
