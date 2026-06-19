# Especificación Técnica — Asistente RRHH IA Plastitec
**Versión:** 1.5.0  
**Fecha:** 2026-06-18  
**Clasificación:** Interno — Área de TI / Desarrollo

---

## 1. Descripción General

Sistema de asistente virtual de Recursos Humanos para Plastitec. Responde consultas de empleados sobre el Reglamento Interno de Trabajo, normativas SST, BPM, Código de Ética, SAGRILAFT, y contratos SENA, usando un pipeline RAG (Retrieval-Augmented Generation) completamente local y offline.

**Características principales:**
- Inferencia 100% local (sin dependencias de APIs externas en producción)
- Pipeline RAG: búsqueda vectorial + reranking + LLM generativo
- Filtro de privacidad por categorías (bloquea consultas sobre datos personales/salarios)
- Detección de emergencias físicas con protocolo de derivación inmediata
- Panel de administración con autenticación PIN
- Dashboard de analítica con logs de eventos y calidad de respuesta

---

## 2. Stack Tecnológico

### Backend
| Componente | Tecnología | Versión |
|---|---|---|
| Runtime | Node.js (ESM) | ≥18 |
| Framework | Express | ^5.2.1 |
| Rate Limiting | express-rate-limit | ^8.5.1 |
| CORS | cors | ^2.8.6 |
| Env config | dotenv | ^17.3.1 |
| Caché (inactivo) | SQLite / sqlite3 | ^5.1.1 / ^5.1.7 |

### Inteligencia Artificial (local/offline)
| Componente | Tecnología | Detalle |
|---|---|---|
| LLM | Ollama — llama3.2:3b | Modelo principal de generación |
| LLM fallback | Ollama — gemma | Fallback automático con backoff |
| Embeddings | Ollama — mxbai-embed-large | 1024 dimensiones |
| Vector DB | Qdrant | Colección `plastitec_docs`, distancia Cosine |
| Neural Reranker | Xenova/bge-reranker-base | Desactivado en producción (`ENABLE_NEURAL_RERANKER=false`) |
| Lexical Reranker | BM25 + keyword density + phrase boost | `services/rerankingService.js` |

### Frontend
| Componente | Tecnología | Versión |
|---|---|---|
| UI Framework | React | ^19.2.0 |
| Build tool | Vite | ^7.3.1 |
| CSS Framework | Tailwind CSS v4 | ^4.1.18 |
| Animaciones | Framer Motion | ^12.34.0 |
| Dev server | Vite dev (puerto 5180) | — |
| Prod bundle | `dist/` servido por Express en `/AsistenteRRHH` | — |

### Procesamiento de Documentos (ingestión)
| Componente | Tecnología | Detalle |
|---|---|---|
| PDF extracción | pdfjs-dist | Texto digital directo |
| OCR | Tesseract.js | Para páginas escaneadas |
| Renderizado PDF→imagen | node-canvas | Para OCR visual |

---

## 3. Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENTE (navegador)                      │
│                                                                 │
│  App.jsx → ChatShell.jsx → NexusCore.jsx                        │
│                    │                                            │
│             aiClient.js                                         │
│           ┌─────────────┐                                       │
│           │ IntentEngine │ ← NexusIntentEngine.js (Rule-Based)  │
│           └─────────────┘                                       │
│             │        │                                          │
│           Intent   fetch → /api/query (solo si no es trivial)   │
│           local                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │ HTTP/JSON
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        BACKEND (Express :3000)                  │
│                                                                 │
│  server.js                                                      │
│    ├── Rate Limiter global (100 req/15min)                       │
│    ├── CORS (lista de orígenes permitidos)                       │
│    └── Rutas /api/*                                             │
│                                                                 │
│  chatRoutes.js → chatController.js                              │
│    ├── 1. PrivacyService.classify()    ← privacy.js             │
│    ├── 2. Validación longitud (≤200)                            │
│    ├── 3. INJECTION_PATTERNS blocklist                          │
│    └── 4. ragService.processQuery()   ← pipeline RAG            │
│                                                                 │
│  adminRoutes.js → adminController.js                            │
│    ├── pinLimiter (10 intentos/15min)                           │
│    └── POST /verify-pin (bcrypt hash en .env)                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        PIPELINE RAG                             │
│                                                                 │
│  ragService.js (v7.1)                                           │
│    │                                                            │
│    ├── queryUnderstandingService   (análisis de intención)      │
│    ├── acronymResolver             (COPASST, SG-SST, BPM...)    │
│    ├── embeddingsService           (mxbai-embed-large, 1024d)   │
│    │     └── Ollama :11434/api/embeddings                       │
│    ├── qdrantService               (búsqueda vectorial)         │
│    │     └── Qdrant :6333  colección plastitec_docs             │
│    │         Top-15 resultados → filtrado por score mínimo      │
│    ├── rerankingService            (BM25 + keyword + phrase)    │
│    │     └── → Top-6 chunks al LLM                             │
│    ├── intentRoutingService        (elige RESPONSE_MODE)        │
│    ├── llmService                  (llama3.2:3b vía Ollama)     │
│    │     ├── Prompt Tri-Estado XML (FULL/PARTIAL/NO_INFO)       │
│    │     ├── Retry con backoff exponencial                      │
│    │     ├── Self-Check: detecta negaciones falsas              │
│    │     └── B2: strip de notas fabricadas                      │
│    ├── answerVerifier              (valida coherencia)          │
│    ├── citationBuilder             (construye bloque de fuentes)│
│    └── retrievalConfidence        (calcula score final)         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Flujo de una consulta típica

1. Usuario escribe en el chat → `aiClient.js` invoca `NexusIntentEngine.analyze()`
2. Si es saludo/despedida/identidad/agradecimiento → respuesta local inmediata (<5ms), sin red
3. Si es emergencia activa (primera persona + lesión) → protocolo de emergencia local, sin red
4. Si es consulta de dominio → `fetch POST /api/query`
5. Backend: privacidad → longitud → inyección → RAG
6. RAG: embed consulta → búsqueda Qdrant → reranking → LLM → B2 → citas → respuesta

---

## 4. Estructura de Carpetas

```
c:\AIV2\
├── server.js                    # Punto de entrada backend
├── package.json
├── .env                         # Configuración (no commitear)
├── .env.example                 # Plantilla de configuración
├── knowledge_version.json       # Versión del corpus ingestado
│
├── controllers/
│   ├── chatController.js        # Lógica principal de consulta RAG
│   ├── adminController.js       # Autenticación PIN, bump versión
│   ├── analyticsController.js   # Logs de eventos y calidad
│   └── systemController.js      # Health, system-status, versión
│
├── routes/
│   ├── chatRoutes.js            # POST /api/query, POST /api/reset
│   ├── adminRoutes.js           # POST /api/verify-pin, /bump-knowledge-version
│   ├── analyticsRoutes.js       # GET/POST /api/analytics, /quality, /system-errors
│   └── systemRoutes.js          # GET /api/health, /system-status, /knowledge-version
│
├── services/
│   ├── ragService.js            # Orquestador del pipeline RAG (v7.1)
│   ├── llmService.js            # Inferencia Ollama + modos de respuesta
│   ├── embeddingsService.js     # Embeddings mxbai-embed-large (1024d)
│   ├── qdrantService.js         # Cliente Qdrant (búsqueda vectorial)
│   ├── rerankingService.js      # Reranking BM25 + lexical
│   ├── neuralRerankingService.js# Cross-Encoder (desactivado en prod)
│   ├── privacy.js               # Clasificación privacidad/confidencialidad
│   ├── database.js              # SQLite (caché, actualmente desactivado)
│   ├── intentRoutingService.js  # Selección de RESPONSE_MODE por tipo de query
│   ├── queryUnderstandingService.js # Análisis semántico de la consulta
│   ├── acronymResolver.js       # Resolución de siglas RRHH (COPASST, SG-SST...)
│   ├── retrievalConfidence.js   # Score de confianza del retrieval
│   ├── answerVerifier.js        # Verificación de coherencia de respuesta
│   ├── citationBuilder.js       # Construcción del bloque de fuentes
│   ├── responseTypeResolver.js  # Determina tipo de respuesta (lista, definición...)
│   ├── responseBuilderService.js# Construcción final de la respuesta
│   ├── polarityValidator.js     # Detecta negaciones falsas
│   ├── ragLogger.js             # Logging estructurado del pipeline
│   ├── pdfProcessor.js          # Extracción PDF + OCR híbrido
│   ├── ingestionService.js      # Ingesta de documentos al vector DB
│   ├── knowledgeExtractionService.js # Extracción de conocimiento estructurado
│   ├── healthService.js         # Pre-flight checks al arranque
│   ├── startupCheck.js          # Validaciones de inicio
│   └── rebuild_rag.js           # Script de reingestión completa
│
├── prompts/
│   └── extractionPrompt.js      # Prompt Tri-Estado XML (FULL/PARTIAL/NO_INFO)
│
├── utils/
│   ├── logger.js                # logAnalyticsEvent, logErrorEvent
│   ├── textProcessor.js         # cleanResponse, polarityAwareClean
│   ├── state.js                 # Estado global del servidor (SERVER_READY)
│   └── ocrHelpers.js            # Helpers de limpieza OCR
│
├── src/                         # Frontend React
│   ├── main.jsx
│   ├── App.jsx
│   ├── aiClient.js              # Cliente HTTP + integración IntentEngine
│   ├── utils/
│   │   └── NexusIntentEngine.js # Motor de intención local (Rule-Based NLU)
│   └── components/
│       ├── ChatShell.jsx        # Shell del chat (input, mensajes, estado)
│       ├── NexusCore.jsx        # Componente principal de UI
│       ├── AnalyticsDashboard.jsx # Dashboard de analítica
│       ├── SystemStatus.jsx     # Estado de servicios
│       ├── HelpGuide.jsx        # Guía de uso
│       ├── TypewriterText.jsx   # Animación de texto
│       └── CompanyLogo.jsx      # Logo Plastitec
│
├── knowledge/                   # Corpus documental en formato Markdown (para RAG)
│   ├── RIT_RAG.md               # Reglamento Interno de Trabajo
│   ├── SST_RAG.md               # Sistema de Gestión SST / Inducción
│   ├── BPM_RAG.md               # Buenas Prácticas de Manufactura
│   ├── ETICA_RAG.md             # Código de Ética
│   ├── SAGRILAFT_RAG.md         # SAGRILAFT (prevención lavado de activos)
│   └── SENA_RAG.md              # Contratos de aprendizaje SENA
│
├── qdrant/                      # Datos persistentes de Qdrant (storage local)
│   └── storage/                 # Segmentos de la colección plastitec_docs
│
├── logs/                        # Logs de eventos y errores
├── reports/                     # Reportes QA y documentación técnica
├── scripts/                     # Scripts utilitarios
├── archive/                     # Componentes archivados (VoiceChat.jsx)
├── snapshots/                   # Snapshots de estado del sistema
└── dist/                        # Frontend compilado (generado por vite build)
```

---

## 5. Endpoints de la API

**Base URL:** `http://localhost:3000/api`  
**Rate limit global:** 100 req / 15 min por IP

### Chat

| Método | Ruta | Descripción | Auth |
|---|---|---|---|
| `POST` | `/query` | Consulta al pipeline RAG | — |
| `POST` | `/reset` | Reset de sesión | — |

**POST /query — Request:**
```json
{
  "query": "¿Cuántos días de licencia por luto?",
  "conversationId": "uuid-opcional",
  "bypass_cache": false
}
```

**POST /query — Response (éxito):**
```json
{
  "response": "El trabajador tendrá derecho a cinco (5) días hábiles...\n\n---\n📎 Fuentes: RIT Art. 55",
  "outOfScope": false,
  "category": "reglamento",
  "confidence": 0.87,
  "sources": ["..."],
  "chunksUsed": 4,
  "conversationId": "uuid"
}
```

**POST /query — Response (privacidad):**
```json
{
  "response": "No puedo proporcionar información confidencial...",
  "outOfScope": true,
  "securityBlocked": true
}
```

**POST /query — Response (inyección):**
```json
{
  "response": "Solo puedo responder consultas sobre los documentos de RRHH de Plastitec.",
  "outOfScope": true,
  "rejected": true,
  "reason": "injection_detected"
}
```

### Sistema

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/health` | Estado del servicio (liveness probe) |
| `GET` | `/system-status` | Estado detallado de todos los servicios |
| `GET` | `/knowledge-version` | Versión del corpus ingestado |

> **Nota sobre `/health`:** El campo `engine` devuelve `"RAG Local (Qdrant + Gemma + Ollama)"`. El string `"Gemma"` es histórico (`systemController.js:15`); el modelo de generación en uso es `llama3.2:3b`. Gemma actúa únicamente como fallback automático.

### Administración

| Método | Ruta | Descripción | Auth |
|---|---|---|---|
| `POST` | `/verify-pin` | Verifica PIN de administrador | Rate: 10/15min |
| `POST` | `/bump-knowledge-version` | Incrementa versión del corpus | PIN previo |

### Analítica

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/analytics` | Registrar evento de analítica |
| `GET` | `/analytics` | Obtener eventos (últimos 100) |
| `GET` | `/analytics/quality` | Reporte de calidad de respuestas |
| `GET` | `/system-errors` | Errores del sistema |
| `POST` | `/system-errors/resolve` | Marcar error como resuelto |
| `POST` | `/report-error` | Reportar error desde frontend |

---

## 6. Variables de Entorno

Archivo: `.env` (no incluir en control de versiones)

```env
# ── Servidor ─────────────────────────────────────────────────────
PORT=3000
NODE_ENV=development
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000,http://localhost:5180,<IP_RED>:5180

# ── Qdrant ───────────────────────────────────────────────────────
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION=plastitec_docs

# ── Ollama ───────────────────────────────────────────────────────
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2          # Modelo principal de generación
OLLAMA_FALLBACK_MODEL=gemma    # Fallback automático
OLLAMA_EMBED_MODEL=mxbai-embed-large
LOCAL_EMBEDDING_DIMENSION=1024

# ── Comportamiento ───────────────────────────────────────────────
CACHE_ENABLED=false            # true = SQLite activo; false = siempre va al RAG
MAX_QUERY_LENGTH=200           # Máximo de caracteres por consulta (backend + frontend)

# ── Rate Limiting ────────────────────────────────────────────────
RATE_LIMIT_WINDOW_MS=900000    # 15 minutos
RATE_LIMIT_MAX_REQUESTS=100

# ── Neural Reranker (POC — desactivado en producción) ─────────────
ENABLE_NEURAL_RERANKER=false
NEURAL_RERANKER_MODEL=Xenova/bge-reranker-base
NEURAL_TOP_INPUT=6
NEURAL_TOP_OUTPUT=4

# ── Seguridad (solo en .env — NUNCA en código ni logs) ───────────
ADMIN_PIN_HASH=<SHA-256 hex del PIN + salt>
ADMIN_PIN_SALT=<string aleatorio usado como sal>
```

> **Nota:** El PIN de administrador se almacena como SHA-256 hash (`sha256(PIN + ADMIN_PIN_SALT)`, digest hex) en `.env`. El valor en texto plano nunca se registra en logs, código fuente, ni archivos temporales. Ver implementación en `utils/security.js`.

---

## 7. Corpus Documental

El corpus está ingestado en Qdrant como 269 vectores de 1024 dimensiones. Los documentos fuente se mantienen en `knowledge/` como Markdown estructurado.

| Documento | Archivo | Contenido |
|---|---|---|
| Reglamento Interno de Trabajo | `RIT_RAG.md` | Jornadas, sanciones, vacaciones, licencias, contratación, terminación |
| Inducción y Sistema SST | `SST_RAG.md` | Protocolo de accidentes, emergencias, EPP, brigadas, COPASST |
| Buenas Prácticas de Manufactura | `BPM_RAG.md` | Higiene personal, visitas, uniformes, áreas controladas |
| Código de Ética | `ETICA_RAG.md` | Conducta esperada, conflicto de interés, confidencialidad |
| SAGRILAFT | `SAGRILAFT_RAG.md` | Prevención de lavado de activos y financiación del terrorismo |
| Contratos SENA | `SENA_RAG.md` | Condiciones de contratos de aprendizaje |

**Colección Qdrant:**
- Nombre: `plastitec_docs`
- Dimensión: 1024
- Distancia: Cosine
- Puntos: 269
- Modelo de embedding: `mxbai-embed-large` vía Ollama

**Reingestión del corpus:**
```bash
# Desde c:\AIV2 con Qdrant y Ollama corriendo
node services/rebuild_rag.js
```
Después de reingestar, ejecutar `POST /api/bump-knowledge-version` para invalidar caché SQLite (si está activo).

---

## 8. NexusIntentEngine — Motor de Intención Local

Archivo: `src/utils/NexusIntentEngine.js`

Clasificador Rule-Based NLU que intercepta mensajes triviales en el frontend antes de contactar el backend. Objetivo: respuesta <5ms sin uso de red.

| Tipo | Criterio | Acción |
|---|---|---|
| `greeting` | Expresión aislada: hola, buenos días, buenas tardes... | Respuesta de bienvenida local |
| `identity` | "quién eres", "cómo te llamas", "preséntate" | Identificación del asistente |
| `capabilities` | "qué puedes hacer", "ayuda", "menú", "opciones" | Lista de capacidades |
| `gratitude` | Expresión aislada: gracias, muy amable... | Agradecimiento |
| `goodbye` | "adiós", "chao", "hasta luego", "bye" | Despedida |
| `emergency` | Primera persona + lesión activa (`me corté/quemé/caí`, `sangra`, `no puedo respirar`, `fuego`, `incendio`...) | Protocolo de emergencia inmediato |
| `unknown` | Todo lo demás | Delega al backend RAG |

**Regla de precedencia de emergencia:** La señal de lesión activa (`esEmergenciaActiva`) tiene precedencia absoluta sobre cualquier otra señal. "Me corté, ¿con quién me comunico?" → emergencia (no RAG). Las consultas de procedimiento sin señal de lesión ("¿Cómo reporto un accidente laboral?") caen al RAG por fallback natural.

---

## 9. Capas de Seguridad

| Capa | Ubicación | Qué protege |
|---|---|---|
| Filtro de privacidad | `services/privacy.js` → `chatController.js` | Keywords de salario/datos personales → bloqueo antes del RAG |
| Validación de longitud | `chatController.js` | Consultas > 200 chars → rechazo 400 |
| Blocklist de inyección | `chatController.js` (`INJECTION_PATTERNS`) | 13 patrones de manipulación de instrucciones → rechazo pre-LLM |
| Refuerzo system prompt | `services/llmService.js` | Instrucción en el prompt XML para ignorar texto de inyección que llegue al LLM |
| Normalización Unicode | `services/privacy.js` | Strip de emojis antes de keyword check (evita bypass por decoración) |
| Rate limit global | `server.js` | 100 req/15min por IP en toda la API |
| Rate limit PIN | `routes/adminRoutes.js` | 10 intentos/15min en `/verify-pin`, skipSuccessfulRequests |
| PIN como SHA-256 hash | `.env` + `utils/security.js` | Nunca en texto plano en código ni logs; `sha256(PIN+salt)` |
| B2 anti-nota-fabricada | `controllers/chatController.js` | Elimina notas fabricadas "No encontré información sobre X" en respuestas con contenido real |
| CORS por lista blanca | `server.js` | Solo orígenes en `ALLOWED_ORIGINS` pueden llamar a la API |

---

## 10. Arranque y Operación

### Prerrequisitos
- Node.js ≥18
- Qdrant corriendo en `http://localhost:6333` — **iniciar desde `c:\AIV2`** (no desde `c:\AIV2\qdrant\`)
- Ollama corriendo en `http://localhost:11434` con modelos `llama3.2:3b` y `mxbai-embed-large` descargados

### Comandos

```bash
# Backend (API)
cd c:\AIV2
node server.js

# Frontend (desarrollo)
cd c:\AIV2
npm run dev          # Vite dev server → http://localhost:5180

# Frontend (producción — compilar + servir desde Express)
npm run build        # genera dist/
node server.js       # sirve dist/ en /AsistenteRRHH
```

### Secuencia de arranque del backend
1. Pre-flight check: Ollama disponible, modelos cargados, Qdrant con colección `plastitec_docs` de 1024d
2. SQLite init (siempre, aunque caché esté desactivado — para logs y analytics)
3. Warm-up LLM (carga en VRAM antes de la primera consulta)
4. Warm-up Cross-Encoder (solo si `ENABLE_NEURAL_RERANKER=true`)
5. Express listen en PORT
6. Keep-alive LLM cada 4 minutos (mantiene modelo en VRAM entre consultas)

### Logs relevantes al arranque
```
✅ Colección "plastitec_docs" OK: 1024d, 269 puntos.
✅ SQLite Cache Database inicializada.
[Cache] Caché DESHABILITADO (CACHE_ENABLED=false) — todas las consultas van al RAG
🔥 [AI] Preparando motor de inferencia (Warm-up)...
🚀 Asistente RRHH IA Backend corriendo en puerto 3000
[READY] Servidor totalmente operativo.
```

---

## 11. Notas de Mantenimiento

### Caché SQLite (`CACHE_ENABLED`)
La caché SQLite está **desactivada** (`CACHE_ENABLED=false`). La tabla y el código existen pero no se leen ni escriben. Motivo: la similitud Dice generaba falsos positivos (matcheaba preguntas no equivalentes). Para reactivar: `CACHE_ENABLED=true` en `.env` + reiniciar backend.

### Neural Reranker (`ENABLE_NEURAL_RERANKER`)
El Cross-Encoder `bge-reranker-base` está **desactivado** en producción. Solo para benchmarks. Activar con `ENABLE_NEURAL_RERANKER=true` — requiere ~1GB adicional de RAM/VRAM en el warm-up.

### Actualizar el corpus
1. Editar los archivos en `knowledge/*.md`
2. Ejecutar `node services/rebuild_rag.js` (reingestión completa a Qdrant)
3. Llamar `POST /api/bump-knowledge-version` con PIN de admin para invalidar caché

### Agregar keywords de privacidad
Editar `SENSITIVE_KEYWORDS` en `services/privacy.js`. Evaluar impacto en preguntas legítimas sobre política salarial general antes de agregar términos amplios como `'el salario'` o `'los salarios'`.

### Cambiar el PIN de administrador
1. Generar nuevo hash SHA-256 (usar el salt existente de `.env`):
   ```bash
   node -e "const c=require('crypto'); const salt='<ADMIN_PIN_SALT del .env>'; console.log(c.createHash('sha256').update('NUEVO_PIN'+salt).digest('hex'));"
   ```
2. Actualizar `ADMIN_PIN_HASH` con el hex resultante en `.env`
3. El valor del PIN nunca se registra en logs, código, ni archivos temporales

### Frontend en producción
El frontend compilado (`dist/`) se sirve desde Express en `/AsistenteRRHH`. El acceso en red local es `http://<IP>:<PORT>/AsistenteRRHH`. Para desarrollo local: `npm run dev` → `http://localhost:5180`.

---

*Documento generado 2026-06-18 · Área de TI / Desarrollo · Plastitec*
