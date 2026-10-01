const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),{stripTypeScriptTypes}=require('node:module');
const manager='11111111-1111-4111-8111-111111111111',guard='22222222-2222-4222-8222-222222222222',bar='33333333-3333-4333-8333-333333333333',team='44444444-4444-4444-8444-444444444444';
let handler,calls=[],sqlRole='security_manager',active=true;
const claims=Buffer.from(JSON.stringify({app_metadata:{staff_role:'direction',password_version:0}})).toString('base64url');
const account={user_id:manager,name:'Responsable',login:'0600000000',role:'security_manager',active:true,revision:0};
const plan={customSlots:[],exceptionalDays:{},publishedPlans:{'2026-10-02':{people:{[guard]:{status:'present',slot:'20',end:'04:00'},[bar]:{status:'present',slot:'17',end:'01:00'}}}},validated:{'2026-10-02':{[bar]:'22'}}};
const actor={id:manager,app_metadata:{staff_name:'Responsable',staff_role:'direction',staff_active:true,password_version:0}};
async function fetchMock(url,o){const body=o.body&&JSON.parse(o.body);calls.push({url,body,method:o.method});
 if(url.endsWith('/auth/v1/user'))return Response.json(actor);
 if(url.includes('/staff_accounts?user_id=eq.'))return Response.json([{...account,role:sqlRole,active}]);
 if(url.includes('/staff_accounts?'))return Response.json([{...account,role:sqlRole,active},{user_id:guard,name:'Agent Sécu',role:'employee',active:true},{user_id:bar,name:'Agent Bar',role:'employee',active:true}]);
 if(url.includes('/staff_planning?'))return Response.json([{data:plan,revision:5}]);
 if(url.includes('/equipes?'))return Response.json([{id:team,code:'secu',nom:'Équipe Sécu',actif:true}]);
 if(url.includes('/staff_roles?'))return Response.json([{code:'employee',label:'Employé'},{code:'direction',label:'Direction'},{code:'security_manager',label:'Responsable sécurité'}]);
 if(url.includes('/employes_equipes?'))return Response.json([{equipe_id:team,employes:{auth_user_id:guard,actif:true}}]);
 if(url.includes('/staff_availability?')){assert.ok(url.includes(guard));assert.ok(!url.includes(bar));return Response.json([{user_id:guard,day:'2026-10-02',slots:['20','22']}]);}
 if(url.endsWith('/rpc/staff_shift_delete'))return Response.json(6);
 if(url.endsWith('/rpc/staff_security_validate'))return Response.json(6);
 if(url.endsWith('/rpc/staff_account_save'))return Response.json(1);
 throw new Error('Unexpected access '+url);
}
function boot(file){vm.runInNewContext(stripTypeScriptTypes(fs.readFileSync(require('path').join(__dirname,'../supabase/functions',file,'index.ts'),'utf8')),{Deno:{env:{get:n=>n==='SUPABASE_URL'?'https://project.example':'secret'},serve:f=>handler=f},Request,Response,atob,fetch:fetchMock});}
async function req(body){calls=[];const r=await handler(new Request('https://project.example',{method:'POST',headers:{Authorization:'Bearer h.'+claims+'.s',Origin:'https://indussapp.vercel.app','Content-Type':'application/json'},body:JSON.stringify(body)}));return {status:r.status,data:await r.json()};}
(async()=>{
 boot('staff-data');let result=await req({action:'load'});assert.equal(result.status,200);assert.equal(result.data.people.length,2);assert.deepEqual(result.data.availability[0].slots,['22']);assert.equal(result.data.people.find(p=>p.id===guard).securityOnly,true);assert.ok(!JSON.stringify(result.data).includes(bar));assert.equal(result.data.plan.validated,undefined);for(const key of ['tasks','debriefs','feedback','clock','incidents'])assert.deepEqual(result.data[key],[]);
 for(const action of ['planning-save','availability','task','tasks-reset','debrief','feedback','clock','clock-correct','incident']){assert.equal((await req({action,role:'direction'})).status,403);assert.ok(!calls.some(c=>c.method!=='GET'));}
 assert.equal((await req({action:'security-validate',userId:bar,day:'2026-10-02',slot:'20',end:'04:00',revision:5})).status,403);
 assert.equal((await req({action:'security-validate',userId:guard,day:'2026-10-02',slot:'22',end:'04:00',revision:4})).status,409);
 assert.equal((await req({action:'security-validate',userId:guard,actorId:bar,day:'2026-10-02',slot:'22',end:'04:00',revision:5})).status,200);assert.equal(calls.at(-1).body.p_actor_id,manager);assert.equal(calls.at(-1).body.p_user_id,guard);
 assert.equal((await req({action:'security-validate',userId:guard,day:'2026-10-02',slot:'20',end:'04:00',revision:5})).status,400);
 assert.equal((await req({action:'shift-delete',userId:bar,day:'2026-10-02',revision:5})).status,403);
 assert.equal((await req({action:'shift-delete',userId:guard,day:'2026-10-02',revision:5})).status,200);assert.equal(calls.at(-1).body.p_actor_id,manager);
 active=false;assert.equal((await req({action:'load'})).status,403);active=true;
 boot('staff-admin');assert.equal((await req({action:'me'})).data.user.role,'security_manager');
 for(const action of ['list','create','update-account','reset-password'])assert.equal((await req({action})).status,403);
 sqlRole='direction';result=await req({action:'list'});assert.equal(result.status,200);assert.deepEqual(result.data.users.find(u=>u.id===guard).teamIds,[team]);assert.ok(result.data.roles.some(r=>r.code==='security_manager'));
 assert.equal((await req({action:'update-account',userId:manager,name:'Self',role:'employee',active:true,teamIds:[],revision:0})).status,400);
 assert.equal((await req({action:'update-account',userId:guard,name:'Guard',role:'security_manager',active:true,teamIds:[team],revision:0})).status,400);
 assert.equal((await req({action:'update-account',userId:guard,name:'Guard',role:'employee',active:false,teamIds:[team],revision:0})).status,200);assert.equal(calls.at(-1).body.p_actor_id,manager);assert.equal(calls.at(-1).body.p_active,false);
 console.log('PASS SQL role overrides stale JWT/Auth role; scoped loads, forged actions, cross-team validations, deactivation and account management');
 // Run the exact frontend with a security-manager response, without a real account.
 const h=require('./harness.cjs')({fetch:async(url,o)=>{const b=JSON.parse(o.body||'{}');if(url.includes('/token?'))return Response.json({access_token:'session'});if(b.action==='me')return Response.json({user:{id:manager,name:'Responsable',login:'0600000000',role:'security_manager',active:true}});if(b.action==='load')return Response.json({plan:{publishedPlans:{},customSlots:[],exceptionalDays:{}},revision:0,availability:[{user_id:guard,day:'2026-10-02',slots:['20','22']}],tasks:[],debriefs:[],feedback:[],clock:[],incidents:[],people:[{id:manager,name:'Responsable',role:'security_manager',active:true},{id:guard,name:'Agent Sécu',role:'employee',active:true,securityOnly:true}],today:'2026-10-02'});throw new Error('Forbidden frontend action '+b.action);}});
 await h.q.remoteLogin('0600000000','Example1234');assert.equal(h.elem('connectedRole').textContent,'Responsable sécurité');assert.ok(h.elem('.app').classList.contains('security-access'));assert.equal(h.elem('usersAdminList').innerHTML,'');assert.ok(h.elem('securityAgents').innerHTML.includes('Agent Sécu'));assert.ok(h.elem('securityAgents').innerHTML.includes('Valider et publier'));assert.ok(!h.elem('securityAgents').innerHTML.includes('value="20"'));assert.ok(h.elem('securityAgents').innerHTML.includes('value="22"'));
 const before=JSON.stringify(h.q.state.validated);h.q.v30Choose(guard,'2026-10-02','20');assert.equal(JSON.stringify(h.q.state.validated),before);
 assert.ok(h.elem('securityCalendar').innerHTML.includes('v30-table'));assert.ok(h.elem('securityCalendar').innerHTML.includes('Agent Sécu'));assert.ok(!h.elem('securityCalendar').innerHTML.includes('Agent Bar'));
 h.q.securitySetView('week');assert.equal((h.elem('securityCalendar').innerHTML.match(/<table/g)||[]).length,1);
 h.q.securitySetView('day');assert.equal(h.elem('securityCalendar').innerHTML,'');h.q.securityNavigate(1);assert.equal(h.elem('securityDay').value,'2026-10-03');h.q.securitySetView('month');h.q.securityNavigate(1);assert.equal(h.elem('securityDay').value,'2026-11-01');
 console.log('PASS security calendar month/week/day navigation and scoped deletion permissions');
 console.log('PASS security-manager login renders dedicated validation view and cannot edit the general planner');
})().catch(e=>{console.error(e);process.exitCode=1});
