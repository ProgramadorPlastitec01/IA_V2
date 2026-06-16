# Manual Operativo - Plastitec AI

## 1. Inicio y Detención del Sistema

### Dependencias Principales
El sistema requiere **Ollama** y **Qdrant** corriendo en paralelo antes de levantar el servidor Node.js.

### Inicio Rápido
1. Abre una consola y arranca la base de datos vectorial local:
   ```bash
   start_qdrant.bat
   ```
2. Asegúrate de que el modelo LLaMA 3.2 esté cargado en Ollama de fondo (normalmente arranca con el SO o se gestiona vía Docker/Servicio).
3. Arranca el API web de RAG:
   ```bash
   node server.js
   ```

## 2. Ingesta y Actualización Documental

### Cómo agregar nuevos PDFs
1. Mueve tu archivo `.pdf` a la carpeta `docs/`.
2. Para que el OCR lo procese y se fragmente en Qdrant (colección `plastitec_docs`), ejecuta un script de ingesta (ej. si existe `node scripts/ingest_documents.js`, o mediante endpoint de administración si se habilitó).
   *Nota: Dado que no hay un pipeline unificado de CI/CD para documentos, un nuevo PDF requiere reiniciar el proceso manual de Chunking e Indexación utilizando `services/ingestionService.js`.*

### Reindexación Total
Si modificas el tamaño de los Chunks (Chunk Size) o cambias el modelo a `nomic-embed-text`:
1. Detén el servidor web.
2. Ingresa a la interfaz de Qdrant (http://localhost:6333/dashboard) y elimina la colección `plastitec_docs`.
3. Vuelve a correr la ingesta completa para regenerar todos los vectores desde los PDFs originales.

## 3. QA y Benchmarking

Antes de cualquier despliegue de una nueva regla heurística, DEBES evaluar su impacto global.

### Ejecutar Benchmark Completo
El benchmark principal es `tests/test_enterprise_real_benchmark.js`. Evalúa 75 preguntas estructuradas y toma ~15-20 minutos usando el LLM como juez.
```bash
node tests/test_enterprise_real_benchmark.js
```
- Lee la salida final para verificar el `Enterprise Score` (Objetivo > 90%).
- Los reportes se sobreescriben automáticamente en `reports/enterprise_benchmark_real.md`.

### Ejecutar Test Semántico (Rápido)
Para probar polaridad y latencia sin tener que esperar 20 minutos, usa:
```bash
node test_semantic_qa.js
```

## 4. Regenerar Knowledge Base (Fase 2.4.5 WIP)

Cuando la Fase 2.4.5 esté totalmente integrada, los pasos para regenerar la capa estructurada serán:
1. `node scripts/knowledge_audit.js` (Audita los documentos PDF activos).
2. `node scripts/extract_knowledge.js` (Llama al LLM para generar FAQ y Procedimientos en `knowledge/*.md`).
3. `node scripts/ingest_knowledge_base.js` (Indexa los archivos `.md` en la colección secundaria de Qdrant `knowledge_base`).
