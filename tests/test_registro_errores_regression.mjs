/**
 * Regresión del "Registro de errores" de los técnicos (2026-10-28).
 * Preguntas del PDF SIN truncar + celular y horario. Cada caso verifica por
 * palabras (must = debe aparecer, not = no debe aparecer en el cuerpo).
 *
 * Uso (instancia de prueba, no toca la del usuario):
 *   PORT=3999 node server.js
 *   BENCH_API_URL=http://localhost:3999/api/query node tests/test_registro_errores_regression.mjs
 * Las consultas van con bypass_cache:true (no escriben en SQLite).
 */
const API = process.env.BENCH_API_URL || 'http://localhost:3999/api/query';
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);

const NOT_FOUND = /^(no se encontr[oó] informaci[oó]n suficiente|no encontr[eé] informaci[oó]n)/i;

const CASES = [
    { id: 'etica_doble', q: '¿Qué área designa PLASTITEC para recibir y tratar todo reporte, violación y/o incumplimiento al Código de Ética? ¿Qué consecuencia puede tener el incumplimiento de las disposiciones del Código por parte de un colaborador?',
      // El 'área designada' falta en el .md (brecha de contenido): se espera respuesta PARCIAL
      // (consecuencia, Sección 15) + nota de lo no encontrado, nunca un 'sin información' total.
      must: [/falta grave|justa causa|medidas? disciplinarias?/i, /no encontr[eé] informaci[oó]n sobre/i], notSources: [/Reglamento|Conocimiento|Buenas Pr/i] },
    { id: 'celular', q: 'puedo usar el celular en el area de tecnologia de la informacion?',
      must: [/celular|m[oó]vil/i] },
    { id: 'horario', q: '¿Cuál es el horario de trabajo?', must: [/7:30/] },
    { id: 'grises_q1', q: '¿cuáles son los 3 elementos de protección personal que se deben colocar antes de ingresar al vestier según el paso 1?',
      // Conocido: omite "no ingrese con maquillaje" (restricción del Paso 1); ver notas del plan.
      must: [/cofia/i, /protecci[oó]n auditiva/i] },
    { id: 'grises_proc', q: 'Explique el procedimiento completo que debe seguir un operario para ingresar al área gris, desde que llega al vestier hasta que ingresa al proceso, incluyendo qué debe hacer con la ropa de calle, los zapatos y las joyas.',
      must: [/maquillaje/i, /bolsa/i, /guantes/i] },
    { id: 'negras_sin_area', q: '¿qué debe hacer el operario con la ropa de calle y las joyas al ingresar al vestier, y qué prenda debe ponerse a continuación?',
      must: [/negra/i, /gris/i, /blanca/i] },
    { id: 'negras_con_area', q: '¿qué debe hacer el operario con la ropa de calle y las joyas al ingresar al vestier del área negra, y qué prenda debe ponerse a continuación?',
      must: [/locker/i, /blusa/i], not: [/bolsa/i] },
    { id: 'negras_proc', q: 'Explique el procedimiento completo que debe seguir un operario para ingresar al área negra, desde que llega al vestier hasta que ingresa a su área de trabajo, indicando qué debe hacer con la ropa de calle y las joyas.',
      must: [/overol/i, /cofia/i], not: [/bolsa/i] },
    { id: 'blancas_salida', q: '¿Cuál es el procedimiento de salida del área blanca?',
      must: [/escafandra/i, /polainas/i, /uniforme/i] },
    { id: 'blancas_ingreso', q: 'Para ingresar al área blanca, ¿qué elementos de protección personal debo colocarme y en qué orden?',
      must: [/cofia/i, /blusa/i, /polainas/i] },
    { id: 'visitas_q1', q: '¿qué debe hacer el visitante con los zapatos antes de la línea amarilla y dónde debe colocar las prendas personales?',
      must: [/l[ií]nea amarilla/i, /locker/i] },
    { id: 'visitas_proc', q: 'Explique el procedimiento completo que debe seguir un visitante para ingresar y salir de la Planta 2.',
      must: [/escafandra/i, /polainas/i], not: [/ba[ñn]o/i], notSources: [/[ÁA]reas Blancas/i] },
    { id: 'bpm_clasif', q: '¿Cómo se clasifican las áreas de Plastitec según el nivel de contaminación?',
      must: [/negras?/i, /grises?/i, /blancas?/i] },
    { id: 'bpm_registro', q: '¿Cómo se realiza una corrección en un registro?',
      must: [/diagonal/i, /asterisco/i] },
    { id: 'conocimiento_cert', q: '¿Qué certificaciones de calidad ha obtenido Plastitec?',
      must: [/9001/, /13485/] },
    { id: 'conocimiento_areas', q: '¿Cuáles son las áreas de proceso y qué operaciones realiza Producción Farmacéutica?',
      must: [/inyecci[oó]n/i, /extrusi[oó]n/i] },
];

const splitAnswer = (raw) => {
    const parts = String(raw || '').split(/\n\s*-{3,}\s*\n/);
    return { body: parts[0].trim(), sources: parts.slice(1).join('\n') };
};

let failed = 0;
for (const c of CASES) {
    if (ONLY.length && !ONLY.includes(c.id)) continue;
    const t0 = Date.now();
    let body = '', sources = '', err = null;
    try {
        const res = await fetch(API, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: c.q, bypass_cache: true }),
            signal: AbortSignal.timeout(240000),
        });
        const data = await res.json();
        ({ body, sources } = splitAnswer(data.response));
    } catch (e) { err = e.message; }

    const problems = [];
    if (err) problems.push(`error: ${err}`);
    else {
        if (NOT_FOUND.test(body)) problems.push('respuesta "sin información" total');
        for (const re of c.must || []) if (!re.test(body)) problems.push(`falta ${re}`);
        for (const re of c.not || []) if (re.test(body)) problems.push(`no debía aparecer ${re}`);
        for (const re of c.notSources || []) if (re.test(sources)) problems.push(`fuente de más ${re}`);
    }
    const ok = problems.length === 0;
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.id.padEnd(20)} ${((Date.now() - t0) / 1000).toFixed(0)}s  ${problems.join('; ')}`);
    if (!ok || process.env.VERBOSE) console.log('      ↳', body.replace(/\s+/g, ' ').slice(0, 400), '| fuentes:', sources.replace(/\s+/g, ' ').slice(0, 160));
}
console.log(`\n${failed === 0 ? 'OK' : failed + ' caso(s) fallaron'}`);
process.exit(failed === 0 ? 0 : 1);
