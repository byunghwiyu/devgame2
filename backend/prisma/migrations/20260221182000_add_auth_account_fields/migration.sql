-- AlterTable
ALTER TABLE "users"
ADD COLUMN "email" VARCHAR(191),
ADD COLUMN "password_hash" TEXT,
ADD COLUMN "nickname" VARCHAR(50);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
