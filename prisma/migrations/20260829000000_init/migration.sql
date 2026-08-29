-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('MEMBER', 'ADMIN');

-- CreateEnum
CREATE TYPE "ModType" AS ENUM ('CAR', 'TRACK');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mod" (
    "id" TEXT NOT NULL,
    "type" "ModType" NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "fileUrl" TEXT,
    "fileUploadedAt" TIMESTAMP(3),
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_discordId_key" ON "User"("discordId");

-- CreateIndex
CREATE INDEX "Mod_authorId_idx" ON "Mod"("authorId");

-- CreateIndex
CREATE INDEX "Mod_createdAt_idx" ON "Mod"("createdAt");

-- AddForeignKey
ALTER TABLE "Mod" ADD CONSTRAINT "Mod_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Sécurité Supabase : les tables du schéma "public" sont exposées automatiquement
-- via l'API REST (PostgREST) avec la clé anon. L'application passe exclusivement par
-- Prisma (rôle propriétaire des tables, non soumis à RLS), donc on active RLS sans
-- aucune policy : l'API REST publique ne renvoie plus rien, Prisma continue de fonctionner.
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Mod" ENABLE ROW LEVEL SECURITY;
