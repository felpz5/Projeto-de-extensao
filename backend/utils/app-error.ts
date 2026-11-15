/**
 * Erro de negócio com o status HTTP da resposta. Tratado pelo error-handler.middleware.
 * `code` (opcional) é um identificador estável para o front decidir o que fazer.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code?: string;

  constructor(message: string, statusCode = 400, code?: string) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}
