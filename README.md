# SecureCampus — Backend (NestJS)

Monolito modular con arquitectura hexagonal por módulo, RBAC+ABAC (Casbin),
auditoría append-only con hash encadenado, y calificaciones/documentos
versionados e inmutables. Implementa el análisis técnico y el script SQL
acordados previamente.

## Cómo correrlo

```bash
cp .env.example .env          # ajusta secretos y credenciales
docker compose up -d db redis minio
npm install
npm run start:dev
```

Antes de levantar la API, crea el esquema con el script SQL entregado
anteriormente (PostgreSQL). Este proyecto usa `synchronize: false` a
propósito: el esquema es la fuente de verdad, no las entidades.

## Estructura

```
src/
├── main.ts                     # bootstrap: helmet, validation pipe, CORS
├── app.module.ts                # composition root: conecta todos los módulos
│
├── shared-kernel/                # código transversal, sin reglas de negocio propias
│   ├── domain/base.entity.ts
│   ├── security/
│   │   ├── jwt-auth.guard.ts     # "quién eres" (valida el JWT)
│   │   ├── policy.guard.ts       # "qué puedes hacer" (RBAC vía Casbin)
│   │   ├── policy.service.ts     # PolicyEnforcer, punto único de decisión
│   │   ├── current-user.decorator.ts
│   │   ├── roles.decorator.ts
│   │   └── casbin/{model.conf,policy.csv}
│   └── crypto/hash-chain.util.ts # hash encadenado (grade_version, audit_log)
│
└── modules/
    ├── auth/              # login, refresh, recuperación de contraseña, MFA
    ├── profiles/           # perfil propio de cada actor
    ├── academic-structure/ # carreras, grupos, teaching_assignment, enrollment
    ├── grades/             # captura, publicación, rectificación, consulta
    ├── documents/          # subida/descarga segura, versiones inmutables
    ├── requests/           # solicitudes con historial (workflow)
    ├── user-admin/         # alta/baja/roles, operaciones condicionadas (step-up)
    ├── access-control/     # PolicyService + gestión de roles
    └── audit/              # único punto de escritura de auditoría
```

## Regla de dependencias entre módulos

Cada módulo expone **solo** lo que pone en `exports` de su `*.module.ts`
(su "contrato público"). Nadie importa el repositorio interno de otro
módulo. `audit` y `access-control` son los únicos módulos transversales:
casi todos los demás los importan.

## Dónde está cada requisito de seguridad del análisis

| Requisito | Archivo |
|---|---|
| RBAC + ABAC | `shared-kernel/security/policy.*`, validaciones ABAC dentro de cada `*.service.ts` (ej. `professorIsAssignedToGroup` en `grades.service.ts`) |
| Calificaciones append-only + hash encadenado | `modules/grades/entities/grade-version.entity.ts`, `grades.service.ts` |
| Documentos cifrados, magic bytes, tamaño máx. | `modules/documents/documents.service.ts` |
| Auditoría append-only con cadena de hashes | `modules/audit/audit.service.ts` |
| Operaciones condicionadas (step-up) | `modules/user-admin/user-admin.controller.ts` (header `x-step-up-token`) |
| Recuperación de acceso sin enumeración de usuarios | `modules/auth/auth.service.ts` (`requestPasswordReset`) |
| Separación de funciones (admin no edita calificaciones, no se auto-eleva) | `access-control.service.ts`, `user-admin.service.ts` |

## Pendiente de implementar (marcado con comentarios `// ...` en el código)

- Persistencia real de `users`, `person_profile` (ORM completo; algunos
  queries quedaron como SQL crudo vía `DataSource.query` por brevedad).
- Integración real con KMS/Vault para cifrado de documentos y secreto MFA.
- `StepUpGuard` que valide criptográficamente el token de reautenticación.
- Verificación TOTP real (librería `otplib`) en `verifyMfaCode`.
- Cliente de object storage (MinIO/S3) para subir/descargar el binario cifrado.
- Job periódico que recalcule y verifique la cadena de hashes de `audit_log`
  y `grade_version` (usa `verifyChain` de `hash-chain.util.ts`).

Estas omisiones son intencionales: cada una depende de credenciales/infra
que no existen en este entorno. La lógica de seguridad y el flujo de datos
que sí importan para el diseño (validación ABAC, inmutabilidad, auditoría
atómica) están completos.
