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
    const due = rowsOf<{
      id: string;
      property_id: string;
      scheduled_at: Date | string | null;
      phone: string;
      requester_id: string;
    }>(
      await this.dataSource.query(
        `UPDATE visits v
            SET reminder_sent_at = $1
           FROM accounts a
          WHERE a.id = v.requester_id
            AND v.status = 'CONFIRMEE'
            AND v.reminder_at IS NOT NULL
            AND v.reminder_at <= $1
            AND v.reminder_sent_at IS NULL
        RETURNING v.id, v.property_id, v.scheduled_at, v.requester_id, a.phone`,
        [now.toISOString()],
      ),
    );
    for (const visit of due) {
      const when = visit.scheduled_at
        ? ` le ${new Date(visit.scheduled_at).toISOString()}`
        : '';
      await this.sms.send(
        visit.phone,
        `Rappel : visite du bien ${visit.property_id}${when}.`,
      );
      await this.audit.log({
        actorId: null,
        actorRole: null,
        action: 'VISIT_REMINDER',
        resourceType: 'visit',
        resourceId: visit.id,
        result: 'SUCCESS',
        details: { requesterId: visit.requester_id },
      });
    }
    return due.length;
  }
}
