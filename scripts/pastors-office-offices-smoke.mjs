import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import module from '../api/_utils/pastorsOffice/offices.ts';
const { handleMyPastoralOffices } = module;
function res(){ return { statusCode:0, body:null, headers:{}, setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(b){this.body=b;return this;} }; }
function adminFor(owned, assigned, error = null, filters = []) {
  return { from(name) { const query = { select(){return this}, eq(k,v){filters.push([name,k,v]);return this}, is(k,v){filters.push([name,k,v]);return this}, then(resolve){return Promise.resolve({data:name==='pastoral_offices'?owned:assigned,error}).then(resolve)} }; return query; } };
}
const verify = async () => ({ user: { id:'user-1' }, role:'MEMBER' });
describe('Pastor’s Office gateway', () => {
 it('denies unsigned requests', async () => { const r=res(); await handleMyPastoralOffices({method:'GET'},r,{admin:adminFor([],[]),verify:async()=>({user:null,role:null})}); assert.equal(r.statusCode,401); });
 it('denies restricted or missing account roles even with an assignment', async () => { for (const role of ['PENDING','GUEST','KIOSK','ACCOUNTANT',null]) { const r=res(); await handleMyPastoralOffices({method:'GET'},r,{admin:adminFor([],[]),verify:async()=>({user:{id:'user-1'},role})}); assert.equal(r.statusCode,403); } });
 it('exposes only minimal office id and assigned role', async () => { const r=res(); await handleMyPastoralOffices({method:'GET'},r,{admin:adminFor([], [{office_id:'office-1',pastoral_offices:{id:'office-1',pastor_user_id:'private-pastor'}}]),verify}); assert.deepEqual(r.body.offices,[{id:'office-1',role:'PASTORS_ASSISTANT'}]); assert.equal(r.headers['Cache-Control'],'private, no-store'); });
 it('scopes both lookups to the authenticated user and excludes revoked assignments', async () => { const filters=[]; const r=res(); await handleMyPastoralOffices({method:'GET'},r,{admin:adminFor([],[],null,filters),verify}); assert.ok(filters.some(f => f[0] === 'pastoral_offices' && f[1] === 'pastor_user_id' && f[2] === 'user-1')); assert.ok(filters.some(f => f[0] === 'pastoral_office_assignments' && f[1] === 'user_id' && f[2] === 'user-1')); assert.ok(filters.some(f => f[1] === 'revoked_at' && f[2] === null)); });
 it('does not report access if the database lookup fails', async () => { const r=res(); await handleMyPastoralOffices({method:'GET'},r,{admin:adminFor([],[],{message:'error'}),verify}); assert.equal(r.statusCode,503); assert.equal(r.body.offices,undefined); });
 it('rejects unsupported methods', async () => { const r=res(); await handleMyPastoralOffices({method:'POST'},r,{admin:adminFor([],[]),verify}); assert.equal(r.statusCode,405); });
});
