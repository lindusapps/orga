const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),{stripTypeScriptTypes}=require('node:module'),crypto=require('node:crypto').webcrypto;
const source=fs.readFileSync(require('path').join(__dirname,'../supabase/functions/staff-recovery/index.ts'),'utf8');
const uid='11111111-1111-4111-8111-111111111111',jwt='h.'+Buffer.from(JSON.stringify({app_metadata:{password_version:2}})).toString('base64url')+'.s';
function backend(config={}){
 let handler,calls=[],tokens=[],mail=[],taken=false;
 const user={id:uid,email:'u33600000000@login.indussapp.invalid',app_metadata:{password_version:2,staff_role:'employee'}};
 const env={SUPABASE_URL:'https://project.example',SUPABASE_SERVICE_ROLE_KEY:'private-service',STAFF_MAIL_API_KEY:'private-mail',STAFF_MAIL_FROM:'staff@example.com',...config.env};
 vm.runInNewContext(stripTypeScriptTypes(source),{Deno:{env:{get:k=>env[k]},serve:f=>handler=f},crypto,TextEncoder,Uint8Array,Request,Response,atob,AbortSignal,fetch:async(url,opts)=>{
  const body=opts.body&&JSON.parse(opts.body);calls.push({url,body,method:opts.method});
  if(url.includes('api.resend.com')||url.includes('api.brevo.com')){mail.push(body);return Response.json({}, {status:config.mailFail?503:200});}
  if(url.endsWith('/auth/v1/user'))return Response.json(user,{status:config.noAuth?401:200});
  if(url.includes('/admin/users/'))return Response.json(user);
  if(url.includes('grant_type=password'))return Response.json({user,access_token:'reauth'},{status:config.badPassword?400:200});
  if(url.includes('/logout'))return new Response(null,{status:204});
  if(url.includes('rpc/staff_recovery_throttle'))return Response.json(!config.limited);
  if(url.includes('staff_accounts?'))return Response.json(config.unknown?[]:[{user_id:uid,active:!config.inactive}]);
  if(url.includes('staff_recovery_contacts?'))return Response.json(config.noContact?[]:[{email:'verified@example.com',verified_at:'2026-01-01'}]);
  if(url.endsWith('/staff_recovery_tokens')){tokens.push(body);return Response.json([body]);}
  if(url.includes('staff_recovery_tokens?'))return Response.json(opts.method==='PATCH'?[]:config.expired?[]:[{user_id:uid,expires_at:'2099-01-01'}]);
  if(url.includes('rpc/staff_recovery_take')){if(taken||config.rejected)return Response.json({}, {status:400});taken=true;return Response.json(uid);}
  throw Error('Unexpected '+url);
 }});
 return {calls,tokens,mail,async req(body,origin='https://indussapp.vercel.app'){const r=await handler(new Request('https://project.example/functions/v1/staff-recovery',{method:'POST',headers:{Origin:origin,Authorization:'Bearer '+jwt},body:JSON.stringify(body)}));return {status:r.status,data:await r.json()};}};
}
(async()=>{
let b=backend({env:{STAFF_MAIL_API_KEY:''}});assert.equal((await b.req({action:'status'})).data.enabled,false);assert.equal((await b.req({action:'request',login:'0600000000'})).status,503);assert.equal(b.mail.length,0);
b=backend();assert.equal((await b.req({action:'status'},'https://evil.example')).status,403);
b=backend({noAuth:true});assert.equal((await b.req({action:'contact'})).status,401);
b=backend({inactive:true});assert.equal((await b.req({action:'enrol'})).status,403);
b=backend({badPassword:true});assert.equal((await b.req({action:'enrol',email:'me@example.com',currentPassword:'wrong'})).status,400);assert.equal(b.mail.length,0);
b=backend();assert.equal((await b.req({action:'enrol',email:'me@example.com',currentPassword:'OldPassword123'})).status,200);assert.equal(b.tokens[0].purpose,'verify_email');const raw=b.mail[0].text.match(/verify-email=([a-f0-9]{64})/)[1];assert.notEqual(b.tokens[0].token_hash,raw);assert.equal(b.tokens[0].token_hash,Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw))).toString('hex'));assert.ok(b.calls.some(c=>c.url.includes('logout?scope=local')));
const response=(await b.req({action:'request',login:'06 00 00 00 00',email:'attacker@example.com'})).data;assert.equal(b.mail.at(-1).to[0],'verified@example.com');assert.deepEqual(response,(await backend({unknown:true}).req({action:'request',login:'0600000000'})).data);assert.deepEqual(response,(await backend({noContact:true}).req({action:'request',login:'0600000000'})).data);
b=backend({mailFail:true});assert.equal((await b.req({action:'enrol',email:'me@example.com',currentPassword:'OldPassword123'})).status,400);assert.ok(b.calls.some(c=>c.method==='PATCH'));
b=backend();const token='a'.repeat(64);assert.equal((await b.req({action:'reset',token,password:'short'})).status,400);assert.equal((await b.req({action:'reset',token,password:'StrongPassword123',userId:'attacker'})).status,200);const update=b.calls.find(c=>c.method==='PUT');assert.ok(update.url.endsWith(uid));assert.equal(update.body.app_metadata.password_version,3);assert.equal(update.body.app_metadata.staff_role,'employee');assert.equal((await b.req({action:'reset',token,password:'StrongPassword123'})).status,400);
assert.equal((await backend({expired:true}).req({action:'verify',token})).status,400);assert.equal((await backend({rejected:true}).req({action:'verify',token})).status,400);assert.equal((await backend({limited:true}).req({action:'request',login:'0600000000'})).status,429);
console.log('PASS recovery backend: disabled provider, authentication, ownership, no enumeration, hash-only storage, failures, expiry, replay, strength, throttling');
const create=require('./harness.cjs');let calls=[];
let h=create({fetch:async(url,o)=>{calls.push(JSON.parse(o.body));return Response.json({enabled:false});}});await h.ready;await h.q.openRecovery('request');assert.equal(h.elem('recoverySubmit').disabled,true);assert.match(h.elem('recoveryMessage').textContent,/configuré/);
h=create({hash:'#reset-password='+token,fetch:async(url,o)=>{calls.push(JSON.parse(o.body));return Response.json({ok:true,message:'Modifié'});}});calls=[];await h.ready;assert.equal(h.sandbox.location.hash,'');assert.equal(calls.length,0);assert.equal(h.elem('recoveryDialog').open,true);h.elem('recoveryNew').value='StrongPassword123';h.elem('recoveryConfirm').value='Mismatch123';await h.q.submitRecovery({preventDefault(){}});assert.equal(calls.length,0);h.elem('recoveryConfirm').value='StrongPassword123';await h.q.submitRecovery({preventDefault(){}});assert.equal(calls[0].token,token);assert.equal(calls[0].action,'reset');assert.equal(h.elem('recoveryNew').value,'');assert.equal(h.session.size,0);assert.ok(!JSON.stringify([...h.storage]).includes(token));
h=create({hash:'#verify-email='+token,fetch:async(url,o)=>{calls.push(JSON.parse(o.body));return Response.json({ok:true,message:'Vérifié'});}});calls=[];await h.ready;assert.equal(calls.length,0);await h.q.submitRecovery({preventDefault(){}});assert.equal(calls[0].action,'verify');
console.log('PASS recovery UI: unavailable mail state, no automatic link consumption, fragment removal, password confirmation, no secret persistence');
})().catch(e=>{console.error(e);process.exitCode=1});
