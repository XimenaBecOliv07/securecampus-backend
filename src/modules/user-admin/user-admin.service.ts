import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditService } from '@modules/audit/audit.service';
import { AccessControlService } from '@modules/access-control/access-control.service';
import { AuthenticatedUser } from '@shared/security/current-user.decorator';

/**
 * Administracion de usuarios, reservada a ADMIN. Estas son las
 * "operaciones condicionadas": en el controller se exige un header
 * `x-step-up-token` (reautenticacion reciente / MFA) antes de llegar
 * aqui para cualquier metodo de este servicio.
 */
@Injectable()
export class UserAdminService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    private readonly accessControl: AccessControlService,
  ) {}

  async deactivateUser(actor: AuthenticatedUser, targetUserId: string, reason: string) {
    if (actor.id === targetUserId) {
      throw new BadRequestException('Un administrador no puede desactivarse a si mismo');
    }

    await this.dataSource.query(`UPDATE users SET status = 'DISABLED', updated_at = now() WHERE id = $1`, [
      targetUserId,
    ]);
    // Cerrar todas las sesiones activas del usuario desactivado.
    await this.dataSource.query(`UPDATE session SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [
      targetUserId,
    ]);

    await this.audit.log({
      actorId: actor.id,
      actorRole: 'ADMIN',
      action: 'USER_DEACTIVATE',
      resourceType: 'user',
      resourceId: targetUserId,
      outcome: 'SUCCESS',
      after: { reason },
    });
  }

  async assignRole(actor: AuthenticatedUser, targetUserId: string, roleName: string, scopeCareerId: string | null) {
    return this.accessControl.assignRole(actor.id, targetUserId, roleName, scopeCareerId);
  }

  /** Lectura de auditoria por el Administrador: la lectura misma tambien se audita. */
  async readAuditLog(actor: AuthenticatedUser) {
    await this.audit.log({
      actorId: actor.id,
      actorRole: 'ADMIN',
      action: 'AUDIT_LOG_READ',
      resourceType: 'audit',
      outcome: 'SUCCESS',
    });
    return this.audit.findRecent(200);
  }
}
