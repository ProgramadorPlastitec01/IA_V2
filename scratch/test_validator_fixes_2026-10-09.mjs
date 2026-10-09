// Pruebas de las correcciones del 2026-10-09 en citationValidator:
//   (a) premisa: no rechazar verbos/adjetivos tras sustantivo documentado
//   (b) oraciones casi repetidas
const { default: v } = await import('../services/citationValidator.js');
let fail = 0;
const check = (name, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) fail++;
    console.log(`${ok ? 'OK  ' : 'FALLA'} ${name} → ${JSON.stringify(got)}${ok ? '' : ` (esperado ${JSON.stringify(want)})`}`);
};

// (a) premisa — contexto vacío: solo cuenta el corpus completo
const P = [
    ['regaña (verbo tras "jefe")', 'si mi jefe regaña a un compañero, se puede considerar acoso laboral?', 'Regañar a un compañero puede considerarse acoso laboral si mi jefe regaña de forma reiterada.', []],
    ['rotativo (adjetivo tras "contrato")', 'si soy trabajador con contrato rotativo, puedo trabajar de 7am a 5pm?', 'El contrato rotativo permite trabajar de 7am a 5pm.', []],
    ['cumpleaños (premisa real)', 'El dia de cumpleaños es libre.', 'Según el artículo 35, el día de cumpleaños es libre.', ['cumpleaños']],
    ['licras (premisa real tras verbo)', '¿Puedo usar licras debajo del uniforme?', 'No se recomienda usar licras debajo del uniforme.', ['licras']],
    ['navidad (tras preposición)', '¿Cuánto pagan la prima de navidad?', 'La prima de navidad equivale a medio salario.', ['navidad']],
];
for (const [name, q, a, want] of P) check(name, v.findUnsupportedTerms(q, a, ''), want);

// (b) casi repetidas
const loop = 'Los pasos 4, 5 y 6 indican frotar el dorso y las palmas. ' +
    'No se menciona si el frotado de manos, dorsos, dedos y uñas debe ser realizado con jabón antibacterial. ' +
    'No se menciona si el frotado de manos, dorsos, dedos y uñas debe ser realizado con agua corriente. ' +
    'No se menciona si el frotado de manos, dorsos, dedos y uñas debe ser realizado con toalla.';
const out = v.removeRepeatedSentences(loop, []);
check('bucle casi idéntico: queda 1 negación', (out.match(/No se menciona/g) || []).length, 1);

const steps = '1. Frotar el dorso de cada mano con los dedos entrelazados.\n2. Frotar las palmas entre sí con los dedos entrelazados.\n3. Limpie uno a uno los dedos y uñas de cada mano con la mano contraria.';
check('lista de pasos intacta', v.removeRepeatedSentences(steps, []), steps);

const two = 'El trabajador debe informar el accidente al jefe inmediato de forma verbal. El trabajador debe informar el accidente al jefe inmediato por escrito en 24 horas.';
check('2 afirmaciones con mismo inicio se conservan', v.removeRepeatedSentences(two, []), two);

console.log(fail ? `\n${fail} falla(s)` : '\nTodo OK');
process.exit(fail ? 1 : 0);
