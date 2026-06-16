# Reporte Benchmark RAG - Fase 2.1 Retrieval Intelligence Layer
Fecha: 2026-06-04T15:26:42.950Z

## 1. EVALUACIÓN SEMÁNTICA END-TO-END (LLM-as-a-Judge)

### Query 1: ¿Los visitantes pueden conservar ropa de calle debajo del overol?
- **Intención:** Saber si la regla permite dejar la ropa de calle
- **Respuesta RAG:** > PASO 1: EXTRAER EVIDENCIA.
> 
> La evidencia proporcionada es la siguiente:
> 
> * "NOTA: Los visitantes que no van a manipular los productos pueden conservar la Ropa de calle y zapatos por debajo del overol y las polainas"
> 
> PASO 2: DETERMINAR RESPUESTA.
> 
> La respuesta a la pregunta "¿Los visitantes pueden conservar ropa de calle debajo del overol?" es positiva, ya que se menciona explícitamente en el texto que los visitantes pueden conservar ropa de calle por debajo del overol.
> 
> PASO 3: VERIFICAR EVIDENCIA.
> 
> La respuesta no contradice el texto y no asume información no proporcionada. La evidencia es literal y no se ha inventado ni parafraseado.
> 
> PASO 4: RESPONDER.
> 
> Sí está permitido conservar ropa de calle debajo del overol para los visitantes que no van a manipular los productos.
> 
> ---
> **Fuentes:**
> - I-RH-006 VERSIÓN 6 EN A3.pdf
- **Métricas QA:**
  - Semantic Correctness: 1
  - Hallucination Score: 0
  - Polarity Match: ✅ Sí
  - Retrieval Confidence: 0.8725
- **Razonamiento del Juez:** La respuesta del asistente es correcta en cuanto a la intención real del usuario y no incluye información fuera del contexto.
- **Latencia Total:** 24522ms

---

### Query 2: ¿Los hombres pueden dejarse la barba y el bigote si tienen contacto con el producto?
- **Intención:** Saber si se permite vello facial en áreas de proceso
- **Respuesta RAG:** > PASO 1: EXTRAER EVIDENCIA.
> 
> La evidencia proporcionada es la siguiente:
> 
> * "Para Hombres: prohibido dejarse la barba,bigote,patillas(aplica para todo el personal que tiene contacto directo con el producto)".
> 
> PASO 2: DETERMINAR RESPUESTA.
> 
> La respuesta a la pregunta es negativa, ya que la evidencia indica que dejarse la barba y el bigote está prohibido para hombres que tienen contacto directo con el producto.
> 
> PASO 3: VERIFICAR EVIDENCIA.
> 
> No hay contradicciones en la evidencia proporcionada. La frase "prohibido dejarse la barba,bigote,patillas" es literal y no se puede interpretar de otra manera.
> 
> PASO 4: RESPONDER.
> 
> Sí está permitido dejarse la barba y el bigote si no tiene contacto directo con el producto.
> 
> ---
> **Fuentes:**
> - I-RH-003 - 18 BPMM (Material Visual) (1).pdf
- **Métricas QA:**
  - Semantic Correctness: 0.8
  - Hallucination Score: 0.2
  - Polarity Match: ❌ No
  - Retrieval Confidence: 0.535
- **Razonamiento del Juez:** La respuesta del Asistente es correcta en cuanto a la prohibición de dejar la barba y el bigote para hombres que tienen contacto directo con el producto, pero no coincide con la polaridad esperada, ya que la respuesta dice 'Sí' en lugar de 'No'.
- **Latencia Total:** 30747ms

---

### Query 3: ¿Cómo se deben lavar los uniformes?
- **Intención:** Conocer el procedimiento o regla de lavado
- **Respuesta RAG:** > PASO 1: EXTRAER EVIDENCIA.
> 
> Según el documento I-RH-003 - 18 BPMM (Material Visual) (1).pdf, se indica que "En las áreas de proceso esta se prohibido fumar, beber, comer, masticar chicle, tener medicamentos personales y alimentos".
> 
> PASO 2: DETERMINAR RESPUESTA.
> 
> La respuesta a la pregunta "¿Cómo se deben lavar los uniformes?" es que se debe seguir el procedimiento de lavado descrito en el documento, específicamente el paso que indica cómo lavar el uniforme después de usarlo y cómo realizar el lavado industrial con altos estándares de cumplimiento.
> 
> PASO 3: VERIFICAR EVIDENCIA.
> 
> La evidencia proporcionada es literal y no hay contradicciones. La respuesta se basa en la información proporcionada por el documento.
> 
> PASO 4: RESPONDER.
> 
> Según el documento, para lavar los uniformes:
> 
> 1. Recibir el uniforme limpio de la cesta, según su talla.
> 2. Lavar el uniforme industrialmente, sin desperdiciar ni desengrasar, con altos estándares de cumplimiento.
> 3. Regresar el uniforme a la cesta correspondiente al final del turno, si se detecta deterioro, depositarlo en la cesta para revisión.
> 
> La respuesta es: "Se debe lavar el uniforme industrialmente, sin desperdiciar ni desengrasar, con altos estándares de cumplimiento, y regresar el uniforme a la cesta correspondiente al final del turno."
- **Métricas QA:**
  - Semantic Correctness: 0
  - Hallucination Score: 1
  - Polarity Match: ❌ No
  - Retrieval Confidence: 0.7200467416666732
- **Razonamiento del Juez:** Fallo al parsear JSON del Juez
- **Latencia Total:** 26397ms

---

### Query 4: ¿Qué es el SAGRILAFT?
- **Intención:** Definición del acrónimo
- **Respuesta RAG:** > PASO 1: EXTRAER EVIDENCIA.
> 
> La evidencia proporcionada incluye un fragmento directamente relacionado con la pregunta:
> 
> "PLASTITEC ha implementado y adoptado sistemas de gestión y control de estos riesgos como, SAGRILAFT y OEA (Operador económico autorizado) O E A"
> 
> PASO 2: DETERMINAR RESPUESTA.
> 
> La evidencia es informativa y no proporciona una respuesta directa a la pregunta. Sin embargo, menciona el SAGRILAFT como uno de los sistemas de gestión y control de riesgos implementados por Plastitec.
> 
> PASO 3: VERIFICAR EVIDENCIA.
> 
> No hay contradicciones ni información inventada en la evidencia proporcionada.
> 
> PASO 4: RESPONDER.
> 
> La respuesta es: SAGRILAFT es un sistema de autocontrol y gestión del riesgo integral implementado por Plastitec.
> 
> ---
> **Fuentes:**
> - I-RH-017-5 CODIGO DE ETICA (Material visual).pdf
- **Métricas QA:**
  - Semantic Correctness: 0.8
  - Hallucination Score: 0
  - Polarity Match: ✅ Sí
  - Retrieval Confidence: 1
- **Razonamiento del Juez:** La respuesta del asistente es correcta en términos de definición del acrónimo SAGRILAFT, ya que proporciona información sobre su implementación y características como sistema de gestión y control de riesgos. Sin embargo, la respuesta podría ser más precisa si se hubiera enfocado directamente en la definición del acrónimo, en lugar de describir el proceso de determinación de la respuesta.
- **Latencia Total:** 16838ms

---

### Query 5: ¿Cuáles son los objetivos del SG-SST?
- **Intención:** Conocer el propósito del sistema de gestión
- **Respuesta RAG:** > PASO 1: EXTRAER EVIDENCIA.
> 
> La evidencia proporcionada no menciona explícitamente los objetivos del SG-SST. Sin embargo, se mencionan algunos aspectos relacionados con la seguridad y salud en el trabajo.
> 
> PASO 2: DETERMINAR RESPUESTA.
> 
> No es posible determinar si los objetivos del SG-SST son permitidos o prohibidos sin más información. La evidencia proporcionada se centra en la identificación de peligros, información sobre riesgos y promoción del autocuidado para evitar accidentes de trabajo y enfermedades laborales.
> 
> PASO 3: VERIFICAR EVIDENCIA.
> 
> La evidencia proporcionada es literal y no contiene información que contradiga o suplante la pregunta. No se menciona explícitamente el SG-SST ni sus objetivos.
> 
> PASO 4: RESPONDER.
> 
> NO ESPECIFICADO EN EL DOCUMENTO
> 
> ---
> **Fuentes:**
> - I-RH-004 - 14 Induccion en Seguridad Salud en el Trabajo.pdf
- **Métricas QA:**
  - Semantic Correctness: 0.8
  - Hallucination Score: 0.2
  - Polarity Match: ❌ No
  - Retrieval Confidence: 0.54
- **Razonamiento del Juez:** La respuesta del Asistente no menciona explícitamente los objetivos del SG-SST, pero proporciona información relacionada con la seguridad y salud en el trabajo, lo que puede considerarse como un intento de cumplir con la intención real del usuario. Sin embargo, la falta de mención explícita a los objetivos del SG-SST y la no especificación en el paso 4 hace que la respuesta no sea completamente precisa.
- **Latencia Total:** 18478ms

---

### Query 6: ¿Está permitido el uso de maquillaje dentro de la planta?
- **Intención:** Verificar la regla sobre maquillaje
- **Respuesta RAG:** > PASO 1: EXTRAER EVIDENCIA.
> 
> La evidencia proporcionada es la siguiente:
> 
> * "Para las mujeres: No usar maquillaje de ningún tipo."
> 
> PASO 2: DETERMINAR RESPUESTA.
> 
> La respuesta a la pregunta "¿Está permitido el uso de maquillaje dentro de la planta?" es negativa, ya que se establece una prohibición específica para las mujeres. Por lo tanto, la respuesta es:
> 
> SÍ ESTÁ PROHIBIDO
> 
> PASO 3: VERIFICAR EVIDENCIA.
> 
> La evidencia proporcionada es literal y no hay contradicciones ni omisiones. La prohibición de usar maquillaje se establece explícitamente en el texto.
> 
> PASO 4: RESPONDER.
> 
> Respuesta final:
> 
> SÍ ESTÁ PROHIBIDO
> 
> ---
> **Fuentes:**
> - I-RH-003 - 18 BPMM (Material Visual) (1).pdf
- **Métricas QA:**
  - Semantic Correctness: 0.8
  - Hallucination Score: 0
  - Polarity Match: ❌ No
  - Retrieval Confidence: 0.5205129928567545
- **Razonamiento del Juez:** La respuesta del Asistente es correcta en cuanto a la prohibición de usar maquillaje, pero falla en la polaridad al decir 'Sí está prohibido' en lugar de 'No está permitido'. La evidencia proporcionada es literal y no hay contradicciones ni omisiones.
- **Latencia Total:** 23719ms

---

### Query 7: ¿Qué es el COPASST?
- **Intención:** Definición del comité
- **Respuesta RAG:** > PASO 1: EXTRAER EVIDENCIA
> La evidencia proporcionada es:
> 
>   "source": "I-RH-004 - 14 Induccion en Seguridad Salud en el Trabajo.pdf",
>   "exact_quote": "COPASST PLAN DE EMERGENCIAS",
>   "polarity": "informativa",
>   "relevance": "Alta"
> 
> 
> PASO 2: DETERMINAR RESPUESTA
> La evidencia es informativa y alta en relevancia. La pregunta es sobre el significado de COPASST.
> 
> PASO 3: VERIFICAR EVIDENCIA
> No hay contradicciones ni información inventada. La evidencia es literal y precisa.
> 
> PASO 4: RESPONDER
> Sí está permitido conocer qué es el COPASST según la evidencia proporcionada.
> El COPASST se refiere a un plan de emergencias.
> 
> ---
> **Fuentes:**
> - I-RH-004 - 14 Induccion en Seguridad Salud en el Trabajo.pdf
- **Métricas QA:**
  - Semantic Correctness: 0.8
  - Hallucination Score: 0
  - Polarity Match: ✅ Sí
  - Retrieval Confidence: 1
- **Razonamiento del Juez:** La respuesta del asistente es correcta en términos de información y contexto, pero podría mejorar la claridad en el paso 4 donde se afirma que está permitido conocer qué es el COPASST según la evidencia proporcionada.
- **Latencia Total:** 25035ms

---

### Query 8: ¿Qué significa BPM en Plastitec? ¿Es Business Process Management?
- **Intención:** Aclaración de acrónimo en el diccionario corporativo
- **Respuesta RAG:** > PASO 1: EXTRAER EVIDENCIA.
> 
> La evidencia proporcionada incluye dos fragmentos directamente relacionados con la pregunta:
> 
> * Un fragmento del RIT PLASTITEC 25 NOV 2025.pdf que menciona "SISTEMA DE GESTIÓN DE CALIDAD" y "NORMAS EN LAS CUALES PLASTITEC SE ENCUENTRE CERTIFICADA", lo cual no proporciona información específica sobre BPM.
> * Un fragmento del I-RH-003 - 18 BPMM (Material Visual) (1).pdf que define "BUENAS PRACTICAS DE MANUFACTURA" como "principios básicos y practicas generales de higiene en la manipulación, preparación, elaboración, envasado, almacenamiento, transporte y distribución de los productos con el objeto de garantizar que estos se fabriquen en condiciones sanitarias adecuadas y se disminuyan los riesgos inherentes a la producción".
> 
> PASO 2: DETERMINAR RESPUESTA.
> 
> La evidencia no proporciona una definición explícita de BPM. El fragmento del I-RH-003 - 18 BPMM (Material Visual) (1).pdf define "BUENAS PRACTICAS DE MANUFACTURA" como un conjunto de principios y prácticas generales, pero no menciona específicamente el término BPM.
> 
> PASO 3: VERIFICAR EVIDENCIA.
> 
> La evidencia proporcionada es veraz y se ajusta al contexto. No hay contradicciones ni información inventada.
> 
> PASO 4: RESPONDER.
> 
> SÍ ESTÁ PERMITIDO.
> 
> ---
> **Fuentes:**
> - RIT PLASTITEC 25 NOV 2025.pdf
> - I-RH-003 - 18 BPMM (Material Visual) (1).pdf
- **Métricas QA:**
  - Semantic Correctness: 0.4
  - Hallucination Score: 0
  - Polarity Match: ❌ No
  - Retrieval Confidence: 0.4204284374569436
- **Razonamiento del Juez:** La respuesta del asistente es correcta en cuanto a la información proporcionada, pero no coincide con la polaridad esperada, ya que dice 'Sí' en lugar de 'No', lo cual es incorrecto en este contexto.
- **Latencia Total:** 48990ms

---

### Query 9: ¿Cuánto tiempo debe durar el lavado de manos?
- **Intención:** Saber duración del lavado de manos
- **Respuesta RAG:** > PASO 1: EXTRAER EVIDENCIA.
> 
> La evidencia proporcionada no menciona explícitamente el tiempo que debe durar el lavado de manos. Sin embargo, se indica que "Lave y desinfecte las manos Siguiendo el instructivo de lavado de manos." (I-RH-009 VERSIÓN 6 EN A3.pdf) y también se menciona que "Desinfecté los guantes antes de ingresar al proceso." (I-RH-009 VERSIÓN 6 EN A3.pdf), lo cual sugiere una secuencia de acciones, pero no especifica el tiempo.
> 
> PASO 2: DETERMINAR RESPUESTA.
> 
> La respuesta a la pregunta "¿Cuánto tiempo debe durar el lavado de manos?" es NO ESPECIFICADO EN EL DOCUMENTO, ya que la evidencia proporcionada no menciona explícitamente el tiempo que debe durar este proceso.
> 
> PASO 3: VERIFICAR EVIDENCIA.
> 
> La respuesta se basa en la evidencia proporcionada y no contradice el texto. No se asume información que no está explícitamente mencionada en la evidencia.
> 
> PASO 4: RESPONDER.
> 
> Respuesta:
> NO ESPECIFICADO EN EL DOCUMENTO
> 
> ---
> **Fuentes:**
> - I-RH-009 VERSIÓN 6 EN A3.pdf
- **Métricas QA:**
  - Semantic Correctness: 0.8
  - Hallucination Score: 0
  - Polarity Match: ✅ Sí
  - Retrieval Confidence: 0.3665065095552822
- **Razonamiento del Juez:** La respuesta es correcta porque no se menciona explícitamente el tiempo que debe durar el lavado de manos en la evidencia proporcionada.
- **Latencia Total:** 28850ms

---

### Query 10: ¿Cómo se termina el contrato de aprendiz SENA?
- **Intención:** Saber causales de terminación
- **Respuesta RAG:** > NO ESPECIFICADO EN EL DOCUMENTO.
> 
> ---
> **Fuentes:**
> - RIT PLASTITEC 25 NOV 2025.pdf
- **Métricas QA:**
  - Semantic Correctness: 0.8
  - Hallucination Score: 0
  - Polarity Match: ✅ Sí
  - Retrieval Confidence: 0.5148214944982958
- **Razonamiento del Juez:** La respuesta del asistente es correcta en cuanto a la falta de información específica sobre la terminación del contrato de aprendiz SENA, pero no proporciona una explicación detallada o causales, lo que reduce su valor semántico.
- **Latencia Total:** 31519ms

---

## 2. RESUMEN EJECUTIVO

- **Score Semántico Promedio**: 70.0%
- **Retrieval Confidence Promedio**: 0.6490
- **Negaciones Falsas Detectadas**: 5
- **Alucinaciones Graves (Score > 0.3)**: 1

