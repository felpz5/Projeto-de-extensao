import type { z } from 'zod';
import type {
  addMemberSchema,
  updateMemberSchema,
  updateTenantSchema,
} from '@/validations/tenant.validation';

export type UpdateTenantDTO = z.infer<typeof updateTenantSchema>;
export type AddMemberDTO = z.infer<typeof addMemberSchema>;
export type UpdateMemberDTO = z.infer<typeof updateMemberSchema>;
