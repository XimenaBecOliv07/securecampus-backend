import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogEntity } from './entities/audit-log.entity';
import { AuditService } from './audit.service';

/**
 * Modulo transversal: expone AuditService a cualquier otro modulo via
 * `exports`. No expone controlador propio de escritura (nadie fuera de la
 * app debe poder insertar auditoria); solo un endpoint de LECTURA para
 * Administrador (ver AuditController si se requiere UI de auditoria).
 */
@Module({
  imports: [TypeOrmModule.forFeature([AuditLogEntity])],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
