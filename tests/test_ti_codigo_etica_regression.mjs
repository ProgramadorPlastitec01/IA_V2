/**
 * Regresión de las pruebas de TI sobre el Código de Ética (PDFs "PRUEBAS IA
 * RRHH" y "Pruebas de IA", analizados 2026-11-24). Preguntas literales.
 *
 * target:true  → fallo de código que DEBE pasar (o regresión de algo que ya
 *                funcionaba). Cuenta para el código de salida.
 * target:false → depende de contenido que falta en el .md "Material visual"
 *                (se espera el Código completo de RRHH) o de mejoras futuras.
 *                Se reporta como INFO, no cuenta como fallo.
 *
 * Uso (instancia de prueba, no toca la del usuario):
 *   $env:PORT=3999; node server.js
 *   $env:BENCH_API_URL='http://localhost:3999/api/query'; node tests/test_ti_codigo_etica_regression.mjs
 * Consultas con bypass_cache:true (no escriben en SQLite).
 */
const API = process.env.BENCH_API_URL || 'http://localhost:3999/api/query';
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);

const NOT_FOUND = /^(no se encontr[oó] informaci[oó]n suficiente|no encontr[eé] informaci[oó]n)/i;

const CASES = [
    { id: 'sec3_sistemas', target: true,
      q: 'Según la Sección 3 del documento, ¿cuáles son los dos sistemas de gestión y control que Plastitec ha implementado y adoptado para prevenir los riesgos de LA/FT/FPADM?',
      must: [/SAGRILA/i, /OEA|Operador Econ[oó]mico/i] },
    { id: 'sec3_tres_acciones', target: true,
      // Error 3: se mostraba "…a través de:" sin lista. Las tres acciones NO están en el
      // .md (brecha de contenido): se acepta "sin información" o una respuesta con lo que
      // sí hay, pero NUNCA una introducción de lista vacía.
      q: 'Según la Sección 3 (Prevención del Riesgo de LA/FT/FPADM), ¿a través de qué tres acciones buscan Plastitec mitigar los riesgos de lavado de activos, financiamiento del terrorismo y proliferación de armas de destrucción masiva?',
      allowNotFound: true, notEnd: /:\s*$/ },
    { id: 'diversidad', target: true,
      q: '¿cómo define Plastitec el término "Diversidad" y qué compromiso asume la empresa respecto a sus colaboradores?',
      must: [/personalidad/i, /respeto/i] },
    { id: 'recursos', target: true,
      // Error 1: el gate temático lo rechazaba sin llamar al LLM (Sección 11 recuperada).
      q: '¿qué se considera "recursos de la empresa" y con qué fines deben utilizarse?',
      must: [/instalaciones|maquinaria|equipos/i, /dinero|propiedad intelectual|materia prima/i] },
    { id: 'sec15', target: true,
      // Error 2: confianza 0.94 y Sección 15 en contexto, pero "sin información" total.
      // El 'área designada' no está en el .md → se espera respuesta PARCIAL.
      q: 'Según la Sección 15 (Medidas Disciplinarias), ¿qué área designa Plastitec para recibir y tratar todo reporte, violación y/o incumplimiento del Código de Ética, y qué consecuencia puede acarrear el incumplimiento de las disposiciones del código por parte de un colaborador?',
      must: [/falta grave|justa causa|medida disciplinaria/i] },
    { id: 'sec13_prop_intelectual', target: false,
      q: 'Un colaborador de Plastitec se entera de que un tercero está utilizando sin autorización un diseño o molde desarrollado por la empresa. Según la Sección 13 (Propiedad Intelectual), ¿qué acciones debe tomar el colaborador frente a esta situación y qué requisito se exige para que un tercero pueda utilizar legalmente la propiedad intelectual de Plastitec?',
      must: [/prohibir/i, /rechazar/i, /reportar/i, /autorizaci[oó]n|convenio/i] },
    { id: 'sec5_conflicto', target: false,
      q: 'Un colaborador de Plastitec se encuentra en una situación en la que podría verse involucrado en un conflicto de interés. Según la Sección 5, ¿a quién debe comunicarlo y qué debe hacer respecto al medio donde se presenta la situación, y qué podría ocurrirle al funcionario dependiendo de la evaluación?',
      must: [/Recursos Humanos|Gerencia/i], not: [/Comit[eé] de Convivencia/i] },
    { id: 'sec5_regalo', target: false,
      q: 'Un colaborador de Plastitec recibe de un proveedor un regalo costoso como agradecimiento por un contrato recién adjudicado. Según la Sección 5 (Conflicto de Interés), ¿qué establece el documento sobre esta situación y qué debe hacer el colaborador si se presenta un conflicto de interés?',
      must: [/regalo|d[aá]diva/i], not: [/Comit[eé] de Convivencia/i] },
    { id: 'sec7_venta', target: false,
      q: 'Un colaborador de Plastitec desea organizar una venta de alimentos dentro de las instalaciones de la empresa para obtener un beneficio económico personal. Según la Sección 7 (Ser Ejemplo), ¿está permitida esta actividad?',
      must: [/rifas|colectas|ventas?/i], not: [/reuniones sociales/i] },
    { id: 'sec10_situacion', target: false,
      // Pregunta deíctica ("esta situación") en una UI de una sola pregunta.
      q: '¿qué establece el documento sobre esta situación y qué se espera de los colaboradores, visitantes y contratistas respecto al desarrollo de sus funciones?',
      must: [/alcohol|sustancias/i] },
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
        const nf = NOT_FOUND.test(body);
        if (nf && !c.allowNotFound) problems.push('respuesta "sin información" total');
        if (!nf) {
            for (const re of c.must || []) if (!re.test(body)) problems.push(`falta ${re}`);
        }
        for (const re of c.not || []) if (re.test(body)) problems.push(`no debía aparecer ${re}`);
        if (c.notEnd && c.notEnd.test(body)) problems.push('termina en introducción de lista vacía');
    }
    const ok = problems.length === 0;
    if (!ok && c.target) failed++;
    const tag = ok ? 'PASS' : (c.target ? 'FAIL' : 'INFO');
    console.log(`${tag}  ${c.id.padEnd(24)} ${((Date.now() - t0) / 1000).toFixed(0)}s  ${problems.join('; ')}`);
    if (!ok || process.env.VERBOSE) console.log('      ↳', body.replace(/\s+/g, ' ').slice(0, 450), '| fuentes:', sources.replace(/\s+/g, ' ').slice(0, 160));
}
console.log(`\n${failed === 0 ? 'OK (casos objetivo)' : failed + ' caso(s) objetivo fallaron'}`);
process.exit(failed === 0 ? 0 : 1);
