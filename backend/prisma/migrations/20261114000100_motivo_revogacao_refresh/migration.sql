-- CreateEnum
CREATE TYPE "public"."RevokeReason" AS ENUM ('ROTATED', 'LOGOUT', 'REUSE_DETECTED', 'PASSWORD_CHANGED');

-- AlterTable
ALTER TABLE "public"."refresh_tokens" ADD COLUMN     "revoked_reason" "public"."RevokeReason";

