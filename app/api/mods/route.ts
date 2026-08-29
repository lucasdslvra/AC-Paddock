import { auth } from "@/auth";
import { modInputSchema, toFieldErrors } from "@/lib/mods/schema";
import { modInclude, serializeMod } from "@/lib/mods/serialize";
import { parseTagsParam } from "@/lib/mods/tags";
import { buildTagCreateWrite } from "@/lib/mods/tags-store";
import { isModImageUrl } from "@/lib/supabase/storage";
import { prisma } from "@/lib/prisma";

/**
 * US-C2 — liste des fiches, filtrable par tags.
 *
 * `?tags=drift,jdm` (la forme qu'écrit le catalogue) et `?tags=drift&tags=jdm` sont
 * acceptées indifféremment, `tags[]` aussi — c'est la notation du backlog, et celle que
 * produisent les clients HTTP qui suffixent les paramètres répétés.
 *
 * Les tags se **combinent** (ET, pas OU) : `drift + jdm` ne ramène que les fiches qui
 * portent les deux, ce que demande le cahier §2.3. D'où un `some` par tag plutôt qu'un
 * seul `in` — `{ tags: { some: { tag: { name: { in: [...] } } } } }` répondrait « au
 * moins un des deux », ce qui n'est pas la même question.
 *
 * Pagination et options de tri restent à US-E1 : le tri par défaut est la date de
 * création décroissante.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Connexion requise." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const tags = parseTagsParam([...searchParams.getAll("tags"), ...searchParams.getAll("tags[]")]);

  try {
    const mods = await prisma.mod.findMany({
      where: tags.length > 0 ? { AND: tags.map((name) => ({ tags: { some: { tag: { name } } } })) } : undefined,
      include: modInclude,
      orderBy: { createdAt: "desc" },
    });

    return Response.json(mods.map(serializeMod));
  } catch (error) {
    console.error("GET /api/mods", error);
    return Response.json({ error: "Le catalogue n'a pas pu être chargé." }, { status: 500 });
  }
}

/**
 * US-B1 — création d'une fiche de mod.
 * Toutes les routes hors login exigent une session valide (cahier §3) : la
 * vérification d'appartenance au serveur Discord a déjà eu lieu au callback
 * d'authentification, une session signée suffit donc ici.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Connexion requise." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Corps de requête illisible." }, { status: 400 });
  }

  const parsed = modInputSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      { error: "Formulaire invalide.", fieldErrors: toFieldErrors(parsed.error) },
      { status: 400 },
    );
  }

  // L'URL d'image ne peut venir que de notre propre route d'upload : on refuse
  // qu'une fiche pointe vers une image hébergée ailleurs.
  if (parsed.data.imageUrl && !isModImageUrl(parsed.data.imageUrl)) {
    return Response.json(
      { error: "Formulaire invalide.", fieldErrors: { imageUrl: "Image inconnue : dépose-la via le formulaire." } },
      { status: 400 },
    );
  }

  try {
    // La session porte l'identité Discord, pas un id de ligne User : on
    // crée/rafraîchit l'auteur avant de poser la clé étrangère.
    const author = await prisma.user.upsert({
      where: { discordId: session.user.id },
      update: {
        username: session.user.name ?? undefined,
        avatarUrl: session.user.image ?? null,
      },
      create: {
        discordId: session.user.id,
        username: session.user.name ?? "membre",
        avatarUrl: session.user.image ?? null,
      },
    });

    // Les tags ne sont pas une colonne de `Mod` : on les sort du lot pour les écrire
    // comme des lignes `ModTag`, en créant au passage ceux qui n'existent pas encore.
    const { tags, ...fields } = parsed.data;

    const mod = await prisma.mod.create({
      data: { ...fields, authorId: author.id, tags: await buildTagCreateWrite(tags) },
      include: modInclude,
    });

    return Response.json(serializeMod(mod), { status: 201 });
  } catch (error) {
    console.error("POST /api/mods", error);
    return Response.json({ error: "La fiche n'a pas pu être enregistrée." }, { status: 500 });
  }
}
