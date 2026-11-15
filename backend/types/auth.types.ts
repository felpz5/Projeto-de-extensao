import type { Role } from '@prisma/client';
import type { z } from 'zod';
import type {
  changePasswordSchema,
  loginSchema,
  registerSchema,
  switchTenantSchema,
} from '@/validations/auth.validation';

/** Quem está fazendo a requisição e em qual estabelecimento. Vem SEMPRE do token, nunca do body. */
export interface AuthContext {
  userId: string;
  tenantId: string;
  role: Role;
}

export type RegisterDTO = z.infer<typeof registerSchema>;
export type LoginDTO = z.infer<typeof loginSchema>;
export type SwitchTenantDTO = z.infer<typeof switchTenantSchema>;
export type ChangePasswordDTO = z.infer<typeof changePasswordSchema>;

/** Sessão emitida no login/refresh. O refresh token vai só no cookie httpOnly. */
export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  /** mustChangePassword = senha provisória: o front deve pedir a troca antes de continuar. */
  user: { id: string; name: string; email: string; mustChangePassword: boolean };
  tenant: { id: string; name: string; slug: string; role: Role };
}
