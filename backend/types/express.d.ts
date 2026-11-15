import type { AuthContext } from '@/types/auth.types';

declare global {
  namespace Express {
    interface Request {
      /** Preenchido pelo auth.middleware: quem é o usuário e em qual estabelecimento está. */
      user?: AuthContext;
    }
  }
}

export {};
