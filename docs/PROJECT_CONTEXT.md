# Contexto del Proyecto: Plastitec AI

## 1. Visión General
**Plastitec AI** es un asistente conversacional basado en la arquitectura RAG (Retrieval-Augmented Generation) diseñado para la empresa PLASTITEC. Su propósito es brindar respuestas precisas a los empleados sobre políticas, Reglamentos Internos de Trabajo (RIT), procesos de manufactura (BPMM), inducción de SST y temas éticos (SAGRILAFT). 

### Comparación frente a NotebookLM
A diferencia de *Google NotebookLM* que actúa como un entorno cerrado de investigación personal donde el usuario sube documentos bajo demanda, Plastitec AI es un sistema **Enterprise RAG**:
- Centraliza la Base de Conocimiento oficial de la compañía.
- Opera en un entorno local (On-Premise) por privacidad de datos utilizando modelos abiertos (LLaMA 3.2, mxbai-embed-large).
- Incorpora *Confidence Engines* y *Reranking* heurístico que evitan activamente las alucinaciones y fuerzan respuestas negativas si no existe evidencia documental corporativa (Zero-Hallucination Policy).

---

## 2. Cronología de Evolución
- **Fase 1.0 a 1.2:** Creación de RAG base con Gemma y embeddings ligeros. Problemas de alucinación masiva y context loss.
- **Fase 1.3:** Migración a Ollama local con LLaMA 3.2. Implementación de Confidence Validator y Reranking simple. 
- **Fase 2.1 a 2.3:** Benchmark semántico. Ajuste duro del umbral de confianza. Implementación de BM25 + Reciprocal Rank Fusion (RRF). Reducción de False Negatives.
- **Fase 2.4.2:** Optimización quirúrgica del Retrieval para los dominios problemáticos (Ética y SAGRILAFT) mediante parcheo de metadatos en Qdrant y expansión de vocabulario.
- **Fase 2.4.4A:** (Actual) Auditoría técnica, limpieza de deuda tecnológica y documentación integral de arquitectura.
- **Fase 2.4.5 (WIP):** Capa de Knowledge Extraction (generación de FAQs y procesos estructurados mediante LLM).

---

## 3. Arquitectura Actual (Fase 2.4.4A)

El sistema opera bajo un pipeline lineal y determinista.

### Pipeline Completo
\`\`\`mermaid
flowchart TD
    %% Ingestion
    A[PDF/Documento] --> B[OCR / pdfProcessor]
    B --> C[Chunking / ingestionService]
    C --> D[Embeddings mxbai]
    D --> E[(Qdrant: plastitec_docs)]
    
    %% Retrieval
    F[User Query] --> G[queryUnderstandingService]
    G --> H[ragService Híbrido]
    H --> E
    E -.-> I[Top K Chunks]
    I --> J[rerankingService + Heurísticas]
    
    %% Validation
    J --> K[retrievalConfidence]
    K --> L{Confidence > 0.40?}
    L -- No --> M[Respuesta Negativa Segura]
    
    %% Generation
    L -- Sí --> N[LLaMA 3.2 via llmService]
    N --> O[Respuesta al Usuario]
\`\`\`

---

## 4. Work In Progress (WIP) - Fase 2.4.5: Knowledge Extraction

Se está construyendo una capa paralela para superar las limitaciones del chunking de PDFs largos:

\`\`\`mermaid
flowchart TD
    %% WIP Ingestion
    A[PDF] --> B[knowledgeExtractionService]
    B --> C[ETICA_RAG.md, BPM_RAG.md...]
    C --> D[(Qdrant: knowledge_base)]
    
    %% WIP Retrieval
    F[User Query] --> G[ragService Búsqueda Dual]
    G --> D
    G --> E[(Qdrant: plastitec_docs)]
    D -.-> H[Fusión Inteligente]
    E -.-> H
    H --> I[LLaMA 3.2]
\`\`\`
*Nota: Estos componentes están en desarrollo y no actúan sobre el pipeline productivo actual.*

---

## 5. Descripción de Componentes

1. **`ingestionService.js`**: Divide los documentos PDF en fragmentos de texto (chunks) superpuestos.
2. **`pdfProcessor.js`**: Lee los bytes del PDF y utiliza OCR para digitalizar PDFs escaneados o imágenes embebidas.
3. **`ragService.js`**: Orquestador principal que consulta a Qdrant, enviando vectores densos y palabras clave.
4. **`queryUnderstandingService.js`**: Toma la frase del usuario y extrae la intención, expandiendo acrónimos (ej. COPASST) usando el `corporateVocabulary.json`.
5. **`rerankingService.js`**: Toma los chunks retornados por Qdrant y les asigna un nuevo peso combinando métricas densas, BM25 y multiplicadores si pertenecen al mismo dominio de la query.
6. **`retrievalConfidence.js`**: Mide qué tan relevante es el contexto encontrado evaluando densidad de keywords y similitud de coseno.
7. **`llmService.js`**: Capa agnóstica de conexión con Ollama. Implementa modo estricto, resúmenes, reintentos y prevención de timeouts.
8. **`answerJudge.js`**: (Uso en Benchmarks) LLM como juez para calificar las respuestas según Grounding, Hallucination y Correctitud semántica.
