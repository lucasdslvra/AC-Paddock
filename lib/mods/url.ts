// Normalisation des liens externes, partagée par les routes API et le formulaire.
// Le cahier §2.4 demande qu'une URL déjà enregistrée soit reconnue « exactement, ou
// après normalisation — retrait des paramètres de tracking, casse, slash final ».
// C'est ce que fait `normalizeModUrl` ; `Mod.urlKey` en garde le résultat pour que la
// comparaison se fasse par index plutôt qu'en relisant tout le catalogue.

/**
 * Paramètres de suivi retirés de la clé de comparaison. La liste couvre les campagnes
 * (`utm_*`), les identifiants de clic des grandes régies, et les `ref`/`source` que les
 * sites de mods collent dans les liens de partage. Tout le reste est conservé : sur
 * RaceDepartment ou Drive, un paramètre non listé fait partie de l'adresse de la
 * ressource, et l'effacer ferait passer deux fichiers différents pour le même.
 */
const TRACKING_PARAMS = new Set([
  "fbclid",
  "gclid",
  "dclid",
  "msclkid",
  "yclid",
  "twclid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "ref",
  "ref_src",
  "referrer",
  "source",
  "spm",
  "si",
  // Google Drive colle un `usp=sharing` / `usp=drive_link` selon la façon dont le lien
  // a été copié : sans lui, deux partages du même fichier passeraient pour deux mods.
  "usp",
  "_ga",
  "_gl",
]);

/** Préfixes de familles entières de paramètres de campagne (`utm_source`, `utm_id`…). */
const TRACKING_PREFIXES = ["utm_"];

function isTrackingParam(name: string): boolean {
  const key = name.toLowerCase();
  return TRACKING_PARAMS.has(key) || TRACKING_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/**
 * Clé de comparaison d'un lien : `host/chemin?params`, sans protocole, sans `www.`,
 * sans ancre, sans paramètres de suivi, sans slash final, en minuscules.
 *
 *   https://WWW.RaceDepartment.com/downloads/silvia.1234/?utm_source=discord#reviews
 *   → racedepartment.com/downloads/silvia.1234
 *
 * Les paramètres restants sont triés : deux liens qui ne diffèrent que par leur ordre
 * désignent la même page.
 *
 * Le passage en minuscules suit le cahier (« casse »). Il rend théoriquement égales
 * deux adresses qui ne différeraient que par la casse de leur chemin — un identifiant
 * Drive, par exemple. C'est assumé : la détection est une aide à la décision, pas un
 * blocage (cahier §2.4), et le membre garde toujours « Créer quand même ».
 *
 * Renvoie `null` si le lien est illisible ou n'est pas en http(s) — à l'appelant de
 * décider quoi en faire ; la validation du champ, elle, vit dans lib/mods/schema.ts.
 */
export function normalizeModUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  // `URL` met déjà le host en minuscules et retire le port par défaut du protocole.
  const host = url.hostname.replace(/^www\./, "") + (url.port ? `:${url.port}` : "");
  const path = url.pathname.replace(/\/+$/, "");

  const params = new URLSearchParams();
  for (const [name, value] of [...url.searchParams].sort(([a], [b]) => a.localeCompare(b))) {
    if (!isTrackingParam(name)) params.append(name, value);
  }
  const query = params.toString();

  return `${host}${path}${query ? `?${query}` : ""}`.toLowerCase();
}

/**
 * Valeur à écrire dans `Mod.urlKey`. Le repli sur la chaîne brute ne sert qu'à garantir
 * une colonne toujours renseignée : les routes valident l'URL avant d'arriver ici, un
 * lien illisible n'y parvient pas.
 */
export function modUrlKey(url: string): string {
  return normalizeModUrl(url) ?? url.trim().toLowerCase();
}
