import { RequestMethod } from '@nestjs/common';
import {
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AuditController } from '../../audit/audit.controller';
import { AttestationController } from './attestation.controller';
import { OverlapAlertController } from './overlap-alert.controller';
import { ParcelController } from './parcel.controller';
import { SurveyRequestController } from './survey-request.controller';

// Garde-fou : toute route codee figure dans contracts/land.yaml avec le meme
// code de succes, et le contrat ne decrit aucune route absente du code.

type Route = string; // "post /survey-requests/{requestId}/take"

const CONTROLLERS = [
  ParcelController,
  AttestationController,
  SurveyRequestController,
  OverlapAlertController,
  AuditController,
];

function routePath(...parts: string[]): string {
  const path = parts
    .flatMap((p) => p.split('/'))
    .filter(Boolean)
    .map((s) => (s.startsWith(':') ? `{${s.slice(1)}}` : s))
    .join('/');
  return `/${path}`;
}

/// Routes declarees par les decorateurs Nest, avec leur code de succes.
function codedRoutes(): Map<Route, string> {
  const routes = new Map<Route, string>();
  for (const controller of CONTROLLERS) {
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

/// Routes du contrat et leurs codes 2xx. Le fichier suit une indentation
/// fixe (chemins a 2 espaces, operations a 4, codes de reponse a 8).
function contractRoutes(): Map<Route, string[]> {
  const yaml = readFileSync(
    join(__dirname, '..', '..', '..', '..', 'contracts', 'land.yaml'),
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

describe('contracts/land.yaml et routes codees', () => {
  const coded = codedRoutes();
  const contract = contractRoutes();

  it('lit bien les deux sources', () => {
    expect(coded.size).toBeGreaterThan(10);
    expect(contract.size).toBeGreaterThan(10);
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
