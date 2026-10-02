import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Unique } from 'typeorm';

/** Inmutable salvo scan_status (ver trigger fn_docver_guard en el script SQL). */
@Entity('document_version')
@Unique(['documentId', 'version'])
export class DocumentVersionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'document_id', type: 'uuid' })
  documentId: string;

  @Column()
  version: number;

  @Column({ name: 'storage_key', unique: true })
  storageKey: string; // clave en MinIO/S3, nunca el nombre original

  @Column({ length: 64 })
  sha256: string;

  @Column({ name: 'size_bytes', type: 'bigint' })
  sizeBytes: number;

  @Column({ name: 'mime_type' })
  mimeType: string;

  @Column({ name: 'enc_key_ref' })
  encKeyRef: string; // referencia a la DEK cifrada por el KMS

  @Column({ name: 'scan_status', default: 'PENDING' })
  scanStatus: 'PENDING' | 'CLEAN' | 'INFECTED';

  @Column({ name: 'uploaded_by', type: 'uuid' })
  uploadedBy: string;

  @CreateDateColumn({ name: 'uploaded_at' })
  uploadedAt: Date;
}
