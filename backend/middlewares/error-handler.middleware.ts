import { Prisma } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '@/utils/app-error';
import { logger } from '@/utils/logger';

/** Erros conhecidos do Prisma → resposta HTTP clara, sem vazar detalhes do banco. */
const PRISMA_ERRORS: Record<string, [number, string]> = {
  P2002: [409, 'Já existe um registro com esses dados'],
  P2003: [409, 'Registro em uso ou referência inválida'],
  P2025: [404, 'Registro não encontrado'],
  P2000: [400, 'Texto longo demais para o campo'],
  P2020: [400, 'Valor fora do limite permitido'],
};

/** Pool cheio ou banco inacessível: problemas que passam sozinhos (não são bugs). */
function isTransient(error: Error) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // P2028 = não conseguiu iniciar a transação a tempo · P2024 = tempo esgotado no pool
    return ['P2028', 'P2024', 'P1001', 'P1002', 'P1017'].includes(error.code);
  }
  return error instanceof Prisma.PrismaClientInitializationError;
}

/** Erros do body-parser do Express (JSON malformado, corpo grande demais). */
interface HttpParserError extends Error {
  status?: number;
  type?: string;
}

export function errorHandlerMiddleware(
  error: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (error instanceof ZodError) {
    return res.status(422).json({
      message: 'Erro de validação',
      issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  if (error instanceof AppError) {
    return res
      .status(error.statusCode)
      .json(error.code ? { message: error.message, code: error.code } : { message: error.message });
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError && PRISMA_ERRORS[error.code]) {
    const [status, message] = PRISMA_ERRORS[error.code];
    return res.status(status).json({ message });
  }

  // Sobrecarga passageira: todas as conexões do pool ocupadas (P2028: a transação nem começou,
  // nada foi gravado) ou banco momentaneamente fora do ar. 503 + Retry-After diz ao cliente que
  // pode tentar de novo — diferente de um 500 (bug).
  if (isTransient(error)) {
    logger.warn('Servidor ocupado ou banco indisponível', { message: error.message });
    res.setHeader('Retry-After', '2');
    return res
      .status(503)
      .json({
        message: 'O servidor está ocupado agora. Tente de novo em alguns segundos.',
        code: 'BUSY',
      });
  }

  const parserError = error as HttpParserError;
  if (parserError.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'JSON inválido' });
  }
  if (parserError.type === 'entity.too.large') {
    return res.status(413).json({ message: 'Requisição grande demais' });
  }

  logger.error('Erro não tratado', { message: error.message, stack: error.stack });
  return res.status(500).json({ message: 'Erro interno do servidor' });
}
