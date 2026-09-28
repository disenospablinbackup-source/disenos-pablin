import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';
import email from '../api/send-email.js';
import bot from '../api/bot-webhook.js';
import tracking from '../api/tracking.js';
import config from '../api/config.js';
import { escapeHtml } from '../lib/server.js';

const originalFetch = globalThis.fetch, originalTransport = nodemailer.createTransport;
afterEach(() => { globalThis.fetch = originalFetch; nodemailer.createTransport = originalTransport; });
Object.assign(process.env, { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', GMAIL_USER: 'test@example.com', GMAIL_PASS: 'test-only', SITE_URL: 'https://example.com', GEMINI_MODEL: 'test-model', GEMINI_API_KEY: 'test-only' });
const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const slug = 'a'.repeat(32);
test('public configuration refuses server-only secret keys',async()=>{
  const saved=process.env.SUPABASE_PUBLISHABLE_KEY;
  process.env.SUPABASE_PUBLISHABLE_KEY='sb_secret_test';
  try { const res=await call(config,{},'','GET'); assert.equal(res.code,503);assert.ok(!JSON.stringify(res.body).includes('sb_secret')); }
  finally { process.env.SUPABASE_PUBLISHABLE_KEY=saved; }
});
async function call(handler, body = {}, authorization = 'Bearer test-session', method = 'POST') {
  const res = { code: 200, headers: {}, setHeader(k,v) { this.headers[k]=v; }, status(code) { this.code=code; return this; }, json(body) { this.body=body; return this; } };
  await handler({ method, headers: { authorization }, body }, res);
  return res;
}
test('anonymous requests cannot invoke email or AI, even with a claimed phone', async () => {
  globalThis.fetch = () => { throw new Error('must not contact providers'); };
  for (const handler of [email, bot]) assert.equal((await call(handler, { telefono: 'admin', mensaje: 'update' }, '')).code, 401);
});
test('non-admin and forged sessions are rejected', async () => {
  globalThis.fetch = async () => response({ app_metadata: {}, user_metadata: { role: 'admin' } });
  assert.equal((await call(email, { slugTracking: slug })).code, 403);
  globalThis.fetch = async () => response({}, 401);
  assert.equal((await call(bot, { mensaje: 'hola' })).code, 401);
});
test('email uses the database recipient and escapes stored HTML', async () => {
  let sent;
  globalThis.fetch = async url => url.endsWith('/user') ? response({ app_metadata: { role:'admin' } }) : url.includes('consume_admin_quota') ? response(true) : response([{ id_obra: '#OBR-1', fase_actual:'<img src=x onerror=alert(1)>', clientes: { nombres: '<script>attack</script>', correo_electronico:'client@example.com' } }]);
  nodemailer.createTransport = () => ({ sendMail: async msg => { sent=msg; return { messageId:'test' }; } });
  const res = await call(email, { slugTracking: slug, clienteEmail: 'attacker@example.com', nuevaFase: 'Injected' });
  assert.equal(res.code, 200);
  assert.equal(sent.to.address, 'client@example.com');
  assert.ok(sent.html.includes('&lt;script&gt;'));
  assert.ok(!sent.html.includes('<img'));
  assert.ok(sent.html.includes('https://example.com/tracking.html?t=' + slug));
});
test('quota denies sending and raw SMTP errors do not leak', async () => {
  let allowed = false;
  globalThis.fetch = async url => url.endsWith('/user') ? response({ app_metadata: { role:'admin' } }) : url.includes('consume_admin_quota') ? response(allowed) : response([{ clientes:{ correo_electronico:'client@example.com' } }]);
  nodemailer.createTransport = () => ({ sendMail: async () => { throw new Error('secret credential'); } });
  assert.equal((await call(email, { slugTracking:slug })).code, 429);
  allowed = true;
  const res=await call(email, { slugTracking:slug });
  assert.equal(res.code, 500); assert.ok(!JSON.stringify(res.body).includes('secret'));
});
test('AI provider errors return failure instead of success', async () => {
  globalThis.fetch = async url => url.endsWith('/user') ? response({ app_metadata:{ role:'admin' } }) : url.includes('consume_admin_quota') ? response(true) : response({ error: 'provider secret' }, 404);
  const res=await call(bot, { mensaje:'hola' });
  assert.equal(res.code, 502); assert.equal(res.body.success, undefined);
});
test('AI action text never causes a database update or email', async () => {
  const calls=[];
  globalThis.fetch=async (url, options) => { calls.push([url, options.method]); return url.endsWith('/user') ? response({app_metadata:{role:'admin'}}) : url.includes('consume_admin_quota') ? response(true) : response({candidates:[{content:{parts:[{text:'[ACCION_DB]{"tipo":"UPDATE_OBRA"}[/ACCION_DB]'}]}}]}); };
  nodemailer.createTransport=()=>{throw new Error('must not send');};
  assert.equal((await call(bot,{mensaje:'actualiza todo'})).code,200);
  assert.equal(calls.length,3);
  assert.ok(!calls.some(([url,method])=>url.includes('/obras') || method==='PATCH'));
});
test('tracking rejects short tokens and invalid reviews before accessing data', async () => {
  globalThis.fetch=()=>{throw new Error('must not contact database');};
  assert.equal((await call(tracking,{token:'abc123'},'')).code,404);
  assert.equal((await call(tracking,{token:slug,action:'review',stars:6,comment:'x'},'')).code,400);
});
test('tracking uses only the limited RPC and public API key',async()=>{
  globalThis.fetch=async(url,options)=>{assert.ok(url.endsWith('/rpc/get_public_tracking'));assert.equal(options.headers.Authorization,undefined);assert.deepEqual(JSON.parse(options.body),{tracking_token:slug});return response({fase_actual:'Diseño'});};
  assert.deepEqual((await call(tracking,{token:slug},'')).body,{fase_actual:'Diseño'});
});
test('methods and HTML escaping',async()=>{
  assert.equal((await call(email,{},'', 'GET')).code,405);
  assert.equal(escapeHtml('<a x="\'">&'), '&lt;a x=&quot;&#39;&quot;&gt;&amp;');
});
