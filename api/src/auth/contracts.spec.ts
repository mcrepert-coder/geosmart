import { RequestMethod, type Type } from '@nestjs/common';
import {
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AdminController } from '../admin/admin.controller';
import { LeasingController } from '../leasing/leasing.controller';
import { ProjectsController } from '../sync/projects.controller';
import { SyncController } from '../sync/sync.controller';
import { DocumentsController } from '../users/documents.controller';
import { AuthController } from './auth.controller';

// Garde-fou, sur le modele de land-contract.spec.ts : toute route codee
// figure dans son contrat avec le meme code de succes, et le contrat ne
// decrit aucune route absente du code. C'est ce qui aurait signale l'ecart
// de POST /sync (survey_session) avant l'integration.

type Route = string; // "post /projects/{projectId}/close"

function routePath(...parts: string[]): string {
  const path = parts
    .flatMap((p) => p.split('/'))
    .filter(Boolean)
    .map((s) => (s.startsWith(':') ? `{${s.slice(1)}}` : s))
    .join('/');
  return `/${path}`;
}

function codedRoutes(controllers: Type[]): Map<Route, string> {
  const routes = new Map<Route, string>();
  for (const controller of controllers) {
    const base = Reflect.getMetadata(PATH_METADATA, controller) as string;
    const proto = controller.prototype as Record<string, unknown>;
    for (const name of Object.getOwnPropertyNames(proto)) {
      const handler = proto[name];
      if (name === 'constructor' || typeof handler !== 'function') continue;
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as
        RequestMethod | undefined;
      if (method === undefined) continue;
      const path = Reflect.getMetadata(PATH_METADATA, handler) as string;
      const verb = RequestMethod[method].toLowerCase();
      const code =
        (Reflect.getMetadata(HTTP_CODE_METADATA, handler) as
          number | undefined) ?? (method === RequestMethod.POST ? 201 : 200);
      routes.set(`${verb} ${routePath(base, path)}`, String(code));
    }
  }
  return routes;
}

// Chemins a 2 espaces, operations a 4, codes de reponse a 8.
function contractRoutes(file: string): Map<Route, string[]> {
  const yaml = readFileSync(
    join(__dirname, '..', '..', '..', 'contracts', file),
    'utf8',
  );
  const routes = new Map<Route, string[]>();
  let inPaths = false;
  let path = '';
  let current: string[] | null = null;
  for (const line of yaml.split(/\r?\n/)) {
    if (/^\S/.test(line)) inPaths = line.startsWith('paths:');
    if (!inPaths) continue;
    const p = /^ {2}(\/\S*):\s*$/.exec(line);
    if (p) {
      path = p[1];
      current = null;
      continue;
    }
    const m = /^ {4}(get|post|put|patch|delete):\s*$/.exec(line);
    if (m) {
      current = [];
      routes.set(`${m[1]} ${path}`, current);
      continue;
    }
    const c = /^ {8}'(2\d\d)':/.exec(line);
    if (c && current) current.push(c[1]);
  }
  return routes;
}

describe.each([
  [
    'auth.yaml',
    [AuthController, AdminController, DocumentsController] as Type[],
  ],
  ['sync.yaml', [SyncController, ProjectsController] as Type[]],
  ['leasing.yaml', [LeasingController] as Type[]],
])('contracts/%s et routes codees', (file, controllers) => {
  const coded = codedRoutes(controllers);
  const contract = contractRoutes(file);

  it('lit bien les deux sources', () => {
    expect(coded.size).toBeGreaterThan(0);
    expect(contract.size).toBeGreaterThan(0);
  });

  it('decrit exactement les routes codees', () => {
    expect([...contract.keys()].sort()).toEqual([...coded.keys()].sort());
  });

  it('annonce le code de succes renvoye par chaque route', () => {
    const mismatches = [...coded]
      .filter(([route, code]) => !contract.get(route)?.includes(code))
      .map(([route, code]) => `${route} renvoie ${code}`);
    expect(mismatches).toEqual([]);
  });
});
