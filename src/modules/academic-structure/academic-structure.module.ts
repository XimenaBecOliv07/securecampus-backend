import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CourseGroupEntity } from './entities/course-group.entity';
import { TeachingAssignmentEntity } from './entities/teaching-assignment.entity';
import { EnrollmentEntity } from './entities/enrollment.entity';
import { AcademicStructureService } from './academic-structure.service';
import { AcademicStructureController } from './academic-structure.controller';
import { AuditModule } from '@modules/audit/audit.module';
import { AccessControlModule } from '@modules/access-control/access-control.module';
import { AuthModule } from '@modules/auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CourseGroupEntity,
      TeachingAssignmentEntity,
      EnrollmentEntity,
    ]),
    AuditModule,
    AccessControlModule,
    AuthModule,
  ],
  controllers: [AcademicStructureController],
  providers: [AcademicStructureService],
  exports: [AcademicStructureService],
})
export class AcademicStructureModule {}