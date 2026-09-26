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

function configuracionFaltante() {
  const faltan = [];
  if (!process.env.TWILIO_ACCOUNT_SID) faltan.push('TWILIO_ACCOUNT_SID');
  if (!process.env.TWILIO_AUTH_TOKEN) faltan.push('TWILIO_AUTH_TOKEN');
  if (!process.env.TWILIO_WHATSAPP_FROM) faltan.push('TWILIO_WHATSAPP_FROM');
  if (destinatarios().length === 0) faltan.push('NOTIFY_WHATSAPP_TO');
  return faltan;
}

// Explicacion en español de los errores de Twilio mas comunes con WhatsApp.
const ERRORES_TWILIO = {
  20003: 'TWILIO_ACCOUNT_SID o TWILIO_AUTH_TOKEN son incorrectos.',
  21211: 'El numero destino no es valido. Usa el formato +521XXXXXXXXXX.',
  21608: 'Cuenta de prueba de Twilio: el numero destino no esta verificado.',
  63003: 'El numero destino no tiene WhatsApp o no es valido.',
  63007: 'TWILIO_WHATSAPP_FROM no es un remitente de WhatsApp habilitado en Twilio.',
  63015: 'Sandbox: el numero destino no se ha unido (o su union ya expiro). Manda "join <palabra>" al numero del sandbox.',
  63016:
    'Fuera de la ventana de 24 horas: WhatsApp solo permite avisos automaticos con una plantilla aprobada. Configura TWILIO_WHATSAPP_CONTENT_SID.',
  63024: 'El numero destino no es valido para WhatsApp.',
  63112: 'La cuenta de WhatsApp Business de Meta esta deshabilitada o restringida.',
};

function explicarError(codigo, mensaje) {
  return ERRORES_TWILIO[codigo] || mensaje || 'Error desconocido de Twilio';
}

// Arma el mensaje. Si hay plantilla aprobada (TWILIO_WHATSAPP_CONTENT_SID) se
// usa con sus variables; WhatsApp exige plantilla para mensajes que la empresa
// inicia fuera de la ventana de 24 horas, como estos recordatorios.
// Variables de la plantilla: {{1}} proveedor, {{2}} concepto, {{3}} monto,
// {{4}} cuando vence (hoy / manana / en N dias), {{5}} fecha de vencimiento.
function contenidoMensaje(texto, variables) {
  const contentSid = process.env.TWILIO_WHATSAPP_CONTENT_SID;
  if (contentSid && variables) return { contentSid, contentVariables: JSON.stringify(variables) };
  return { body: texto };
}

// Envia a cada numero por separado para que un numero con problema no impida
// el envio a los demas. Regresa [{ numero, ok, sid?, codigo?, error? }].
async function enviarWhatsApp(texto, variables) {
  const faltan = configuracionFaltante();
  if (faltan.length) {
    console.warn(`[whatsapp] Faltan variables de entorno (${faltan.join(', ')}), se omite envio.`);
    return [];
  }

  const client = getClient();
  const from = conPrefijoWhatsapp(process.env.TWILIO_WHATSAPP_FROM);
  const contenido = contenidoMensaje(texto, variables);

  return Promise.all(
    destinatarios().map(async (numero) => {
      try {
        const msg = await client.messages.create({ from, to: conPrefijoWhatsapp(numero), ...contenido });
        return { numero, ok: true, sid: msg.sid };
      } catch (err) {
        const error = explicarError(err.code, err.message);
        console.error(`[whatsapp] No se pudo enviar a ${numero} (codigo ${err.code ?? '-'}): ${error}`);
        return { numero, ok: false, codigo: err.code, error };
      }
    })
  );
}

function cuandoVence(dias) {
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'manana';
  return `en ${dias} dias`;
}

async function enviarAvisoVencimientoWhatsApp(cuenta, dias) {
  const monto = Number(cuenta.monto).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
  const cuando = cuandoVence(dias);
  const texto =
    `📌 Aviso de pago: la cuenta de *${cuenta.proveedor}* (${cuenta.concepto}) por ${monto} ` +
    `vence ${cuando} (${cuenta.fecha_vencimiento}).`;
  const variables = { 1: cuenta.proveedor, 2: cuenta.concepto, 3: monto, 4: cuando, 5: cuenta.fecha_vencimiento };
  return enviarWhatsApp(texto, variables);
}

// Twilio acepta el mensaje al instante y lo entrega (o lo rechaza) unos
// segundos despues, asi que para la prueba se espera y se consulta el estado real.
async function probarWhatsApp() {
  const faltan = configuracionFaltante();
  if (faltan.length) return { configurado: false, faltan, resultados: [] };

  const texto = '✅ Prueba de avisos de Dazujo: si te llego este mensaje, los recordatorios por WhatsApp funcionan.';
  const variables = { 1: 'PRUEBA', 2: 'Mensaje de prueba', 3: '$0.00', 4: 'hoy', 5: new Date().toISOString().slice(0, 10) };
  const resultados = await enviarWhatsApp(texto, variables);

  await new Promise((r) => setTimeout(r, 6000));
  const client = getClient();
  for (const r of resultados) {
    if (!r.ok) continue;
    try {
      const msg = await client.messages(r.sid).fetch();
      r.estado = msg.status;
      if (msg.errorCode) {
        r.ok = false;
        r.codigo = msg.errorCode;
        r.error = explicarError(msg.errorCode, msg.errorMessage);
      }
    } catch (err) {
      r.estado = 'desconocido';
    }
  }
  return { configurado: true, usaPlantilla: !!process.env.TWILIO_WHATSAPP_CONTENT_SID, resultados };
}

module.exports = { enviarWhatsApp, enviarAvisoVencimientoWhatsApp, probarWhatsApp };
