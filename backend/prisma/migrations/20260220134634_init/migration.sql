-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "credits" INTEGER NOT NULL DEFAULT 1000,
    "material_a" INTEGER NOT NULL DEFAULT 0,
    "material_b" INTEGER NOT NULL DEFAULT 0,
    "last_login_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mercenaries" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "template_id" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "role_tag" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "exp" INTEGER NOT NULL DEFAULT 0,
    "power" INTEGER NOT NULL DEFAULT 10,
    "is_dispatched" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "mercenaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "stat_value" INTEGER NOT NULL,
    "equipped_merc_id" UUID,
    "slot_index" INTEGER,

    CONSTRAINT "equipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispatches" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "party_ids" JSONB NOT NULL,
    "location_id" TEXT NOT NULL,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "dispatches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "craft_jobs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "recipe_id" TEXT NOT NULL,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "craft_jobs_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "mercenaries" ADD CONSTRAINT "mercenaries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipments" ADD CONSTRAINT "equipments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "craft_jobs" ADD CONSTRAINT "craft_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
