# Estado Real del Proyecto — Asistente RRHH IA Plastitec
**Fecha:** 2026-06-25  
**Alcance:** Auditoría de solo lectura contra el código actual de `c:\AIV2`  
**Sustituye como base de referencia a:** `ANALISIS_PROYECTO_2026-06-24.md` (conservado como histórico — contiene afirmaciones desactualizadas, corregidas explícitamente en este documento)  
**Propósito:** Base confiable para las fases de testing RRHH y pre-producción

---

## 1. Resumen Ejecutivo

El sistema es una arquitectura RAG 100% local y madura (Qdrant + Ollama + Express + React), con sus capas de seguridad y emergencia ya corregidas y validadas en navegador (lote QA cerrado el 2026-06-19). El "riesgo crítico" que el documento del 2026-06-24 reportaba como abierto — el arranque de Qdrant con directorio equivocado — está resuelto desde el 2026-06-16/17 y además tiene un guard de arranque que aborta ruidosamente si algo similar volviera a ocurrir; el documento viejo simplemente no reflejaba ese estado. Lo que queda genuinamente abierto hoy es de severidad baja: una etiqueta de estado confusa en el dashboard de administración (H-07) y nomenclatura histórica ("Gemma") en dos strings que no coincide con el modelo real en uso (`llama3.2:3b`). No hay deuda de software bloqueante para pasar a testing/pre-producción.

---

## 2. Stack y Arquitectura — Confirmado Contra Código

### Backend / Frontend
| Componente | Confirmado en | Detalle |
|---|---|---|
| Express 5.2.1 + Node ESM | `package.json`, `server.js` | Sin cambios respecto al doc viejo |
| React 19.2.0 + Vite 7.3.1 | `package.json` | Dev :5180, build → `dist/`, servido en `/AsistenteRRHH` |
| Tailwind v4 + Framer Motion | `package.json` | Sin cambios |

### IA / RAG — modelo real vs. nomenclatura en código

| Afirmación | Estado verificado | Evidencia |
|---|---|---|
| LLM principal = `llama3.2:3b` | ✅ Correcto | [llmService.js:82](services/llmService.js#L82) `this.model = process.env.OLLAMA_MODEL \|\| 'llama3.2'` |
| Fallback = `gemma` | ✅ Correcto | [llmService.js:83](services/llmService.js#L83) |
| Embeddings = `mxbai-embed-large`, 1024d | ✅ Correcto | [embeddingsService.js:18-19](services/embeddingsService.js#L18-L19) |
| Qdrant: colección `plastitec_docs`, Cosine, 269 puntos | ✅ Correcto, verificado en vivo hoy | `GET /collections/plastitec_docs` → `status:"green"`, `points_count:269`, `vectors.size:1024` |

**Discrepancia de nomenclatura encontrada (no estaba en el doc viejo):** Dos lugares del código siguen usando el nombre histórico "Gemma" cuando el modelo de generación real es `llama3.2:3b`:
- [controllers/systemController.js:15](controllers/systemController.js#L15) — `GET /api/health` devuelve `engine: "RAG Local (Qdrant + Gemma + Ollama)"`.
- [services/database.js:10,58](services/database.js#L10) — comentario `Campo source para trazabilidad (gemma_rag | demo)` y default de columna `source TEXT DEFAULT 'gemma_rag'`.

Esto es cosmético (no afecta la lógica), pero puede confundir a quien lea logs/analytics asumiendo que el motor activo es Gemma. Ver §4.

### Pipeline RAG (sin cambios respecto al doc viejo, confirmado)
Orquestado por `ragService.js` v7.1: Query Understanding → Vector Search (Qdrant top-15) → Reranking léxico BM25 (top-6) → Reranking neural opcional → Generación LLM (`llmService.js`, modos `SHORT_ANSWER`/`PROCEDURE`/`DEFINITION`/`LIST`) → verificación de respuesta → citas.

---

## 3. Subsistemas en Pausa — Flag y Causa Raíz Real

### Caché SQLite (`CACHE_ENABLED=false`)
- **Flag:** [chatController.js:16](controllers/chatController.js#L16) — controla lectura (`findSimilar`) y escritura (`storeOrUpdate`).
- **Causa raíz real, verificada en código — SIGUE INTACTA:** El matching usa Dice Coefficient con threshold 0.6 ([database.js:20, 195-199](services/database.js#L20)): `if (similarity < 0.6)`. Este es el mecanismo que generaba falsos positivos (preguntas no equivalentes con similitud léxica alta). **No se corrigió** — se apagó el subsistema completo.
- **Prerrequisito antes de reactivar:** Si se pone `CACHE_ENABLED=true` sin antes revisar/ajustar el threshold o el algoritmo de matching, el bug original de falsos positivos vuelve de inmediato. Esto es una decisión diferida con una condición de reapertura clara, no un bug latente inofensivo.

### Reranker neural (`ENABLE_NEURAL_RERANKER=false`)
- **Aislamiento confirmado:** [neuralRerankingService.js:19](services/neuralRerankingService.js#L19) — `const ENABLED = process.env.ENABLE_NEURAL_RERANKER === 'true'` (comparación estricta; cualquier valor que no sea exactamente el string `'true'` resulta en `false`, incluyendo ausencia de la variable).
- **Wiring en pipeline productivo:** [ragService.js:250](services/ragService.js#L250) — el bloque de Cross-Encoder solo se ejecuta si `neuralRerankingService.isEnabled`. No hay rama de código que lo active por defecto ni por error de configuración parcial.
- **Conclusión:** POC genuinamente aislado, sin riesgo de activación accidental.

---

## 4. Lista Limpia de lo Abierto Hoy (con severidad)

| Hallazgo | Severidad | Evidencia | Estado |
|---|---|---|---|
| H-07 — `/api/system-status` muestra SQLite `status:"active"` aunque `CACHE_ENABLED=false` | BAJA | [systemController.js:38,48](controllers/systemController.js#L38) — el check solo valida conectividad, no si el caché se usa funcionalmente | 🔴 Abierto. Un admin viendo el dashboard podría asumir que el caché está activo. |
| Nomenclatura histórica "Gemma" desalineada del modelo real | BAJA (cosmético) | `systemController.js:15`, `database.js:10,58` (ver §2) | 🔴 Abierto. No afecta funcionalidad; sí puede confundir lectura de logs/health checks. |

**No se encontró ningún otro hallazgo nuevo de severidad MEDIA o ALTA** en esta auditoría. Los items que el documento del 2026-06-24 marcaba como riesgos (arranque de Qdrant, modelo único 3B) se reclasifican en §5 y §6.

---

## 5. Corregido: Lo que el Documento Viejo Daba por Pendiente y YA Está Resuelto

| Afirmación del doc viejo (2026-06-24) | Realidad verificada hoy | Evidencia |
|---|---|---|
| §8: *"`start_qdrant.bat` actualmente apunta al directorio incorrecto y genera una colección vacía... si se usa tal cual"* | **FALSO / DESACTUALIZADO.** El `.bat` ya tiene el fix de cwd desde el **2026-06-16**, y además hay un guard de arranque en el backend desde el **2026-06-17** que aborta ruidosamente si la colección no existe o tiene dimensión incorrecta. | [start_qdrant.bat:11-16](start_qdrant.bat#L11-L16) (comentario "FIX 2026-06-16"); [healthService.js:84-126](services/healthService.js#L84-L126) (comentario "Blindaje de software contra el storage fantasma (2026-06-17)"). Verificado en vivo: `status:"green"`, 269 puntos, 1024d. |
| §12 (conclusión): *"Los principales riesgos operativos identificados son el script de arranque de Qdrant con directorio incorrecto..."* | Mismo caso — riesgo cerrado hace más de una semana antes de la fecha del propio documento. | Mismo que arriba. |
| Lote QA (H-01 prompt injection, H-02 emergencias, H-03 P1 bypass de privacidad por emojis, H-05 whitespace, H-10 PIN sin rate limit) — el doc viejo no los menciona como cerrados ni abiertos, dejando la impresión de que el sistema no había pasado por una validación adversarial reciente | **Cerrados y validados en navegador el 2026-06-19**, antes de la fecha del documento viejo (2026-06-24). | `reports/qa_validation_report_2026-06-18.md` §3 (estado final por hallazgo); `reports/qa_fixes_2026-06-18.md`. Código: `INJECTION_PATTERNS` en `chatController.js`, `esEmergenciaActiva` en `NexusIntentEngine.js`, normalización Unicode en `privacy.js`, `pinLimiter` en `adminRoutes.js`. |
| §10: atribuye la detección de inyección/jailbreak a `privacy.js` (dentro de sus "7 categorías") | **Impreciso.** La detección de inyección de prompts es un mecanismo separado: blocklist `INJECTION_PATTERNS` en `chatController.js` + refuerzo de system prompt en `llmService.js`. `privacy.js` solo cubre datos sensibles/PII. | `chatController.js:23-37` (`INJECTION_PATTERNS`); `privacy.js` no contiene lógica de inyección. |

---

## 6. Riesgos Operativos Reales y Decisiones Diferidas Pendientes de Retomar

**Riesgos operativos reales restantes:** ninguno de severidad alta o crítica detectado en esta auditoría. Los dos ítems de §4 (H-07, nomenclatura) son de severidad baja y no bloquean testing ni pre-producción.

**Decisiones diferidas (conscientes, no bugs) — pendientes de retomar cuando el negocio lo decida:**

| Decisión | Estado | Condición de reapertura |
|---|---|---|
| Migración SQLite (`hr_cache.db`) → caché de producción | Diferida. El código de caché está completo pero apagado (`CACHE_ENABLED=false`); no hay plan de migración a otro motor en el código actual. | Si se reactiva, hacerlo junto con la revisión del matching Dice (ver §3) — no antes. |
| H-03 Parte 2 — expansión de `SENSITIVE_KEYWORDS` con `'el salario'`, `'los salarios'` | Diferida desde el 2026-06-18/19, sin cambios desde entonces. | [privacy.js:23-32](services/privacy.js#L23-L32) confirmado sin estos términos. Pendiente de decisión de producto: riesgo de bloquear preguntas legítimas sobre política salarial general del reglamento. |
| Modelo LLM único 3B (`llama3.2:3b`) | No es deuda de software — el modelo y su fallback ya son 100% configurables vía `.env` ([llmService.js:82-83](services/llmService.js#L82-L83)). Cambiar a un modelo más grande es solo `ollama pull` + variable de entorno. | Requiere GPU/VRAM adicional en el hardware del kiosco — techo de hardware, no de código. |
| Ajuste fino de chunking / prompts / umbral de abstención (`retrievalConfidence.js`) | Sin TODOs ni marcadores de trabajo pendiente en el código — son mejoras potenciales documentadas como decisiones de producto ya tomadas (p. ej. "Domain Referent Rule", decisión 2026-06-12), no compromisos abiertos. | A retomar solo si los benchmarks de la fase de testing muestran necesidad concreta. |
| Testing automatizado (sin Jest/Vitest) | Confirmado sin cambios: solo scripts manuales en `tests/`. | Decisión de alcance, no bug — evaluar si la fase de pre-producción exige una suite automatizada. |

---

## 7. Conclusión

El proyecto está en mejor estado del que reflejaba el documento del 2026-06-24: su único "riesgo crítico" listado ya estaba resuelto desde antes de que ese documento se escribiera, y el lote de hallazgos de seguridad/UX del QA adversarial (inyección, emergencias, privacidad, rate limiting) está cerrado y validado en navegador. Lo que queda abierto es cosmético y de baja severidad (H-07, nomenclatura "Gemma"). Las decisiones diferidas (caché, H-03 P2, modelo 3B) están correctamente identificadas como pausas conscientes con condiciones claras de reapertura, no como deuda oculta. El sistema puede avanzar a las fases de testing RRHH y pre-producción sobre esta base.

---

*Documento generado 2026-06-25 mediante auditoría de solo lectura contra el código fuente de `c:\AIV2`. No se aplicó ningún cambio, edición, reinicio de servicio ni reindexación. El documento `ANALISIS_PROYECTO_2026-06-24.md` se conserva sin modificar como referencia histórica.*
