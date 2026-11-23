import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

let server,base;
before(async()=>{
  server=spawn(process.execPath,['server.mjs'],{cwd:new URL('.',import.meta.url),env:{...process.env,DB_FILE:':memory:',PORT:'0',HOST:'127.0.0.1',DEMO_USER:'officer',DEMO_PASSWORD:'Kenpath2026!'},stdio:['ignore','pipe','inherit']});
  const [line]=await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw Error('Server exited at startup')})]);
  base='http://127.0.0.1:'+String(line).match(/port (\d+)/)[1];
});
after(()=>{server?.kill();});
async function request(path,body,cookie='') {
  const response=await fetch(base+'/api/'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:body===undefined?undefined:JSON.stringify(body)});
  return {code:response.status,data:await response.json(),cookie:response.headers.getSetCookie().map(h=>h.split(';')[0]).join('; ')};
}
const login=cookie=>request('login',{username:'officer',password:'Kenpath2026!'},cookie);
test('review lifecycle, stale writes, applicant correction, denial and isolated workspaces',async()=>{
  assert.equal((await request('cases')).code,401);
  assert.equal((await request('login',{username:'officer',password:'bad'})).code,401);
  const {cookie}=await login();
  const cases=(await request('cases',undefined,cookie)).data.cases;
  assert.equal(cases.length,11);
  let c=cases.find(c=>c.id.endsWith('0418'));
  const path='cases/'+c.id;
  const action=(data)=>request(path+'/action',{version:c.version,note:'नोंदी तपासल्या.',...data},cookie);
  const assist=await request(path+'/assist',{},cookie);
  assert.equal(assist.code,200);
  assert.ok(assist.data.items.length);
  assert.equal((await action({action:'approve'})).code,422);
  assert.equal((await action({action:'advance',checks:c.documents.map(d=>d.id)})).code,422);
  c=(await action({action:'return',note:'उत्पन्नाचा पुरावा जोडावा.'})).data.case;
  assert.equal(c.status,'returned');
  const stale=c.version;
  c=(await action({action:'resubmit',checks:['income']})).data.case;
  assert.ok(c.documents.every(d=>d.present && !d.verified));
  assert.equal((await action({version:stale,action:'return'})).code,409);
  c=(await action({action:'advance',checks:c.documents.map(d=>d.id)})).data.case;
  assert.equal(c.stage,'field');
  assert.equal((await action({action:'advance',fieldIncome:-1})).code,422);
  c=(await action({action:'advance',fieldIncome:106000})).data.case;
  assert.equal(c.stage,'decision');
  const results=await Promise.all([action({action:'approve'}),action({action:'reject'})]);
  assert.deepEqual(results.map(r=>r.code).sort(),[200,409]);
  c=results.find(r=>r.code===200).data.case;
  assert.equal((await action({action:'return'})).code,422);
  assert.equal(c.history.length,6);
  const other=await login();
  assert.equal((await request(path,undefined,other.cookie)).data.case.status,'active');
  const another=cases.find(c=>c.id.endsWith('0421'));
  assert.equal((await request('cases/'+another.id+'/action',{version:1,action:'reject',note:'नोंदींमध्ये तफावत आहे.'},cookie)).data.case.status,'rejected');
  assert.equal((await request('logout',{},cookie)).code,200);
  assert.equal((await request(path,undefined,cookie)).code,401);
  assert.equal((await request(path,undefined,(await login(cookie)).cookie)).data.case.version,c.version);
});

