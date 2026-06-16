import fetch from 'node-fetch';
import fs from 'fs';

const benchmarkQueries = [
    // BPM (10)
    "¿Debo lavarme las manos antes de entrar a la sala limpia?",
    "¿Qué pasa si el uniforme de área blanca se me mancha?",
    "¿Puedo entrar con maquillaje a la planta de extrusión?",
    "¿Cómo debo quitarme la escafandra al salir del área?",
    "¿Qué hago si tengo una herida en la mano y debo manipular producto?",
    "¿Dónde debo depositar las polainas usadas?",
    "¿Puedo llevar mi teléfono celular a la zona de producción farmacéutica?",
    "¿Cada cuánto debo lavarme las manos si estoy en el área blanca?",
    "¿Quién lava el overol blanco, yo o la empresa?",
    "¿Puedo ingresar con reloj y anillos a la planta?",
    // SST (10)
    "¿Cuáles son los riesgos ergonómicos de mi puesto?",
    "¿Qué debo hacer si me corto con una máquina?",
    "¿Dónde están ubicados los extintores en la planta?",
    "¿A quién le reporto un acto inseguro de un compañero?",
    "¿Cuáles son mis responsabilidades en Seguridad y Salud en el Trabajo?",
    "¿Qué funciones tiene el COPASST?",
    "¿Cómo reporto una enfermedad laboral?",
    "¿Qué elementos de protección personal son obligatorios?",
    "¿Qué hago en caso de escuchar la alarma de evacuación?",
    "¿El uso de protección auditiva es obligatorio en toda la planta?",
    // Reglamento Interno (10)
    "¿Cuántos días de licencia por luto me corresponden?",
    "¿A qué hora es mi descanso para almorzar?",
    "¿Qué pasa si llego tarde a mi turno de trabajo tres veces?",
    "¿Es falta grave tomar alcohol antes de venir a trabajar?",
    "¿Tengo derecho a permiso remunerado para ir al médico?",
    "¿Cuánto dura la licencia de maternidad según el reglamento?",
    "¿Cuáles son las funciones del Comité de Convivencia Laboral?",
    "¿Qué se considera acoso laboral en la empresa?",
    "¿Cuáles son los días de descanso obligatorio?",
    "¿Qué obligaciones especiales tiene Plastitec como empleador?",
    // Código de Ética (10)
    "¿Qué es SAGRILAFT y a quiénes aplica?",
    "¿Qué hago si un proveedor me ofrece un regalo costoso?",
    "¿A quién denuncio un caso de soborno?",
    "¿Qué es un conflicto de intereses por parentesco?",
    "¿Puedo contratar a un familiar directo para que trabaje en mi equipo?",
    "¿Cuál es la política frente al lavado de activos?",
    "¿Existe discriminación en Plastitec si alguien tiene otra religión?",
    "¿Qué significa ser OEA?",
    "¿Cómo se protegen mis datos personales si hago una denuncia?",
    "¿El código de ética aplica también a los contratistas?",
    // Información General (10)
    "¿Cuál es la misión de Plastitec?",
    "¿Qué productos fabrica la empresa?",
    "¿Quién es el gerente general de Plastitec?",
    "¿Cuáles son los valores corporativos?",
    "¿En qué año se fundó Plastitec?",
    "¿A qué ARL está afiliada la empresa?",
    "¿Qué es el apoyo de sostenimiento para aprendices SENA?",
    "¿La empresa hace exámenes médicos de ingreso?",
    "¿Cuáles son los deberes de un visitante en la planta?",
    "¿Cómo es el proceso de inducción para un empleado nuevo?"
];

const hallucinationQueries = [
    "¿Cuál es la política de teletrabajo para el área comercial?",
    "¿De cuánto es el bono de conectividad por trabajar desde casa?",
    "¿Cuáles son los beneficios para empleados en España?",
    "¿Cómo solicito el subsidio de transporte internacional?",
    "¿Cuál es el procedimiento paso a paso para usar SAP en inventarios?",
    "¿Cuántos días de vacaciones me dan si me traslado a la planta de Estados Unidos?",
    "¿Cuál es la política corporativa sobre el uso de Inteligencia Artificial como ChatGPT?",
    "¿Qué reglamento aplica para el uso de drones dentro de las instalaciones?",
    "¿Cuál es la política BYOD (Bring Your Own Device) de la empresa?",
    "¿Cuánto es el auxilio económico por adopción de mascotas?"
];

async function evaluate(queries, reportTitle) {
    let md = `# ${reportTitle}\n\n`;

    for (let i = 0; i < queries.length; i++) {
        const query = queries[i];
        console.log(`Evaluando [${reportTitle}]: ${i+1}/${queries.length} procesando...`);
        
        try {
            const res = await fetch('http://localhost:3000/api/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: query, bypass_cache: true })
            });
            const data = await res.json();

            md += `## P${i+1}: ${query}\n`;
            
            const respText = data.response || data.error || 'Sin respuesta';
            md += `**Respuesta generada:**\n> ${String(respText).replace(/\n/g, '\n> ')}\n\n`;
            
            if (data.sources && data.sources.length > 0) {
                 md += `- **Documentos origen:** ${data.sources.join(', ')}\n`;
                 md += `- **Score (Confidence):** ${data.confidence?.toFixed(4)}\n`;
            } else {
                 md += `- **Documentos origen:** Ninguno (Rechazo)\n`;
            }

            md += `- **Clasificación:** [Pendiente revisar]\n\n`;
            md += `---\n`;
        } catch (e) {
            console.error(e);
        }
    }
    return md;
}

async function run() {
    // Tarea 3 y 4
    fs.writeFileSync('C:/Users/Programador.ti1/.gemini/antigravity-ide/brain/314edafa-4c9a-4240-a911-ef504f6a6710/benchmark_questions.md', benchmarkQueries.join('\n'));
    console.log("benchmark_questions.md creado.");

    const benchmarkReport = await evaluate(benchmarkQueries, "TAREA 4 — RESULTADOS DE BENCHMARK CORPORATIVO (50 Preguntas)");
    fs.writeFileSync('C:/Users/Programador.ti1/.gemini/antigravity-ide/brain/314edafa-4c9a-4240-a911-ef504f6a6710/benchmark_results.md', benchmarkReport);
    console.log("benchmark_results.md creado.");

    // Tarea 5
    const hallReport = await evaluate(hallucinationQueries, "TAREA 5 — ZERO HALLUCINATION TEST (10 Preguntas)");
    fs.writeFileSync('C:/Users/Programador.ti1/.gemini/antigravity-ide/brain/314edafa-4c9a-4240-a911-ef504f6a6710/hallucination_test_report.md', hallReport);
    console.log("hallucination_test_report.md creado.");
}

run();
