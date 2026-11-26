import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import module from '../api/_utils/pastorsOffice/requests.ts';
const { handlePastoralRequests } = module;
const actor='11111111-1111-4111-8111-111111111111', office='22222222-2222-4222-8222-222222222222', request='33333333-3333-4333-8333-333333333333';
function res(){return {statusCode:0,body:null,headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.statusCode=n;return this},json(v){this.body=v;return this}}}
function setup(role='MEMBER') { const calls=[], filters=[]; const admin={ rpc:async(name,args)=>{calls.push({name,args});return {data:request,error:null}},from(name){return {select(){return this},eq(k,v){filters.push([name,k,v]);return this},is(k,v){filters.push([name,k,v]);return this},order(){return this},limit:async()=>({data:[],error:null}),maybeSingle:async()=>({data:null,error:null})}}};return {calls,filters,admin,verify:async()=>({user:role?{id:actor}:null,role})} }
describe('Pastoral requests API',()=>{
 it('rejects unauthenticated and restricted accounts',async()=>{for(const role of [null,'PENDING','GUEST','KIOSK','ACCOUNTANT']){const d=setup(role),r=res();await handlePastoralRequests({method:'GET',query:{scope:'mine'}},r,d);assert.equal(r.statusCode,role?403:401);assert.equal(d.calls.length,0)}});
 it('uses verified actor, not supplied user ID, to submit',async()=>{const d=setup(),r=res();await handlePastoralRequests({method:'POST',body:{action:'submit',officeId:office,category:'counseling',preferredStart:'2027-01-01T10:00:00+03:00',timeZone:'Africa/Kampala',contactPreference:'app',actorId:request}},r,d);assert.equal(r.statusCode,200);assert.equal(d.calls[0].args.p_actor,actor);assert.equal(r.headers['Cache-Control'],'private, no-store')});
 it('limits own-list queries to verified user',async()=>{const d=setup(),r=res();await handlePastoralRequests({method:'GET',query:{scope:'mine',userId:request}},r,d);assert.equal(r.statusCode,200);assert.ok(d.filters.some(f=>f[1]==='requester_user_id'&&f[2]===actor))});
 it('does not allow unrelated users to list an office',async()=>{const d=setup(),r=res();await handlePastoralRequests({method:'GET',query:{scope:'office',officeId:office}},r,d);assert.equal(r.statusCode,403)});
 it('rejects invalid time zones and missing explicit offsets',async()=>{const d=setup(),r=res();await handlePastoralRequests({method:'POST',body:{action:'submit',officeId:office,category:'appointment',preferredStart:'2027-01-01T10:00',timeZone:'Africa/Kampala',contactPreference:'app'}},r,d);assert.equal(r.statusCode,400);assert.equal(d.calls.length,0)});
 it('passes version and actor into transition transaction',async()=>{const d=setup(),r=res();await handlePastoralRequests({method:'POST',body:{action:'approve',requestId:request,version:2}},r,d);assert.equal(r.statusCode,200);assert.equal(d.calls[0].name,'pastoral_transition_request');assert.equal(d.calls[0].args.p_actor,actor)});
});

describe('assistant request privacy',()=>{
 it('exposes only an approved service label, never the member message',async()=>{
  const rows=[{id:request,category:'appointment',brief_message:'[Service: Wedding]\nprivate details'},{id:office,category:'counseling',brief_message:'sensitive counseling details'}];
  const admin={from(name){return {select(){return this},eq(){return this},is(){return this},order(){return this},limit:async()=>({data:rows,error:null}),maybeSingle:async()=>({data:name==='pastoral_office_assignments'?{office_id:office}:null,error:null})}}};
  const r=res();await handlePastoralRequests({method:'GET',query:{scope:'office',officeId:office}},r,{admin,verify:async()=>({user:{id:actor},role:'MEMBER'})});
  assert.equal(r.statusCode,200);assert.equal(r.body.requests[0].service_label,'Wedding');assert.equal(r.body.requests[0].brief_message,undefined);assert.equal(r.body.requests[1].brief_message,undefined);assert.equal(r.body.requests[1].service_label,undefined);
 });
});

describe('deleting member requests', () => {
  it('goes through the checked database function with the signed-in actor', async () => {
    const d = setup(), r = res();
    await handlePastoralRequests({ method: 'POST', body: { action: 'delete', requestId: request } }, r, d);
    assert.equal(r.statusCode, 200);
    assert.equal(d.calls[0].name, 'pastoral_delete_request');
    assert.equal(d.calls[0].args.p_actor, actor);
  });
});
