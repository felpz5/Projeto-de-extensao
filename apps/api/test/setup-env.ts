// Carregado antes dos testes e2e (antes de importar o AppModule).
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET ??= 'e2e-secret-e2e-secret-e2e-secret-e2e-secret';
