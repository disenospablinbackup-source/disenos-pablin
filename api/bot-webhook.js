import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

const SUPABASE_URL = 'https://ysupbkkivqacsqhfxrof.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ygm_Ge0X3ogErxTRJu3y_w_i2Whpwe6';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'TU_GEMINI_API_KEY_AQUI';
const GMAIL_USER = 'disenospablin.ec@gmail.com';
const GMAIL_PASS = 'kvgodrbplpzqsgks';

const FASES_MAP = {
  'diseño': { nombre: 'Diseño', pct: 10 },
  'materiales': { nombre: 'Materiales', pct: 30 },
  'ejecución': { nombre: 'Ejecución', pct: 65 },
  'acabados': { nombre: 'Acabados', pct: 90 },
  'entrega': { nombre: 'Entrega', pct: 100 }
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Verificación de Webhook (Meta / Twilio)
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === 'pablin_bot_token_2026') {
      return res.status(200).send(challenge);
    }
    return res.status(200).json({ status: 'Webhook Pablin Bot Activo' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const { mensaje, telefono } = req.body || {};
    const textoMensaje = mensaje || req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text?.body || '';
    const remitente = telefono || req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from || '';

    if (!textoMensaje) {
      return res.status(200).json({ status: 'Sin mensaje para procesar' });
    }

    // 1. Obtener contexto de Supabase
    const { data: tecnicos } = await supabase.from('tecnicos').select('*').eq('activo', true);
    const { data: obras } = await supabase.from('obras').select('*, clientes(*), tecnicos(*)').order('created_at', { ascending: false });

    const contextoTecnicos = (tecnicos || []).map(t => `${t.codigo_id}: ${t.nombres} ${t.apellidos} (Tel: ${t.telefono_1})`).join('\n');
    const contextoObras = (obras || []).map(o => `Obra ${o.id_obra}: Cliente ${o.clientes?.nombres || ''} ${o.clientes?.apellidos || ''}, Tipo: ${o.categoria_obra}, Fase: ${o.fase_actual} (${o.porcentaje_avance}%), Tracking: https://disenos-pablin.vercel.app/tracking.html?t=${o.slug_tracking}`).join('\n');

    // 2. Prompt del Sistema para Gemini
    const systemPrompt = `
Eres el Asistente Virtual Oficial de "Diseños Pablin" (Arte en Madera, Guayaquil, Ecuador).
Tu labor es responder de forma profesional, amable y concisa.

BASE DE DATOS ACTUAL:
--- TÉCNICOS AUTORIZADOS ---
${contextoTecnicos}

--- OBRAS REGISTRADAS ---
${contextoObras}

REGLAS DE ACCIÓN:
1. SI ES UN CLIENTE preguntando por su obra (por nombre o número): Dale el enlace de tracking directo y su estado actual.
2. SI ES UN TÉCNICO que envía un comando o actualización:
   - Debe incluir su código (ej. TEC-XXXX) o identificarse.
   - Si pide actualizar fase o nota de una obra (#OBR-XXX), responde en formato JSON al inicio con la etiqueta [ACCION_DB] seguido de la respuesta que se enviará al WhatsApp.
   Ejemplo de actualización técnica:
   [ACCION_DB]{"tipo":"UPDATE_OBRA","id_obra":"#OBR-270","fase":"Acabados","nota":"Mueble lijado y listo"}[/ACCION_DB]
   ¡Actualización procesada con éxito! La obra #OBR-270 pasó a fase Acabados.

3. Si es un prospecto nuevo: Salúdalo con elegancia y ofrece asesoría para muebles a medida.
`;

    // 3. Consulta a la API de Gemini
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: `${systemPrompt}\n\nMensaje recibido de (${remitente}): "${textoMensaje}"` }] }
        ]
      })
    });

    const geminiData = await geminiRes.json();
    const respuestaIA = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || 'Disculpa, no pude procesar tu solicitud en este momento.';

    // 4. Ejecutar acciones en base de datos si la IA detectó un comando técnico
    if (respuestaIA.includes('[ACCION_DB]')) {
      const match = respuestaIA.match(/\[ACCION_DB\]([\s\S]*?)\[\/ACCION_DB\]/);
      if (match && match[1]) {
        try {
          const accion = JSON.parse(match[1]);
          if (accion.tipo === 'UPDATE_OBRA') {
            const faseNormalizada = FASES_MAP[accion.fase?.toLowerCase()] || { nombre: accion.fase, pct: 50 };
            
            // Buscar la obra
            const obraTarget = (obras || []).find(o => o.id_obra === accion.id_obra);
            if (obraTarget) {
              await supabase.from('obras').update({
                fase_actual: faseNormalizada.nombre,
                porcentaje_avance: faseNormalizada.pct,
                descripcion: accion.nota || obraTarget.descripcion,
                estado: faseNormalizada.pct === 100 ? 'Finalizada' : (faseNormalizada.pct >= 90 ? 'Por entregar' : 'Activa')
              }).eq('id', obraTarget.id);

              // Disparar correo al cliente automáticamente
              if (obraTarget.clientes?.correo_electronico) {
                const transporter = nodemailer.createTransport({
                  host: 'smtp.gmail.com',
                  port: 465,
                  secure: true,
                  auth: { user: GMAIL_USER, pass: GMAIL_PASS }
                });

                await transporter.sendMail({
                  from: `"Diseños Pablin" <${GMAIL_USER}>`,
                  to: obraTarget.clientes.correo_electronico,
                  subject: `Actualización de Avance: ${faseNormalizada.nombre} — Diseños Pablin`,
                  html: `
                    <div style="font-family:Arial,sans-serif;padding:24px;background:#F8F6F2;">
                      <h2>Hola, ${obraTarget.clientes.nombres}</h2>
                      <p>Tu proyecto <strong>${obraTarget.categoria_obra} (${obraTarget.id_obra})</strong> ha avanzado a la fase de <strong>${faseNormalizada.nombre} (${faseNormalizada.pct}%)</strong>.</p>
                      <p><em>Nota técnica: ${accion.nota || 'En proceso conforme al cronograma.'}</em></p>
                      <a href="https://disenos-pablin.vercel.app/tracking.html?t=${obraTarget.slug_tracking}" style="background:#B78652;color:#fff;padding:10px 20px;text-decoration:none;display:inline-block;margin-top:12px;">Ver Avance</a>
                    </div>
                  `
                });
              }
            }
          }
        } catch (e) {
          console.error('Error ejecutando acción DB del bot:', e);
        }
      }
    }

    // Limpiar respuesta final para el usuario
    const mensajeLimpio = respuestaIA.replace(/\[ACCION_DB\][\s\S]*?\[\/ACCION_DB\]/, '').trim();

    return res.status(200).json({
      success: true,
      respuesta: mensajeLimpio
    });

  } catch (error) {
    console.error('Error en bot-webhook:', error);
    return res.status(500).json({ error: error.message });
  }
}
