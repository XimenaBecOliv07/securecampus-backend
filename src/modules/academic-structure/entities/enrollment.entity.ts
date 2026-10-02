import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Unique } from 'typeorm';

@Entity('enrollment')
@Unique(['groupId', 'studentId'])
export class EnrollmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'group_id', type: 'uuid' })
  groupId: string;

  @Column({ name: 'student_id', type: 'uuid' })
  studentId: string;

  @Column({ default: 'ACTIVE' })
  status: 'ACTIVE' | 'DROPPED';

  @Column({ name: 'enrolled_by', type: 'uuid' })
  enrolledBy: string;

  @CreateDateColumn({ name: 'enrolled_at' })
  enrolledAt: Date;
}
