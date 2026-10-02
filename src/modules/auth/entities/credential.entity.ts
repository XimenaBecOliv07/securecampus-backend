import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('credential')
export class CredentialEntity {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'password_hash' })
  passwordHash: string; // Argon2id

  @Column({ name: 'mfa_enabled', default: false })
  mfaEnabled: boolean;

  @Column({ name: 'mfa_secret_enc', type: 'bytea', nullable: true })
  mfaSecretEnc: Buffer | null;

  @Column({ name: 'last_change_at' })
  lastChangeAt: Date;
}
