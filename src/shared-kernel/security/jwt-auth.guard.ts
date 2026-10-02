import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

/**
 * Valida el access token (JWT de vida corta) y adjunta el usuario al
 * request. No decide autorizacion (eso lo hace PolicyGuard); solo
 * responde: "quien eres".
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const header = request.headers['authorization'] as string | undefined;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;

    if (!token) throw new UnauthorizedException('Token no proporcionado');

    try {
      const payload = await this.jwt.verifyAsync(token, {
        secret: process.env.JWT_ACCESS_SECRET,
      });
      request.user = {
        id: payload.sub,
        roles: payload.roles ?? [],
        careerScopeId: payload.careerScopeId ?? null,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Token invalido o expirado');
    }
  }
}
