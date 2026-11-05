import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';

test('Contrats partages : ADMIN, identite du geometre et mission complete',()=>{
 const root=resolve(__dirname,'../../..','contracts');
 const auth=parse(readFileSync(resolve(root,'auth.yaml'),'utf8'));
 const sync=parse(readFileSync(resolve(root,'sync.yaml'),'utf8'));
 const roles=auth.components.schemas.Role.enum;
 assert.ok(roles.includes('ADMIN'));assert.ok(!roles.includes('ADMINISTRATEUR'));
 const current=auth.components.schemas.CurrentUser;
 assert.equal(current.properties.fullName.maxLength,120);
 assert.equal(current.properties.ordreNumber.maxLength,40);
 assert.ok(!current.required.includes('fullName'));assert.ok(!current.required.includes('ordreNumber'));
 assert.ok(current.required.includes('registeredSurveyor'));assert.ok(current.required.includes('accountActive'));
 const body=sync.paths['/sync'].post.requestBody.content['application/json'].schema;
 const item=body.properties.items.items;
 assert.equal(item.properties.entityType.const,'survey_session');assert.equal(item.properties.type,undefined);
 assert.ok(sync.paths['/sync'].post.description.includes('a valider avec Romuald'));
});
