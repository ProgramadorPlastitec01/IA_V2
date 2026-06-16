# Reporte de Auditoría RAG en Runtime (Fase 1.3.1)

> Generado el: 2026-05-25T15:35:20.134Z

## 3. & 4. VALIDACIÓN OCR REAL Y CHUNKING

Total Chunks: 1000 | OCR Chunks: 91 | Bad Chunks: 66

### Documento: I-RH-004 - 14 Induccion en Seguridad Salud en el Trabajo.pdf
- **Chunks**: 230
- **OCR Usado**: Sí (54 chunks)
- **Estrategia(s)**: TEXTO_EMBEBIDO, HYBRID_OCR
- **Calidad Promedio**: 91.9%
- **Caracteres Extraídos**: 32527
- **Secciones Detectadas**: 15

### Documento: RIT PLASTITEC 25 NOV 2025.pdf
- **Chunks**: 627
- **OCR Usado**: No
- **Estrategia(s)**: TEXTO_EMBEBIDO, EMBEDDED_TEXT
- **Calidad Promedio**: 99.5%
- **Caracteres Extraídos**: 153202
- **Secciones Detectadas**: 0

### Documento: I-RH-017-5 CODIGO DE ETICA (Material visual).pdf
- **Chunks**: 33
- **OCR Usado**: Sí (12 chunks)
- **Estrategia(s)**: HÍBRIDO, HYBRID_OCR
- **Calidad Promedio**: 87.1%
- **Caracteres Extraídos**: 5756
- **Secciones Detectadas**: 3

### Documento: I-RH-006 VERSIÓN 6 EN A3.pdf
- **Chunks**: 7
- **OCR Usado**: No
- **Estrategia(s)**: TEXTO_EMBEBIDO, EMBEDDED_TEXT
- **Calidad Promedio**: 97.4%
- **Caracteres Extraídos**: 1587
- **Secciones Detectadas**: 0

### Documento: I-RH-011 VERSIÓN 6 .pdf
- **Chunks**: 5
- **OCR Usado**: No
- **Estrategia(s)**: TEXTO_EMBEBIDO, EMBEDDED_TEXT
- **Calidad Promedio**: 96.1%
- **Caracteres Extraídos**: 1535
- **Secciones Detectadas**: 0

### Documento: I-RH-001-V- 20 -22  VERSION Conocimiento Plastitec (Material Visual) 22.pdf
- **Chunks**: 38
- **OCR Usado**: Sí (12 chunks)
- **Estrategia(s)**: HÍBRIDO, HYBRID_OCR
- **Calidad Promedio**: 82.0%
- **Caracteres Extraídos**: 8703
- **Secciones Detectadas**: 3

### Documento: I-RH-003 - 18 BPMM (Material Visual) (1).pdf
- **Chunks**: 37
- **OCR Usado**: Sí (10 chunks)
- **Estrategia(s)**: HÍBRIDO, HYBRID_OCR
- **Calidad Promedio**: 87.7%
- **Caracteres Extraídos**: 7172
- **Secciones Detectadas**: 5

### Documento: I-RH- 012 VERSIÓN 6 .pdf
- **Chunks**: 6
- **OCR Usado**: No
- **Estrategia(s)**: TEXTO_EMBEBIDO, EMBEDDED_TEXT
- **Calidad Promedio**: 96.2%
- **Caracteres Extraídos**: 1347
- **Secciones Detectadas**: 0

### Documento: I-RH-010  VERSIÓN 6 .pdf
- **Chunks**: 6
- **OCR Usado**: No
- **Estrategia(s)**: TEXTO_EMBEBIDO, EMBEDDED_TEXT
- **Calidad Promedio**: 95.3%
- **Caracteres Extraídos**: 963
- **Secciones Detectadas**: 0

### Documento: I-RH- 009 VERSIÓN 6 EN A3.pdf
- **Chunks**: 6
- **OCR Usado**: No
- **Estrategia(s)**: TEXTO_EMBEBIDO, EMBEDDED_TEXT
- **Calidad Promedio**: 96.0%
- **Caracteres Extraídos**: 1242
- **Secciones Detectadas**: 0

### Documento: PLASTITEC EMPRESA.txt
- **Chunks**: 2
- **OCR Usado**: No
- **Estrategia(s)**: TEXTO_PLANO
- **Calidad Promedio**: 100.0%
- **Caracteres Extraídos**: 130
- **Secciones Detectadas**: 0

### Documento: COMUNICADO RIT PLASTITEC 25 NOV 2025.pdf
- **Chunks**: 3
- **OCR Usado**: Sí (3 chunks)
- **Estrategia(s)**: FULL_OCR
- **Calidad Promedio**: 84.5%
- **Caracteres Extraídos**: 1751
- **Secciones Detectadas**: 3

## 1., 2. & 5. AUDITORÍA DE RETRIEVAL, GROUNDING Y RESPUESTAS

### Query: ¿Los visitantes pueden conservar ropa de calle debajo del overol?
- **Respuesta Final:**
  > Sí. Los visitantes pueden conservar ropa de calle debajo del overol, según la nota en el documento I-RH-006.

- **Confianza:** 11.6%
- **Fuentes:** I-RH-006 VERSIÓN 6 EN A3.pdf, I-RH-010  VERSIÓN 6 .pdf, I-RH- 009 VERSIÓN 6 EN A3.pdf
- **Métricas de Rendimiento:**
  - Expansion: 1ms
  - Embedding: 3865ms
  - Retrieval: 168ms
  - Reranking: 8ms
  - Inferencia LLM: 33474ms
  - Total: 37526ms

- **Top Chunks Recuperados (Reranking):**
  1. [Score: 1.1638] - I-RH-006 VERSIÓN 6 EN A3.pdf (hybrid)
  2. [Score: 1.1611] - I-RH-006 VERSIÓN 6 EN A3.pdf (hybrid)
  3. [Score: 0.9510] - I-RH-010  VERSIÓN 6 .pdf (semantic)

---

### Query: ¿Los hombres pueden dejarse la barba y el bigote si tienen contacto con el producto?
- **Respuesta Final:**
  > No. Los hombres están prohibidos de dejarse la barba y el bigote si tienen contacto directo con el producto.

- **Confianza:** 7.5%
- **Fuentes:** I-RH-003 - 18 BPMM (Material Visual) (1).pdf, I-RH-006 VERSIÓN 6 EN A3.pdf, I-RH-004 - 14 Induccion en Seguridad Salud en el Trabajo.pdf
- **Métricas de Rendimiento:**
  - Expansion: 0ms
  - Embedding: 1887ms
  - Retrieval: 200ms
  - Reranking: 5ms
  - Inferencia LLM: 35972ms
  - Total: 38075ms

- **Top Chunks Recuperados (Reranking):**
  1. [Score: 0.7463] - I-RH-003 - 18 BPMM (Material Visual) (1).pdf (hybrid)
  2. [Score: 0.7436] - I-RH-003 - 18 BPMM (Material Visual) (1).pdf (hybrid)
  3. [Score: 0.4574] - I-RH-003 - 18 BPMM (Material Visual) (1).pdf (semantic)

---

### Query: ¿Qué es el SAGRILAFT?
- **Respuesta Final:**
  > El SAGRILAFT es un sistema de autocontrol y gestión del riesgo integral de lavado de activos y financiamiento del terrorismo.

- **Confianza:** 14.1%
- **Fuentes:** I-RH-017-5 CODIGO DE ETICA (Material visual).pdf, RIT PLASTITEC 25 NOV 2025.pdf
- **Métricas de Rendimiento:**
  - Expansion: 0ms
  - Embedding: 1876ms
  - Retrieval: 72ms
  - Reranking: 2ms
  - Inferencia LLM: 36403ms
  - Total: 38367ms

- **Top Chunks Recuperados (Reranking):**
  1. [Score: 1.4148] - I-RH-017-5 CODIGO DE ETICA (Material visual).pdf (hybrid)
  2. [Score: 1.4129] - I-RH-017-5 CODIGO DE ETICA (Material visual).pdf (hybrid)
  3. [Score: 1.3556] - I-RH-017-5 CODIGO DE ETICA (Material visual).pdf (keyword)

---

### Query: ¿Cómo se deben lavar los uniformes?
- **Respuesta Final:**
  > No hay información en el contexto proporcionado sobre cómo se deben lavar los uniformes.

- **Confianza:** 3.6%
- **Fuentes:** I-RH- 009 VERSIÓN 6 EN A3.pdf, I-RH-006 VERSIÓN 6 EN A3.pdf, I-RH-004 - 14 Induccion en Seguridad Salud en el Trabajo.pdf, I-RH-003 - 18 BPMM (Material Visual) (1).pdf
- **Métricas de Rendimiento:**
  - Expansion: 0ms
  - Embedding: 1831ms
  - Retrieval: 23ms
  - Reranking: 1ms
  - Inferencia LLM: 34956ms
  - Total: 36822ms

- **Top Chunks Recuperados (Reranking):**
  1. [Score: 0.3565] - I-RH- 009 VERSIÓN 6 EN A3.pdf (semantic)
  2. [Score: 0.3530] - I-RH-006 VERSIÓN 6 EN A3.pdf (semantic)
  3. [Score: 0.3493] - I-RH-006 VERSIÓN 6 EN A3.pdf (semantic)

---

### Query: ¿Cuáles son los objetivos del SG-SST?
- **Respuesta Final:**
  > El contexto proporcionado no contiene información sobre los objetivos del SG-SST, por lo que no puedo responder esta pregunta desde el contexto proporcionado.

- **Confianza:** 5.1%
- **Fuentes:** I-RH-004 - 14 Induccion en Seguridad Salud en el Trabajo.pdf, RIT PLASTITEC 25 NOV 2025.pdf
- **Métricas de Rendimiento:**
  - Expansion: 0ms
  - Embedding: 1891ms
  - Retrieval: 79ms
  - Reranking: 5ms
  - Inferencia LLM: 38487ms
  - Total: 40471ms

- **Top Chunks Recuperados (Reranking):**
  1. [Score: 0.5103] - I-RH-004 - 14 Induccion en Seguridad Salud en el Trabajo.pdf (hybrid)
  2. [Score: 0.5102] - I-RH-004 - 14 Induccion en Seguridad Salud en el Trabajo.pdf (hybrid)
  3. [Score: 0.4574] - RIT PLASTITEC 25 NOV 2025.pdf (keyword)

---

### Query: ¿Qué es el COPASST?
- **Respuesta Final:**
  > No hay información en el contexto proporcionado sobre qué es el COPASST.

- **Confianza:** 15.6%
- **Fuentes:** I-RH-004 - 14 Induccion en Seguridad Salud en el Trabajo.pdf
- **Métricas de Rendimiento:**
  - Expansion: 0ms
  - Embedding: 1951ms
  - Retrieval: 64ms
  - Reranking: 3ms
  - Inferencia LLM: 39102ms
  - Total: 41126ms

- **Top Chunks Recuperados (Reranking):**
  1. [Score: 1.5556] - I-RH-004 - 14 Induccion en Seguridad Salud en el Trabajo.pdf (keyword)
  2. [Score: 1.5538] - I-RH-004 - 14 Induccion en Seguridad Salud en el Trabajo.pdf (keyword)
  3. [Score: 1.5493] - I-RH-004 - 14 Induccion en Seguridad Salud en el Trabajo.pdf (keyword)

---

### Query: ¿Qué significa BPM en Plastitec? ¿Es Business Process Management?
- **Respuesta Final:**
  > No. En Plastitec, BPM significa Buenas Prácticas de Manufactura, no Business Process Management.

- **Confianza:** 7.9%
- **Fuentes:** I-RH-001-V- 20 -22  VERSION Conocimiento Plastitec (Material Visual) 22.pdf, I-RH-004 - 14 Induccion en Seguridad Salud en el Trabajo.pdf
- **Métricas de Rendimiento:**
  - Expansion: 0ms
  - Embedding: 1955ms
  - Retrieval: 215ms
  - Reranking: 3ms
  - Inferencia LLM: 45833ms
  - Total: 48011ms

- **Top Chunks Recuperados (Reranking):**
  1. [Score: 0.7904] - I-RH-001-V- 20 -22  VERSION Conocimiento Plastitec (Material Visual) 22.pdf (semantic)
  2. [Score: 0.7893] - I-RH-001-V- 20 -22  VERSION Conocimiento Plastitec (Material Visual) 22.pdf (semantic)
  3. [Score: 0.7806] - I-RH-001-V- 20 -22  VERSION Conocimiento Plastitec (Material Visual) 22.pdf (semantic)

---

### Query: ¿Está permitido el uso de maquillaje dentro de la planta?
- **Respuesta Final:**
  > No está permitido el uso de maquillaje dentro de la planta. 
  > 
  > La regla se menciona en el texto: "Para las mujeres: No usar maquillaje de ningún tipo".

- **Confianza:** 10.1%
- **Fuentes:** I-RH-003 - 18 BPMM (Material Visual) (1).pdf, I-RH-006 VERSIÓN 6 EN A3.pdf, I-RH-011 VERSIÓN 6 .pdf, I-RH-004 - 14 Induccion en Seguridad Salud en el Trabajo.pdf
- **Métricas de Rendimiento:**
  - Expansion: 0ms
  - Embedding: 1888ms
  - Retrieval: 211ms
  - Reranking: 4ms
  - Inferencia LLM: 41649ms
  - Total: 43772ms

- **Top Chunks Recuperados (Reranking):**
  1. [Score: 1.0074] - I-RH-003 - 18 BPMM (Material Visual) (1).pdf (semantic)
  2. [Score: 0.9906] - I-RH-003 - 18 BPMM (Material Visual) (1).pdf (semantic)
  3. [Score: 0.7322] - I-RH-006 VERSIÓN 6 EN A3.pdf (semantic)

---

### Query: ¿Cuánto tiempo debe durar el lavado de manos?
- **Respuesta Final:**
  > La información sobre cuánto tiempo debe durar el lavado de manos no está contenida en el contexto proporcionado.

- **Confianza:** 6.8%
- **Fuentes:** I-RH-006 VERSIÓN 6 EN A3.pdf, I-RH- 012 VERSIÓN 6 .pdf, I-RH-003 - 18 BPMM (Material Visual) (1).pdf, I-RH-004 - 14 Induccion en Seguridad Salud en el Trabajo.pdf
- **Métricas de Rendimiento:**
  - Expansion: 0ms
  - Embedding: 1928ms
  - Retrieval: 155ms
  - Reranking: 5ms
  - Inferencia LLM: 41223ms
  - Total: 43322ms

- **Top Chunks Recuperados (Reranking):**
  1. [Score: 0.6839] - I-RH-006 VERSIÓN 6 EN A3.pdf (semantic)
  2. [Score: 0.6780] - I-RH- 012 VERSIÓN 6 .pdf (semantic)
  3. [Score: 0.5342] - I-RH-003 - 18 BPMM (Material Visual) (1).pdf (semantic)

---

### Query: ¿Cómo se termina el contrato de aprendiz SENA?
- **Respuesta Final:**
  > La información sobre cómo termina el contrato de aprendiz SENA no está contenida en el contexto proporcionado.

- **Confianza:** 8.9%
- **Fuentes:** RIT PLASTITEC 25 NOV 2025.pdf
- **Métricas de Rendimiento:**
  - Expansion: 0ms
  - Embedding: 1871ms
  - Retrieval: 126ms
  - Reranking: 8ms
  - Inferencia LLM: 36156ms
  - Total: 38165ms

- **Top Chunks Recuperados (Reranking):**
  1. [Score: 0.8897] - RIT PLASTITEC 25 NOV 2025.pdf (semantic)
  2. [Score: 0.8695] - RIT PLASTITEC 25 NOV 2025.pdf (semantic)
  3. [Score: 0.8660] - RIT PLASTITEC 25 NOV 2025.pdf (semantic)

---

## 6. DETECCIÓN DE FALSOS PASS EN TEST V5

Analizando el script test_accuracy_v5.js:
- **Mecanismo de PASS**: Valida "PASS" si (1) la respuesta NO contiene las frases de fallback (ej: "no encuentro") Y (2) la fuente esperada es citada.
- **Problema**: NO valida la calidad semántica de la respuesta final. Si el bot dice "Sí, puedes conservar ropa" (Falso/Incorrecto) pero cita la fuente correcta, el test marca PASS. Esto es un falso positivo enorme para queries donde el contexto es confuso o la respuesta es una prohibición que el LLM invierte.

## 7. PERFORMANCE REAL PROMEDIO

- Embedding: 2094 ms
- Retrieval: 131 ms
- Reranking: 4 ms
- LLM: 38326 ms
- TOTAL PROMEDIO: 40566 ms

## 8. RECOMENDACIONES (Próximos Pasos)
1. **Embeddings**: El modelo actual nomic-embed-text es rápido pero tiene problemas semánticos (ej: asociar lavar con ropa) en español.
2. **Evaluación de Respuestas**: El QA suite debe usar LLM-as-a-judge para validar si la respuesta semánticamente aprueba, no solo si citó el documento correcto.
3. **LLM**: El fallback Llama3.2 puede mejorar la precisión en tareas extractivas específicas donde Gemma alucina prohibiciones.
