import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthenticatedUser {
  id: string;
  roles: string[];
  careerScopeId?: string | null; // para Jefe de Carrera (ABAC)
}

/**
 * Extrae el usuario autenticado del request (colocado ahi por JwtAuthGuard).
 * Los controladores NUNCA deben leer un "userId" que venga del body o de la
 * query para decidir de quien son los datos: siempre se usa este decorator.
 */
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
