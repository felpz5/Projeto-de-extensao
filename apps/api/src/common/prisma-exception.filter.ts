import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

/** Converte erros conhecidos do Prisma em respostas HTTP claras, sem vazar detalhes do banco. */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const map: Record<string, [number, string]> = {
      P2002: [HttpStatus.CONFLICT, 'Já existe um registro com esses dados'],
      P2003: [HttpStatus.CONFLICT, 'Registro em uso ou referência inválida'],
      P2025: [HttpStatus.NOT_FOUND, 'Registro não encontrado'],
    };
    const [status, message] = map[exception.code] ?? [
      HttpStatus.INTERNAL_SERVER_ERROR,
      'Erro interno',
    ];
    if (status === HttpStatus.INTERNAL_SERVER_ERROR) this.logger.error(exception.message);
    res.status(status).json({ statusCode: status, message });
  }
}
