# Informe de pruebas: preguntas generadas con distintos estilos

**Fecha:** 13 de octubre de 2026
**Sistema probado:** código actual, con qwen2.5 7B Instruct (modo chat, contexto 8192), embeddings bge-m3 y colección `plastitec_docs_bge`. Ya incluye la corrección del 9 de octubre a la regla que descartaba respuestas ("No encontré…").
**Entorno:** servidor de prueba en el puerto 3998, con la misma configuración que el `.env`. Producción no se tocó.

## 1. Resumen

| Indicador | Resultado |
|---|---|
| Preguntas probadas | 90 |
| Preguntas que el sistema debía responder | 76 |
| — respondidas correctamente | **34 (45 %)** |
| — correctas pero incompletas | 8 (11 %) |
| — respondidas con un dato falso | 13 (17 %) |
| — sin respuesta, aunque el dato existe | 21 (28 %) |
| Preguntas que el sistema debía rechazar (fuera de tema o dato inexistente) | 14 |
| — rechazadas bien, sin inventar | **14 (100 %)** |
| Errores técnicos | 0 |
| Tiempo de respuesta | mediana 29,6 s; p90 38,0 s; máximo 57,7 s |

**Conclusión:**
- El sistema es **seguro**: no inventó respuestas para preguntas fuera de tema ni para datos que no existen.
- Responde bien las preguntas **formales o en tercera persona**: 88 % y 67 % de aciertos.
- Falla mucho cuando la persona **habla como habla en planta**: con jerga acierta el 20 %, al describir una situación sin nombrar el tema el 17 %, y al preguntar por otra persona el 25 %.
- En la mayoría de esos casos el fallo **no es del modelo que redacta, sino de la búsqueda**: el fragmento correcto nunca le llega al modelo.

## 2. Cómo se hizo la prueba

1. **Banco de preguntas.** Un agente leyó los 10 documentos de RRHH y redactó 90 preguntas nuevas. Cada una trae la respuesta esperada, el artículo o sección de origen y fragmentos literales del documento que sirven de prueba. Las 9 preguntas sugeridas de la interfaz, ya probadas antes, se excluyeron.
2. **Estilos.** Las preguntas se repartieron así:

   | Estilo | N | Ejemplo |
   |---|---|---|
   | Primera persona | 15 | "Voy a ser papá el mes que viene, ¿cuántas semanas de licencia me dan y qué papel necesito?" |
   | Tercera persona | 12 | "¿Cuánto le dan de apoyo de sostenimiento a un aprendiz del SENA?" |
   | Sobre alguien | 12 | "Mi compañero llegó oliendo a trago al turno de hoy, ¿qué le puede pasar?" |
   | Jerga colombiana | 15 | "Parce, si llego todavía prendido de la rumba del sábado, ¿me pueden mandar pa' la casa o echarme?" |
   | Formal | 8 | Preguntas con el vocabulario del reglamento |
   | Coloquial con errores | 8 | "kiero saber si los aprendices del sena pueden estar en el comite de convivencia o el copasst" |
   | Indirecta | 6 | "Se murió mi suegra el fin de semana, ¿tengo que ir a trabajar el lunes?" |
   | Fuera de tema | 7 | Receta de bandeja paisa, fútbol, salario de una persona |
   | Dato inexistente | 7 | Monto de la bonificación de diciembre, parqueadero de motos |

3. **Ejecución.** Cada pregunta se envió por separado (`POST /api/query`), sin caché y sin historial, igual que en la nueva interfaz de pregunta y respuesta.
4. **Calificación.** Otro agente comparó cada respuesta contra el documento fuente, no solo contra la respuesta esperada. Verifiqué a mano una muestra contra el RIT, por ejemplo el artículo 33 (hora extra nocturna = 75 %) y el artículo 101-V (celular, segunda vez = suspensión de hasta 2 días); la calificación coincidió.
5. **Diagnóstico de causa.** Para cada pregunta se revisó si el fragmento correcto llegó al contexto que vio el modelo. Así se separan dos tipos de fallo: la búsqueda no lo encontró, o el modelo lo tenía y lo leyó mal.

## 3. Resultados por estilo

\* Aciertos = correctas + rechazos correctos, sobre el total del estilo.

| Estilo | N | Correcto | Parcial | Incorrecto | No respondió | Rechazo correcto | Aciertos* |
|---|---|---|---|---|---|---|---|
| formal | 8 | 7 | 1 | 0 | 0 | 0 | 88% |
| tercera_persona | 12 | 8 | 2 | 2 | 0 | 0 | 67% |
| primera_persona | 15 | 9 | 1 | 2 | 3 | 0 | 60% |
| coloquial_errores | 8 | 3 | 2 | 1 | 2 | 0 | 38% |
| sobre_alguien | 12 | 3 | 1 | 3 | 5 | 0 | 25% |
| indirecta | 6 | 1 | 0 | 2 | 3 | 0 | 17% |
| jerga | 15 | 3 | 1 | 3 | 8 | 0 | 20% |
| fuera_de_alcance | 7 | 0 | 0 | 0 | 0 | 7 | 100% |
| dato_inexistente | 7 | 0 | 0 | 0 | 0 | 7 | 100% |


## 4. ¿Dónde falla? Búsqueda frente a modelo

De las 76 preguntas que debían responderse:

| ¿Llegó el fragmento correcto al modelo? | N | Correcto | Parcial | Incorrecto | No respondió |
|---|---|---|---|---|---|
| Sí | 51 | 33 | 5 | 10 | 3 |
| No, la búsqueda trajo otros fragmentos | 18 | 1 | 3 | 3 | 11 |
| No, un filtro la rechazó antes de buscar | 7 | 0 | 0 | 0 | 7 |

- **25 de las 42 fallas (60 %) son de búsqueda o de filtros.** El modelo nunca vio la respuesta.
- **13 fallas son del modelo:** tenía el fragmento correcto y lo leyó mal o se abstuvo.
- Cuando el fragmento llega, el modelo acierta 33 de 51 veces (65 %) y responde de forma útil, contando las parciales, el 75 %.

## 5. Causas principales, con ejemplos

### 5.1 Filtros previos al modelo rechazan preguntas válidas (7 casos)
Antes de llamar al modelo, el sistema aplica dos filtros, ambos en `services/ragService.js` alrededor de la línea 620:
- **Confianza mínima de 0,20.** Rechazó 4 preguntas que tenían respuesta, por ejemplo:
  - Q09: "Si no estoy de acuerdo con la sanción que me pusieron, ¿cómo la puedo…?" (confianza 0,194).
  - Q48: "¿es obligación ser sapo y avisar?" de un robo (0,197).
  - Q53: "Me pegué un totazo con la máquina pero fue una bobadita…" (0,192).
- **Señal de tema de RRHH.** Exige una palabra de un vocabulario fijo. Q64, "cuanto dura la licensia de maternida", fue rechazada aunque la búsqueda **sí trajo el artículo 47** en las primeras posiciones:
  - "licensia" no se corrige a "licencia";
  - "maternidad" no está en el vocabulario.

Ambos umbrales se calibraron con el modelo de embeddings anterior (mxbai). Subir o bajar el corte de similitud por sí solo no resuelve el problema: "¿Cómo saco el certificado de antecedentes judiciales…?", que está fuera de tema, obtuvo **más** similitud (0,46) que "licencia de maternidad" (0,42).

### 5.2 La búsqueda no trae el artículo correcto (18 casos)
Pasa sobre todo con jerga, preguntas sobre otra persona y preguntas indirectas:
- **Q71** "Se murió mi suegra…": no llega el art. 47 num. 7 (luto). El modelo respondió con el art. 35 (días festivos), y la calificación es incorrecta.
- **Q28** "Mi compañero llegó oliendo a trago…" y **Q40** "si llego todavía prendido de la rumba…": no llegan las prohibiciones y faltas de los artículos 80 y 102. Q28 no usa jerga y también falla, así que la jerga no es la única causa.
- **Q32** "Mi esposa… quedó embarazada, ¿la pueden despedir?": no llega el fuero de maternidad (art. 146).

Los apartados que más fallan son:
- los numerales del **artículo 47**: luto, licencia escolar, maternidad y paternidad;
- las listas largas de los **artículos 77–81 y 102**: obligaciones, prohibiciones y faltas graves.

Son fragmentos con muchos temas mezclados en uno solo. Por eso su vector "promedio" no se parece a ninguna pregunta concreta.

### 5.3 El modelo lee mal un dato que sí tenía (10 incorrectas)
- **Q46** hora extra nocturna: respondió 35 %. El art. 33 dice **75 %**; el 35 % corresponde al recargo nocturno ordinario.
- **Q52** celular en la jornada, segunda vez: respondió "suspensión hasta 8 días". El art. 101-V dice **hasta 2 días**; los 8 días corresponden al numeral VI, que viene justo después.
- **Q43** retardos: respondió "suspensión de 3 días la segunda vez". Según el RIT, la segunda vez es llamado escrito y la suspensión llega la cuarta vez.
- **Q20** aprendiz SENA: dio el porcentaje equivocado del apoyo de sostenimiento. El art. 10 dice 75 %; el 100 % es para universitarios.
- **Q06** licencia de paternidad: pidió un certificado médico, que es el requisito de la lactancia, en vez del Registro Civil.
- **Q25** visitantes: les aplicó las reglas de vestimenta de los operarios.
- **Q70**: dijo que el documento no menciona el Comité de Convivencia, aunque el art. 21 parágrafo 3 estaba en el contexto.

El patrón común son **escalas numéricas con varios numerales seguidos**: el modelo de 7B mezcla filas vecinas.

### 5.4 El modelo se abstiene teniendo el dato (3 casos)
- **Q41** "Si me abro de la empresa porque conseguí otro camello…": el art. 4 (preaviso de 30 días) estaba en el contexto.
- **Q47** "Mi cucha se puso muy mal y me toca llevarla de urgencias…": el art. 46 (calamidad doméstica) estaba en el contexto.
- **Q65** "se puede entrar maquillada al area blanca??": I-RH-011 dice literalmente "No ingresar con ningún tipo de maquillaje".

En Q41 y Q47 la regla de jerga **sí se activó**: tradujo "me abro" como renuncia y "mi cucha… urgencias" como calamidad doméstica. Aun así, el modelo prefirió decir "no hay información". Es exceso de cautela del modelo, no un problema de comprensión de la jerga.

### 5.5 Otros hallazgos menores
- **Q29** acoso de un jefe: lo encaminó por el procedimiento de acoso **sexual** (art. 139) y no por el Comité de Convivencia (art. 136).
- **Filtro de privacidad demasiado amplio:** respondió "No puedo proporcionar información confidencial sobre salarios" a preguntas normativas, como Q84 sobre la bonificación de diciembre y Q88 sobre el pago de incapacidad. El rechazo era correcto porque el dato no existe, pero el mensaje confunde.
- **Q45** "tintico / mecato": la respuesta era correcta, pero le agregó "No encontré información sobre «tintico»".
- **Q37:** devolvió solo "Confirma con Recursos Humanos…", sin contenido.
- **Información que no viene al caso** en 6 respuestas.

## 6. Lo que funciona bien
- **Cero respuestas inventadas** en preguntas fuera de tema o con datos inexistentes, por ejemplo:
  - receta, fútbol, carta de amor, salario de una persona con nombre propio;
  - monto de la bonificación, parqueadero, día de cumpleaños.
- **Preguntas formales y en tercera persona:** cuando usan el vocabulario del reglamento, el sistema acierta casi siempre.
- **Respuestas correctas con cita del artículo,** por ejemplo:
  - vacaciones (art. 39 y 40), licencia por luto con la pregunta directa;
  - lavado de manos, ingreso a áreas, celular.
- **Estabilidad:** no hubo errores técnicos en 90 consultas seguidas.

## 7. Recomendaciones (en orden de impacto)

| # | Acción | Fallas que ataca | Esfuerzo |
|---|---|---|---|
| 1 | **Partir los artículos largos en un fragmento por numeral** (art. 47 licencias, arts. 77–81 y 101–102 faltas y sanciones). Cada fragmento lleva el título del artículo y el del numeral. Requiere reingesta en una colección nueva. | 5.2 y gran parte de 5.3 (escalas mezcladas) | Medio |
| 2 | **Ampliar el vocabulario de RRHH** del filtro temático: maternidad, paternidad, embarazo, lactancia, biométrico, proveedor, robo, hurto, preaviso, etc. Corregir "licensia" → "licencia". | 5.1, filtro temático | Bajo |
| 3 | **Recalibrar la confianza mínima (0,20) para bge-m3**, o dejar decidir al modelo cuando la confianza está entre 0,15 y 0,20 y la búsqueda trae un artículo del RIT. Hay que medirlo con este mismo banco y las preguntas fuera de tema. | 5.1, confianza | Bajo |
| 4 | **Ampliar las reglas de jerga** a las expresiones que hoy no reconoce: "sapo/avisar", "totazo", "trago/oliendo a", "robando". Agregar como expansión los términos exactos del RIT. | 5.2 y 5.1 en preguntas con jerga | Bajo |
| 4b | **Reducir la abstención del modelo** cuando el contexto trae un artículo del tema que señaló la regla de jerga: Q41, Q47 y Q65. Se haría con una instrucción en el prompt o con un rescate como el B3. | 5.4 | Bajo |
| 5 | **Probar el reranker multilingüe bge-reranker-v2-m3**, que está pendiente desde la elección de modelos. Reordena los fragmentos según la pregunta completa y no solo por su vector. | 5.2 | Medio |
| 6 | **Ajustar el mensaje del filtro de privacidad:** que no diga "confidencial" cuando la pregunta es sobre una norma y no sobre una persona. | 5.5 | Bajo |

La recomendación 1 es la de mayor impacto: sola ataca la mayoría de las fallas de búsqueda y también las de escalas mezcladas. Las recomendaciones 2, 3, 4, 4b y 6 son cambios pequeños y se pueden verificar con este mismo banco de 90 preguntas en unos 45 minutos.

## 8. Vacíos de contenido en los documentos (para RRHH)
El agente que redactó las preguntas encontró temas que los trabajadores preguntarían y que los documentos no responden o responden de forma contradictoria:
- **Pago de incapacidad:** ningún documento dice quién paga los primeros días ni en qué porcentaje.
- **Calamidad doméstica (art. 46):** dice que se concede, pero no por cuántos días.
- **Quincena:** el RIT (art. 54) dice que el pago es mensual, mientras I-RH-001 menciona "pago de nómina anticipada" sin explicar.
- **Plazo para apelar una sanción, contradictorio:** el art. 97 da 2 días hábiles y el art. 99 da 3.
- **Fechas de dotación, contradictorias:** el art. 58 dice 30 de abril, 30 de agosto y 30 de diciembre; su parágrafo 2 dice 30 de abril, 31 de agosto y 20 de diciembre.
- **Regalos:** el art. 91 habla de "valor simbólico determinado por la empresa" sin cifra, y el Código de Ética no tiene regla de regalos ni canal de denuncia.
- **Beneficios de I-RH-001** (bonificación, auxilio de gafas, alimentación, libranzas): solo se nombran, sin montos ni pasos.
- **Temas sin documento:** día de cumpleaños, ruta de bus, parqueadero, horarios de turnos operativos, fechas de prima y cesantías, tatuajes o piercings, cómo pedir un certificado laboral o un desprendible.
- **Sigue pendiente:** el RIT conserva las tablas de HORARIO UNO/DOS derogadas.

## 9. Archivos de la prueba
- Banco de preguntas: `scratch/gen_questions_2026-10-13.json`
- Respuestas obtenidas: `scratch/gen_results_2026-10-13.json`; log del servidor en `scratch/gen_run_2026-10-13.log`
- Calificación: `scratch/gen_grades_2026-10-13.json`
- Revisión de la búsqueda: `scratch/gen_retrieval_2026-10-13.json`
- Para repetir la prueba: `powershell -ExecutionPolicy Bypass -File scratch\gen_run_2026-10-13.ps1`. Borra antes `scratch/gen_results_2026-10-13.json`, porque el ejecutor salta las preguntas ya respondidas.

## Anexo: detalle por pregunta

| ID | Estilo | Pregunta | Veredicto | Fragmento correcto en contexto | Motivo |
|---|---|---|---|---|---|
| Q01 | primera_persona | Si me enfermo y no puedo ir a trabajar, ¿a quién le tengo que avisar y qué tengo que llevar cuando vuelva? | INCORRECTO | sí | Solo cita Art. 61 (avisar al empleador) y afirma que no se menciona qué llevar al volver, lo cual es falso: el Art. 49 exige informar al jefe inmediato y presentar los soportes ante RRHH. El Art. 49 no llegó al contexto. |
| Q02 | primera_persona | ¿Me pueden pagar en plata la mitad de mis vacaciones en vez de descansarlas? | CORRECTO | sí | Art. 42: acuerdo escrito para compensar en dinero hasta la mitad de las vacaciones. Correcto. |
| Q03 | primera_persona | ¿Puedo guardar las vacaciones que no me tomé este año y juntarlas con las del otro? | CORRECTO | sí | Art. 43: acumulación hasta 2 años y hasta 4 para técnicos, de confianza o extranjeros. Correcto. |
| Q04 | primera_persona | Tengo cita con el especialista la otra semana, ¿qué tengo que presentar para que me den el permiso? | CORRECTO | sí | Art. 47 num. 8: constancia de agendamiento con 5 días hábiles de anticipación y comprobante con recibo del copago. Correcto; omite que no se da el día completo. |
| Q05 | primera_persona | Me llegó una citación de un juzgado para una audiencia, ¿me dan permiso para ir o me toca pedir el día? | CORRECTO | sí | Art. 47 num. 10: licencia por el tiempo estrictamente necesario y citación con 5 días hábiles de antelación. Omite la constancia de asistencia posterior (omisión menor). |
| Q06 | primera_persona | Voy a ser papá el mes que viene, ¿cuántas semanas de licencia me dan y qué papel necesito? | INCORRECTO | sí | Las 2 semanas son correctas, pero como soporte inventa un 'certificado médico para los 30 minutos de descanso' (eso es de lactancia) en lugar del Registro Civil de Nacimiento ante la EPS dentro de 30 días (Art. 47 num. 5). |
| Q07 | primera_persona | Si llego 5 minutos tarde por primera vez, ¿qué sanción me ponen? | CORRECTO | sí | Art. 101 A.I: primera vez, llamado de atención verbal con registro en hoja de vida. Correcto. |
| Q08 | primera_persona | Me citaron a descargos, ¿puedo ir acompañado de alguien? | CORRECTO | sí | Art. 97: hasta dos representantes sindicales o dos compañeros. Correcto. |
| Q09 | primera_persona | Si no estoy de acuerdo con la sanción que me pusieron, ¿cómo la puedo apelar y en cuánto tiempo? | NO_RESPONDIO | rechazada antes de buscar | Rechazo por falta de contexto, aunque los Arts. 97 (reposición ante RRHH y apelación ante el Gerente General, 2 días hábiles) y 99 (3 días hábiles) lo regulan. |
| Q10 | primera_persona | ¿En qué fechas me entregan la dotación de trabajo? | PARCIAL | sí | Da las fechas del Art. 58 (30 abr, 30 ago, 30 dic), pero omite el Parágrafo 2 de la Convención Colectiva 2026-2028 (a más tardar 30 abr, 31 ago y 20 dic) y los requisitos (hasta 2 SMMLV y más de 3 meses). |
| Q11 | primera_persona | Estoy embarazada, ¿tengo derecho a más descansos durante la jornada? | CORRECTO | sí | Art. 23 (22.2): dos descansos de 25 minutos exactos. Correcto. |
| Q12 | primera_persona | Si me toca trabajar un domingo o un festivo, ¿cuánto recargo me pagan ahora? | CORRECTO | sí | Art. 35: 90% desde el 1 de julio de 2026. Correcto. |
| Q13 | primera_persona | Quiero usar ChatGPT para hacer mis informes del trabajo, ¿lo puedo hacer? | NO_RESPONDIO | no | El Art. 79 num. 34 regula el uso de IA generativa (autorización previa, no ingresar información confidencial, declararlo en el documento), pero no se recuperó. |
| Q14 | primera_persona | ¿Puedo lavar el uniforme en mi casa? ¿Cómo lo tengo que hacer? | CORRECTO | sí | BPM, lavado de uniformes en casa: separado, hipoclorito 10 min, secado, planchado y tula con bolsa. Completo. |
| Q15 | primera_persona | Me dio dolor de cabeza en pleno turno, ¿dónde consigo una pastilla? | NO_RESPONDIO | no | I-RH-004 (Manejo de Botiquín) dice que los botiquines no tienen medicamentos y que RRHH solo suministra acetaminofén. No se recuperó. |
| Q16 | tercera_persona | ¿Un trabajador de Plastitec puede tener un negocio propio que le haga competencia a la empresa? | PARCIAL | sí | Identifica bien el conflicto de intereses (Art. 91), pero omite el deber de informarlo de inmediato y por escrito a Gerencia/RRHH y que la omisión es falta grave (Art. 92). |
| Q17 | tercera_persona | ¿Qué uniforme deben usar los operarios que trabajan en áreas grises? | CORRECTO | sí | Uniforme azul oscuro de manga larga con cofia y guantes blancos. Correcto. |
| Q18 | tercera_persona | ¿Los hombres que trabajan en producción pueden tener barba o bigote? | CORRECTO | sí | BPM prohíbe barba, bigote y patillas. Correcto; la salvedad final es innecesaria pero no es falsa. |
| Q19 | tercera_persona | ¿Qué beneficios tienen los empleados de Plastitec aparte del sueldo? | CORRECTO | sí | La lista coincide con los beneficios del I-RH-001; omite algunos (calamidades remuneradas, nómina anticipada, regalos para hijos), lo cual es menor. |
| Q20 | tercera_persona | ¿Cuánto le dan de apoyo de sostenimiento a un aprendiz del SENA? | INCORRECTO | sí | Afirma que no se especifica el porcentaje de la fase lectiva y que no puede ser inferior al 100%. Es falso: el Art. 10 fija el 75% en fase lectiva y en el primer año dual; el 100% mínimo es para universitarios. El dato estaba en el contexto. |
| Q21 | tercera_persona | ¿Cuántas horas extras puede trabajar como máximo un empleado? | CORRECTO | sí | Art. 31: 2 horas diarias y 12 semanales. Correcto. |
| Q22 | tercera_persona | ¿Las trabajadoras que están lactando tienen derecho a algún permiso para alimentar al bebé? | CORRECTO | sí | Art. 47 num. 4: dos descansos de 30 min los primeros 6 meses y luego uno hasta los 2 años. Omite la sala de lactancia (menor). |
| Q23 | tercera_persona | ¿Cada cuánto se reúne el Comité de Convivencia Laboral y cuánto duran sus miembros? | CORRECTO | sí | Arts. 134-135: reunión mensual y período de 2 años. Correcto. |
| Q24 | tercera_persona | ¿Un empleado puede subir a sus redes sociales fotos de la planta o de las máquinas? | PARCIAL | sí | Lo presenta como algo que 'podría' violar la confidencialidad, cuando el Art. 89 califica expresamente como falta grave publicar fotografías de áreas de producción o instalaciones sin autorización. |
| Q25 | tercera_persona | ¿Los visitantes que entran a la Planta 2 se tienen que quitar la ropa de calle? | INCORRECTO | sí | Aplica a los visitantes el procedimiento de los operarios (quitarse la ropa de calle y dejarla en el locker). I-RH-006 dice que los visitantes que no manipulan producto pueden conservar la ropa de calle bajo el overol y las polainas. |
| Q26 | tercera_persona | ¿Qué hacen los operarios del área gris con los zapatos y la ropa de calle antes de entrar, y qué se quitan al salir? | CORRECTO | sí | I-RH-009: ropa y joyas al locker, zapatos en bolsa plástica; al salir se retira el uniforme pero no la cofia. Correcto. |
| Q27 | tercera_persona | ¿Ante quién debe presentar un trabajador un reclamo sobre su trabajo? | CORRECTO | sí | Art. 124/125: Jefe o director de área, o RRHH a elección del trabajador. 'Verbal o escrito' coincide con el Art. 125, aunque el Art. 103 dice 'siempre por escrito' (inconsistencia del documento). |
| Q28 | sobre_alguien | Mi compañero llegó oliendo a trago al turno de hoy, ¿qué le puede pasar? | NO_RESPONDIO | no | Los Arts. 81 num. 2 y 102 prohíben presentarse en estado de embriaguez y lo califican como falta grave. No se recuperó. |
| Q29 | sobre_alguien | Mi jefe me grita y me humilla delante de todos mis compañeros, ¿eso cuenta como acoso laboral? ¿qué hago? | INCORRECTO | sí | Identifica bien la conducta como acoso (Art. 128), pero remite al procedimiento del Art. 139 (denuncias de acoso sexual ante el superior jerárquico) en lugar de la queja ante el Comité de Convivencia Laboral (Art. 136). |
| Q30 | sobre_alguien | Un supervisor le manda mensajes con contenido sexual a una compañera, ¿dónde se puede denunciar? | CORRECTO | sí | Art. 139: denuncia verbal o escrita, a nombre propio o de un tercero, ante el superior jerárquico, con confidencialidad. Correcto. |
| Q31 | sobre_alguien | Mi compañera de compras es novia de un proveedor de la empresa, ¿ella tiene que avisar algo? | NO_RESPONDIO | rechazada antes de buscar | Los Arts. 91-92 tratan las relaciones de afinidad con proveedores como conflicto de intereses que debe reportarse por escrito. Rechazo sin contexto. |
| Q32 | sobre_alguien | Mi esposa trabaja en Plastitec y quedó embarazada, ¿la pueden despedir? | INCORRECTO | no | Cita el Art. 81 (ausentarse sin permiso), que no aplica, y dice que no se menciona el despido en embarazo, cuando el Art. 146 regula el fuero de maternidad (y el de paternidad del esposo) y el Art. 77 num. 12 obliga a conservar el puesto. |
| Q33 | sobre_alguien | Vi que un compañero marcó el biométrico por otro que todavía no había llegado, ¿eso tiene consecuencias? | NO_RESPONDIO | rechazada antes de buscar | El Art. 78 num. 7 dice que el registro biométrico es personal e intransferible y que la marcación por terceros es falta. Rechazo sin contexto. |
| Q34 | sobre_alguien | Mi compañero se torció el tobillo jugando fútbol en su barrio, ¿eso lo atiende la ARL? | NO_RESPONDIO | rechazada antes de buscar | I-RH-004 distingue el accidente común (EPS) del accidente de trabajo (ARL). Rechazo sin contexto. |
| Q35 | sobre_alguien | Murió un compañero de la planta y mi jefe no nos quiere dar permiso para ir al entierro, ¿puede negarlo? | PARCIAL | sí | Cita bien el Art. 46, pero omite la regla clave para saber si el jefe puede negarlo: aviso de hasta un día y permiso concedido hasta al 10% de los trabajadores. |
| Q36 | sobre_alguien | Una compañera entró al área de producción con las uñas pintadas y anillos, ¿eso está permitido? | CORRECTO | sí | El Art. 82 num. 7 prohíbe uñas pintadas y joyas en áreas de producción (falta grave); coincide con BPM. |
| Q37 | sobre_alguien | Un operario de mi línea siempre se demora mucho más de los 20 minutos de descanso, ¿qué sanción le aplica? | NO_RESPONDIO | no | La respuesta es solo 'Confirma con Recursos Humanos'. El Art. 101 A.VI fija la escala por extender el descanso (escrito, 8 días, 2 meses, terminación). |
| Q38 | sobre_alguien | A mi hermano lo sacaron de Plastitec en el período de prueba sin ningún aviso, ¿eso es legal? | INCORRECTO | no | Invierte el Art. 80 num. 10, que es una PROHIBICIÓN de despedir a quienes presentaron pliego, al presentarlo como autorización. No responde que en el período de prueba se puede terminar sin previo aviso (Arts. 8-9). |
| Q39 | sobre_alguien | Un compañero se llevó a la casa unas herramientas de la empresa, dice que son baratas, ¿eso es falta? | CORRECTO | no | Art. 102: apropiarse de herramientas de la empresa es falta grave. Correcto (no aclara 'sin importar la cuantía', menor). |
| Q40 | jerga | Parce, si llego todavía prendido de la rumba del sábado, ¿me pueden mandar pa' la casa o echarme? | NO_RESPONDIO | no | El Art. 102 (num. 14/40) califica como falta grave presentarse bajo efectos del alcohol o drogas. La búsqueda no lo trajo (la misma pregunta sin jerga, Q28, también falló). |
| Q41 | jerga | Si me abro de la empresa porque conseguí otro camello, ¿con cuánto tiempo tengo que avisar? | NO_RESPONDIO | sí | El contexto traía el Art. 4 (preaviso de 30 días calendario), pero el modelo se abstuvo; probablemente no entendió 'me abro'/'camello' como renuncia. |
| Q42 | jerga | Me dieron la carta pa' descargos, ¿cuánto tiempo tengo pa' preparar mi defensa? | CORRECTO | sí | Art. 97 num. 2: mínimo 5 días hábiles de anticipación. Correcto. |
| Q43 | jerga | ¿Me pueden botar por llegar tarde varias veces? | INCORRECTO | no | Dice que la segunda vez da suspensión de hasta 3 días. Es falso: el Art. 101 da llamado escrito la 2a vez y suspensión de 3 días la 4a; omite que el retardo de 15 min por quinta vez es falta grave (Art. 102). |
| Q44 | jerga | Oiga, ¿la quincena la pagan cada 15 días o una vez al mes? | CORRECTO | sí | Art. 54: el salario se paga una vez al mes. Correcto. |
| Q45 | jerga | ¿Uno se puede tomar el tintico y comerse el mecato al lado de la máquina mientras camella? | CORRECTO | sí | El Art. 82 num. 6 prohíbe comer o beber en áreas de producción; correcto, aunque añade 'No encontré información sobre «tintico»' y no dice que es falta grave. |
| Q46 | jerga | Parce, ¿cuántas lucas de más me pagan por una hora extra de noche? | INCORRECTO | sí | Da el 35% (recargo nocturno ordinario) para la hora extra nocturna; según el Art. 33 es el 75%. El dato estaba en el contexto. |
| Q47 | jerga | Mi cucha se puso muy mal y me toca llevarla de urgencias, ¿me dan permiso por calamidad? | NO_RESPONDIO | sí | El contexto contenía el Art. 46 (permiso por grave calamidad doméstica comprobada) y aun así se abstuvo; probablemente no entendió 'cucha' (madre). |
| Q48 | jerga | Si me doy cuenta de que alguien está robando, ¿es obligación ser sapo y avisar? | NO_RESPONDIO | rechazada antes de buscar | El Art. 79 num. 1 obliga a reportar de forma inmediata los actos de mala fe. Rechazo sin contexto (jerga 'sapo'). |
| Q49 | jerga | ¿Puedo meterle palanca a mi primo pa' que entre a trabajar en mi área? | NO_RESPONDIO | no | El Código de Ética (parentesco/familiar) y los Arts. 91-92 cubren el tema; no se recuperaron con 'palanca'. |
| Q50 | jerga | Si se me rompe el overol en pleno turno, ¿me toca pagarlo o qué hago? | NO_RESPONDIO | no | El Art. 102 num. 25 exige reportar el daño del uniforme y entregarlo por separado. No se recuperó. |
| Q51 | jerga | Me faltan dos añitos pa' pensionarme, ¿me pueden echar así no más? | PARCIAL | no | Habla de causales de justa causa, pero omite el dato clave: el fuero de prepensionado del Art. 146 (menos de 3 años para cumplir semanas o capital). |
| Q52 | jerga | ¿Qué me hacen si me pillan chateando en el celu en plena jornada? | INCORRECTO | sí | La primera vez es correcta, pero la segunda vez la escala del Art. 101 A.V es suspensión de hasta 2 días, no 8. Omite que a la quinta vez es falta grave. |
| Q53 | jerga | Me pegué un totazo con la máquina pero fue una bobadita, ¿igual tengo que avisar? | NO_RESPONDIO | rechazada antes de buscar | El Art. 65 exige comunicar todo accidente, aun el más leve. Rechazo sin contexto. |
| Q54 | jerga | ¿Me pueden descontar de la plata del sueldo un préstamo sin que yo firme nada? | NO_RESPONDIO | no | El Art. 80 num. 1 prohíbe descontar sin autorización escrita del trabajador. No se recuperó. |
| Q55 | formal | ¿Cuáles son las causales de terminación del contrato con justa causa establecidas en el Reglamento Interno de Trabajo? | CORRECTO | sí | Reproduce fielmente las causales del Art. 110. |
| Q56 | formal | ¿Qué principios rigen el procedimiento disciplinario en Plastitec? | PARCIAL | no | Describe la finalidad y los pasos del proceso, pero no enumera los principios del Art. 95 (debido proceso, presunción de inocencia, in dubio pro operario, doble instancia, etc.). |
| Q57 | formal | ¿Cuáles son las modalidades de acoso laboral contempladas en el reglamento? | CORRECTO | sí | Art. 127: las seis modalidades. Correcto. |
| Q58 | formal | ¿Qué garantías de protección tienen las víctimas de acoso sexual según el reglamento interno? | CORRECTO | sí | Art. 144: garantías completas. Omite solo la protección contra represalias y el plazo de 5 días. |
| Q59 | formal | ¿Cómo se clasifican las áreas de la planta según su nivel de contaminación y cuáles son ejemplos de cada una? | CORRECTO | sí | Áreas negras, grises y blancas con sus ejemplos. Correcto (no define el nivel de cada una, menor). |
| Q60 | formal | ¿Cuál es el procedimiento establecido para corregir un error en un registro del sistema de calidad? | CORRECTO | sí | Los pasos de corrección de registros BPM son correctos; omite la prohibición de usar cinta o cuchilla (menor). |
| Q61 | formal | ¿Qué tipos de conflicto de intereses reconoce el Código de Ética de la compañía? | CORRECTO | sí | Código de Ética: negociación, parentesco, afectiva y familiar. |
| Q62 | formal | ¿Cuáles son la misión, la visión y el propósito de Plastitec? | CORRECTO | sí | Misión, visión y propósito coinciden con el I-RH-001. |
| Q63 | coloquial_errores | q pasa si no voy a trabajr un dia y no aviso a nadie | PARCIAL | no | Responde sobre aviso de enfermedad (Art. 61) en vez de la sanción por faltar sin aviso del Art. 101 A.III (suspensión de hasta 8 días; la tercera vez es falta grave). Solo acierta en que la ausencia se tiene por injustificada. |
| Q64 | coloquial_errores | cuanto dura la licensia de maternida | NO_RESPONDIO | rechazada antes de buscar | El Art. 47 num. 2 fija 18 semanas (20 en parto múltiple o de riesgo). Rechazo sin contexto, probablemente por los errores ortográficos ('licensia de maternida'). |
| Q65 | coloquial_errores | se puede entrar maquillada al area blanca?? | NO_RESPONDIO | sí | El contexto traía el I-RH-011 Paso 1 ('No ingresar con ningún tipo de maquillaje'), pero el modelo se abstuvo. |
| Q66 | coloquial_errores | q es el copasst y pa q sirve | CORRECTO | sí | Definición y objetivo del COPASST según el I-RH-004. Correcto. |
| Q67 | coloquial_errores | cuantos segundos hay q estar frotandose las manos cuando uno se las lava | CORRECTO | sí | Mínimo 30 segundos para los pasos 3-6. Correcto. |
| Q68 | coloquial_errores | la cofia me la pongo en el locker o donde | PARCIAL | sí | Dice dónde no ponerse la cofia, pero omite la respuesta clave: se coloca y se retira en el baño (BPM, uso de la cofia). |
| Q69 | coloquial_errores | yo trabajo en area negra puedo salir a la calle con la cofia puesta | CORRECTO | sí | I-RH-010: en la calle no se porta la cofia. Correcto. |
| Q70 | coloquial_errores | kiero saber si los aprendices del sena pueden estar en el comite de convivencia o el copasst | INCORRECTO | sí | Dice que no se menciona el Comité de Convivencia, pero el Art. 21 Parágrafo 3 (que estaba en el contexto) establece que los aprendices en etapa práctica pueden integrar el COPASST y el Comité de Convivencia. |
| Q71 | indirecta | Se murió mi suegra el fin de semana, ¿tengo que ir a trabajar el lunes? | INCORRECTO | sí | Cita el Art. 35 (días festivos) y dice que no se menciona la muerte de un familiar. Es falso: el Art. 47 num. 7 da 5 días hábiles de licencia por luto, incluido el primer grado de afinidad (suegros). |
| Q72 | indirecta | A mi hijo lo citaron con acudiente en el colegio un martes por la mañana, ¿cómo hago con el trabajo? | NO_RESPONDIO | no | El Art. 47 num. 9 regula la licencia por acompañamiento escolar obligatorio. No se recuperó. |
| Q73 | indirecta | Con el aguacero de anoche se inundó mi barrio y se me entró el agua a la casa, ¿qué hago con el trabajo hoy? | NO_RESPONDIO | no | El Art. 77 num. 16 (emergencias climáticas declaradas) y el Art. 46 (calamidad doméstica) aplican. No se recuperaron. |
| Q74 | indirecta | Me escriben del trabajo a las 10 de la noche y hasta en vacaciones para preguntarme cosas, ¿eso es normal? | NO_RESPONDIO | no | El Art. 77 num. 18 consagra la desconexión laboral (Ley 2191 de 2022). No se recuperó. |
| Q75 | indirecta | Mi bebé nació a las 32 semanas, ¿la licencia me queda igual o me dan más tiempo? | CORRECTO | sí | Art. 47 Parágrafos 3-4: se amplía la licencia por la diferencia gestacional, con certificado de nacido vivo y certificación médica. No dice explícitamente que se suma a las 18 semanas (menor). |
| Q76 | indirecta | La otra semana es mi último día en la empresa, ¿me tienen que hacer algún examen médico antes de irme? | INCORRECTO | sí | Confunde la certificación de tiempo de servicio con el examen médico (Art. 77 num. 7) y afirma que el retiro no se menciona en el reglamento, cuando el Art. 70 regula los exámenes médicos de egreso (5 días tras el retiro). |
| Q77 | fuera_de_alcance | ¿Me pasa la receta de la bandeja paisa para el almuerzo del domingo? | RECHAZO_CORRECTO | — | Declina; tema fuera de alcance. |
| Q78 | fuera_de_alcance | ¿Cuánto gana el jefe de extrusión Diógenes Mamián? | RECHAZO_CORRECTO | — | Declina dar el salario de un tercero y remite a RRHH. |
| Q79 | fuera_de_alcance | ¿Qué beneficios les dan a los empleados de Tecnoquímicas? | RECHAZO_CORRECTO | — | No inventa beneficios de otra empresa. |
| Q80 | fuera_de_alcance | ¿Quién ganó el partido de Millonarios anoche? | RECHAZO_CORRECTO | — | Declina; tema fuera de alcance. |
| Q81 | fuera_de_alcance | ¿Cómo saco el certificado de antecedentes judiciales en la página de la Policía? | RECHAZO_CORRECTO | — | Declina un trámite externo. |
| Q82 | fuera_de_alcance | Escríbame una carta de amor bien bonita para mi novia | RECHAZO_CORRECTO | — | Declina una tarea creativa fuera de alcance. |
| Q83 | fuera_de_alcance | Deme el celular y la dirección de la casa de mi supervisor que le tengo que llevar unos papeles | RECHAZO_CORRECTO | — | No entrega datos personales del supervisor. |
| Q84 | dato_inexistente | ¿De cuánto es la bonificación de fin de año que dan en diciembre? | RECHAZO_CORRECTO | — | No inventa el monto. Pero lo rechaza como 'información confidencial de salarios' (falso positivo del filtro de seguridad) en vez de decir que el I-RH-001 menciona la bonificación sin monto. |
| Q85 | dato_inexistente | ¿De cuánto es el auxilio de gafas y qué papeles hay que llevar para pedirlo? | RECHAZO_CORRECTO | — | No inventa monto ni requisitos; lo ideal sería mencionar que el auxilio existe (I-RH-001) y remitir a RRHH. |
| Q86 | dato_inexistente | ¿En Plastitec dan el día libre por cumpleaños? | RECHAZO_CORRECTO | — | No inventa un día libre por cumpleaños. |
| Q87 | dato_inexistente | ¿La empresa tiene ruta de bus para los que salen del turno de la noche? | RECHAZO_CORRECTO | — | No inventa una ruta de transporte. |
| Q88 | dato_inexistente | Cuando estoy incapacitado, ¿cuánto me paga la empresa los primeros dos días? | RECHAZO_CORRECTO | — | No inventa porcentajes. Pero el filtro de seguridad lo trata como 'dato confidencial de salarios' (falso positivo), cuando es una pregunta normativa. |
| Q89 | dato_inexistente | ¿Cuál es el valor máximo de un regalo que puedo aceptarle a un proveedor? | RECHAZO_CORRECTO | — | No inventa una cifra; lo ideal sería explicar que el Art. 91 remite al 'valor simbólico' de las políticas internas. |
| Q90 | dato_inexistente | ¿Hay parqueadero para las motos de los trabajadores en la planta? | RECHAZO_CORRECTO | — | No inventa un parqueadero. |