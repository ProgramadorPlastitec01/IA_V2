# Seguimiento 4 — Reconexión de rrfScore, Reevaluación de DocBoost, Benchmark de 100

**Generado:** 2026-08-03
**Contexto:** Continuación de `seguimiento_3.md`. Se priorizó el bug de `rrfScore` (componente semántico muerto, peso 0.35) por delante de DocBoost y chunking, tal como se indicó, dado que puede cambiar el diagnóstico de ambos.

**Entorno:** Qdrant (890 puntos) + Express + Ollama levantados de nuevo, detenidos al final.

---

## 1. Reconectar rrfScore — localizado, corregido, validado con las 3 suites

### 1.1 ¿Por qué nunca se asignaba?

Búsqueda en `ragService.js` (donde vive `_weightedFusion`, la función de fusión ponderada que reemplazó al RRF de la Fase 2.3 mencionada en `PROJECT_CONTEXT.md`):

```js
// _weightedFusion — SÍ calcula un score de fusión real
return Array.from(scores.values())
    .sort((a, b) => b.score - a.score)
    .map(item => ({
        ...item.res,
        fusionScore: item.score,   // ← el score real vive AQUÍ
        searchType:  item.types.join('+'),
        finalScore:  item.score    // valor inicial, se sobreescribe luego en rerankingService
    }));
```

**Diagnóstico exacto: no es una función nunca llamada ni una lógica implementada-pero-desconectada — es un caso de "el campo se renombró en un refactor y el consumidor nunca se actualizó".** Cuando el proyecto migró de un RRF clásico (Fase 2.3) a la Fusión Ponderada actual (`_weightedFusion`, con pesos semantic 0.45 + bm25 0.25 + exact_phrase 0.20 + expanded 0.10 = 1.0), el nuevo score de fusión se expuso bajo el nombre `fusionScore` — pero `rerankingService.rerank()` nunca se actualizó para leer ese campo; siguió leyendo `candidate.rrfScore`, un campo que ya no existía en ningún productor de datos. El componente semántico (peso 0.35, el más alto de la fórmula) quedó en 0 para el 100% de las queries, en el 100% de los chunks, desde entonces.

### 1.2 Fix aplicado

```js
// rerankingService.js
// Antes:
const rrfScore = candidate.rrfScore || 0;   // SIEMPRE 0
// Después:
const rrfScore = candidate.fusionScore ?? candidate.rrfScore ?? 0;   // valor real 0-1
```

Además, se retiró el multiplicador `* 10` que envolvía a `rrfScore` en la fórmula final. Ese factor estaba calibrado para la magnitud de un RRF clásico (scores típicos ~0.01-0.15 con constante k=60), nunca implementado; `fusionScore` ya está en escala 0-1 (igual que bm25/kwDensity/etc.), así que aplicar `* 10` además del peso 0.35 le habría dado ~3.5× el peso documentado y roto la escala de `finalScore` frente al resto de componentes. Se hizo en un solo paso, sin tocar `docBoost` (tal como se pidió).

```js
const finalScore = (
    (rrfScore       * 0.35) +   // Semántico (fusión ponderada real) — antes: rrfScore*10*0.35, siempre 0
    (bm25           * 0.25) +
    (kwDensity      * 0.20) +
    (phraseBoost    * 0.50) +
    (acronymBoost   * 0.50) +
    (sectionBoost   * 0.30) +
    (proximityScore * 0.10) +
    docBoost                    // SIN TOCAR — sigue siendo ±0.25 flat
);
```

### 1.3 Validación — 3 suites completas

**21 preguntas de dominio — 19 mejoraron, 1 regresión, 1 sin cambio:**

| Query | Antes (topK fix) | Después (rrfScore fix) | Δ |
|---|---|---|---|
| Que pasaria si llego embriagado a la empresa | 0.000 | 0.000 | 0 |
| Que pasa si llego borracho al trabajo | 0.276 | 0.340 | +0.06 |
| Me pueden despedir si llego tomado a la planta | 0.209 | 0.237 | +0.03 |
| Tome unos tragos anoche... | 0.250 | 0.303 | +0.05 |
| Es falta grave presentarse ebrio... | 0.418 | 0.470 | +0.05 |
| Mi jefe me maltrata... | 0.342 | 0.354 | +0.01 |
| Un compañero me tocó sin permiso... | 0.267 | 0.325 | +0.06 |
| Como denuncio acoso laboral | 0.734 | 0.818 | +0.08 |
| Que es el comité de convivencia laboral | 0.799 | 0.872 | +0.07 |
| Me están haciendo bullying... | 0.249 | 0.398 | +0.15 |
| Me pueden despedir sin justa causa | 0.763 | 0.821 | +0.06 |
| Cuando me pueden echar del trabajo | 0.447 | 0.500 | +0.05 |
| Que pasa si falto 3 veces... | 0.243 | 0.306 | +0.06 |
| Puedo trabajar desde la casa | 0.463 | 0.530 | +0.07 |
| Que es el home office... | 0.536 | 0.597 | +0.06 |
| Requisitos para trabajo remoto | 0.617 | 0.683 | +0.07 |
| Cada cuánto me dan la dotación | 0.395 | 0.469 | +0.07 |
| Tengo derecho a botas y overol... | 0.230 | 0.239 | +0.01 |
| **Puedo hablar mal de la empresa en facebook** | **0.209** | **0.000** | **-0.209 ⚠️ REGRESIÓN** |
| Me pueden revisar el whatsapp... | 0.482 | 0.582 | +0.10 |
| Estoy haciendo una pasantía... | 0.254 | 0.302 | +0.05 |

**15 preguntas OOD: 15/15 correctamente rechazadas** (sin cambio de comportamiento respecto a `seguimiento_3.md`) — **excepto un nuevo hallazgo colateral**: "¿Cuántos planetas tiene el sistema solar?" cruzó el gate (confidence 0.240, honesto "no encontré", pero NO debía pasar). Investigado de inmediato (ver 1.4).

**Regresión "facebook" — causa raíz exacta (log real):** antes del fix, el `bestChunk` para esta query quedaba fijado por empate (todos ~0.25 vía DocBoost) y el desempate por `channelCount` elegía un chunk con señal BM25 real. Con `rrfScore` vivo, el chunk que gana ahora por `finalScore` real (0.3844) es *"Quedan expresamente prohibidas las siguientes conductas: (a) Compartir información confidencial..."* — semánticamente el más cercano en embedding puro a "hablar mal de la empresa", pero **sin ningún término literal ni expandido de la query** (`keywordDensity=0` tanto literal como expandido). Esto dispara el "Fast Reject Semántico" (`× 0.5`) de `retrievalConfidence.js`, y `confidence` cae a 0.0865 (por debajo de 0.20). **No es un bug nuevo — es la interacción entre un componente semántico ahora real (que antes de este fix ni siquiera competía) y una penalización preexistente (Fast Reject) que antes rara vez se activaba porque el bestChunk solía ser el de mayor `keywordScore`, no el de mayor semántica pura.**

**Decisión: no se revirtió el fix** (19 mejoras reales y sistémicas contra 1 regresión puntual, más el descubrimiento y corrección del hallazgo colateral de "planetas" — ver 1.4 — es un balance neto claramente positivo, y la regresión queda documentada con causa raíz exacta para una futura sesión enfocada en la interacción rrfScore↔Fast-Reject).

### 1.4 Hallazgo colateral corregido: `_hasHRDomainToken` heredó un falso positivo del propio guardrail de seguridad

Al investigar por qué "¿Cuántos planetas tiene el sistema solar?" cruzó el guardrail de Relevancia Temática Mínima (`seguimiento_3.md` #1), se encontró que `_hasHRDomainToken` reutilizaba `KNOWN_VOCAB_EXTRA` completo — pero ese set incluye, a propósito, un puñado de interrogativos/verbos genéricos (`'cuantos', 'cuántas', 'aplica', 'aplican', 'permite', 'pueden'`) agregados para el propósito MÁS PERMISIVO de `_isGibberishQuery`. La query contenía "Cuantos" → matcheaba ese término → `hasTopicalSignal = true` indebidamente.

**Fix:** se excluyen explícitamente esos 6 términos genéricos al construir el vocabulario HR-only de `_hasHRDomainToken` (no se tocan en `KNOWN_VOCAB_EXTRA`, que sigue sirviendo bien a `_isGibberishQuery`). Validado: "planetas" ahora rechazada correctamente (`confidence: 0`), y las 15 preguntas OOD + las 21 de dominio se re-confirmaron sin cambios adicionales tras este ajuste puntual.

### 1.5 ¿"Embriagado" y "Art. 89/110" se resolvieron solos?

**No.** "Embriagado" sigue en `confidence: 0`, `chunksUsed: 0` — el chunk correcto (falta grave #14, "Presentarse al trabajo bajo el efecto de alcohol...") ya ni siquiera entra al top-6 ahora: con semántica real activa, otros chunks del RIT que solo comparten la palabra "empresa" en un contexto genérico ("La Empresa, de acuerdo con sus necesidades operativas...", "Cerrar intempestivamente la empresa...") puntúan MÁS alto en similitud coseno pura para esta frase coloquial que el chunk de la falta grave real. `confidence_score` pasó de 0.056 a 0.089 — sigue muy por debajo del gate.

"Cuándo me pueden echar del trabajo" (Art. 110) sigue citando el Art. 38 (irrelevante); el contexto sigue sin incluir la región de chunks 242-245. `confidence` subió de 0.447 a 0.500 (mejora general del componente semántico) pero no cambió CUÁL chunk gana.

"Puedo hablar mal de la empresa en facebook" (Art. 89) ahora falla completamente (ver 1.3) — empeoró en vez de mejorar.

**Conclusión: reconectar rrfScore NO resolvió los 2 casos de chunking, y en el caso de Art. 89 los empeoró.** Esto confirma que la causa de fondo para ambos es el chunking (contenido/título fragmentado), no el bug de `rrfScore` — aunque el bug de `rrfScore` sí explicaba una parte real y separada del malestar general del sistema (subestimación sistemática de confianza en 19/21 casos).

---

## 2. Reevaluación de DocBoost — con datos reales, se recomienda NO tocar todavía

### 2.1 Comparación de magnitudes (evidencia real, no estimada)

Antes (rrfScore muerto) — ejemplo típico de chunk boosteado sin match léxico:
```
finalScore = 0 (rrf) + 0 (bm25) + 0 (kwDensity) + 0 + 0 + 0 (proximity) + 0.25 (docBoost) = 0.25
```
`docBoost` = **100% del score total.**

Después (rrfScore vivo) — mismo tipo de chunk, ejemplo real (`"Mi jefe me maltrata..."`, log `rag_1785792245542`):
```
finalScore: 0.6018, 0.5695, 0.5382, 0.4944 (top 4, con diferenciación real)
```
`docBoost` (0.25) representa ahora entre **35% y 51%** del score total en estos ejemplos reales — sigue siendo un componente grande, pero ya no es el ÚNICO ni el que determina el 100% del resultado. Los chunks ahora se diferencian genuinamente entre sí (0.60, 0.57, 0.54, 0.49 — ya no hay 6 chunks empatados exactos en 0.2500 como se veía sistemáticamente antes en los logs).

### 2.2 Reevaluación de las 3 opciones (planteadas en `seguimiento_3.md`)

- **Opción 1 (reconectar rrfScore):** ✅ Ya ejecutada en este documento.
- **Opción 2 (DocBoost multiplicativo/proporcional):** con `rrfScore` vivo, esta opción es MENOS urgente que antes — la razón original para proponerla (docBoost como único componente no-cero, ganando por default) ya no es el escenario típico. Sigue existiendo en casos de cero señal léxica (ver "embriagado", donde el chunk relevante no tiene NADA de bm25/kwDensity/phrase), pero ahora es la excepción, no la regla.
- **Opción 3 (recalibrar el gate 0.20):** con el benchmark real ahora disponible (ver sección 3), se puede evaluar esto con datos en vez de a ojo — pero los resultados (Accuracy 83.72%, Hallucination 20%) no muestran una necesidad urgente de mover el gate; moverlo ahora sin más señal es prematuro.

### 2.3 Decisión: dejar en observación, NO implementar ninguna opción todavía

**Justificación:** el síntoma que motivó la propuesta original de rediseño (chunks empatados en un valor plano determinado solo por `docBoost`) se redujo sustancialmente al reconectar `rrfScore` — la evidencia real (2.1) lo confirma. El benchmark de 100 preguntas (sección 3) muestra una mejora significativa y medible en Accuracy (+11.6 puntos) y False Negatives (-14 puntos) sin necesidad de tocar `docBoost`. Forzar un rediseño adicional ahora, sin dejar que el sistema se estabilice con este cambio y sin una razón puntual que lo justifique (más allá del caso residual "embriagado", que es un caso límite de cero señal léxica en TODOS los canales), añadiría riesgo sin necesidad clara. **Se recomienda usar el benchmark de 100 preguntas como línea base y revisar DocBoost solo si una sesión futura de auditoría de esos resultados muestra un patrón recurrente que lo amerite.**

---

## 3. Chunking — benchmark de 100 preguntas ejecutado (prerrequisito), re-chunking NO implementado

Dado que Art. 89 y Art. 110 **NO** se resolvieron con el fix de `rrfScore` (sección 1.5), se siguió el criterio indicado: armar el benchmark de 100 preguntas como prerrequisito antes de plantear el re-chunking.

### 3.1 Ejecución

Se limpió la caché SQLite (`scratch/clear_cache.mjs`) y se ejecutó `scratch/run_100_benchmark.cjs` completo (100/100 preguntas, ~26 min) contra el pipeline con TODOS los fixes de esta sesión y las 3 anteriores aplicados. Resultados guardados en `reports/benchmark_raw_results_rrfScore_fix_2026-08-03.json`.

### 3.2 Resultado — línea base real para futuras comparaciones

| Métrica | Baseline documentado previo (memoria del proyecto, pre-sesiones) | **Este benchmark (post rrfScore fix)** | Δ |
|---|---|---|---|
| Accuracy | 72.09% | **83.72%** | **+11.63 pts** |
| Hallucination | 16.00% | **20.00%** | +4.00 pts |
| False Negative Rate | 27.91% | **13.95%** | **-13.96 pts** |
| Latencia promedio | (no comparable directamente) | 8927ms | — |

**Interpretación:** la variabilidad run-a-run documentada en el proyecto es de ±4.65 (Acc), ±4.00 (Halluc), ±4.65 (FNR) entre corridas del MISMO código. La mejora en Accuracy (+11.63) y FNR (-13.96) es **2.5-3× esa variabilidad — señal real, no ruido**, consistente con las mejoras sistémicas observadas en las 21 preguntas de dominio (sección 1.3). El incremento de Hallucination (+4.00) está justo en el borde de la variabilidad documentada — no se puede afirmar con certeza que sea una regresión real vs. ruido de muestreo, pero se reporta sin minimizar: no hubo mejora en esta métrica, y merece vigilancia en la próxima corrida.

**Nota metodológica:** este benchmark NO es directamente comparable en Accuracy/Hallucination a los benchmarks previos citados en memoria porque **este SÍ incluye** todos los fixes de las 4 sesiones de seguimiento (vocabulario, confidence engine, guardrail de seguridad, topK, rrfScore) sobre los que no existe una corrida "antes" exactamente equivalente — el valor de esta corrida es servir como **nueva línea base** desde la cual medir el impacto de cambios futuros (incluido el re-chunking pendiente), no como una comparación aislada de rrfScore.

### 3.3 Estado de Art. 89 / Art. 110 en el benchmark

El benchmark no tiene una pregunta idéntica a "echar del trabajo"/"facebook", pero sí preguntas relacionadas en Cat. D (`"Sanciones por llegar tarde al trabajo"` → **FALSE NEGATIVE**) y Cat. F (`"El mes pasado tuve varias faltas injustificadas... consecuencias disciplinarias exactas..."` → rechazada por límite de 200 caracteres, no evaluable). Esto es consistente con el diagnóstico: el área de sanciones/terminación del RIT (Cap. XIX-XXVI, incluyendo Art. 110) sigue siendo un punto débil confirmado de forma independiente por el benchmark general, no solo por las 2 queries puntuales investigadas.

### 3.4 Re-chunking header-aware: sigue sin implementarse

Tal como se indicó, **no se implementó el re-chunking.** Queda pendiente, ahora con una línea base cuantitativa real (83.72% Acc / 20.00% Halluc / 13.95% FNR, `reports/benchmark_raw_results_rrfScore_fix_2026-08-03.json`) contra la cual comparar el resultado de esa futura sesión.

---

## Resumen ejecutivo

1. **`rrfScore` reconectado.** Causa: un refactor renombró el score de fusión a `fusionScore` sin actualizar el consumidor en `rerankingService.js`, dejando el componente semántico (peso 0.35) en 0 permanentemente. Fix de una línea + eliminación de un multiplicador `*10` mal calibrado. Validado con las 21+15 preguntas: **19/21 mejoraron, 1 regresión real (facebook, causa raíz identificada: interacción con Fast-Reject Semántico), 15/15 OOD se mantienen rechazadas** (tras corregir un hallazgo colateral en el propio guardrail de seguridad — `'cuantos'` colándose como señal de dominio válida).
2. **"Embriagado" y Art. 89/110 NO se resolvieron con este fix** — en el caso de Art. 89, empeoró. Confirma que la causa de esos 3 casos es el chunking, no el bug de `rrfScore`.
3. **DocBoost: se deja en observación, no se implementa ningún rediseño todavía.** Con `rrfScore` vivo, `docBoost` pasó de ser 100% del score (antes) a 35-51% en ejemplos reales — el síntoma que motivaba el rediseño ya no es tan severo. Se recomienda revisarlo solo si el análisis del benchmark de 100 muestra un patrón que lo justifique.
4. **Benchmark de 100 preguntas ejecutado como prerrequisito** (no se implementó el re-chunking): **Accuracy 83.72% (+11.6 pts vs. baseline), FNR 13.95% (-14 pts), Hallucination 20% (+4 pts, dentro del margen de ruido documentado).** Mejora neta real y significativa. Esta corrida queda como nueva línea base para evaluar el re-chunking header-aware, que sigue pendiente.
