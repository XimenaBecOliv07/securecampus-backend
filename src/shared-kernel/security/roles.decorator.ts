import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Declara que roles (RBAC) pueden intentar llamar a este endpoint.
 * Esto NO es suficiente por si solo: PolicyGuard ademas exige que
 * la operacion pase la politica ABAC del recurso concreto.
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
