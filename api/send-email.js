import nodemailer from 'nodemailer';
import { endpoint, env, escapeHtml, HttpError, requireAdmin, rateLimit, supabase } from '../lib/server.js';

export default endpoint('POST', async (req, res) => {
  const token = await requireAdmin(req);
  const slug = req.body?.slugTracking;
  if (typeof slug !== 'string' || !/^[a-f0-9]{32,64}$/.test(slug)) throw new HttpError(400, 'Enlace de obra no válido');
  const rows = await supabase('/rest/v1/obras?select=*,clientes(*)&slug_tracking=eq.' + encodeURIComponent(slug) + '&limit=1', token);
  const obra = rows[0];
  if (!obra) throw new HttpError(404, 'Obra no encontrada');
  const cliente = obra.clientes;
  const recipient = cliente?.correo_electronico || cliente?.email;
  if (typeof recipient !== 'string' || !/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(recipient)) throw new HttpError(400, 'El cliente no tiene un correo válido');
  const site = new URL(env('SITE_URL'));
  if (site.protocol !== 'https:') throw new HttpError(503, 'Configura SITE_URL con HTTPS');
  const tracking = new URL('/tracking.html', site);
  tracking.searchParams.set('t', slug);
  const user = env('GMAIL_USER'), pass = env('GMAIL_PASS');
  await rateLimit(token, 'email');
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 465, secure: true,
    auth: { user, pass }, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    disableFileAccess: true, disableUrlAccess: true
  });
  const nombre = [cliente.nombres, cliente.apellidos].filter(Boolean).join(' ');
  const subject = 'Seguimiento de tu proyecto — Diseños Pablin';
  const text = 'Hola, ' + nombre + '. Tu proyecto ' + obra.id_obra + ' está en fase ' + obra.fase_actual + '. Seguimiento: ' + tracking.href;
  const info = await transporter.sendMail({
    from: { name: 'Diseños Pablin', address: user }, to: { address: recipient }, subject, text,
    html: '<h2>Diseños Pablin</h2><p>Hola, ' + escapeHtml(nombre) + '.</p><p>Tu proyecto ' + escapeHtml(obra.id_obra) + ' está en fase <strong>' + escapeHtml(obra.fase_actual) + '</strong>.</p><p><a href="' + escapeHtml(tracking.href) + '">Ver seguimiento y valoración</a></p>'
  });
  return res.status(200).json({ success: true, messageId: info.messageId });
});
