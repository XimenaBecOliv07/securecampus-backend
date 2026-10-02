import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

/**
 * Append-only por diseno: no se define ningun metodo de actualizacion en
 * el repositorio (AuditService solo expone `log()` y `find*`), y la base
 * de datos bloquea UPDATE/DELETE con un trigger (ver script SQL).
 */
@Entity('audit_log')
export class AuditLogEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @CreateDateColumn({ name: 'ts' })
  ts: Date;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId: string | null;

  @Column({ name: 'actor_role', type: 'text', nullable: true })
  actorRole: string | null;

  @Column({ type: 'text' })
  action: string;

  @Column({ name: 'resource_type', type: 'text', nullable: true })
  resourceType: string | null;

  @Column({ name: 'resource_id', type: 'text', nullable: true })
  resourceId: string | null;

  @Column({ type: 'text' })
  outcome: 'SUCCESS' | 'DENIED' | 'FAILURE';

  @Column({ type: 'inet', nullable: true })
  ip: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent: string | null;

  @Column({ name: 'correlation_id', type: 'uuid', nullable: true })
  correlationId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  beforeJson: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  afterJson: Record<string, unknown> | null;

  @Column({ name: 'prev_hash', type: 'text', nullable: true })
  prevHash: string | null;

  @Column({ name: 'row_hash', type: 'text', nullable: true })
  rowHash: string | null;
}