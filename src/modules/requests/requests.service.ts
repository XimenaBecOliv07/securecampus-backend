import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RequestEntity, RequestStatus } from './entities/request.entity';
import { AuditService } from '@modules/audit/audit.service';
import { AuthenticatedUser } from '@shared/security/current-user.decorator';

/**
 * Workflow simple de solicitudes con historial inmutable (request_event,
 * ver script SQL). Cada transicion de estado se registra por separado del
 * `audit_log` general porque es el propio dominio del modulo (el alumno
 * necesita ver "su historial de solicitudes" sin ser Administrador).
 */
@Injectable()
export class RequestsService {
  constructor(
    @InjectRepository(RequestEntity) private readonly requests: Repository<RequestEntity>,
    private readonly audit: AuditService,
  ) {}

  async create(user: AuthenticatedUser, type: string, description?: string) {
    const req = await this.requests.save(
      this.requests.create({ requesterId: user.id, type, description: description ?? null }),
    );
    // ... INSERT en request_event(request_id, from_status=null, to_status='CREATED', actor_id) ...
    await this.audit.log({
      actorId: user.id,
      actorRole: user.roles.join(','),
      action: 'REQUEST_CREATE',
      resourceType: 'request',
      resourceId: req.id,
      outcome: 'SUCCESS',
    });
    return req;
  }

  /** El solicitante solo ve SUS solicitudes; staff ve las que tiene asignadas. */
  async myRequests(user: AuthenticatedUser) {
    return this.requests.find({ where: { requesterId: user.id }, order: { createdAt: 'DESC' } });
  }

  async transition(actor: AuthenticatedUser, requestId: string, toStatus: RequestStatus, comment?: string) {
    const req = await this.requests.findOne({ where: { id: requestId } });
    if (!req) throw new NotFoundException('Solicitud no encontrada');

    if (req.requesterId === actor.id && !actor.roles.some((r) => r !== 'STUDENT')) {
      throw new ForbiddenException('No puedes cambiar el estado de tu propia solicitud');
    }

    const fromStatus = req.status;
    req.status = toStatus;
    await this.requests.save(req);

    // ... INSERT en request_event(request_id, from_status, to_status, actor_id, comment) ...

    await this.audit.log({
      actorId: actor.id,
      actorRole: actor.roles.join(','),
      action: 'REQUEST_TRANSITION',
      resourceType: 'request',
      resourceId: requestId,
      outcome: 'SUCCESS',
      before: { status: fromStatus },
      after: { status: toStatus, comment },
    });

    return req;
  }
}
