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

// En dev, le hot reload ré-évalue ce module : le cache doit survivre au module, d'où
// le global. Ailleurs, une variable de module suffit — mais elle est indispensable :
// le proxy ci-dessous appelle `getPrismaClient` à *chaque* accès de propriété, donc
// sans mémorisation `prisma.mod.count()` puis `prisma.vote.count()` ouvriraient chacun
// leur pool, jamais refermé. C'est ce qui saturait le pooler Supabase pendant
// `next build`, où les 15 workers de prérendu multiplient encore la fuite.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

let cachedPrisma: PrismaClient | undefined;

function getPrismaClient(): PrismaClient {
  if (process.env.NODE_ENV !== "production") {
    return (globalForPrisma.prisma ??= createPrismaClient());
  }
  return (cachedPrisma ??= createPrismaClient());
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
