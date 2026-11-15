-- Saldo de cada ingrediente mantido pelo banco. Antes o saldo era SUM(quantity) de TODO o
-- histórico a cada consulta: com anos de uso (1 milhão de movimentações) levava ~300 ms e
-- crescia todo dia. Agora é uma linha por ingrediente, atualizada por trigger.

-- O preenchimento inicial precisa enxergar as movimentações de TODAS as lojas.
DO $$
BEGIN
  IF NOT (SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname = current_user) THEN
    RAISE EXCEPTION 'Rode esta migration com o usuário dono do banco (superuser ou BYPASSRLS). '
      'Com o usuário da API (gestock_app) a RLS esconderia as movimentações e os saldos ficariam zerados.';
  END IF;
END $$;

-- CreateTable
CREATE TABLE "ingredient_balances" (
    "ingredient_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "quantity" DECIMAL(16,3) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ingredient_balances_pkey" PRIMARY KEY ("ingredient_id")
);

-- CreateIndex
CREATE INDEX "ingredient_balances_tenant_id_idx" ON "ingredient_balances"("tenant_id");

-- AddForeignKey
ALTER TABLE "ingredient_balances" ADD CONSTRAINT "ingredient_balances_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredient_balances" ADD CONSTRAINT "ingredient_balances_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Isolamento entre estabelecimentos, igual às outras tabelas operacionais.
ALTER TABLE "ingredient_balances" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ingredient_balances" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ingredient_balances"
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());

-- Trigger: cada movimentação ajusta o saldo na mesma transação (roda como quem inseriu, com RLS).
CREATE FUNCTION apply_stock_movement_to_balance() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    -- só UPDATE: se o saldo já foi apagado (ex.: estabelecimento excluído em cascata), nada a fazer
    UPDATE ingredient_balances
       SET quantity = quantity - OLD.quantity, updated_at = CURRENT_TIMESTAMP
     WHERE ingredient_id = OLD.ingredient_id;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    INSERT INTO ingredient_balances (ingredient_id, tenant_id, quantity)
    VALUES (NEW.ingredient_id, NEW.tenant_id, NEW.quantity)
    ON CONFLICT (ingredient_id) DO UPDATE
      SET quantity = ingredient_balances.quantity + EXCLUDED.quantity, updated_at = CURRENT_TIMESTAMP;
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER stock_movements_balance
AFTER INSERT OR DELETE OR UPDATE OF quantity, ingredient_id ON stock_movements
FOR EACH ROW EXECUTE FUNCTION apply_stock_movement_to_balance();

-- Preenchimento inicial com o histórico existente.
INSERT INTO ingredient_balances (ingredient_id, tenant_id, quantity)
SELECT ingredient_id, tenant_id, SUM(quantity) FROM stock_movements GROUP BY ingredient_id, tenant_id;

-- O usuário da API lê e o trigger grava (os GRANTs padrão já cobrem tabelas novas; explícito por clareza).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gestock_app') THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE ingredient_balances TO gestock_app;
  END IF;
END $$;
