import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Unique } from 'typeorm';

@Entity('course_group')
@Unique(['courseId', 'termId', 'code'])
export class CourseGroupEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'course_id', type: 'uuid' })
  courseId: string;

  @Column({ name: 'term_id', type: 'uuid' })
  termId: string;

  @Column()
  code: string;

  @Column()
  capacity: number;

  @Column({ default: 'OPEN' })
  status: 'OPEN' | 'CLOSED';

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
