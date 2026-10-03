// Public request/reset flow. Custom authentication: live JWT + current password for
// contact enrolment; 256-bit expiring single-use tokens for verification/reset.
// No account, role or recovery token is disclosed by the public request response.
const base=Deno.env.get('SUPABASE_URL')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const site='https://indussapp.vercel.app';
const provider=Deno.env.get('STAFF_MAIL_PROVIDER')||'resend';
const mailKey=Deno.env.get('STAFF_MAIL_API_KEY')||'',mailFrom=Deno.env.get('STAFF_MAIL_FROM')||'';
const emailOK=(v:unknown)=>typeof v==='string'&&v.length<=254&&/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(v)&&!v.endsWith('.invalid');
const enabled=!!mailKey&&emailOK(mailFrom)&&['resend','brevo'].includes(provider);
const strong=(p:unknown)=>typeof p==='string'&&p.length>=10&&p.length<=128&&/[A-Z]/.test(p)&&/[a-z]/.test(p)&&/[0-9]/.test(p);
const generic={ok:true,message:'Si ce compte dispose d’une adresse vérifiée, un lien de réinitialisation lui sera envoyé. Vérifiez aussi les courriers indésirables.'};
const digest=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('');
async function api(path:string,method='GET',body?:unknown,token=service){
 const r=await fetch(base+path,{method,headers:{apikey:service,Authorization:'Bearer '+token,'Content-Type':'application/json',Prefer:'return=representation'},body:body===undefined?undefined:JSON.stringify(body)});
 if(!r.ok)throw new Error('Service indisponible.');return r.json();
}
const table=(p:string,m='GET',b?:unknown)=>api('/rest/v1/'+p,m,b);
const auth=(p:string,m='GET',b?:unknown,t=service)=>api('/auth/v1/'+p,m,b,t);
const throttle=(bucket:string,limit:number,seconds:number)=>table('rpc/staff_recovery_throttle','POST',{p_bucket:bucket,p_limit:limit,p_seconds:seconds});
function phone(value:unknown){let n=String(value||'').replace(/[\s().-]/g,'');if(/^0[1-9]\d{8}$/.test(n))n='+33'+n.slice(1);if(!/^\+[1-9]\d{7,14}$/.test(n))return null;return n.startsWith('+33')&&n.length===12?'0'+n.slice(3):n;}
async function send(email:string,token:string,purpose:string){
 const verify=purpose==='verify_email',link=site+'/#'+(verify?'verify-email':'reset-password')+'='+token;
 const subject=verify?'L’Indus Staff — Vérifiez votre adresse e-mail':'L’Indus Staff — Nouveau mot de passe';
 const text=(verify?'Pour confirmer votre adresse e-mail de récupération, ouvrez ce lien :':'Pour choisir un nouveau mot de passe, ouvrez ce lien :')+'\n\n'+link+'\n\nCe lien est personnel, à usage unique et valable '+(verify?'30':'15')+' minutes. Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail.';
 const r=await fetch(provider==='brevo'?'https://api.brevo.com/v3/smtp/email':'https://api.resend.com/emails',{method:'POST',headers:{'Content-Type':'application/json',...(provider==='brevo'?{'api-key':mailKey}:{Authorization:'Bearer '+mailKey})},body:JSON.stringify(provider==='brevo'?{sender:{email:mailFrom,name:'L’Indus Staff'},to:[{email}],subject,textContent:text}:{from:'L’Indus Staff <'+mailFrom+'>',to:[email],subject,text}),signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw new Error('Envoi indisponible.');
}
async function issue(user:any,email:string,purpose:string){
 if(!await throttle('user:'+user.id,3,3600))return false;
 const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join(''),hash=await digest(token);
 await table('staff_recovery_tokens','POST',{token_hash:hash,user_id:user.id,email,purpose,password_version:user.app_metadata?.password_version||0,expires_at:new Date(Date.now()+(purpose==='verify_email'?30:15)*60000).toISOString()});
 try{await send(email,token,purpose);}catch(e){await table('staff_recovery_tokens?token_hash=eq.'+hash,'PATCH',{used_at:new Date().toISOString()});throw e;}
 return true;
}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('Origin'),headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
 if(origin===site)headers['Access-Control-Allow-Origin']=site;
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(origin&&origin!==site)return reply({error:'Origine non autorisée.'},403);
 if(req.method==='OPTIONS')return new Response(null,{headers});if(req.method!=='POST')return reply({error:'Méthode non autorisée.'},405);
 try{
  const raw=await req.text();if(raw.length>4096)return reply({error:'Demande trop longue.'},413);const b=JSON.parse(raw);
  if(b.action==='status')return reply({enabled});
  if(b.action==='contact'||b.action==='enrol'){
   const token=(req.headers.get('Authorization')||'').replace(/^Bearer /,'');let u;
   try{u=await auth('user','GET',undefined,token);}catch{return reply({error:'Reconnectez-vous pour continuer.'},401);}
   const a=(await table('staff_accounts?user_id=eq.'+u.id+'&select=active'))[0];
   if(!a?.active||u.is_anonymous)return reply({error:'Compte indisponible.'},403);
   const claims=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
   if((claims.app_metadata?.password_version||0)!==(u.app_metadata?.password_version||0))return reply({error:'Reconnectez-vous pour continuer.'},401);
   if(b.action==='contact'){const c=(await table('staff_recovery_contacts?user_id=eq.'+u.id+'&select=email,verified_at'))[0];return reply({enabled,email:c?.email||null,verified:!!c});}
   if(!enabled)return reply({error:'L’envoi des e-mails est en cours de configuration.'},503);
   if(!emailOK(b.email)||typeof b.currentPassword!=='string'||!b.currentPassword||b.currentPassword.length>128)return reply({error:'Indiquez votre e-mail et votre mot de passe actuel.'},400);
   if(!await throttle('enrol:'+u.id,8,900))return reply({error:'Trop de tentatives. Réessayez dans 15 minutes.'},429);
   const check=await auth('token?grant_type=password','POST',{email:u.email,password:b.currentPassword});
   if(check.user?.id!==u.id)return reply({error:'Vérification du compte refusée.'},403);
   // Dispose of the short reauthentication session; retain the original user session.
   await fetch(base+'/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:service,Authorization:'Bearer '+check.access_token}});
   if(!await throttle('mail:global',50,3600)||!await issue(u,b.email.trim().toLowerCase(),'verify_email'))return reply({error:'Limite d’envoi atteinte. Réessayez dans une heure.'},429);
   return reply({ok:true,message:'Un e-mail de vérification a été envoyé. Ouvrez son lien pour activer la récupération.'});
  }
  if(b.action==='request'){
   if(!enabled)return reply({error:'L’envoi des e-mails est en cours de configuration.'},503);
   if(!await throttle('request:global',300,3600))return reply({error:'Trop de demandes. Réessayez plus tard.'},429);
   const login=phone(b.login);if(!login)return reply(generic);
   const account=(await table('staff_accounts?login=eq.'+encodeURIComponent(login)+'&active=eq.true&select=user_id'))[0];
   if(account){const contact=(await table('staff_recovery_contacts?user_id=eq.'+account.user_id+'&select=email'))[0];
    if(contact&&await throttle('mail:global',50,3600)){
     try{const u=await auth('admin/users/'+account.user_id);await issue(u,contact.email,'reset_password');}catch{/* Uniform response: never expose account existence or delivery status. */}
    }
   }
   return reply(generic);
  }
  if(b.action==='verify'||b.action==='reset'){
   if(typeof b.token!=='string'||!(/^[a-f0-9]{64}$/).test(b.token))return reply({error:'Lien invalide ou expiré.'},400);
   if(b.action==='reset'&&!strong(b.password))return reply({error:'10 caractères minimum, avec majuscule, minuscule et chiffre.'},400);
   const hash=await digest(b.token),purpose=b.action==='verify'?'verify_email':'reset_password';
   const t=(await table('staff_recovery_tokens?token_hash=eq.'+hash+'&purpose=eq.'+purpose+'&used_at=is.null&select=user_id,expires_at'))[0];
   if(!t||Date.parse(t.expires_at)<=Date.now())return reply({error:'Lien invalide ou expiré. Demandez un nouveau lien.'},400);
   const u=await auth('admin/users/'+t.user_id),version=u.app_metadata?.password_version||0;
   let id;try{id=await table('rpc/staff_recovery_take','POST',{p_hash:hash,p_purpose:purpose,p_version:version});}catch{return reply({error:'Lien invalide ou expiré. Demandez un nouveau lien.'},400);}
   if(b.action==='reset')await auth('admin/users/'+id,'PUT',{password:b.password,app_metadata:{...u.app_metadata,password_version:version+1,must_change_password:false}});
   return reply({ok:true,message:b.action==='verify'?'Adresse e-mail vérifiée. La récupération est activée.':'Mot de passe modifié. Vous pouvez vous reconnecter.'});
  }
  return reply({error:'Action inconnue.'},400);
 }catch{return reply({error:'Opération impossible. Réessayez ou demandez un nouveau lien.'},400);}
});
