import { PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

/**
 * Entidad base para tablas mutables normales (perfiles, grupos, etc).
 * Las tablas append-only (grade_version, audit_log, request_event,
 * document_version) NO extienden de esta clase: definen su propio
 * esquema y bloquean UPDATE/DELETE a nivel de base de datos.
 */
export abstract class BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
