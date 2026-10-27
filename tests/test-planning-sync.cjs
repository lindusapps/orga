const assert=require('node:assert/strict'),create=require('./harness.cjs');
const admin='11111111-1111-4111-8111-111111111111',worker='22222222-2222-4222-8222-222222222222',day='2026-10-30';
const users=[{id:admin,name:'Direction',role:'direction',active:true},{id:worker,name:'Agent',role:'employee',active:true}];
// JSONB/PostgREST may return object keys in a different order at every level.
const reorder=value=>Array.isArray(value)?value.map(reorder):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().reverse().map(k=>[k,reorder(value[k])])):value;
let plan={},revision=0,writes=0,holdSave,releaseSave,holdLoad,releaseLoad,conflict=false,staleLoad=false;
const h=create({fetch:async(url,o)=>{
 const b=JSON.parse(o.body||'{}');
 if(url.includes('/token?'))return Response.json({access_token:'test'});
 if(b.action==='me')return Response.json({user:users[0]});
 if(b.action==='list')return Response.json({users,teams:[]});
 if(b.action==='load'){
  const snapshot={plan:structuredClone(plan),revision:revision-(staleLoad?1:0),people:users,availability:[{user_id:worker,day,slots:['22']}],tasks:[],debriefs:[],feedback:[],clock:[],incidents:[],today:day};
  if(holdLoad)await holdLoad;return Response.json(snapshot);
 }
 if(b.action==='planning-save'){
  writes++;if(writes>8)throw Error('Repeated-save loop detected');
  if(holdSave)await holdSave;
  if(conflict)return Response.json({error:'Concurrent edit'},{status:409});
  assert.equal(b.revision,revision);
  plan=reorder(b.data);for(const s of Object.values(plan.publishedPlans||{}))s.publishedAt='2026-10-27T10:00:00.000Z';
  revision++;return Response.json({plan,revision});
 }
 throw Error('Unexpected '+b.action);
}});
(async()=>{
 await h.q.remoteLogin('0600000000','Example1234');
 h.q.v30Choose(worker,day,'22');
 assert.equal(await h.q.autoPublishShift(worker,day),true);
 assert.equal(writes,1,'A reordered saved plan must not trigger another write');
 assert.match(h.q.v30Person(worker,day),/Modifier le service/);
 assert.ok(!h.q.v30Person(worker,day).includes('data-v30-slot'));
 await h.q.flushCloudPlan();assert.equal(writes,1,'An unchanged plan is clean');
 // New edits during an in-flight save must still be persisted, exactly once.
 holdSave=new Promise(r=>releaseSave=r);h.q.v30SetEnd(worker,day,'03:00');const pending=h.q.flushCloudPlan();
 await new Promise(r=>setImmediate(r));h.q.v30SetEnd(worker,day,'02:00');releaseSave();holdSave=null;await pending;
 assert.equal(writes,3);assert.equal(plan.shiftEnds[day][worker],'02:00');
 // A load started before a save must not roll the revision back on late arrival.
 holdLoad=new Promise(r=>releaseLoad=r);const oldLoad=h.q.loadCloud(true);await new Promise(r=>setImmediate(r));
 h.q.v30SetEnd(worker,day,'01:00');await h.q.flushCloudPlan();releaseLoad();holdLoad=null;await oldLoad;
 h.q.v30SetEnd(worker,day,'02:30');await h.q.flushCloudPlan();assert.equal(plan.shiftEnds[day][worker],'02:30');
 staleLoad=true;await h.q.loadCloud(true);staleLoad=false;h.q.v30SetEnd(worker,day,'01:30');await h.q.flushCloudPlan();assert.equal(plan.shiftEnds[day][worker],'01:30');
 // Genuine conflicts still require an explicit retry, not a silent overwrite.
 conflict=true;assert.equal(await h.q.autoPublishShift(worker,day),false);assert.match(h.q.v30Person(worker,day),/Concurrent edit/);
 console.log('PASS JSONB key order and server timestamps do not repeat writes; collapse, queued edits, late loads and genuine conflicts');
})().catch(e=>{console.error(e);process.exitCode=1});
