# Piloto A: qwen2.5 7B Instruct con las 150 preguntas reales de SQLite (2026-10-09)

**Qué se comparó:** `C:\AIV2\scratch\pilot_A_qwen25_7b.json` (código actual con las correcciones del validador: filtro del eco "42 h/Ley 2101", premisas, bucles y fuentes siempre visibles, + **qwen2.5 7B Instruct**) contra la corrida base del mismo día (`sqlite_regression_results_2026-10-09.json`: llama3.2 con el código anterior a esas correcciones). Las preguntas se emparejaron por `ids[0]`: las 150 coinciden y no hay errores HTTP.
**Rúbrica:** la misma del reporte `testing_sqlite_2026-10-09.md`. La validación se hizo a mano contra `C:\AIV2\docs\*.md`. En cada abstención de qwen se revisó el campo `context` para saber si el dato había llegado al LLM (abstención con el dato a la vista → NO RESPONDE PERO DEBERÍA).
**Advertencia de diseño:** el piloto cambia **dos variables a la vez** (modelo + correcciones del código). Esta comparación no separa qué parte de la mejora es del modelo y cuál del validador; eso lo dirá el piloto C (llama3.2 con el mismo código actual).

## Resumen

- **Las alucinaciones caen de 44 a 13** (29,3 % → 8,7 %). El comportamiento aceptable (CORRECTA + abstención correcta) **sube del 30,0 % al 53,3 %**. Las CORRECTAS pasan de 33 a 45.
- **El costo es la sobre-abstención:** qwen se abstiene en 59 de 150 preguntas (la base, en 8). 25 de esas abstenciones son falsos negativos: el dato existe en los docs. En **10** de ellas el dato **sí estaba en el contexto** que recibió el LLM: #0, #14, #23, #46, #78 (2.ª parte), #119, #132, #133, #139, #141. Las otras 15 son fallos de retrieval (el chunk no llegó). Los falsos negativos suben de 9 a 26.
- **Desaparece la fuga del ejemplo few-shot** (10 → 0) y se corrigen los dos rechazos indebidos por premisa (#56 «rotativo» → CORRECTA; #76 «regaña» → PARCIAL). Queda el rechazo por privacidad de #144 (salario mínimo legal), que ocurre antes del LLM.
- **Persisten los horarios derogados:** 6 respuestas siguen transcribiendo HORARIO UNO/DOS (#7, #28, #29, #51, #61, #140), y #53 da el horario administrativo como horario operativo. Es un problema de contenido que el modelo no resuelve.
- **Aparece un defecto nuevo de truncamiento:** #79 queda vacía ("…los siguientes sistemas:" y nada; la base era CORRECTA), #82 se corta tras las áreas negras, #88 corta "Aura Ma." y #29 corta "VIERNES: 04:". Las listas en markdown y las abreviaturas con punto parecen chocar con el recorte a la última oración o con el límite de tokens.
- **Latencia:** media de 20,5 s → 34,1 s (+66 %); P90 de 30,3 s → 60,0 s. Ninguna corrida pasa de 75 s.
- **Las 5 preguntas más usadas:** vacaciones (×9) pasa de PARCIAL a **NO RESPONDE PERO DEBERÍA** (el art. 40 estaba en el contexto); luto (×7) pasa a **CORRECTA**; celular (×7) sigue PARCIAL; horario (×5) sigue PARCIAL; accidente (×4) pasa a **CORRECTA**.

<!--METRICAS-->

## Los 10 casos más relevantes

### Mejoras

1. **#56 "si soy trabajador con contrato rotativo… ¿puedo trabajar de 7am a 5pm cumpliendo las 42 horas?"** (RECHAZO INDEBIDO → CORRECTA)
   qwen: "Sí, puedes acordar con tu jefe inmediato una jornada diaria flexible… máximo seis (6) días… no debe exceder de nueve (9) horas… promedio de cuarenta y dos (42) horas…".
   **Por qué:** es exactamente el art. 23 par. 5 b). La base rechazaba la pregunta con "No encontré información sobre «rotativo»"; el validador de premisas corregido ya no la bloquea.
2. **#1 "¿Cuántos días de permiso por luto tengo?"** (7 usos; PARCIAL → CORRECTA)
   qwen: "Según el Artículo 47, numeral 7… cinco (5) días hábiles… cónyuge, compañero permanente, familiar hasta el segundo grado de consanguinidad, primero de afinidad, y primero civil".
   **Por qué:** dato, artículo y parentescos correctos. Desaparece la cita espuria de la "Ley 2101" de la base.
3. **#4 "¿Cómo reporto un accidente laboral?"** (4 usos; PARCIAL → CORRECTA)
   qwen: informar de inmediato a coordinadores o jefes, al brigadista (primer auxilio en la enfermería), reporte a la ARL, remisión al centro médico e informar a RRHH el diagnóstico y la incapacidad.
   **Por qué:** es el flujo completo del I-RH-004, que la base omitía aunque estaba en el contexto.
4. **#131 "Y vacaciones son colectivas"** (INCORRECTA → NO RESPONDE CORRECTAMENTE)
   qwen: "No se encontró información suficiente…".
   **Por qué:** la base afirmaba "Según el art. 40, las vacaciones son colectivas", lo cual es falso. Los docs no regulan vacaciones colectivas, así que abstenerse es lo correcto. Es el mismo patrón que en #18, #71, #77, #86, #121, #137, #145 y #149: 23 alucinaciones de la base pasan a ser abstenciones correctas.
5. **#108 "¿Qué dotación se debe usar en el área negra…?"** (INCORRECTA → CORRECTA)
   qwen: "…se debe usar el overol y los elementos de protección personal entregados como dotación. No se deben usar elementos diferentes…".
   **Por qué:** coincide con el I-RH-010. La base le atribuía la dotación del área BLANCA (escafandra, overol blanco). En la misma línea, #115 (a quién aplica el lavado de manos) pasa de INCORRECTA a CORRECTA.

### Empeoramientos

6. **#0 "¿Cómo solicito vacaciones?"** (la pregunta más usada, ×9; PARCIAL → NO RESPONDE PERO DEBERÍA)
   qwen: "No se encontró información suficiente en los documentos consultados para responder esta pregunta."
   **Por qué:** el contexto recibido traía el art. 40 completo (concesión "a petición del trabajador"; la empresa avisa la fecha con 15 días). Es sobre-abstención con el dato a la vista: el empleado más típico se queda sin respuesta. Igual ocurre en #14 y #141 ("¿quién certifica a Plastitec?", con BVQI/ICONTEC en el contexto), #139 (festivos: el art. 35 y el 90% estaban en el contexto) y #132/#133 (pago de vacaciones: el art. 44 estaba en el contexto).
7. **#79 "¿Qué sistemas de gestión y control ha implementado PLASTITEC para prevenir el riesgo de LA/FT/FPADM?"** (CORRECTA → NO RESPONDE PERO DEBERÍA)
   qwen: "PLASTITEC ha implementado y adoptado los siguientes sistemas de gestión y control para prevenir el riesgo…:" seguido directamente del bloque de fuentes.
   **Por qué:** respuesta vacía con confianza 1,0. SAGRILAFT y OEA estaban en el contexto. Es un truncamiento en el post-procesado: la lista desaparece. Hay cortes del mismo tipo en #82, #88 y #29. Es un defecto de código, no del modelo.
8. **#119 "¿Cómo reclamo mi liquidación?"** (CORRECTA → NO RESPONDE PERO DEBERÍA)
   qwen: "No se encontró información suficiente…".
   **Por qué:** el contexto traía los arts. 124 y 103 (reclamo ante el jefe o director de área o ante RRHH, por escrito). La base respondía bien. Probablemente qwen exige un procedimiento específico de "liquidación" y descarta la regla general de reclamos.
9. **#135 "¿Cuánto están las horas extras y recargos nocturnos?"** (PARCIAL → INCORRECTA)
   qwen: "…el artículo 23 establece que el trabajo realizado con posterioridad a las 6:00 p.m. generará el recargo nocturno correspondiente."
   **Por qué:** es falso; es desde las 7:00 p.m. (art. 23 par. 5 y art. 29). Además no da los porcentajes del art. 33, que eran lo preguntado. Es un error numérico de transcripción con cita de artículo.
10. **#117 "¿Qué indican los pasos 4, 5 y 6 del instructivo respecto al frotado de manos, dorsos, dedos y uñas?"** (PARCIAL → INCORRECTA)
    qwen: "Paso 4: Frote y desinfecte las manos… Paso 5: Colóquese el uniforme. Paso 6: Al ingresar al proceso, retire partículas con la cinta."
    **Por qué:** responde con los pasos 4-6 del I-RH-009 (áreas grises), aunque el contexto traía el I-RH-012 (dorso con dedos entrelazados, palmas, dedos y uñas) y la pregunta nombra el frotado. Es una confusión de documento. En la misma línea, #53 ("horarios del personal operativo", conf 0,75) presenta el horario administrativo como operativo, y #51 da los horarios derogados como "los dos horarios principales".

## Conclusiones y recomendaciones

1. **qwen2.5 7B es claramente más fiel:** menos de un tercio de las alucinaciones de la base, sin fuga de plantilla, citas de artículo mayormente correctas y transcripción literal de instructivos. Antes de atribuirle la mejora al modelo, hay que esperar el **piloto C** (llama3.2 con el mismo código), porque parte de la reducción puede venir del validador (eco few-shot, premisas).
2. **El principal riesgo nuevo es la sobre-abstención** (59/150). Las 10 abstenciones con el dato en el contexto apuntan al prompt tri-estado: qwen clasifica NO_INFORMATION_FOUND cuando la respuesta exige un mínimo de inferencia (p. ej. regla general de reclamos → liquidación; art. 40 → cómo solicitar). Conviene ajustar el prompt ("si el contexto contiene una regla general aplicable, respóndela y aclara el alcance") y medir de nuevo.
3. **Las otras 15 abstenciones-FN son de retrieval:** el chunk no llega (arts. 101, 110, 71 n, 39, 83, 21 par. 1). qwen las expone en lugar de alucinar, que es preferible, pero el arreglo es el mismo que en el reporte base (expansiones de intención coloquial).
4. **Corregir el truncamiento de listas y abreviaturas** (#79, #82, #88, #29) antes de cualquier despliegue: con qwen las respuestas usan markdown y listas con más frecuencia.
5. **Los horarios derogados del RIT siguen siendo la primera fuente de errores con contenido falso** (8 de las 13 INCORRECTAS de qwen son de horarios: #7, #10, #28, #29, #51, #53, #61, #140). Es un problema de contenido: retirar o marcar las tablas HORARIO UNO/DOS.
6. **Latencia:** +66 % de media (34 s). P90 de 60 s es alto para un kiosco; hay que validar en el hardware de producción y considerar un `num_predict` más ajustado.

## Tabla por pregunta

<!--TABLA-->
