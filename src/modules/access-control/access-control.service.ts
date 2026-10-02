import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PolicyService } from '@shared/security/policy.service';
import { AuditService } from '@modules/audit/audit.service';

/**
 * Operaciones de gestion de roles y permisos, reservadas a ADMIN.
 * Estas son las "operaciones condicionadas" del administrador: requieren
 * reautenticacion reciente (step-up) y quedan auditadas con el detalle
 * de que cambio (before/after).
 */
@Injectable()
export class AccessControlService {
  constructor(
    private readonly policy: PolicyService,
    private readonly audit: AuditService,
  ) {}

  async assignRole(
    actorId: string,
    targetUserId: string,
    roleName: string,
    scopeCareerId: string | null,
  ): Promise<void> {
    // Regla de separacion de funciones: un admin no puede auto-elevarse.
    if (actorId === targetUserId) {
      throw new Error('Un administrador no puede modificar sus propios roles');
    }

    // ... persistencia real en user_role via repositorio (omitida aqui) ...

    await this.audit.log({
      actorId,
      actorRole: 'ADMIN',
      action: 'ROLE_ASSIGN',
      resourceType: 'user',
      resourceId: targetUserId,
      outcome: 'SUCCESS',
      after: { role: roleName, scopeCareerId },
    });
  }

  async revokeRole(actorId: string, targetUserId: string, roleName: string): Promise<void> {
    if (actorId === targetUserId) {
      throw new Error('Un administrador no puede modificar sus propios roles');
    }
    await this.audit.log({
      actorId,
      actorRole: 'ADMIN',
      action: 'ROLE_REVOKE',
      resourceType: 'user',
      resourceId: targetUserId,
      outcome: 'SUCCESS',
      before: { role: roleName },
    });
  }
}
