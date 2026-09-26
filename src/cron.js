const cron = require('node-cron');
const db = require('./db');
const { enviarAvisoVencimiento } = require('./mailer');
const { enviarAvisoVencimientoWhatsApp } = require('./whatsapp');

const DIAS_AVISO = Number(process.env.DIAS_AVISO_VENCIMIENTO || 3);
// Las fechas de vencimiento son fechas de Mexico; el servidor (Railway) corre en UTC.
const ZONA_HORARIA = process.env.ZONA_HORARIA || 'America/Mexico_City';

// Fecha AAAA-MM-DD en la zona horaria del negocio, desplazada N dias desde hoy.
function fechaLocal(desplazamientoDias = 0) {
  const d = new Date(Date.now() + desplazamientoDias * 24 * 60 * 60 * 1000);
  return d.toLocaleDateString('en-CA', { timeZone: ZONA_HORARIA });
}

function diasEntre(desde, hasta) {
  return Math.round((Date.parse(hasta) - Date.parse(desde)) / (24 * 60 * 60 * 1000));
}

const ETAPAS_WHATSAPP = [
  { dias: 7, columna: 'aviso_7_enviado' },
  { dias: 3, columna: 'aviso_3_enviado' },
  { dias: 1, columna: 'aviso_1_enviado' },
];

async function revisarVencimientos() {
  const hoyStr = fechaLocal();
  const limiteStr = fechaLocal(DIAS_AVISO);

  const cuentas = db
    .prepare(
      `SELECT * FROM cuentas_por_pagar
       WHERE pagada = 0
         AND fecha_vencimiento BETWEEN ? AND ?
         AND (notificada_at IS NULL OR date(notificada_at) != date('now'))`
    )
    .all(hoyStr, limiteStr);

  if (cuentas.length === 0) return;

  const enviado = await enviarAvisoVencimiento(cuentas);
  if (enviado) {
    const marcar = db.prepare(`UPDATE cuentas_por_pagar SET notificada_at = datetime('now') WHERE id = ?`);
    for (const c of cuentas) marcar.run(c.id);
    console.log(`[cron] Aviso enviado para ${cuentas.length} cuenta(s).`);
  }
}

// Manda el aviso de 7, 3 o 1 dia(s) antes del vencimiento. No depende de que
// la revision caiga justo ese dia: si una cuenta se dio de alta con menos
// anticipacion o un dia no corrio la revision, se manda el aviso que toque en
// cuanto se detecte (uno solo por revision, y sin repetir los ya enviados).
async function revisarAvisosWhatsApp() {
  const hoy = fechaLocal();
  const etapaMasLarga = Math.max(...ETAPAS_WHATSAPP.map((e) => e.dias));
  const cuentas = db
    .prepare(
      `SELECT * FROM cuentas_por_pagar
       WHERE pagada = 0 AND fecha_vencimiento BETWEEN ? AND ?`
    )
    .all(hoy, fechaLocal(etapaMasLarga));

  for (const cuenta of cuentas) {
    const dias = diasEntre(hoy, cuenta.fecha_vencimiento);
    const pendientes = ETAPAS_WHATSAPP.filter((e) => dias <= e.dias && !cuenta[e.columna]);
    if (pendientes.length === 0) continue;

    const resultados = await enviarAvisoVencimientoWhatsApp(cuenta, dias);
    if (resultados.some((r) => r.ok)) {
      // Se marcan tambien las etapas mas largas para no mandar despues un aviso "atrasado".
      for (const etapa of pendientes) {
        db.prepare(`UPDATE cuentas_por_pagar SET ${etapa.columna} = 1 WHERE id = ?`).run(cuenta.id);
      }
      console.log(`[cron] Aviso WhatsApp enviado para cuenta #${cuenta.id} (vence en ${dias} dia(s)).`);
    }
  }
}

function iniciarCron() {
  const revisar = () => {
    revisarVencimientos().catch((err) => console.error('[cron] Error revisando vencimientos:', err));
    revisarAvisosWhatsApp().catch((err) => console.error('[cron] Error revisando avisos de WhatsApp:', err));
  };
  // Corre todos los dias a las 8:00 am hora de Mexico (no la del servidor).
  cron.schedule('0 8 * * *', revisar, { timezone: ZONA_HORARIA });
  // Y una vez al arrancar, por si el servidor estaba apagado o reiniciando a las 8:00.
  // Los avisos ya enviados no se repiten.
  setTimeout(revisar, 30 * 1000);
}

module.exports = { iniciarCron, revisarVencimientos, revisarAvisosWhatsApp };
