// Deploy with verify_jwt=true. No public or bootstrap actions.
const base=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const origins=new Set(['https://indussapp.vercel.app']);
const taskIds=new Set(['t-o2','t-o3','t-s1','t-s2','t-s3','t-m1','t-m2','t-m3','t-m4','t-f1','t-f2','t-f3']);
const uuid=(x:unknown)=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
function day(x:unknown){if(typeof x!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(x)||new Date(x+'T12:00:00Z').toISOString().slice(0,10)!==x)throw new Error('Date invalide.');return x;}
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
async function api(path:string,method='GET',body?:unknown,token=key){
 const r=await fetch(base+path,{method,headers:{apikey:key,Authorization:'Bearer '+token,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=representation'},body:body===undefined?undefined:JSON.stringify(body)});
 const d=await r.json().catch(()=>null);if(!r.ok)throw new Error('Enregistrement impossible. Réessaie.');return d;
}
async function rows(table:string,query=''){
 const all=[];for(let offset=0;;offset+=1000){const batch=await api('/rest/v1/'+table+'?'+query+(query?'&':'')+'limit=1000&offset='+offset);all.push(...batch);if(batch.length<1000)break;}return all;
}
const upsert=(table:string,body:unknown)=>api('/rest/v1/'+table,'POST',body);
async function members(){return (await rows('staff_accounts','select=user_id,name,role,active')).map((a:any)=>({id:a.user_id,name:a.name,role:a.role,active:a.active}));}
async function securityAgents(){
 const teams=await rows('equipes','code=eq.secu&actif=eq.true&select=id');if(teams.length!==1)return [];
 const links=await rows('employes_equipes','equipe_id=eq.'+teams[0].id+'&select=employes!inner(auth_user_id,actif)');
 const ids=new Set(links.filter((r:any)=>r.employes.actif).map((r:any)=>r.employes.auth_user_id));
 return (await members()).filter((p:any)=>p.role==='employee'&&p.active&&ids.has(p.id));
}
const fields=['customSlots','exceptionalDays','thursdayUnlocked','validated','shiftEnds','planStatus','publishedPlans','published'];
function cleanPlan(input:any){
 if(!input||typeof input!=='object'||JSON.stringify(input).length>500000)throw new Error('Planning invalide ou trop volumineux.');
 const d:any={};for(const f of fields)d[f]=input[f]??(f==='customSlots'?[]:{});
 if(!Array.isArray(d.customSlots)||d.customSlots.length>40)throw new Error('Créneaux invalides.');
 const slots=new Set(['17','20','22']);
 for(const s of d.customSlots){if(!/^c\d{4}$/.test(s.id)||slots.has(s.id)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time)||typeof s.label!=='string'||s.label.length>100)throw new Error('Créneau invalide.');slots.add(s.id);}
 for(const f of fields.filter(f=>f!=='customSlots')){if(!d[f]||Array.isArray(d[f])||typeof d[f]!=='object')throw new Error('Planning invalide.');for(const date of Object.keys(d[f]))day(date);}
 for(const [date,list] of Object.entries(d.thursdayUnlocked))if(!Array.isArray(list)||list.some(x=>!slots.has(x)))throw new Error('Ouverture du jeudi invalide.');
 for(const x of Object.values(d.exceptionalDays) as any[])if(typeof x.title!=='string'||!x.title.trim()||x.title.length>200)throw new Error('Événement invalide.');
 for(const f of ['validated','shiftEnds','planStatus'])for(const map of Object.values(d[f]) as any[]){if(!map||typeof map!=='object'||Array.isArray(map))throw new Error('Planning invalide.');for(const [id,val] of Object.entries(map)){if(!uuid(id))throw new Error('Salarié invalide.');if(f==='validated'&&val!==null&&!slots.has(val as string))throw new Error('Créneau invalide.');if(f==='shiftEnds'&&(typeof val!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(val)))throw new Error('Heure invalide.');if(f==='planStatus'&&!['present','rest','leave','absent'].includes(val as string))throw new Error('Statut invalide.');}}
 return d;
}
function allowedSlots(plan:any,date:string){const dow=new Date(date+'T12:00:00Z').getUTCDay();const all=['17','20','22',...(plan.customSlots||[]).map((s:any)=>s.id)];return plan.exceptionalDays?.[date]||[5,6].includes(dow)?all:dow===4?(plan.thursdayUnlocked?.[date]||[]):[];}
function textFields(data:any,names:string[]){const out:any={};for(const name of names){if(typeof data?.[name]!=='string'||data[name].length>5000)throw new Error('Texte invalide ou trop long.');out[name]=data[name].trim();}return out;}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('Origin');const headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
 if(origin&&origins.has(origin))headers['Access-Control-Allow-Origin']=origin;
 const reply=(d:unknown,status=200)=>new Response(JSON.stringify(d),{status,headers});
 if(origin&&!origins.has(origin))return reply({error:'Origine non autorisée.'},403);
 if(req.method==='OPTIONS')return new Response(null,{headers});if(req.method!=='POST')return reply({error:'Méthode non autorisée.'},405);
 try{
 const token=(req.headers.get('Authorization')||'').replace(/^Bearer /,'');let u;
 try{u=await api('/auth/v1/user','GET',undefined,token);}catch{return reply({error:'Reconnecte-toi pour continuer.'},401);}
 const records=await rows('staff_accounts','user_id=eq.'+u.id+'&select=name,role,active');
 if(records.length!==1)return reply({error:'Compte non autorisé.'},403);
 const m={...u.app_metadata,staff_role:records[0].role,staff_name:records[0].name,staff_active:records[0].active};
 if(u.is_anonymous||!uuid(u.id)||!['direction','employee','security_manager'].includes(m.staff_role)||m.staff_active===false||m.must_change_password)return reply({error:'Accès refusé.'},403);
 const claims=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
 if((claims.app_metadata?.password_version||0)!==(m.password_version||0))return reply({error:'Reconnecte-toi après le changement de mot de passe.'},401);
 const b=await req.json(),admin=m.staff_role==='direction';
 const planning=(await rows('staff_planning','id=eq.true'))[0];const plan=planning.data||{};
 if(m.staff_role==='security_manager'){
  if(!['load','security-validate'].includes(b.action))return reply({error:'Accès limité à la validation des agents de sécurité.'},403);
  const agents=await securityAgents(),ids=new Set(agents.map((p:any)=>p.id));
  if(b.action==='load'){
   const availability=agents.length?await rows('staff_availability','user_id=in.('+agents.map((p:any)=>p.id).join(',')+')'):[];
   const publishedPlans=Object.fromEntries(Object.entries(plan.publishedPlans||{}).map(([d,v]:any)=>[d,{publishedAt:v.publishedAt,people:Object.fromEntries(Object.entries(v.people||{}).filter(([id])=>ids.has(id)).map(([id,p]:any)=>[id,{status:p.status,slot:p.slot,end:p.end}]))}]).filter(([,v]:any)=>Object.keys(v.people).length));
   return reply({plan:{customSlots:plan.customSlots||[],exceptionalDays:Object.fromEntries(Object.keys(plan.exceptionalDays||{}).map(d=>[d,{title:'Service exceptionnel'}])),thursdayUnlocked:plan.thursdayUnlocked||{},publishedPlans},revision:planning.revision,availability,tasks:[],debriefs:[],feedback:[],clock:[],incidents:[],people:[{id:u.id,name:m.staff_name||'Responsable sécurité',role:m.staff_role,active:true},...agents],today:today()});
  }
  if(!uuid(b.userId)||!ids.has(b.userId))return reply({error:'Validation réservée aux agents de l’équipe Sécu.'},403);
  const d=day(b.day);
  if(typeof b.slot!=='string'||typeof b.end!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.end)||!Number.isSafeInteger(b.revision))return reply({error:'Créneau ou heure invalide.'},400);
  if(b.revision!==planning.revision)return reply({error:'Planning modifié. Actualise avant de valider.'},409);
  try{const revision=await api('/rest/v1/rpc/staff_security_validate','POST',{p_actor_id:u.id,p_user_id:b.userId,p_day:d,p_slot:b.slot,p_end:b.end,p_revision:b.revision});return reply({ok:true,revision});}
  catch{return reply({error:'Validation refusée : actualise et vérifie l’équipe, le créneau et les disponibilités.'},409);}
 }
 if(b.action==='security-validate')return reply({error:'Utilise ton espace de planning autorisé.'},403);
 if(b.action==='load'){
  const own='user_id=eq.'+u.id;
  const [availability,tasks,debriefs,feedback,clock,incidents,people]=await Promise.all([rows('staff_availability',admin?'':own),rows('staff_tasks','day=eq.'+today()),rows('staff_debriefs',admin?'':own),rows('staff_feedback'),rows('staff_clock',admin?'':own),rows('staff_incidents',admin?'':own),admin?members():Promise.resolve([{id:u.id,name:m.staff_name||'Équipier',role:m.staff_role,active:true}])]);
  const visible=admin?plan:{customSlots:plan.customSlots||[],exceptionalDays:plan.exceptionalDays||{},thursdayUnlocked:plan.thursdayUnlocked||{},publishedPlans:Object.fromEntries(Object.entries(plan.publishedPlans||{}).filter(([,v]:any)=>v.people?.[u.id]).map(([d,v]:any)=>[d,{publishedAt:v.publishedAt,people:{[u.id]:v.people[u.id]}}]))};
  return reply({plan:visible,revision:planning.revision,availability,tasks:admin?tasks:tasks.map(({day,task_id,done}:any)=>({day,task_id,done})),debriefs,feedback,clock,incidents,people,today:today()});
 }
 if(b.action==='planning-save'){
  if(!admin)return reply({error:'Réservé à la direction.'},403);
  if(b.revision!==planning.revision)return reply({error:'Un autre administrateur a modifié le planning. Recharge avant de réessayer.'},409);
  const next=cleanPlan(b.data);
  const active=new Set((await members()).filter((p:any)=>p.role==='employee'&&p.active).map((p:any)=>p.id));
  const av=await rows('staff_availability');
  for(const [d,snapshot] of Object.entries(next.publishedPlans) as any){
   if(JSON.stringify(snapshot)===JSON.stringify(plan.publishedPlans?.[d]))continue;
   if(!snapshot?.people||typeof snapshot.people!=='object'||Array.isArray(snapshot.people))throw new Error('Publication invalide.');
   for(const [id,p] of Object.entries(snapshot.people) as any){if(!active.has(id)||!['present','rest','leave','absent'].includes(p.status))throw new Error('Salarié ou statut invalide.');if(p.status==='present'){if(!allowedSlots(next,d).includes(p.slot)||!av.find((a:any)=>a.user_id===id&&a.day===d)?.slots.includes(p.slot))throw new Error('Disponibilité modifiée : recharge le planning avant de publier.');if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(p.end))throw new Error('Heure de fin invalide.');}}
   snapshot.publishedAt=new Date().toISOString();
  }
  const saved=await api('/rest/v1/staff_planning?id=eq.true&revision=eq.'+planning.revision,'PATCH',{data:next,revision:planning.revision+1,updated_at:new Date().toISOString()});
  if(!saved.length)return reply({error:'Planning modifié simultanément. Recharge avant de réessayer.'},409);
  return reply({revision:saved[0].revision,plan:saved[0].data});
 }
 if(b.action==='availability'){
  const d=day(b.day);if(!Array.isArray(b.slots)||b.slots.length>43||b.slots.some((s:any)=>!allowedSlots(plan,d).includes(s)))throw new Error('Créneau fermé ou invalide.');
  await upsert('staff_availability',{user_id:u.id,day:d,slots:[...new Set(b.slots)],updated_at:new Date().toISOString()});return reply({ok:true});
 }
 if(b.action==='task'){
  if(!taskIds.has(b.taskId)||typeof b.done!=='boolean')throw new Error('Tâche invalide.');
  await upsert('staff_tasks',{day:today(),task_id:b.taskId,done:b.done,actor_id:u.id,updated_at:new Date().toISOString()});return reply({ok:true});
 }
 if(b.action==='tasks-reset'){
  if(!admin)return reply({error:'Réservé à la direction.'},403);
  await upsert('staff_tasks',[...taskIds].map(task_id=>({day:today(),task_id,done:false,actor_id:u.id,updated_at:new Date().toISOString()})));return reply({ok:true});
 }
 if(b.action==='debrief'){
  const d=day(b.day);if(plan.publishedPlans?.[d]?.people?.[u.id]?.status!=='present')return reply({error:'Ce débrief concerne un service où tu dois être présent sur le planning publié.'},403);
  const data=textFields(b.data,['ambiance','incidents','materiel','commentaire']);
  if(!['Très bonne','Bonne','Moyenne','Difficile'].includes(data.ambiance))throw new Error('Ambiance invalide.');
  await upsert('staff_debriefs',{user_id:u.id,day:d,data,submitted_at:new Date().toISOString()});return reply({ok:true});
 }
 if(b.action==='feedback'){
  if(!admin)return reply({error:'Réservé à la direction.'},403);
  await upsert('staff_feedback',{day:day(b.day),data:textFields(b.data,['positifs','corrections','consignes','message']),author_id:u.id,published_at:new Date().toISOString()});return reply({ok:true});
 }
 if(b.action==='clock'){
  if(!['start','stop'].includes(b.kind))throw new Error('Pointage invalide.');
  await api('/rest/v1/rpc/staff_clock_action','POST',{p_user_id:u.id,p_action:b.kind});return reply({ok:true});
 }
 if(b.action==='clock-correct'){
  if(!admin)return reply({error:'Réservé à la direction.'},403);
  if(!uuid(b.id)||typeof b.reason!=='string'||b.reason.trim().length<3||b.reason.length>1000)throw new Error('Identifiant ou motif invalide.');
  const start=new Date(b.start),end=new Date(b.end);if(!Number.isFinite(+start)||!Number.isFinite(+end)||end<=start||end>new Date())throw new Error('Horaires invalides.');
  const saved=await api('/rest/v1/staff_clock?id=eq.'+b.id,'PATCH',{started_at:start.toISOString(),ended_at:end.toISOString(),corrected_by:u.id,correction_reason:b.reason.trim()});if(!saved.length)throw new Error('Pointage introuvable.');return reply({ok:true});
 }
 if(b.action==='incident'){
  if(!['Matériel','Client','Stock','Sécurité','Autre'].includes(b.category)||typeof b.description!=='string'||!b.description.trim()||b.description.length>5000)throw new Error('Signalement invalide.');
  await upsert('staff_incidents',{user_id:u.id,category:b.category,description:b.description.trim()});return reply({ok:true});
 }
 return reply({error:'Action inconnue.'},400);
 }catch(e){return reply({error:e instanceof Error?e.message:'Opération impossible.'},400);}
});
