import { Role } from '@prisma/client';

/** Quem está fazendo a requisição e em qual estabelecimento. Vem SEMPRE do token, nunca do body. */
export interface AuthContext {
  userId: string;
  tenantId: string;
  role: Role;
}
