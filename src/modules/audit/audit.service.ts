import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLogEntity } from './entities/audit-log.entity';
import { computeRowHash } from '@shared/crypto/hash-chain.util';

export interface AuditEntry {
  actorId: string | null;
  actorRole: string | null;
  action: string;
  resourceType?: string;
  resourceId?: string;
  outcome: 'SUCCESS' | 'DENIED' | 'FAILURE';
  ip?: string;
  userAgent?: string;
  correlationId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

/**
 * Unico punto de escritura de auditoria. Cualquier modulo que ejecute una
 * operacion critica (login, cambio de calificacion, subida de documento,
 * cambio de rol, etc.) debe llamar a `log()`, idealmente dentro de la
 * MISMA transaccion de base de datos que la operacion (patron outbox),
 * para que ninguna escritura de negocio quede sin registrar.
 *
 * Este servicio NO expone update/delete: la tabla es append-only y ademas
 * esta protegida por un trigger en PostgreSQL (fn_block_mutation).
 */
@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLogEntity)
    private readonly repo: Repository<AuditLogEntity>,
  ) {}

  async log(entry: AuditEntry): Promise<void> {
    const last = await this.repo.findOne({ where: {}, order: { id: 'DESC' } });
    const prevHash = last?.rowHash ?? null;

    const rowHash = computeRowHash(prevHash, {
      actorId: entry.actorId,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      outcome: entry.outcome,
    });

    const row = this.repo.create({
      actorId: entry.actorId,
      actorRole: entry.actorRole,
      action: entry.action,
      resourceType: entry.resourceType ?? null,
      resourceId: entry.resourceId ?? null,
      outcome: entry.outcome,
      ip: entry.ip ?? null,
      userAgent: entry.userAgent ?? null,
      correlationId: entry.correlationId ?? null,
      beforeJson: entry.before ?? null,
      afterJson: entry.after ?? null,
      prevHash,
      rowHash,
    });

    await this.repo.save(row);
  }

  /** Solo lectura. La lectura misma de logs por un Administrador se audita en el controller. */
  async findRecent(limit = 100) {
    return this.repo.find({ order: { ts: 'DESC' }, take: limit });
  }
}
