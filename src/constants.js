// Lista con la que se siembra la tabla `sucursales` la primera vez que corre la
// app (o cuando aparece una sucursal nueva en esta lista que aun no existe en la
// base de datos). Una vez sembradas, las sucursales se administran desde la
// pestaña de Usuarios (alta/baja), no editando este archivo.
const SUCURSALES_INICIALES = [
  'Flores',
  'Mirasierra',
  'Satélite',
  'Benavides',
  'Seminario',
  'Torreón',
  'Parras',
  'Cardenas',
  'Ixtlero',
  'Centro',
  'Las Torres',
  'Oficina',
];

const TIPOS_GASTO = [
  'Dentalmix (depósito dental interno)',
  'Insumos médicos externos',
  'Especialistas',
  'Laboratorio interno',
  'Laboratorio externo',
  'Comisiones manager global',
  'Comisiones doctores',
  'Comisiones recepción',
  'Renta local comercial',
  'Servicios (agua, luz, teléfono, internet)',
  'Pago celulares y saldo',
  'Gasolina y tag',
  'Limpieza',
  'Papelería y oficina',
  'Mantenimiento',
  'Mercadotecnia (agencias y saldo meta)',
  'Nómina/IMSS/ISN/ISR',
  'Nómina IMSS ISN e ISR de comodines',
  'Nómina IMSS ISN e ISR administración',
  'Devolución a pacientes',
  'Renta de casas',
  'Tomox',
  'Servicio becario',
  'Comisiones bancarias',
  'Software odontológico',
  'Honorarios contables y timbres',
  'Software contable/administrativo',
  'Remodelación',
  'Trámites administrativos',
  'Servicios legales',
  'Finiquitos',
  'Viaticos',
  'Equipo de transporte',
  'Cursos y diplomados',
  'Gratificaciones',
  'Otros',
];

// Marcas/unidades de negocio que comparten la misma app. Tomox opera dentro
// de un subconjunto fijo de sucursales de Dazujo; Laboratorio no se registra
// por sucursal (su gasto es unico), por eso usa una sucursal ficticia fija.
const MARCAS = ['dazujo', 'tomox', 'laboratorio'];
const TOMOX_SUCURSALES = ['Parras', 'Torreón', 'Ixtlero', 'Flores', 'Centro', 'Mirasierra'];
const SUCURSAL_LABORATORIO = 'Laboratorio';

// Meta mensual de ingreso fija por clinica (se aplica igual todos los meses).
const METAS_MENSUALES = {
  Flores: 579800,
  Mirasierra: 579800,
  Satélite: 403000,
  Benavides: 416000,
  Seminario: 403000,
  Torreón: 579800,
  Parras: 403000,
  Cardenas: 403000,
  Ixtlero: 390000,
  Centro: 390000,
};

module.exports = { SUCURSALES_INICIALES, TIPOS_GASTO, METAS_MENSUALES, MARCAS, TOMOX_SUCURSALES, SUCURSAL_LABORATORIO };
