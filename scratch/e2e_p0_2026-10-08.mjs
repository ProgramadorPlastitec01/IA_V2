// Prueba end-to-end del P0 (2026-10-08): 40 preguntas de la prueba de TI +
// casos reportados (hijo enfermo, cumpleaños, licras, celular, Prueba IA RRHH.pdf).
// Emula el flujo de chatController: privacidad → longitud → RAG (+ validador).
// Uso:  $env:QDRANT_COLLECTION='plastitec_docs_p0'; node scratch/e2e_p0_2026-10-08.mjs
import fs from 'fs';

const { default: PrivacyService, CATEGORIES } = await import('../services/privacy.js');
const { default: ragService } = await import('../services/ragService.js');
const { SYSTEM_MESSAGES } = await import('../config/systemMessages.js');

const MAX_QUERY_LENGTH = 200;

const QUESTIONS = [
  // ── RIT (TI) ──
  ['RIT-1', '¿Cuál es el período máximo de prueba según el reglamento y qué sucede si el trabajador continúa laborando después de expirado dicho período sin que se haya estipulado por escrito?'],
  ['RIT-2', '¿Cuáles son las fechas de entrega de dotación establecidas en el reglamento y cuál es el requisito de remuneración mensual para tener derecho a ella?'],
  ['RIT-3', '¿Cómo se remunera el trabajo en domingo y festivos según el reglamento? Indica los porcentajes de recargo y las fechas de aplicación progresiva.'],
  ['RIT-4', '¿Cuál es la duración de la licencia remunerada por paternidad según el reglamento y cuál es el único soporte válido para su otorgamiento?'],
  ['RIT-5', '¿Qué obligación especial tiene el empleador respecto a la desconexión laboral de los trabajadores y qué norma la regula?'],
  // ── Código de Ética (TI) — P1 y P4 truncadas a 200 como en la prueba real ──
  ['ETI-1', '¿Qué área de PLASTITEC es la designada para recibir y tratar todo reporte, violación y/o incumplimiento al Código de Ética? ¿Qué consecuencia puede tener el incumplimiento de sus disposiciones por par'],
  ['ETI-2', '¿Qué sistemas de gestión y control ha implementado y adoptado PLASTITEC para prevenir el riesgo de lavado de activos, financiamiento del terrorismo y proliferación de armas de destrucción masiva?'],
  ['ETI-3', '¿Cómo define el Código de Ética el conflicto de interés y a quién debe comunicarlo el colaborador que se encuentre frente a una situación de este tipo?'],
  ['ETI-4', '¿Qué prohibiciones establece el Código de Ética respecto a recibir, pagar, ofrecer, prometer o autorizar dinero, regalos, condiciones ventajosas, salarios, viajes, comisiones o cualquier otra forma de'],
  ['ETI-5', '¿Qué compromiso adquieren los colaboradores frente a la información confidencial y la propiedad intelectual de PLASTITEC, tanto durante la relación laboral como después de finalizada?'],
  // ── BPM (TI) ──
  ['BPM-1', '¿Qué son las Buenas Prácticas de Manufactura (BPM) según el documento y cuál es su objeto?'],
  ['BPM-2', '¿Cómo se clasifican las áreas según el nivel de contaminación? Menciona al menos dos ejemplos de cada tipo de área.'],
  ['BPM-3', '¿Cuáles son las reglas establecidas para el uso de la cofia? Indica dónde debe colocarse y retirarse, y qué se debe hacer al trasladarse de planta a planta.'],
  ['BPM-4', '¿Qué prohibiciones se establecen en el documento respecto a objetos personales, joyas, maquillaje, celular, alimentos, bebidas y otras sustancias?'],
  ['BPM-5', '¿Cómo se debe realizar una corrección en un registro según el documento? Detalla los pasos y qué hacer si hay más de una corrección.'],
  // ── Conocimiento Plastitec (TI) ──
  ['CON-1', '¿Cuál es la misión y cuál es la visión de PLASTITEC según el documento?'],
  ['CON-2', '¿Qué certificaciones ha obtenido PLASTITEC, con qué normas y en qué años? Menciona también las entidades certificadoras.'],
  ['CON-3', '¿Quiénes ocupan los cargos de Gerente, Director Técnico y Gestión Calidad y Director de Recursos Humanos?'],
  ['CON-4', '¿Qué áreas de proceso se mencionan en el documento y qué operaciones realiza específicamente el área de Producción Farmacéutica?'],
  ['CON-5', '¿Qué beneficios ofrece Plastitec a sus trabajadores? Menciona al menos cinco.'],
  // ── Áreas Blancas (TI) ──
  ['BLA-1', '¿Cuál es el procedimiento correcto para el ingreso a áreas blancas según el instructivo I-RH-011? Menciona al menos cinco pasos en el orden establecido.'],
  ['BLA-2', '¿Qué se debe hacer con los zapatos de calle y la ropa de calle antes de ingresar al vestier? ¿Dónde se guardan y en qué condiciones?'],
  ['BLA-3', '¿Qué elementos de protección personal se deben colocar para ingresar al área blanca y en qué orden? Menciona al menos cofia, uniforme, polainas, guantes y escafandra.'],
  ['BLA-4', '¿Qué prohibiciones o restricciones establece el instructivo respecto al maquillaje, accesorios (joyas, relojes, celulares) y ropa diferente a la dotación suministrada?'],
  ['BLA-5', '¿Qué se debe hacer al salir del área blanca? Detalla los pasos de retiro, indicando qué elementos se retiran y en qué orden.'],
  // ── Áreas Grises (TI) ──
  ['GRI-1', '¿Cuál es el procedimiento correcto para el ingreso al área gris según el instructivo I-RH-009? Menciona al menos cinco pasos en el orden establecido.'],
  ['GRI-2', '¿Qué se debe hacer con la ropa de calle, las joyas y los zapatos de calle antes de ingresar al área gris? ¿Dónde se guardan y en qué condiciones?'],
  ['GRI-3', '¿Qué elementos de protección personal se deben colocar para ingresar al área gris y en qué orden? Menciona al menos cofia, protección auditiva, blusa blanca, uniforme y guantes.'],
  ['GRI-4', '¿Qué prohibiciones o restricciones establece el instructivo respecto al maquillaje y al tipo de ropa que se puede usar?'],
  ['GRI-5', '¿Qué se debe hacer al salir del área gris? Detalla los pasos de retiro, indicando qué elementos se retiran y en qué orden, y qué elemento no se debe retirar.'],
  // ── Áreas Negras (TI) ──
  ['NEG-1', '¿Cuál es el procedimiento completo para el ingreso al área negra según el instructivo I-RH-010? Enumera los pasos en el orden establecido.'],
  ['NEG-2', '¿Qué se debe hacer con la ropa de calle y las joyas al ingresar al área negra? ¿Dónde se guardan?'],
  ['NEG-3', '¿Qué dotación se debe usar en el área negra y qué restricciones se establecen respecto a elementos diferentes a los entregados como dotación y a los elementos de protección personal?'],
  ['NEG-4', '¿Qué prohibición se establece respecto al uso de la cofia en la calle?'],
  ['NEG-5', '¿Qué condiciones generales debe cumplir todo el personal cuya área de trabajo sea negra?'],
  // ── Visitas Planta 2 (TI) ──
  ['VIS-1', '¿Cuál es el procedimiento completo para el ingreso de visitas a la Planta 2 según el instructivo I-RH-006? Enumera los pasos en el orden establecido.'],
  ['VIS-2', '¿Qué se debe hacer con los zapatos y las prendas personales antes de ingresar al vestier? ¿Qué excepción establece la nota inicial para los visitantes que no van a manipular productos?'],
  ['VIS-3', '¿Qué elementos de protección personal se deben colocar para ingresar al área y en qué orden? Menciona al menos cofia, protección auditiva, uniforme, polainas, guantes y escafandra.'],
  ['VIS-4', '¿Qué prohibiciones o restricciones establece el instructivo respecto al maquillaje, accesorios, equipos y comportamiento durante la visita?'],
  ['VIS-5', '¿Qué se debe hacer al salir del área? Detalla los pasos de retiro, indicando qué elementos se retiran, en qué orden, qué elemento se conserva hasta salir del vestier y dónde se deposita el uniforme.'],
  // ── Lavado de manos (TI) ──
  ['LAV-1', '¿A quién aplica el instructivo de Lavado de Manos y con qué norma debe cumplirse adicionalmente?'],
  ['LAV-2', '¿Cuáles son los primeros tres pasos del procedimiento de lavado de manos? Descríbelos en orden.'],
  ['LAV-3', '¿Qué indican los pasos 4, 5 y 6 del instructivo respecto al frotado de manos, dorsos, dedos y uñas?'],
  ['LAV-4', '¿Cuál es el tiempo mínimo que se debe realizar el frotado según el instructivo y a qué pasos corresponde?'],
  ['LAV-5', '¿Cómo se debe realizar el enjuague y el secado de manos y brazos según los pasos 8 y 9? Indica el tipo de toalla y hasta dónde debe secarse.'],
  // ── Casos reportados / producción ──
  ['USR-hijo', 'si mi hijo se enferma, puedo tomar esto como incapacidad'],
  ['USR-cumple', 'El dia de cumpleaños es libre.'],
  ['USR-licras', '¿Se pueden usar licras debajo del uniforme?'],
  ['USR-celular', 'puedo usar mi telefono celular?'],
  ['USR-luto', '¿Cuántos días de permiso por luto tengo?'],
  ['PDF2-vac', 'puedo pedir vacaciones incluso si no he completado el año de contrato'],
  ['PDF2-extras', 'las horas extras son obligatorias?'],
  ['PDF2-licencias', 'dame una lista de licencias remuneradas'],
  ['PDF2-funciones', 'que pasa si mi jefe me pone a realizar funciones que no estan dentro del manual de funciones'],
  ['PDF2-temporal', 'cuanto tiempo de trabajo es por empresa temporal'],
  ['PDF2-escafandra', 'que debo hacer si se me pierde mi escafandra'],
  ['PDF2-sst', 'segun el reglamento de SST que está prohibido realizar en plastitec?'],
  // ── Jerga colombiana (glosario 2026-10-08) ──
  ['SLG-cucha', 'mi cucha está enferma, puedo faltar mañana?'],
  ['SLG-echaron', 'me echaron sin justa causa, qué hago'],
  ['SLG-prendido', 'llegué prendido a la integración, me pueden sancionar?'],
  ['SLG-insulto', 'el supervisor me dijo marica delante de todos, qué puedo hacer'],
  ['SLG-mecato', '¿puedo comer mecato en la planta?'],
];

const only = process.argv[2] ? new Set(process.argv[2].split(',')) : null;
const out = [];
const origLog = console.log;
for (const [id, q] of QUESTIONS) {
  if (only && !only.has(id)) continue;
  const t0 = Date.now();
  let answer, path, meta = {};
  if (PrivacyService.classify(q) === CATEGORIES.CONFIDENCIAL) {
    answer = SYSTEM_MESSAGES.CONFIDENTIAL; path = 'privacy_block';
  } else if (q.length > MAX_QUERY_LENGTH) {
    answer = '(rechazada por longitud)'; path = 'too_long';
  } else {
    const logs = [];
    console.log = (...a) => { const s = a.join(' '); if (/CitationValidator|Guardrail|ConfidenceEngine/.test(s)) logs.push(s); };
    let r;
    try { r = await ragService.processQuery(q); } catch (e) { r = { answer: 'ERROR: ' + e.message }; }
    console.log = origLog;
    answer = r.answer; path = 'rag';
    meta = { confidence: r.confidence, sources: r.sources, chunksUsed: r.chunksUsed, validator: logs.filter(l => /CitationValidator/.test(l)), confLog: logs.find(l => /ConfidenceEngine/.test(l)) };
  }
  const ms = Date.now() - t0;
  out.push({ id, q, path, ms, answer, ...meta });
  origLog(`\n### ${id} (${(ms / 1000).toFixed(1)}s, ${path}${meta.confidence !== undefined ? `, conf ${Number(meta.confidence).toFixed(2)}` : ''})\nP: ${q}\nR: ${String(answer).replace(/\n{2,}/g, '\n')}`);
  (meta.validator || []).forEach(l => origLog(`   ${l}`));
  fs.writeFileSync(`scratch/e2e_p0_results_${process.env.QDRANT_COLLECTION || 'default'}.json`, JSON.stringify(out, null, 1));
}
process.exit(0);
