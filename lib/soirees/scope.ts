/**
 * Une valeur qu'aucun `Soiree.guildId` ne peut porter, pour filtrer sur le serveur d'un
 * membre dont on ne connaît pas le serveur.
 *
 * Un filtre à `undefined` disparaîtrait de la requête Prisma : au lieu de ne rien
 * ramener, il ramènerait les soirées de tout le monde. C'est exactement l'inverse de ce
 * qu'on veut dire.
 *
 * Dans son propre fichier, sans `server-only` : `modInclude` s'en sert, et il est lu
 * par des composants clients — l'importer depuis `current.ts` traînerait Prisma dans
 * le bundle du navigateur.
 */
export const NO_GUILD = "";
