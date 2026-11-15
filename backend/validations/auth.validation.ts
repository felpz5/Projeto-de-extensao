import { z } from 'zod';
import { timezone, uuid } from '@/validations/common.validation';

export const email = z.string().trim().toLowerCase().email('E-mail inválido').max(254);

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

export const loginSchema = z
  .object({
    email,
    password: z.string().min(1).max(128),
    tenantId: uuid.optional(),
  })
  .strict();

export const switchTenantSchema = z.object({ tenantId: uuid }).strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: password,
  })
  .strict()
  .refine((d) => d.currentPassword !== d.newPassword, {
    message: 'A nova senha precisa ser diferente da atual',
    path: ['newPassword'],
  });
