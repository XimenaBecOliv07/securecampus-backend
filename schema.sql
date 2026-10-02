-- ============================================================
-- SECURECAMPUS
-- Esquema inicial de PostgreSQL
-- ============================================================

BEGIN;

-- ============================================================
-- EXTENSIONES
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ============================================================
-- 1. USUARIOS
-- ============================================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'DISABLED')),
    failed_logins INTEGER NOT NULL DEFAULT 0
        CHECK (failed_logins >= 0),
    locked_until TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);


-- ============================================================
-- 2. PERFIL PERSONAL
-- ============================================================

CREATE TABLE person_profile (
    user_id UUID PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(150) NOT NULL,
    phone VARCHAR(30),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now(),

    CONSTRAINT fk_person_profile_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);


-- ============================================================
-- 3. CARRERAS
-- ============================================================

CREATE TABLE career (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    code VARCHAR(50) NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);


-- ============================================================
-- 4. CURSOS / MATERIAS
-- ============================================================

CREATE TABLE course (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    career_id UUID NOT NULL,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(200) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now(),

    CONSTRAINT fk_course_career
        FOREIGN KEY (career_id)
        REFERENCES career(id),

    CONSTRAINT uq_course_career_code
        UNIQUE (career_id, code)
);


-- ============================================================
-- 5. PERIODOS ACADEMICOS
-- ============================================================

CREATE TABLE term (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    starts_at TIMESTAMP NOT NULL,
    ends_at TIMESTAMP NOT NULL,
    grading_open_from TIMESTAMP NOT NULL,
    grading_open_to TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now(),

    CONSTRAINT chk_term_dates
        CHECK (ends_at > starts_at),

    CONSTRAINT chk_grading_window
        CHECK (grading_open_to > grading_open_from)
);


-- ============================================================
-- 6. ROLES
-- ============================================================

CREATE TABLE role (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

INSERT INTO role (name)
VALUES
    ('ADMIN'),
    ('CAREER_HEAD'),
    ('PROFESSOR'),
    ('STUDENT')
ON CONFLICT (name) DO NOTHING;


-- ============================================================
-- 7. ROLES DE USUARIO
-- ============================================================

CREATE TABLE user_role (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    role_id UUID NOT NULL,
    scope_career_id UUID NULL,
    valid_from TIMESTAMP NOT NULL DEFAULT now(),
    valid_to TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now(),

    CONSTRAINT fk_user_role_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_user_role_role
        FOREIGN KEY (role_id)
        REFERENCES role(id),

    CONSTRAINT fk_user_role_career
        FOREIGN KEY (scope_career_id)
        REFERENCES career(id),

    CONSTRAINT chk_user_role_validity
        CHECK (valid_to IS NULL OR valid_to > valid_from)
);

CREATE INDEX idx_user_role_user
    ON user_role(user_id);


-- ============================================================
-- 8. CREDENCIALES
-- ============================================================

CREATE TABLE credential (
    user_id UUID PRIMARY KEY,
    password_hash VARCHAR(255) NOT NULL,
    mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    mfa_secret_enc BYTEA NULL,
    last_change_at TIMESTAMP NOT NULL DEFAULT now(),

    CONSTRAINT fk_credential_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);


-- ============================================================
-- 9. SESIONES
-- ============================================================

CREATE TABLE session (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    refresh_hash VARCHAR(255) NOT NULL,
    family_id UUID NOT NULL,
    ip INET NULL,
    user_agent TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    expires_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP NULL,

    CONSTRAINT fk_session_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE INDEX idx_session_user
    ON session(user_id);

CREATE INDEX idx_session_refresh_hash
    ON session(refresh_hash);

CREATE INDEX idx_session_family
    ON session(family_id);


-- ============================================================
-- 10. RECUPERACION DE CONTRASEÑA
-- ============================================================

CREATE TABLE password_reset_token (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now(),

    CONSTRAINT fk_password_reset_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);


-- ============================================================
-- 11. GRUPOS
-- ============================================================

CREATE TABLE course_group (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL,
    term_id UUID NOT NULL,
    code VARCHAR(255) NOT NULL,
    capacity INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN'
        CHECK (status IN ('OPEN', 'CLOSED')),
    created_by UUID NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now(),

    CONSTRAINT fk_course_group_course
        FOREIGN KEY (course_id)
        REFERENCES course(id),

    CONSTRAINT fk_course_group_term
        FOREIGN KEY (term_id)
        REFERENCES term(id),

    CONSTRAINT fk_course_group_creator
        FOREIGN KEY (created_by)
        REFERENCES users(id),

    CONSTRAINT uq_course_group
        UNIQUE (course_id, term_id, code),

    CONSTRAINT chk_course_group_capacity
        CHECK (capacity > 0)
);


-- ============================================================
-- 12. ASIGNACIONES DE PROFESORES
-- ============================================================

CREATE TABLE teaching_assignment (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL,
    professor_id UUID NOT NULL,
    valid_from TIMESTAMP NOT NULL,
    valid_to TIMESTAMP NULL,

    CONSTRAINT fk_teaching_assignment_group
        FOREIGN KEY (group_id)
        REFERENCES course_group(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_teaching_assignment_professor
        FOREIGN KEY (professor_id)
        REFERENCES users(id),

    CONSTRAINT chk_teaching_assignment_dates
        CHECK (valid_to IS NULL OR valid_to > valid_from)
);

CREATE INDEX idx_teaching_assignment_group_professor
    ON teaching_assignment(group_id, professor_id);


-- ============================================================
-- 13. INSCRIPCIONES
-- ============================================================

CREATE TABLE enrollment (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL,
    student_id UUID NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'DROPPED')),
    enrolled_by UUID NOT NULL,
    enrolled_at TIMESTAMP NOT NULL DEFAULT now(),

    CONSTRAINT fk_enrollment_group
        FOREIGN KEY (group_id)
        REFERENCES course_group(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_enrollment_student
        FOREIGN KEY (student_id)
        REFERENCES users(id),

    CONSTRAINT fk_enrollment_creator
        FOREIGN KEY (enrolled_by)
        REFERENCES users(id),

    CONSTRAINT uq_enrollment
        UNIQUE (group_id, student_id)
);


-- ============================================================
-- 14. CALIFICACIONES
-- ============================================================

CREATE TABLE grade (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_id UUID NOT NULL,
    component VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now(),

    CONSTRAINT fk_grade_enrollment
        FOREIGN KEY (enrollment_id)
        REFERENCES enrollment(id),

    CONSTRAINT uq_grade
        UNIQUE (enrollment_id, component)
);


-- ============================================================
-- 15. VERSIONES DE CALIFICACIONES
-- ============================================================

CREATE TABLE grade_version (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grade_id UUID NOT NULL,
    version INTEGER NOT NULL,
    value NUMERIC(5,2) NOT NULL,
    status VARCHAR(20) NOT NULL
        CHECK (
            status IN (
                'DRAFT',
                'SUBMITTED',
                'PUBLISHED',
                'CORRECTED'
            )
        ),
    entered_by UUID NOT NULL,
    approved_by UUID NULL,
    reason TEXT NULL,
    entered_at TIMESTAMP NOT NULL DEFAULT now(),
    supersedes_id UUID NULL,
    idempotency_key TEXT NULL UNIQUE,
    prev_hash TEXT NULL,
    row_hash TEXT NULL,

    CONSTRAINT fk_grade_version_grade
        FOREIGN KEY (grade_id)
        REFERENCES grade(id),

    CONSTRAINT fk_grade_version_entered_by
        FOREIGN KEY (entered_by)
        REFERENCES users(id),

    CONSTRAINT fk_grade_version_approved_by
        FOREIGN KEY (approved_by)
        REFERENCES users(id),

    CONSTRAINT fk_grade_version_supersedes
        FOREIGN KEY (supersedes_id)
        REFERENCES grade_version(id),

    CONSTRAINT uq_grade_version
        UNIQUE (grade_id, version)
);


-- ============================================================
-- PROTECCION APPEND-ONLY DE GRADE_VERSION
-- ============================================================

CREATE OR REPLACE FUNCTION fn_grade_version_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION
        'grade_version es append-only: UPDATE y DELETE no estan permitidos';
END;
$$;

CREATE TRIGGER trg_gv_immutable
BEFORE UPDATE OR DELETE ON grade_version
FOR EACH ROW
EXECUTE FUNCTION fn_grade_version_immutable();


-- ============================================================
-- 16. DOCUMENTOS
-- ============================================================

CREATE TABLE document (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id UUID NOT NULL,
    doc_type VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
        CHECK (
            status IN (
                'ACTIVE',
                'ARCHIVED',
                'LEGAL_HOLD'
            )
        ),
    current_version_id UUID NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now(),

    CONSTRAINT fk_document_owner
        FOREIGN KEY (owner_user_id)
        REFERENCES users(id)
);


-- ============================================================
-- 17. VERSIONES DE DOCUMENTOS
-- ============================================================

CREATE TABLE document_version (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL,
    version INTEGER NOT NULL,
    storage_key VARCHAR(255) NOT NULL UNIQUE,
    sha256 VARCHAR(64) NOT NULL,
    size_bytes BIGINT NOT NULL,
    mime_type VARCHAR(255) NOT NULL,
    enc_key_ref VARCHAR(255) NOT NULL,
    scan_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (
            scan_status IN (
                'PENDING',
                'CLEAN',
                'INFECTED'
            )
        ),
    uploaded_by UUID NOT NULL,
    uploaded_at TIMESTAMP NOT NULL DEFAULT now(),

    CONSTRAINT fk_document_version_document
        FOREIGN KEY (document_id)
        REFERENCES document(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_document_version_uploader
        FOREIGN KEY (uploaded_by)
        REFERENCES users(id),

    CONSTRAINT uq_document_version
        UNIQUE (document_id, version),

    CONSTRAINT chk_document_size
        CHECK (size_bytes >= 0)
);


-- current_version_id se agrega despues para evitar
-- dependencia circular durante CREATE TABLE.

ALTER TABLE document
ADD CONSTRAINT fk_document_current_version
FOREIGN KEY (current_version_id)
REFERENCES document_version(id);


-- ============================================================
-- PROTECCION DE DOCUMENT_VERSION
--
-- Se permite cambiar UNICAMENTE scan_status.
-- ============================================================

CREATE OR REPLACE FUNCTION fn_docver_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN

    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION
            'document_version no permite DELETE';
    END IF;

    IF
        NEW.id IS DISTINCT FROM OLD.id OR
        NEW.document_id IS DISTINCT FROM OLD.document_id OR
        NEW.version IS DISTINCT FROM OLD.version OR
        NEW.storage_key IS DISTINCT FROM OLD.storage_key OR
        NEW.sha256 IS DISTINCT FROM OLD.sha256 OR
        NEW.size_bytes IS DISTINCT FROM OLD.size_bytes OR
        NEW.mime_type IS DISTINCT FROM OLD.mime_type OR
        NEW.enc_key_ref IS DISTINCT FROM OLD.enc_key_ref OR
        NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by OR
        NEW.uploaded_at IS DISTINCT FROM OLD.uploaded_at
    THEN
        RAISE EXCEPTION
            'document_version es inmutable salvo scan_status';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_docver_guard
BEFORE UPDATE OR DELETE ON document_version
FOR EACH ROW
EXECUTE FUNCTION fn_docver_guard();


-- ============================================================
-- 18. SOLICITUDES
-- ============================================================

CREATE TABLE request (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id UUID NOT NULL,
    type VARCHAR(255) NOT NULL,
    description TEXT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'CREATED'
        CHECK (
            status IN (
                'CREATED',
                'IN_REVIEW',
                'APPROVED',
                'REJECTED',
                'CLOSED'
            )
        ),
    assigned_to UUID NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now(),

    CONSTRAINT fk_request_requester
        FOREIGN KEY (requester_id)
        REFERENCES users(id),

    CONSTRAINT fk_request_assigned
        FOREIGN KEY (assigned_to)
        REFERENCES users(id)
);


-- ============================================================
-- 19. HISTORIAL DE SOLICITUDES
--
-- BaseEntity menciona request_event como tabla append-only.
-- ============================================================

CREATE TABLE request_event (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL,
    actor_id UUID NOT NULL,
    from_status VARCHAR(20) NULL,
    to_status VARCHAR(20) NOT NULL,
    reason TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now(),

    CONSTRAINT fk_request_event_request
        FOREIGN KEY (request_id)
        REFERENCES request(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_request_event_actor
        FOREIGN KEY (actor_id)
        REFERENCES users(id)
);


CREATE OR REPLACE FUNCTION fn_request_event_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION
        'request_event es append-only: UPDATE y DELETE no estan permitidos';
END;
$$;

CREATE TRIGGER trg_request_event_immutable
BEFORE UPDATE OR DELETE ON request_event
FOR EACH ROW
EXECUTE FUNCTION fn_request_event_immutable();


-- ============================================================
-- 20. AUDITORIA
-- ============================================================

CREATE TABLE audit_log (
    id BIGSERIAL PRIMARY KEY,
    ts TIMESTAMP NOT NULL DEFAULT now(),
    actor_id UUID NULL,
    actor_role TEXT NULL,
    action TEXT NOT NULL,
    resource_type TEXT NULL,
    resource_id TEXT NULL,
    outcome TEXT NOT NULL
        CHECK (
            outcome IN (
                'SUCCESS',
                'DENIED',
                'FAILURE'
            )
        ),
    ip INET NULL,
    user_agent TEXT NULL,
    correlation_id UUID NULL,
    "beforeJson" JSONB NULL,
    "afterJson" JSONB NULL,
    prev_hash TEXT NULL,
    row_hash TEXT NULL,

    CONSTRAINT fk_audit_actor
        FOREIGN KEY (actor_id)
        REFERENCES users(id)
);


-- ============================================================
-- PROTECCION APPEND-ONLY DE AUDIT_LOG
-- ============================================================

CREATE OR REPLACE FUNCTION fn_audit_log_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION
        'audit_log es append-only: UPDATE y DELETE no estan permitidos';
END;
$$;

CREATE TRIGGER trg_audit_log_immutable
BEFORE UPDATE OR DELETE ON audit_log
FOR EACH ROW
EXECUTE FUNCTION fn_audit_log_immutable();


-- ============================================================
-- INDICES
-- ============================================================

CREATE INDEX idx_course_group_course
    ON course_group(course_id);

CREATE INDEX idx_course_group_term
    ON course_group(term_id);

CREATE INDEX idx_enrollment_student
    ON enrollment(student_id);

CREATE INDEX idx_grade_enrollment
    ON grade(enrollment_id);

CREATE INDEX idx_grade_version_grade
    ON grade_version(grade_id);

CREATE INDEX idx_document_owner
    ON document(owner_user_id);

CREATE INDEX idx_document_version_document
    ON document_version(document_id);

CREATE INDEX idx_request_requester
    ON request(requester_id);

CREATE INDEX idx_audit_actor
    ON audit_log(actor_id);

CREATE INDEX idx_audit_ts
    ON audit_log(ts);


COMMIT;