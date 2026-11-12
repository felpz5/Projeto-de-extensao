import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { AuthContext } from '../../common/auth-context';
import { Auth, Roles } from '../../common/decorators';
import { uuid } from '../../common/schemas';
import { ZodPipe } from '../../common/zod.pipe';
import {
  AddMemberInput,
  addMemberSchema,
  UpdateMemberInput,
  updateMemberSchema,
  UpdateTenantInput,
  updateTenantSchema,
} from './tenants.schemas';
import { TenantsService } from './tenants.service';

@Controller('tenant')
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Get()
  current(@Auth() auth: AuthContext) {
    return this.tenants.current(auth);
  }

  @Roles('OWNER')
  @Patch()
  update(@Auth() auth: AuthContext, @Body(new ZodPipe(updateTenantSchema)) body: UpdateTenantInput) {
    return this.tenants.update(auth, body);
  }

  @Roles('OWNER', 'MANAGER')
  @Get('members')
  members(@Auth() auth: AuthContext) {
    return this.tenants.listMembers(auth);
  }

  @Roles('OWNER')
  @Post('members')
  addMember(@Auth() auth: AuthContext, @Body(new ZodPipe(addMemberSchema)) body: AddMemberInput) {
    return this.tenants.addMember(auth, body);
  }

  @Roles('OWNER')
  @Patch('members/:userId')
  updateMember(
    @Auth() auth: AuthContext,
    @Param('userId', new ZodPipe(uuid)) userId: string,
    @Body(new ZodPipe(updateMemberSchema)) body: UpdateMemberInput,
  ) {
    return this.tenants.updateMember(auth, userId, body);
  }

  @Roles('OWNER')
  @HttpCode(204)
  @Delete('members/:userId')
  removeMember(@Auth() auth: AuthContext, @Param('userId', new ZodPipe(uuid)) userId: string) {
    return this.tenants.removeMember(auth, userId);
  }
}
