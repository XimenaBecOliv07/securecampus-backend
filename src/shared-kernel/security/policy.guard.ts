import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PolicyService } from './policy.service';
import { AuditService } from '@modules/audit/audit.service';

export const POLICY_KEY = 'policy';
export interface PolicyRule {
  object: string;
  action: string;
}

/** Declara el recurso/accion ABAC que protege un endpoint. */
export const CheckPolicy = (object: string, action: string) =>
  SetMetadata(POLICY_KEY, { object, action } as PolicyRule);

/**
 * Guard global de autorizacion. Se ejecuta DESPUES de JwtAuthGuard.
 * Denegar por defecto: si el endpoint no declara @CheckPolicy, se rechaza.
 * Cualquier intento denegado queda auditado (outcome=DENIED).
 */
@Injectable()
export class PolicyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly policy: PolicyService,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const rule = this.reflector.get<PolicyRule>(POLICY_KEY, context.getHandler());
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!rule) {
      // Ningun endpoint protegido por JwtAuthGuard debe carecer de politica.
      throw new ForbiddenException('Endpoint sin politica de autorizacion definida');
    }
    if (!user) throw new ForbiddenException('No autenticado');

    const allowed = await this.policy.can(user.roles, rule.object, rule.action);

    if (!allowed) {
      await this.audit.log({
        actorId: user.id,
        actorRole: user.roles.join(','),
        action: `${rule.object}:${rule.action}`,
        resourceType: rule.object,
        outcome: 'DENIED',
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      });
      throw new ForbiddenException('No autorizado para esta operacion');
    }

    // OJO: esto solo valida RBAC (rol -> permiso). La restriccion ABAC
    // fina ("es MI calificacion", "es MI grupo asignado") se aplica
    // ademas dentro del servicio, filtrando por propietario/alcance
    // directamente en la consulta (ver GradesService, DocumentsService).
    return true;
  }
}
