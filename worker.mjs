import { buildAssistance } from './assist.mjs';
import { seedCases, roleByStage } from './seed.mjs';

const sessionTTL = 8 * 3600;
const workspaceTTL = 14 * 86400;
const schemas = [
  'CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, workspace TEXT NOT NULL, expires INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS applications (workspace TEXT, id TEXT, version INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(workspace,id))',
  'CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, expires INTEGER NOT NULL)',
];
const publicUser = {name:'पुनरावलोकन अधिकारी'};
class RequestProblem extends Error {
  constructor(status,message) { super(message); this.status=status; }
}
function fail(status,message) { throw new RequestProblem(status,message); }
function json(value,status=200,headers=new Headers()) {
  headers.set('Content-Type','application/json; charset=utf-8');
  headers.set('Cache-Control','no-store');
  headers.set('X-Content-Type-Options','nosniff');
  return new Response(JSON.stringify(value),{status,headers});
}
function readCookie(request,name) {
  const pair=(request.headers.get('cookie') || '').split(/;\s*/).find(x=>x.startsWith(name+'='));
  const value=pair?.slice(name.length+1);
  return value && /^[a-f0-9-]{72}$/.test(value) ? value : '';
}
function freshToken() { return crypto.randomUUID()+crypto.randomUUID(); }
async function digest(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
}
function cookie(request,key,value,seconds) {
  return key+'='+value+'; HttpOnly; Path=/; SameSite=Lax; Max-Age='+seconds+(new URL(request.url).protocol==='https:'?'; Secure':'');
}
async function bodyJSON(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) fail(415,'अर्जाची माहिती योग्य स्वरूपात पाठवा.');
  const data=await request.text();
  if (data.length>10000) fail(413,'नोंद खूप मोठी आहे.');
  try {
    const body=JSON.parse(data);
    if (!body || Array.isArray(body) || typeof body!=='object') throw Error();
    return body;
  } catch { fail(400,'अर्जाची माहिती वाचता आली नाही.'); }
}
async function login(request,env) {
  const body=await bodyJSON(request);
  if (body.username!==(env.DEMO_USER || 'officer') || body.password!==(env.DEMO_PASSWORD || 'Kenpath2026!')) fail(401,'वापरकर्तानाव किंवा पासवर्ड चुकीचा आहे.');
  const db=env.DB;
  const now=Math.floor(Date.now()/1000);
  let workspaceToken=readCookie(request,'ls_workspace');
  let workspace=await digest(workspaceToken);
  const existing=workspaceToken && await db.prepare('SELECT id FROM workspaces WHERE id=? AND expires>?').bind(workspace,now).first();
  const updates=[
    db.prepare('DELETE FROM sessions WHERE expires<=?').bind(now),
    db.prepare('DELETE FROM applications WHERE workspace IN (SELECT id FROM workspaces WHERE expires<=?)').bind(now),
    db.prepare('DELETE FROM workspaces WHERE expires<=?').bind(now),
  ];
  if (!existing) {
    workspaceToken=freshToken();
    workspace=await digest(workspaceToken);
    updates.push(db.prepare('INSERT INTO workspaces(id,expires) VALUES(?,?)').bind(workspace,now+workspaceTTL));
    for (const c of seedCases()) updates.push(db.prepare('INSERT INTO applications(workspace,id,version,data) VALUES(?,?,?,?)').bind(workspace,c.id,c.version,JSON.stringify(c)));
  } else {
    updates.push(db.prepare('UPDATE workspaces SET expires=? WHERE id=?').bind(now+workspaceTTL,workspace));
  }
  const session=freshToken();
  updates.push(db.prepare('INSERT INTO sessions(token,workspace,expires) VALUES(?,?,?)').bind(await digest(session),workspace,now+sessionTTL));
  await db.batch(updates);
  const headers=new Headers();
  headers.append('Set-Cookie',cookie(request,'ls_session',session,sessionTTL));
  headers.append('Set-Cookie',cookie(request,'ls_workspace',workspaceToken,workspaceTTL));
  return json({user:publicUser},200,headers);
}
function transition(c,body) {
  if (body.version!==c.version) fail(409,'या अर्जात बदल झाला आहे. अद्ययावत माहिती पुन्हा उघडा.');
  const {action}=body;
  const note=typeof body.note==='string' ? body.note.trim() : '';
  if (!note || note.length>1500) fail(422,'१ ते १५०० अक्षरांची नोंद लिहा.');
  const checks=body.checks ?? [];
  if (!Array.isArray(checks) || checks.some(id=>!c.documents.some(d=>d.id===id))) fail(422,'पुराव्यांची निवड तपासा.');
  const actor=action==='resubmit' ? roleByStage.intake : roleByStage[c.stage];
  if (c.status==='returned' && action==='resubmit') {
    c.status='active'; c.stage='intake'; c.fieldIncome=null; c.fieldNote='';
    for (const doc of c.documents) {
      if (!doc.present && checks.includes(doc.id)) {
        doc.present=true;
        doc.detail='दुरुस्तीनंतर मिळालेली नमुना प्रत. स्वीकृती नोंद: '+note;
      }
      doc.verified=false;
    }
  } else if (c.status!=='active') fail(422,'या स्थितीत ही कृती करता येत नाही.');
  else if (action==='return') c.status='returned';
  else if (action==='advance' && c.stage==='intake') {
    if (c.documents.some(d=>!d.present || !checks.includes(d.id))) fail(422,'पुढे पाठवण्यासाठी सर्व पुरावे मिळणे आणि पडताळणे आवश्यक आहे.');
    for (const doc of c.documents) doc.verified=true;
    c.stage='field';
  } else if (action==='advance' && c.stage==='field') {
    if (!Number.isSafeInteger(body.fieldIncome) || body.fieldIncome<0 || body.fieldIncome>1000000000) fail(422,'चौकशीत पडताळलेले वार्षिक उत्पन्न पूर्ण रुपयांत भरा.');
    c.fieldIncome=body.fieldIncome; c.fieldNote=note; c.stage='decision';
  } else if (c.stage==='decision' && ['approve','reject'].includes(action)) c.status=action==='approve'?'approved':'rejected';
  else fail(422,'या टप्प्यावर ही कृती करता येत नाही.');
  c.version++;
  c.note=note;
  c.history.push({at:new Date().toISOString(),actor,action,note});
  return c;
}
async function api(request,env,url) {
  const db=env.DB;
  if (!db) throw Error('Missing database binding');
  await db.batch(schemas.map(s=>db.prepare(s)));
  const path=url.pathname,method=request.method;
  if (method==='POST' && request.headers.has('origin') && request.headers.get('origin')!==url.origin) fail(403,'ही विनंती मान्य करता येत नाही.');
  if (path==='/api/login' && method==='POST') return login(request,env);
  const token=await digest(readCookie(request,'ls_session'));
  const session=await db.prepare('SELECT workspace FROM sessions WHERE token=? AND expires>?').bind(token,Math.floor(Date.now()/1000)).first();
  if (path==='/api/session' && method==='GET') return json({user:session ? publicUser : null});
  if (!session) fail(401,'कृपया पुन्हा प्रवेश करा.');
  if (path==='/api/logout' && method==='POST') {
    await db.prepare('DELETE FROM sessions WHERE token=?').bind(token).run();
    const headers=new Headers();
    headers.append('Set-Cookie',cookie(request,'ls_session','',0));
    return json({ok:true},200,headers);
  }
  if (path==='/api/cases' && method==='GET') {
    const rows=await db.prepare('SELECT data FROM applications WHERE workspace=? ORDER BY id').bind(session.workspace).all();
    return json({cases:rows.results.map(r=>JSON.parse(r.data))});
  }
  const match=path.match(/^\/api\/cases\/(INC-2026-\d{4})(?:\/(action|assist))?$/);
  if (!match) fail(404,'विनंती सापडली नाही.');
  const row=await db.prepare('SELECT data FROM applications WHERE workspace=? AND id=?').bind(session.workspace,match[1]).first();
  if (!row) fail(404,'अर्ज सापडला नाही.');
  const c=JSON.parse(row.data);
  if (!match[2] && method==='GET') return json({case:c});
  if (match[2]==='assist' && method==='POST') {
    const result=await buildAssistance(c);
    return json({...result,source:result.method,text:result.summary});
  }
  if (match[2]==='action' && method==='POST') {
    const oldVersion=c.version;
    transition(c,await bodyJSON(request));
    const saved=await db.prepare('UPDATE applications SET data=?,version=? WHERE workspace=? AND id=? AND version=?').bind(JSON.stringify(c),c.version,session.workspace,c.id,oldVersion).run();
    if (saved.meta.changes!==1) fail(409,'या अर्जात बदल झाला आहे. अर्ज पुन्हा उघडा.');
    return json({case:c});
  }
  fail(405,'ही कृती उपलब्ध नाही.');
}
export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS?.fetch(request) || new Response('Not found',{status:404});
    try { return await api(request,env,url); }
    catch(error) {
      if (error instanceof RequestProblem) return json({error:error.message},error.status);
      console.error('Lokseva request failed',error.name);
      return json({error:'माहिती साठवताना अडचण आली. कृपया पुन्हा प्रयत्न करा.'},500);
    }
  }
};

