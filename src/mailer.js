const nodemailer = require('nodemailer');

function getTransporter() {
  const { GMAIL_USER, GMAIL_APP_PASSWORD } = process.env;
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    return null;
  }
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });
}

async function enviarAvisoVencimiento(cuentas) {
  const transporter = getTransporter();
  const destinatario = process.env.NOTIFY_EMAIL_TO;
  if (!transporter || !destinatario) {
    console.warn('[mailer] GMAIL_USER/GMAIL_APP_PASSWORD/NOTIFY_EMAIL_TO no configurados, se omite envio de correo.');
    return false;
  }

  const filas = cuentas
    .map(
      (c) => `
        <tr>
          <td style="padding:6px 10px;border:1px solid #ddd;">${c.proveedor}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;">${c.concepto}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;">${c.numero_factura}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;">${c.fecha_vencimiento}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;text-align:right;">$${Number(c.monto).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
        </tr>`
    )
    .join('');

  const html = `
    <h2>Cuentas por pagar proximas a vencer</h2>
    <p>Las siguientes facturas vencen pronto:</p>
    <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px;">
      <thead>
        <tr style="background:#f2f2f2;">
          <th style="padding:6px 10px;border:1px solid #ddd;">Proveedor</th>
          <th style="padding:6px 10px;border:1px solid #ddd;">Concepto</th>
          <th style="padding:6px 10px;border:1px solid #ddd;"># Factura</th>
          <th style="padding:6px 10px;border:1px solid #ddd;">Vence</th>
          <th style="padding:6px 10px;border:1px solid #ddd;">Monto</th>
        </tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>
  `;

  await transporter.sendMail({
    from: `"Cuentas por Pagar" <${process.env.GMAIL_USER}>`,
    to: destinatario,
    subject: `Aviso: ${cuentas.length} factura(s) proxima(s) a vencer`,
    html,
  });
  return true;
}

module.exports = { enviarAvisoVencimiento };
