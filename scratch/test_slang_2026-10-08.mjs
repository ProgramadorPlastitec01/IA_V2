// Pruebas de las reglas de jerga (config/slangRules.js) y del filtro de privacidad con jerga.
// Uso: node scratch/test_slang_2026-10-08.mjs
const { matchSlangRules } = await import('../config/slangRules.js');
const { default: qu } = await import('../services/queryUnderstandingService.js');
const { default: Privacy, CATEGORIES } = await import('../services/privacy.js');

// [pregunta, reglas esperadas (array; [] = no debe disparar ninguna)]
const RULES = [
  ['si mi hijo se enferma, puedo tomar esto como incapacidad', ['familiar_enfermo']],
  ['mi cucha está enferma, puedo faltar mañana?', ['familiar_enfermo']],
  ['tengo que llevar a mi chino a urgencias', ['familiar_enfermo']],
  ['mi esposa tuvo un accidente, qué permiso me dan', ['familiar_enfermo']],
  ['me enfermé, cómo tramito la incapacidad', []],                       // es el propio trabajador
  ['¿Cuál es la licencia de paternidad para el padre?', []],
  ['me echaron sin justa causa, qué hago', ['despido']],
  ['me van a botar por llegar tarde?', ['despido']],
  ['me dieron la carta ayer, me tienen que pagar algo?', ['despido']],
  ['me echaron la culpa de un error en la línea', []],
  ['boté el carné de la empresa, qué hago', []],
  ['me abro de la empresa, qué papeles necesito', ['renuncia']],
  ['me abro temprano hoy del turno', []],
  ['llegué prendido a la integración, me pueden sancionar?', ['alcohol']],
  ['deje la máquina prendida en el cambio de turno', []],
  ['tengo guayabo, puedo ir a trabajar?', ['alcohol']],
  ['nos tomamos unas polas en el almuerzo, es falta?', ['alcohol']],
  ['el supervisor me dijo marica delante de todos', ['insulto_acoso']],
  ['marica, ¿cuántos días de vacaciones tengo?', []],
  ['me tratan como un gamín en la línea 2', ['insulto_acoso']],
  ['me tienen de parche en el turno de noche', ['burla_hostigamiento']],
  ['lo boletearon en el grupo de WhatsApp de la empresa', ['burla_hostigamiento']],
  ['el jefe le está echando los perros a una compañera', ['acoso_sexual']],
  ['aquí solo ascienden los de la rosca', ['favoritismo']],
  ['entró por palanca', ['favoritismo']],
  ['baje la palanca de la inyectora', []],
  ['me tumbaron el celular en el vestier', ['robo']],
  ['¿puedo comer mecato en la planta?', ['comida_planta']],
  ['¿dónde guardo mis corotos?', ['objetos_personales']],
  ['cuántas horas es el camello en diciembre', ['trabajo']],
  ['no me llegó la quincena completa', ['dinero_pago']],
  ['¿puedo usar un anillo de plata en la planta?', []],
];

let ok = 0;
for (const [q, expected] of RULES) {
  const got = matchSlangRules(q).rules;
  const pass = JSON.stringify([...got].sort()) === JSON.stringify([...expected].sort());
  if (pass) ok++;
  console.log(`${pass ? 'OK  ' : 'FAIL'} [${got.join(',') || '-'}]${pass ? '' : ` esperado [${expected.join(',') || '-'}]`}  ${q}`);
}
console.log(`\nReglas: ${ok}/${RULES.length}`);

// Abreviaturas
for (const q of ['xq no me pagaron las extras', 'cuándo salgo a vacas', 'q hago si me accidento']) {
  console.log(`spell: "${q}" → "${qu._normalizeSpelling(q).normalizedQuery}"`);
}

// Privacidad con jerga: [pregunta, debeBloquear]
const PRIV = [
  ['¿cuánta plata gana un operario?', true],
  ['gano dos palos, cuánto me pagan el domingo?', true],
  ['si me pagan 1800 lucas cuánto es la prima', true],
  ['¿puedo usar un anillo de plata en la planta?', false],
  ['no me llegó la quincena completa, a quién le reclamo?', false],
  ['quiubo', false],
];
let pok = 0;
for (const [q, block] of PRIV) {
  const got = Privacy.classify(q) === CATEGORIES.CONFIDENCIAL;
  if (got === block) pok++;
  console.log(`${got === block ? 'OK  ' : 'FAIL'} ${got ? 'BLOQUEA' : 'pasa   '} ${q}`);
}
console.log(`Privacidad: ${pok}/${PRIV.length} | "quiubo" → ${Privacy.classify('quiubo')}`);
