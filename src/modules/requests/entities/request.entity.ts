import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export type RequestStatus = 'CREATED' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'CLOSED';

@Entity('request')
export class RequestEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'requester_id', type: 'uuid' })
  requesterId: string;

  @Column()
  type: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ default: 'CREATED' })
  status: RequestStatus;

  @Column({ name: 'assigned_to', type: 'uuid', nullable: true })
  assignedTo: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}