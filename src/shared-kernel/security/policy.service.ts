import { Injectable } from '@nestjs/common';
import { newEnforcer, Enforcer } from 'casbin';
import { join } from 'path';

/**
 * PolicyEnforcer: punto UNICO de decision de autorizacion (ABAC sobre RBAC).
 * Todos los modulos de negocio deben llamar a `can()` antes de leer o
 * escribir un recurso ajeno. Las politicas viven en model.conf / policy.csv
 * y se auditan como cualquier otro artefacto versionado.
 */
@Injectable()
export class PolicyService {
  private enforcerPromise: Promise<Enforcer>;

  constructor() {
    this.enforcerPromise = newEnforcer(
      join(__dirname, 'casbin/model.conf'),
      join(__dirname, 'casbin/policy.csv'),
    );
  }

  /**
   * @param subjectRoles roles del usuario autenticado
   * @param object       recurso, ej. "grade", "document", "user"
   * @param action       accion, ej. "read", "write"
   */
  async can(subjectRoles: string[], object: string, action: string): Promise<boolean> {
    const enforcer = await this.enforcerPromise;
    for (const role of subjectRoles) {
      if (await enforcer.enforce(role, object, action)) return true;
    }
    return false;
  }
}
