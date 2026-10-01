const assert=require('node:assert/strict'),createApp=require('./harness.cjs');
const uid='11111111-1111-4111-8111-111111111111',worker='22222222-2222-4222-8222-222222222222',day='2026-10-02';
const users=[{id:uid,name:'Direction',role:'direction',active:true},{id:worker,name:'Agent',role:'employee',active:true,securityOnly:true}];
let plan={},revision=0,fail=true,release,waiting;
const h=createApp({fetch:async(url,o)=>{const b=JSON.parse(o.body||'{}');if(url.includes('/token?'))return Response.json({access_token:'test'});if(b.action==='me')return Response.json({user:users[0]});if(b.action==='list')return Response.json({users,teams:[]});if(b.action==='load')return Response.json({plan,revision,people:users,availability:[{user_id:worker,day,slots:['22']}],tasks:[],debriefs:[],feedback:[],clock:[],incidents:[],today:day});if(b.action==='planning-save'){if(waiting)await waiting;if(fail)return Response.json({error:'Échec de publication testé.'},{status:400});plan=b.data;revision++;return Response.json({plan,revision});}throw new Error('Unexpected action');}});
const button={id:'v30-preview-publish',dataset:{},textContent:'Valider et publier',disabled:false,hasAttribute(){return false}};
const event={target:{closest(){return button}}};
(async()=>{
 await h.q.remoteLogin('0600000000','Example1234');h.q.state.dirDate=day;h.q.state.calendarView='day';
 h.q.state.validated[day]={[worker]:'22'};h.q.state.planStatus[day]={[worker]:'present'};h.q.v30Preview();
 waiting=new Promise(r=>release=r);const click=h.elem('v30-preview').listeners.click[0](event);
 await new Promise(r=>setImmediate(r));assert.equal(button.disabled,true);assert.equal(h.elem('v30-preview').open,true);release();await click;waiting=null;
 assert.equal(h.elem('v30-preview').open,true);assert.match(h.elem('v30-preview-message').textContent,/Échec/);assert.equal(button.disabled,false);
 fail=false;h.q.state.validated[day]={[worker]:'22'};h.q.state.planStatus[day]={[worker]:'present'};h.q.v30Preview();await h.elem('v30-preview').listeners.click[0](event);
 assert.equal(h.elem('v30-preview').open,false);assert.equal(plan.publishedPlans[day].people[worker].slot,'22');assert.match(h.elem('v30-message').textContent,/publié/);
 console.log('PASS direction preview stays open while publishing and on server failure; closes only after saved publication');
})().catch(e=>{console.error(e);process.exitCode=1});
