import { describe,it } from 'node:test';
import assert from 'node:assert/strict';
import module from '../api/_utils/pastorsOffice/requests.ts';
const {handlePastoralRequests}=module;
const actor='11111111-1111-4111-8111-111111111111',office='22222222-2222-4222-8222-222222222222';
function res(){return {statusCode:0,body:null,setHeader(){},status(n){this.statusCode=n;return this},json(v){this.body=v;return this}}}
function setup(allowed=true){const calls=[];const admin={from(table){return {select(x){calls.push([table,'select',x]);return this},eq(k,v){calls.push([table,'eq',k,v]);return this},is(){return this},in(k,v){calls.push([table,'in',k,v]);return this},lt(k,v){calls.push([table,'lt',k,v]);return this},gt(k,v){calls.push([table,'gt',k,v]);return this},order(){return this},maybeSingle:async()=>({data:allowed&&table==='pastoral_offices'?{id:office}:null,error:null}),range:async(a,b)=>{calls.push([table,'range',a,b]);return {data:Array.from({length:101},(_,i)=>({id:i})),error:null}}}}};return {calls,admin,verify:async()=>({user:{id:actor},role:'MEMBER'})}}
const query={scope:'calendar',officeId:office,start:'2026-11-21T21:00:00.000Z',end:'2026-11-22T21:00:00.000Z',page:'1'};
describe('Pastor’s Office calendar API',()=>{
 it('rejects users not assigned to the office',async()=>{const d=setup(false),r=res();await handlePastoralRequests({method:'GET',query},r,d);assert.equal(r.statusCode,403);assert.equal(d.calls.some(x=>x[0]==='pastoral_appointments'),false)});
 it('loads overlapping appointments with stable pagination',async()=>{const d=setup(),r=res();await handlePastoralRequests({method:'GET',query},r,d);assert.equal(r.statusCode,200);assert.equal(r.body.appointments.length,100);assert.equal(r.body.hasMore,true);assert.ok(d.calls.some(x=>x[1]==='lt'&&x[2]==='starts_at'&&x[3]===query.end));assert.ok(d.calls.some(x=>x[1]==='gt'&&x[2]==='ends_at'&&x[3]===query.start));assert.ok(d.calls.some(x=>x[1]==='range'&&x[2]===100&&x[3]===200));assert.ok(d.calls.some(x=>x[0]==='pastoral_appointments'&&x[1]==='eq'&&x[2]==='office_id'&&x[3]===office));});
 it('rejects oversized date ranges and invalid page numbers',async()=>{for(const extra of [{end:'2027-12-01T00:00:00Z'},{page:'-1'}]){const d=setup(),r=res();await handlePastoralRequests({method:'GET',query:{...query,...extra}},r,d);assert.equal(r.statusCode,400)}});
});
