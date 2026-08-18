const cron = require('node-cron');
const db = require('./db');
const { enviarAvisoVencimiento } = require('./mailer');

const DIAS_AVISO = Number(process.env.DIAS_AVISO_VENCIMIENTO || 3);

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

function iniciarCron() {
  // Corre todos los dias a las 8:00 am (hora del servidor)
  cron.schedule('0 8 * * *', () => {
    revisarVencimientos().catch((err) => console.error('[cron] Error revisando vencimientos:', err));
  });
}

module.exports = { iniciarCron, revisarVencimientos };
