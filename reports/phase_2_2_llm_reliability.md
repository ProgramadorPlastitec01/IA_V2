# Benchmark Empresarial LLM Reliability (Fase 2.2)
Fecha: 2026-06-03T19:56:56.401Z

## Métricas Globales
- **Score Promedio (Juez):** 68.46/100
- **Retrieval Confidence:** 66.93%
- **Grounding Accuracy:** 80.00%
- **Hallucination Rate:** 20.00%
- **Latencia Promedio:** 24009 ms

## Resultados Detallados

### 1. ¿Los visitantes pueden conservar ropa de calle debajo del overol?
- **Latencia:** 30058ms
- **Retrieval Conf:** 0.87
- **Respuesta:** PASO 1: EXTRAER EVIDENCIA.

La evidencia proporcionada es la siguiente:

* "NOTA: Los visitantes que no van a manipular los productos pueden conservar la Ropa de calle y zapatos por debajo del overol y las polainas"

PASO 2: DETERMINAR RESPUESTA.

La pregunta es si los visitantes pueden conservar ropa de calle debajo del overol. La evidencia proporcionada indica que sí, pero con algunas restricciones: "los visitantes que no van a manipular los productos". Esto significa que solo los visitantes que no interactuarán con los productos pueden conservar la ropa de calle.

PASO 3: VERIFICAR EVIDENCIA.

La respuesta propuesta no contradice el texto y no asume información no proporcionada. La evidencia es literal y precisa.

PASO 4: RESPONDER.

Sí está permitido que los visitantes conserven la ropa de calle debajo del overol, siempre y cuando no interactúen con los productos.

---
**Fuentes:**
- I-RH-006 VERSIÓN 6 EN A3.pdf
- **Evaluación Juez:** Score 100 (G:1, E:1, P:1, C:1)
- **Justificación:** La respuesta se basa estrictamente en la evidencia proporcionada, sin alucinar o inventar datos. La evidencia es literal y precisa, y la respuesta no contradice el texto ni asume información no proporcionada.


### 2. ¿Los hombres pueden dejarse la barba y el bigote si tienen contacto con el producto?
- **Latencia:** 30527ms
- **Retrieval Conf:** 0.54
- **Respuesta:** PASO 1: EXTRAER EVIDENCIA.

La evidencia proporcionada incluye un fragmento directamente relacionado con la pregunta:

"Para Hombres: prohibido dejarse la barba,bigote,patillas(aplica para todo el personal que tiene contacto directo con el producto)".


PASO 2: DETERMINAR RESPUESTA.

La evidencia indica que es PROHIBIDO dejarse la barba y el bigote si se tiene contacto directo con el producto. Por lo tanto, la respuesta a la pregunta es negativa.


PASO 3: VERIFICAR EVIDENCIA.

Verifico que mi respuesta propuesta no contradiga el texto y no asuma información no presente en la evidencia. La respuesta es exactamente lo indicado por la evidencia.


PASO 4: RESPONDER.

La respuesta final es:

NO, debido a que se requiere contacto directo con el producto.

---
**Fuentes:**
- I-RH-003 - 18 BPMM (Material Visual) (1).pdf
- **Evaluación Juez:** Score 100 (G:1, E:1, P:1, C:1)
- **Justificación:** La respuesta se basa estrictamente en la evidencia proporcionada, extrae los hechos relevantes y respetó la polaridad de la evidencia. La respuesta es coherente con sí misma y no fabrica contradicciones absurdas.


### 3. ¿Cómo se deben lavar los uniformes?
- **Latencia:** 9999ms
- **Retrieval Conf:** 0.72
- **Respuesta:** NO ESPECIFICADO EN EL DOCUMENTO
- **Evaluación Juez:** Score 33.33 (G:0, E:1, P:1, C:1)
- **Justificación:** La respuesta no se basa estrictamente en la evidencia, ya que se indica que 'NO ESPECIFICADO EN EL DOCUMENTO' y no se proporcionan instrucciones claras sobre cómo lavar los uniformes.


### 4. ¿Qué es el SAGRILAFT?
- **Latencia:** 21775ms
- **Retrieval Conf:** 0.94
- **Respuesta:** PASO 1: EXTRAER EVIDENCIA.

La evidencia proporcionada es un fragmento del documento "CODIGO DE ETICA (Material visual).pdf" con la siguiente información:

* El SAGRILAFT se menciona junto con el término "OEA" (Operador Económico Autorizado).

PASO 2: DETERMINAR RESPUESTA.

La evidencia es informativa y no proporciona una definición explícita del SAGRILAFT. Por lo tanto, la respuesta a la pregunta "¿Qué es el SAGRILAFT?" debe ser negativa.

PASO 3: VERIFICAR EVIDENCIA.

No hay contradicciones en la evidencia proporcionada y no se asume información que no esté explícitamente mencionada. La respuesta propuesta no contradice el texto y se basa estrictamente en la evidencia disponible.

PASO 4: RESPONDER.

La respuesta final es:

"NO ESPECIFICADO EN EL DOCUMENTO".

---
**Fuentes:**
- I-RH-017-5 CODIGO DE ETICA (Material visual).pdf
- **Evaluación Juez:** Score 50 (G:1, E:1, P:0, C:1)
- **Justificación:** La respuesta se basa estrictamente en la evidencia proporcionada, pero no extrae una definición explícita del SAGRILAFT. La respuesta es negativa y se basa en el hecho de que no se menciona una definición en el documento 'CODIGO DE ETICA (Material visual).pdf'.


### 5. ¿Cuáles son los objetivos del SG-SST?
- **Latencia:** 19430ms
- **Retrieval Conf:** 0.54
- **Respuesta:** PASO 1: EXTRAER EVIDENCIA.

La evidencia proporcionada no menciona explícitamente los objetivos del SG-SST. Sin embargo, se menciona que "Promover el AUTOCUIDADO a todo el personal con el fin de evitar accidentes de trabajo y enfermedades laborales". Esta información puede estar relacionada con la seguridad y salud en el trabajo, pero no proporciona detalles sobre los objetivos específicos del SG-SST.

PASO 2: DETERMINAR RESPUESTA.

La evidencia no responde directamente a la pregunta sobre los objetivos del SG-SST. Por lo tanto, la respuesta es negativa.

PASO 3: VERIFICAR EVIDENCIA.

No hay contradicciones en la evidencia proporcionada. La información se mantiene dentro de su contexto y no se asume nada que no esté explícitamente mencionado.

PASO 4: RESPONDER.

Respuesta:
NO ESPECIFICADO EN EL DOCUMENTO

---
**Fuentes:**
- I-RH-004 - 14 Induccion en Seguridad Salud en el Trabajo.pdf
- **Evaluación Juez:** Score 100 (G:1, E:1, P:1, C:1)
- **Justificación:** La respuesta se basa estrictamente en la evidencia proporcionada, aunque no menciona explícitamente los objetivos del SG-SST. La evidencia es relevante para la pregunta y no hay contradicciones. La respuesta es 'NO ESPECIFICADO EN EL DOCUMENTO' porque la evidencia no proporciona detalles sobre los objetivos específicos del SG-SST.


### 6. ¿Está permitido el uso de maquillaje dentro de la planta?
- **Latencia:** 21795ms
- **Retrieval Conf:** 0.51
- **Respuesta:** PASO 1: EXTRAER EVIDENCIA.

La evidencia proporcionada incluye un fragmento directamente relacionado con la pregunta:

"Para las mujeres: No usar maquillaje de ningún tipo."

PASO 2: DETERMINAR RESPUESTA.

La respuesta a la pregunta es negativa, ya que el texto prohíbe específicamente el uso de maquillaje dentro de la planta. Por lo tanto, la respuesta es:

NO ESPECIFICADO EN EL DOCUMENTO

PASO 3: VERIFICAR EVIDENCIA.

Verifico que mi respuesta no contradiga el texto y no asuma información no presente en la evidencia. La respuesta es precisa y se basa estrictamente en la evidencia proporcionada.

PASO 4: RESPONDER.

La respuesta final es:

NO ESPECIFICADO EN EL DOCUMENTO

---
**Fuentes:**
- I-RH-003 - 18 BPMM (Material Visual) (1).pdf
- **Evaluación Juez:** Score 33.75 (G:0, E:1, P:1, C:1)
- **Justificación:** La respuesta no se basa estrictamente en la evidencia, ya que asume información no presente en el texto (el uso de maquillaje para hombres). La respuesta también contradice la evidencia proporcionada, que prohíbe específicamente el uso de maquillaje para mujeres. La respuesta es precisa y se basa estrictamente en la evidencia proporcionada.


### 7. ¿Qué es el COPASST?
- **Latencia:** 22171ms
- **Retrieval Conf:** 1.00
- **Respuesta:** PASO 1: EXTRAER EVIDENCIA.

La evidencia proporcionada contiene un fragmento directamente relacionado con la pregunta:

"Alta"

PASO 2: DETERMINAR RESPUESTA.

La respuesta a la pregunta "¿Qué es el COPASST?" no se puede determinar de forma clara desde la evidencia proporcionada, ya que solo se menciona el término "COPASST" con una etiqueta de "informativa" y una relevancia alta. Sin embargo, se puede inferir que el documento proporciona información sobre este tema.

PASO 3: VERIFICAR EVIDENCIA.

La respuesta propuesta no contradice el texto ni asume información no presente en la evidencia. La etiqueta de "informativa" y la relevancia alta sugieren que el término "COPASST" se menciona en el documento, pero no se proporciona una definición o explicación clara.

PASO 4: RESPONDER.

NO ESPECIFICADO EN EL DOCUMENTO.

---
**Fuentes:**
- I-RH-004 - 14 Induccion en Seguridad Salud en el Trabajo.pdf
- **Evaluación Juez:** Score 100 (G:1, E:1, P:1, C:1)
- **Justificación:** La respuesta se basa estrictamente en la evidencia proporcionada, aunque no se proporciona una definición clara de lo que es el COPASST. La respuesta es coherente con la información presentada y no asume información no presente en la evidencia.


### 8. ¿Qué significa BPM en Plastitec? ¿Es Business Process Management?
- **Latencia:** 33794ms
- **Retrieval Conf:** 0.58
- **Respuesta:** PASO 1: EXTRAER EVIDENCIA.

La evidencia proporcionada incluye un fragmento del documento "I-RH-004 - 14 Induccion en Seguridad Salud en el Trabajo.pdf" que menciona la expresión "BPM LAVADO DE UNIFORMES".

PASO 2: DETERMINAR RESPUESTA.

La respuesta a la pregunta "¿Qué significa BPM en Plastitec? ¿Es Business Process Management?" es negativa, ya que no se proporciona información sobre el significado de BPM en este contexto específico. Sin embargo, se puede inferir que BPM se refiere a Buenas Prácticas de Manufactura.

PASO 3: VERIFICAR EVIDENCIA.

La evidencia extraída no contradice la respuesta propuesta y no se asume información no proporcionada. La expresión "BPM LAVADO DE UNIFORMES" es un fragmento específico del documento que no proporciona información general sobre el significado de BPM en Plastitec.

PASO 4: RESPONDER.

La respuesta final es:
"Sí está permitido referirse a BPM como Buenas Prácticas de Manufactura, aunque no se proporciona información explícita sobre su significado en este contexto específico."

---
**Fuentes:**
- I-RH-004 - 14 Induccion en Seguridad Salud en el Trabajo.pdf
- **Evaluación Juez:** Score 33.75 (G:1, E:1, P:0, C:1)
- **Justificación:** La respuesta se basa estrictamente en la evidencia proporcionada, aunque no es una interpretación directa del significado de BPM en Plastitec. La respuesta también respetó la polaridad de la evidencia al no mencionar que BPM está permitido, aunque se puede inferir su significado como Buenas Prácticas de Manufactura.


### 9. ¿Cuánto tiempo debe durar el lavado de manos?
- **Latencia:** 23269ms
- **Retrieval Conf:** 0.48
- **Respuesta:** PASO 1: EXTRAER EVIDENCIA.

La evidencia proporcionada es un fragmento del documento "I-RH-003 - 18 BPMM (Material Visual) (1).pdf" que contiene la siguiente información literal:

"Lávese las manos después de haber utilizado el baño."

PASO 2: DETERMINAR RESPUESTA.

La pregunta "¿Cuánto tiempo debe durar el lavado de manos?" no está específicamente respondida en la evidencia proporcionada. El texto solo indica que se deben lavar las manos después de utilizar el baño, sin especificar un período de tiempo.

PASO 3: VERIFICAR EVIDENCIA.

La respuesta propuesta no contradice el texto y no asume información no presente. La evidencia es informativa y relevante para la pregunta original.

PASO 4: RESPONDER.

No está específicamente permitido ni prohibido un período de tiempo para el lavado de manos en la evidencia proporcionada. Sin embargo, se puede inferir que el lavado de manos debe realizarse después de utilizar el baño, pero no se especifica un tiempo exacto. Por lo tanto:

Respuesta: NO ESPECIFICADO EN EL DOCUMENTO.

---
**Fuentes:**
- I-RH-003 - 18 BPMM (Material Visual) (1).pdf
- **Evaluación Juez:** Score 33.75 (G:1, E:0, P:1, C:1)
- **Justificación:** La respuesta no se basa estrictamente en la evidencia, ya que no proporciona un período de tiempo específico para el lavado de manos. La evidencia es relevante y coherente con la pregunta original.


### 10. ¿Cómo se termina el contrato de aprendiz SENA?
- **Latencia:** 27273ms
- **Retrieval Conf:** 0.52
- **Respuesta:** PASO 1: EXTRAER EVIDENCIA.

La evidencia proporcionada es un fragmento del RIT Plastitec con fecha 25 noviembre 2025. El texto relevante es:

"Este contrato tendrá una duración determinada no superior a tres (3) años y otorgará al aprendiz un apoyo de sostenimiento mensual."

PASO 2: DETERMINAR RESPUESTA.

La pregunta "¿Cómo se termina el contrato de aprendiz SENA?" asume que el contrato tiene una duración determinada. Sin embargo, la evidencia proporcionada no menciona cómo se termina el contrato, solo su duración. Por lo tanto, la respuesta es negativa.

PASO 3: VERIFICAR EVIDENCIA.

La evidencia proporcionada es literal y no contiene información sobre cómo se termina el contrato. No hay contradicciones ni omisiones en el texto.

PASO 4: RESPONDER.

"NO ESPECIFICADO EN EL DOCUMENTO".

---
**Fuentes:**
- RIT PLASTITEC 25 NOV 2025.pdf
- **Evaluación Juez:** Score 100 (G:1, E:1, P:1, C:1)
- **Justificación:** La respuesta se basa estrictamente en la evidencia proporcionada, aunque no responde directamente a la pregunta. La evidencia es relevante y literal, sin contradicciones ni omisiones.