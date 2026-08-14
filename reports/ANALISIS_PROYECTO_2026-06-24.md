# Análisis Técnico Completo — Asistente RRHH IA Plastitec

**Fecha:** 2026-06-24
**Alcance:** Estado actual del repositorio `c:\AIV2`

---

## 1. Resumen ejecutivo

Aplicación full-stack que actúa como asistente conversacional de RRHH para Plastitec (manufactura, Colombia), con interfaz de voz/chat tipo kiosco. La arquitectura es **100% local/on-premise**: React 19 en frontend, Express 5 en backend, Qdrant como vector DB y Ollama como motor de inferencia LLM/embeddings. No depende de APIs externas en producción (NotebookLM y Google Cloud TTS quedaron descartados/legacy).

---

## 2. Stack tecnológico

### Frontend
- React 19.2.0 + Vite 7.3.1 (dev puerto 5180, build a `dist/`, servido en `/AsistenteRRHH/` vía Tomcat)
- Tailwind CSS 4.1.18 (plugin nativo de Vite)
- Framer Motion 12.34.0 (animaciones de `NexusCore`)
- Web Speech API (reconocimiento y síntesis de voz, sin dependencia de Google Cloud)

### Backend
- Node.js (ESM, `"type": "module"`) + Express 5.2.1
- `express-rate-limit` 8.5.1, `cors` 2.8.6
- SQLite (`sqlite`/`sqlite3`) — caché FAQ, actualmente **desactivado** (`CACHE_ENABLED=false`)

### IA / RAG
- **Ollama** (local): LLM principal `llama3.2`, fallback `gemma`; embeddings `mxbai-embed-large` (1024 dimensiones)
- **Qdrant** (puerto 6333): vector DB, colección `plastitec_docs`, distancia coseno, HNSW
- **@xenova/transformers**: Cross-Encoder `bge-reranker-base` para reranking neural (POC, desactivado por defecto: `ENABLE_NEURAL_RERANKER=false`)
- Reranking léxico propio (BM25 + densidad de keywords + boost de frases exactas), sin dependencias externas

### Procesamiento documental
- `pdfjs-dist` + `pdf-parse` + `tesseract.js` (OCR en español) + `canvas`/`jimp`/`pureimage` para extracción híbrida de PDFs (texto digital y/o escaneado)

### Despliegue
- Tomcat 8.0.27 (WAR), Windows Service vía `node-windows`
- Scripts `.cmd`/`.bat`/`.ps1` para build, empaquetado y arranque de servicios

---

## 3. Variables de entorno clave (`.env`)

| Variable | Valor actual | Notas |
|---|---|---|
| `PORT` | 3000 | Backend Express |
| `OLLAMA_URL` / `OLLAMA_MODEL` | `http://localhost:11434` / `llama3.2` | Modelo final tras bake-off (ver §7) |
| `OLLAMA_FALLBACK_MODEL` | `gemma` | Con backoff exponencial |
| `OLLAMA_EMBED_MODEL` / `LOCAL_EMBEDDING_DIMENSION` | `mxbai-embed-large` / 1024 | Antes era `nomic-embed-text` (768d) |
| `QDRANT_URL` / `QDRANT_COLLECTION` | `http://localhost:6333` / `plastitec_docs` | Ver nota operativa crítica en §8 |
| `CACHE_ENABLED` | `false` | Caché SQLite deshabilitado (falsos positivos por similitud Dice) |
| `ENABLE_NEURAL_RERANKER` | `false` | Cross-Encoder en modo POC, no productivo |
| `RATE_LIMIT_*` | 100 req / 15 min | Protección global de API |
| `ADMIN_PIN_HASH` / `ADMIN_PIN_SALT` | — | Auth del panel admin |

---

## 4. Estructura del proyecto

```
c:\AIV2\
├── server.js                  Entry point Express
├── src/                        Frontend React
│   ├── components/             ChatShell, NexusCore, AnalyticsDashboard, SystemStatus, HelpGuide, CompanyLogo, TypewriterText
│   └── utils/                  aiClient, NexusIntentEngine, QuickCache, apiConfig
├── routes/                     chatRoutes, analyticsRoutes, systemRoutes, adminRoutes
├── controllers/                chatController, analyticsController, systemController, adminController
├── services/                   ~24 módulos (motor RAG, ver §5)
├── config/corporateVocabulary.json   Diccionario de acrónimos corporativos
├── prompts/                    systemPrompt.txt, extractionPrompt.js
├── utils/                      state, logger, textProcessor, ocrHelpers, security
├── docs/                       Base de conocimiento (RIT + instructivos I-RH-*)
├── test/                       Benchmarks de latencia, reranking, dataset
├── reports/                    44+ informes de benchmark/QA/auditoría
└── scripts de despliegue       build_prod.cmd, deploy_tomcat.cmd, start_all_services.bat, install_service.js
```

---

## 5. Pipeline RAG (núcleo del sistema)

Orquestado por `services/ragService.js` (v7.1), en 5 etapas:

1. **Query Understanding** (`queryUnderstandingService.js`) — normalización, corrección ortográfica, expansión de acrónimos, detección de dominio.
2. **Vector Search** (`qdrantService.js` v4.0) — top-15 por similitud coseno en Qdrant.
3. **Reranking léxico** (`rerankingService.js`) — BM25 + densidad de keywords + boost de frases/acrónimos → top-6.
4. **Reranking neural opcional** (`neuralRerankingService.js`) — Cross-Encoder, desactivado en prod.
5. **Generación LLM** (`llmService.js`) — `llama3.2` con fallback `gemma`, modos de respuesta `SHORT_ANSWER` / `PROCEDURE` / `DEFINITION` / `LIST`.

Servicios de soporte relevantes:

| Servicio | Función |
|---|---|
| `retrievalConfidence.js` | Scoring de confianza dual (similitud + densidad de keywords) + regla de "referente de dominio" |
| `responseTypeResolver.js` | Determina el modo de respuesta sin LLM (reglas léxicas) |
| `responseBuilderService.js` | Construye respuestas deterministas a partir de hechos extraídos |
| `answerVerifier.js` | Detección de alucinaciones (LLM-as-judge) |
| `citationBuilder.js` | Construye citas; las muestra automáticamente si `confidence < 0.70` |
| `privacy.js` | Clasifica la consulta en 7 categorías (incluye bloqueo de datos confidenciales e inyecciones) |
| `intentRoutingService.js` | Clasificación de intención (corporativa/normativa/procesos) |
| `pdfProcessor.js` / `ingestionService.js` | Ingesta híbrida de PDFs y chunking semántico (800-1200 chars, overlap 150) |
| `acronymResolver.js` / `polarityValidator.js` | Resolución de siglas y validación de polaridad (permitido/prohibido) |

---

## 6. API (Express)

| Método | Ruta | Propósito |
|---|---|---|
| POST | `/api/query` | Consulta principal (dispara el pipeline RAG) |
| POST | `/api/reset` | Reinicia estado de sesión |
| POST/GET | `/api/analytics` | Registro y consulta de métricas de uso |
| GET | `/api/analytics/quality` | Reporte de calidad del RAG |
| GET | `/api/system-errors` | Errores registrados |
| POST | `/api/report-error` | Reporte de error desde el usuario |
| GET | `/api/health`, `/api/system-status` | Estado de Ollama/Qdrant/backend |
| GET | `/api/knowledge-version` | Versión vigente del corpus |
| POST | `/api/verify-pin`, `/api/bump-knowledge-version` | Panel admin (autenticado por PIN) |

---

## 7. Estado del modelo LLM (decisión cerrada)

Tras un bake-off documentado (memoria `ops-qdrant-benchmark`):
- **`llama3.2:3b` confirmado como modelo final** en el hardware actual.
- Alternativas 3B descartadas: `qwen2.5:3b` (mayor varianza, no supera baseline), `phi3` (no viable, 37s).
- Modelos 7-8B **no viables** para kiosco (>30s mediana de latencia: `qwen2.5:7b`=46.3s, `llama3.1:8b`=53.3s). Se necesitaría GPU para subir de tamaño.
- Baseline robusto (3 corridas, post-fixes de retrieval): Accuracy mediana 72.09%, Hallucination 16.00%, FNR 27.91%.
- Próximas palancas son de software, no de modelo: chunking, prompts, umbral de abstención.

---

## 8. Notas operativas críticas

- **Qdrant debe iniciarse con cwd `C:\AIV2`** (no `C:\AIV2\qdrant`). El storage real (332 MB, colección `plastitec_docs`, 1024d, 269 puntos) vive en `C:\AIV2\storage`. `start_qdrant.bat` actualmente apunta al directorio incorrecto y genera una colección vacía con dimensión equivocada (768 vs 1024) si se usa tal cual.
- Caché SQLite (`hr_cache.db`) está completo en código pero desactivado por `CACHE_ENABLED=false` — reversible con un flag.
- Reranking neural (Cross-Encoder) es un POC aislado del pipeline estándar; no afecta producción mientras `ENABLE_NEURAL_RERANKER=false`.

---

## 9. Testing y benchmarking

No hay suite Jest/Vitest; la validación es manual vía scripts en `/test/` y `/tests/`:
- `test_latency_benchmark.js`, `test_cross_encoder_benchmark.js`, `test_enterprise_real_benchmark.js`
- `generate_dataset.js` para datasets de prueba
- Procedimiento estándar: `node scratch/clear_cache.mjs` → `node scratch/run_100_benchmark.cjs <model-tag>` (~30 min) → resultados en `reports/benchmark_raw_results_*.json`
- Heurística "Fast Reject": respuestas <700ms nunca llegaron al LLM (rechazo del motor de confianza); >10s implica pipeline completo + decisión del LLM.

`reports/` contiene 44+ informes (benchmarks de latencia, QA, auditorías de conocimiento, especificación técnica `especificacion_tecnica_2026-06-18.md`).

---

## 10. Seguridad

- Detección de PII y clasificación de privacidad (`services/privacy.js`, 7 categorías incluyendo intentos de inyección/jailbreak).
- Rate limiting global (100 req/15min) y específico para `/verify-pin` (10 intentos/15min).
- CORS con whitelist de orígenes.
- Panel admin protegido por PIN con hash + salt.
- Consultas SQL parametrizadas.

---

## 11. Evolución reciente (vs. snapshot de hace ~12 días)

| Aspecto | Antes | Ahora |
|---|---|---|
| Modelo LLM | `gemma` | `llama3.2` (bake-off cerrado) |
| Embeddings | `nomic-embed-text` (768d) | `mxbai-embed-large` (1024d) |
| Orquestación externa | NotebookLM (MCP) | Pipeline 100% local (Qdrant + Ollama) |
| TTS | Google Cloud TTS | Web Speech API |
| Caché SQLite | activo | desactivado (flag reversible) |
| Reranking | — | Léxico (BM25) + neural opcional (POC) |

---

## 12. Conclusión

El proyecto es una arquitectura RAG local madura y bien instrumentada (logging, benchmarks, reportes de QA), con decisiones de modelo ya validadas empíricamente y documentadas. Los principales riesgos operativos identificados son el script de arranque de Qdrant con directorio incorrecto y la dependencia de un único modelo 3B (techo de hardware actual). Las palancas de mejora pendientes son de software: ajuste de chunking, prompts y umbral de abstención del motor de confianza.
