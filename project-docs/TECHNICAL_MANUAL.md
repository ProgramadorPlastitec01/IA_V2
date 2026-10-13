# Manual Técnico - Plastitec AI

## 1. Arquitectura de Carpetas
El repositorio sigue una arquitectura de micro-servicios modularizados basada en Node.js.

- `/config` → Configuraciones estáticas, mapas léxicos corporativos (`corporateVocabulary.json`).
- `/docs` → Documentación técnica, manuales y contexto del proyecto.
- `/logs` → Archivos JSONL con el volcado histórico de respuestas y debug.
- `/qdrant` → Binario y base de datos vectorial local (On-Premise).
- `/reports` → Reportes de benchmarks y auditorías en formato Markdown.
- `/scripts` → Scripts ejecutables aislados para parcheo, auditoría e ingesta masiva.
- `/services` → Core lógico de la aplicación (RAG, LLM, Embeddings, Reranker).
- `/tests` → Suite de QA (Semantic QA, Enterprise Benchmarks).

---

## 2. Variables de Entorno y Configuración
El sistema depende estrictamente del archivo `.env` en la raíz del proyecto.

**Configuraciones Críticas:**
- `QDRANT_URL=http://localhost:6333` (Dirección del motor vectorial).
- `OLLAMA_URL=http://localhost:11434` (Inferencia LLM local).
- `OLLAMA_MODEL=llama3.2` (Modelo de lenguaje activo).
- `OLLAMA_EMBEDDING_MODEL=mxbai-embed-large` (Modelo para vectores).
- `LLM_RESPONSE_MODE=STRICT_EXTRACTIVE` (Evita que el LLM invente información).
- `OLLAMA_TIMEOUT=180000` (Evita bloqueos del servidor por inferencia larga).

> [!WARNING]
> Nunca modifiques el modelo de Embeddings en caliente. Si cambias de `mxbai-embed-large` a `nomic-embed-text`, la dimensionalidad cambiará y Qdrant arrojará errores. Requieres purgar la base y reingestar todo.

---

## 3. Descripción de Módulos Core

### Qdrant y Embeddings
- Se utiliza **Qdrant** en modo ejecutable local (`qdrant.exe`).
- La colección productiva es `plastitec_docs`.
- Los vectores densos son de 1024 dimensiones (`mxbai-embed-large`).
- Los payloads contienen el texto original (`texto_original`), el título de la sección y metadatos anidados (`metadata.category`).

### Retrieval & Reranking
- `ragService.js`: Extrae el top-k de Qdrant.
- `rerankingService.js`: Emplea una combinación híbrida de similitud coseno + algoritmos léxicos (BM25 y RRF) para reordenar los chunks recibidos. 
- *Hardcoding Alert*: En la Fase 2.4.2 se añadió un boost agresivo de `+0.45` en código duro dentro de `_domainSpecificBoost` para salvar dominios de baja recuperación (Ética).

### Confidence Engine
- `retrievalConfidence.js`: Antes de invocar al LLM, evalúa el top-k. Si la confianza es menor a `0.40`, el sistema corta la ejecución y responde al usuario: *"No encontré información relacionada en los documentos oficiales"*. Esto es vital para mantener un 0% de alucinación legal.

---

## 4. Troubleshooting (Problemas Comunes)

**1. "Ollama API Error (400): invalid model name"**
- *Causa:* Se está pasando el `SYSTEM_PROMPT` en el lugar del parámetro del modelo al llamar a `llmService.generateResponse`.
- *Solución:* Asegurarse de concatenar el system prompt dentro del parámetro `prompt`.

**2. Qdrant Error: "Wrong input: dimension 768 mismatch"**
- *Causa:* Intentar ingestar con un embedding de menor dimensión en una colección inicializada para 1024.
- *Solución:* Usar siempre `mxbai-embed-large` u omitir los scripts viejos que usaban `nomic`.

**3. "Ollama timeout" / Servidor colgado**
- *Causa:* La fusión de grandes contextos (WIP Fase 2.4.5) inyecta más de 3000 tokens de entrada, lo cual sobrecarga la VRAM o el procesador de LLaMA 3.2.
- *Solución:* Limitar el top-K en `ragService.js` (max 3-4 chunks). Aumentar el `OLLAMA_TIMEOUT` en `.env`.
