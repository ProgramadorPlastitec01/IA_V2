# Testing de regresión con preguntas reales de usuarios (SQLite) — 2026-10-09

**Alcance:** las preguntas reales guardadas en `hr_cache.db` (tabla `knowledge_base`) se volvieron a lanzar contra el pipeline actual (`POST /api/query`, `bypass_cache: true`, colección `plastitec_docs_p0`, llama3.2 vía Ollama). Cada respuesta se comparó con la respuesta antigua de la caché y se validó a mano contra los `.md` de `C:\AIV2\docs\`.
**Modo:** solo lectura. No se tocó código, `.env`, Qdrant ni SQLite. La BD se abrió en `OPEN_READONLY` y `bypass_cache` desactiva la escritura en caché (ver *Notas de método*).
**Artefactos:** `C:\AIV2\scratch\sqlite_*_2026-10-09.*` (scripts, resultados crudos, evaluaciones y métricas).

---

## 1. Resumen ejecutivo

| Métrica | Valor |
|---|---|
| Filas en `knowledge_base` | 160 (160 preguntas distintas tras normalizar) |
| Preguntas ejecutadas | **150** (10 casi-duplicados excluidos, ver §6) |
| Rechazadas por longitud (>200 car.) | **0** (las más largas tienen 195–200 car.; dos llegaron **truncadas** a 200 por el `maxLength` del frontend) |
| Respuestas con contenido / NO_MATCH / INSUFFICIENT / Premisa / Privacidad / NOT_UNDERSTOOD | 140 / 1 / 2 / 5 / 2 / 0 |
| **CORRECTA** | **33 (22,0 %)** — conf. media 0,572 |
| **PARCIAL** | **49 (32,7 %)** — conf. media 0,561 |
| **INCORRECTA / ALUCINACIÓN** | **44 (29,3 %)** — conf. media 0,512 |
| **NO RESPONDE PERO DEBERÍA** (falso negativo) | **9 (6,0 %)** — conf. media 0,444 |
| **NO RESPONDE CORRECTAMENTE** (fuera de alcance / no está en docs) | **12 (8,0 %)** — conf. media 0,448 |
| **RECHAZO INDEBIDO** (premisa/privacidad) | **3 (2,0 %)** — conf. media 0,580 |
| Comportamiento aceptable (CORRECTA + abstención correcta) | **45 / 150 = 30 %** |
| Frente a la respuesta antigua de la caché | mejoró 36 · igual 84 · empeoró 27 · cambió de sentido 3 |
| Confianza media (respuestas con contenido) | 0,539 (en la caché: 0,533; Δ medio por pregunta −0,005) |
| Correlación confianza ↔ calidad | Pearson 0,185 · Spearman 0,173 (**casi nula**) |
| Latencia | media 20,5 s · máx. 74,7 s (hubo tráfico concurrente de otros usuarios) |

**Lectura rápida**

- **Preguntas espontáneas de empleados (109)**: solo 13 CORRECTAS (11,9 %) y 39 INCORRECTAS (35,8 %). Con las 12 abstenciones correctas, el comportamiento aceptable llega al 22,9 %. Las **41 preguntas estilo examen** del QA de TI (23–24/09, redactadas con el documento delante) van mucho mejor: 20 CORRECTAS (48,8 %) y 5 INCORRECTAS. **El sistema rinde bien cuando la pregunta copia el vocabulario del documento y mal con lenguaje coloquial.**
- **Ninguna de las 5 preguntas más usadas** (vacaciones ×9, luto ×7, celular ×7, horario ×5, accidente ×4) recibe una respuesta completamente correcta: las cinco son PARCIALES. La de luto da el dato correcto (5 días hábiles) pero lo justifica con una ley inventada ("Ley 2101", fuga del ejemplo del prompt).
- **Los horarios son el tema más preguntado y el peor resuelto**: de 37 preguntas, 17 INCORRECTAS y solo 5 CORRECTAS. Concurren dos causas: (a) el RIT indexado aún contiene los horarios administrativos **derogados** (vigentes hasta el 13-jul-2026); (b) los turnos operativos **no están documentados** ("disposición interna"). El LLM rellena el hueco con horarios administrativos.
- **La confianza no mide la calidad de la respuesta.** Se calcula **antes** del LLM y solo con señales de retrieval. Es prácticamente la misma que la de la caché porque el retrieval no cambió, y apenas se correlaciona con la calidad. Hay 11 respuestas INCORRECTAS o falsos negativos con conf ≥ 0,60 (p. ej. #33 "En plastitec" → plantilla de 42 h con conf 0,81; #78 → área del Código de Ética inventada con conf 0,85).
- **Mejoras reales frente a la caché**: menos citas de "Ley 2101" mal atribuidas, mejores abstenciones (cumpleaños, temporales, Gran Servicios, número de emergencias) y respuestas de instructivos más literales. **Regresiones**: el validador de premisas rechaza preguntas válidas ("rotativo", "regaña"), las omisiones se vuelven "no se menciona" cuando el dato sí está, y hay respuestas con texto degenerado y repetitivo.

---

## 2. Análisis de la confianza

**Distribución por tramo** (solo las 140 respuestas con contenido):

| Tramo de confianza | n | CORRECTA | PARCIAL | INCORRECTA | % correcta | % incorrecta |
|---|---|---|---|---|---|---|
| [0,0 – 0,3) | 3 | 0 | 1 | 2 | 0 % | 67 % |
| [0,3 – 0,4) | 25 | 5 | 9 | 7 | 20 % | 28 % |
| [0,4 – 0,5) | 35 | 8 | 10 | 12 | 23 % | 34 % |
| [0,5 – 0,6) | 32 | 7 | 10 | 13 | 22 % | 41 % |
| [0,6 – 0,7) | 21 | 7 | 7 | 5 | 33 % | 24 % |
| [0,7 – 0,8) | 14 | 3 | 7 | 3 | 21 % | 21 % |
| [0,8 – 1,0] | 10 | 3 | 5 | 2 | 30 % | 20 % |

(Las filas no suman `n` porque los falsos negativos y las abstenciones con contenido no figuran en las tres columnas.)

**Hallazgos**

1. **La confianza es puramente de retrieval.** `ragService.js` calcula `retrievalConfidence.calculateConfidence(...)` en la etapa 5, antes de invocar al LLM, y no hay ninguna señal posterior a la generación. Por eso las alucinaciones del LLM sobre un buen contexto salen con confianza alta. La confianza nueva es casi idéntica a la de la caché (Δ −0,005).
2. **No discrimina.** Entre 0,3 y 0,8 el % de respuestas correctas es plano (20–33 %). Spearman 0,17.
3. **Casos de confianza alta pero mal (≥ 0,60):** #21 (0,60), #28 (0,74), #29 (0,64), #32 (0,62), #33 (0,81), #59 (0,71), #78 (0,85), #88 (0,61), #112 (0,76), #115 (0,67), #140 (0,64). Siete son de horarios u otra fuga del prompt.
4. **Casos de confianza baja pero bien (< 0,40):** #20 (0,37), #67 (0,38), #73 (0,37), #119 (0,33), #133 (0,36). Si se subiera el piso a 0,40 para "mejorar precisión", se perderían respuestas correctas y apenas se filtrarían incorrectas: entre 0,3 y 0,4 solo el 28 % es incorrecto, frente al 41 % entre 0,5 y 0,6.
5. **Umbrales problemáticos:**
   - **Piso de 0,20** (`safeConfidence < 0.20 → NO_MATCH`): en 150 preguntas actuó solo 1 vez (#36), y además mal (falso negativo). No es un filtro de calidad.
   - **Umbral de citas de 0,70** (`citationBuilder.js`, `CONFIDENCE_THRESHOLD = 0.70`): con conf ≥ 0,70 se **ocultan las fuentes**. 24 respuestas salieron sin bloque de fuentes, entre ellas varias incorrectas (#28, #33, #59, #112). El usuario queda sin fuentes justo cuando la respuesta suena segura y está mal.
   - **`TOPICAL_SIMILARITY_BYPASS = 0.60`** no generó errores observables en este set.
6. **Recomendación:** no usar la confianza actual como indicador de calidad ni mostrarla al usuario como tal. Hace falta una **señal posterior a la generación**: grado de apoyo de cada oración en el contexto (solapamiento léxico con el chunk citado, citas literales del paso extract-first) combinada con la de retrieval. Las 150 preguntas etiquetadas de este reporte sirven como set de calibración.

---

## 3. Problemas encontrados, agrupados por causa raíz

> **[CONTENIDO]**: el documento no tiene el dato o tiene datos obsoletos; se arregla editando o añadiendo documentos (lo hace RRHH).
> **[CÓDIGO]**: pipeline, prompt, validadores o reglas; se arregla en el repositorio.

### P1. Horarios: chunks obsoletos + turnos no documentados — [CONTENIDO] + [CÓDIGO]
- **Evidencia:** 17 de 37 preguntas de horario son INCORRECTAS. Ejemplos:
  - #7 "esquema de horarios para operarios" → "Lunes a jueves 7:30 AM a 5:00 PM…" (es el horario **administrativo**; el operativo va por turnos, art. 23 §22.2).
  - #21/#29/#32 operaria farmacéutica/producción → "08:00 AM a 01:00 PM, lunes a jueves" (HORARIO UNO, **derogado** desde el 14-jul-2026). #32 incluso dice "hasta el 13 de julio de 2026".
  - #12 "qué turno nos tocaría" → "Según el artículo 101, el turno de la tarde 02:00 PM A 05:00 PM" (el art. 101 trata de faltas).
  - #145 "En fechas especiales como diciembre cómo es el horario" → "según el art. 23… de 8:00 AM a 5:00 PM" (inventado).
  - #91 (conf 0,91, la más alta del set) → "7:30–5:00 de lunes a viernes" (el viernes es hasta 4:30).
- **Causa:** el RIT `.md` mantiene las tablas "Horario vigente hasta el 13 de julio de 2026" (HORARIO UNO/DOS) junto a la vigente. El retrieval las trae (top 0,9–1,0) y el LLM 3B no respeta la vigencia. Los turnos del personal operativo no están en ningún documento.
- **Corrección:**
  - [CONTENIDO] Quitar del índice o marcar como derogadas las tablas HORARIO UNO/DOS.
  - [CONTENIDO] Si RRHH quiere que el asistente responda turnos, añadir un documento con la programación de turnos (mañana/tarde/noche, sábados).
  - [CÓDIGO] Regla de interpretación: si la pregunta menciona *operari@/turno/producción/PRF*, el LLM debe responder con el §22.2 (jornadas sucesivas, programación interna, 20 min de descanso, 6 días hábiles según art. 39) y no aplicar el §22.1.

### P2. Fuga del ejemplo few-shot del prompt — [CÓDIGO]
- **Evidencia:** 10 respuestas contienen literalmente la frase del ejemplo de `llmService.js` (L296 y L326–334): "la jornada laboral semanal es de 42 horas, de acuerdo con la reducción establecida por la Ley 2101 de 2021, vigente a partir de 2026" o fragmentos ("RIT CAPÍTULO VII establece 42 horas", "restricción específica para 2026"). Respuestas afectadas: #1, #10, #20, #30, #33, #35, #53, #95, #99, #143.
  - #30 "¿hay oportunidad de crecimiento?" → la respuesta es **solo** la plantilla de 42 h.
  - #33 "En plastitec" → plantilla con conf 0,81.
  - #143 "Cuánto es el mínimo en plastitec" → plantilla.
  - **#1 (luto, 7 usos)** → "5 días hábiles, de acuerdo con la reducción establecida por la Ley 2101 de 2021" (cita legal contaminada).
- **Causa:** llama3.2 3B copia el ejemplo como respuesta por defecto cuando no sabe qué contestar. `citationValidator` no lo detecta porque "Ley 2101" sí aparece en el contexto.
- **Corrección:** cambiar el ejemplo por uno neutro, que no sea un dato real del corpus (o usar marcadores tipo `[dato del contexto]`), y añadir un detector posterior a la generación que rechace o reintente si la respuesta contiene la frase del ejemplo y la pregunta no trata de jornada.

### P3. Citas de artículos sin respaldo (el artículo existe, pero no dice eso) — [CÓDIGO]
- **Evidencia:**
  - #65 "¿es legal hacer funciones no estipuladas?" → "Según el artículo 123… no son legales" (el art. 123 es de trabajo remoto).
  - #131 "¿Las vacaciones son colectivas?" → "Según el artículo 40… las vacaciones son colectivas" (falso).
  - #86 "¿hay que devolver la dotación anterior?" → "Según el art. 58… obligación de devolverla" (no lo dice).
  - #71 → cita el art. 1 añadiendo "incluidos los trabajadores externos" (texto inexistente).
  - #77 → "art. 81… no pueden vender fuera de la empresa".
  - #149 → "art. 128… el SENA permite trabajar festivos si el teletrabajador…".
  - #19 → generaliza el art. 47 num. 10 (citaciones judiciales) a "cualquier asunto importante".
  - #24 → Decreto 0223 (aprendices) para terminación de contrato.
- **Causa:** `citationValidator.validate` (2026-10-08) comprueba que el número de artículo o ley **exista en el contexto**, no que el texto de ese artículo **respalde la afirmación**.
- **Corrección:** validar a nivel de afirmación. Por cada oración con "artículo N", localizar el bloque `### ARTÍCULO N` en el contexto y exigir un solapamiento mínimo de términos clave (sustantivos o cifras) entre la oración y ese bloque. Si no lo alcanza, quitar la referencia o convertir la respuesta en abstención. Complementar con el paso extract-first: no permitir una afirmación sin cita literal (`exact_quote`).

### P4. El LLM no se abstiene cuando el dato no existe — [CÓDIGO] (modelo/prompt) + [CONTENIDO]
- **Evidencia:**
  - #18 "¿En qué riesgo está clasificado el DM?" → lo "clasifica" como riesgo LA/FT del Código de Ética.
  - #121 "tiempo de trabajo por empresa temporal" → "36 horas semanales" (inventado).
  - #137 → "se menciona la posibilidad de acordar beneficios para temporales" (no existe).
  - #52 → turno de tarde "desde la hora de cierre hasta la apertura del día siguiente".
  - #59 → "las horas extras no son obligatorias para todos" (non sequitur sobre el art. 31).
  - #31 crecimiento → obligaciones genéricas que no vienen al caso.
- **Causa:** la clasificación tri-estado de llama3.2 3B marca FULL/PARTIAL_MATCH en cuanto el contexto toca el tema. La validación de premisas solo actúa sobre términos ausentes del corpus (cumpleaños sí; "temporal", "diciembre", "DM" son palabras que sí existen).
- **Corrección:**
  - [CÓDIGO] Exigir evidencia literal para cada afirmación (ver P3); en preguntas de sí/no, que el modelo cite la frase que lo respalda o se abstenga. Evaluar un modelo de mayor capacidad para la generación final si el hardware lo permite.
  - [CONTENIDO] Los temas recurrentes sin documento (temporales vs. directos, vacaciones de diciembre o colectivas, horarios de festivos y diciembre, crecimiento o ascensos) deberían tener al menos un FAQ de RRHH.

### P5. Falsos negativos y omisiones con el dato disponible — [CÓDIGO] (retrieval + LLM)
- **El dato estaba en el contexto y el LLM dijo que no** (LLM):
  - #88 nombres de Gerente, Director Técnico y Directora de RRHH → "no proporciona los nombres" (están en la tabla del I-RH-001; top 0,87; la caché respondía bien).
  - #96 y #103 → "no se menciona el orden" (los instructivos están numerados).
  - #42 licras → "no se menciona" (los instructivos prohíben "ropa diferente a la dotación").
  - #13 sábados → no usa "6 días hábiles" (art. 39).
  - #147 aprendices → "no se menciona" (el art. 21 par. 1 da vacaciones explícitamente).
- **El chunk correcto no se recuperó** (retrieval; top score ≤ 0,45 en casi todos):
  - #11 "¿qué pasa si falto un día?" no recupera el art. 101 (suspensión hasta 8 días, luego hasta 2 meses).
  - #24 "¿por qué me terminarían el contrato?" no recupera el art. 110.
  - #36 "¿a cuánto tiempo puedo cambiar el tipo de contrato?" → NO_MATCH, conf 0 (art. 3: máximo 4 años en término fijo).
  - #58 vacaciones sin cumplir el año (art. 45 par. / art. 3 par.).
  - #100 y #123 funciones fuera del manual (art. 71 lit. n, "conexas o complementarias").
  - #115 a quién aplica el lavado de manos (la caché lo respondía exacto).
- **Corrección:**
  - [CÓDIGO-retrieval] Añadir expansiones de intención coloquial → término del RIT: *faltar/no ir* → "falta total… sin excusa / suspensión"; *me echan/terminar contrato* → "terminación con justa causa"; *cambiar tipo de contrato* → "término fijo / prórroga / cuatro (4) años"; *funciones que no son mías* → "funciones conexas o complementarias". Verificar que estas preguntas traigan el artículo correcto en el top-k.
  - [CÓDIGO-prompt] Instrucción explícita: "si el contexto enumera pasos numerados o una tabla de nombres, NO digas que no se menciona".

### P6. El validador de premisas rechaza preguntas válidas — [CÓDIGO] (`citationValidator`, 2026-10-08)
- **Evidencia:**
  - #56 "si soy trabajador con contrato **rotativo**… ¿puedo trabajar de 7am a 5pm cumpliendo las 42 horas?" → "No encontré información sobre «rotativo»" (top 0,86; el art. 23 par. 5 b regula la jornada flexible de 4 a 9 h diarias).
  - #76 "si mi jefe **regaña** a un compañero, ¿se puede considerar acoso laboral?" → "No encontré información sobre «regaña»" (conf 0,72, top 1,24; los arts. 128/129 responden de lleno; la caché respondía razonablemente).
- **Causa:** el término no respaldado se busca por forma exacta. Las variantes morfológicas ("rotativo" frente a "rotación") y los verbos coloquiales cuentan como premisa inexistente aunque el tema central esté cubierto.
- **Corrección:** comparar por lema o raíz (stemming español) contra el vocabulario del corpus; excluir verbos y adjetivos o limitar la regla al sustantivo núcleo de la pregunta; no aplicarla cuando el retrieval sea fuerte (p. ej. top ≥ 0,8) y la respuesta se apoye en otros términos de la pregunta. Añadir "regañar", "rotativo", "turnos rotativos" a las reglas de jerga.

### P7. Reglas de privacidad: falso positivo y falso negativo — [CÓDIGO] (`PrivacyService`)
- #144 "¿Cuánto es el pago mínimo en Colombia?" → bloqueo "información confidencial… consulta con RRHH". El salario mínimo legal es público; lo correcto era un "no está en la documentación".
- #143 "Cuánto es el mínimo en plastitec" → no se bloquea y devuelve la plantilla de 42 h (P2).
- #49 "¿Cuánto nos pagan por 10 días de trabajo?" → bloqueo justificado.
- **Corrección:** separar "dato salarial personal" (*me pagan, mi salario, mi liquidación*) de "concepto legal general" (*salario mínimo legal, SMMLV*). Para el segundo, responder fuera de alcance o, cuando aplique, con el art. 10 (apoyo de sostenimiento en % del SMLMV) y el art. 58 (dotación hasta 2 SMMLV).

### P8. Texto degenerado/repetitivo que el LoopGuard no corta — [CÓDIGO]
- **Evidencia:**
  - #117 lavado de manos, pasos 4-6 → decenas de "No se menciona si el frotado… debe ser realizado con X", hasta truncarse.
  - #102 → "No se menciona dónde se guardan las manos…".
  - #113 → bloques completos repetidos.
  - #107 → coletilla contradictoria repetida dos veces.
- **Causa:** `_readStreamWithLoopGuard` (llmService.js L199–248) corta solo si una oración **idéntica** (normalizada) aparece 3 veces. Las repeticiones con el mismo prefijo y distinto final no la disparan.
- **Corrección:** detectar repetición por prefijo (p. ej. mismas primeras 5–6 palabras ≥ 3 veces) o por n-gramas repetidos. Usar `repeat_penalty` (~1,1–1,15) en las opciones de Ollama y post-procesar quitando oraciones "No se menciona…" cuando ya hay contenido.

### P9. Malinterpretación de la pregunta o de la norma — [CÓDIGO] (prompt/LLM)
- #74 "¿cómo puedo renunciar después de tomar vacaciones?" → lo entiende como "renunciar a las vacaciones" (debió responder con el preaviso del art. 4).
- #46 "horarios los sábados" → invierte el art. 24 (no se amplía el sábado, se amplían los días hábiles para compensarlo).
- #139 "¿cuando es festivo entre semana se trabaja?" → aplica el art. 35 par. 1 (jornadas parciales).
- #5 y #75 (hijo enfermo) → atribuyen al art. 61 una obligación sobre la enfermedad "del familiar" que no existe; la regla de jerga del 2026-10-08 evita la confusión de sujeto, pero no la cita distorsionada.
- #123 → invierte el art. 81 num. 24 para concluir que el jefe "viola el artículo".
- **Corrección:** reglas de jerga e intención para "renunciar (al trabajo)", "festivo entre semana" y "sábados". La validación de afirmación (P3) también atenuaría estos casos.

### P10. Sin contexto conversacional — [CÓDIGO]
- #48 "Pero qué horario sería." → "el horario de trabajo en casa es de 7:30 a 5:00" (inventa un sujeto). #51 y #53 eran seguimientos de una conversación.
- **Causa:** `ragService.processQuery(query)` no recibe historial; el `conversationId` solo se usa para logging.
- **Corrección:** detectar consultas anafóricas o incompletas (*pero, y, entonces, eso, esa* + ausencia de sustantivo de dominio) y responder NOT_UNDERSTOOD o pedir aclaración; o pasar el último turno como contexto de reescritura de la consulta. Lo mismo para consultas sin contenido como #33 "En plastitec", que debió ser NOT_UNDERSTOOD.

### P11. Contenido faltante o con huecos en los documentos — [CONTENIDO] (no se arregla con código)
| Tema preguntado | Situación en los docs | Preguntas |
|---|---|---|
| Turnos operativos (horas por turno, día de inicio, sábados, festivos, diciembre) | RIT §22.2: "disposición interna", sin horarios | #8, #12, #17, #37, #47, #52, #145, #146 |
| Horarios administrativos derogados todavía en el RIT | Tablas "vigente hasta el 13-jul-2026" | #8, #21, #28, #29, #32, #98, #140 |
| Temporales frente a vinculados directos (beneficios, jornada, RIT) | No hay nada | #22, #71, #121, #130, #137 |
| Vacaciones colectivas / de diciembre | No hay nada | #40, #128, #131, #148 |
| Código de Ética: área que recibe reportes; definición de conflicto de interés y a quién comunicarlo | El I-RH-017 `.md` solo trae tipologías y §15 (gap conocido del 2026-10-08) | #78, #80 |
| Clasificación de riesgo (ARL) de la empresa / "DM" | No hay nada | #18 |
| Crecimiento, ascensos, metas de producción numéricas | Solo el art. 93 (evaluación de desempeño) y el art. 83 (metas por máquina, sin cifras) | #30, #31, #35 |
| Número de emergencias, duración de la inducción, pérdida de la escafandra, devolución de la dotación | No hay nada | #142, #99, #124, #86 |

### P12. Bloque de fuentes poco fiable — [CÓDIGO] (menor)
- El bloque "📎 Información extraída de" lista **todos los documentos recuperados**, no los usados. Ejemplos: "Instructivo de Lavado de Manos" en una respuesta sobre tipo de contrato (#122); "Ingreso a Áreas Negras" en preguntas de lavado de manos.
- Con conf ≥ 0,70 el bloque se oculta (ver §2).
- **Corrección:** listar solo las fuentes de las que proviene la evidencia extraída y mostrar siempre las fuentes (o al menos cuando la respuesta cita un artículo).

---

## 4. Problemas de contenido frente a problemas de código (resumen)

| Tipo | Problemas | Peso aproximado en este set |
|---|---|---|
| **Código: prompt/LLM** (fuga few-shot, no abstención, malinterpretación, omisiones con el dato en contexto, degeneración) | P2, P4, P5-LLM, P8, P9 | ~60 % de los fallos |
| **Código: validación de citas** | P3 | ~10 % de las incorrectas, pero las más peligrosas (dan apariencia de norma) |
| **Código: retrieval** | P5-retrieval, mezcla de chunks obsoletos (P1) | ~15 % |
| **Código: reglas** (premisa, privacidad, consultas anafóricas) | P6, P7, P10 | 6 casos |
| **Contenido** (docs sin el dato o con datos derogados) | P1 (parte), P11 | ~25 preguntas tocan un hueco de contenido; en esos casos el problema de código es no abstenerse |

---

## 5. Recomendaciones priorizadas

1. **[CÓDIGO, rápido]** Quitar del prompt el ejemplo con un dato real (42 h / Ley 2101) y añadir el detector de fuga (P2).
2. **[CONTENIDO, rápido]** Eliminar o marcar como derogadas las tablas HORARIO UNO/DOS del RIT `.md` y reindexar en una colección nueva (no tocar `plastitec_docs_p0` sin el procedimiento de rollback) (P1).
3. **[CÓDIGO]** Validación de afirmación-cita en `citationValidator` (P3), que ataca la mayoría de las alucinaciones "con artículo".
4. **[CÓDIGO]** Afinar el validador de premisas (raíz/lema, solo sustantivo núcleo, no con retrieval fuerte) (P6) y separar el salario mínimo legal del salario personal en privacidad (P7).
5. **[CÓDIGO]** LoopGuard por prefijo/n-gramas + `repeat_penalty` (P8).
6. **[CÓDIGO]** Expansiones de intención coloquial para faltas, terminación, tipo de contrato y funciones conexas (P5).
7. **[CÓDIGO]** Señal de confianza posterior a la generación, calibrada con estas 150 etiquetas; dejar de ocultar fuentes con conf ≥ 0,70 (§2, P12).
8. **[CONTENIDO]** FAQ de RRHH para turnos operativos, temporales, vacaciones de diciembre o colectivas, y completar el Código de Ética (P11).
9. **[CÓDIGO]** Detección de consultas anafóricas o vacías → pedir aclaración (P10).
10. **[CÓDIGO/UX]** El frontend trunca en silencio a 200 caracteres. #10 y #78 llegaron cortadas a mitad de palabra ("…por par"). Avisar al usuario en lugar de truncar.

---

## 6. Notas de método y limitaciones

- **Esquema SQLite:** solo existe `knowledge_base` (`id, question_original, question_normalized, answer, category, source, knowledge_version, last_validated, usage_count, last_used, created_at, confidence, client_ip`) más `sqlite_sequence`. Las 160 filas tienen `category=general`, `source=gemma_rag`, `knowledge_version=0` y `client_ip=127.0.0.1`. Rango: 2026-08-14 a 2026-10-06.
- **Deduplicación:** minúsculas, sin acentos, sin signos → 160 preguntas distintas. No hay forma programática de distinguir benchmarks: todas tienen la misma IP, fuente y versión, y los scripts de benchmark usan `bypass_cache`, que no escribe en caché. Las ~41 preguntas estilo examen (23–24/09, p. ej. "Menciona al menos cinco pasos…") parecen escritas a mano por el equipo de QA de TI en la interfaz, así que **se conservaron** y se reportan aparte.
- **Excluidas (10 casi-duplicados semánticos, para quedar en 150):** IDs 124, 146, 111, 229, 160, 230, 207, 208, 126, 217. Cada una tiene una gemela que sí se ejecutó (p. ej. 124 "Cuáles son los horarios de un técnico de ti" ≈ 123; 146 = 147 + "(Secciones 12 y"; 229 "Vacaciones colectivas" ≈ 201).
- **Ejecución:** secuencial, `conversationId = "sqlite-regresion-2026-10-09"`, `bypass_cache: true`, node `fetch` en UTF-8. La corrida se cortó una vez en la pregunta 142 (el proceso en background terminó con código 9, sin error HTTP) y se reanudó desde el JSON parcial; no hubo errores 4xx/5xx.
- **SQLite durante la corrida:** `knowledge_base` pasó de 160 a 161 filas y cambiaron `usage_count`/`last_used` de los IDs 46, 47 y 95, además de crearse el ID 238 ("¿Cuál es el procedimiento de lavado de manos?"). Esas preguntas **no** son de esta corrida (la 238 no está en el set, y las demás preguntas ejecutadas no se modificaron): hubo **tráfico concurrente** de otros usuarios en el kiosco o la UI. Eso explica latencias de hasta 75 s.
- **Evaluación:** manual, contrastando con los `.md` fuente (RIT y los I-RH-001/003/004/006/009/010/011/012/017). Criterios:
  - PARCIAL = dato principal correcto pero incompleto, con una cita errónea menor o un dato obsoleto secundario.
  - INCORRECTA = la afirmación principal es falsa, inventada o no responde lo preguntado.
  - "vs. caché" compara la utilidad y exactitud de la respuesta nueva frente a la antigua.
  - Algunos casos son de criterio (p. ej. #4, #23, #120, #122). La clasificación de cada pregunta y su justificación están en la tabla siguiente.
- **No verificado:** los PDF originales (el Código de Ética puede tener en PDF el área receptora que falta en el `.md`) ni los `.docx` (`RRHH_IA.docx`, `SST_IA.docx`). La validación se hizo solo contra los `.md` indexados.

---

## 7. Tabla por pregunta

Estado: RESPUESTA = contenido generado; PREMISA = rechazo por premisa no respaldada; PRIVACIDAD = bloqueo confidencial; NO_MATCH / INSUFFICIENT = mensajes de sistema.

| # | ID SQLite | Uso | Pregunta | Conf. nueva (antigua) | Estado | Clasificación | vs. caché | Nota |
|---|---|---|---|---|---|---|---|---|
| 0 | 57 | 9 | ¿Cómo solicito vacaciones? | 0.36 (0.35) | RESPUESTA | **PARCIAL** | igual | No hay procedimiento formal en docs; RIT art.40: a petición del trabajador, la empresa fija la época y avisa con 15 días. NEW inventa 'formulario o documento específico' y omite los 15 días (OLD los atribuía mal al trabajador). |
| 1 | 46 | 7 | ¿Cuántos días de permiso por luto tengo? | 0.34 (0.34) | RESPUESTA | **PARCIAL** | igual | 5 días hábiles correcto (RIT art.46 y art.47 num.7), pero justifica con 'reducción de la Ley 2101 de 2021, vigente a partir de 2026' (ley de jornada laboral: cita alucinada). OLD citaba 'art. 4 num. 7' (también mal). |
| 2 | 47 | 7 | ¿Puedo usar mi celular en la planta? | 0.46 (0.46) | RESPUESTA | **PARCIAL** | empeoró | RIT art.81 num.31: prohibido salvo autorización, emergencias o descansos; BPM: prohibido ingresar/usar celular en áreas de proceso. NEW dice 'estrictamente prohibido' y omite las excepciones que OLD sí daba; tampoco menciona la regla BPM aunque recuperó el BPM. |
| 3 | 49 | 5 | ¿Cuál es el horario de trabajo? | 0.85 (0.84) | RESPUESTA | **PARCIAL** | mejoró | Da 7:30-5:00 L-V como horario general: es el administrativo (desde 14-jul-2026), y el viernes es hasta 4:30. Omite que operativos trabajan por turnos (art.23 §22.2). Conf 0.85. OLD confundía con la franja diurna 6am-7pm. |
| 4 | 95 | 4 | ¿Cómo reporto un accidente laboral? | 0.54 (0.54) | RESPUESTA | **PARCIAL** | mejoró | Correcto según RIT art.65 (informar de inmediato). Omite el flujo de I-RH-004 (jefe/coordinador, brigadista, ARL, centro médico, informar a RRHH) aunque I-RH-004 venía en el contexto. OLD le atribuía al trabajador el plazo de 2 días hábiles del empleador. |
| 5 | 121 | 2 | mi hijo esta enfermo me fui con el a el medico me dieron la incapacidad eso me sirve | 0.44 (0.45) | RESPUESTA | **INCORRECTA** | igual | Atribuye al art.61 la obligación de 'comunicar la enfermedad de su familiar' (el art.61 habla de la enfermedad del propio trabajador) y afirma algo confuso sobre la licencia. Los docs no prevén licencia por enfermedad de un hijo; lo pertinente sería el art.46 (calamidad doméstica) y el art.49 (soportes a RRHH). |
| 6 | 148 | 2 | ¿Qué son las Buenas Prácticas de Manufactura (BPM) según el documento y cuál es su objeto? | 1.00 (0.93) | RESPUESTA | **CORRECTA** | igual | Definición literal del I-RH-003. |
| 7 | 50 | 1 | muy buenos días hágame un favor me puedes comentar y explicar cómo son el esquema de horarios para operarios | 0.35 (0.37) | RESPUESTA | **INCORRECTA** | empeoró | Da el horario administrativo (7:30-5:00) como horario de operarios; según el art.23 §22.2, los operativos trabajan por turnos fijados por disposición interna. Además mete una frase sobre trabajo en casa que no viene al caso. |
| 8 | 51 | 1 | Bueno entonces me puedes explicar cómo son en la rotación y de horarios y de cuándo Cuándo empieza | 0.31 (0.34) | RESPUESTA | **PARCIAL** | empeoró | La rotación por disposición interna está bien. Agrega 'administrativo 08:00 AM a 01:00 PM lunes a jueves': es el HORARIO UNO, vigente solo hasta el 13-jul-2026, y además incompleto. |
| 9 | 52 | 1 | Horario de el area de farmaceutica | 0.58 (0.58) | RESPUESTA | **INCORRECTA** | igual | Afirma que Producción Farmacéutica trabaja de 7:30 a 5:00 'según artículo 22.1', pero el 22.1 es para personal administrativo; el operativo trabaja por turnos (22.2). |
| 10 | 53 | 1 | Bueno entonces me puedes explicar cómo son en la rotación y de horarios y de cuándo Cuándo empieza cada uno… | 0.33 (0.41) | RESPUESTA | **PARCIAL** | igual | Rotación por disposición interna, 42 h y descanso de 20 min: correcto. Relleno irrelevante (vacaciones). Los horarios de cada turno no están en los docs y no lo dice. |
| 11 | 54 | 1 | Que pasa si falto un dia al trabajo | 0.38 (0.38) | RESPUESTA | **PARCIAL** | mejoró | Solo cita el art.61 (inasistencia injustificada). Omite la consecuencia real: art.101 A-III/B-III (1.ª vez suspensión hasta 8 días; 2.ª hasta 2 meses), art.27 (pérdida del dominical) y art.102 (3.ª vez falta grave). Top score 0.45. |
| 12 | 55 | 1 | Enpesando turno q turno nos tocaria mañana tarde o nov | 0.53 (0.51) | RESPUESTA | **INCORRECTA** | empeoró | Inventa 'según artículo 101, el turno de la tarde 02:00 PM A 05:00 PM': el art.101 trata de faltas y esa franja es el HORARIO DOS administrativo obsoleto. Los turnos operativos no están en los docs. OLD reconocía que no había respuesta explícita. |
| 13 | 56 | 1 | Quiero saber si para completar lss 42 horas semanales srgun la ley se trabaja en plastitec en el area de pr… | 0.41 (0.43) | RESPUESTA | **FALSO NEGATIVO** | igual | Dice que 'no se menciona' si se trabaja el sábado, pero el art.39 parágrafo dice que el personal operativo labora 6 días hábiles por semana y el art.23 par.4, que las 42 h se distribuyen en 5 o 6 días. Rellena con horas extras/2 h recreativas, que no vienen al caso. |
| 14 | 59 | 1 | Quien nos certifica en la empresa plastitec | 0.58 (0.54) | RESPUESTA | **PARCIAL** | empeoró | Normas y años correctos (ISO 9001 2004, ISO 13485 2018), pero la pregunta es 'quién' y omite las entidades (BVQI, ICONTEC), que OLD sí daba (ICONTEC). |
| 15 | 62 | 1 | 2 responsabilidades en el rit de prastistec | 0.55 (0.66) | RESPUESTA | **PARCIAL** | mejoró | Los ítems vienen del art.82, pero son PROHIBICIONES y no responsabilidades 'en materia de SST'. Las obligaciones del trabajador están en los arts. 71 y 79. OLD alucinaba sobre el COPASST. |
| 16 | 63 | 1 | Como se compensan las horas en una semana con dia festivo? | 0.48 (0.48) | RESPUESTA | **PARCIAL** | mejoró | Recargo festivo del 90% desde el 1-jul-2026 (art.35 par.3): correcto, pero no responde cómo se compensan las horas de la semana (los docs no lo detallan; algo relacionado en arts. 24 y 38). OLD citaba 'art. 24 de la Ley 789' (incorrecto). |
| 17 | 64 | 1 | Como serian los horarios para el turno 3 en una semana con festivo? | 0.43 (0.44) | RESPUESTA | **NO RESPONDE CORRECTAMENTE** | mejoró | Reconoce que los horarios del turno 3 no están especificados (correcto: no están en los docs). |
| 18 | 65 | 1 | En que riesgo esta clasificado el dm de plastitec | 0.45 (0.45) | RESPUESTA | **INCORRECTA** | igual | Pregunta ambigua (DM = dispositivo médico / clase de riesgo ARL). Los docs no traen ninguna clasificación de riesgo de la empresa. NEW 'clasifica' el DM en el riesgo LA/FT/FPADM del Código de Ética: asociación inventada. Debió abstenerse. |
| 19 | 66 | 1 | Puedo un dia pedir un permiso si tengo que un asunto importante y debo asistir | 0.27 (0.26) | RESPUESTA | **INCORRECTA** | empeoró | Afirma que el art.47 da licencia remunerada para 'un asunto importante' con soporte de autoridad competente: generaliza el num.10 (citaciones judiciales). No existe licencia remunerada genérica; ver art.46 (permisos tasados) y el conducto regular de permisos (art.101 B-V). Conf 0.27. |
| 20 | 67 | 1 | Como seria el manejo de horas por semanas | 0.37 (0.37) | RESPUESTA | **CORRECTA** | mejoró | 42 h y jornada flexible (art.23 par.4 y par.5 b) correctos. Reusa literal la frase del ejemplo del prompt ('vigente a partir de 2026'), aquí sin daño. OLD citaba 'art. 23 de la Ley 2101' (incorrecto). |
| 21 | 68 | 1 | Que horario es el de operaria farmaceutica plastitec | 0.60 (0.60) | RESPUESTA | **INCORRECTA** | igual | Da el HORARIO UNO administrativo (8-1 L-J), vigente solo hasta el 13-jul-2026, como horario de operaria farmacéutica. El personal operativo trabaja por turnos (22.2). |
| 22 | 69 | 1 | Los trabajadores contratados por temporal tienen beneficios en diciembre . Cuales | 0.42 (0.39) | INSUFFICIENT | **NO RESPONDE CORRECTAMENTE** | mejoró | INSUFFICIENT. Los docs no distinguen los beneficios de los temporales. OLD afirmaba sin respaldo que tenían el 'detalle navideño'. |
| 23 | 70 | 1 | Cómo vas maquillaje | 0.56 (0.78) | RESPUESTA | **PARCIAL** | igual | Pregunta coloquial ('cómo va lo del maquillaje'). Dice que está prohibido en el vestier (I-RH-006/009/011), pero omite la prohibición BPM de maquillaje de cualquier tipo en áreas de proceso y el deterioro de la escafandra. |
| 24 | 72 | 1 | Por que motivo la empresa me terminaria el contrato | 0.24 (0.30) | RESPUESTA | **INCORRECTA** | igual | Mezcla el Decreto 0223/2026 (contrato de APRENDIZAJE, art.21) con las faltas de acoso (art.143). No recupera el art.110 (causales de terminación con justa causa). Top score 0.36, conf 0.24. |
| 25 | 74 | 1 | Cuales son las bpm | 0.84 (0.76) | RESPUESTA | **PARCIAL** | igual | 'Cuáles son las BPM' se responde solo con las reglas de la cofia. Falta la definición y el resto de normas (higiene, prohibiciones, registros, PNC, áreas). Conf 0.84. |
| 26 | 75 | 1 | Que beneficios tengo como trabajador | 0.47 (0.55) | RESPUESTA | **CORRECTA** | igual | Lista completa de beneficios del I-RH-001. |
| 27 | 76 | 1 | Cuales son los beneficios de trabajar en plastitec | 0.67 (0.61) | RESPUESTA | **CORRECTA** | igual | Lista de beneficios del I-RH-001 (abreviada, pero correcta). |
| 28 | 77 | 1 | Cuales son los horarios de trabajadores en plastitec | 0.74 (0.74) | RESPUESTA | **INCORRECTA** | igual | Mezcla los HORARIOS UNO y DOS (obsoletos desde el 14-jul-2026) como horario general y cita el 'artículo 22' (que trata de trabajadores transitorios). No da el vigente (7:30-5:00, viernes 4:30) ni los turnos operativos. Conf 0.74. |
| 29 | 78 | 1 | Cuales son los horarios de las operarias de plastitec | 0.64 (0.64) | RESPUESTA | **INCORRECTA** | igual | Presenta los HORARIOS UNO/DOS del personal ADMINISTRATIVO, ya derogados, como horario de las operarias. |
| 30 | 79 | 1 | En plastitec hay oportunidad de crecimiento lA | 0.47 (0.46) | RESPUESTA | **INCORRECTA** | igual | Responde con la frase literal del ejemplo del prompt (42 h, Ley 2101), que no tiene que ver con la pregunta. Los docs no hablan de crecimiento/ascensos: debió abstenerse. |
| 31 | 80 | 1 | Que miran para poder crecer dentro de la compañia de plastitec ? | 0.53 (0.53) | RESPUESTA | **INCORRECTA** | igual | Contesta con obligaciones genéricas (comunicar observaciones, colaborar ante siniestros) sin relación con el crecimiento. Lo más cercano es el art.93 (criterios de evaluación de desempeño), que no recupera. |
| 32 | 81 | 1 | Horarios de de operarias de produccion en plastitec ? | 0.62 (0.62) | RESPUESTA | **INCORRECTA** | empeoró | Da el horario administrativo 8-1 'hasta el 13 de julio de 2026' (vencido) como horario de operarias de producción. OLD decía que no había info específica (mejor). |
| 33 | 82 | 1 | En plastitec | 0.81 (0.88) | RESPUESTA | **INCORRECTA** | igual | Consulta sin contenido ('En plastitec'): debió ser NOT_UNDERSTOOD. Devuelve la plantilla de 42 h con conf 0.81. |
| 34 | 83 | 1 | Cuales son riesgos mas comunes en la area en plastitec | 0.54 (0.56) | RESPUESTA | **INCORRECTA** | empeoró | Respuesta genérica sin datos ('accidentes, enfermedades y lesiones... pueden variar'). El I-RH-004 §Clasificación de Riesgos lista físicos, químicos, mecánicos, eléctricos, biológicos, ergonómicos, psicosociales, locativos, naturales, tránsito/público. OLD sí los listaba. |
| 35 | 84 | 1 | Cuanta produccion hay que sacar al dia o la semana obligatoriamente en plastitec | 0.45 (0.45) | RESPUESTA | **FALSO NEGATIVO** | igual | Arranca con un trozo del razonamiento del ejemplo del prompt ('RIT CAPÍTULO VII establece 42 horas...') y luego dice que no se especifica. El art.83 (estándares de productividad por maquinaria) sí responde: metas definidas por la empresa por máquina/turno, variables y previamente informadas. |
| 36 | 85 | 1 | A cuanto tiempo trabajando en la empresa,puedes cambiar el tipo de contrato. Has entendido, responde con un… | 0.00 (0.22) | NO_MATCH | **FALSO NEGATIVO** | empeoró | NO_MATCH con conf 0. El art.3 sí responde: el término fijo no puede pasar de 4 años; si se supera o no es escrito, se entiende indefinido (y desde la 4.ª prórroga, renovación mínima de 1 año). La coletilla 'responde con una sola palabra. Si o no' probablemente degrada el retrieval. |
| 37 | 86 | 1 | Cuales es el horario de los turnos para operarias PRF mañana,tarde y noche | 0.43 (0.43) | RESPUESTA | **INCORRECTA** | empeoró | Llama '22.1 [Personal operativo]' a lo que es el 22.2 y luego da el horario ADMINISTRATIVO (7:30-5:00 / viernes 4:30) como horario de los turnos operativos. OLD reconocía que los turnos PRF no estaban especificados. |
| 38 | 89 | 1 | ¿Cuántas áreas de producción hay? | 0.54 (0.50) | RESPUESTA | **INCORRECTA** | igual | Confunde áreas de proceso con la clasificación por contaminación (negras/grises/blancas) y dice que no se especifica. El I-RH-001 dice: áreas de proceso operativo = Logística, Inyección, Extrusión y Producción Farmacéutica. |
| 39 | 90 | 1 | ¿En que consiste el área de inyección? | 0.46 (0.52) | RESPUESTA | **CORRECTA** | igual | Coincide con el I-RH-001 (cúpula, mariposa, tapa; mezcla y peletizado). |
| 40 | 91 | 1 | ¿Hay vacaciones a fin de año? | 0.46 (0.45) | RESPUESTA | **PARCIAL** | igual | Cita bien el art.40 (concesión oficiosa o a petición), pero no aclara que los docs no establecen vacaciones colectivas de fin de año. |
| 41 | 92 | 1 | ¿Se trabajan los días festivos? | 0.46 (0.46) | RESPUESTA | **PARCIAL** | igual | Correcto que son de descanso obligatorio remunerado (art.35), pero omite que si se trabajan se pagan con recargo (90% desde el 1-jul-2026, art.35 par.3), que OLD sí mencionaba. Relevante para el personal operativo. |
| 42 | 94 | 1 | ¿Se pueden usar licras debajo del uniforme? | 0.59 (0.58) | RESPUESTA | **FALSO NEGATIVO** | mejoró | Dice 'no se menciona'. Los I-RH-009/010/011 dicen 'No debe ingresar con ningún tipo de ropa diferente a la suministrada en la dotación' y que la ropa de calle se deja en el locker: la respuesta implícita es NO. OLD inventaba una relación con la lavandería. |
| 43 | 102 | 1 | Tengi acceso a un manual de procedimientos | 0.33 (0.33) | RESPUESTA | **FALSO NEGATIVO** | igual | Respuesta contradictoria ('puede acceder... pero no se menciona'). El I-RH-004 (Derechos de los trabajadores) da derecho a conocer normas, procedimientos e instructivos, y el BPM dice que los instructivos están publicados en todas las áreas de ingreso. Top score 0.45. |
| 44 | 103 | 1 | Se pueden hacer horas extras | 0.84 (0.83) | RESPUESTA | **CORRECTA** | igual | Art.31: máx. 2 h/día y 12 h/semana. Podría añadir que requieren autorización (art.32 par.2 / art.34). |
| 45 | 104 | 1 | Hasta que hora vs el recargo nocturno | 0.83 (0.82) | RESPUESTA | **PARCIAL** | mejoró | Pregunta HASTA QUÉ HORA va el recargo nocturno; responde el porcentaje (35%, art.33) y no la franja de 7:00 p.m. a 6:00 a.m. (art.29). Conf 0.83. |
| 46 | 105 | 1 | Horarios los dias sabados | 0.44 (0.44) | RESPUESTA | **INCORRECTA** | igual | Malinterpreta el art.24: no se amplía la jornada del sábado, sino la de los días hábiles (hasta 2 h) para compensar el descanso del sábado. Tampoco dice que el operativo labora 6 días (art.39 par.). |
| 47 | 106 | 1 | Que dia empiesan los turnos de noche | 0.48 (0.48) | RESPUESTA | **NO RESPONDE CORRECTAMENTE** | igual | Correcto: no se especifica. Cita mal el apartado ('23.1'; es el 22.2 dentro del art.23). |
| 48 | 107 | 1 | Pero que horario seria. | 0.58 (0.57) | RESPUESTA | **INCORRECTA** | empeoró | Pregunta de seguimiento sin contexto ('Pero qué horario sería'). Responde 'horario de trabajo EN CASA 7:30-5:00' (es el administrativo). Debió pedir aclaración. |
| 49 | 109 | 1 | Cuanto nos pagan por 10 dias de trabajo | — (0.42) | PRIVACIDAD | **NO RESPONDE CORRECTAMENTE** | mejoró | Bloqueo de privacidad (salarios): consistente con la regla de producto. OLD inventaba un cálculo con 42 h. Matiz: se podría citar el art.54 (pago mensual). |
| 50 | 110 | 1 | Si dan las vacaciones | 0.55 (0.54) | RESPUESTA | **PARCIAL** | igual | 'Si dan las vacaciones' se responde con el salario durante las vacaciones (art.44). Lo esencial es el art.39: 15 días hábiles por año de servicio. |
| 51 | 112 | 1 | Que horarios maneja la empresa plastitec | 0.61 (0.62) | RESPUESTA | **PARCIAL** | igual | Vaga ('establece horarios específicos'): no transcribe el horario administrativo vigente ni dice que el operativo va por turnos, pese a la regla de transcripción de tablas del prompt. |
| 52 | 113 | 1 | En los turnos de tarde se trabaja desde que dia hasta que dia | 0.48 (0.48) | RESPUESTA | **INCORRECTA** | empeoró | Inventa que el turno de tarde va 'desde la hora de cierre del día hasta la apertura del día siguiente'. Los docs no definen los turnos: debió abstenerse. |
| 53 | 114 | 1 | Cuales son los horarios para el personal operativo | 0.75 (0.75) | RESPUESTA | **PARCIAL** | igual | Abre con la plantilla de 42 h y luego dice bien que trabajan en jornadas sucesivas/turnos (art.23 §22.2). Omite que la programación es por disposición interna, los 6 días hábiles (art.39) y el descanso de 20 min. Conf 0.75. |
| 54 | 115 | 1 | necestito saber si yo trabajo el dia domingo porque valor me pagan esas extras | 0.34 (0.34) | RESPUESTA | **PARCIAL** | empeoró | Dice que hay recargo dominical (art.35), pero no da el valor (90% desde el 1-jul-2026, 100% desde 2027), que era justo lo que se preguntaba y OLD sí daba. Añade una frase confusa sobre 'derecho a trabajar en domingo'. |
| 55 | 116 | 1 | vale tengo una duda que hago si estoy sufriendo acoso por uno de mis compañeros | 0.49 (0.50) | RESPUESTA | **PARCIAL** | igual | Para acoso LABORAL entre compañeros aplica el protocolo de acoso SEXUAL (art.139) y habla de notificar a autoridades. No menciona el Comité de Convivencia Laboral ni el trámite del art.136 (queja, audiencia, plan de mejora; si no hay acuerdo, inspector de trabajo). |
| 56 | 117 | 1 | si soy trabajador con contrato rotativo, y por aval de mi jefe inmediato, puedo trabajar de 7am a 5pm cumpl… | 0.44 (0.45) | PREMISA | **RECHAZO INDEBIDO** | empeoró | Rechazo por premisa no respaldada: «rotativo» no está en los docs, pero 'rotación' y 'turnos' sí. El art.23 par.5 b) (jornada flexible por acuerdo: 42 h en máx. 6 días, de 4 a 9 h diarias) responde la pregunta. Es un falso positivo del validador. |
| 57 | 118 | 1 | describeme el articulo 23 del reglamento interno del trabajo | 0.76 (0.65) | RESPUESTA | **PARCIAL** | igual | Reduce el art.23 a '42 h en 2026'. El artículo cubre horarios administrativos, turnos operativos, descansos de 20/25 min y los parágrafos 1-5. Conf 0.76. |
| 58 | 119 | 1 | puedo pedir vacaciones incluso si no he completado el año de contrato | 0.30 (0.30) | RESPUESTA | **FALSO NEGATIVO** | igual | Habla de prórroga de contratos (fuera de tema) y dice que no se menciona. Los arts. 39 (15 días por año servido), 3 par., 5 par. y 45 par. (vacaciones proporcionales en contratos fijos <1 año) sí son pertinentes. Top score 0.43. |
| 59 | 120 | 1 | las horas extras son obligatorias? | 0.71 (0.71) | RESPUESTA | **INCORRECTA** | igual | Deduce 'no son obligatorias para todos' de los topes del art.31 y su excepción para seguridad/salud: non sequitur. Lo documentado es que solo se reconocen si la empresa las autoriza expresamente (arts. 32 par.2, 34) y que trabajarlas sin autorización está prohibido (art.82 num.5). Conf 0.71. |
| 60 | 122 | 1 | Cómo son los horarios de un técnico | 0.52 (0.52) | RESPUESTA | **INCORRECTA** | igual | Afirma sin respaldo que el personal administrativo incluye a los 'técnicos'. Los docs no clasifican el cargo de técnico. |
| 61 | 123 | 1 | Cómo son los horarios de un técnico de ti | 0.52 (0.52) | RESPUESTA | **INCORRECTA** | igual | Llama 'horario del personal operativo' al horario administrativo (7:30-5:00). |
| 62 | 125 | 1 | cuales licencias son remuneradas | 0.41 (0.46) | RESPUESTA | **PARCIAL** | mejoró | Lista maternidad, paternidad y luto (duplicado como 'fallecimiento' y 'luto'). Omite las del art.47: lactancia, parental compartida/flexible, citas médicas de urgencia/especialista (num.8), acompañamiento escolar (num.9) y citaciones judiciales (num.10). |
| 63 | 127 | 1 | de cuanto es el tiempo de licencia por paternidad | 0.50 (0.50) | RESPUESTA | **CORRECTA** | igual | Art.47 num.5: 2 semanas, ampliables hasta 5. |
| 64 | 128 | 1 | cual es la diferencia entre gran servicios y plastitec | 0.39 (0.52) | INSUFFICIENT | **NO RESPONDE CORRECTAMENTE** | mejoró | 'Gran Servicios' no aparece en ningún documento: INSUFFICIENT es correcto. OLD divagaba. |
| 65 | 129 | 1 | es legal realizar funciones que no están estipuladas en el contrato laboral | 0.39 (0.39) | RESPUESTA | **INCORRECTA** | igual | 'Según el artículo 123 del RIT... no son legales': el art.123 trata del trabajo REMOTO. El art.71 lit. n) dice que el trabajador desempeña las funciones del cargo y las 'conexas o complementarias'. Afirmación jurídica inventada. |
| 66 | 130 | 1 | como puedo pedir mis vacaciones | 0.21 (0.30) | RESPUESTA | **PARCIAL** | igual | Tergiversa el art.40: es la EMPRESA la que avisa la fecha con 15 días de anticipación, no que 'responda dentro de 15 días'. Conf 0.21 (casi en el piso). |
| 67 | 131 | 1 | ¿Cuál es el período máximo de prueba según el reglamento y qué sucede si el trabajador continúa laborando d… | 0.38 (0.37) | RESPUESTA | **CORRECTA** | igual | Art.8: máx. 2 meses. Sin estipulación escrita, normas generales del contrato (art.7). Podría citar el art.9 para la continuidad tras expirar. |
| 68 | 132 | 1 | como puedo pedir un dia no remunerado | 0.40 (0.38) | RESPUESTA | **PARCIAL** | igual | Genérica y con un supuesto inventado ('al programar su jornada'). Los docs solo dicen que hay un conducto regular/procedimiento interno para permisos remunerados o no (art.101 B-V) y que las ausencias se avisan al jefe inmediato (art.49). No hay procedimiento detallado: debió decirlo. |
| 69 | 133 | 1 | ¿Cuáles son las fechas de entrega de dotación establecidas en el reglamento y cuál es el requisito de remun… | 0.50 (0.57) | RESPUESTA | **CORRECTA** | igual | Art.58: 30-abr, 30-ago, 30-dic, hasta 2 SMMLV. Omite el requisito de >3 meses de servicio y que el par.2 (convención) fija 30-abr, 31-ago y 20-dic para prendas de labor. |
| 70 | 134 | 1 | ¿Cómo se remunera el trabajo en domingo y festivos según el reglamento? Indica los porcentajes de recargo y… | 0.40 (0.40) | RESPUESTA | **CORRECTA** | mejoró | 80% / 90% / 100% en las fechas correctas (art.35 par.3). OLD lo atribuía a la 'Ley 2101'. |
| 71 | 135 | 1 | que reglamento interno del trabajo le aplica a travahadires externos | 0.58 (0.47) | RESPUESTA | **INCORRECTA** | cambió de sentido | Cita el art.1 añadiendo 'incluidos los trabajadores externos', que NO está en el texto (el art.1 dice 'todos sus trabajadores'). Los docs no regulan si el RIT aplica a temporales/externos: debió abstenerse o matizar. |
| 72 | 136 | 1 | ¿Cuál es la duración de la licencia remunerada por paternidad según el reglamento y cuál es el único soport… | 0.48 (0.52) | RESPUESTA | **CORRECTA** | igual | Art.47 num.5: 2 semanas ampliables a 5; soporte: Registro Civil de Nacimiento. |
| 73 | 137 | 1 | ¿Qué obligación especial tiene el empleador respecto a la desconexión laboral de los trabajadores y qué nor… | 0.37 (0.49) | RESPUESTA | **CORRECTA** | igual | Art.77 num.18: respetar la desconexión laboral, Ley 2191 de 2022. |
| 74 | 138 | 1 | como puedo renunciar despues de haber tomado las vacaciones | 0.37 (0.36) | RESPUESTA | **INCORRECTA** | igual | Entiende 'renunciar A las vacaciones' en lugar de 'renunciar al empleo después de vacaciones'. Los docs tienen el preaviso de 30 días del art.4 (indefinido) y los arts. 3/5 (fijo/obra). Recomienda 'consultar un abogado'. |
| 75 | 139 | 1 | mi niño se enfermo y tengo la incapacidad de el, como puedo pasar esa incapacidad con recursos humanos | 0.40 (0.40) | RESPUESTA | **INCORRECTA** | igual | Tergiversa otra vez el art.61 ('el empleador hará que el FAMILIAR sea examinado'). La regla de interpretación de jerga 'hijo enfermo = familiar' (P0 2026-10-08) no impide la cita distorsionada. Lo sustentable: art.49 (avisar al jefe y presentar soportes a RRHH) y art.46 (calamidad doméstica). |
| 76 | 141 | 1 | si mi jefe regaña a un compañero, se puede considerar acoso laboral? | 0.72 (0.70) | PREMISA | **RECHAZO INDEBIDO** | empeoró | 'No encontré información sobre «regaña»' con conf 0.72 y top score 1.24. Los arts. 128 (trato hostil o intimidatorio) y 129 (NO es acoso ejercer la potestad disciplinaria o exigir el cumplimiento de reglamentos) responden de lleno. El validador trata un verbo coloquial como premisa sin respaldo. |
| 77 | 142 | 1 | siendo trabajador de plastitec, puedo vender o comercializar elementos fuera o dentro de la empresa? | 0.40 (0.40) | RESPUESTA | **INCORRECTA** | igual | 'Según el art.81... no están autorizados a vender o comercializar fuera de la empresa': el art.81 no habla de ventas. Prohíbe colectas, rifas y propaganda en lugares de trabajo (num.7) y sustraer productos (num.1); el art.91 a) trata los negocios paralelos que compitan (conflicto de interés). Nada prohíbe vender 'fuera'. |
| 78 | 143 | 1 | ¿Qué área de PLASTITEC es la designada para recibir y tratar todo reporte, violación y/o incumplimiento al … | 0.85 (0.66) | RESPUESTA | **INCORRECTA** | cambió de sentido | El I-RH-017 (.md) NO nombra el área designada para recibir reportes (hueco de contenido conocido). NEW la inventa ('Dirección General y/o Gerencia', tomada de §13 Propiedad Intelectual). La 2.ª parte (falta grave → medida disciplinaria o terminación con justa causa, §15) es correcta. Conf 0.85. |
| 79 | 144 | 1 | ¿Qué sistemas de gestión y control ha implementado y adoptado PLASTITEC para prevenir el riesgo de lavado d… | 1.00 (1.00) | RESPUESTA | **CORRECTA** | igual | SAGRILAFT y OEA (I-RH-017 §3). Conf 1.0. |
| 80 | 145 | 1 | ¿Cómo define el Código de Ética el conflicto de interés y a quién debe comunicarlo el colaborador que se en… | 0.87 (0.90) | RESPUESTA | **PARCIAL** | igual | El Código de Ética (.md) solo lista tipos (negociación, parentesco, afectiva, familiar), sin definición ni destinatario. NEW responde con el RIT (arts. 90/92: Gerencia o RRHH), correcto en sustancia pero sin aclarar que la fuente no es el Código, y omite las tipologías del Código. |
| 81 | 147 | 1 | ¿Qué compromiso adquieren los colaboradores frente a la información confidencial y la propiedad intelectual… | 0.56 (0.63) | RESPUESTA | **CORRECTA** | mejoró | I-RH-017 §12 y §13 (protección durante y después de la relación laboral). OLD citaba el 'art. 13 del reglamento' (incorrecto). |
| 82 | 150 | 1 | ¿Cómo se clasifican las áreas según el nivel de contaminación? Menciona al menos dos ejemplos de cada tipo … | 0.64 (0.65) | RESPUESTA | **PARCIAL** | mejoró | Da las tres categorías, pero lista los ejemplos sin asignarlos a cada tipo (que era lo que se pedía). OLD los asignaba mal. |
| 83 | 151 | 1 | ¿Cuáles son las reglas establecidas para el uso de la cofia? Indica dónde debe colocarse y retirarse, y qué… | 0.65 (0.71) | RESPUESTA | **CORRECTA** | mejoró | Reglas del I-RH-003 (baño; no en locker/pasillos/cafetería/escaleras; retirar entre plantas; tapar oídos). Repite una línea. OLD decía 'vestier' (incorrecto). |
| 84 | 152 | 1 | ¿Qué prohibiciones se establecen en el documento respecto a objetos personales, joyas, maquillaje, celular,… | 0.68 (0.77) | RESPUESTA | **PARCIAL** | igual | Lista prohibiciones BPM reales (joyas, cabeza descubierta, fumar, beber, comer, medicamentos, herramientas), pero omite justo dos de las pedidas: maquillaje (mujeres) y celular ('no ingresar y utilizar celular en áreas de proceso'). También omite música y barba. |
| 85 | 153 | 1 | ¿Cuál es la misión y cuál es la visión de PLASTITEC según el documento? | 0.76 (0.63) | RESPUESTA | **CORRECTA** | mejoró | Misión y visión literales del I-RH-001. OLD no la encontraba. |
| 86 | 154 | 1 | cuando se realice la entrega de dotacion, la dotacion anterior hay que devolverla? | 0.50 (0.56) | RESPUESTA | **INCORRECTA** | empeoró | 'Según el art.58... el trabajador tiene la obligación de devolver la dotación anterior': el art.58 no dice nada de devolver. Los docs no regulan la devolución. OLD decía correctamente que no se menciona. |
| 87 | 155 | 1 | ¿Qué certificaciones ha obtenido PLASTITEC, con qué normas y en qué años? Menciona también las entidades ce… | 0.39 (0.40) | RESPUESTA | **PARCIAL** | mejoró | Normas y entidades correctas (ISO 9001-BVQI, ISO 13485-ICONTEC), pero omite los años pedidos (2004, mantenida hasta 2018; 2018). |
| 88 | 156 | 1 | 3. Nombres y cargos directivos Según el documento, ¿quiénes ocupan los cargos de Gerente, Director Técnico … | 0.61 (0.35) | RESPUESTA | **FALSO NEGATIVO** | empeoró | Dice que el documento no da los nombres y remite a otros docs. El I-RH-001 sí los trae: Gerente Luis Felipe Osorio; Dir. Técnico y Gestión Calidad Wilmer Hernández; Dir. RRHH Aura Ma. Niño Mejía. OLD respondía bien. Top score 0.87. |
| 89 | 157 | 1 | ¿Qué áreas de proceso se mencionan en el documento y qué operaciones realiza específicamente el área de Pro… | 0.49 (0.48) | RESPUESTA | **PARCIAL** | igual | Las operaciones de Producción Farmacéutica son correctas (Screen, Sellado colas/bocas, Ensamble, Soplado, Grafado), pero no lista las áreas de proceso (Logística, Inyección, Extrusión, Producción Farmacéutica) y añade prohibiciones que no vienen al caso. |
| 90 | 158 | 1 | Menciona al menos cinco beneficios que PLASTITEC ofrece a sus trabajadores según el documento. | 0.61 (0.57) | RESPUESTA | **CORRECTA** | igual | Más de 5 beneficios del I-RH-001. |
| 91 | 159 | 1 | cual es el horario del personal administrativo? | 0.91 (0.91) | RESPUESTA | **PARCIAL** | igual | Dice '7:30 a 5:00 de lunes a viernes', pero el viernes es de 7:30 a 4:30 (art.23 §22.1 vigente). Error de dato con la confianza más alta del set (0.91). |
| 92 | 161 | 1 | ¿Cuál es el procedimiento correcto para el ingreso a áreas blancas según el instructivo I-RH-011? Menciona … | 0.54 (0.50) | RESPUESTA | **PARCIAL** | igual | Lista los pasos 3-7 del I-RH-011 como si fueran el inicio del procedimiento. Omite los pasos 1 (cofia + protección auditiva, sin maquillaje) y 2 (zapatos antes de la línea amarilla). |
| 93 | 162 | 1 | ¿Qué se debe hacer con los zapatos de calle y la ropa de calle antes de ingresar al vestier? ¿Dónde se guar… | 0.66 (0.65) | RESPUESTA | **PARCIAL** | empeoró | Omite que los zapatos de calle se guardan DENTRO DE UNA BOLSA PLÁSTICA en el locker (I-RH-009/011) y se contradice ('no se menciona dónde... en el locker asignado'). OLD era completa. |
| 94 | 163 | 1 | ¿Qué elementos de protección personal se deben colocar para ingresar al área blanca y en qué orden? Mencion… | 0.72 (0.78) | RESPUESTA | **PARCIAL** | mejoró | Secuencia de ingreso parcial: omite la blusa blanca, el lavado de manos y las POLAINAS (pedidas expresamente). Acierta al decir que la colocación de la escafandra no está explícita (solo su retiro). |
| 95 | 164 | 1 | ¿Qué prohibiciones o restricciones establece el instructivo respecto al maquillaje, accesorios (joyas, relo… | 0.67 (0.61) | RESPUESTA | **CORRECTA** | igual | Sin maquillaje, sin accesorios, sin ropa distinta a la dotación. Coletilla espuria 'No se menciona restricción específica para 2026' (eco del ejemplo del prompt). |
| 96 | 165 | 1 | ¿Qué se debe hacer al salir del área blanca? Detalla los pasos de retiro, indicando qué elementos se retira… | 0.35 (0.49) | RESPUESTA | **PARCIAL** | mejoró | Nombra los elementos en el orden correcto (escafandra y guantes → polainas → uniforme), pero afirma que 'no se menciona el orden', cuando el I-RH-011 sí lo da (pasos 12-14). Omite 'no retirarse la cofia'. Conf 0.35. |
| 97 | 166 | 1 | hola cuanto tiempo de descanso tengo en mi turno | 0.55 (0.52) | RESPUESTA | **CORRECTA** | igual | 20 min para el personal operativo (art.23). Podría mencionar los 2 descansos de 25 min de las embarazadas. |
| 98 | 167 | 1 | si estoy en horario administrativo cuanto tengo de almuerzi | 0.73 (0.74) | RESPUESTA | **PARCIAL** | igual | 'Almuerzo de 1:00 a 2:00 PM' sale de los HORARIOS UNO/DOS derogados. El horario vigente (desde el 14-jul-2026) solo dice 'su hora de almuerzo correspondiente', sin fijar la franja. |
| 99 | 168 | 1 | cuanto es el tiempo de induccion | 0.31 (0.31) | RESPUESTA | **NO RESPONDE CORRECTAMENTE** | mejoró | Correcto: la duración de la inducción no está en los docs. Mete la frase de las 42 h, que no viene al caso. OLD alucinaba '30 segundos'. |
| 100 | 169 | 1 | que pasa si hago funciones que no estan en mi manual de funciones | 0.35 (0.23) | RESPUESTA | **FALSO NEGATIVO** | mejoró | Cita los arts. 83 y 118 (no vienen al caso) y da un consejo genérico. Lo pertinente es el art.71 lit. n): desempeñar las funciones del cargo y las 'conexas o complementarias'. Top score 0.38. |
| 101 | 170 | 1 | ¿Cuál es el procedimiento correcto para el ingreso al área gris según el instructivo I-RH-009? Menciona al … | 0.40 (0.48) | RESPUESTA | **INCORRECTA** | igual | Orden inventado (2. desinfectar guantes, 4. retirar guantes, 5. cumplir BPM). El I-RH-009 dice: 1 cofia + protección auditiva, 2 ropa/joyas al locker, 3 blusa blanca, 4 lavado de manos, 5 uniforme, 6 cinta, 7 guantes, 8 desinfección. Top score 0.62. OLD usaba el I-RH-010 (área negra). |
| 102 | 171 | 1 | ¿Qué se debe hacer con la ropa de calle, las joyas y los zapatos de calle antes de ingresar al área gris? ¿… | 0.70 (0.68) | RESPUESTA | **PARCIAL** | empeoró | El dato central es correcto (locker, zapatos en bolsa plástica), pero luego encadena frases absurdas: 'No se menciona dónde se guardan las manos...', '...las polainas'. Salida degenerada, sin cortar. OLD era limpia. |
| 103 | 172 | 1 | ¿Qué elementos de protección personal se deben colocar para ingresar al área gris y en qué orden? Menciona … | 0.76 (0.74) | RESPUESTA | **PARCIAL** | empeoró | Omite la blusa blanca y afirma que 'no se menciona el orden'. El I-RH-009 sí lo da (cofia/auditiva → blusa → uniforme → guantes). OLD daba el orden correcto. |
| 104 | 173 | 1 | ¿Qué prohibiciones o restricciones establece el instructivo respecto al maquillaje y al tipo de ropa que se… | 0.65 (0.59) | RESPUESTA | **PARCIAL** | empeoró | Maquillaje correcto. Dice que no se especifica qué ropa se permite, pero los instructivos dicen 'ningún tipo de ropa diferente a la suministrada en la dotación'. |
| 105 | 174 | 1 | ¿Qué se debe hacer al salir del área gris? Detalla los pasos de retiro, indicando qué elementos se retiran … | 0.49 (0.58) | RESPUESTA | **CORRECTA** | mejoró | I-RH-009: guantes → uniforme, sin retirar la cofia. |
| 106 | 175 | 1 | ¿Cuál es el procedimiento completo para el ingreso al área negra según el instructivo I-RH-010? Enumera los… | 0.55 (0.62) | RESPUESTA | **CORRECTA** | igual | Los 4 pasos literales del I-RH-010. |
| 107 | 176 | 1 | ¿Qué se debe hacer con la ropa de calle y las joyas al ingresar al área negra? ¿Dónde se guardan? | 0.63 (0.63) | RESPUESTA | **CORRECTA** | igual | Locker asignado. Tiene una coletilla autocontradictoria repetida dos veces ('No se menciona dónde se guardan... pero en el locker'). |
| 108 | 177 | 1 | ¿Qué dotación se debe usar en el área negra y qué restricciones se establecen respecto a elementos diferent… | 0.59 (0.67) | RESPUESTA | **INCORRECTA** | empeoró | Atribuye al área NEGRA la dotación del área BLANCA (overol blanco, escafandra, cubre-zapatos). La correcta: I-RH-010 (blusa blanca + overol + EPP de la labor); BPM (uniforme negro o bata azul con cofia). |
| 109 | 178 | 1 | Según la nota final, ¿qué condiciones debe cumplir todo el personal cuyo lugar de trabajo sea el área negra… | 0.47 (0.51) | RESPUESTA | **CORRECTA** | mejoró | Cumplir el instructivo, sin ropa distinta a la dotación, cumplir BPM (I-RH-010). |
| 110 | 179 | 1 | ¿Cuál es el procedimiento completo para el ingreso de visitas a la Planta 2 según el instructivo I-RH-006? … | 0.56 (0.57) | RESPUESTA | **CORRECTA** | igual | Los 14 pasos literales del I-RH-006. |
| 111 | 180 | 1 | ¿Qué se debe hacer con los zapatos y las prendas personales antes de ingresar al vestier? ¿Qué excepción es… | 0.64 (0.63) | RESPUESTA | **CORRECTA** | mejoró | Recoge la excepción de la nota general (los visitantes que no manipulan productos conservan ropa y zapatos bajo el overol y las polainas). OLD la negaba. |
| 112 | 181 | 1 | ¿Qué elementos de protección personal se deben colocar para ingresar al área y en qué orden? Menciona al me… | 0.76 (0.84) | RESPUESTA | **INCORRECTA** | igual | Dice 'se RETIRARÁN las polainas' (se colocan), 'finalmente se colocará la escafandra' (no figura en el ingreso) y que los EPP son 'recomendados u obligatorios según el tipo de trabajo' (inventado). Conf 0.76. |
| 113 | 182 | 1 | ¿Qué prohibiciones o restricciones establece el instructivo respecto al maquillaje, accesorios, equipos y c… | 0.59 (0.54) | RESPUESTA | **PARCIAL** | mejoró | El contenido es correcto (BPM, I-RH-004 visitantes, guía de la visita), pero repite bloques enteros hasta truncarse. Omite 'No tocar ningún equipo sin previa autorización' (I-RH-006). |
| 114 | 183 | 1 | ¿Qué se debe hacer al salir del área? Detalla los pasos de retiro, indicando qué elementos se retiran, en q… | 0.55 (0.55) | RESPUESTA | **PARCIAL** | igual | Uniforme a la caneca y cofia hasta salir del vestier: correcto. Pero lo llama 'área gris' y omite el orden pedido (escafandra y guantes → polainas → uniforme, I-RH-006 pasos 11-14). |
| 115 | 184 | 1 | ¿A quién aplica el instructivo de Lavado de Manos y con qué norma debe cumplirse adicionalmente? | 0.67 (0.85) | RESPUESTA | **INCORRECTA** | empeoró | No responde a quién aplica ni con qué norma. El I-RH-012 dice: todo el personal que labore e ingrese al área de fabricación, cumpliendo las BPM. OLD respondía exacto. Conf 0.67. |
| 116 | 185 | 1 | ¿Cuáles son los primeros tres pasos del procedimiento de lavado de manos? Descríbelos en orden. | 0.77 (0.72) | RESPUESTA | **CORRECTA** | igual | Pasos 1-3 del I-RH-012. |
| 117 | 186 | 1 | ¿Qué indican los pasos 4, 5 y 6 del instructivo respecto al frotado de manos, dorsos, dedos y uñas? | 0.50 (0.40) | RESPUESTA | **PARCIAL** | empeoró | Describe bien los pasos 4-6, pero luego encadena decenas de 'No se menciona si el frotado... debe ser...' hasta truncarse. También se contradice con los 30 s ('no se menciona... pero debe ser de 30 segundos'). |
| 118 | 187 | 1 | ¿Cuál es el tiempo mínimo que se debe realizar el frotado según el instructivo y a qué pasos corresponde? | 0.52 (0.46) | RESPUESTA | **CORRECTA** | igual | 30 s, pasos 3-6 (I-RH-012 paso 7). |
| 119 | 189 | 1 | hola necesito saber como reclamo mi liquidacion ? | 0.33 (0.34) | RESPUESTA | **CORRECTA** | igual | Arts. 124/103: reclamo ante el jefe/director de área o RRHH, por escrito. No hay procedimiento específico de liquidación en los docs. |
| 120 | 190 | 1 | que area se encarga del manejo de los computadores | 0.45 (0.37) | RESPUESTA | **PARCIAL** | mejoró | Tecnología de Información: correcto. Pero le atribuye 'reparación, ajuste y mejoramiento locativo', que es de Mantenimiento Insumos. OLD decía RRHH. |
| 121 | 191 | 1 | cuanto tiempo de trabajo es por empresa temporal | 0.38 (0.38) | RESPUESTA | **INCORRECTA** | igual | Inventa 'la jornada para empresas temporales es de 36 horas' (las 36 h son de los turnos sin solución de continuidad, art.23 par.5 a). Los docs no regulan a los temporales (el art.22 trata de los transitorios ≤1 mes). Debió abstenerse. |
| 122 | 192 | 1 | mi tipo de contrato a que tiempo esta | 0.54 (0.55) | RESPUESTA | **PARCIAL** | mejoró | Pregunta personal (su propio contrato). Define el contrato indefinido como si fuera el del usuario. Debió explicar que depende de su contrato (consultar RRHH) y resumir los tipos (arts. 3-5). |
| 123 | 193 | 1 | que pasa si mi jefe me pone a realizar funciones que no estran dentro del manual de funciones | 0.31 (0.30) | RESPUESTA | **INCORRECTA** | igual | Invierte el art.81 num.24 (prohibición AL TRABAJADOR de hacer actividades personales) para concluir que el jefe 'viola el artículo'. El art.71 lit. n) obliga a desempeñar también funciones conexas o complementarias. |
| 124 | 194 | 1 | que debo hacer si se me pierde mi escafandra | 0.70 (0.72) | RESPUESTA | **NO RESPONDE CORRECTAMENTE** | igual | Correcto: no hay procedimiento por pérdida de escafandra. La 1.ª frase no tiene sentido ('si se pierde... debe retirarse la escafandra al salir'). Podría citar la obligación de cuidar y conservar los EPP (I-RH-004). |
| 125 | 195 | 1 | segun el reglamento de SST que está prohibido realizar en plastitec? | 0.76 (0.76) | RESPUESTA | **PARCIAL** | igual | Solo da una prohibición (art.82 num.13). El I-RH-004 y el RIT (arts. 81/82) tienen muchas más: alcohol/SPA, operar máquinas no asignadas, alterar dispositivos de seguridad, actos inseguros, etc. |
| 126 | 196 | 1 | cuales son las instrucciones de SST | 0.64 (0.64) | RESPUESTA | **PARCIAL** | igual | Genérica. Atribuye al I-RH-004 prohibiciones que vienen del RIT. No usa las 'Normas Básicas en PLASTITEC' del I-RH-004, que son justo las instrucciones de SST. |
| 127 | 197 | 1 | Cuales son los horarioz | 0.48 (0.52) | RESPUESTA | **CORRECTA** | mejoró | Horario administrativo vigente (7:30-5:00; viernes 4:30). Podría añadir que el operativo trabaja por turnos. OLD daba los horarios derogados. |
| 128 | 198 | 1 | Dan vacaciones en diciembre | 0.40 (0.40) | RESPUESTA | **NO RESPONDE CORRECTAMENTE** | mejoró | Correcto: no hay fecha de vacaciones en diciembre en los docs. Añade la liquidación, que sobra. OLD inventaba 'concedidas en diciembre según art.58'. |
| 129 | 199 | 1 | Como es el ambiente laboral | 0.67 (0.63) | RESPUESTA | **CORRECTA** | igual | Pregunta subjetiva. Resume el Código de Ética §6/§8 (respeto, libre de acoso) y los mecanismos de prevención del acoso. |
| 130 | 200 | 1 | Los temporales tienen los mismo beneficios que los de la empresa | 0.34 (0.31) | PREMISA | **NO RESPONDE CORRECTAMENTE** | mejoró | Los docs no distinguen a los temporales: la abstención es correcta. OLD listaba todos los beneficios como si aplicaran. |
| 131 | 201 | 1 | Y vacaciones son colectivas | 0.39 (0.37) | RESPUESTA | **INCORRECTA** | empeoró | 'Según el art.40, las vacaciones son colectivas... a todos sin distinción': FALSO. El art.40 dice que se conceden oficiosamente o a petición del trabajador. Los docs no regulan vacaciones colectivas. OLD decía correctamente que no se especificaba. |
| 132 | 202 | 1 | Pagan Vacaciones de Diciembre | 0.30 (0.43) | RESPUESTA | **PARCIAL** | mejoró | Art.44 (se pagan con el salario ordinario): pertinente. No aclara que los docs no hablan de 'vacaciones de diciembre'. |
| 133 | 203 | 1 | Desde que dia pagan las vacaciones | 0.36 (0.36) | RESPUESTA | **CORRECTA** | igual | Art.44 y aclara que no se especifica la fecha de pago (no está en los docs). |
| 134 | 204 | 1 | Desde que dia dan las vacaciones | 0.46 (0.45) | RESPUESTA | **CORRECTA** | igual | Art.40 (época la señala la empresa a más tardar dentro del año subsiguiente). Podría añadir el aviso con 15 días de anticipación. |
| 135 | 205 | 1 | Cuanto estan las horas extras y recargos nocturnos | 0.58 (0.56) | RESPUESTA | **PARCIAL** | igual | 'Cuánto están' = porcentajes. Da los límites (art.31) y el inicio del nocturno, pero no los recargos del art.33 (nocturno 35%, extra diurna 25%, extra nocturna 75%). |
| 136 | 206 | 1 | Desde que horas inicia el recargo nocturno | 0.73 (0.73) | RESPUESTA | **CORRECTA** | igual | 19:00 correcto. La franja está en el art.29; el art.33 (que cita) trata de las tasas. Error menor de citación. |
| 137 | 209 | 1 | Los beneficios son para los de la temporal tambien o solamente para vinculados por empresa | 0.34 (0.20) | RESPUESTA | **INCORRECTA** | igual | Inventa que 'se menciona la posibilidad de acordar beneficios para los temporales'. Los docs no hablan de temporales. Conf 0.34. |
| 138 | 213 | 1 | El dia de cumpleaños es libre. | 0.38 (0.32) | PREMISA | **NO RESPONDE CORRECTAMENTE** | mejoró | Premisa sin respaldo bien detectada (cumpleaños). OLD alucinaba un día libre según el art.35. |
| 139 | 214 | 1 | Cuando es festivo entre semana se trabaja | 0.59 (0.59) | RESPUESTA | **INCORRECTA** | empeoró | Aplica mal el art.35 par.1 (remuneración proporcional del dominical para jornadas parciales). Lo correcto: los festivos son de descanso obligatorio remunerado (art.35) y, si se trabajan, se pagan con recargo del 90% desde el 1-jul-2026 (par.3). OLD se acercaba más. |
| 140 | 215 | 1 | Cuales son los horarios de diurna en plastitec? | 0.64 (0.64) | RESPUESTA | **INCORRECTA** | igual | Da los HORARIOS UNO/DOS derogados (8-1 / 7-1) como 'horario diurno'. Lo pertinente: jornada diurna de 6:00 a.m. a 7:00 p.m. (art.29) y el horario administrativo vigente de 7:30 a 5:00. |
| 141 | 216 | 1 | Quien certifica a plastitec? | 0.58 (0.57) | RESPUESTA | **INCORRECTA** | empeoró | 'ISO 9001 emitida por BVQI con la colaboración de ICONTEC': relación inventada. ICONTEC certificó la ISO 13485 (2018) y BVQI la ISO 9001 (2004-2018). Omite la 13485. OLD era mejor. |
| 142 | 218 | 1 | Cual es el numero de enmergencias en plastitec? | 0.42 (0.42) | PREMISA | **NO RESPONDE CORRECTAMENTE** | mejoró | Los docs no tienen ningún número telefónico de emergencias: la abstención es correcta. |
| 143 | 219 | 1 | Cuanto es el minimo en plastitec | 0.46 (0.46) | RESPUESTA | **INCORRECTA** | igual | Pregunta ambigua (¿salario mínimo?). Devuelve la plantilla literal de 42 h. El filtro de privacidad, que sí bloquea 'pago minimo', no captura 'el minimo'. |
| 144 | 222 | 1 | Cuanto es el pago minimo en colombia? | — (0.38) | PRIVACIDAD | **RECHAZO INDEBIDO** | cambió de sentido | El salario mínimo de Colombia es información pública, no confidencial. Lo correcto era decir que no está en los docs (fuera de alcance), no 'información confidencial... consulta RRHH'. OLD alucinaba cifras (peor). |
| 145 | 225 | 1 | En fechas especiales como en diciembre como es el horario | 0.48 (0.48) | RESPUESTA | **INCORRECTA** | igual | Inventa 'según el art.23, en fechas especiales como diciembre el horario es de 8:00 a 5:00'. No hay nada de horarios de diciembre en los docs. |
| 146 | 226 | 1 | El 24 y el 25 de diciembre como es el horario | 0.52 (0.52) | RESPUESTA | **FALSO NEGATIVO** | igual | Dice que no está establecido. Parcialmente sí: el 25 de diciembre es festivo de descanso obligatorio remunerado (art.35) y, si se trabaja, lleva recargo del 90%. El 24 no está regulado. |
| 147 | 227 | 1 | ¿Los aprendices del sena tienen vacaciones? | 0.60 (0.74) | RESPUESTA | **PARCIAL** | igual | Concluye bien que 'se puede inferir' que tienen derecho, pero dice que no se menciona: el art.21 par.1 reconoce explícitamente vacaciones a los aprendices en fase práctica/dual. Cita el 'artículo 40 de la ley' (impreciso). |
| 148 | 228 | 1 | En diciembre que dias en plastitec que dias hay vacaciones? | 0.64 (0.65) | RESPUESTA | **NO RESPONDE CORRECTAMENTE** | mejoró | Correcto: no hay días fijos de vacaciones en diciembre. Atribuye los 15 días hábiles al art.40 (son del art.39). |
| 149 | 231 | 1 | Los del sena trabajan los festivos | 0.42 (0.42) | RESPUESTA | **INCORRECTA** | igual | 'Según el art.128, el SENA permite trabajar en festivos solo si el teletrabajador...': mezcla el art.128 (acoso) con teletrabajo. Los docs no regulan festivos de aprendices (solo prohíben trabajo nocturno/suplementario a menores, art.34 par.2). |

