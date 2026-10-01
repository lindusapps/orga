const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),{stripTypeScriptTypes}=require('node:module');
const uid='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
let handler,actor,plan,revision,calls,availability,conflict,secu=false;
const token=v=>'h.'+Buffer.from(JSON.stringify({app_metadata:{password_version:v}})).toString('base64url')+'.s';
const source=fs.readFileSync(require('path').join(__dirname,'../supabase/functions/staff-data/index.ts'),'utf8');
vm.runInNewContext(stripTypeScriptTypes(source),{Deno:{env:{get:n=>n==='SUPABASE_URL'?'https://project.example':'server-secret'},serve:f=>handler=f},Request,Response,atob,fetch:async(url,o)=>{
 const body=o.body&&JSON.parse(o.body);calls.push({url,method:o.method,body});
 if(url.endsWith('/auth/v1/user'))return actor?Response.json(actor):Response.json({},{status:401});
 if(url.includes('/staff_accounts?user_id=eq.'))return Response.json([{user_id:actor.id,name:actor.app_metadata.staff_name,role:actor.app_metadata.staff_role,active:actor.app_metadata.staff_active!==false}]);
 if(url.includes('/staff_accounts?'))return Response.json([{user_id:uid,name:'A',role:'employee',active:true},{user_id:other,name:'B',role:'employee',active:true}]);
 if(url.includes('/admin/users?'))return Response.json({users:[{id:uid,app_metadata:{staff_role:'employee',staff_name:'A'}},{id:other,app_metadata:{staff_role:'employee',staff_name:'B'}}]});
 if(url.includes('/equipes?'))return Response.json(secu?[{id:'team'}]:[]);
 if(url.includes('/employes_equipes?'))return Response.json([{employes:{auth_user_id:uid,actif:true}}]);
 if(o.method==='GET'){
  if(url.includes('/staff_planning?'))return Response.json([{data:plan,revision}]);
  if(url.includes('/staff_availability?'))return Response.json(availability);
  if(url.includes('/staff_tasks?'))return Response.json([{day:'2026-10-02',task_id:'t-o2',done:true,actor_id:other}]);
  return Response.json([]);
 }
 if(o.method==='PATCH'&&url.includes('/staff_planning?'))return Response.json(conflict?[]:[{revision:revision+1,data:body.data}]);
 return Response.json([]);
}});
function setup(role='employee',extra={}){actor={id:uid,app_metadata:{staff_role:role,staff_name:'A',...extra}};revision=3;calls=[];availability=[];conflict=false;plan={publishedPlans:{'2026-10-02':{people:{[uid]:{status:'present',slot:'20',end:'03:00'},[other]:{status:'rest'}}}},validated:{'2026-10-02':{[other]:'22'}}};}
async function req(body,v=0){const r=await handler(new Request('https://project.example/functions/v1/staff-data',{method:'POST',headers:{Authorization:'Bearer '+token(v),Origin:'https://indussapp.vercel.app','Content-Type':'application/json'},body:JSON.stringify(body)}));return {status:r.status,data:await r.json()};}
(async()=>{
setup();actor=null;assert.equal((await req({action:'load'})).status,401);
setup('employee',{staff_active:false});assert.equal((await req({action:'load'})).status,403);
setup('employee',{must_change_password:true});assert.equal((await req({action:'load'})).status,403);
setup('employee',{password_version:2});assert.equal((await req({action:'load'},1)).status,401);
setup();let r=await req({action:'load'});assert.equal(r.status,200);assert.equal(r.data.plan.validated,undefined);assert.deepEqual(Object.keys(r.data.plan.publishedPlans['2026-10-02'].people),[uid]);assert.equal(r.data.tasks[0].actor_id,undefined);assert.equal(r.data.people.length,1);for(const t of ['availability','debriefs','clock','incidents'])assert.ok(calls.find(x=>x.url.includes('/staff_'+t+'?')).url.includes('user_id=eq.'+uid));
for(const action of ['planning-save','tasks-reset','feedback','clock-correct','shift-delete']){setup();assert.equal((await req({action,role:'direction',userId:other})).status,403);assert.ok(!calls.some(x=>x.method!=='GET'));}
setup();assert.equal((await req({action:'availability',day:'2026-10-02',slots:['20'],userId:other})).status,200);assert.equal(calls.at(-1).body.user_id,uid);
setup();assert.equal((await req({action:'availability',day:'2026-10-04',slots:['20']})).status,400);assert.ok(!calls.some(x=>x.method==='POST'));
setup();assert.equal((await req({action:'task',taskId:'t-o2',done:true,day:'1999-01-01',actor_id:other})).status,200);assert.equal(calls.at(-1).body.actor_id,uid);assert.notEqual(calls.at(-1).body.day,'1999-01-01');
setup();assert.equal((await req({action:'task',taskId:'unknown',done:true})).status,400);
setup();assert.equal((await req({action:'clock',kind:'start',userId:other})).status,200);assert.deepEqual(calls.at(-1).body,{p_user_id:uid,p_action:'start'});
setup();assert.equal((await req({action:'debrief',day:'2026-10-03',data:{}})).status,403);
setup();assert.equal((await req({action:'debrief',day:'2026-10-02',userId:other,data:{ambiance:'Bonne',incidents:'',materiel:'',commentaire:'Test'}})).status,200);assert.equal(calls.at(-1).body.user_id,uid);
setup('direction');assert.equal((await req({action:'planning-save',revision:2,data:{}})).status,409);
setup('direction');conflict=true;assert.equal((await req({action:'planning-save',revision:3,data:{}})).status,409);
setup('direction');r=await req({action:'planning-save',revision:3,data:{validated:{'2026-10-02':{[uid]:'20'}}}});assert.equal(r.status,200);assert.equal(r.data.revision,4);assert.ok(calls.at(-1).url.includes('revision=eq.3'));
setup('direction');const publication={publishedPlans:{'2026-10-02':{people:{[uid]:{status:'present',slot:'20',end:'03:00'}}}}};assert.equal((await req({action:'planning-save',revision:3,data:publication})).status,400);
availability=[{user_id:uid,day:'2026-10-02',slots:['20']}];r=await req({action:'planning-save',revision:3,data:publication});assert.equal(r.status,200);assert.ok(r.data.plan.publishedPlans['2026-10-02'].publishedAt);
secu=true;setup();availability=[{user_id:uid,day:'2026-10-02',slots:['17','20','22']}];
r=await req({action:'load'});assert.equal(r.data.people[0].securityOnly,true);assert.deepEqual(r.data.availability[0].slots,['22']);
for(const slot of ['17','20','c2300']){setup();assert.equal((await req({action:'availability',day:'2026-10-02',slots:[slot]})).status,400);}
setup();assert.equal((await req({action:'availability',day:'2026-10-02',slots:['22']})).status,200);
setup();assert.equal((await req({action:'availability',day:'2026-10-02',slots:[]})).status,200);
setup('direction');assert.equal((await req({action:'planning-save',revision:3,data:{validated:{'2026-10-02':{[uid]:'20'}}}})).status,400);
setup('direction');availability=[{user_id:uid,day:'2026-10-02',slots:['20','22']}];
assert.equal((await req({action:'planning-save',revision:3,data:{publishedPlans:{'2026-10-02':{people:{[uid]:{status:'present',slot:'20',end:'04:00'}}}}}})).status,400);
assert.equal((await req({action:'planning-save',revision:3,data:{publishedPlans:{'2026-10-02':{people:{[uid]:{status:'present',slot:'22',end:'04:00'}}}}}})).status,200);
secu=false;
console.log('PASS security employees limited to 22h on load, availability, direction draft and publication; other teams unaffected');
console.log('PASS module authorization, per-user filters, server identities/dates, publication validation and concurrent revision checks');
// Frontend: two rapid availability clicks must not erase each other.
let saved=[];const h=require('./harness.cjs')({fetch:async(url,o)=>{const b=JSON.parse(o.body||'{}');if(url.includes('/token?'))return Response.json({access_token:'session'});if(b.action==='me')return Response.json({user:{id:uid,name:'A',role:'employee',active:true}});if(b.action==='availability'){saved=b.slots;return Response.json({ok:true});}if(b.action==='load')return Response.json({plan:{},revision:0,availability:[{user_id:uid,day:'2026-10-02',slots:saved}],tasks:[],debriefs:[],feedback:[],clock:[],incidents:[],people:[{id:uid,name:'A',role:'employee',active:true}],today:'2026-10-02'});throw new Error('Unexpected '+url);}});
await h.q.remoteLogin('0600000000','Example1234');await Promise.all(['20','22'].map(slot=>h.q.cloudAction('availability',()=>({day:'2026-10-02',slots:[...(h.q.state.availability[uid]['2026-10-02']||[]),slot]}))));assert.deepEqual(saved,['20','22']);assert.ok(![...h.storage.values()].some(v=>v.includes('2026-10-02')&&v.includes('slots')));
console.log('PASS queued availability writes retain rapid selections and do not persist business data in browser storage');
h.q.state.users[uid].securityOnly=true;h.q.state.customSlots=[{id:'c2300',time:'23:00',label:'23h00'}];h.q.state.exceptionalDays={'2026-10-04':{title:'Test'}};h.q.renderAll();
for(const id of ['staffAvailabilityCalendar','staffExceptionalDays']){const html=h.elem(id).innerHTML;assert.ok(html.includes('data-av-slot="22"'));assert.ok(!/data-av-slot="(17|20|c2300)"/.test(html));}
console.log('PASS employee regular and exceptional availability screens expose only 22h for security staff');
})().catch(e=>{console.error(e);process.exitCode=1});
