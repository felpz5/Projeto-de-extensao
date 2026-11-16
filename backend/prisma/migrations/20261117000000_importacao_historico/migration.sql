-- Importação de histórico de vendas (CSV) para relatórios e previsão, e marcação da loja de
-- demonstração. Vendas importadas NÃO geram movimentação de estoque (o saldo atual não muda).

-- Loja de demonstração (seed): a interface avisa que os dados são simulados.
ALTER TABLE "tenants" ADD COLUMN "is_demo" BOOLEAN NOT NULL DEFAULT false;

-- CreateEnum
CREATE TYPE "SaleSource" AS ENUM ('APP', 'IMPORT');

-- CreateTable
CREATE TABLE "sale_imports" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "rows" INTEGER NOT NULL,
    "first_day" DATE NOT NULL,
    "last_day" DATE NOT NULL,
    "total_amount" DECIMAL(14,2) NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undone_at" TIMESTAMP(3),
    "undone_by_id" UUID,
    CONSTRAINT "sale_imports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sale_imports_tenant_id_created_at_idx" ON "sale_imports"("tenant_id", "created_at");
-- Mesmo conteúdo não entra duas vezes enquanto o lote estiver ativo (desfeito libera de novo).
CREATE UNIQUE INDEX "sale_imports_active_hash_key" ON "sale_imports"("tenant_id", "content_hash")
  WHERE "undone_at" IS NULL;

ALTER TABLE "sale_imports" ADD CONSTRAINT "sale_imports_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "sales" ADD COLUMN "source" "SaleSource" NOT NULL DEFAULT 'APP',
ADD COLUMN "import_id" UUID;

CREATE INDEX "sales_import_id_idx" ON "sales"("import_id");

ALTER TABLE "sales" ADD CONSTRAINT "sales_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "sale_imports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Isolamento entre estabelecimentos, igual às outras tabelas operacionais.
ALTER TABLE "sale_imports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sale_imports" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "sale_imports"
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());

-- A API registra e desfaz lotes, mas não apaga (histórico de importações fica guardado).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gestock_app') THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE "sale_imports" TO gestock_app;
    REVOKE DELETE ON TABLE "sale_imports" FROM gestock_app;
  END IF;
END $$;
