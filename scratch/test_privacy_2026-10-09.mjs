// Privacidad: el salario mínimo legal es dato público; el salario de una persona no.
const { default: P } = await import('../services/privacy.js');
const cases = [
    ['Cuanto es el pago minimo en colombia?', false],
    ['cuál es el salario mínimo 2026', false],
    ['cuanto es el auxilio de transporte', false],
    ['cuánto es el mínimo legal vigente', false],
    ['cuanto gana mi compañero de turno', true],
    ['cuál es mi salario', true],
    ['cuanto me pagan a mi', true],
    ['cuánto es el salario del gerente', true],
    ['me pagan 2.500.000 de salario, es justo?', true],
    ['cuánto es el recargo dominical', false],
    ['cada cuánto pagan la nómina', false],
];
let fail = 0;
for (const [q, conf] of cases) {
    const got = P.classify(q) === 'confidencial';
    if (got !== conf) fail++;
    console.log(`${got === conf ? 'OK   ' : 'FALLA'} ${q} → ${P.classify(q)}`);
}
console.log(fail ? `${fail} falla(s)` : 'Todo OK');
