import { Column, Entity, PrimaryColumn } from 'typeorm';
import type { AuditResult } from './audit-chain';

const bigintAsNumber = {
  to: (value: number) => value,
  from: (value: string | number) => Number(value),
};

@Entity({ name: 'audit_log' })
export class AuditEntryEntity {
  @PrimaryColumn({ type: 'bigint', transformer: bigintAsNumber })
  seq!: number;

  @Column({ type: 'timestamptz' })
  at!: Date;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId!: string | null;

  @Column({ name: 'actor_role', type: 'text', nullable: true })
  actorRole!: string | null;

  @Column({ type: 'text' })
  action!: string;

  @Column({ name: 'resource_type', type: 'text' })
  resourceType!: string;

  @Column({ name: 'resource_id', type: 'text', nullable: true })
  resourceId!: string | null;

  @Column({ type: 'text' })
  result!: AuditResult;

  @Column({ type: 'jsonb' })
  details!: Record<string, unknown>;

  @Column({ name: 'prev_hash', type: 'char', length: 64 })
  prevHash!: string;

  @Column({ type: 'char', length: 64 })
  hash!: string;
}
