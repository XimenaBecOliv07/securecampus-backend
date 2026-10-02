import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomBytes, createHash, randomUUID } from 'crypto';

import { CredentialEntity } from './entities/credential.entity';
import { SessionEntity } from './entities/session.entity';
import { AuditService } from '@modules/audit/audit.service';

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const RESET_TOKEN_TTL_MIN = 20;

/**
 * Autenticacion y recuperacion de acceso.
 * - Contrasenas con Argon2id (nunca se guardan en claro ni reversibles).
 * - Bloqueo progresivo tras intentos fallidos (mitigacion de fuerza bruta).
 * - Access token JWT de vida corta + refresh token rotativo almacenado
 *   solo como hash (nunca en claro en base de datos).
 * - Recuperacion de acceso con token de un solo uso y respuesta generica
 *   para no revelar si un correo existe (anti user-enumeration).
 */
@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(CredentialEntity) private readonly credentials: Repository<CredentialEntity>,
    @InjectRepository(SessionEntity) private readonly sessions: Repository<SessionEntity>,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  async login(email: string, password: string, mfaCode: string | undefined, ip: string, ua: string) {
    // Nota: la busqueda de usuario por email y el conteo de intentos
    // fallidos se resuelven contra la tabla `users`; se omite el repo
    // de usuario aqui por brevedad y se asume `userId` ya resuelto.
    const userId = await this.resolveUserIdByEmail(email);

    if (!userId) {
      // Mismo tiempo de respuesta / mismo mensaje que credenciales invalidas,
      // para no filtrar si el correo existe.
      await this.audit.log({
        actorId: null,
        actorRole: null,
        action: 'LOGIN',
        outcome: 'FAILURE',
        ip,
        userAgent: ua,
      });
      throw new UnauthorizedException('Credenciales invalidas');
    }

    const cred = await this.credentials.findOneOrFail({ where: { userId } });
    const passwordOk = await argon2.verify(cred.passwordHash, password);

    if (!passwordOk) {
      await this.registerFailedAttempt(userId);
      await this.audit.log({
        actorId: userId,
        actorRole: null,
        action: 'LOGIN',
        outcome: 'FAILURE',
        ip,
        userAgent: ua,
      });
      throw new UnauthorizedException('Credenciales invalidas');
    }

    if (cred.mfaEnabled && !this.verifyMfaCode(cred.mfaSecretEnc, mfaCode)) {
      await this.audit.log({
        actorId: userId,
        actorRole: null,
        action: 'LOGIN_MFA',
        outcome: 'FAILURE',
        ip,
        userAgent: ua,
      });
      throw new UnauthorizedException('Codigo MFA invalido');
    }

    const roles = await this.loadRoles(userId);
    const { accessToken, refreshToken } = await this.issueTokens(userId, roles, ip, ua);

    await this.audit.log({
      actorId: userId,
      actorRole: roles.join(','),
      action: 'LOGIN',
      outcome: 'SUCCESS',
      ip,
      userAgent: ua,
    });

    return { accessToken, refreshToken };
  }

  /** Rotacion de refresh token con deteccion de reutilizacion (token robado). */
  async refresh(rawRefreshToken: string, ip: string, ua: string) {
    const hash = this.hashToken(rawRefreshToken);
    const session = await this.sessions.findOne({ where: { refreshHash: hash } });

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      if (session) {
        // El token ya fue usado o revocado: posible robo -> se revoca toda la familia.
        await this.sessions.update({ familyId: session.familyId }, { revokedAt: new Date() });
      }
      throw new UnauthorizedException('Sesion invalida, inicia sesion de nuevo');
    }

    await this.sessions.update(session.id, { revokedAt: new Date() });

    const roles = await this.loadRoles(session.userId);
    return this.issueTokens(session.userId, roles, ip, ua, session.familyId);
  }

  async requestPasswordReset(email: string): Promise<void> {
    const userId = await this.resolveUserIdByEmail(email);
    // Siempre se responde igual al llamador, exista o no el correo.
    if (!userId) return;

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MIN * 60_000);

    // ... INSERT en password_reset_token(user_id, token_hash, expires_at) ...
    // ... envio de correo con rawToken (nunca se persiste en claro) ...

    await this.audit.log({
      actorId: userId,
      actorRole: null,
      action: 'PASSWORD_RESET_REQUEST',
      outcome: 'SUCCESS',
    });
    void tokenHash;
    void expiresAt;
  }

  async confirmPasswordReset(rawToken: string, newPassword: string): Promise<void> {
    const tokenHash = this.hashToken(rawToken);
    // ... buscar password_reset_token por tokenHash, validar expires_at y used_at ...
    const userId = await this.resolveUserIdByResetToken(tokenHash);
    if (!userId) throw new UnauthorizedException('Token invalido o expirado');

    const newHash = await argon2.hash(newPassword, {
      type: argon2.argon2id,
      memoryCost: Number(process.env.ARGON2_MEMORY_COST ?? 19456),
      timeCost: Number(process.env.ARGON2_TIME_COST ?? 2),
    });

    await this.credentials.update({ userId }, { passwordHash: newHash, lastChangeAt: new Date() });

    // Cambio de contrasena invalida TODAS las sesiones activas del usuario.
    await this.sessions.update({ userId }, { revokedAt: new Date() });

    await this.audit.log({
      actorId: userId,
      actorRole: null,
      action: 'PASSWORD_RESET_CONFIRM',
      outcome: 'SUCCESS',
    });
  }

  // ---- helpers ----

  private async issueTokens(userId: string, roles: string[], ip: string, ua: string, familyId?: string) {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, roles },
      { secret: process.env.JWT_ACCESS_SECRET, expiresIn: process.env.JWT_ACCESS_TTL ?? '900s' },
    );

    const rawRefresh = randomBytes(48).toString('hex');
    const refreshHash = this.hashToken(rawRefresh);
    const resolvedFamily = familyId ?? randomUUID();

    await this.sessions.save(
      this.sessions.create({
        userId,
        refreshHash,
        familyId: resolvedFamily,
        ip,
        userAgent: ua,
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      }),
    );

    return { accessToken, refreshToken: rawRefresh };
  }

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  private async registerFailedAttempt(userId: string): Promise<void> {
    // ... incrementa users.failed_logins; si alcanza MAX_FAILED_LOGINS,
    //     setea users.locked_until = now() + LOCK_MINUTES ...
    void userId;
    void MAX_FAILED_LOGINS;
    void LOCK_MINUTES;
  }

  private verifyMfaCode(secretEnc: Buffer | null, code: string | undefined): boolean {
    if (!secretEnc || !code) return false;
    // ... desencriptar secretEnc via KMS y verificar TOTP (ej. libreria 'otplib') ...
    return true;
  }

  private async resolveUserIdByEmail(_email: string): Promise<string | null> {
    // ... SELECT id FROM users WHERE email = $1 AND status = 'ACTIVE' ...
    return null;
  }

  private async resolveUserIdByResetToken(_tokenHash: string): Promise<string | null> {
    return null;
  }

  private async loadRoles(_userId: string): Promise<string[]> {
    // ... SELECT role.name FROM user_role JOIN role ... WHERE user_id = $1
    //     AND (valid_to IS NULL OR valid_to > now()) ...
    return [];
  }
}
