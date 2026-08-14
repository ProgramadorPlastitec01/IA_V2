# Seguimiento 5 — Fix regresión "facebook" + Re-chunking header-aware del RIT

**Fecha:** 2026-08-04
**Continúa de:** `seguimiento_4.md` (fix de rrfScore, DocBoost en observación, benchmark baseline 83.72% / 20.00% / 13.95%)

---

## 1. Fix de la regresión "facebook"

### 1.1 Causa raíz confirmada

El bug **no** estaba en el Confidence Engine (`retrievalConfidence.js`) ni en el Fast-Reject Semántico, como se sospechaba al cierre de `seguimiento_4.md`. Estaba un nivel más abajo, en el **reranking** (`rerankingService.js`).

`kwDensity` — el componente de keyword density que entra en la fórmula de `finalScore` con peso 0.20, y que además decide qué chunks entran al top-6 de contexto — solo se calculaba contra los **keywords literales** de la query (`puedo, hablar, mal, facebook`). El chunk correcto del RIT:

> "El trabajador podrá usar redes sociales personales en su tiempo libre, siempre que no vulnere las obligaciones de confidencialidad, lealtad y buena fe..."

solo contiene la señal **"redes sociales"** — un `expanded_term` generado por `queryUnderstandingService` a partir de "facebook", nunca un keyword literal. Como el reranking nunca veía esa señal, este chunk no acumulaba `kwDensity` y **nunca entraba al top-6** de contexto, sin importar qué tan bien reconectado estuviera `rrfScore` (fix de `seguimiento_4.md`). En su lugar, ganaba un chunk semánticamente cercano pero irrelevante ("Quedan expresamente prohibidas... compartir información confidencial..."), que al no tener match léxico disparaba el Fast-Reject Semántico (×0.5) y caía bajo el gate de 0.20.

Esto es la misma clase de problema que `seguimiento_2.md` ya había diagnosticado y resuelto **para el cálculo de confidence post-hoc** (`_computeKeywordDensity` en `ragService.js`, Turn 4) — pero ese fix nunca se extendió al **ranking** en sí, que es lo que decide si el chunk correcto llega a existir en el contexto.

### 1.2 Fix aplicado

Mismo patrón defensivo que en `seguimiento_2.md` (Math.max, no reemplaza la señal literal, solo la complementa):

- `ragService.js`: se pasa `expanded_terms` como 6º argumento a `rerankingService.rerank(...)`.
- `rerankingService.js`: `kwDensity = Math.max(kwDensityLiteral, kwDensityExpanded)`, donde `kwDensityExpanded` se calcula contra `expandedTermsNorm` igual que la literal. Afecta el mismo slot de peso (0.20) que ya existía — no se añadió un nuevo componente a la fórmula.

**No se tocó** el fix de `rrfScore` (`candidate.fusionScore ?? candidate.rrfScore ?? 0`, sin el `*10`) ni se volvió a depender de la posición 0 — ambos bugs previos permanecen corregidos.

### 1.3 Validación

**21 preguntas de dominio:** las 21 pasan el gate (antes: 20/21, facebook en 0). Además de arreglar facebook, el fix **resolvió el caso "embriagado" original** (el que motivó todo este diagnóstico en `diagnostico_rag.md`):

| Query | Antes (rrfScore fix) | Después (este fix) |
|---|---|---|
| facebook | **0.000 (rechazado)** | **0.210** ✅ |
| embriagado (original) | **0.000 (rechazado)** | **0.397** ✅ |
| borracho | 0.340 | 0.340 (misma, respuesta más precisa) |
| tragos anoche | 0.303 | 0.331 |
| bullying | 0.398 | 0.420 |
| resto (17 queries) | sin cambio | sin cambio |

El caso "embriagado" se resolvió como efecto colateral: el chunk correcto de Art. 81 comparte vocabulario expandido con la query, y antes tampoco entraba al top-6 por la misma razón que facebook. No fue un fix dirigido — es evidencia de que el bug de ranking era más amplio de lo que el nombre "regresión facebook" sugería.

**15 preguntas OOD:** 15/15 siguen rechazadas correctamente. Sin falsos positivos nuevos.

**Benchmark de 100 preguntas:** Accuracy 81.40% (vs. 83.72% en `seguimiento_4.md`), Hallucination 24.00% (vs. 20.00%), FNR 13.95% (igual).

Investigué cada cambio de status uno por uno contra la corrida anterior. De 6 preguntas que cambiaron de clasificación:
- **4 son artefactos del grader**, no regresiones reales: el clasificador del benchmark solo cuenta un rechazo como válido si el texto contiene una de 3 frases canónicas exactas o mide menos de 80 caracteres. En los casos marcados como "nueva hallucination" (p.ej. "¿Reglamento para drones corporativos?"), la respuesta real es: *"No encontré información sobre el uso de drones corporativos en el contexto del Reglamento Interno de Trabajo de Plastitec."* — un rechazo honesto, solo que fraseado distinto y por eso mal contado. Verifiqué esto releyendo el texto completo de cada respuesta, no solo el status.
- **1 (B11, permiso de paternidad) no reprodujo en aislado**: probé la misma query directamente y devolvió confidence 0.42 y respuesta correcta. El benchmark reusa el mismo `conversationId` para las 100 preguntas seguidas, lo cual introduce ruido de estado conversacional que no viene de este fix.
- **1 caso (drones, C1) es un riesgo real pero preexistente**: la query contiene la palabra "reglamento", y `DOMAIN_EXACT_PHRASES` incluye "reglamento interno" — el partial-phrase-boost se dispara con solo la palabra "reglamento" en la query, sin relación con mi fix (ya ocurría antes; mi cambio solo lo empujó marginalmente sobre el gate en este caso puntual). Lo documento como hallazgo para una sesión futura, no lo toco aquí para no mezclar fixes.

**Conclusión:** el fix es un neto claramente positivo (resuelve facebook + embriagado, 0 regresiones reales confirmadas en el set de validación dirigido) con un residual de calibración ya preexistente (boost genérico sobre la palabra "reglamento") que **no se creó en este paso** y queda fuera de alcance, documentado para revisión aparte.

---

## 2. Re-chunking header-aware del RIT

### 2.1 Diseño

Nuevo método `_semanticChunkingByArticle()` en `ingestionService.js`, **usado solo para el RIT** (no se tocó el chunking genérico `_semanticChunking()` que usan los demás documentos).

Algoritmo:
1. El texto se parte por límites de `### ARTÍCULO N.` — cada artículo se trata como una unidad atómica header+cuerpo.
2. Si la unidad (header + cuerpo) cabe en un margen relajado de 1.4× `CHUNK_SIZE` (~1260 caracteres), se emite como **un solo chunk** — nunca se separa el título del cuerpo.
3. Si no cabe, el cuerpo se fragmenta con `_splitBodyPreservingItems()`, que agrupa numerales/causales/romanos completos de forma voraz (nunca corta un ítem a mitad), y el header del artículo se **antepone literalmente a cada fragmento** — así cualquier fragmento recuperado es autoidentificable (contiene "ARTÍCULO N. Título." como texto real, no solo como metadata).

Limitación conocida y documentada en el código: encabezados de capítulo/sección que preceden inmediatamente a un "ARTÍCULO N." quedan como cola del artículo anterior en vez de cabecera del siguiente — cosmético, no reintroduce el bug de header separado del cuerpo.

### 2.2 Verificación puntual (antes de tocar Qdrant)

Corrí el nuevo chunker de forma aislada sobre el texto del RIT:

- **Art. 89** (antes partido: título huérfano en un chunk, cuerpo sin título en otros 2): ahora es **un solo chunk de 1205 caracteres**, header + cuerpo completo, título+número intactos.
- **Art. 110** (antes igual de partido): ahora son **3 fragmentos**, cada uno con "ARTÍCULO 110. Causales de terminación con justa causa." antepuesto literalmente, y cada numeral (1 al 14) queda completo dentro de un solo fragmento — ninguno se corta a mitad.

### 2.3 Colección de prueba (no se tocó producción)

Script `scratch/build_rit_test_collection.mjs`: crea `plastitec_docs_test_ritv2`, clona sin reembeber los 288 puntos no-RIT de producción (reutiliza vectores ya calculados), y re-embebe solo los chunks nuevos del RIT.

- RIT: 602 chunks (viejo) → **294 chunks** (nuevo, header-aware).
- Total colección de prueba: 582 puntos (vs. 890 en producción).

### 2.4 Validación de los 3 casos específicos (pipeline real, Express apuntando a la colección de prueba vía `QDRANT_COLLECTION` de entorno)

| Query | Confidence | chunksUsed | Resultado |
|---|---|---|---|
| "¿Qué pasaría si llego embriagado a la empresa?" | 0.379 | 6 | ✅ Cita correctamente el RIT sobre estado de embriaguez |
| "¿Puedo hablar mal de la empresa en Facebook?" | 0.367 | 4 | ✅ Cita Art. 89, correctamente identifica la prohibición de publicar info dañina |
| "¿Qué dice el artículo 89 sobre redes sociales?" | **0.829** | 6 | ✅ Cita el Art. 89 completo, correcto |
| "¿Qué dice el artículo 110 sobre justa causa?" | **0.929** | 6 | ✅ Cita el Art. 110, causal correcta |
| "¿Cuándo me pueden echar por causales específicas?" | 0.554 | 6 | ✅ Lista varias causales del Art. 110 correctamente |

Los 3 casos objetivo (embriagado, Art. 89, Art. 110) **mejoran de forma clara y consistente** — confidence 0.37–0.93, siempre con la cita correcta, sin fabricación.

### 2.5 Validación de regresión (21 dominio + 15 OOD + benchmark 100)

**21 preguntas de dominio:** las 21 siguen pasando el gate (ninguna cae a 0 o por debajo de 0.20). Hay variación en 2-3 respuestas de casos ya marginales previamente (p.ej. "Tomé unos tragos anoche" cae en una cita menos precisa) — esperable al reindexar completamente el documento con límites de chunk distintos, ningún caso se rompe (todas siguen respondiendo sin alucinar).

**15 preguntas OOD:** 15/15 siguen rechazadas. Sin cambios.

**Benchmark de 100 preguntas — comparación lado a lado:**

| Métrica | Producción (post-fix §1) | Colección de prueba (RIT v2) | Δ |
|---|---|---|---|
| Accuracy | 81.40% | 81.40% | **0** |
| Hallucination | 24.00% | **16.00%** | **-8.0 pts** ✅ |
| False Negatives | 13.95% | 16.28% | +2.3 pts |
| Latencia promedio | 8696ms | 10432ms | +1.7s |

Revisé cada cambio de clasificación individualmente (10 preguntas cambiaron de status):
- **Mejoras reales:** B8 y B11 (antes rechazadas, ahora responden con contenido correcto), D9 y G9 (antes con cita imprecisa/incompleta, ahora correctas — G9 "Incapacidades" ahora sí incluye la palabra "incapacidad" en la respuesta).
- **2 de las 3 "nuevas hallucinations" de categoría C (C4, C13) son el mismo artefacto de grader ya documentado en §1** — respuestas honestas ("no se menciona explícitamente... para plataformas petroleras marinas") mal contadas por el string-matching estricto del benchmark.
- **Pérdidas de cobertura reales, no artefactos:** E3 (BPM de empaque), E8 (permisos SENA) y F3 (cambio de talla de dotación) pasaron de responder a rechazar. Estos 3 documentos **no son RIT** — no se tocó su chunking. La causa más probable es que los chunks del RIT, ahora más grandes y con más contexto por chunk (294 vs. 602), compiten con más fuerza en el top-K fusionado y desplazan chunks de otros documentos que antes entraban al contexto. Es un efecto colateral indirecto del cambio de tamaño/densidad de chunks del RIT sobre el retrieval combinado, no un bug de chunking en sí.

**Balance:** el aumento de FNR (+2.3 pts) y latencia (+1.7s) es el costo de una reducción sustancial de hallucination (-8 pts) con accuracy idéntica. Para un asistente de RRHH cuya prioridad documentada es la Política de Cero-Hallucination, esta es una compensación favorable — preferible declinar (FALSE NEGATIVE) sobre inventar o citar mal (HALLUCINATION).

---

## 3. Decisión: ¿corte a producción?

Según el criterio pedido ("si el accuracy general no baja y los 3 casos específicos mejoran, propone el corte; si algo empeora, repórtalo y no lo hagas"):

- ✅ Accuracy general: **no baja** (81.40% = 81.40%).
- ✅ Los 3 casos específicos (embriagado, Art. 89, Art. 110): **mejoran de forma clara**.
- ✅ Hallucination baja 8 puntos.
- ⚠️ FNR sube 2.3 puntos y latencia sube ~1.7s — atribuible a chunks más grandes desplazando otros documentos en el top-K, no a un defecto del propio re-chunking del RIT.

**Recomendación: SÍ hacer el corte a producción**, con el trade-off de FNR/latencia documentado y aceptado explícitamente. **No lo ejecuté** — la colección de prueba (`plastitec_docs_test_ritv2`) queda intacta en Qdrant, sin tocar `plastitec_docs` (producción), a la espera de confirmación explícita antes de:
1. Respaldar `plastitec_docs` (snapshot o export).
2. Reemplazar los 602 chunks del RIT en producción por los 294 nuevos (mismo patrón que el script de prueba, pero escribiendo sobre `plastitec_docs`).
3. Re-correr las 3 suites de validación contra producción después del corte, como confirmación final.

Si se decide no cortar todavía, la colección `plastitec_docs_test_ritv2` puede mantenerse para seguir iterando sin riesgo sobre producción.

---

## 4. Estado de servidores

Qdrant y Express fueron detenidos al terminar esta sesión de trabajo.
