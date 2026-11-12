-- Cria o usuário de banco usado pela API (rodar UMA vez, como dono do banco, depois das migrations).
-- Ele NÃO tem BYPASSRLS, então as políticas de RLS sempre valem.
-- Troque a senha antes de executar e coloque a URL dele em DATABASE_URL.

CREATE ROLE gestock_app LOGIN PASSWORD 'TROQUE-ESTA-SENHA' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;

GRANT USAGE ON SCHEMA public TO gestock_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO gestock_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO gestock_app;
GRANT EXECUTE ON FUNCTION app_current_tenant(), app_current_user() TO gestock_app;

-- Tabelas criadas por migrations futuras também ficam acessíveis:
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO gestock_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO gestock_app;

-- A API não precisa mexer no histórico de migrations.
REVOKE ALL ON TABLE _prisma_migrations FROM gestock_app;
