export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function env(name) {
  if (!process.env[name]) throw new HttpError(503, 'Servicio pendiente de configuración');
  return process.env[name];
}
export function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}
export async function supabase(path, token, options = {}) {
  const response = await fetch(env('SUPABASE_URL') + path, {
    ...options,
    headers: { apikey: env('SUPABASE_PUBLISHABLE_KEY'), ...(token ? { Authorization: 'Bearer ' + token } : {}), 'Content-Type': 'application/json', ...options.headers },
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new HttpError(502, 'No se pudo completar la operación de datos');
  return response.status === 204 ? null : response.json();
}
export async function requireAdmin(req) {
  const match = /^Bearer ([^\s]+)$/.exec(req.headers?.authorization || '');
  if (!match) throw new HttpError(401, 'Inicia sesión para continuar');
  const token = match[1];
  const response = await fetch(env('SUPABASE_URL') + '/auth/v1/user', {
    headers: { apikey: env('SUPABASE_PUBLISHABLE_KEY'), Authorization: 'Bearer ' + token },
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new HttpError(response.status >= 500 ? 503 : 401, 'No se pudo verificar la sesión');
  const user = await response.json();
  if (user.app_metadata?.role !== 'admin') throw new HttpError(403, 'Acceso solo para administradores');
  return token;
}
export async function rateLimit(token, action) {
  const allowed = await supabase('/rest/v1/rpc/consume_admin_quota', token, {
    method: 'POST', body: JSON.stringify({ action_name: action })
  });
  if (allowed !== true) throw new HttpError(429, 'Demasiadas solicitudes; espera un minuto');
}
export function endpoint(method, handler) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method !== method) {
      res.setHeader('Allow', method);
      return res.status(405).json({ error: 'Método no permitido' });
    }
    try { return await handler(req, res); }
    catch (error) {
      return res.status(error instanceof HttpError ? error.status : 500)
        .json({ error: error instanceof HttpError ? error.message : 'No se pudo completar la operación' });
    }
  };
}
