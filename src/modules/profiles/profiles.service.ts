import { ForbiddenException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditService } from '@modules/audit/audit.service';
import { AuthenticatedUser } from '@shared/security/current-user.decorator';

/**
 * Perfiles de los 4 actores. El dato clave de seguridad aqui es que
 * `getMyProfile`/`updateMyProfile` SIEMPRE operan sobre el usuario del
 * token (CurrentUser), nunca sobre un id recibido del cliente. Un
 * endpoint separado (no incluido aqui) permite a un Administrador ver
 * el perfil de un tercero, protegido por su propia politica ABAC.
 */
@Injectable()
export class ProfilesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  async getMyProfile(user: AuthenticatedUser) {
    const row = await this.dataSource.query(
      `SELECT p.first_name, p.last_name, p.phone
       FROM person_profile p WHERE p.user_id = $1`,
      [user.id],
    );
    return row[0] ?? null;
  }

  async updateMyProfile(user: AuthenticatedUser, data: { firstName?: string; lastName?: string; phone?: string }) {
    await this.dataSource.query(
      `UPDATE person_profile SET
         first_name = COALESCE($2, first_name),
         last_name  = COALESCE($3, last_name),
         phone      = COALESCE($4, phone),
         updated_at = now()
       WHERE user_id = $1`,
      [user.id, data.firstName ?? null, data.lastName ?? null, data.phone ?? null],
    );

    await this.audit.log({
      actorId: user.id,
      actorRole: user.roles.join(','),
      action: 'PROFILE_UPDATE',
      resourceType: 'profile',
      resourceId: user.id,
      outcome: 'SUCCESS',
      after: data,
    });
  }

  /** Un Administrador puede leer un perfil ajeno; cualquier otro rol queda bloqueado. */
  async getProfileOf(actor: AuthenticatedUser, targetUserId: string) {
    if (actor.id !== targetUserId && !actor.roles.includes('ADMIN')) {
      throw new ForbiddenException('No autorizado para ver este perfil');
    }
    const row = await this.dataSource.query(
      `SELECT p.first_name, p.last_name, p.phone FROM person_profile p WHERE p.user_id = $1`,
      [targetUserId],
    );
    return row[0] ?? null;
  }
}
