export default async function handler(req, res) {
  // Permitir CORS
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

  const { clienteNombre, clienteEmail, tipoObra, codigoObra, slugTracking } = req.body;

  if (!clienteEmail || !slugTracking) {
    return res.status(400).json({ error: 'Faltan datos requeridos (email o tracking)' });
  }

  const apiKey = process.env.RESEND_API_KEY || 're_j9kHS5mQ_74GwCQgvpzWPKAJXsU4Ao5zy';
  const trackingUrl = `https://disenos-pablin.vercel.app/tracking.html?t=${slugTracking}`;

  const htmlTemplate = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: Arial, sans-serif; background-color: #F8F6F2; padding: 30px; color: #1D1D1D;">
      <div style="max-width: 540px; margin: 0 auto; background: #FFFFFF; border: 1px solid #DCCFBE; padding: 30px; border-radius: 2px;">
        <h2 style="color: #1D1D1D; text-transform: uppercase; letter-spacing: 0.15em; font-size: 14px; margin-bottom: 4px;">Diseños Pablin</h2>
        <div style="font-size: 9px; color: #B78652; text-transform: uppercase; letter-spacing: 0.2em; margin-bottom: 20px;">Arte en Madera</div>
        <p style="font-size: 15px;">Hola <strong>${clienteNombre}</strong>,</p>
        <p style="font-size: 13px; line-height: 1.6; color: #555;">
          Hemos iniciado tu proyecto de <strong>${tipoObra} (${codigoObra})</strong>. Puedes revisar el avance en tiempo real desde el siguiente enlace:
        </p>
        <div style="text-align: center; margin: 25px 0;">
          <a href="${trackingUrl}" style="background-color: #B78652; color: #FFFFFF; text-decoration: none; padding: 12px 24px; font-size: 11px; font-weight: bold; letter-spacing: 0.1em; text-transform: uppercase; border-radius: 2px; display: inline-block;">
            Ver Avance de mi Obra
          </a>
        </div>
        <p style="font-size: 11px; color: #888; text-align: center;">Diseños Pablin — Guayaquil, Ecuador</p>
      </div>
    </body>
    </html>
  `;

  try {
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        from: 'Diseños Pablin <onboarding@resend.dev>',
        to: [clienteEmail.trim()],
        subject: `Seguimiento de tu proyecto ${tipoObra} — Diseños Pablin`,
        html: htmlTemplate
      })
    });

    const result = await resendResponse.json();

    if (!resendResponse.ok) {
      console.error('Error Resend API:', result);
      return res.status(resendResponse.status).json({ error: result.message || 'Fallo de Resend', details: result });
    }

    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error('Error servidor:', error);
    return res.status(500).json({ error: error.message });
  }
}
