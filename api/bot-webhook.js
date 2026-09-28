import { endpoint, env, HttpError, requireAdmin, rateLimit } from '../lib/server.js';

// The legacy public WhatsApp webhook is closed. Only authenticated admins can
// use this read-only assistant; model output can never trigger database writes.
export default endpoint('POST', async (req, res) => {
  const token = await requireAdmin(req);
  const mensaje = req.body?.mensaje;
  if (typeof mensaje !== 'string' || !mensaje.trim() || mensaje.length > 2000) {
    throw new HttpError(400, 'Escribe un mensaje de hasta 2000 caracteres');
  }
  const model = env('GEMINI_MODEL');
  if (!/^[a-zA-Z0-9.-]+$/.test(model) || model.startsWith('gemini-1.5')) throw new HttpError(503, 'Configura un modelo de Gemini vigente');
  const key = env('GEMINI_API_KEY');
  await rateLimit(token, 'bot');
  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    signal: AbortSignal.timeout(20000),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: 'Eres el asistente de Diseños Pablin. Ayuda a redactar mensajes y resolver consultas generales de carpintería. No tienes acceso a obras, datos de clientes, correo ni herramientas. Nunca afirmes haber actualizado una obra o enviado un mensaje. Para esas acciones indica usar los controles del panel.' }] },
      contents: [{ role: 'user', parts: [{ text: mensaje }] }],
      generationConfig: { maxOutputTokens: 1000 }
    })
  });
  if (!response.ok) throw new HttpError(502, 'Gemini no está disponible; revisa su configuración');
  const data = await response.json();
  const respuesta = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim();
  if (!respuesta) throw new HttpError(502, 'Gemini no devolvió una respuesta');
  return res.status(200).json({ success: true, respuesta });
});
