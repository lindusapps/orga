const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
module.exports=function createApp(options={}){
const html=fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');
const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
const storage=new Map([['lindus_v28_mobile_demo',JSON.stringify({users:{a:{passwordSalt:'retained-test-salt',passwordHash:'retained-test-hash'}}})]]),session=options.session||new Map(),nodes=new Map(),timers=[];
function elem(id=''){
 if(nodes.has(id))return nodes.get(id);
 const classes=new Set();const el={id,value:'',textContent:'',innerHTML:'',dataset:{},checked:false,style:{setProperty(){}},listeners:{},classList:{add(...v){v.forEach(x=>classes.add(x))},remove(...v){v.forEach(x=>classes.delete(x))},contains:v=>classes.has(v),toggle(v,b){if(b??!classes.has(v))classes.add(v);else classes.delete(v)}},addEventListener(t,f){(this.listeners[t]??=[]).push(f)},querySelectorAll(){return []},querySelector(s){return s==='.v30-scroll'?elem('scroll'):null},setAttribute(k,v){this[k]=v},getAttribute(k){return this[k]},focus(){},scrollTo(){},showModal(){this.open=true},close(){this.open=false;(this.listeners.close||[]).forEach(f=>f())},matches(){return false}};nodes.set(id,el);return el;
}
const dom={getElementById:elem,querySelector:elem,querySelectorAll(){return []},addEventListener(){},body:elem('body'),documentElement:elem('html')};
const sandbox={console,document:dom,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},sessionStorage:{getItem:k=>session.get(k)||null,setItem:(k,v)=>session.set(k,v),removeItem:k=>session.delete(k)},crypto:require('crypto').webcrypto,TextEncoder,Uint8Array,setTimeout(fn,delay){const t={fn,delay};timers.push(t);return t},setInterval(){},clearTimeout(t){if(t)t.cancelled=true},requestAnimationFrame(f){f()},Date:options.Date||Date,Intl,window:{addEventListener(){},innerHeight:768,scrollTo(){}},navigator:{}};
sandbox.fetch=options.fetch;sandbox.location={protocol:'https:'};vm.createContext(sandbox);
const qaExports=`globalThis.qa={remoteLogin,initAuth,logout,ensureSession,checkSessionDeadline,accountRequest,loadCloud,cloudAction,flushCloudPlan,planPayload,get state(){return state},renderAll,renderDirection,renderHome,renderMySchedule,completeLogin,showLogin,v30Choose,v30SetStatus,v30SetEnd,v30Publish,v30Period,v30Navigate,v30Coverage,v30Draft,v30Hours,v30Presentation,v30Table,v30Summary,v30LockPanel,v30Available,v30Preview,setThursdaySlotOpen,v30ISO,v30Days,v30Monday,v30Snapshot,v30Range};`;
let source=scripts.join('\n').replace('  initAuth();','  globalThis.authReady=initAuth();').replace(/\}\)\(\);\s*$/,qaExports+'})();');
if(options.planner){source=source.replace('const hostedAuth=true;','const hostedAuth=false;');source=source.replace(/  const initial=\{[\s\S]*?  let state=/,fs.readFileSync(require('path').join(__dirname,'initial-fixture.js'),'utf8')+'  let state=');}
vm.runInContext(source,sandbox);
return {q:sandbox.qa,elem,storage,session,sandbox,timers,ready:sandbox.authReady};
};
