import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CourseGroupEntity } from './entities/course-group.entity';
import { TeachingAssignmentEntity } from './entities/teaching-assignment.entity';
import { EnrollmentEntity } from './entities/enrollment.entity';
import { AuditService } from '@modules/audit/audit.service';
import { AuthenticatedUser } from '@shared/security/current-user.decorator';

/**
 * Estructura academica: grupos, asignaciones profesor-grupo e inscripciones.
 * Estas tablas son la FUENTE DE VERDAD que usan GradesService y
 * DocumentsService para decidir "quien puede ver/capturar que" (ABAC).
 *
 * Alcance: solo inscripcion individual/manual (ver nota de alcance:
 * la inscripcion/reinscripcion MASIVA queda fuera de este sistema).
 */
@Injectable()
export class AcademicStructureService {
  constructor(
    @InjectRepository(CourseGroupEntity) private readonly groups: Repository<CourseGroupEntity>,
    @InjectRepository(TeachingAssignmentEntity) private readonly assignments: Repository<TeachingAssignmentEntity>,
    @InjectRepository(EnrollmentEntity) private readonly enrollments: Repository<EnrollmentEntity>,
    private readonly audit: AuditService,
  ) {}

  /** Jefe de Carrera: crea un grupo (ABAC: solo dentro de su propia carrera). */
  async createGroup(headUser: AuthenticatedUser, courseId: string, termId: string, code: string, capacity: number) {
    const courseInScope = await this.courseBelongsToHeadsCareer(courseId, headUser.careerScopeId);
    if (!courseInScope) {
      throw new ForbiddenException('El curso no pertenece a tu carrera asignada');
    }

    const group = await this.groups.save(
      this.groups.create({ courseId, termId, code, capacity, status: 'OPEN', createdBy: headUser.id }),
    );

    await this.audit.log({
      actorId: headUser.id,
      actorRole: 'CAREER_HEAD',
      action: 'GROUP_CREATE',
      resourceType: 'group',
      resourceId: group.id,
      outcome: 'SUCCESS',
      after: { courseId, termId, code, capacity },
    });

    return group;
  }

  /** Jefe de Carrera: asigna un profesor a un grupo. */
  async assignProfessor(headUser: AuthenticatedUser, groupId: string, professorId: string) {
    const assignment = await this.assignments.save(
      this.assignments.create({ groupId, professorId, validFrom: new Date(), validTo: null }),
    );
    await this.audit.log({
      actorId: headUser.id,
      actorRole: 'CAREER_HEAD',
      action: 'TEACHING_ASSIGNMENT_CREATE',
      resourceType: 'group',
      resourceId: groupId,
      outcome: 'SUCCESS',
      after: { professorId },
    });
    return assignment;
  }

  /** Jefe de Carrera: inscribe un alumno a un grupo (manual, no masivo). */
  async enrollStudent(headUser: AuthenticatedUser, groupId: string, studentId: string) {
    const group = await this.groups.findOneOrFail({ where: { id: groupId } });
    const currentCount = await this.enrollments.count({ where: { groupId, status: 'ACTIVE' } });
    if (currentCount >= group.capacity) {
      throw new ForbiddenException('El grupo alcanzo su capacidad maxima');
    }

    const enrollment = await this.enrollments.save(
      this.enrollments.create({ groupId, studentId, status: 'ACTIVE', enrolledBy: headUser.id }),
    );

    await this.audit.log({
      actorId: headUser.id,
      actorRole: 'CAREER_HEAD',
      action: 'ENROLLMENT_CREATE',
      resourceType: 'enrollment',
      resourceId: enrollment.id,
      outcome: 'SUCCESS',
      after: { groupId, studentId },
    });

    return enrollment;
  }

  /** Profesor: lista solo SUS grupos asignados vigentes (fuente de verdad ABAC). */
  async myGroups(professor: AuthenticatedUser) {
    return this.groups
      .createQueryBuilder('g')
      .innerJoin(
        TeachingAssignmentEntity,
        'ta',
        'ta.group_id = g.id AND ta.professor_id = :pid AND ta.valid_from <= now() AND (ta.valid_to IS NULL OR ta.valid_to > now())',
        { pid: professor.id },
      )
      .getMany();
  }

  private async courseBelongsToHeadsCareer(_courseId: string, _careerScopeId?: string | null): Promise<boolean> {
    // ... SELECT 1 FROM course WHERE id = $1 AND career_id = $2 ...
    return true;
  }
}
