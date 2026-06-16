/**
 * tests/generate_dataset.js
 * Dataset Generator — Fase 2.3A
 * 
 * Genera un dataset híbrido:
 * - 30% preguntas manuales reales (históricamente problemáticas)
 * - 70% preguntas sintéticas generadas por categoría
 * 
 * Produce: tests/enterprise_dataset.json
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATASET_FILE = path.join(__dirname, 'enterprise_dataset.json');

// ─── 30% Manual: Preguntas Históricas Reales ─────────────────────────────────
// Estas preguntas son las que históricamente rompieron el sistema
const MANUAL_QUESTIONS = [
    {
        id: "manual_001",
        categoria: "BPM",
        pregunta: "¿Los visitantes pueden conservar ropa de calle debajo del overol?",
        respuesta_esperada: "Sí, los visitantes que no tienen contacto con el producto pueden conservar su ropa de calle debajo del overol.",
        expected_source: "I-RH-003 - 18 BPMM (Material Visual) (1).pdf",
        tipo: "manual_real"
    },
    {
        id: "manual_002",
        categoria: "BPM",
        pregunta: "¿Los hombres pueden dejarse la barba y el bigote si tienen contacto con el producto?",
        respuesta_esperada: "No, está prohibido el vello facial en áreas de proceso con contacto con el producto.",
        expected_source: "I-RH-003 - 18 BPMM (Material Visual) (1).pdf",
        tipo: "manual_real"
    },
    {
        id: "manual_003",
        categoria: "BPM",
        pregunta: "¿Cómo se deben lavar los uniformes?",
        respuesta_esperada: "Deben lavarse cada vez que sean utilizados.",
        expected_source: "I-RH-003 - 18 BPMM (Material Visual) (1).pdf",
        tipo: "manual_real"
    },
    {
        id: "manual_004",
        categoria: "SAGRILAFT",
        pregunta: "¿Qué es el SAGRILAFT?",
        respuesta_esperada: "Sistema de Autocontrol y Gestión del Riesgo Integral de Lavado de Activos y Financiación del Terrorismo.",
        expected_source: "CODIGO DE ETICA (Material visual).pdf",
        tipo: "manual_real"
    },
    {
        id: "manual_005",
        categoria: "SST",
        pregunta: "¿Cuáles son los objetivos del SG-SST?",
        respuesta_esperada: "Mejorar las condiciones de trabajo y salud, controlar los factores de riesgo.",
        expected_source: "I-RH-004 - 14 Induccion en Seguridad Salud en el Trabajo.pdf",
        tipo: "manual_real"
    },
    {
        id: "manual_006",
        categoria: "BPM",
        pregunta: "¿Está permitido el uso de maquillaje dentro de la planta?",
        respuesta_esperada: "No está permitido el uso de maquillaje de ningún tipo en áreas de proceso.",
        expected_source: "I-RH-003 - 18 BPMM (Material Visual) (1).pdf",
        tipo: "manual_real"
    },
    {
        id: "manual_007",
        categoria: "SST",
        pregunta: "¿Qué es el COPASST?",
        respuesta_esperada: "Comité Paritario de Seguridad y Salud en el Trabajo, encargado de promover el cuidado de la salud de los trabajadores.",
        expected_source: "I-RH-004 - 14 Induccion en Seguridad Salud en el Trabajo.pdf",
        tipo: "manual_real"
    },
    {
        id: "manual_008",
        categoria: "BPM",
        pregunta: "¿Qué significa BPM en Plastitec? ¿Es Business Process Management?",
        respuesta_esperada: "No, en Plastitec BPM significa Buenas Prácticas de Manufactura.",
        expected_source: "I-RH-003 - 18 BPMM (Material Visual) (1).pdf",
        tipo: "manual_real"
    },
    {
        id: "manual_009",
        categoria: "BPM",
        pregunta: "¿Cuánto tiempo debe durar el lavado de manos?",
        respuesta_esperada: "NO ESPECIFICADO EN EL DOCUMENTO",
        expected_source: "I-RH-003 - 18 BPMM (Material Visual) (1).pdf",
        tipo: "manual_real"
    },
    {
        id: "manual_010",
        categoria: "Aprendices SENA",
        pregunta: "¿Cómo se termina el contrato de aprendiz SENA?",
        respuesta_esperada: "Por vencimiento del término estipulado, por mutuo acuerdo o por cancelación por parte del empleador en casos de faltas graves.",
        expected_source: "RIT PLASTITEC 25 NOV 2025.pdf",
        tipo: "manual_real"
    },
    {
        id: "manual_011",
        categoria: "Código Ética",
        pregunta: "¿Se pueden recibir regalos de proveedores?",
        respuesta_esperada: "No se deben aceptar regalos que puedan comprometer la objetividad o imparcialidad de las decisiones.",
        expected_source: "CODIGO DE ETICA (Material visual).pdf",
        tipo: "manual_real"
    },
    {
        id: "manual_012",
        categoria: "Reglamento Interno",
        pregunta: "¿Qué sanciones puede imponer la empresa por incumplimiento del reglamento?",
        respuesta_esperada: "Amonestación verbal, escrita, suspensión o despido según la gravedad de la falta.",
        expected_source: "RIT PLASTITEC 25 NOV 2025.pdf",
        tipo: "manual_real"
    },
    {
        id: "manual_013",
        categoria: "Aprendices SENA",
        pregunta: "¿Cuánto dura el contrato de aprendizaje SENA?",
        respuesta_esperada: "No puede ser superior a dos (2) años o tres (3) años en algunos casos según la modalidad.",
        expected_source: "RIT PLASTITEC 25 NOV 2025.pdf",
        tipo: "manual_real"
    },
    {
        id: "manual_014",
        categoria: "BPM",
        pregunta: "¿Es obligatorio el uso de cofia en las áreas de proceso?",
        respuesta_esperada: "Sí, es obligatorio para evitar contaminación del producto.",
        expected_source: "I-RH-003 - 18 BPMM (Material Visual) (1).pdf",
        tipo: "manual_real"
    },
    {
        id: "manual_015",
        categoria: "SST",
        pregunta: "¿Qué debe hacer un empleado en caso de accidente laboral?",
        respuesta_esperada: "Reportarlo inmediatamente al jefe directo y al área de SST.",
        expected_source: "I-RH-004 - 14 Induccion en Seguridad Salud en el Trabajo.pdf",
        tipo: "manual_real"
    }
];

// ─── 70% Sintéticas por Categoría ────────────────────────────────────────────
const SYNTHETIC_QUESTIONS = [
    // === BPM ===
    { id: "bpm_001", categoria: "BPM", pregunta: "¿Qué prendas debe usar el personal en áreas de proceso?", respuesta_esperada: "Overol, cofia, tapabocas y calzado de seguridad.", expected_source: "I-RH-003 - 18 BPMM (Material Visual) (1).pdf", tipo: "sintetica" },
    { id: "bpm_002", categoria: "BPM", pregunta: "¿Está permitido fumar dentro de las instalaciones de la planta?", respuesta_esperada: "No, está prohibido fumar dentro de las instalaciones.", expected_source: "I-RH-003 - 18 BPMM (Material Visual) (1).pdf", tipo: "sintetica" },
    { id: "bpm_003", categoria: "BPM", pregunta: "¿Se puede comer en las áreas de proceso?", respuesta_esperada: "No, está prohibido consumir alimentos en áreas de proceso.", expected_source: "I-RH-003 - 18 BPMM (Material Visual) (1).pdf", tipo: "sintetica" },
    { id: "bpm_004", categoria: "BPM", pregunta: "¿Está permitido el uso de joyería (anillos, aretes, cadenas) en áreas de proceso?", respuesta_esperada: "No, está prohibido el uso de joyería en áreas de proceso.", expected_source: "I-RH-003 - 18 BPMM (Material Visual) (1).pdf", tipo: "sintetica" },
    { id: "bpm_005", categoria: "BPM", pregunta: "¿Cuándo se deben lavar las manos en la planta?", respuesta_esperada: "Antes de iniciar labores, después de ir al baño, y cada vez que sea necesario.", expected_source: "I-RH-003 - 18 BPMM (Material Visual) (1).pdf", tipo: "sintetica" },
    { id: "bpm_006", categoria: "BPM", pregunta: "¿Pueden las mujeres tener uñas largas o pintadas en áreas de manufactura?", respuesta_esperada: "No, las uñas deben estar cortas y sin esmalte.", expected_source: "I-RH-003 - 18 BPMM (Material Visual) (1).pdf", tipo: "sintetica" },
    { id: "bpm_007", categoria: "BPM", pregunta: "¿Qué se debe hacer con el uniforme al salir de la planta?", respuesta_esperada: "Cambiarse antes de salir, el uniforme no debe usarse fuera de las instalaciones.", expected_source: "I-RH-003 - 18 BPMM (Material Visual) (1).pdf", tipo: "sintetica" },
    { id: "bpm_008", categoria: "BPM", pregunta: "¿Está permitido ingresar al área de producción con celular?", respuesta_esperada: "No está permitido el uso de celular en áreas de proceso.", expected_source: "I-RH-003 - 18 BPMM (Material Visual) (1).pdf", tipo: "sintetica" },
    { id: "bpm_009", categoria: "BPM", pregunta: "¿Qué tipo de calzado se debe usar en la planta?", respuesta_esperada: "Calzado de seguridad antideslizante.", expected_source: "I-RH-003 - 18 BPMM (Material Visual) (1).pdf", tipo: "sintetica" },
    { id: "bpm_010", categoria: "BPM", pregunta: "¿Puede ingresar una persona enferma al área de producción?", respuesta_esperada: "No, debe reportarlo a su jefe y si es necesario no trabajar en áreas de contacto con el producto.", expected_source: "I-RH-003 - 18 BPMM (Material Visual) (1).pdf", tipo: "sintetica" },

    // === SST ===
    { id: "sst_001", categoria: "SST", pregunta: "¿Qué elementos de protección personal son obligatorios?", respuesta_esperada: "Casco, guantes, gafas, tapabocas y calzado de seguridad según el área.", expected_source: "I-RH-004 - 14 Induccion en Seguridad Salud en el Trabajo.pdf", tipo: "sintetica" },
    { id: "sst_002", categoria: "SST", pregunta: "¿Qué es una enfermedad laboral?", respuesta_esperada: "Es la contraída como resultado de la exposición a factores de riesgo propios del trabajo.", expected_source: "I-RH-004 - 14 Induccion en Seguridad Salud en el Trabajo.pdf", tipo: "sintetica" },
    { id: "sst_003", categoria: "SST", pregunta: "¿Qué es un accidente de trabajo?", respuesta_esperada: "Es todo suceso repentino que sobrevenga por causa del trabajo y que produzca lesión.", expected_source: "I-RH-004 - 14 Induccion en Seguridad Salud en el Trabajo.pdf", tipo: "sintetica" },
    { id: "sst_004", categoria: "SST", pregunta: "¿Cada cuánto se deben realizar los exámenes médicos ocupacionales?", respuesta_esperada: "Periódicamente según lo establezca el médico de la empresa y el reglamento.", expected_source: "I-RH-004 - 14 Induccion en Seguridad Salud en el Trabajo.pdf", tipo: "sintetica" },
    { id: "sst_005", categoria: "SST", pregunta: "¿Cómo se deben levantar cargas pesadas?", respuesta_esperada: "Flexionando las rodillas, manteniendo la espalda recta y acercando la carga al cuerpo.", expected_source: "I-RH-004 - 14 Induccion en Seguridad Salud en el Trabajo.pdf", tipo: "sintetica" },
    { id: "sst_006", categoria: "SST", pregunta: "¿Qué factores de riesgo existen en la planta?", respuesta_esperada: "Riesgo físico, químico, biológico, ergonómico y de seguridad.", expected_source: "I-RH-004 - 14 Induccion en Seguridad Salud en el Trabajo.pdf", tipo: "sintetica" },
    { id: "sst_007", categoria: "SST", pregunta: "¿Quién es el responsable del programa de SST en la empresa?", respuesta_esperada: "La empresa, a través del área de SST y el apoyo del COPASST.", expected_source: "I-RH-004 - 14 Induccion en Seguridad Salud en el Trabajo.pdf", tipo: "sintetica" },
    { id: "sst_008", categoria: "SST", pregunta: "¿Qué es la brigada de emergencias?", respuesta_esperada: "Grupo de empleados capacitados para responder ante emergencias en la empresa.", expected_source: "I-RH-004 - 14 Induccion en Seguridad Salud en el Trabajo.pdf", tipo: "sintetica" },
    { id: "sst_009", categoria: "SST", pregunta: "¿Qué debe contener el botiquín de primeros auxilios?", respuesta_esperada: "Elementos básicos de atención como vendas, antisépticos, guantes y manual de primeros auxilios.", expected_source: "I-RH-004 - 14 Induccion en Seguridad Salud en el Trabajo.pdf", tipo: "sintetica" },
    { id: "sst_010", categoria: "SST", pregunta: "¿Qué es el plan de evacuación?", respuesta_esperada: "Procedimiento establecido para evacuar las instalaciones en caso de emergencia.", expected_source: "I-RH-004 - 14 Induccion en Seguridad Salud en el Trabajo.pdf", tipo: "sintetica" },

    // === Código Ética ===
    { id: "etica_001", categoria: "Código Ética", pregunta: "¿Qué valores promueve el código de ética de Plastitec?", respuesta_esperada: "Honestidad, respeto, responsabilidad, integridad y transparencia.", expected_source: "CODIGO DE ETICA (Material visual).pdf", tipo: "sintetica" },
    { id: "etica_002", categoria: "Código Ética", pregunta: "¿Qué conductas se consideran contrarias al código de ética?", respuesta_esperada: "Corrupción, conflicto de intereses, uso indebido de información privilegiada y acoso.", expected_source: "CODIGO DE ETICA (Material visual).pdf", tipo: "sintetica" },
    { id: "etica_003", categoria: "Código Ética", pregunta: "¿Cómo se debe manejar un conflicto de intereses?", respuesta_esperada: "Declarándolo a la gerencia y absteniéndose de participar en la decisión.", expected_source: "CODIGO DE ETICA (Material visual).pdf", tipo: "sintetica" },
    { id: "etica_004", categoria: "Código Ética", pregunta: "¿Está permitido usar información confidencial de la empresa para beneficio personal?", respuesta_esperada: "No, está estrictamente prohibido.", expected_source: "CODIGO DE ETICA (Material visual).pdf", tipo: "sintetica" },
    { id: "etica_005", categoria: "Código Ética", pregunta: "¿Qué debe hacer un empleado que conoce de un acto de corrupción?", respuesta_esperada: "Reportarlo a través de los canales éticos o a la gerencia.", expected_source: "CODIGO DE ETICA (Material visual).pdf", tipo: "sintetica" },
    { id: "etica_006", categoria: "Código Ética", pregunta: "¿Se puede hablar de asuntos confidenciales de la empresa fuera de ella?", respuesta_esperada: "No, existe deber de confidencialidad con la información empresarial.", expected_source: "CODIGO DE ETICA (Material visual).pdf", tipo: "sintetica" },
    { id: "etica_007", categoria: "Código Ética", pregunta: "¿Cuál es el canal para denunciar irregularidades éticas?", respuesta_esperada: "El canal ético o línea de denuncias establecida por la empresa.", expected_source: "CODIGO DE ETICA (Material visual).pdf", tipo: "sintetica" },
    { id: "etica_008", categoria: "Código Ética", pregunta: "¿Qué es un conflicto de intereses?", respuesta_esperada: "Cuando el interés personal de un empleado puede interferir con sus responsabilidades laborales.", expected_source: "CODIGO DE ETICA (Material visual).pdf", tipo: "sintetica" },
    { id: "etica_009", categoria: "Código Ética", pregunta: "¿Puede un empleado tener un negocio que compita con Plastitec?", respuesta_esperada: "No, eso representa un conflicto de intereses.", expected_source: "CODIGO DE ETICA (Material visual).pdf", tipo: "sintetica" },
    { id: "etica_010", categoria: "Código Ética", pregunta: "¿Qué es el soborno según el código de ética?", respuesta_esperada: "Ofrecer, dar, solicitar o recibir algo de valor para influir en decisiones.", expected_source: "CODIGO DE ETICA (Material visual).pdf", tipo: "sintetica" },

    // === SAGRILAFT ===
    { id: "sag_001", categoria: "SAGRILAFT", pregunta: "¿Cuál es el objetivo del SAGRILAFT?", respuesta_esperada: "Prevenir que la empresa sea utilizada para el lavado de activos o financiación del terrorismo.", expected_source: "CODIGO DE ETICA (Material visual).pdf", tipo: "sintetica" },
    { id: "sag_002", categoria: "SAGRILAFT", pregunta: "¿A quiénes aplica el SAGRILAFT en Plastitec?", respuesta_esperada: "A todos los empleados, directivos, contratistas y socios comerciales.", expected_source: "CODIGO DE ETICA (Material visual).pdf", tipo: "sintetica" },
    { id: "sag_003", categoria: "SAGRILAFT", pregunta: "¿Qué es el lavado de activos?", respuesta_esperada: "Proceso de ocultar el origen ilícito de dinero obtenido de actividades criminales.", expected_source: "CODIGO DE ETICA (Material visual).pdf", tipo: "sintetica" },
    { id: "sag_004", categoria: "SAGRILAFT", pregunta: "¿Qué debe hacer un empleado que detecta una operación sospechosa?", respuesta_esperada: "Reportarla inmediatamente al oficial de cumplimiento o a la gerencia.", expected_source: "CODIGO DE ETICA (Material visual).pdf", tipo: "sintetica" },
    { id: "sag_005", categoria: "SAGRILAFT", pregunta: "¿Qué información debe verificarse de los clientes según el SAGRILAFT?", respuesta_esperada: "Identidad, actividad económica y fuente de los recursos.", expected_source: "CODIGO DE ETICA (Material visual).pdf", tipo: "sintetica" },
    { id: "sag_006", categoria: "SAGRILAFT", pregunta: "¿Qué es la financiación del terrorismo?", respuesta_esperada: "Proveer fondos o recursos para apoyar actividades terroristas.", expected_source: "CODIGO DE ETICA (Material visual).pdf", tipo: "sintetica" },
    { id: "sag_007", categoria: "SAGRILAFT", pregunta: "¿Cuál es el rol del oficial de cumplimiento?", respuesta_esperada: "Supervisar y garantizar el cumplimiento de las políticas SAGRILAFT.", expected_source: "CODIGO DE ETICA (Material visual).pdf", tipo: "sintetica" },
    { id: "sag_008", categoria: "SAGRILAFT", pregunta: "¿Es obligatorio el conocimiento del cliente antes de iniciar una relación comercial?", respuesta_esperada: "Sí, es obligatorio el proceso de debida diligencia.", expected_source: "CODIGO DE ETICA (Material visual).pdf", tipo: "sintetica" },
    { id: "sag_009", categoria: "SAGRILAFT", pregunta: "¿Qué es una persona políticamente expuesta (PEP)?", respuesta_esperada: "Persona que desempeña o ha desempeñado funciones públicas prominentes.", expected_source: "CODIGO DE ETICA (Material visual).pdf", tipo: "sintetica" },
    { id: "sag_010", categoria: "SAGRILAFT", pregunta: "¿Puede Plastitec comerciar con empresas de países en listas de sanciones?", respuesta_esperada: "No, está prohibido.", expected_source: "CODIGO DE ETICA (Material visual).pdf", tipo: "sintetica" },

    // === Reglamento Interno ===
    { id: "rit_001", categoria: "Reglamento Interno", pregunta: "¿Cuál es la jornada laboral máxima según el reglamento?", respuesta_esperada: "La jornada ordinaria no puede exceder las 48 horas semanales.", expected_source: "RIT PLASTITEC 25 NOV 2025.pdf", tipo: "sintetica" },
    { id: "rit_002", categoria: "Reglamento Interno", pregunta: "¿Cuántos días de vacaciones tiene derecho un empleado?", respuesta_esperada: "15 días hábiles de vacaciones por año trabajado.", expected_source: "RIT PLASTITEC 25 NOV 2025.pdf", tipo: "sintetica" },
    { id: "rit_003", categoria: "Reglamento Interno", pregunta: "¿Qué es una falta grave según el reglamento?", respuesta_esperada: "Conductas como el hurto, la violencia o el incumplimiento reiterado pueden considerarse faltas graves.", expected_source: "RIT PLASTITEC 25 NOV 2025.pdf", tipo: "sintetica" },
    { id: "rit_004", categoria: "Reglamento Interno", pregunta: "¿Puede un empleado abandonar su puesto de trabajo sin autorización?", respuesta_esperada: "No, es causal de sanción disciplinaria.", expected_source: "RIT PLASTITEC 25 NOV 2025.pdf", tipo: "sintetica" },
    { id: "rit_005", categoria: "Reglamento Interno", pregunta: "¿Qué sucede si un empleado llega tarde reiteradamente?", respuesta_esperada: "Puede ser objeto de llamados de atención y sanciones disciplinarias.", expected_source: "RIT PLASTITEC 25 NOV 2025.pdf", tipo: "sintetica" },
    { id: "rit_006", categoria: "Reglamento Interno", pregunta: "¿Qué es el periodo de prueba?", respuesta_esperada: "Primeros dos meses del contrato, durante los cuales ambas partes pueden terminar el contrato.", expected_source: "RIT PLASTITEC 25 NOV 2025.pdf", tipo: "sintetica" },
    { id: "rit_007", categoria: "Reglamento Interno", pregunta: "¿Puede un empleado realizar otro trabajo mientras está en la empresa?", respuesta_esperada: "Puede hacerlo siempre que no genere conflicto de intereses ni afecte su rendimiento.", expected_source: "RIT PLASTITEC 25 NOV 2025.pdf", tipo: "sintetica" },
    { id: "rit_008", categoria: "Reglamento Interno", pregunta: "¿Cuántos días de incapacidad cubre la empresa directamente?", respuesta_esperada: "Los primeros 3 días de incapacidad los cubre el empleador.", expected_source: "RIT PLASTITEC 25 NOV 2025.pdf", tipo: "sintetica" },
    { id: "rit_009", categoria: "Reglamento Interno", pregunta: "¿Existe reglamento sobre el uso de redes sociales en horario laboral?", respuesta_esperada: "El uso de redes sociales en horario laboral debe estar enfocado en actividades de la empresa.", expected_source: "RIT PLASTITEC 25 NOV 2025.pdf", tipo: "sintetica" },
    { id: "rit_010", categoria: "Reglamento Interno", pregunta: "¿Cuál es el procedimiento para solicitar un permiso?", respuesta_esperada: "Solicitarlo al jefe inmediato con anticipación y justificación.", expected_source: "RIT PLASTITEC 25 NOV 2025.pdf", tipo: "sintetica" },

    // === Aprendices SENA ===
    { id: "sena_001", categoria: "Aprendices SENA", pregunta: "¿Qué es un contrato de aprendizaje?", respuesta_esperada: "Es una forma especial dentro del derecho laboral que permite a un aprendiz formarse en una empresa.", expected_source: "RIT PLASTITEC 25 NOV 2025.pdf", tipo: "sintetica" },
    { id: "sena_002", categoria: "Aprendices SENA", pregunta: "¿Cuánto se le paga al aprendiz SENA en etapa lectiva?", respuesta_esperada: "El 50% del salario mínimo mensual legal vigente.", expected_source: "RIT PLASTITEC 25 NOV 2025.pdf", tipo: "sintetica" },
    { id: "sena_003", categoria: "Aprendices SENA", pregunta: "¿Cuánto se le paga al aprendiz SENA en etapa productiva?", respuesta_esperada: "El 75% del salario mínimo mensual legal vigente.", expected_source: "RIT PLASTITEC 25 NOV 2025.pdf", tipo: "sintetica" },
    { id: "sena_004", categoria: "Aprendices SENA", pregunta: "¿El aprendiz tiene derecho a seguridad social?", respuesta_esperada: "Sí, debe estar afiliado a salud y ARL.", expected_source: "RIT PLASTITEC 25 NOV 2025.pdf", tipo: "sintetica" },
    { id: "sena_005", categoria: "Aprendices SENA", pregunta: "¿Puede la empresa terminar un contrato de aprendizaje antes de su vencimiento?", respuesta_esperada: "Sí, en casos de incumplimiento del reglamento o faltas graves.", expected_source: "RIT PLASTITEC 25 NOV 2025.pdf", tipo: "sintetica" },
    { id: "sena_006", categoria: "Aprendices SENA", pregunta: "¿Qué obligaciones tiene el aprendiz SENA?", respuesta_esperada: "Asistir a las capacitaciones, cumplir las funciones asignadas y respetar el reglamento.", expected_source: "RIT PLASTITEC 25 NOV 2025.pdf", tipo: "sintetica" },
    { id: "sena_007", categoria: "Aprendices SENA", pregunta: "¿Cuántos aprendices está obligada a tener la empresa?", respuesta_esperada: "Según la ley, un aprendiz por cada 20 trabajadores o fracción.", expected_source: "RIT PLASTITEC 25 NOV 2025.pdf", tipo: "sintetica" },
    { id: "sena_008", categoria: "Aprendices SENA", pregunta: "¿Puede un aprendiz SENA ser vinculado con contrato de trabajo normal?", respuesta_esperada: "No directamente; el contrato de aprendizaje no da lugar a prestaciones sociales.", expected_source: "RIT PLASTITEC 25 NOV 2025.pdf", tipo: "sintetica" },
    { id: "sena_009", categoria: "Aprendices SENA", pregunta: "¿El aprendiz tiene derecho a vacaciones?", respuesta_esperada: "No en el contrato de aprendizaje; recibe descansos según el cronograma académico.", expected_source: "RIT PLASTITEC 25 NOV 2025.pdf", tipo: "sintetica" },
    { id: "sena_010", categoria: "Aprendices SENA", pregunta: "¿Qué es la etapa lectiva en el contrato de aprendizaje?", respuesta_esperada: "Es la etapa en que el aprendiz se forma en la institución educativa.", expected_source: "RIT PLASTITEC 25 NOV 2025.pdf", tipo: "sintetica" },
];

async function generate() {
    const allQuestions = [...MANUAL_QUESTIONS, ...SYNTHETIC_QUESTIONS];
    
    console.log("=".repeat(60));
    console.log("🗃️  GENERADOR DE DATASET EMPRESARIAL — Fase 2.3A");
    console.log("=".repeat(60));
    console.log(`   Manual (30%):    ${MANUAL_QUESTIONS.length} preguntas históricas reales`);
    console.log(`   Sintéticas (70%): ${SYNTHETIC_QUESTIONS.length} preguntas por categoría`);
    console.log(`   Total generado:   ${allQuestions.length} preguntas`);
    
    // Estadísticas por categoría
    const cats = {};
    allQuestions.forEach(q => {
        cats[q.categoria] = (cats[q.categoria] || 0) + 1;
    });
    console.log("\n📊 Distribución por Categoría:");
    for (const [cat, count] of Object.entries(cats)) {
        console.log(`   ${cat.padEnd(20)} ${count} preguntas`);
    }
    
    await fs.mkdir(path.dirname(DATASET_FILE), { recursive: true });
    await fs.writeFile(DATASET_FILE, JSON.stringify(allQuestions, null, 2), 'utf8');
    
    console.log(`\n✅ Dataset guardado en: ${DATASET_FILE}`);
}

generate().catch(console.error);
