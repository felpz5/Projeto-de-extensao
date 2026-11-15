-- Forma de pagamento (fechamento de caixa) e cancelamento de venda no lugar da exclusão.
-- Venda cancelada continua no banco (com motivo, quem e quando) e o estoque é estornado.

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'VOUCHER', 'OTHER');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('COMPLETED', 'CANCELED');

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "payment_method" "PaymentMethod",
ADD COLUMN     "status" "SaleStatus" NOT NULL DEFAULT 'COMPLETED',
ADD COLUMN     "canceled_at" TIMESTAMP(3),
ADD COLUMN     "canceled_by_id" UUID,
ADD COLUMN     "cancel_reason" TEXT,
ADD COLUMN     "corrects_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "sales_corrects_id_key" ON "sales"("corrects_id");

-- CreateIndex
CREATE INDEX "sales_tenant_id_created_by_id_sold_at_idx" ON "sales"("tenant_id", "created_by_id", "sold_at");

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_corrects_id_fkey" FOREIGN KEY ("corrects_id") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;
