import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  // Cabeceras CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { clienteNombre, clienteEmail, tipoObra, codigoObra, slugTracking, tipoEvento, nuevaFase, porcentaje } = req.body || {};

  if (!clienteEmail || !slugTracking) {
    return res.status(400).json({ error: 'Faltan datos obligatorios (email o tracking)' });
  }

  const GMAIL_USER = 'disenospablin.ec@gmail.com';
  const GMAIL_PASS = 'kvgodrbplpzqsgks';
  const trackingUrl = `https://disenos-pablin.vercel.app/tracking.html?t=${slugTracking}`;

  let subject = `Seguimiento de tu proyecto ${tipoObra} — Diseños Pablin`;
  let titleHeader = `Hola, ${clienteNombre}`;
  let messageBody = `Hemos iniciado tu proyecto de <strong>${tipoObra} (${codigoObra})</strong>. A partir de este momento puedes seguir todo el avance en tiempo real desde tu enlace personalizado.`;
  let buttonText = 'Ver Seguimiento de mi Obra';

  // Notificación de Cambio de Fase
  if (tipoEvento === 'avance_fase') {
    if (porcentaje === 100 || nuevaFase === 'Entrega') {
      subject = `¡Tu proyecto ${tipoObra} está terminado! — Diseños Pablin`;
      titleHeader = `¡Proyecto Completado, ${clienteNombre}!`;
      messageBody = `Nos alegra comunicarte que tu proyecto de <strong>${tipoObra} (${codigoObra})</strong> ha alcanzado la fase de <strong>Entrega (100%)</strong>. Ingresa a tu enlace para ver los detalles finales y dejarnos tu valoración y reseña.`;
      buttonText = 'Ver Proyecto y Dejar Reseña';
    } else {
      subject = `Actualización de Avance: ${nuevaFase} (${porcentaje}%) — Diseños Pablin`;
      titleHeader = `Tu obra sigue avanzando, ${clienteNombre}`;
      messageBody = `Te informamos que tu proyecto de <strong>${tipoObra} (${codigoObra})</strong> ha avanzado a la fase de <strong>${nuevaFase} (${porcentaje}% de avance)</strong>. Ya puedes revisar los detalles actualizados en tu portal.`;
      buttonText = 'Ver Nuevo Avance';
    }
  }

  const htmlTemplate = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: 'Helvetica Neue', Arial, sans-serif; background-color: #F8F6F2; padding: 30px; margin: 0; color: #1D1D1D;">
      <div style="max-width: 560px; margin: 0 auto; background: #FFFFFF; border: 1px solid #DCCFBE; border-radius: 2px; padding: 36px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="font-size: 13px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: #1D1D1D;">Diseños Pablin</div>
          <div style="font-size: 9px; letter-spacing: 0.25em; text-transform: uppercase; color: #B78652; margin-top: 4px;">Arte en Madera</div>
          <div style="width: 32px; height: 1px; background: #B78652; margin: 16px auto;"></div>
        </div>
        <div style="font-size: 18px; font-weight: 700; color: #1D1D1D; margin-bottom: 12px;">${titleHeader}</div>
        <p style="font-size: 14px; line-height: 1.6; color: #4A4A4A; margin-bottom: 24px;">
          ${messageBody}
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${trackingUrl}" style="background-color: #B78652; color: #FFFFFF !important; text-decoration: none; padding: 12px 24px; font-size: 11px; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; border-radius: 2px; display: inline-block;">
            ${buttonText}
          </a>
        </div>
        <p style="font-size: 12px; color: #7B7B7B; text-align: center;">
          Si el botón no abre directamente, usa este enlace:<br>
          <a href="${trackingUrl}" style="color: #B78652;">${trackingUrl}</a>
        </p>
        <div style="margin-top: 32px; text-align: center; font-size: 11px; color: #7B7B7B; border-top: 1px solid #EDE6DC; padding-top: 16px;">
          Diseños Pablin — Fabricación y Arquitectura de Interiores<br>Guayaquil, Ecuador
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: GMAIL_USER,
        pass: GMAIL_PASS
      }
    });

    const info = await transporter.sendMail({
      from: `"Diseños Pablin" <${GMAIL_USER}>`,
      to: clienteEmail.trim(),
      subject: subject,
      html: htmlTemplate
    });

    return res.status(200).json({ success: true, messageId: info.messageId });
  } catch (error) {
    console.error('Error enviando correo:', error);
    return res.status(500).json({ error: error.message });
  }
}
