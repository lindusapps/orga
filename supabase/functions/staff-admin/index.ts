// Deploy with verify_jwt=true. No bootstrap or unauthenticated administration route.
const base = Deno.env.get('SUPABASE_URL')!;
const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const allowed = new Set(['https://indussapp.vercel.app','https://orga-roan.vercel.app']);
const profile = (u:any) => ({id:u.id,name:u.app_metadata.staff_name||'Équipier',login:u.app_metadata.staff_login||'',role:u.app_metadata.staff_role,active:u.app_metadata.staff_active!==false,mustChange:!!u.app_metadata.must_change_password});
async function auth(path:string,method='GET',body?:unknown,token=service) {
  const r=await fetch(base+'/auth/v1/'+path,{method,headers:{apikey:service,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error('Opération refusée par le service d’authentification.');
  return data;
}
async function table(path:string,method='GET',body?:unknown){
 const r=await fetch(base+'/rest/v1/'+path,{method,headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=representation'},body:body===undefined?undefined:JSON.stringify(body)});
 const d=await r.json().catch(()=>null);if(!r.ok)throw new Error('Équipe indisponible.');return d;
}
async function allRows(path:string){const all=[];for(let offset=0;;offset+=1000){const batch=await table(path+(path.includes('?')?'&':'?')+'limit=1000&offset='+offset);all.push(...batch);if(batch.length<1000)break;}return all;}
const validId=(id:unknown)=>typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
const roles=['direction','employee','security_manager'];
function accountInput(b:any){if(typeof b.name!=='string'||!b.name.trim()||b.name.length>80||!roles.includes(b.role)||!Array.isArray(b.teamIds)||b.teamIds.length>20||b.teamIds.some((id:any)=>!validId(id))||(b.role!=='employee'&&b.teamIds.length))throw new Error('Nom, fonction ou équipe invalide.');}
// A reserved, non-deliverable alias supports username/password through Auth's email provider.
// No email or SMS is sent. The application only displays the telephone identifier.
function canonicalPhone(value:unknown) {
  let n=String(value||'').replace(/[\s().-]/g,'');
  if(/^0[1-9]\d{8}$/.test(n))n='+33'+n.slice(1);
  if(!/^\+[1-9]\d{7,14}$/.test(n))throw new Error('Numéro invalide.');
  return n.slice(1);
}
const strong = (p:unknown) => typeof p==='string'&&p.length>=10&&p.length<=128&&/[A-Z]/.test(p)&&/[a-z]/.test(p)&&/[0-9]/.test(p);
Deno.serve(async(req:Request)=>{
  const origin=req.headers.get('Origin');
  const headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
  if(origin&&allowed.has(origin))headers['Access-Control-Allow-Origin']=origin;
  const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
  if(origin&&!allowed.has(origin))return reply({error:'Origine non autorisée.'},403);
  if(req.method==='OPTIONS')return new Response(null,{headers});
  if(req.method!=='POST')return reply({error:'Méthode non autorisée.'},405);
  try {
    const token=(req.headers.get('Authorization')||'').replace(/^Bearer /,'');
    let actor;
    try{actor=await auth('user','GET',undefined,token);}catch{return reply({error:'Reconnecte-toi pour continuer.'},401);}
    const records=await table('staff_accounts?user_id=eq.'+actor.id+'&select=*');
    if(records.length!==1)return reply({error:'Compte non autorisé.'},403);
    const record=records[0];actor={...actor,app_metadata:{...actor.app_metadata,staff_role:record.role,staff_name:record.name,staff_login:record.login,staff_active:record.active}};
    const m=actor.app_metadata||{};
    if(actor.is_anonymous||!['direction','employee','security_manager'].includes(m.staff_role)||m.staff_active===false)return reply({error:'Accès refusé.'},403);
    const claims=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
    if((claims.app_metadata?.password_version||0)!==(m.password_version||0))return reply({error:'Mot de passe réinitialisé. Reconnecte-toi.'},401);
    const b=await req.json();
    if(b.action==='me')return reply({user:profile(actor)});
    if(b.action==='change-password') {
      if(!strong(b.password))return reply({error:'10 caractères minimum, avec majuscule, minuscule et chiffre.'},400);
      if(typeof b.currentPassword!=='string'||!b.currentPassword)return reply({error:'Indique ton mot de passe actuel.'},400);
      // Reauthenticate using the actor returned by Auth, never a client-supplied identity.
      await auth('token?grant_type=password','POST',{email:actor.email,password:b.currentPassword});
      await auth('user','PUT',{password:b.password,current_password:b.currentPassword},token);
      await auth('admin/users/'+actor.id,'PUT',{app_metadata:{...m,must_change_password:false,password_version:(m.password_version||0)+1}});
      await auth('logout?scope=global','POST',undefined,token);
      return reply({ok:true});
    }
    if(m.must_change_password)return reply({error:'Change ton mot de passe pour continuer.'},403);
    if(m.staff_role!=='direction')return reply({error:'Accès réservé à la direction.'},403);
    if(b.action==='list') {
      const [accounts,teams,functions,links]=await Promise.all([allRows('staff_accounts?select=*'),allRows('equipes?select=id,code,nom,actif,ordre&order=ordre'),allRows('staff_roles?select=*'),allRows('employes_equipes?select=equipe_id,employes!inner(auth_user_id)')]);
      const users=accounts.map((a:any)=>({id:a.user_id,name:a.name,login:a.login,role:a.role,active:a.active,revision:a.revision,teamIds:links.filter((l:any)=>l.employes.auth_user_id===a.user_id).map((l:any)=>l.equipe_id)}));
      return reply({users,teams,roles:functions});
    }
    if(b.action==='update-account') {
      if(!validId(b.userId)||typeof b.active!=='boolean'||!Number.isSafeInteger(b.revision))return reply({error:'Compte invalide.'},400);
      accountInput(b);
      if(b.userId===actor.id&&(b.role!=='direction'||!b.active))return reply({error:'Impossible de retirer tes propres droits Direction.'},400);
      try{const revision=await table('rpc/staff_account_save','POST',{p_actor_id:actor.id,p_user_id:b.userId,p_name:b.name.trim(),p_role:b.role,p_active:b.active,p_team_ids:b.teamIds,p_revision:b.revision});return reply({ok:true,revision});}
      catch{return reply({error:'Modification refusée : actualise puis vérifie les équipes et les droits Direction.'},409);}
    }
    if(b.action==='create') {
      if(!strong(b.password))return reply({error:'10 caractères minimum, avec majuscule, minuscule et chiffre.'},400);
      accountInput(b);
      const name=b.name.trim(),digits=canonicalPhone(b.login),login=digits.startsWith('33')&&digits.length===11?'0'+digits.slice(2):'+'+digits;
      const teams=await table('equipes?actif=eq.true&select=id');
      if(b.teamIds.some((id:string)=>!teams.some((t:any)=>t.id===id)))return reply({error:'Équipe invalide.'},400);
      const created=await auth('admin/users','POST',{email:'u'+digits+'@login.indussapp.invalid',email_confirm:true,password:b.password,app_metadata:{staff_name:name,staff_login:login,staff_role:b.role,staff_active:true,must_change_password:false,password_version:0}});
      try{await table('rpc/staff_account_register','POST',{p_actor_id:actor.id,p_user_id:created.id,p_name:name,p_login:login,p_role:b.role,p_team_ids:b.teamIds});}
      catch{await auth('admin/users/'+created.id,'DELETE');return reply({error:'Création SQL refusée. Aucun nouveau compte conservé.'},409);}
      return reply({user:profile(created)});
    }
    if(b.action==='reset-password') {
      if(!/^[0-9a-f-]{36}$/i.test(b.userId||''))return reply({error:'Compte introuvable.'},400);
      if(b.userId===actor.id)return reply({error:'Utilise « Changer mon mot de passe ».'},400);
      const target=await auth('admin/users/'+b.userId);
      if(!(await table('staff_accounts?user_id=eq.'+target.id+'&select=user_id')).length)return reply({error:'Compte introuvable.'},404);
      if(!strong(b.password))return reply({error:'10 caractères minimum, avec majuscule, minuscule et chiffre.'},400);
      const password=b.password;
      await auth('admin/users/'+target.id,'PUT',{password,app_metadata:{...target.app_metadata,must_change_password:true,password_version:(target.app_metadata.password_version||0)+1}});
      return reply({ok:true});
    }
    return reply({error:'Action inconnue.'},400);
  }catch{return reply({error:'Opération impossible. Vérifie tes informations puis réessaie.'},400);}
});
