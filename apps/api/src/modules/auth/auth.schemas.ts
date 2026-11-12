import { z } from 'zod';
import { timezone, uuid } from '../../common/schemas';

const email = z
  .string()
  .trim()
  .toLowerCase()
  .email('E-mail inválido')
  .max(254);

export const password = z
  .string()
  .min(8, 'A senha precisa ter pelo menos 8 caracteres')
  .max(128, 'Senha muito longa');

export const registerSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email,
    password,
    establishmentName: z.string().trim().min(2).max(120),
    segment: z.string().trim().max(60).optional(),
    timezone: timezone.optional(),
  })
  .strict();
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z
  .object({
    email,
    password: z.string().min(1).max(128),
    tenantId: uuid.optional(),
  })
  .strict();
export type LoginInput = z.infer<typeof loginSchema>;

export const switchTenantSchema = z.object({ tenantId: uuid }).strict();
export type SwitchTenantInput = z.infer<typeof switchTenantSchema>;

export { email };
