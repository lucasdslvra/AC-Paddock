-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModTag" (
    "modId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "ModTag_pkey" PRIMARY KEY ("modId","tagId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");

-- CreateIndex
CREATE INDEX "ModTag_tagId_idx" ON "ModTag"("tagId");

-- AddForeignKey
ALTER TABLE "ModTag" ADD CONSTRAINT "ModTag_modId_fkey" FOREIGN KEY ("modId") REFERENCES "Mod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModTag" ADD CONSTRAINT "ModTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Même protection que pour User et Mod (migration initiale) : RLS activé sans aucune
-- policy, pour que l'API REST publique de Supabase ne renvoie rien. Prisma passe par
-- le rôle propriétaire des tables et n'est pas concerné.
ALTER TABLE "Tag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ModTag" ENABLE ROW LEVEL SECURITY;
