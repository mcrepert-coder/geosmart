import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { type CurrentActorValue } from '../audit/current-actor.decorator';
import { rowsOf, type SqlRunner } from '../audit/sql-runner';

// EF-109 : chantiers de leve, assignation des topographes et suivi.
// CA-7 : POST /sync n'accepte les points d'un topographe que sur un chantier
// ouvert qui lui est assigne (voir isAssignedTopographer).

export type ProjectStatus = 'OUVERT' | 'CLOS';

export interface ProjectTopographer {
  id: string;
  fullName: string | null;
  assignedAt: string;
}

export interface ProjectView {
  id: string;
  title: string;
  status: ProjectStatus;
  createdBy: string;
  createdAt: string;
  closedAt: string | null;
  topographers: ProjectTopographer[];
  // Suivi : elements recus par POST /sync pour ce chantier.
  missionsCount: number;
  pointsCount: number;
}

interface ProjectRow {
  id: string;
  title: string;
  status: ProjectStatus;
  created_by: string;
  created_at: Date | string;
  closed_at: Date | string | null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function forbidden(message = 'Action non autorisee pour votre role.') {
  return new ForbiddenException({ code: 'FORBIDDEN', message });
}

function notFound() {
  return new NotFoundException({
    code: 'NOT_FOUND',
    message: 'Chantier introuvable.',
  });
}

function validation(message: string) {
  return new BadRequestException({ code: 'VALIDATION_ERROR', message });
}

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return new Date(value).toISOString();
}

// CA-7 : vrai si le compte est assigne a ce chantier et que le chantier est
// ouvert. Utilise par SyncService avant d'accepter un element.
export async function isAssignedTopographer(
  runner: SqlRunner,
  projectId: string,
  accountId: string,
): Promise<boolean> {
  const rows = rowsOf<{ ok: number }>(
    await runner.query(
      `SELECT 1 AS ok
         FROM survey_project_assignments a
         JOIN survey_projects p ON p.id = a.project_id
        WHERE a.project_id = $1 AND a.topographe_id = $2 AND p.status = 'OUVERT'`,
      [projectId, accountId],
    ),
  );
  return rows.length > 0;
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  // Un chantier est cree et gere par un administrateur ou un geometre actif.
  private assertManagerRole(actor: CurrentActorValue): void {
    if (
      actor.accountActive !== true ||
      (actor.role !== 'ADMIN' && actor.role !== 'GEOMETRE')
    ) {
      throw forbidden();
    }
  }

  // L'administrateur gere tous les chantiers ; le geometre, les siens.
  private assertManages(actor: CurrentActorValue, row: ProjectRow): void {
    this.assertManagerRole(actor);
    if (actor.role === 'GEOMETRE' && row.created_by !== actor.id) {
      throw forbidden('Seul le geometre qui a cree le chantier le gere.');
    }
  }

  async create(
    actor: CurrentActorValue,
    body: { title?: unknown },
  ): Promise<ProjectView> {
    this.assertManagerRole(actor);
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    if (title.length < 1 || title.length > 200) {
      throw validation(
        'Le titre du chantier est obligatoire (200 caracteres au plus).',
      );
    }
    const id = randomUUID();
    await this.dataSource.transaction(async (tx) => {
      await tx.query(
        'INSERT INTO survey_projects (id, title, created_by) VALUES ($1, $2, $3)',
        [id, title, actor.id],
      );
      await this.audit.log(
        {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'PROJECT_CREATE',
          resourceType: 'survey_project',
          resourceId: id,
          result: 'SUCCESS',
          details: { title },
        },
        tx,
      );
    });
    return this.view(await this.findRow(id));
  }

  // Topographes actifs que l'administrateur ou le geometre peut assigner.
  // Identifiant et nom seulement : le telephone n'est jamais expose.
  async listTopographers(
    actor: CurrentActorValue,
  ): Promise<{ id: string; fullName: string | null }[]> {
    this.assertManagerRole(actor);
    const rows = rowsOf<{ id: string; full_name: string | null }>(
      await this.dataSource.query(
        `SELECT id, full_name FROM accounts
          WHERE role = 'TOPOGRAPHE' AND status = 'ACTIF'
          ORDER BY full_name NULLS LAST, id`,
      ),
    );
    return rows.map((r) => ({ id: r.id, fullName: r.full_name }));
  }

  // ADMIN : tous ; GEOMETRE : ceux qu'il a crees ; TOPOGRAPHE : ses chantiers.
  async list(actor: CurrentActorValue): Promise<ProjectView[]> {
    if (actor.accountActive !== true) throw forbidden();
    let rows: ProjectRow[];
    if (actor.role === 'ADMIN') {
      rows = rowsOf<ProjectRow>(
        await this.dataSource.query(
          'SELECT * FROM survey_projects ORDER BY created_at DESC, id',
        ),
      );
    } else if (actor.role === 'GEOMETRE') {
      rows = rowsOf<ProjectRow>(
        await this.dataSource.query(
          'SELECT * FROM survey_projects WHERE created_by = $1 ORDER BY created_at DESC, id',
          [actor.id],
        ),
      );
    } else if (actor.role === 'TOPOGRAPHE') {
      rows = rowsOf<ProjectRow>(
        await this.dataSource.query(
          `SELECT p.* FROM survey_projects p
             JOIN survey_project_assignments a ON a.project_id = p.id
            WHERE a.topographe_id = $1
            ORDER BY p.created_at DESC, p.id`,
          [actor.id],
        ),
      );
    } else {
      throw forbidden();
    }
    return Promise.all(rows.map((row) => this.view(row)));
  }

  async get(actor: CurrentActorValue, projectId: string): Promise<ProjectView> {
    if (actor.accountActive !== true) throw forbidden();
    const row = await this.findRow(projectId);
    const visible =
      actor.role === 'ADMIN' ||
      (actor.role === 'GEOMETRE' && row.created_by === actor.id) ||
      (actor.role === 'TOPOGRAPHE' &&
        (await this.isAssigned(row.id, actor.id)));
    // Un chantier qu'on ne peut pas voir est traite comme absent.
    if (!visible) throw notFound();
    return this.view(row);
  }

  async assign(
    actor: CurrentActorValue,
    projectId: string,
    accountId: string,
  ): Promise<ProjectView> {
    const row = await this.findRow(projectId);
    this.assertManages(actor, row);
    if (row.status !== 'OUVERT') {
      throw new ConflictException({
        code: 'PROJECT_CLOSED',
        message: 'Le chantier est clos.',
      });
    }
    if (!UUID_RE.test(accountId)) {
      throw validation('Le compte a assigner doit etre un topographe actif.');
    }
    const target = rowsOf<{ role: string | null; status: string }>(
      await this.dataSource.query(
        'SELECT role, status FROM accounts WHERE id = $1',
        [accountId],
      ),
    )[0];
    if (!target || target.role !== 'TOPOGRAPHE' || target.status !== 'ACTIF') {
      throw validation('Le compte a assigner doit etre un topographe actif.');
    }
    await this.dataSource.transaction(async (tx) => {
      const inserted = rowsOf<{ project_id: string }>(
        await tx.query(
          `INSERT INTO survey_project_assignments (project_id, topographe_id, assigned_by)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING
           RETURNING project_id`,
          [projectId, accountId, actor.id],
        ),
      );
      if (inserted.length > 0) {
        await this.audit.log(
          {
            actorId: actor.id,
            actorRole: actor.role,
            action: 'PROJECT_ASSIGN',
            resourceType: 'survey_project',
            resourceId: projectId,
            result: 'SUCCESS',
            details: { topographeId: accountId },
          },
          tx,
        );
      }
    });
    return this.view(row);
  }

  async unassign(
    actor: CurrentActorValue,
    projectId: string,
    accountId: string,
  ): Promise<ProjectView> {
    const row = await this.findRow(projectId);
    this.assertManages(actor, row);
    if (UUID_RE.test(accountId)) {
      await this.dataSource.transaction(async (tx) => {
        const removed = rowsOf<{ project_id: string }>(
          await tx.query(
            `DELETE FROM survey_project_assignments
              WHERE project_id = $1 AND topographe_id = $2
              RETURNING project_id`,
            [projectId, accountId],
          ),
        );
        if (removed.length > 0) {
          await this.audit.log(
            {
              actorId: actor.id,
              actorRole: actor.role,
              action: 'PROJECT_UNASSIGN',
              resourceType: 'survey_project',
              resourceId: projectId,
              result: 'SUCCESS',
              details: { topographeId: accountId },
            },
            tx,
          );
        }
      });
    }
    return this.view(row);
  }

  // Un chantier clos n'accepte plus de points (POST /sync renvoie 403).
  async close(
    actor: CurrentActorValue,
    projectId: string,
  ): Promise<ProjectView> {
    const row = await this.findRow(projectId);
    this.assertManages(actor, row);
    if (row.status === 'OUVERT') {
      await this.dataSource.transaction(async (tx) => {
        await tx.query(
          "UPDATE survey_projects SET status = 'CLOS', closed_at = now() WHERE id = $1",
          [projectId],
        );
        await this.audit.log(
          {
            actorId: actor.id,
            actorRole: actor.role,
            action: 'PROJECT_CLOSE',
            resourceType: 'survey_project',
            resourceId: projectId,
            result: 'SUCCESS',
          },
          tx,
        );
      });
    }
    return this.view(await this.findRow(projectId));
  }

  private async isAssigned(projectId: string, accountId: string) {
    const rows = rowsOf<{ ok: number }>(
      await this.dataSource.query(
        'SELECT 1 AS ok FROM survey_project_assignments WHERE project_id = $1 AND topographe_id = $2',
        [projectId, accountId],
      ),
    );
    return rows.length > 0;
  }

  private async findRow(projectId: string): Promise<ProjectRow> {
    if (!UUID_RE.test(projectId)) throw notFound();
    const row = rowsOf<ProjectRow>(
      await this.dataSource.query(
        'SELECT * FROM survey_projects WHERE id = $1',
        [projectId],
      ),
    )[0];
    if (!row) throw notFound();
    return row;
  }

  private async view(row: ProjectRow): Promise<ProjectView> {
    const topographers = rowsOf<{
      id: string;
      full_name: string | null;
      assigned_at: Date | string;
    }>(
      await this.dataSource.query(
        `SELECT a.topographe_id AS id, acc.full_name, a.assigned_at
           FROM survey_project_assignments a
           JOIN accounts acc ON acc.id = a.topographe_id
          WHERE a.project_id = $1
          ORDER BY a.assigned_at, a.topographe_id`,
        [row.id],
      ),
    );
    const counts = rowsOf<{ entity_type: string; n: number | string }>(
      await this.dataSource.query(
        `SELECT entity_type, count(*) AS n FROM sync_items
          WHERE payload->>'projectId' = $1
          GROUP BY entity_type`,
        [row.id],
      ),
    );
    const countOf = (type: string) =>
      Number(counts.find((c) => c.entity_type === type)?.n ?? 0);
    return {
      id: row.id,
      title: row.title,
      status: row.status,
      createdBy: row.created_by,
      createdAt: iso(row.created_at) as string,
      closedAt: iso(row.closed_at),
      topographers: topographers.map((t) => ({
        id: t.id,
        fullName: t.full_name,
        assignedAt: iso(t.assigned_at) as string,
      })),
      missionsCount: countOf('survey_session'),
      pointsCount: countOf('survey_point'),
    };
  }
}
