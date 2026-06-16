const fs = require('fs');

const questions = [
  // CATEGORÍA A: Válidas corporativas (15)
  { id: "A1", category: "A", query: "¿Qué es el PTEE?" },
  { id: "A2", category: "A", query: "¿Qué es COPASST?" },
  { id: "A3", category: "A", query: "¿Qué es SAGRILAFT?" },
  { id: "A4", category: "A", query: "¿Cómo debo lavarme las manos al ingresar a producción?" },
  { id: "A5", category: "A", query: "¿Cuándo y por qué debo usar la cofia?" },
  { id: "A6", category: "A", query: "¿Qué hacer ante un accidente laboral?" },
  { id: "A7", category: "A", query: "¿Cuál es la política corporativa sobre alcohol y drogas?" },
  { id: "A8", category: "A", query: "¿Qué restricciones hay sobre maquillaje y joyas en producción?" },
  { id: "A9", category: "A", query: "¿Cuál es el horario de trabajo establecido en el Reglamento Interno?" },
  { id: "A10", category: "A", query: "¿Qué obligaciones tiene el trabajador en Plastitec?" },
  { id: "A11", category: "A", query: "¿Cómo funciona el procedimiento de quejas y reclamos?" },
  { id: "A12", category: "A", query: "¿Cómo es el proceso de ingreso a áreas blancas o grises?" },
  { id: "A13", category: "A", query: "¿Qué lineamientos rigen el uso de dotación y equipo de protección personal?" },
  { id: "A14", category: "A", query: "¿Dónde y cómo debo reportar las incapacidades?" },
  { id: "A15", category: "A", query: "¿Cuáles son las medidas para prevenir el acoso sexual?" },

  // CATEGORÍA B: Parcialmente cubiertas (15)
  { id: "B1", category: "B", query: "Política de teletrabajo para área comercial." },
  { id: "B2", category: "B", query: "Beneficios para empleados administrativos." },
  { id: "B3", category: "B", query: "¿Cuáles son los beneficios extralegales para pasantes?" },
  { id: "B4", category: "B", query: "¿Existe un instructivo de lavado de manos con uso de jabones exfoliantes industriales?" },
  { id: "B5", category: "B", query: "¿Cuál es la política de alcohol y drogas para los conductores de distribución?" },
  { id: "B6", category: "B", query: "¿Existen bonos extra en caso de llegar temprano y no tener llegadas tarde en el año?" },
  { id: "B7", category: "B", query: "¿Puedo hacer horas extras como practicante universitario?" },
  { id: "B8", category: "B", query: "¿Hay un procedimiento especial de acoso laboral si el agresor es un cliente externo?" },
  { id: "B9", category: "B", query: "¿Cuál es el protocolo de seguridad de datos para desarrolladores web?" },
  { id: "B10", category: "B", query: "¿La política antisoborno aplica también para pagos en criptomonedas?" },
  { id: "B11", category: "B", query: "¿Cómo funciona el permiso de paternidad extendida o compartida?" },
  { id: "B12", category: "B", query: "¿Existe un programa de pausas activas exclusivo para personal de oficinas?" },
  { id: "B13", category: "B", query: "¿Cuáles son los requisitos de ingreso para ingenieros junior?" },
  { id: "B14", category: "B", query: "¿La empresa paga el plan telefónico para el teletrabajo?" },
  { id: "B15", category: "B", query: "Procedimiento SST para visitantes extranjeros." },

  // CATEGORÍA C: Inexistentes (15)
  { id: "C1", category: "C", query: "¿Cuál es el reglamento vigente para el uso de drones corporativos?" },
  { id: "C2", category: "C", query: "¿Qué beneficios de salud y pensión tienen los empleados ubicados en España?" },
  { id: "C3", category: "C", query: "¿Cuánto es el subsidio internacional para expatriados en Plastitec?" },
  { id: "C4", category: "C", query: "¿Cuál es la política de viáticos para viajes frecuentes a Europa?" },
  { id: "C5", category: "C", query: "¿Es posible realizar trabajo remoto permanente viviendo en Argentina?" },
  { id: "C6", category: "C", query: "¿Cómo configurar el sistema SAP HANA para la gestión de inventarios?" },
  { id: "C7", category: "C", query: "¿Cuál es el menú del día ofrecido en la cafetería ejecutiva?" },
  { id: "C8", category: "C", query: "¿Cuántos días de vacaciones me corresponden según la ley francesa de trabajo?" },
  { id: "C9", category: "C", query: "¿Dónde está ubicado el simulador de vuelo para el entrenamiento de pilotos?" },
  { id: "C10", category: "C", query: "¿Cuál es el costo del deducible del seguro de automóviles Porsche asignado a directivos?" },
  { id: "C11", category: "C", query: "¿Qué pasos debo seguir para apadrinar un pingüino en el programa de RSE Antártico?" },
  { id: "C12", category: "C", query: "¿Cómo me inscribo al campeonato oficial de Polo de la empresa?" },
  { id: "C13", category: "C", query: "¿Cuál es el protocolo de seguridad para trabajar en plataformas petroleras marinas?" },
  { id: "C14", category: "C", query: "¿Qué documentación necesito para tramitar mi visa diplomática?" },
  { id: "C15", category: "C", query: "¿Cuáles son las cuotas del club de yates para ejecutivos?" },

  // CATEGORÍA D: Sinónimos (10)
  { id: "D1", category: "D", query: "¿Cómo solicito home office?" },
  { id: "D2", category: "D", query: "Reglas para hacer trabajo remoto." },
  { id: "D3", category: "D", query: "Procedimiento para faltar por enfermedad." },
  { id: "D4", category: "D", query: "Protocolo de vestimenta en la planta." },
  { id: "D5", category: "D", query: "Reglamento para la higiene en empaque." },
  { id: "D6", category: "D", query: "¿Dónde queda la sala de primeros auxilios?" },
  { id: "D7", category: "D", query: "¿A quién le aviso si me accidento?" },
  { id: "D8", category: "D", query: "Reglas contra sobornos y lavado de dinero." },
  { id: "D9", category: "D", query: "Sanciones por llegar tarde al trabajo." },
  { id: "D10", category: "D", query: "Reglas para el período de prueba." },

  // CATEGORÍA E: Acrónimos (10)
  { id: "E1", category: "E", query: "¿Qué es el PTEE?" },
  { id: "E2", category: "E", query: "¿Qué significa SST?" },
  { id: "E3", category: "E", query: "¿Cuáles son las BPM de empaque?" },
  { id: "E4", category: "E", query: "¿Quiénes conforman el COPASST?" },
  { id: "E5", category: "E", query: "Funciones del comité de SAGRILAFT." },
  { id: "E6", category: "E", query: "Procedimientos SG-SST." },
  { id: "E7", category: "E", query: "¿Qué estipula el RIT?" },
  { id: "E8", category: "E", query: "Permisos para estudios en el SENA." },
  { id: "E9", category: "E", query: "Información sobre OEA." },
  { id: "E10", category: "E", query: "Reporte de ARL." },

  // CATEGORÍA F: Consultas conversacionales largas (10)
  { id: "F1", category: "F", query: "Hola, fíjate que ayer me resbalé en el pasillo de empaque y me duele un poco el tobillo, pero no avisé. Quería saber si hoy todavía puedo ir a la enfermería o qué pasos debo seguir según el protocolo." },
  { id: "F2", category: "F", query: "Estoy pensando en solicitar unos días para hacer unas gestiones personales la próxima semana, quería consultar en qué parte del reglamento interno dice con cuánta anticipación debo pasar el formato y si esos días me los descuentan." },
  { id: "F3", category: "F", query: "Ayer me entregaron mi dotación nueva pero la bata me quedó grande y las botas me aprietan. ¿Cómo es el proceso correcto para pedir un cambio de talla sin que me vayan a regañar?" },
  { id: "F4", category: "F", query: "Quería preguntar si es obligatorio usar la cofia si tengo el cabello muy corto, casi rapado, porque siento que sudo mucho en el área gris y quería saber si hay alguna excepción en las buenas prácticas de manufactura." },
  { id: "F5", category: "F", query: "Un proveedor me acaba de escribir ofreciéndome un porcentaje de descuento personal si le aprobamos el contrato. Sé que esto va en contra de nuestras políticas pero quería leer exactamente qué dice el manual de ética al respecto para poder rechazarlo adecuadamente." },
  { id: "F6", category: "F", query: "El mes pasado tuve varias faltas injustificadas y llegadas tarde porque tuve problemas con el transporte. Quería saber cuáles son las consecuencias disciplinarias exactas que me pueden aplicar según el reglamento de la empresa." },
  { id: "F7", category: "F", query: "Mi compañero de área constantemente me hace comentarios inapropiados sobre mi apariencia física y ya me siento muy incómoda. ¿Qué comité o área se encarga de revisar estos casos de acoso sexual y cómo inicio un proceso formal?" },
  { id: "F8", category: "F", query: "Voy a tener a mi primer hijo el próximo mes y quería averiguar exactamente cuántos días de licencia de maternidad me corresponden y qué documentos debo traerle a recursos humanos para hacer efectivo el trámite." },
  { id: "F9", category: "F", query: "Quiero saber si la empresa cuenta con algún programa de apoyo económico o becas para empleados que quieran empezar a estudiar una carrera profesional de noche." },
  { id: "F10", category: "F", query: "Me pidieron firmar un documento de confidencialidad porque voy a entrar a un área nueva donde se manejan las fórmulas de los productos, pero quería revisar la política de protección de información confidencial antes de firmarlo." },

  // CATEGORÍA G: Preguntas ambiguas (10)
  { id: "G1", category: "G", query: "¿Cuáles son los beneficios?" },
  { id: "G2", category: "G", query: "¿Cuál es la política?" },
  { id: "G3", category: "G", query: "Quiero información sobre permisos." },
  { id: "G4", category: "G", query: "¿Qué hago con esto?" },
  { id: "G5", category: "G", query: "Procedimientos de seguridad." },
  { id: "G6", category: "G", query: "Información de dotación." },
  { id: "G7", category: "G", query: "Horarios." },
  { id: "G8", category: "G", query: "Reglas de higiene." },
  { id: "G9", category: "G", query: "Incapacidades." },
  { id: "G10", category: "G", query: "Contratos de trabajo." },

  // CATEGORÍA H: Errores ortográficos (10)
  { id: "H1", category: "H", query: "¿Qué es el Copast?" },
  { id: "H2", category: "H", query: "Informacion de Sagrilaf." },
  { id: "H3", category: "H", query: "Política de teletrabjo o teletreabajo." },
  { id: "H4", category: "H", query: "¿Como me labo las manos?" },
  { id: "H5", category: "H", query: "¿Uso de cojia o cofia?" },
  { id: "H6", category: "H", query: "Reglamentto inttrno." },
  { id: "H7", category: "H", query: "Quejas y reclammos." },
  { id: "H8", category: "H", query: "Acidentes lavorales." },
  { id: "H9", category: "H", query: "Lisencia de paternida." },
  { id: "H10", category: "H", query: "Bbuenas practicas manufctura." },

  // CATEGORÍA I: Preguntas multi-intención (5)
  { id: "I1", category: "I", query: "¿Qué es COPASST y quién lo conforma?" },
  { id: "I2", category: "I", query: "¿Qué es SST y cuáles son las responsabilidades del trabajador?" },
  { id: "I3", category: "I", query: "¿Cuál es el horario de trabajo y qué pasa si llego tarde tres veces seguidas?" },
  { id: "I4", category: "I", query: "¿Cómo pido vacaciones y cuánto me pagan por la prima de navidad?" },
  { id: "I5", category: "I", query: "¿Qué hago en caso de accidente laboral y cuántos días me dan de incapacidad?" }
];

fs.writeFileSync('c:\\AIV2\\scratch\\benchmark_100.json', JSON.stringify(questions, null, 2));
console.log("benchmark_100.json creado exitosamente con 100 preguntas.");
