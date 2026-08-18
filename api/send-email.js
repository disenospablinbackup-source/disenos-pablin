const nodemailer = require('nodemailer');

module.exports = async (req, res) => {
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

  const { clienteNombre, clienteEmail, tipoObra, codigoObra, slugTracking } = req.body || {};

  if (!clienteEmail || !slugTracking) {
    return res.status(400).json({ error: 'Faltan datos obligatorios (email o tracking)' });
  }

  const GMAIL_USER = 'disenospablin.ec@gmail.com';
  const GMAIL_PASS = 'kvgodrbplpzqsgks';

  const trackingUrl = `https://disenos-pablin.vercel.app/tracking.html?t=${slugTracking}`;

  const htmlTemplate = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: Arial, sans-serif; background-color: #F8F6F2; padding: 30px; margin: 0; color: #1D1D1D;">
      <div style="max-width: 560px; margin: 0 auto; background: #FFFFFF; border: 1px solid #DCCFBE; border-radius: 2px; padding: 36px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="font-size: 14px; font-weight: bold; letter-spacing: 0.2em; text-transform: uppercase; color: #1D1D1D;">Diseños Pablin</div>
          <div style="font-size: 10px; letter-spacing: 0.25em; text-transform: uppercase; color: #B78652; margin-top: 4px;">Arte en Madera</div>
          <div style="width: 32px; height: 1px; background: #B78652; margin: 16px auto;"></div>
        </div>
        <div style="font-size: 18px; font-weight: bold; color: #1D1D1D; margin-bottom: 12px;">Hola, ${clienteNombre}</div>
        <p style="font-size: 14px; line-height: 1.6; color: #4A4A4A; margin-bottom: 24px;">
          Hemos iniciado tu proyecto de <strong>${tipoObra} (${codigoObra})</strong>. Puedes seguir todo el avance en tiempo real desde tu enlace de seguimiento personalizado:
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${trackingUrl}" style="background-color: #B78652; color: #FFFFFF; text-decoration: none; padding: 12px 24px; font-size: 11px; font-weight: bold; letter-spacing: 0.15em; text-transform: uppercase; border-radius: 2px; display: inline-block;">
            Ver Seguimiento de mi Obra
          </a>
        </div>
        <p style="font-size: 12px; color: #7B7B7B; text-align: center;">
          O ingresa desde este enlace directo:<br>
          <a href="${trackingUrl}" style="color: #B78652;">${trackingUrl}</a>
        </p>
        <div style="margin-top: 32px; text-align: center; font-size: 11px; color: #7B7B7B; border-top: 1px solid #EDE6DC; padding-top: 16px;">
          Diseños Pablin — Guayaquil, Ecuador
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
      subject: `Seguimiento de tu proyecto ${tipoObra} — Diseños Pablin`,
      html: htmlTemplate
    });

    return res.status(200).json({ success: true, messageId: info.messageId });
  } catch (error) {
    console.error('Error enviando correo:', error);
    return res.status(500).json({ error: error.message });
  }
};
