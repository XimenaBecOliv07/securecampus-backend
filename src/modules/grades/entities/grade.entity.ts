import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Unique } from 'typeorm';

@Entity('grade')
@Unique(['enrollmentId', 'component'])
export class GradeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'enrollment_id', type: 'uuid' })
  enrollmentId: string;

  @Column()
  component: string; // 'PARCIAL1', 'FINAL', ...

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
