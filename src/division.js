// Reparto de un monto entre varias sucursales. Lo usan los gastos compartidos
// y las cuentas por pagar divididas, para que ambos repartan exactamente igual.

const MODOS_DIVISION = ['igual', 'cantidad', 'porcentaje'];

const redondear = (n) => Math.round(n * 100) / 100;

// partes: [{ sucursal, valor }]. En modo 'igual' se ignora valor; en
// 'cantidad' es el monto de cada sucursal (y el total es su suma); en
// 'porcentaje' es el % de montoTotal. Regresa { error } o { filas, montoTotal }.
function calcularDivision(modo, partes, montoTotal, sucursalValida) {
  if (!MODOS_DIVISION.includes(modo)) return { error: 'Modo de division invalido' };
  if (!Array.isArray(partes) || partes.length < 2) return { error: 'Selecciona al menos 2 sucursales' };

  const nombres = partes.map((p) => p && p.sucursal);
  if (new Set(nombres).size !== nombres.length) return { error: 'No repitas la misma sucursal' };
  if (nombres.some((n) => !sucursalValida(n))) return { error: 'Sucursal invalida' };

  if (modo === 'cantidad') {
    const filas = partes.map((p) => ({ sucursal: p.sucursal, monto: redondear(Number(p.valor)) }));
    if (filas.some((f) => Number.isNaN(f.monto) || f.monto <= 0)) {
      return { error: 'Cada clinica necesita una cantidad valida mayor a 0' };
    }
    return { filas, montoTotal: redondear(filas.reduce((s, f) => s + f.monto, 0)) };
  }

  montoTotal = Number(montoTotal);
  if (Number.isNaN(montoTotal) || montoTotal <= 0) return { error: 'El monto debe ser un numero mayor a 0' };

  if (modo === 'igual') {
    const n = partes.length;
    const montoBase = Math.floor((montoTotal / n) * 100) / 100;
    const ajusteFinal = redondear(montoTotal - montoBase * (n - 1));
    return {
      filas: partes.map((p, i) => ({ sucursal: p.sucursal, monto: i === n - 1 ? ajusteFinal : montoBase })),
      montoTotal,
    };
  }

  const porcentajes = partes.map((p) => Number(p.valor));
  if (porcentajes.some((p) => Number.isNaN(p) || p <= 0)) {
    return { error: 'Cada clinica necesita un porcentaje valido mayor a 0' };
  }
  const sumaPct = porcentajes.reduce((s, p) => s + p, 0);
  if (Math.abs(sumaPct - 100) > 0.5) {
    return { error: `Los porcentajes deben sumar 100% (suman ${sumaPct.toFixed(1)}%)` };
  }

  const filas = partes.map((p, i) => ({ sucursal: p.sucursal, monto: redondear(montoTotal * (porcentajes[i] / 100)) }));
  // La ultima fila absorbe el redondeo para que la suma cuadre exacto con el total.
  const sumaParcial = filas.slice(0, -1).reduce((s, f) => s + f.monto, 0);
  filas[filas.length - 1].monto = redondear(montoTotal - sumaParcial);
  return { filas, montoTotal };
}

function nuevoGrupoId() {
  return `grp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

module.exports = { MODOS_DIVISION, calcularDivision, nuevoGrupoId };
