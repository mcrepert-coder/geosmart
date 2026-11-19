import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { rowsOf } from '../audit/sql-runner';
import { SMS_SENDER, type SmsSender } from '../auth/sms.sender';

// EF-305 : rappel de visite. Les visites confirmees dont l'heure de rappel
// est passee recoivent un SMS, une seule fois. Tant qu'il n'y a pas de
// fournisseur, le SMS est ecrit dans le journal de l'API (comme le code
// d'inscription, EF-401).

const INTERVAL_MS = 60_000;
const REMINDER_LOCK_KEY = 305305;

interface DueReminder {
  visit_id: string;
  property_id: string;
  property_label: string | null;
  recipient_phone: string | null;
  scheduled_at: Date | string | null;
  requester_id: string;
}

@Injectable()
export class VisitReminders implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('rappels-visites');
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    @Inject(SMS_SENDER) private readonly sms: SmsSender,
  ) {}

  // Desactive dans les tests et avec VISIT_REMINDERS_DISABLED=true.
  onModuleInit(): void {
    if (
      process.env.NODE_ENV === 'test' ||
      process.env.VISIT_REMINDERS_DISABLED === 'true'
    ) {
      return;
    }
    this.timer = setInterval(() => void this.tick(), INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.sendDue();
    } catch (error) {
      this.logger.error(`Envoi des rappels impossible : ${String(error)}`);
    } finally {
      this.running = false;
    }
  }

  /// Envoie les rappels echus a [now]. Chaque visite est d'abord reservee
  /// (reminder_sent_at pose en une requete) : deux serveurs n'envoient pas
  /// le meme rappel. Renvoie le nombre de rappels envoyes.
  async sendDue(now: Date = new Date()): Promise<number> {
    const due = await this.dataSource.transaction(async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock($1)', [REMINDER_LOCK_KEY]);
      return rowsOf<DueReminder>(
        await tx.query(
          `UPDATE visits v
              SET reminder_sent_at = $1,
                  updated_at = now()
             FROM accounts a
            WHERE a.id = v.requester_id
              AND v.status = 'CONFIRMEE'
              AND v.reminder_at IS NOT NULL
              AND v.reminder_at <= $1
              AND v.reminder_sent_at IS NULL
        RETURNING v.id AS visit_id,
                  v.property_id,
                  COALESCE(
                    NULLIF(btrim((SELECT sp.title FROM simulated_properties sp WHERE sp.id = v.property_id)), ''),
                    'bien ' || v.property_id::text
                  ) AS property_label,
                  NULLIF(btrim(a.phone), '') AS recipient_phone,
                  v.scheduled_at,
                  v.requester_id`,
          [now.toISOString()],
        ),
      );
    });

    let sent = 0;
    for (const visit of due) {
      const phone = visit.recipient_phone?.trim();
      if (!phone || !visit.visit_id) {
        this.logger.warn(
          `Rappel ignore : destinataire ou visite absent (${String(visit.visit_id ?? visit.requester_id)}).`,
        );
        continue;
      }
      const when = visit.scheduled_at
        ? ` le ${new Date(visit.scheduled_at).toISOString()}`
        : '';
      const label =
        visit.property_label ?? `bien ${visit.property_id ?? 'inconnu'}`;
      await this.sms.send(phone, `Rappel : visite du bien ${label}${when}.`);
      await this.audit.log({
        actorId: null,
        actorRole: null,
        action: 'VISIT_REMINDER',
        resourceType: 'visit',
        resourceId: visit.visit_id,
        result: 'SUCCESS',
        details: {
          requesterId: visit.requester_id ?? null,
          propertyId: visit.property_id ?? null,
        },
      });
      sent += 1;
    }
    return sent;
  }
}
