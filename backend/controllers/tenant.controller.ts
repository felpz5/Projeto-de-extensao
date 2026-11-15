import type { Request, Response } from 'express';
import { tenantService } from '@/services/tenant.service';
import { uuid } from '@/validations/common.validation';
import {
  addMemberSchema,
  updateMemberSchema,
  updateTenantSchema,
} from '@/validations/tenant.validation';

export class TenantController {
  async show(req: Request, res: Response) {
    return res.json(await tenantService.current(req.user!));
  }

  async update(req: Request, res: Response) {
    const data = updateTenantSchema.parse(req.body);
    return res.json(await tenantService.update(req.user!, data));
  }

  async listMembers(req: Request, res: Response) {
    return res.json(await tenantService.listMembers(req.user!));
  }

  async addMember(req: Request, res: Response) {
    const data = addMemberSchema.parse(req.body);
    return res.status(201).json(await tenantService.addMember(req.user!, data));
  }

  async updateMember(req: Request, res: Response) {
    const userId = uuid.parse(req.params.userId);
    const data = updateMemberSchema.parse(req.body);
    return res.json(await tenantService.updateMember(req.user!, userId, data));
  }

  async removeMember(req: Request, res: Response) {
    const userId = uuid.parse(req.params.userId);
    await tenantService.removeMember(req.user!, userId);
    return res.status(204).send();
  }
}

export const tenantController = new TenantController();
