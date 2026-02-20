-- Align DB schema with current prisma/schema.prisma

-- users
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "office_level" INTEGER NOT NULL DEFAULT 1;

-- mercenaries
ALTER TABLE "mercenaries"
  ALTER COLUMN "grade" TYPE INTEGER
  USING CASE
    WHEN "grade" ~ '^[0-9]+$' THEN "grade"::INTEGER
    ELSE 1
  END;

ALTER TABLE "mercenaries"
  ADD COLUMN IF NOT EXISTS "promotion_route" TEXT,
  ADD COLUMN IF NOT EXISTS "promotion_bonus" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "mercenaries"
  DROP COLUMN IF EXISTS "power";

-- equipments
ALTER TABLE "equipments"
  ALTER COLUMN "grade" TYPE INTEGER
  USING CASE
    WHEN "grade" ~ '^[0-9]+$' THEN "grade"::INTEGER
    ELSE 1
  END;

ALTER TABLE "equipments"
  ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- dispatches
ALTER TABLE "dispatches"
  ADD COLUMN IF NOT EXISTS "success_chance" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "success_result" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "reward_credits" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "reward_exp" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "reward_material_a" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "reward_material_b" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "claimed_at" TIMESTAMP(3);

-- craft_jobs
ALTER TABLE "craft_jobs"
  ADD COLUMN IF NOT EXISTS "result_equip_type" TEXT NOT NULL DEFAULT 'WEAPON',
  ADD COLUMN IF NOT EXISTS "result_grade" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "result_stat_value" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "claimed_at" TIMESTAMP(3);

-- offers
CREATE TABLE IF NOT EXISTS "offers" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "slot_index" INTEGER NOT NULL,
  "template_id" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "seed" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- promotion_jobs
CREATE TABLE IF NOT EXISTS "promotion_jobs" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "mercenary_id" UUID NOT NULL,
  "route" TEXT NOT NULL,
  "grade_from" INTEGER NOT NULL,
  "grade_to" INTEGER NOT NULL,
  "multiplier_bonus" DOUBLE PRECISION NOT NULL,
  "start_at" TIMESTAMP(3) NOT NULL,
  "end_at" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL,
  "claimed_at" TIMESTAMP(3),
  CONSTRAINT "promotion_jobs_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "offers"
  ADD CONSTRAINT "offers_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "promotion_jobs"
  ADD CONSTRAINT "promotion_jobs_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "offers_user_id_slot_index_key" ON "offers"("user_id", "slot_index");
CREATE INDEX IF NOT EXISTS "offers_user_id_expires_at_idx" ON "offers"("user_id", "expires_at");
CREATE INDEX IF NOT EXISTS "mercenaries_user_id_idx" ON "mercenaries"("user_id");
CREATE INDEX IF NOT EXISTS "equipments_user_id_idx" ON "equipments"("user_id");
CREATE INDEX IF NOT EXISTS "dispatches_user_id_status_idx" ON "dispatches"("user_id", "status");
CREATE INDEX IF NOT EXISTS "craft_jobs_user_id_status_idx" ON "craft_jobs"("user_id", "status");
CREATE INDEX IF NOT EXISTS "promotion_jobs_user_id_status_idx" ON "promotion_jobs"("user_id", "status");
