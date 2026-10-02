import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('document')
export class DocumentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'owner_user_id', type: 'uuid' })
  ownerUserId: string;

  @Column({ name: 'doc_type' })
  docType: string;

  @Column({ default: 'ACTIVE' })
  status: 'ACTIVE' | 'ARCHIVED' | 'LEGAL_HOLD';

  @Column({ name: 'current_version_id', type: 'uuid', nullable: true })
  currentVersionId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
