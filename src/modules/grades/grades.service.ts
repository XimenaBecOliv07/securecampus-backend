import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { GradeEntity } from './entities/grade.entity';
import { GradeVersionEntity } from './entities/grade-version.entity';
import { SubmitGradesDto, CorrectGradeDto } from './dto/submit-grade.dto';
import { computeRowHash } from '@shared/crypto/hash-chain.util';
import { AuditService } from '@modules/audit/audit.service';
import { AuthenticatedUser } from '@shared/security/current-user.decorator';

/**
 * Implementa el flujo critico descrito en el analisis: captura por el
 * profesor -> validacion -> version append-only con hash encadenado ->
 * publicacion -> consulta segura por el alumno (ver GradesController).
 */
@Injectable()
export class GradesService {
  constructor(
    @InjectRepository(GradeEntity) private readonly grades: Repository<GradeEntity>,
    @InjectRepository(GradeVersionEntity) private readonly versions: Repository<GradeVersionEntity>,
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  /**
   * Paso 1-6 del flujo critico: el profesor envia calificaciones de un grupo.
   * Toda la operacion es una sola transaccion (atomicidad + outbox de auditoria).
   */
  async submit(professor: AuthenticatedUser, dto: SubmitGradesDto, ip: string, ua: string) {
    // ABAC: el profesor SOLO puede capturar en grupos donde tiene
    // teaching_assignment vigente. Esto se valida contra la base, nunca
    // se confia en que el cliente "dice" ser el profesor del grupo.
    const isAssigned = await this.professorIsAssignedToGroup(professor.id, dto.groupId);
    if (!isAssigned) {
      throw new ForbiddenException('No tienes asignacion vigente en este grupo');
    }

    const windowOpen = await this.gradingWindowIsOpen(dto.groupId);
    if (!windowOpen) {
      throw new BadRequestException('La ventana de captura de calificaciones esta cerrada');
    }

    return this.dataSource.transaction(async (manager) => {
      const results = [];

      for (const entry of dto.entries) {
        const belongsToGroup = await this.enrollmentBelongsToGroup(entry.enrollmentId, dto.groupId);
        if (!belongsToGroup) {
          throw new BadRequestException(`enrollment ${entry.enrollmentId} no pertenece al grupo`);
        }

        let grade = await manager.findOne(GradeEntity, {
          where: { enrollmentId: entry.enrollmentId, component: dto.component },
        });
        if (!grade) {
          grade = await manager.save(
            manager.create(GradeEntity, { enrollmentId: entry.enrollmentId, component: dto.component }),
          );
        }

        const last = await manager.findOne(GradeVersionEntity, {
          where: { gradeId: grade.id },
          order: { version: 'DESC' },
        });

        if (last?.status === 'PUBLISHED') {
          throw new BadRequestException(
            `La calificacion ${grade.id} ya fue publicada; usa el flujo de rectificacion`,
          );
        }

        const version = (last?.version ?? 0) + 1;
        const prevHash = last?.rowHash ?? null;
        const rowHash = computeRowHash(prevHash, {
          gradeId: grade.id,
          version,
          value: entry.value,
          status: 'SUBMITTED',
        });

        const saved = await manager.save(
          manager.create(GradeVersionEntity, {
            gradeId: grade.id,
            version,
            value: entry.value,
            status: 'SUBMITTED',
            enteredBy: professor.id,
            enteredAt: new Date(),
            supersedesId: last?.id ?? null,
            idempotencyKey: `${dto.idempotencyKey}:${entry.enrollmentId}`,
            prevHash,
            rowHash,
          }),
        );
        results.push(saved);
      }

      await this.audit.log({
        actorId: professor.id,
        actorRole: 'PROFESSOR',
        action: 'GRADE_SUBMIT',
        resourceType: 'grade',
        resourceId: dto.groupId,
        outcome: 'SUCCESS',
        ip,
        userAgent: ua,
        after: { component: dto.component, count: results.length },
      });

      return results;
    });
  }

  /** Paso 8-9: publicacion, requiere confirmacion explicita (step-up en el controller). */
  async publish(actor: AuthenticatedUser, groupId: string, component: string, ip: string, ua: string) {
    // ... localizar todas las grade_version en estado SUBMITTED de ese
    //     grupo/componente y actualizarlas a PUBLISHED dentro de una
    //     transaccion, respetando que es append-only (se inserta una
    //     nueva fila con status PUBLISHED, no se hace UPDATE) ...

    await this.audit.log({
      actorId: actor.id,
      actorRole: actor.roles.join(','),
      action: 'GRADE_PUBLISH',
      resourceType: 'grade',
      resourceId: groupId,
      outcome: 'SUCCESS',
      ip,
      userAgent: ua,
      after: { component },
    });
  }

  /** Correccion posterior a publicacion: exige motivo y, idealmente, aprobacion del Jefe de Carrera. */
  async correct(actor: AuthenticatedUser, dto: CorrectGradeDto, ip: string, ua: string) {
    const last = await this.versions.findOne({
      where: { gradeId: dto.gradeId },
      order: { version: 'DESC' },
    });
    if (!last) throw new BadRequestException('Calificacion no encontrada');

    const version = last.version + 1;
    const rowHash = computeRowHash(last.rowHash, {
      gradeId: dto.gradeId,
      version,
      value: dto.value,
      status: 'CORRECTED',
    });

    const saved = await this.versions.save(
      this.versions.create({
        gradeId: dto.gradeId,
        version,
        value: dto.value,
        status: 'CORRECTED',
        enteredBy: actor.id,
        approvedBy: dto.approvedBy ?? null,
        reason: dto.reason,
        supersedesId: last.id,
        prevHash: last.rowHash,
        rowHash,
      }),
    );

    await this.audit.log({
      actorId: actor.id,
      actorRole: actor.roles.join(','),
      action: 'GRADE_CORRECT',
      resourceType: 'grade',
      resourceId: dto.gradeId,
      outcome: 'SUCCESS',
      ip,
      userAgent: ua,
      before: { value: last.value },
      after: { value: dto.value, reason: dto.reason },
    });

    return saved;
  }

  /**
   * Paso 11-14: consulta segura del estudiante. El filtro por propietario
   * ocurre en la CONSULTA misma (no se filtra en memoria despues de traer
   * todo), y solo se exponen versiones PUBLISHED.
   */
  async getMyGrades(student: AuthenticatedUser) {
    return this.versions
      .createQueryBuilder('gv')
      .innerJoin('grade', 'g', 'g.id = gv.grade_id')
      .innerJoin('enrollment', 'e', 'e.id = g.enrollment_id')
      .where('e.student_id = :studentId', { studentId: student.id })
      .andWhere('gv.status = :status', { status: 'PUBLISHED' })
      .distinctOn(['gv.grade_id'])
      .orderBy('gv.grade_id')
      .addOrderBy('gv.version', 'DESC')
      .select(['g.component AS component', 'gv.value AS value', 'gv.entered_at AS entered_at'])
      .getRawMany();
  }

  // ---- helpers de validacion ABAC (consultan la fuente de verdad en BD) ----

  private async professorIsAssignedToGroup(professorId: string, groupId: string): Promise<boolean> {
    const row = await this.dataSource.query(
      `SELECT 1 FROM teaching_assignment
       WHERE professor_id = $1 AND group_id = $2
         AND valid_from <= now() AND (valid_to IS NULL OR valid_to > now())`,
      [professorId, groupId],
    );
    return row.length > 0;
  }

  private async gradingWindowIsOpen(groupId: string): Promise<boolean> {
    const row = await this.dataSource.query(
      `SELECT 1 FROM course_group cg JOIN term t ON t.id = cg.term_id
       WHERE cg.id = $1 AND now() BETWEEN t.grading_open_from AND t.grading_open_to`,
      [groupId],
    );
    return row.length > 0;
  }

  private async enrollmentBelongsToGroup(enrollmentId: string, groupId: string): Promise<boolean> {
    const row = await this.dataSource.query(
      `SELECT 1 FROM enrollment WHERE id = $1 AND group_id = $2 AND status = 'ACTIVE'`,
      [enrollmentId, groupId],
    );
    return row.length > 0;
  }
}
