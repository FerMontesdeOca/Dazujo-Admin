const twilio = require('twilio');

function getClient() {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) return null;
  return twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
}

function conPrefijoWhatsapp(numero) {
  const limpio = numero.trim();
  return limpio.startsWith('whatsapp:') ? limpio : `whatsapp:${limpio}`;
}

function destinatarios() {
  const { NOTIFY_WHATSAPP_TO } = process.env;
  if (!NOTIFY_WHATSAPP_TO) return [];
  return NOTIFY_WHATSAPP_TO.split(',')
    .map((n) => n.trim())
    .filter(Boolean);
}

async function enviarWhatsApp(mensaje) {
  const client = getClient();
  const from = process.env.TWILIO_WHATSAPP_FROM;
  const destinos = destinatarios();

  if (!client || !from || destinos.length === 0) {
    console.warn(
      '[whatsapp] TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_WHATSAPP_FROM/NOTIFY_WHATSAPP_TO no configurados, se omite envio.'
    );
    return false;
  }

  await Promise.all(
    destinos.map((numero) =>
      client.messages.create({
        from: conPrefijoWhatsapp(from),
        to: conPrefijoWhatsapp(numero),
        body: mensaje,
      })
    )
  );
  return true;
}

function mensajeVencimiento(cuenta, dias) {
  const etiqueta = dias === 1 ? 'manana' : `en ${dias} dias`;
  const monto = Number(cuenta.monto).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
  return (
    `📌 Aviso de pago: la cuenta de *${cuenta.proveedor}* (${cuenta.concepto}) por ${monto} ` +
    `vence ${etiqueta} (${cuenta.fecha_vencimiento}).`
  );
}

module.exports = { enviarWhatsApp, mensajeVencimiento };
