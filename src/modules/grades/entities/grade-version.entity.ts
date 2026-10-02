import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Unique } from 'typeorm';

export type GradeStatus = 'DRAFT' | 'SUBMITTED' | 'PUBLISHED' | 'CORRECTED';

/**
 * Append-only: nunca se hace UPDATE sobre una fila existente. Una
 * "correccion" siempre inserta una fila nueva con `supersedesId` apuntando
 * a la version anterior. La base de datos ademas bloquea UPDATE/DELETE
 * con un trigger (ver script SQL, trg_gv_immutable).
 */
@Entity('grade_version')
@Unique(['gradeId', 'version'])
export class GradeVersionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'grade_id', type: 'uuid' })
  gradeId: string;

  @Column()
  version: number;

  @Column('numeric', { precision: 5, scale: 2 })
  value: number;

  @Column()
  status: GradeStatus;

  @Column({ name: 'entered_by', type: 'uuid' })
  enteredBy: string;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy: string | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @CreateDateColumn({ name: 'entered_at' })
  enteredAt: Date;

  @Column({ name: 'supersedes_id', type: 'uuid', nullable: true })
  supersedesId: string | null;

  @Column({ name: 'idempotency_key', type: 'text', nullable: true, unique: true })
  idempotencyKey: string | null;

  @Column({ name: 'prev_hash', type: 'text', nullable: true })
  prevHash: string | null;

  @Column({ name: 'row_hash', type: 'text', nullable: true })
  rowHash: string | null;
}