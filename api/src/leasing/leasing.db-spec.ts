import type { PGlite } from '@electric-sql/pglite' with {
  'resolution-mode': 'import',
};
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { AuditLog1793102400000 } from '../audit/migrations/1793102400000-audit-log';
import type { DataSource, QueryRunner } from 'typeorm';
import type { CurrentActorValue } from '../audit/current-actor.decorator';
import type { SqlRunner } from '../audit/sql-runner';
import type { SmsSender } from '../auth/sms.sender';
import { AuthAccounts1793104000000 } from '../auth/migrations/1793104000000-auth-accounts';
import { InspectionsService } from './inspections.service';
import { LeasesService, addMonths } from './leases.service';
import { Leasing1793107000000 } from './migrations/1793107000000-leasing';
import { VisitReminderSent1793109000000 } from './migrations/1793109000000-visit-reminder-sent';
import { SimulatedPropertyLookup } from './property-lookup';
import { VisitReminders } from './visit-reminders';
import { VisitsService } from './visits.service';

jest.setTimeout(60000);

const agent: CurrentActorValue = {
  id: randomUUID(),
  role: 'AGENT',
  registeredSurveyor: false,
  accountActive: true,
};
const client: CurrentActorValue = {
  id: randomUUID(),
  role: 'CLIENT',
  registeredSurveyor: false,
  accountActive: true,
};
const stranger: CurrentActorValue = {
  id: randomUUID(),
  role: 'CLIENT',
  registeredSurveyor: false,
  accountActive: true,
};

class FakeSms implements SmsSender {
  readonly sent: { phone: string; message: string }[] = [];

  send(phone: string, message: string): Promise<void> {
    this.sent.push({ phone, message });
    return Promise.resolve();
  }
}

const signature = Buffer.from('signature du locataire').toString('base64');
const photo = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x01, 0x02]).toString(
  'base64',
);

describe('Leasing (PostgreSQL)', () => {
  let db: PGlite;
  let visits: VisitsService;
  let reminders: VisitReminders;
  let leases: LeasesService;
  let inspections: InspectionsService;
  let sms: FakeSms;
  let propertyId: string;

  async function count(table: string): Promise<number> {
    const { rows } = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM ${table}`,
    );
    return rows[0].n;
  }

  beforeAll(async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    db = new PGlite();
    const runner: SqlRunner = {
      query: (sql, params) => db.query(sql, params),
    };
    const qr = runner as unknown as QueryRunner;
    await new AuditLog1793102400000().up(qr);
    await new AuthAccounts1793104000000().up(qr);
    await new Leasing1793107000000().up(qr);
    await new VisitReminderSent1793109000000().up(qr);
    for (const account of [agent, client, stranger]) {
      await db.query(
        `INSERT INTO accounts (id, phone, password_hash, status, role)
         VALUES ($1, $2, 'x', 'ACTIF', $3)`,
        [account.id, `+22893${account.id.slice(0, 8)}`, account.role],
      );
    }
    propertyId = randomUUID();
    await db.query(
      `INSERT INTO simulated_properties (id, agent_id, status, title)
       VALUES ($1, $2, 'PUBLIE', 'Villa Agoe')`,
      [propertyId, agent.id],
    );
    const dataSource = {
      query: (sql: string, params?: unknown[]) => runner.query(sql, params),
      transaction: <T>(work: (tx: SqlRunner) => Promise<T>) =>
        db.transaction((tx) =>
          work({ query: (sql, params) => tx.query(sql, params) }),
        ),
    } as unknown as DataSource;
    const lookup = new SimulatedPropertyLookup(dataSource);
    sms = new FakeSms();
    const audit = new AuditService(dataSource);
    visits = new VisitsService(dataSource, lookup, sms, audit);
    reminders = new VisitReminders(dataSource, audit, sms);
    leases = new LeasesService(dataSource, lookup, audit);
    inspections = new InspectionsService(dataSource, audit);
  });

  afterAll(async () => {
    await db.close();
  });

  describe('visites (EF-305)', () => {
    let visitId: string;

    it('un client demande une visite d un bien publie', async () => {
      const visit = await visits.request(client, { propertyId });
      expect(visit.status).toBe('DEMANDEE');
      expect(visit.requesterId).toBe(client.id);
      visitId = visit.id;
    });

    it('une visite sur un bien inexistant est refusee', async () => {
      await expect(
        visits.request(client, { propertyId: randomUUID() }),
      ).rejects.toMatchObject({
        status: 400,
        response: { code: 'VALIDATION_ERROR' },
      });
      await expect(
        visits.request(client, { propertyId: 'pas-un-uuid' }),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('un geometre ne demande pas de visite', async () => {
      await expect(
        visits.request({ ...client, role: 'GEOMETRE' }, { propertyId }),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('un agent confirme, le rappel est enregistre et envoye', async () => {
      const scheduledAt = new Date(Date.now() + 86_400_000).toISOString();
      const reminderAt = new Date(Date.now() + 72_000_000).toISOString();
      const confirmed = await visits.updateStatus(agent, visitId, {
        status: 'CONFIRMEE',
        scheduledAt,
        reminderAt,
      });
      expect(confirmed.status).toBe('CONFIRMEE');
      expect(confirmed.reminderAt).toBe(reminderAt);
      expect(sms.sent.length).toBeGreaterThanOrEqual(1);
      expect(sms.sent[sms.sent.length - 1].message).toMatch(/confirmee/);
    });

    it('envoie le rappel a l heure prevue, une seule fois (EF-305)', async () => {
      const { rows } = await db.query<{ reminder_at: Date }>(
        'SELECT reminder_at FROM visits WHERE id = $1',
        [visitId],
      );
      const due = new Date(rows[0].reminder_at);
      const sentBefore = sms.sent.length;

      // Avant l'heure : rien.
      expect(await reminders.sendDue(new Date(due.getTime() - 60_000))).toBe(0);
      // A l'heure : un SMS au demandeur, journalise.
      expect(await reminders.sendDue(new Date(due.getTime() + 60_000))).toBe(1);
      expect(sms.sent).toHaveLength(sentBefore + 1);
      const reminder = sms.sent[sms.sent.length - 1];
      expect(reminder.phone).toBeTruthy();
      expect(reminder.message).toMatch(/^Rappel : visite/);
      expect(reminder.message).toContain('Villa Agoe');
      expect(reminder.message).not.toContain('undefined');
      const { rows: audit } = await db.query<{ action: string }>(
        'SELECT action FROM audit_log ORDER BY seq DESC LIMIT 1',
      );
      expect(audit[0].action).toBe('VISIT_REMINDER');
      // Pas de second envoi.
      expect(await reminders.sendDue(new Date(due.getTime() + 600_000))).toBe(
        0,
      );
      expect(sms.sent).toHaveLength(sentBefore + 1);
    });

    it('ne rappelle pas une visite seulement demandee', async () => {
      const visit = await visits.request(client, {
        propertyId,
        reminderAt: new Date(Date.now() - 60_000).toISOString(),
      });
      expect(visit.status).toBe('DEMANDEE');
      const later = new Date(Date.now() + 3_600_000);
      const sent = await reminders.sendDue(later);
      const { rows } = await db.query<{ reminder_sent_at: Date | null }>(
        'SELECT reminder_sent_at FROM visits WHERE id = $1',
        [visit.id],
      );
      expect(rows[0].reminder_sent_at).toBeNull();
      expect(sent).toBe(0);
    });

    it('n envoie qu un rappel meme avec deux cycles concurrents', async () => {
      const visit = await visits.request(client, { propertyId });
      const due = new Date(Date.now() + 60_000);
      await visits.updateStatus(agent, visit.id, {
        status: 'CONFIRMEE',
        reminderAt: due.toISOString(),
      });
      const sentBefore = sms.sent.length;
      const counts = await Promise.all([
        reminders.sendDue(due),
        reminders.sendDue(due),
      ]);
      expect(counts.reduce((total, count) => total + count, 0)).toBe(1);
      expect(sms.sent).toHaveLength(sentBefore + 1);
    });

    it('le demandeur ne confirme pas lui-meme sa visite', async () => {
      const visit = await visits.request(client, { propertyId });
      await expect(
        visits.updateStatus(client, visit.id, { status: 'CONFIRMEE' }),
      ).rejects.toMatchObject({ status: 403 });
      await visits.updateStatus(client, visit.id, { status: 'ANNULEE' });
    });

    it('refuse une transition impossible', async () => {
      await expect(
        visits.updateStatus(agent, visitId, { status: 'DEMANDEE' }),
      ).rejects.toMatchObject({ status: 400 });
      await visits.updateStatus(agent, visitId, { status: 'FAITE' });
      await expect(
        visits.updateStatus(agent, visitId, { status: 'ANNULEE' }),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('une visite d un autre client n est pas visible (404)', async () => {
      await expect(visits.getOne(stranger, visitId)).rejects.toMatchObject({
        status: 404,
        response: { code: 'NOT_FOUND' },
      });
      const mine = await visits.getOne(client, visitId);
      expect(mine.id).toBe(visitId);
    });
  });

  describe('baux et loyers (EF-307)', () => {
    let leaseId: string;

    it('un client ne cree pas de bail', async () => {
      await expect(
        leases.create(client, {
          propertyId,
          monthlyRent: 150000,
          startDate: '2026-12-01',
          months: 12,
        }),
      ).rejects.toMatchObject({ status: 403, response: { code: 'FORBIDDEN' } });
    });

    it('un bail sur un bien inexistant est refuse', async () => {
      await expect(
        leases.create(agent, {
          propertyId: randomUUID(),
          monthlyRent: 150000,
          startDate: '2026-12-01',
          months: 12,
        }),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('un agent cree un bail avec des echeances mensuelles', async () => {
      const past = addMonths(new Date().toISOString().slice(0, 10), -2);
      const lease = await leases.create(agent, {
        propertyId,
        tenantAccountId: client.id,
        tenantName: 'Locataire Essai',
        monthlyRent: 150000,
        startDate: past,
        months: 12,
      });
      expect(lease.rents).toHaveLength(12);
      expect(lease.rents[0].dueDate).toBe(past);
      expect(lease.rents[11].dueDate).toBe(addMonths(past, 11));
      leaseId = lease.id;
    });

    it('les loyers passes non payes sont EN_RETARD, puis PAYEE', async () => {
      const lease = await leases.getOne(client, leaseId);
      expect(lease.rents[0].status).toBe('EN_RETARD');
      expect(lease.rents[11].status).toBe('A_PAYER');
      const paid = await leases.markRentPaid(agent, leaseId, lease.rents[0].id);
      expect(paid.status).toBe('PAYEE');
      await expect(
        leases.markRentPaid(agent, leaseId, lease.rents[0].id),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('le locataire ne marque pas les loyers payes', async () => {
      const lease = await leases.getOne(agent, leaseId);
      await expect(
        leases.markRentPaid(client, leaseId, lease.rents[1].id),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('un tiers ne voit pas le bail (404)', async () => {
      await expect(leases.getOne(stranger, leaseId)).rejects.toMatchObject({
        status: 404,
      });
    });

    it('calcule les echeances de fin de mois', () => {
      expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
      expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
      expect(addMonths('2026-03-31', 1)).toBe('2026-04-30');
      expect(addMonths('2026-05-15', 0)).toBe('2026-05-15');
    });
  });

  describe('etats des lieux (EF-306)', () => {
    let leaseId: string;

    beforeAll(async () => {
      const lease = await leases.create(agent, {
        propertyId,
        tenantAccountId: client.id,
        monthlyRent: 100000,
        startDate: '2026-12-01',
        months: 6,
      });
      leaseId = lease.id;
    });

    it('un client ne cree pas d etat des lieux', async () => {
      await expect(
        inspections.create(client, leaseId, {
          clientId: randomUUID(),
          kind: 'ENTRY',
          tenantSignatureBase64: signature,
        }),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('enregistre un etat des lieux d entree avec photos horodatees', async () => {
      const takenAt = new Date().toISOString();
      const inspection = await inspections.create(agent, leaseId, {
        clientId: randomUUID(),
        kind: 'ENTRY',
        notes: 'Rien a signaler.',
        photos: [{ takenAt, dataBase64: photo }],
        tenantSignatureBase64: signature,
      });
      expect(inspection.kind).toBe('ENTRY');
      expect(inspection.photos).toHaveLength(1);
      expect(inspection.photos[0].takenAt).toBe(takenAt);
      expect(inspection.notes).toBe('Rien a signaler.');
    });

    it('le renvoi du meme etat des lieux ne cree pas de doublon', async () => {
      const takenAt = new Date().toISOString();
      const input = {
        clientId: randomUUID(),
        kind: 'EXIT',
        photos: [{ takenAt, dataBase64: photo }],
        tenantSignatureBase64: signature,
      };
      const first = await inspections.create(agent, leaseId, input);
      const before = await count('inspections');
      const resend = await inspections.create(agent, leaseId, input);
      expect(resend.id).toBe(first.id);
      expect(await count('inspections')).toBe(before);
    });

    it('refuse 409 un clientId reuse pour un contenu different', async () => {
      const freshLease = await leases.create(agent, {
        propertyId,
        tenantAccountId: client.id,
        monthlyRent: 100000,
        startDate: '2026-12-01',
        months: 6,
      });
      const clientId = randomUUID();
      await inspections.create(agent, freshLease.id, {
        clientId,
        kind: 'ENTRY',
        notes: 'Version 1',
        tenantSignatureBase64: signature,
      });
      await expect(
        inspections.create(agent, freshLease.id, {
          clientId,
          kind: 'ENTRY',
          notes: 'Version 2',
          tenantSignatureBase64: signature,
        }),
      ).rejects.toMatchObject({
        status: 409,
        response: { code: 'IDEMPOTENCY_CONFLICT' },
      });
    });

    it('refuse un deuxieme etat des lieux ENTRY pour le meme bail', async () => {
      await expect(
        inspections.create(agent, leaseId, {
          clientId: randomUUID(),
          kind: 'ENTRY',
          tenantSignatureBase64: signature,
        }),
      ).rejects.toMatchObject({
        status: 409,
        response: { code: 'INSPECTION_EXISTS' },
      });
    });

    it('valide le clientId, le kind, la signature et le bail', async () => {
      await expect(
        inspections.create(agent, leaseId, {
          clientId: 'pas-un-uuid',
          kind: 'ENTRY',
          tenantSignatureBase64: signature,
        }),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        inspections.create(agent, leaseId, {
          clientId: randomUUID(),
          kind: 'ENTREE',
          tenantSignatureBase64: signature,
        }),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        inspections.create(agent, leaseId, {
          clientId: randomUUID(),
          kind: 'EXIT',
          tenantSignatureBase64: '',
        }),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        inspections.create(agent, randomUUID(), {
          clientId: randomUUID(),
          kind: 'EXIT',
          tenantSignatureBase64: signature,
        }),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('liste les etats des lieux pour le bail', async () => {
      const list = await inspections.listForLease(client, leaseId);
      expect(list.length).toBeGreaterThanOrEqual(2);
      await expect(
        inspections.listForLease(stranger, leaseId),
      ).rejects.toMatchObject({ status: 404 });
    });
  });
  // RG-10 : place en dernier, il relit ce que les tests precedents ont fait.
  it('journalise baux, loyers, visites et etats des lieux', async () => {
    const { rows } = await db.query<{ action: string; result: string }>(
      'SELECT action, result FROM audit_log',
    );
    const actions = new Set(rows.map((r) => r.action));
    for (const expected of [
      'LEASE_CREATE',
      'RENT_PAID',
      'VISIT_REQUEST',
      'VISIT_STATUS',
      'INSPECTION_CREATE',
    ]) {
      expect(actions).toContain(expected);
    }
    expect(rows.every((r) => r.result === 'SUCCESS')).toBe(true);
  });
});
