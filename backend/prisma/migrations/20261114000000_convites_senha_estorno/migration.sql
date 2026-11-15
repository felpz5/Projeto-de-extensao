-- AlterEnum
ALTER TYPE "public"."MembershipStatus" ADD VALUE 'INVITED';

-- AlterTable
ALTER TABLE "public"."users" ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "public"."stock_movements" ADD COLUMN     "reversed_at" TIMESTAMP(3),
ADD COLUMN     "reverses_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_reverses_id_key" ON "public"."stock_movements"("reverses_id");

-- AddForeignKey
ALTER TABLE "public"."stock_movements" ADD CONSTRAINT "stock_movements_reverses_id_fkey" FOREIGN KEY ("reverses_id") REFERENCES "public"."stock_movements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

