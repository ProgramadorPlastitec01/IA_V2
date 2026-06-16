# Reporte de Optimización LLM (Fase 1.4)

> Generado el: 2026-06-03T03:10:23.335Z

## 1. EVALUACIÓN SEMÁNTICA END-TO-END (LLM-as-a-Judge)

### Query 1: ¿Los visitantes pueden conservar ropa de calle debajo del overol?
- **Intención:** Saber si la regla permite dejar la ropa de calle
- **Respuesta RAG:** > Sí, los visitantes que no van a manipular los productos pueden conservar la ropa de calle debajo del overol.
- **Métricas QA:**
  - Semantic Correctness: 0.8
  - Hallucination Score: 0
  - Polarity Match: ✅ Sí
- **Razonamiento del Juez:** La respuesta es correcta en términos de semántica, ya que el asistente indica que los visitantes pueden conservar la ropa de calle debajo del overol sin manipular los productos. Sin embargo, podría haber sido más claro al no mencionar explícitamente que esto se aplica a todos los visitantes.
- **Latencia Total:** 46935ms

---

### Query 2: ¿Los hombres pueden dejarse la barba y el bigote si tienen contacto con el producto?
- **Intención:** Saber si se permite vello facial en áreas de proceso
- **Respuesta RAG:** > No, los hombres no pueden dejarse la barba y el bigote si tienen contacto directo con el producto, ya que está prohibido en las áreas de producción, laboratorio y almacenamiento.
- **Métricas QA:**
  - Semantic Correctness: 0.8
  - Hallucination Score: 0.2
  - Polarity Match: ❌ No
- **Razonamiento del Juez:** La respuesta del asistente incluyó información fuera del contexto, específicamente la prohibición en áreas de producción, laboratorio y almacenamiento, lo que no se mencionaba en la pregunta original.
- **Latencia Total:** 87551ms

---

### Query 3: ¿Cómo se deben lavar los uniformes?
- **Intención:** Conocer el procedimiento o regla de lavado
- **Respuesta RAG:** > Los uniformes deben lavarse separado de la demás ropa, con agua y jabón para retirar la mugre. Realizar el proceso de DESINFECCIÓN mezclando agua más HIPOCLORITO, dejarlo en esta preparación por mínimo diez minutos y enjuagarlo. Secar en un lugar libre de contaminación.
- **Métricas QA:**
  - Semantic Correctness: 0.8
  - Hallucination Score: 0.2
  - Polarity Match: ❌ No
- **Razonamiento del Juez:** La respuesta del asistente proporciona información correcta sobre el procedimiento de lavado, pero incluye una mención a la desinfección con hipoclorito, que no está en el contexto original. Además, la respuesta inicia con un 'Sí' que no coincide con la polaridad esperada de informativa.
- **Latencia Total:** 60854ms

---

### Query 4: ¿Qué es el SAGRILAFT?
- **Intención:** Definición del acrónimo
- **Respuesta RAG:** > El texto proporcionado no contiene información sobre qué es el SAGRILAFT, por lo que no puedo responder esta pregunta desde el contexto proporcionado.
- **Métricas QA:**
  - Semantic Correctness: 0
  - Hallucination Score: 0
  - Polarity Match: ❌ No
- **Razonamiento del Juez:** La respuesta del asistente no proporciona información sobre el SAGRILAFT, ya que no está presente en el contexto proporcionado.
- **Latencia Total:** 46426ms

---

### Query 5: ¿Cuáles son los objetivos del SG-SST?
- **Intención:** Conocer el propósito del sistema de gestión
- **Respuesta RAG:** > El texto proporcionado no contiene información sobre los objetivos del SG-SST, por lo que no puedo responder esta pregunta desde el contexto proporcionado.
- **Métricas QA:**
  - Semantic Correctness: 0.8
  - Hallucination Score: 0
  - Polarity Match: ✅ Sí
- **Razonamiento del Juez:** La respuesta del asistente es correcta en términos de información disponible, pero no proporciona objetivos específicos para el SG-SST debido a la falta de contexto.
- **Latencia Total:** 51000ms

---

### Query 6: ¿Está permitido el uso de maquillaje dentro de la planta?
- **Intención:** Verificar la regla sobre maquillaje
- **Respuesta RAG:** > No se menciona nada sobre el uso de maquillaje dentro de la planta en el texto proporcionado, por lo que no puedo responder esta pregunta desde el contexto proporcionado.
- **Métricas QA:**
  - Semantic Correctness: 0.8
  - Hallucination Score: 0
  - Polarity Match: ❌ No
- **Razonamiento del Juez:** La respuesta del asistente no coincide con la intención real del usuario porque no nega explícitamente que el uso de maquillaje está prohibido, aunque menciona que no hay información sobre el tema en el contexto proporcionado.
- **Latencia Total:** 52714ms

---

### Query 7: ¿Qué es el COPASST?
- **Intención:** Definición del comité
- **Respuesta RAG:** > El texto proporcionado no contiene información sobre el COPASST, por lo que no puedo responder esta pregunta desde el contexto proporcionado.
- **Métricas QA:**
  - Semantic Correctness: 0.8
  - Hallucination Score: 0
  - Polarity Match: ✅ Sí
- **Razonamiento del Juez:** La respuesta del asistente es correcta en términos de información proporcionada, pero no responde a la intención real del usuario ya que no proporciona una definición del comité.
- **Latencia Total:** 50411ms

---

### Query 8: ¿Qué significa BPM en Plastitec? ¿Es Business Process Management?
- **Intención:** Aclaración de acrónimo en el diccionario corporativo
- **Respuesta RAG:** > No es especificado en el documento si BPM se refiere a "Business Process Management" o no, por lo que la respuesta es:
> 
> NO ESPECIFICADO EN EL DOCUMENTO.
> 
> Sin embargo, según el documento I-RH-001-V-, se menciona que BPM depende de la actividad que se esté desempeñando. 
> 
> [Fuente: Documento I-RH-001-V- 20 -22  VERSION Conocimiento Plastitec (Material Visual) 22.pdf]
> 
> ---
> **Fuentes:**
> - I-RH-004 - 14 Induccion en Seguridad Salud en el Trabajo.pdf
> - I-RH-001-V- 20 -22  VERSION Conocimiento Plastitec (Material Visual) 22.pdf
- **Métricas QA:**
  - Semantic Correctness: 0.8
  - Hallucination Score: 0.2
  - Polarity Match: ❌ No
- **Razonamiento del Juez:** La respuesta del asistente no coincide con la intención real del usuario ya que menciona una posible interpretación de BPM, aunque no se especifica en el documento si es exactamente Business Process Management.
- **Latencia Total:** 28373ms

---

### Query 9: ¿Cuánto tiempo debe durar el lavado de manos?
- **Intención:** Saber duración del lavado de manos
- **Respuesta RAG:** > NO ESPECIFICADO EN EL DOCUMENTO
- **Métricas QA:**
  - Semantic Correctness: 0.8
  - Hallucination Score: 0
  - Polarity Match: ✅ Sí
- **Razonamiento del Juez:** La respuesta es correcta en términos de semántica, ya que no se proporciona una duración específica para el lavado de manos en el documento. Sin embargo, la respuesta podría ser más útil si incluyera una recomendación general o una referencia a las normas de salud pública.
- **Latencia Total:** 28484ms

---

### Query 10: ¿Cómo se termina el contrato de aprendiz SENA?
- **Intención:** Saber causales de terminación
- **Respuesta RAG:** > El texto proporcionado no contiene información sobre cómo se termina el contrato de aprendiz SENA, por lo que no puedo responder esta pregunta desde el contexto proporcionado.
- **Métricas QA:**
  - Semantic Correctness: 0.8
  - Hallucination Score: 0
  - Polarity Match: ✅ Sí
- **Razonamiento del Juez:** La respuesta del Asistente es correcta en cuanto a la falta de información sobre cómo se termina el contrato de aprendiz SENA, pero no proporciona una explicación detallada o alternativas.
- **Latencia Total:** 50803ms

---

## 2. RESUMEN EJECUTIVO

- **Score Semántico Promedio**: 72.0%
- **Negaciones Falsas Detectadas**: 0
- **Alucinaciones Graves (Score > 0.3)**: 0

