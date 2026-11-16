-- Cria (ou atualiza) o usuário de banco usado pela API. Rodar como dono do banco, DEPOIS das migrations.
-- Ele NÃO tem BYPASSRLS, então as políticas de RLS sempre valem.
-- Troque a senha antes de executar (no Docker isso é feito automaticamente com APP_DB_PASSWORD)
-- e coloque a URL dele em DATABASE_URL. Pode rodar quantas vezes quiser (idempotente).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gestock_app') THEN
    CREATE ROLE gestock_app LOGIN PASSWORD 'TROQUE-ESTA-SENHA'
      NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  ELSE
    -- Só mexe nos atributos que estiverem errados: em bancos gerenciados (Neon, Supabase) o dono
    -- não é superusuário e o Postgres recusa até um "NOSUPERUSER" que não muda nada.
    ALTER ROLE gestock_app LOGIN PASSWORD 'TROQUE-ESTA-SENHA';
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gestock_app' AND rolsuper) THEN
      ALTER ROLE gestock_app NOSUPERUSER;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gestock_app'
               AND (rolbypassrls OR rolcreatedb OR rolcreaterole)) THEN
      ALTER ROLE gestock_app NOBYPASSRLS NOCREATEDB NOCREATEROLE;
    END IF;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO gestock_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO gestock_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO gestock_app;
GRANT EXECUTE ON FUNCTION app_current_tenant(), app_current_user() TO gestock_app;

-- Tabelas criadas por migrations futuras também ficam acessíveis:
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO gestock_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO gestock_app;

-- A API não precisa mexer no histórico de migrations.
REVOKE ALL ON TABLE _prisma_migrations FROM gestock_app;

-- Auditoria só cresce: a API pode registrar, mas não alterar nem apagar o histórico.
REVOKE UPDATE, DELETE ON TABLE audit_logs FROM gestock_app;

-- Lotes de importação: a API registra e desfaz (undone_at), mas não apaga o registro.
REVOKE DELETE ON TABLE sale_imports FROM gestock_app;
