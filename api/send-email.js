export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { clienteNombre, clienteEmail, tipoObra, codigoObra, slugTracking } = req.body;

  if (!clienteEmail || !slugTracking) {
    return res.status(400).json({ error: 'Faltan datos obligatorios para el envío' });
  }

  const trackingUrl = `https://disenos-pablin.vercel.app/tracking.html?t=${slugTracking}`;
  const apiKey = process.env.RESEND_API_KEY || 're_j9kHS5mQ_74GwCQgvpzWPKAJXsU4Ao5zy';

  // Plantilla HTML de Notificación Diseños Pablin
  const htmlTemplate = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Helvetica Neue', Arial, sans-serif; background-color: #F8F6F2; margin: 0; padding: 40px 20px; color: #1D1D1D; }
        .card { max-width: 560px; margin: 0 auto; background: #FFFFFF; border: 1px solid #DCCFBE; border-radius: 2px; padding: 36px; box-shadow: 0 4px 12px rgba(0,0,0,0.03); }
        .header { text-align: center; margin-bottom: 24px; }
        .brand { font-size: 13px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: #1D1D1D; margin: 0; }
        .sub { font-size: 9px; letter-spacing: 0.25em; text-transform: uppercase; color: #B78652; margin-top: 4px; }
        .divider { width: 32px; height: 1px; background: #B78652; margin: 16px auto; }
        .title { font-size: 18px; font-weight: 700; color: #1D1D1D; margin-bottom: 12px; }
        .text { font-size: 14px; line-height: 1.6; color: #4A4A4A; margin-bottom: 24px; }
        .btn { display: inline-block; background-color: #B78652; color: #FFFFFF !important; text-decoration: none; padding: 12px 24px; font-size: 11px; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; border-radius: 2px; }
        .footer { margin-top: 32px; text-align: center; font-size: 11px; color: #7B7B7B; border-top: 1px solid #EDE6DC; padding-top: 16px; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <div class="brand">Diseños Pablin</div>
          <div class="sub">Arte en Madera</div>
          <div class="divider"></div>
        </div>
        <div class="title">Hola, ${clienteNombre}</div>
        <p class="text">
          Hemos iniciado tu proyecto de <strong>${tipoObra} (${codigoObra})</strong>. A partir de este momento puedes seguir todo el proceso de diseño, selección de materiales, fabricación y entrega en tiempo real desde tu enlace personalizado.
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${trackingUrl}" class="btn">Ver Seguimiento de mi Obra</a>
        </div>
        <p class="text" style="font-size: 12px; color: #7B7B7B;">
          Si el botón no funciona, copia y pega este enlace directo en tu navegador:<br>
          <a href="${trackingUrl}" style="color: #B78652;">${trackingUrl}</a>
        </p>
        <div class="footer">
          Diseños Pablin — Fabricación y Arquitectura de Interiores<br>
          Guayaquil, Ecuador
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        from: 'Diseños Pablin <onboarding@resend.dev>',
        to: [clienteEmail],
        subject: `Seguimiento de tu proyecto ${tipoObra} — Diseños Pablin`,
        html: htmlTemplate
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Error al procesar el envío');

    return res.status(200).json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
