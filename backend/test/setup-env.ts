// Carregado antes dos testes e2e (antes de importar o app).
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET ??= 'e2e-secret-e2e-secret-e2e-secret-e2e-secret';
// As migrations já foram aplicadas antes: nos testes basta a URL do usuário da API.
if (process.env.DATABASE_URL) process.env.DIRECT_URL ??= process.env.DATABASE_URL;
