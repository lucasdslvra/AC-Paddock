import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";

// Prisma 7 passe par un driver adapter : c'est `pg` qui ouvre la connexion,
// pas un moteur natif. Le pool doit rester petit, Supabase (plan gratuit) plafonne
// le nombre de connexions et chaque instance serverless a le sien.
function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL manquant : renseigne la chaîne de connexion Supabase dans .env.local (voir .env.local.example).",
    );
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 5 }) });
}

// En dev, le hot reload ré-évalue ce module : sans ce cache global on ouvrirait
// un nouveau pool à chaque rechargement jusqu'à saturer la base.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function getPrismaClient(): PrismaClient {
  const client = globalForPrisma.prisma ?? createPrismaClient();
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
  }
  return client;
}

// Instanciation paresseuse : `next build` importe les route handlers pour les
// analyser, et l'absence de DATABASE_URL au moment du build ne doit pas faire
// échouer la compilation — l'erreur doit tomber à la première requête.
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getPrismaClient();
    // On lit et on lie sur le client réel : les getters/méthodes de Prisma
    // touchent des champs privés, ils ne supportent pas `this` = le proxy.
    const value = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
