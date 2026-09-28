import { endpoint, env, HttpError } from '../lib/server.js';
export default endpoint('GET', async (_req, res) => {
  const key = env('SUPABASE_PUBLISHABLE_KEY');
  if (!key.startsWith('sb_publishable_')) throw new HttpError(503, 'Configura una clave publicable de Supabase');
  return res.status(200).json({ url: env('SUPABASE_URL'), key });
});
