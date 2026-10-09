// Verifica candidatas a "Preguntas frecuentes" (modal Ver todas) contra el backend real.
const QS = [
    '¿Cuántos días de vacaciones tengo al año?',
    '¿Cuál es el procedimiento de lavado de manos?',
    '¿Qué es una calamidad doméstica?',
    '¿Qué elementos de protección se usan en el área blanca?',
    '¿Puedo ingresar alimentos a la planta?',
    '¿Cómo deben ingresar los visitantes a la planta?',
    '¿Qué se considera falta grave en el reglamento?',
    '¿Cuántas horas tiene la jornada laboral semanal?',
];
for (const q of QS) {
    const t0 = Date.now();
    const r = await fetch('http://localhost:3000/api/query', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5180' },
        body: JSON.stringify({ query: q, conversationId: 'faq-extra-check-2026-10-09', bypass_cache: true }),
    }).then(x => x.json());
    console.log(`\n■ ${q}  (conf=${Number(r.confidence).toFixed(2)}, ${((Date.now() - t0) / 1000).toFixed(0)}s)\n${String(r.response || r.error).slice(0, 700)}`);
}
