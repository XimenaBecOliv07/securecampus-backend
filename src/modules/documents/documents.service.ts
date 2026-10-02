import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID, createHash } from 'crypto';
import { DocumentEntity } from './entities/document.entity';
import { DocumentVersionEntity } from './entities/document-version.entity';
import { AuditService } from '@modules/audit/audit.service';
import { AuthenticatedUser } from '@shared/security/current-user.decorator';

const ALLOWED_MIME = new Set(['application/pdf', 'image/png', 'image/jpeg']);
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Subida y descarga segura de documentos. El contenido NUNCA pasa por el
 * webroot: se sube a object storage (MinIO/S3) cifrado con una DEK propia,
 * y la base de datos solo guarda metadatos + hash de integridad.
 */
@Injectable()
export class DocumentsService {
  constructor(
    @InjectRepository(DocumentEntity) private readonly documents: Repository<DocumentEntity>,
    @InjectRepository(DocumentVersionEntity) private readonly versions: Repository<DocumentVersionEntity>,
    private readonly audit: AuditService,
  ) {}

  async upload(
    user: AuthenticatedUser,
    docType: string,
    buffer: Buffer,
    mimeType: string,
    declaredOriginalName: string,
  ) {
    // Validacion por contenido (magic bytes), no solo por extension/mimetype declarado.
    if (!ALLOWED_MIME.has(mimeType) || !this.matchesMagicBytes(buffer, mimeType)) {
      throw new BadRequestException('Tipo de archivo no permitido');
    }
    if (buffer.byteLength > MAX_SIZE_BYTES) {
      throw new BadRequestException('Archivo demasiado grande');
    }

    const sha256 = createHash('sha256').update(buffer).digest('hex');
    const storageKey = `${randomUUID()}`; // nunca se usa declaredOriginalName como key

    // ... cifrar `buffer` con una DEK nueva (envelope encryption via KMS) y
    //     subir el resultado a object storage bajo `storageKey` ...
    // ... poner scan_status=PENDING y encolar escaneo antimalware (ClamAV);
    //     el documento no es "visible" hasta que el escaneo marca CLEAN ...

    let document = await this.documents.findOne({
      where: { ownerUserId: user.id, docType },
    });
    if (!document) {
      document = await this.documents.save(
        this.documents.create({ ownerUserId: user.id, docType, status: 'ACTIVE' }),
      );
    }

    const lastVersion = await this.versions.findOne({
      where: { documentId: document.id },
      order: { version: 'DESC' },
    });

    const version = await this.versions.save(
      this.versions.create({
        documentId: document.id,
        version: (lastVersion?.version ?? 0) + 1,
        storageKey,
        sha256,
        sizeBytes: buffer.byteLength,
        mimeType,
        encKeyRef: 'kms-ref-pending',
        scanStatus: 'PENDING',
        uploadedBy: user.id,
      }),
    );

    await this.documents.update(document.id, { currentVersionId: version.id });

    await this.audit.log({
      actorId: user.id,
      actorRole: user.roles.join(','),
      action: 'DOCUMENT_UPLOAD',
      resourceType: 'document',
      resourceId: document.id,
      outcome: 'SUCCESS',
      after: { sha256, sizeBytes: buffer.byteLength },
    });

    return { documentId: document.id, versionId: version.id };
  }

  /** El estudiante solo puede descargar SUS documentos (filtro por propietario en la consulta). */
  async getDownloadUrl(user: AuthenticatedUser, documentId: string): Promise<string> {
    const doc = await this.documents.findOne({ where: { id: documentId } });
    if (!doc) throw new BadRequestException('Documento no encontrado');
    if (doc.ownerUserId !== user.id && !user.roles.includes('ADMIN')) {
      throw new ForbiddenException('No autorizado para acceder a este documento');
    }

    await this.audit.log({
      actorId: user.id,
      actorRole: user.roles.join(','),
      action: 'DOCUMENT_DOWNLOAD',
      resourceType: 'document',
      resourceId: documentId,
      outcome: 'SUCCESS',
    });

    // ... generar URL prefirmada de vida corta (ej. 60s) hacia el object storage ...
    return `https://storage.example/presigned/${documentId}`;
  }

  private matchesMagicBytes(buffer: Buffer, mimeType: string): boolean {
    const signatures: Record<string, Buffer> = {
      'application/pdf': Buffer.from('25504446', 'hex'), // %PDF
      'image/png': Buffer.from('89504e47', 'hex'),
      'image/jpeg': Buffer.from('ffd8ff', 'hex'),
    };
    const sig = signatures[mimeType];
    return !!sig && buffer.subarray(0, sig.length).equals(sig);
  }
}
