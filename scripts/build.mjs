import { readFile, writeFile, readdir, mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist');
const client = path.join(output, 'client');
const read = file => readFile(path.join(root, file), 'utf8');

// This small project has a fixed, acyclic module graph. Wrapping each module
// keeps its private names private in the standalone Worker deployment.
function inlineModule(source, name, requested) {
  const exposed = new Set();
  const code = source.replace(/^export\s+(?=(?:async\s+)?(?:function|const|let|class)\s+(\w+))/gm,
    (_, symbol) => { exposed.add(symbol); return ''; })
    .replace(/^export\s*\{([^}]+)\}\s*;?/gm, (_, symbols) => {
      symbols.split(',').forEach(symbol => exposed.add(symbol.trim()));
      return '';
    });
  for (const symbol of requested) {
    if (!exposed.has(symbol)) throw new Error(`Missing export ${symbol} in ${name}`);
  }
  return `const { ${requested.join(', ')} } = (() => {\n${code}\nreturn { ${requested.join(', ')} };\n})();`;
}

const application = await read('worker.mjs');
const workers = [];
const applicationBody = application.replace(/^import\s*\{([^}]+)\}\s*from\s*['"]\.\/([\w.-]+)['"];?/gm, (_, symbols, filename) => {
  workers.push({ filename, symbols: symbols.split(',').map(s => s.trim()) });
  return '';
});
const sections = [];
for (const module of workers) {
  sections.push(inlineModule(await read(module.filename), module.filename, module.symbols));
}
if (!/export\s+default\s+/.test(applicationBody)) throw new Error('Missing worker default export');
sections.push(applicationBody.replace(/export\s+default\s+/, 'const applicationWorker = '));

const mime = { '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.html':'text/html; charset=utf-8', '.svg':'image/svg+xml', '.woff2':'font/woff2', '.png':'image/png', '.ico':'image/x-icon' };
const assets = {};
async function addAssets(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries.sort((a,b) => a.name.localeCompare(b.name))) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) { await addAssets(filename); continue; }
    if (!entry.isFile()) throw new Error(`Unsupported asset ${filename}`);
    const type = mime[path.extname(entry.name)];
    if (!type) throw new Error(`Missing content type for ${filename}`);
    const key = '/' + path.relative(client, filename).split(path.sep).join('/');
    assets[key] = [type, (await readFile(filename)).toString('base64')];
  }
}
await addAssets(client);
if (!assets['/index.html']) throw new Error('The interface is missing its entry page');
sections.push('const embeddedFiles = ' + JSON.stringify(assets) + ';');
sections.push(`
const staticFiles = {
  async fetch(request) {
    if (!['GET','HEAD'].includes(request.method)) return new Response(null,{status:405,headers:{Allow:'GET, HEAD'}});
    const pathname = new URL(request.url).pathname;
    const entry = embeddedFiles[pathname === '/' ? '/index.html' : pathname];
    if (!Array.isArray(entry)) return new Response(null, { status: 404 });
    const [type, encoded] = entry;
    const body = request.method === 'HEAD' ? null : Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
    return new Response(body, {headers:{'Content-Type':type,'X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'}});
  }
};
export default {
  fetch(request, env, context) {
    return applicationWorker.fetch(request, { ...env, ASSETS: staticFiles }, context);
  }
};
`);
await mkdir(path.join(output,'server'), {recursive:true});
await mkdir(path.join(output,'.openai'), {recursive:true});
await copyFile(path.join(root,'.openai','hosting.json'), path.join(output,'.openai','hosting.json'));
await writeFile(path.join(output,'server','index.js'), sections.join('\n\n'), 'utf8');
console.log(`Built Worker with ${Object.keys(assets).length} embedded assets.`);
