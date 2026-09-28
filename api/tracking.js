import { endpoint, HttpError, supabase } from '../lib/server.js';
export default endpoint('POST', async (req, res) => {
  const { token, stars, comment, action = 'read' } = req.body || {};
  if (typeof token !== 'string' || !/^[a-f0-9]{32,64}$/.test(token)) throw new HttpError(404, 'Enlace no válido');
  if (action !== 'read' && action !== 'review') throw new HttpError(400, 'Acción no válida');
  if (action === 'review' && (!Number.isInteger(stars) || stars < 1 || stars > 5 || typeof comment !== 'string' || comment.length > 2000)) throw new HttpError(400, 'La valoración debe tener de 1 a 5 estrellas y hasta 2000 caracteres');
  const data = await supabase('/rest/v1/rpc/' + (action === 'review' ? 'submit_tracking_review' : 'get_public_tracking'), null, {
    method: 'POST', body: JSON.stringify(action === 'review' ? { tracking_token: token, stars, comment } : { tracking_token: token })
  });
  if (!data) throw new HttpError(404, 'Seguimiento no disponible');
  return res.status(200).json(data);
});
