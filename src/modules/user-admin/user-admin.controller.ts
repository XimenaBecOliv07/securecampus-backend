import { BadRequestException, Body, Controller, Get, Headers, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@shared/security/jwt-auth.guard';
import { PolicyGuard, CheckPolicy } from '@shared/security/policy.guard';
import { CurrentUser, AuthenticatedUser } from '@shared/security/current-user.decorator';
import { UserAdminService } from './user-admin.service';

/**
 * Todas las rutas aqui son "operaciones condicionadas": exigen un header
 * x-step-up-token valido, emitido tras una reautenticacion reciente
 * (password + MFA) con vida muy corta (ej. 5 min). La validacion real del
 * token de step-up se hace en un guard dedicado (StepUpGuard, omitido
 * aqui por brevedad) que se añadiria junto a JwtAuthGuard/PolicyGuard.
 */
@Controller('admin/users')
@UseGuards(JwtAuthGuard, PolicyGuard)
export class UserAdminController {
  constructor(private readonly admin: UserAdminService) {}

  @Post(':id/deactivate')
  @CheckPolicy('user', 'manage')
  deactivate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body('reason') reason: string,
    @Headers('x-step-up-token') stepUp?: string,
  ) {
    if (!stepUp) throw new BadRequestException('Esta operacion requiere reautenticacion (step-up)');
    return this.admin.deactivateUser(user, id, reason);
  }

  @Post(':id/roles')
  @CheckPolicy('role', 'manage')
  assignRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body('roleName') roleName: string,
    @Body('scopeCareerId') scopeCareerId: string | null,
    @Headers('x-step-up-token') stepUp?: string,
  ) {
    if (!stepUp) throw new BadRequestException('Esta operacion requiere reautenticacion (step-up)');
    return this.admin.assignRole(user, id, roleName, scopeCareerId);
  }

  @Get('audit-log')
  @CheckPolicy('audit', 'read')
  auditLog(@CurrentUser() user: AuthenticatedUser) {
  return this.admin.readAuditLog(user);
}
}
