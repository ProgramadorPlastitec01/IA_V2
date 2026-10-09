// Pruebas del chequeo de premisa v2 (quita solo oraciones que afirman el término).
const { default: v } = await import('../services/citationValidator.js');
const P = 'No encontré información sobre', S = 'en la documentación disponible.';
const cases = [
  ['cumpleaños (todo afirmación → reemplazo total)', 'Según el artículo 35 del RIT, el día de cumpleaños es un día libre, y si cae en domingo se traslada al lunes.', ['cumpleaños']],
  ['I4 compuesta (conservar vacaciones)', 'Para pedir vacaciones, el empleado debe solicitarlas con 15 días de anticipación al jefe inmediato y a Recursos Humanos. La prima de navidad equivale a medio salario.', ['navidad']],
  ['B9 honesta (no tocar)', 'El protocolo de seguridad de datos para desarrolladores web no está explícitamente mencionado en el contexto. Sin embargo, todos los colaboradores deben proteger la información confidencial.', ['desarrolladores']],
  ['licras (quitar afirmación, dejar negación honesta)', 'Según el servicio de lavandería, no se recomienda usar licras debajo del uniforme. No se menciona explícitamente si se pueden usar licras.', ['licras']],
];
for (const [n, t, terms] of cases) {
  const r = v.applyPremiseCheck(t, terms, P, S);
  console.log(`■ ${n} | replacedAll=${r.replacedAll} removed=${r.removed}\n   ${r.text.replace(/\n+/g, ' ⏎ ')}`);
}
