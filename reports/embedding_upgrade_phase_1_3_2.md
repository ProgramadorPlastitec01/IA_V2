# Reporte de Upgrade de Embeddings (Fase 1.3.2)

> Generado el: 2026-05-25T20:18:33.820Z

## 3. & 4. VALIDACIÓN OCR REAL Y CHUNKING

Total Chunks: 474 | OCR Chunks: 200 | Bad Chunks: 25

### Documento: I-RH-003 - 18 BPMM (Material Visual) (1).pdf
- **Chunks**: 28
- **OCR Usado**: Sí (28 chunks)
- **Estrategia(s)**: HYBRID_OCR
- **Calidad Promedio**: 54.3%
- **Caracteres Extraídos**: 20138
- **Secciones Detectadas**: 5

### Documento: I-RH-017-5 CODIGO DE ETICA (Material visual).pdf
- **Chunks**: 24
- **OCR Usado**: Sí (24 chunks)
- **Estrategia(s)**: HYBRID_OCR
- **Calidad Promedio**: 64.4%
- **Caracteres Extraídos**: 11512
- **Secciones Detectadas**: 3

### Documento: COMUNICADO RIT PLASTITEC 25 NOV 2025.pdf
- **Chunks**: 6
- **OCR Usado**: Sí (6 chunks)
- **Estrategia(s)**: FULL_OCR
- **Calidad Promedio**: 84.5%
- **Caracteres Extraídos**: 3502
- **Secciones Detectadas**: 3

### Documento: RIT PLASTITEC 25 NOV 2025.pdf
- **Chunks**: 256
- **OCR Usado**: No
- **Estrategia(s)**: EMBEDDED_TEXT
- **Calidad Promedio**: 88.9%
- **Caracteres Extraídos**: 167465
- **Secciones Detectadas**: 0

### Documento: I-RH-004 - 14 Induccion en Seguridad Salud en el Trabajo.pdf
- **Chunks**: 116
- **OCR Usado**: Sí (116 chunks)
- **Estrategia(s)**: HYBRID_OCR
- **Calidad Promedio**: 65.3%
- **Caracteres Extraídos**: 67440
- **Secciones Detectadas**: 16

### Documento: PLASTITEC EMPRESA.txt
- **Chunks**: 2
- **OCR Usado**: No
- **Estrategia(s)**: TEXTO_PLANO
- **Calidad Promedio**: 100.0%
- **Caracteres Extraídos**: 260
- **Secciones Detectadas**: 0

### Documento: I-RH-010  VERSIÓN 6 .pdf
- **Chunks**: 3
- **OCR Usado**: No
- **Estrategia(s)**: EMBEDDED_TEXT
- **Calidad Promedio**: 71.6%
- **Caracteres Extraídos**: 1926
- **Secciones Detectadas**: 0

### Documento: I-RH-001-V- 20 -22  VERSION Conocimiento Plastitec (Material Visual) 22.pdf
- **Chunks**: 26
- **OCR Usado**: Sí (26 chunks)
- **Estrategia(s)**: HYBRID_OCR
- **Calidad Promedio**: 43.0%
- **Caracteres Extraídos**: 17403
- **Secciones Detectadas**: 3

### Documento: I-RH-006 VERSIÓN 6 EN A3.pdf
- **Chunks**: 4
- **OCR Usado**: No
- **Estrategia(s)**: EMBEDDED_TEXT
- **Calidad Promedio**: 82.1%
- **Caracteres Extraídos**: 3173
- **Secciones Detectadas**: 0

### Documento: I-RH-011 VERSIÓN 6 .pdf
- **Chunks**: 3
- **OCR Usado**: No
- **Estrategia(s)**: EMBEDDED_TEXT
- **Calidad Promedio**: 80.7%
- **Caracteres Extraídos**: 3070
- **Secciones Detectadas**: 0

### Documento: I-RH- 012 VERSIÓN 6 .pdf
- **Chunks**: 3
- **OCR Usado**: No
- **Estrategia(s)**: EMBEDDED_TEXT
- **Calidad Promedio**: 77.3%
- **Caracteres Extraídos**: 2694
- **Secciones Detectadas**: 0

### Documento: I-RH- 009 VERSIÓN 6 EN A3.pdf
- **Chunks**: 3
- **OCR Usado**: No
- **Estrategia(s)**: EMBEDDED_TEXT
- **Calidad Promedio**: 76.2%
- **Caracteres Extraídos**: 2484
- **Secciones Detectadas**: 0

## 1., 2. & 5. AUDITORÍA DE RETRIEVAL, GROUNDING Y RESPUESTAS

### Query: ¿Los visitantes pueden conservar ropa de calle debajo del overol?
- **Respuesta Final:**
  > Sí. Los visitantes que no van a manipular los productos pueden conservar la ropa de calle debajo del overol.

- **Confianza:** 11.6%
- **Fuentes:** I-RH-006 VERSIÓN 6 EN A3.pdf, I-RH-004 - 14 Induccion en Seguridad Salud en el Trabajo.pdf
- **Métricas de Rendimiento:**
  - Expansion: 0ms
  - Embedding: 408ms
  - Retrieval: 246ms
  - Reranking: 10ms
  - Inferencia LLM: 38882ms
  - Total: 39564ms

- **Top Chunks Recuperados (Reranking):**
  1. [Score: 1.1553] - I-RH-006 VERSIÓN 6 EN A3.pdf (hybrid)
  2. [Score: 1.1508] - I-RH-006 VERSIÓN 6 EN A3.pdf (hybrid)
  3. [Score: 0.7524] - I-RH-004 - 14 Induccion en Seguridad Salud en el Trabajo.pdf (semantic)

---

### Query: ¿Los hombres pueden dejarse la barba y el bigote si tienen contacto con el producto?
- **Respuesta Final:**
  > No. El contexto prohíbe a los hombres dejarse la barba y el bigote si tienen contacto directo con el producto.

- **Confianza:** 7.4%
- **Fuentes:** I-RH-003 - 18 BPMM (Material Visual) (1).pdf, I-RH-006 VERSIÓN 6 EN A3.pdf
- **Métricas de Rendimiento:**
  - Expansion: 0ms
  - Embedding: 2226ms
  - Retrieval: 217ms
  - Reranking: 16ms
  - Inferencia LLM: 38768ms
  - Total: 41237ms

- **Top Chunks Recuperados (Reranking):**
  1. [Score: 0.7393] - I-RH-003 - 18 BPMM (Material Visual) (1).pdf (hybrid)
  2. [Score: 0.7391] - I-RH-003 - 18 BPMM (Material Visual) (1).pdf (hybrid)
  3. [Score: 0.6169] - I-RH-006 VERSIÓN 6 EN A3.pdf (semantic)

---

### Query: ¿Qué es el SAGRILAFT?
- **Respuesta Final:**
  > El SAGRILAFT es un sistema de autocontrol y gestión del riesgo integral de lavado de activos y financiamiento del terrorismo.

- **Confianza:** 14.0%
- **Fuentes:** I-RH-017-5 CODIGO DE ETICA (Material visual).pdf, I-RH-004 - 14 Induccion en Seguridad Salud en el Trabajo.pdf
- **Métricas de Rendimiento:**
  - Expansion: 1ms
  - Embedding: 2263ms
  - Retrieval: 87ms
  - Reranking: 8ms
  - Inferencia LLM: 29892ms
  - Total: 32266ms

- **Top Chunks Recuperados (Reranking):**
  1. [Score: 1.4040] - I-RH-017-5 CODIGO DE ETICA (Material visual).pdf (hybrid)
  2. [Score: 1.3565] - I-RH-017-5 CODIGO DE ETICA (Material visual).pdf (keyword)
  3. [Score: 0.2574] - I-RH-004 - 14 Induccion en Seguridad Salud en el Trabajo.pdf (semantic)

---

### Query: ¿Cómo se deben lavar los uniformes?
- **Respuesta Final:**
  > Los uniformes deben lavarse cada vez que sean utilizados. No aplica los números de rotación para el personal y/o áreas que utilizan el servicio de lavandería externa. [Fuente: I-RH-003 - 18 BPMM (Material Visual) (1).pdf]

- **Confianza:** 11.0%
- **Fuentes:** I-RH-003 - 18 BPMM (Material Visual) (1).pdf
- **Métricas de Rendimiento:**
  - Expansion: 0ms
  - Embedding: 2063ms
  - Retrieval: 25ms
  - Reranking: 9ms
  - Inferencia LLM: 38858ms
  - Total: 40967ms

- **Top Chunks Recuperados (Reranking):**
  1. [Score: 1.1010] - I-RH-003 - 18 BPMM (Material Visual) (1).pdf (semantic)
  2. [Score: 1.1001] - I-RH-003 - 18 BPMM (Material Visual) (1).pdf (semantic)
  3. [Score: 0.9640] - I-RH-003 - 18 BPMM (Material Visual) (1).pdf (semantic)

---

### Query: ¿Cuáles son los objetivos del SG-SST?
- **Respuesta Final:**
  > El objetivo del SG-SST es mejorar las condiciones de trabajo y salud de los empleados de PLASTITEC, controlando la exposición a factores de riesgo.

- **Confianza:** 5.1%
- **Fuentes:** I-RH-004 - 14 Induccion en Seguridad Salud en el Trabajo.pdf
- **Métricas de Rendimiento:**
  - Expansion: 0ms
  - Embedding: 2280ms
  - Retrieval: 107ms
  - Reranking: 7ms
  - Inferencia LLM: 33074ms
  - Total: 35482ms

- **Top Chunks Recuperados (Reranking):**
  1. [Score: 0.5104] - I-RH-004 - 14 Induccion en Seguridad Salud en el Trabajo.pdf (hybrid)
  2. [Score: 0.5103] - I-RH-004 - 14 Induccion en Seguridad Salud en el Trabajo.pdf (hybrid)
  3. [Score: 0.0574] - I-RH-004 - 14 Induccion en Seguridad Salud en el Trabajo.pdf (semantic)

---

### Query: ¿Qué es el COPASST?
- **Respuesta Final:**
  > El COPASST es el Comité Paritario de Seguridad y Salud en el Trabajo. Es un grupo de personas que se encargan de promover el cuidado integral de la salud de los empleados, controlar la exposición a factores de riesgo y garantizar las mejores condiciones de trabajo y salud.

- **Confianza:** 16.0%
- **Fuentes:** I-RH-004 - 14 Induccion en Seguridad Salud en el Trabajo.pdf
- **Métricas de Rendimiento:**
  - Expansion: 1ms
  - Embedding: 2220ms
  - Retrieval: 93ms
  - Reranking: 12ms
  - Inferencia LLM: 39497ms
  - Total: 41834ms

- **Top Chunks Recuperados (Reranking):**
  1. [Score: 1.5989] - I-RH-004 - 14 Induccion en Seguridad Salud en el Trabajo.pdf (hybrid)
  2. [Score: 1.5556] - I-RH-004 - 14 Induccion en Seguridad Salud en el Trabajo.pdf (keyword)
  3. [Score: 1.5538] - I-RH-004 - 14 Induccion en Seguridad Salud en el Trabajo.pdf (keyword)

---

### Query: ¿Qué significa BPM en Plastitec? ¿Es Business Process Management?
- **Respuesta Final:**
  > No, BPM en Plastitec no significa Business Process Management. En el diccionario corporativo de Plastitec, BPM significa Buenas Prácticas de Manufactura.

- **Confianza:** 9.0%
- **Fuentes:** I-RH-004 - 14 Induccion en Seguridad Salud en el Trabajo.pdf, I-RH-001-V- 20 -22  VERSION Conocimiento Plastitec (Material Visual) 22.pdf
- **Métricas de Rendimiento:**
  - Expansion: 0ms
  - Embedding: 2279ms
  - Retrieval: 290ms
  - Reranking: 7ms
  - Inferencia LLM: 36995ms
  - Total: 39579ms

- **Top Chunks Recuperados (Reranking):**
  1. [Score: 0.9015] - I-RH-004 - 14 Induccion en Seguridad Salud en el Trabajo.pdf (semantic)
  2. [Score: 0.9006] - I-RH-004 - 14 Induccion en Seguridad Salud en el Trabajo.pdf (semantic)
  3. [Score: 0.8572] - I-RH-001-V- 20 -22  VERSION Conocimiento Plastitec (Material Visual) 22.pdf (semantic)

---

### Query: ¿Está permitido el uso de maquillaje dentro de la planta?
- **Respuesta Final:**
  > No está permitido el uso de maquillaje dentro de la planta. 
  > 
  > La regla se encuentra en las PROHIBICIONES, donde se especifica que para las mujeres: "No usar maquillaje de ningún tipo".

- **Confianza:** 9.8%
- **Fuentes:** I-RH-003 - 18 BPMM (Material Visual) (1).pdf, I-RH-004 - 14 Induccion en Seguridad Salud en el Trabajo.pdf
- **Métricas de Rendimiento:**
  - Expansion: 0ms
  - Embedding: 2213ms
  - Retrieval: 265ms
  - Reranking: 30ms
  - Inferencia LLM: 37556ms
  - Total: 40084ms

- **Top Chunks Recuperados (Reranking):**
  1. [Score: 0.9810] - I-RH-003 - 18 BPMM (Material Visual) (1).pdf (semantic)
  2. [Score: 0.9803] - I-RH-003 - 18 BPMM (Material Visual) (1).pdf (semantic)
  3. [Score: 0.6890] - I-RH-004 - 14 Induccion en Seguridad Salud en el Trabajo.pdf (semantic)

---

### Query: ¿Cuánto tiempo debe durar el lavado de manos?
- **Respuesta Final:**
  > El texto proporcionado no contiene información sobre cuánto tiempo debe durar el lavado de manos.

- **Confianza:** 9.3%
- **Fuentes:** I-RH-003 - 18 BPMM (Material Visual) (1).pdf, I-RH- 012 VERSIÓN 6 .pdf
- **Métricas de Rendimiento:**
  - Expansion: 0ms
  - Embedding: 2230ms
  - Retrieval: 183ms
  - Reranking: 12ms
  - Inferencia LLM: 36555ms
  - Total: 38996ms

- **Top Chunks Recuperados (Reranking):**
  1. [Score: 0.9343] - I-RH-003 - 18 BPMM (Material Visual) (1).pdf (semantic)
  2. [Score: 0.9335] - I-RH-003 - 18 BPMM (Material Visual) (1).pdf (semantic)
  3. [Score: 0.6707] - I-RH- 012 VERSIÓN 6 .pdf (semantic)

---

### Query: ¿Cómo se termina el contrato de aprendiz SENA?
- **Respuesta Final:**
  > El texto proporcionado no contiene información sobre cómo se termina el contrato de aprendiz SENA, por lo que no puedo responder esta pregunta desde el contexto proporcionado.

- **Confianza:** 8.0%
- **Fuentes:** RIT PLASTITEC 25 NOV 2025.pdf
- **Métricas de Rendimiento:**
  - Expansion: 0ms
  - Embedding: 2226ms
  - Retrieval: 158ms
  - Reranking: 4ms
  - Inferencia LLM: 34464ms
  - Total: 36862ms

- **Top Chunks Recuperados (Reranking):**
  1. [Score: 0.8049] - RIT PLASTITEC 25 NOV 2025.pdf (semantic)
  2. [Score: 0.7726] - RIT PLASTITEC 25 NOV 2025.pdf (semantic)
  3. [Score: 0.7393] - RIT PLASTITEC 25 NOV 2025.pdf (semantic)

---

## 6. DETECCIÓN DE FALSOS PASS EN TEST V5

Analizando el script test_accuracy_v5.js:
- **Mecanismo de PASS**: Valida "PASS" si (1) la respuesta NO contiene las frases de fallback (ej: "no encuentro") Y (2) la fuente esperada es citada.
- **Problema**: NO valida la calidad semántica de la respuesta final. Si el bot dice "Sí, puedes conservar ropa" (Falso/Incorrecto) pero cita la fuente correcta, el test marca PASS. Esto es un falso positivo enorme para queries donde el contexto es confuso o la respuesta es una prohibición que el LLM invierte.

## 7. PERFORMANCE REAL PROMEDIO

- Embedding: 2041 ms
- Retrieval: 167 ms
- Reranking: 12 ms
- LLM: 36454 ms
- TOTAL PROMEDIO: 38687 ms

## 8. RECOMENDACIONES (Próximos Pasos)
1. **Embeddings**: El modelo actual nomic-embed-text es rápido pero tiene problemas semánticos (ej: asociar lavar con ropa) en español.
2. **Evaluación de Respuestas**: El QA suite debe usar LLM-as-a-judge para validar si la respuesta semánticamente aprueba, no solo si citó el documento correcto.
3. **LLM**: El fallback Llama3.2 puede mejorar la precisión en tareas extractivas específicas donde Gemma alucina prohibiciones.
