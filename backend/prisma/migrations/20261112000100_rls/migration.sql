-- =============================================================================
-- Gestock — Row Level Security (isolamento entre estabelecimentos)
--
-- A API define, dentro de cada transação:
--   SELECT set_config('app.tenant_id', '<uuid>', true), set_config('app.user_id', '<uuid>', true);
-- e o Postgres só deixa ler/escrever linhas daquele estabelecimento.
--
-- FORCE ROW LEVEL SECURITY faz as políticas valerem também para o dono das tabelas.
-- Ainda assim, em produção a API deve usar um usuário SEM BYPASSRLS (ver prisma/sql/app-role.sql).
-- =============================================================================

CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION app_current_user() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;

-- Tabelas operacionais: só enxergam/gravam linhas do tenant atual.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'categories', 'ingredients', 'products', 'recipe_items', 'weight_mix_items',
    'stock_movements', 'sales', 'sale_items', 'sale_item_ingredients', 'audit_logs'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant())',
      t
    );
  END LOOP;
END $$;

-- Vínculos: o usuário vê os próprios vínculos (para escolher o estabelecimento no login)
-- e, dentro de um tenant, os vínculos daquele tenant. Escrita só no tenant atual.
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY memberships_select ON memberships FOR SELECT
  USING (tenant_id = app_current_tenant() OR user_id = app_current_user());
CREATE POLICY memberships_insert ON memberships FOR INSERT
  WITH CHECK (tenant_id = app_current_tenant());
CREATE POLICY memberships_update ON memberships FOR UPDATE
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
CREATE POLICY memberships_delete ON memberships FOR DELETE
  USING (tenant_id = app_current_tenant());

-- Estabelecimentos: visível se for o tenant atual ou se o usuário for membro.
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenants_select ON tenants FOR SELECT
  USING (
    id = app_current_tenant()
    OR EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = tenants.id AND m.user_id = app_current_user())
  );
CREATE POLICY tenants_insert ON tenants FOR INSERT
  WITH CHECK (id = app_current_tenant());
CREATE POLICY tenants_update ON tenants FOR UPDATE
  USING (id = app_current_tenant()) WITH CHECK (id = app_current_tenant());
CREATE POLICY tenants_delete ON tenants FOR DELETE
  USING (id = app_current_tenant());

-- users e refresh_tokens são globais (autenticação) e ficam sem RLS:
-- a API só os acessa pelo módulo de autenticação.

-- Saldo atual por ingrediente (respeita RLS de quem consulta).
CREATE VIEW stock_levels WITH (security_invoker = true) AS
  SELECT tenant_id, ingredient_id, COALESCE(SUM(quantity), 0)::numeric(14, 3) AS quantity
  FROM stock_movements
  GROUP BY tenant_id, ingredient_id;
