import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';

import { AuthModule } from './modules/auth/auth.module';
import { ProfilesModule } from './modules/profiles/profiles.module';
import { AcademicStructureModule } from './modules/academic-structure/academic-structure.module';
import { GradesModule } from './modules/grades/grades.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { RequestsModule } from './modules/requests/requests.module';
import { UserAdminModule } from './modules/user-admin/user-admin.module';
import { AccessControlModule } from './modules/access-control/access-control.module';
import { AuditModule } from './modules/audit/audit.module';

// Composition root: aqui se conectan todos los modulos.
// Ningun modulo de negocio importa a otro directamente salvo por su
// "contracts/" publico (ver *.module.ts de cada uno con `exports`).
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'postgres',
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT ?? 5432),
        username: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        autoLoadEntities: true,
        synchronize: false, // el esquema se gestiona con el script SQL / migraciones
      }),
    }),

    // Modulos transversales primero
    AuditModule,
    AccessControlModule,

    // Modulos de negocio
    AuthModule,
    ProfilesModule,
    AcademicStructureModule,
    GradesModule,
    DocumentsModule,
    RequestsModule,
    UserAdminModule,
  ],
})
export class AppModule {}
