import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import module from '../api/_utils/pastorsOffice/assignments.ts';
const { handleOfficeAssignments } = module;
const actor = '11111111-1111-4111-8111-111111111111';
const pastor = '22222222-2222-4222-8222-222222222222';
const assistant = '33333333-3333-4333-8333-333333333333';
function response() { return { statusCode: 0, body: null, headers: {}, setHeader(k,v){this.headers[k]=v;}, status(n){this.statusCode=n;return this;}, json(v){this.body=v;return this;} }; }
function deps(role, capture) { return { admin: { rpc: async (name, args) => { capture.push({name,args}); return { error: null }; } }, verify: async () => ({ user: role ? { id: actor } : null, role }) }; }
describe('Office assignment API', () => {
  it('rejects anonymous users and ordinary staff without writing', async () => {
    for (const role of [null, 'MEMBER', 'PASTOR', 'ADMIN']) {
      const calls=[]; const res=response();
      await handleOfficeAssignments({ method:'POST', body:{pastorId:pastor,assistantId:assistant,action:'grant'} }, res, deps(role,calls));
      assert.equal(res.statusCode, role ? 403 : 401); assert.equal(calls.length,0);
    }
  });
  it('takes the actor from verified authentication, not the request body', async () => {
    const calls=[]; const res=response();
    await handleOfficeAssignments({ method:'POST', body:{pastorId:pastor,assistantId:assistant,action:'grant',actorId:assistant} }, res, deps('SUPER_ADMIN',calls));
    assert.equal(res.statusCode,200); assert.equal(calls[0].args.p_actor,actor); assert.equal(calls[0].args.p_assistant,assistant);
    assert.equal(res.headers['Cache-Control'],'private, no-store');
  });
  it('rejects malformed input before database mutation', async () => {
    const calls=[]; const res=response();
    await handleOfficeAssignments({ method:'POST', body:{pastorId:'bad',assistantId:assistant,action:'grant'} }, res, deps('SUPER_ADMIN',calls));
    assert.equal(res.statusCode,400); assert.equal(calls.length,0);
  });
});
