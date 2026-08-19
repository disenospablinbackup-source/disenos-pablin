import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

const SUPABASE_URL = 'https://ysupbkkivqacsqhfxrof.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ygm_Ge0X3ogErxTRJu3y_w_i2Whpwe6';
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// CREDENCIALES INTEGRADAS
const GEMINI_API_KEY = 'AQ.Ab8RN6IM9rcrzIJ9ubF1ZxwwBqQgmi4hyuiAMhdBCciUHaDpFg';
const GMAIL_USER = 'disenospablin.ec@gmail.com';
const GMAIL_PASS = 'kvgodrbplpzqsgks';

const FASES_MAP = {
  'diseño': { nombre: 'Diseño', pct: 10 },
  'materiales': { nombre: 'Materiales', pct: 30 },
  'ejecución': { nombre: 'Ejecución', pct: 65 },
  'ejecucion': { nombre: 'Ejecución', pct: 65 },
  'acabados': { nombre: 'Acabados', pct: 90 },
  'entrega': { nombre: 'Entrega', pct: 100 }
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Verificación de Webhook
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === 'pablin_bot_token_2026') {
      return res.status(200).send(challenge);
    }
    return res.status(200).json({ status: 'Bot Webhook Diseños Pablin Activo' });
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

    // 1. Obtener contexto en tiempo real desde Supabase
    const { data: tecnicos } = await db.from('tecnicos').select('*').eq('activo', true);
    const { data: obras } = await db.from('obras').select('*, clientes(*), tecnicos(*)').order('created_at', { ascending: false });

    const contextoTecnicos = (tecnicos || []).map(t => `${t.codigo_id}: ${t.nombres} ${t.apellidos} (Tel: ${t.telefono_1})`).join('\n');
    const contextoObras = (obras || []).map(o => `Obra ${o.id_obra}: Cliente ${o.clientes?.nombres || ''} ${o.clientes?.apellidos || ''}, Tipo: ${o.categoria_obra}, Fase: ${o.fase_actual} (${o.porcentaje_avance}%), Tracking: https://disenos-pablin.vercel.app/tracking.html?t=${o.slug_tracking}`).join('\n');

    // 2. Prompt de IA con reglas de negocio
    const systemPrompt = `
Eres el Asistente Virtual Inteligente de "Diseños Pablin" (Arte en Madera, Guayaquil, Ecuador).
Tu trabajo es atender tanto a clientes como a los técnicos del taller.

BASE DE DATOS VIVA:
--- TÉCNICOS AUTORIZADOS ---
${contextoTecnicos}

--- OBRAS ACTIVAS ---
${contextoObras}

REGLAS:
1. CLIENTES: Si un cliente consulta por su proyecto o mueble, identifícalo por su nombre o teléfono, dale su fase actual y su enlace de seguimiento: https://disenos-pablin.vercel.app/tracking.html?t=[slug].
2. TÉCNICOS: Si un técnico se identifica con su código (ej. TEC-4821) y solicita actualizar una obra (ej. #OBR-270):
   - Genera una orden de base de datos iniciando tu respuesta EXACTAMENTE con este bloque:
   [ACCION_DB]{"tipo":"UPDATE_OBRA","id_obra":"#OBR-XXX","fase":"NombreFase","nota":"Texto de la nota"}[/ACCION_DB]
   - Luego añade el texto cordial de confirmación.
3. PROSPECTOS: Si saludan o piden cotización, explica con calidez que se fabrican cocinas, closets, baños y muebles a medida de alta gama.
`;

    // 3. Consulta a Gemini
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: `${systemPrompt}\n\nMensaje entrante (${remitente}): "${textoMensaje}"` }] }
        ]
      })
    });

    const geminiData = await geminiRes.json();
    const respuestaIA = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || 'Disculpa, no pude procesar el mensaje en este momento.';

    // 4. Si la IA reconoció una instrucción técnica, actualizar Supabase y enviar correo
    if (respuestaIA.includes('[ACCION_DB]')) {
      const match = respuestaIA.match(/\[ACCION_DB\]([\s\S]*?)\[\/ACCION_DB\]/);
      if (match && match[1]) {
        try {
          const accion = JSON.parse(match[1]);
          if (accion.tipo === 'UPDATE_OBRA') {
            const faseNormalizada = FASES_MAP[accion.fase?.toLowerCase()] || { nombre: accion.fase, pct: 50 };
            const obraTarget = (obras || []).find(o => o.id_obra === accion.id_obra);

            if (obraTarget) {
              await db.from('obras').update({
                fase_actual: faseNormalizada.nombre,
                porcentaje_avance: faseNormalizada.pct,
                descripcion: accion.nota || obraTarget.descripcion,
                estado: faseNormalizada.pct === 100 ? 'Finalizada' : (faseNormalizada.pct >= 90 ? 'Por entregar' : 'Activa')
              }).eq('id', obraTarget.id);

              const correoCliente = obraTarget.clientes?.correo_electronico || obraTarget.clientes?.email;

              // Enviar correo automático de aviso al cliente
              if (correoCliente) {
                const transporter = nodemailer.createTransport({
                  host: 'smtp.gmail.com',
                  port: 465,
                  secure: true,
                  auth: { user: GMAIL_USER, pass: GMAIL_PASS }
                });

                await transporter.sendMail({
                  from: `"Diseños Pablin" <${GMAIL_USER}>`,
                  to: correoCliente,
                  subject: `Actualización de Avance: ${faseNormalizada.nombre} (${faseNormalizada.pct}%) — Diseños Pablin`,
                  html: `
                    <div style="font-family:Arial,sans-serif;padding:24px;background:#F8F6F2;color:#1D1D1D;">
                      <div style="max-width:540px;margin:0 auto;background:#fff;padding:30px;border:1px solid #DCCFBE;">
                        <h3 style="color:#B78652;text-transform:uppercase;letter-spacing:0.1em;font-size:12px;">Diseños Pablin</h3>
                        <h2 style="margin-top:4px;">Tu proyecto ha avanzado</h2>
                        <p>Hola <strong>${obraTarget.clientes?.nombres || 'Cliente'}</strong>, tu proyecto de <strong>${obraTarget.categoria_obra} (${obraTarget.id_obra})</strong> ahora está en fase: <strong>${faseNormalizada.nombre} (${faseNormalizada.pct}%)</strong>.</p>
                        <p style="background:#F8F6F2;padding:12px;border-left:3px solid #B78652;font-style:italic;">Nota técnica: ${accion.nota || 'Actualizado en taller.'}</p>
                        <div style="text-align:center;margin:24px 0;">
                          <a href="https://disenos-pablin.vercel.app/tracking.html?t=${obraTarget.slug_tracking}" style="background:#B78652;color:#fff;text-decoration:none;padding:12px 24px;font-weight:bold;font-size:11px;text-transform:uppercase;display:inline-block;">Ver Avance</a>
                        </div>
                      </div>
                    </div>
                  `
                });
              }
            }
          }
        } catch (e) {
          console.error('Error procesando acción de DB:', e);
        }
      }
    }

    const respuestaFinal = respuestaIA.replace(/\[ACCION_DB\][\s\S]*?\[\/ACCION_DB\]/, '').trim();

    return res.status(200).json({
      success: true,
      respuesta: respuestaFinal
    });

  } catch (error) {
    console.error('Error en bot-webhook:', error);
    return res.status(500).json({ error: error.message });
  }
}
