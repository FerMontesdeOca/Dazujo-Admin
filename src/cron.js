const cron = require('node-cron');
const db = require('./db');
const { enviarAvisoVencimiento } = require('./mailer');
const { enviarWhatsApp, mensajeVencimiento } = require('./whatsapp');

const DIAS_AVISO = Number(process.env.DIAS_AVISO_VENCIMIENTO || 3);

const ETAPAS_WHATSAPP = [
  { dias: 7, columna: 'aviso_7_enviado' },
  { dias: 3, columna: 'aviso_3_enviado' },
  { dias: 1, columna: 'aviso_1_enviado' },
];

async function revisarVencimientos() {
  const hoy = new Date();
  const limite = new Date();
  limite.setDate(hoy.getDate() + DIAS_AVISO);

  const hoyStr = hoy.toISOString().slice(0, 10);
  const limiteStr = limite.toISOString().slice(0, 10);

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

async function revisarAvisosWhatsApp() {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  for (const etapa of ETAPAS_WHATSAPP) {
    const objetivo = new Date(hoy);
    objetivo.setDate(hoy.getDate() + etapa.dias);
    const objetivoStr = objetivo.toISOString().slice(0, 10);

    const cuentas = db
      .prepare(
        `SELECT * FROM cuentas_por_pagar
         WHERE pagada = 0 AND fecha_vencimiento = ? AND ${etapa.columna} = 0`
      )
      .all(objetivoStr);

    for (const cuenta of cuentas) {
      const enviado = await enviarWhatsApp(mensajeVencimiento(cuenta, etapa.dias));
      if (enviado) {
        db.prepare(`UPDATE cuentas_por_pagar SET ${etapa.columna} = 1 WHERE id = ?`).run(cuenta.id);
        console.log(`[cron] Aviso WhatsApp (${etapa.dias}d) enviado para cuenta #${cuenta.id}.`);
      }
    }
  }
}

function iniciarCron() {
  // Corre todos los dias a las 8:00 am (hora del servidor)
  cron.schedule('0 8 * * *', () => {
    revisarVencimientos().catch((err) => console.error('[cron] Error revisando vencimientos:', err));
    revisarAvisosWhatsApp().catch((err) => console.error('[cron] Error revisando avisos de WhatsApp:', err));
  });
}

module.exports = { iniciarCron, revisarVencimientos, revisarAvisosWhatsApp };
