import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomBytes, createHash, randomUUID } from 'crypto';

import { CredentialEntity } from './entities/credential.entity';
import { SessionEntity } from './entities/session.entity';
import { AuditService } from '@modules/audit/audit.service';

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const RESET_TOKEN_TTL_MIN = 20;

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(CredentialEntity)
    private readonly credentials: Repository<CredentialEntity>,

    @InjectRepository(SessionEntity)
    private readonly sessions: Repository<SessionEntity>,

    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly dataSource: DataSource,
  ) {}

  async login(
    email: string,
    password: string,
    mfaCode: string | undefined,
    ip: string,
    ua: string,
  ) {
    const userId = await this.resolveUserIdByEmail(email);

    if (!userId) {
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

    const cred = await this.credentials.findOne({
      where: { userId },
    });

    if (!cred) {
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

    const passwordOk = await argon2.verify(
      cred.passwordHash,
      password,
    );

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

    if (
      cred.mfaEnabled &&
      !this.verifyMfaCode(cred.mfaSecretEnc, mfaCode)
    ) {
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

    await this.clearFailedAttempts(userId);

    const roles = await this.loadRoles(userId);

    const { accessToken, refreshToken } =
      await this.issueTokens(userId, roles, ip, ua);

    await this.audit.log({
      actorId: userId,
      actorRole: roles.join(','),
      action: 'LOGIN',
      outcome: 'SUCCESS',
      ip,
      userAgent: ua,
    });

    return {
      accessToken,
      refreshToken,
    };
  }

  async refresh(
    rawRefreshToken: string,
    ip: string,
    ua: string,
  ) {
    const hash = this.hashToken(rawRefreshToken);

    const session = await this.sessions.findOne({
      where: { refreshHash: hash },
    });

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt < new Date()
    ) {
      if (session) {
        await this.sessions.update(
          { familyId: session.familyId },
          { revokedAt: new Date() },
        );
      }

      throw new UnauthorizedException(
        'Sesion invalida, inicia sesion de nuevo',
      );
    }

    await this.sessions.update(
      session.id,
      { revokedAt: new Date() },
    );

    const roles = await this.loadRoles(session.userId);

    return this.issueTokens(
      session.userId,
      roles,
      ip,
      ua,
      session.familyId,
    );
  }

  async requestPasswordReset(email: string): Promise<void> {
    const userId = await this.resolveUserIdByEmail(email);

    if (!userId) {
      return;
    }

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);

    const expiresAt = new Date(
      Date.now() + RESET_TOKEN_TTL_MIN * 60_000,
    );

    await this.dataSource.query(
      `INSERT INTO password_reset_token
       (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, tokenHash, expiresAt],
    );

    /*
     * En produccion, rawToken debe enviarse al correo del usuario.
     * Nunca debe almacenarse en texto plano.
     */
    void rawToken;

    await this.audit.log({
      actorId: userId,
      actorRole: null,
      action: 'PASSWORD_RESET_REQUEST',
      outcome: 'SUCCESS',
    });
  }

  async confirmPasswordReset(
    rawToken: string,
    newPassword: string,
  ): Promise<void> {
    const tokenHash = this.hashToken(rawToken);

    const userId =
      await this.resolveUserIdByResetToken(tokenHash);

    if (!userId) {
      throw new UnauthorizedException(
        'Token invalido o expirado',
      );
    }

    const newHash = await argon2.hash(newPassword, {
      type: argon2.argon2id,
      memoryCost: Number(
        process.env.ARGON2_MEMORY_COST ?? 19456,
      ),
      timeCost: Number(
        process.env.ARGON2_TIME_COST ?? 2,
      ),
    });

    await this.credentials.update(
      { userId },
      {
        passwordHash: newHash,
        lastChangeAt: new Date(),
      },
    );

    await this.sessions.update(
      { userId },
      { revokedAt: new Date() },
    );

    await this.dataSource.query(
      `UPDATE password_reset_token
       SET used_at = now()
       WHERE token_hash = $1
         AND used_at IS NULL`,
      [tokenHash],
    );

    await this.audit.log({
      actorId: userId,
      actorRole: null,
      action: 'PASSWORD_RESET_CONFIRM',
      outcome: 'SUCCESS',
    });
  }

  private async issueTokens(
    userId: string,
    roles: string[],
    ip: string,
    ua: string,
    familyId?: string,
  ) {
    const accessToken = await this.jwt.signAsync(
      {
        sub: userId,
        roles,
      },
      {
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn:
          process.env.JWT_ACCESS_TTL ?? '900s',
      },
    );

    const rawRefresh =
      randomBytes(48).toString('hex');

    const refreshHash =
      this.hashToken(rawRefresh);

    const resolvedFamily =
      familyId ?? randomUUID();

    await this.sessions.save(
      this.sessions.create({
        userId,
        refreshHash,
        familyId: resolvedFamily,
        ip,
        userAgent: ua,
        expiresAt: new Date(
          Date.now() + 7 * 24 * 3600 * 1000,
        ),
      }),
    );

    return {
      accessToken,
      refreshToken: rawRefresh,
    };
  }

  private hashToken(raw: string): string {
    return createHash('sha256')
      .update(raw)
      .digest('hex');
  }

  private async registerFailedAttempt(
    userId: string,
  ): Promise<void> {
    await this.dataSource.query(
      `UPDATE users
       SET failed_logins = failed_logins + 1,
           locked_until =
             CASE
               WHEN failed_logins + 1 >= $2
               THEN now() + ($3 * interval '1 minute')
               ELSE locked_until
             END,
           updated_at = now()
       WHERE id = $1`,
      [
        userId,
        MAX_FAILED_LOGINS,
        LOCK_MINUTES,
      ],
    );
  }

  private async clearFailedAttempts(
    userId: string,
  ): Promise<void> {
    await this.dataSource.query(
      `UPDATE users
       SET failed_logins = 0,
           locked_until = NULL,
           updated_at = now()
       WHERE id = $1`,
      [userId],
    );
  }

  private verifyMfaCode(
    secretEnc: Buffer | null,
    code: string | undefined,
  ): boolean {
    if (!secretEnc || !code) {
      return false;
    }

    /*
     * Pendiente para produccion:
     * desencriptar secretEnc mediante KMS y verificar TOTP.
     */
    return true;
  }

  private async resolveUserIdByEmail(
    email: string,
  ): Promise<string | null> {
    const rows = await this.dataSource.query(
      `SELECT id
       FROM users
       WHERE lower(email) = lower($1)
         AND status = 'ACTIVE'
         AND (
           locked_until IS NULL
           OR locked_until <= now()
         )
       LIMIT 1`,
      [email],
    );

    return rows[0]?.id ?? null;
  }

  private async resolveUserIdByResetToken(
    tokenHash: string,
  ): Promise<string | null> {
    const rows = await this.dataSource.query(
      `SELECT user_id
       FROM password_reset_token
       WHERE token_hash = $1
         AND used_at IS NULL
         AND expires_at > now()
       LIMIT 1`,
      [tokenHash],
    );

    return rows[0]?.user_id ?? null;
  }

  private async loadRoles(
    userId: string,
  ): Promise<string[]> {
    const rows = await this.dataSource.query(
      `SELECT r.name
       FROM user_role ur
       INNER JOIN role r
         ON r.id = ur.role_id
       WHERE ur.user_id = $1
         AND ur.valid_from <= now()
         AND (
           ur.valid_to IS NULL
           OR ur.valid_to > now()
         )
       ORDER BY r.name`,
      [userId],
    );

    return rows.map(
      (row: { name: string }) => row.name,
    );
  }
}