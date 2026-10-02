import { Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PolicyService } from '@shared/security/policy.service';
import { PolicyGuard } from '@shared/security/policy.guard';
import { AccessControlService } from './access-control.service';
import { AuditModule } from '@modules/audit/audit.module';

/**
 * Expone PolicyService y PolicyGuard al resto de la aplicacion.
 * Se importa en app.module ANTES que los modulos de negocio porque
 * practicamente todos dependen de el para autorizar sus endpoints.
 */
@Module({
  imports: [AuditModule],
  providers: [PolicyService, PolicyGuard, Reflector, AccessControlService],
  exports: [PolicyService, PolicyGuard, AccessControlService],
})
export class AccessControlModule {}
