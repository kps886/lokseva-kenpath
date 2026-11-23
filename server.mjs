import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { createReadStream, mkdirSync, statSync } from 'node:fs';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import worker from './worker.mjs';

const root=dirname(fileURLToPath(import.meta.url));
const publicDir=resolve(root,'dist/client');
const database=process.env.DB_FILE || resolve(root,'data/lokseva.sqlite');
if(database!==':memory:') mkdirSync(dirname(database),{recursive:true});
const sqlite=new DatabaseSync(database);
sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');

class Query {
  constructor(sql,args=[]) { this.sql=sql; this.args=args; }
  bind(...args) { return new Query(this.sql,args); }
  first() { return sqlite.prepare(this.sql).get(...this.args) || null; }
  all() { return {results:sqlite.prepare(this.sql).all(...this.args)}; }
  run() { return {meta:{changes:sqlite.prepare(this.sql).run(...this.args).changes}}; }
}
const DB={
  prepare(sql) { return new Query(sql); },
  batch(queries) {
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      const results=queries.map(q=>q.run());
      sqlite.exec('COMMIT');
      return results;
    } catch(error) { sqlite.exec('ROLLBACK'); throw error; }
  }
};
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.ico':'image/x-icon'};
const ASSETS={
  fetch(request) {
    if (!['GET','HEAD'].includes(request.method)) return new Response(null,{status:405});
    const pathname=decodeURIComponent(new URL(request.url).pathname);
    const file=resolve(publicDir,'.'+(pathname==='/'?'/index.html':pathname));
    if (!file.startsWith(publicDir+sep)) return new Response(null,{status:404});
    try {
      if (!statSync(file).isFile()) return new Response(null,{status:404});
      return new Response(request.method==='HEAD'?null:Readable.toWeb(createReadStream(file)),{headers:{'Content-Type':types[extname(file)] || 'application/octet-stream','X-Content-Type-Options':'nosniff'}});
    } catch { return new Response(null,{status:404}); }
  }
};
const server=http.createServer(async(req,res)=>{
  try {
    const scheme=req.socket.encrypted ? 'https':'http';
    const origin=process.env.PUBLIC_ORIGIN || process.env.RENDER_EXTERNAL_URL || scheme+'://'+req.headers.host;
    let body;
    if (!['GET','HEAD'].includes(req.method)) {
      const parts=[];
      let size=0;
      for await (const chunk of req) {
        size+=chunk.length;
        if (size>40000) { res.writeHead(413);res.end();return; }
        parts.push(chunk);
      }
      body=Buffer.concat(parts);
    }
    const request=new Request(new URL(req.url,origin),{method:req.method,headers:req.headers,body});
    const response=await worker.fetch(request,{DB,ASSETS,DEMO_USER:process.env.DEMO_USER,DEMO_PASSWORD:process.env.DEMO_PASSWORD});
    const headers=Object.fromEntries(response.headers);
    if(response.headers.has('set-cookie')) headers['set-cookie']=response.headers.getSetCookie();
    res.writeHead(response.status,headers);
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch { res.writeHead(500);res.end('Server error'); }
});
server.listen(Number(process.env.PORT || 3000),process.env.HOST || '127.0.0.1',()=>{
  console.log('Lokseva listening on port '+server.address().port);
});

