const assert=require('node:assert/strict'),createApp=require('./harness.cjs');
const sessionKey='lindus_staff_session_v1',uid='11111111-1111-4111-8111-111111111111';
let now=Date.parse('2026-10-01T18:00:00Z'),refreshCount=0,disabled=false,pauseRefresh=null;
class Clock extends Date{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}}
const person={id:uid,name:'Test',role:'employee',login:'0600000000',active:true};
const fetch=async(url,opts)=>{
 if(url.includes('grant_type=password'))return Response.json({access_token:'access-one',refresh_token:'refresh-one',expires_in:3600});
 if(url.includes('grant_type=refresh_token')){refreshCount++;if(pauseRefresh)await pauseRefresh;return Response.json({access_token:'access-two',refresh_token:'refresh-two',expires_in:3600});}
 if(url.includes('/logout'))return Response.json({});
 const action=JSON.parse(opts.body).action;
 if(action==='me')return Response.json(disabled?{error:'Compte désactivé.'}:{user:person},{status:disabled?403:200});
 if(action==='load')return Response.json({plan:{},revision:0,availability:[],tasks:[],debriefs:[],feedback:[],clock:[],incidents:[],people:[person],today:'2026-10-01'});
 throw new Error('Unexpected action '+action);
};
(async()=>{
 let app=createApp({fetch,Date:Clock});await app.ready;
 await app.q.remoteLogin('0600000000','Example1234');assert.equal(app.q.state.currentUser,uid);
 const first=JSON.parse(app.session.get(sessionKey)),deadline=first.deadline;
 assert.equal(deadline,now+7200000);assert.ok(!app.session.get(sessionKey).includes('Example1234'));
 assert.ok(![...app.storage.values()].join('').includes('access-one'));
 // A new JS runtime with the same tab storage represents a real document reload.
 now+=600000;app=createApp({fetch,Date:Clock,session:app.session});await app.ready;
 assert.equal(app.q.state.currentUser,uid);assert.equal(JSON.parse(app.session.get(sessionKey)).deadline,deadline);
 console.log('PASS reload revalidates account and restores login without extending the two-hour deadline');
 now=first.accessExpiresAt-30000;
 await Promise.all([app.q.ensureSession(),app.q.ensureSession(),app.q.ensureSession()]);
 assert.equal(refreshCount,1);assert.equal(JSON.parse(app.session.get(sessionKey)).refreshToken,'refresh-two');
 assert.equal(JSON.parse(app.session.get(sessionKey)).deadline,deadline);
 console.log('PASS expiring access token refreshes once for concurrent requests, retaining the original deadline');
 now=deadline;const timer=app.timers.filter(t=>!t.cancelled&&t.delay>100000).at(-1);assert.ok(timer);timer.fn();
 assert.equal(app.q.state.currentUser,null);assert.equal(app.session.has(sessionKey),false);
 assert.match(app.elem('loginError').textContent,/deux heures/);
 await assert.rejects(()=>app.q.accountRequest('me'),/expirée/);
 console.log('PASS two-hour timer clears credentials, closes authenticated UI and blocks further requests');
 now+=1000;await app.q.remoteLogin('0600000000','Example1234');const stored=app.session;
 disabled=true;app=createApp({fetch,Date:Clock,session:stored});await app.ready;
 assert.equal(app.q.state.currentUser,null);assert.equal(stored.has(sessionKey),false);disabled=false;
 console.log('PASS disabled account cannot be restored after reload');
 await app.q.remoteLogin('0600000000','Example1234');app.q.logout();
 assert.equal(app.session.has(sessionKey),false);assert.equal(app.q.state.currentUser,null);
 app=createApp({fetch,Date:Clock,session:app.session});await app.ready;assert.equal(app.q.state.currentUser,null);
 console.log('PASS manual logout remains logged out after reload');
 await app.q.remoteLogin('0600000000','Example1234');now+=3600000;
 let release;pauseRefresh=new Promise(r=>release=r);const pending=app.q.ensureSession();app.q.logout();release();
 await assert.rejects(pending,/fermée/);assert.equal(app.session.has(sessionKey),false);pauseRefresh=null;
 console.log('PASS in-flight refresh cannot resurrect a logged-out session');
 const stale=new Map([[sessionKey,JSON.stringify({...first,deadline:now-1})]]);
 app=createApp({fetch,Date:Clock,session:stale});await app.ready;assert.equal(app.q.state.currentUser,null);assert.equal(stale.has(sessionKey),false);
 console.log('PASS expired saved session is rejected on document startup');
})().catch(e=>{console.error(e);process.exitCode=1});
