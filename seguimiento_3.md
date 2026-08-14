# Seguimiento 3 — Falso Positivo de Seguridad, Rediseño de DocBoost, Chunking

**Generado:** 2026-08-03
**Contexto:** Continuación de `seguimiento_2.md`. Se priorizó el punto 1 (falso positivo/alucinación) como bug de seguridad — viola la Zero-Hallucination Policy de `PROJECT_CONTEXT.md` — antes que los puntos de cobertura.

**Entorno:** Qdrant (890 puntos) + Express + Ollama levantados de nuevo para esta sesión, detenidos al final según instrucción.

---

## 1. Falso positivo "capital de Francia" — bug de seguridad CONFIRMADO, corregido y validado como patrón sistémico

### 1.1 Reproducción exacta

Query: `"Cual es la capital de Francia"`. Contexto exacto recibido por el LLM (log `rag_1785790025441`, sesión anterior):

```
[[ FUENTE: RIT_PLASTITEC_01_DE_JULIO_2026_VF.md ]]
V.  Fuero de pre pensionado: ...
VI. Fuero de paternidad: ...
[...]
[[ FUENTE: I-RH-001-V20-Conocimiento_Plastitec.md ]]
Plastitec es una empresa colombiana fabricante de plásticos técnicos...
### 1996 — Inicio de Exportaciones
En el año 1996 inicia su exportación a clientes en: Brasil, Argentina, Chile,
El Salvador, Ecuador, Costa Rica, Francia, entre otros.
```

Respuesta generada (esa corrida): *"La capital de Francia es París, según información generalmente conocida."* — con bloque de citas fabricado apuntando a "Reglamento Interno de Trabajo (RIT)" y "Conocimiento de Plastitec", **ninguno de los cuales contiene la respuesta real**. El LLM alucinó usando su conocimiento general (violación directa y textual de la Zero-Hallucination Policy: *"fuerzan respuestas negativas si no existe evidencia documental corporativa"*) y encima la citó como si viniera del corpus.

**Causa exacta:** la palabra "Francia" aparece literalmente en el corpus (historial de exportaciones de Plastitec), lo que genera coincidencia BM25/keyword real — `expandedTerms: []` (confirmado, no relacionado con los fixes de sesiones anteriores) — y el Domain Referent Rule de `retrievalConfidence.js` considera "Francia" un referente de dominio válido (no está en ninguna lista de stopwords/genéricos), sin verificar que el referente pertenezca al dominio real de Plastitec (RRHH/reglamento/producción). `confidence_score = 0.241` cruza el gate de 0.20 sin que exista relevancia temática real.

### 1.2 ¿Caso aislado o patrón? — Se probaron 15 preguntas fuera de dominio

Set de prueba: capitales (Francia, Colombia, Japón), historia (descubrimiento de América, 2ª Guerra Mundial), cultura general (Cien años de soledad, Mona Lisa), ciencia (fórmula del agua, fotosíntesis, planetas), geografía (río más largo, animal más grande, continentes), deporte (mundial de fútbol) y aritmética trivial (2+2).

**Resultado (antes del fix): 7 de 15 (47%) cruzaron el gate de confianza indebidamente:**

| Query | Confidence | ¿Alucinó? |
|---|---|---|
| Capital de Francia | 0.241 | Sí (esa corrida): "París, según información generalmente conocida" |
| Capital de Colombia | 0.241 | No esa corrida (honesto "no encontré") — pero cruzó gate igual |
| **Río más largo del mundo** | 0.209 | **Sí: "El río más largo del mundo es el Amazonas..."**, citando "Conocimiento de Plastitec" |
| Fórmula del agua | 0.308 | No esa corrida (honesto) |
| **Animal más grande del mundo** | 0.205 | **Sí: "El elefante africano es considerado el animal más grande del mundo"** (además factualmente incorrecto — la ballena azul es más grande), citando "Conocimiento de Plastitec" |
| Capital de Japón | 0.241 | No esa corrida (honesto) |
| **Cuánto es 2+2** | **0.497** | **Sí: resuelve la operación "El resultado es 4"**, citando RIT + Inducción SST |

Las otras 8/15 (descubrimiento de América, planetas, mundial de fútbol, Cien años de soledad, 2ª Guerra Mundial, continentes, Mona Lisa) fueron rechazadas correctamente (`confidence: 0`).

**Confirmado: es un patrón, no un caso aislado.** 3 de 7 gate-passes (43% de los que cruzan) produjeron alucinación con cita fabricada; el resto tuvo la "suerte" de que el LLM respondiera honestamente esa corrida particular, pero el gate los dejó pasar igual — el riesgo está en el *gate*, no en que el LLM a veces se salve solo.

**Causa raíz del patrón, verificada con evidencia adicional (log `rag_1785790752699`, query "Cuánto es 2+2"):** las keywords extraídas fueron `["cuanto","mas"]` — "mas" (sin tilde, como lo escribió el usuario) es una palabra ubicua en español legal/corporativo. Matcheó vía BM25 en decenas de chunks del RIT (`finalScore: 0.55` en el chunk ganador, ninguna relación temática real), y **"mas"/"más" NO está en `SPECIFICITY_STOPWORDS` de `retrievalConfidence.js`** (sí está en las listas de stopwords de `ragService.js` y `rerankingService.js`, pero no en la de `retrievalConfidence.js` — inconsistencia entre 3 listas de stopwords distintas en 3 archivos). Esto le permite contar como "referente de dominio" y evitar la penalización de vaguedad.

### 1.3 Fix implementado — Guardrail de Relevancia Temática Mínima

Se optó por un **guardrail adicional** (no tocar la fórmula de confianza compartida) en `ragService.js`, justo antes del gate existente:

```js
// ── Relevancia Temática Mínima (2026-08-03 — fix de seguridad) ────
const hasTopicalSignal = expanded_terms.length > 0
    || foundAcronyms.length > 0
    || docPriority.boost.length > 0
    || this._hasHRDomainToken(query);

if (!contextText || chunksUsed === 0 || safeConfidence < 0.20 || isEntityHallucination || !hasTopicalSignal) {
    // → "No encontré información sobre este tema en la documentación disponible."
}
```

```js
_hasHRDomainToken(query) {
    // Vocabulario HR curado (KNOWN_VOCAB_EXTRA + keywords de DOC_PRIORITY_MAP),
    // EXCLUYENDO stopwords a propósito — distinto de _isGibberishQuery, que
    // considera "comprensible" cualquier oración gramatical española.
    const normalize = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (!this._hrVocabOnly) {
        const docPriorityKw = DOC_PRIORITY_MAP.flatMap(r => r.keywords).map(normalize);
        this._hrVocabOnly = new Set([...Array.from(KNOWN_VOCAB_EXTRA).map(normalize), ...docPriorityKw]);
    }
    if (!this._normalizedStopwords) {
        this._normalizedStopwords = new Set(Array.from(SPANISH_STOPWORDS).map(normalize));
    }
    const tokens = normalize(query).replace(/[¿?¡!.,;:()\[\]{}"']/g, ' ').split(/\s+/)
        .filter(t => t.length > 2 && !this._normalizedStopwords.has(t));
    if (tokens.length === 0) return false;
    return tokens.some(t => this._hrVocabOnly.has(t));
}
```

**Por qué este diseño y no otro:** reutiliza señales YA calculadas en el pipeline (`expanded_terms`, `foundAcronyms`, `docPriority.boost`, vocabulario HR curado) — no requiere nueva infraestructura, no toca retrieval/reranking/fórmula de confianza compartida, y es puramente ADITIVO como condición de rechazo (solo puede rechazar más que antes, nunca aceptar algo que antes se rechazaba). Riesgo mínimo por diseño.

### 1.4 Validación

**Set fuera de dominio (15 preguntas) — después del fix: 15/15 (100%) correctamente rechazadas** (antes: 7/15 pasaban indebidamente). Cero alucinaciones restantes en el set de prueba.

**Set de 21 preguntas de dominio — 0 regresiones (0 gate flips):** las 21 preguntas disparan al menos una señal (`docPriority.boost` en casi todas, gracias a las reglas de `DOC_PRIORITY_MAP` ya agregadas en sesiones anteriores para alcohol/acoso/despido/teletrabajo/dotación/redes/aprendices) — confirmado explícitamente, ninguna de las 21 cruzó de "pasa" a "no pasa" ni viceversa.

**Conclusión: fix de seguridad aplicado, validado sin regresión de cobertura real, y sin pérdida de recall en el dominio. Se deja aplicado.**

---

## 2. Rediseño del DocBoost plano — fórmula exacta y hallazgo crítico adicional

### 2.1 Fórmula exacta (código real, `rerankingService.js`)

```js
// Componentes (candidate = chunk tras weightedFusion de ragService.js)
const rrfScore      = candidate.rrfScore || 0;          // ← ver 2.2, SIEMPRE 0
const bm25          = this._bm25Score(textNorm, keywordsNorm, idfMap);
const kwDensity     = kwPresent / keywordsNorm.length;    // % keywords literales presentes
const phraseBoost   = this._exactPhraseBoost(queryLower, textNorm);   // 0 o 1
const acronymBoost  = this._acronymBoost(foundAcronyms, textNorm);   // 0 o 1
const sectionBoost  = this._sectionRelevanceBoost(keywordsNorm, sectionTitle, textNorm);
const proximityScore = this._keywordProximityScore(textNorm, keywordsNorm);

// Document Priority Boost/Penalize — FLAT, no proporcional a nada
let docBoost = 0;
if (docPriority.boost.some(b => source.includes(b)))    docBoost = 0.25;
if (docPriority.penalize.some(p => source.includes(p))) docBoost = -0.25;

// Fórmula final — TODO ADITIVO
const finalScore = (
    (rrfScore * 10  * 0.35) +   // Semántico (RRF base)
    (bm25           * 0.25) +   // BM25 léxico
    (kwDensity      * 0.20) +   // Cobertura de keywords
    (phraseBoost    * 0.50) +   // Frases exactas de dominio
    (acronymBoost   * 0.50) +   // Acrónimos exactos
    (sectionBoost   * 0.30) +   // Relevancia de título de sección
    (proximityScore * 0.10) +   // Proximidad de keywords
    docBoost                    // Boost/penalización de documento — FLAT ±0.25
);
```

`docBoost` se **suma** (no multiplica) al resto de componentes, con un valor fijo de ±0.25 independiente de cuánto matchee realmente el chunk. Esto es exactamente el "techo plano" ya documentado en `seguimiento_confidence_engine.md` y `seguimiento_2.md`: cuando todos los demás componentes son 0 (chunk semánticamente relacionado pero sin BM25/frase/acrónimo/sección), `finalScore = docBoost = 0.25` exacto — de ahí los empates masivos observados.

### 2.2 HALLAZGO CRÍTICO ADICIONAL: `rrfScore` está SIEMPRE en 0 — bug de wiring, no de diseño

Se buscó en TODO el código dónde se asigna `candidate.rrfScore` antes de llegar a `rerankingService.rerank()`:

```
$ grep -rn "rrfScore" services/*.js
services/rerankingService.js:126: * @param {Array}  candidates - ... rrfScore, searchType }
services/rerankingService.js:147: const rrfScore = candidate.rrfScore || 0;
services/rerankingService.js:196: (rrfScore * 10 * 0.35) + ...
```

**`rrfScore` NUNCA se asigna en ningún punto del código.** `ragService._weightedFusion` (que produce los `candidates` que recibe `rerank()`) solo asigna `fusionScore` y `finalScore` (el score de fusión ponderada), pero **nunca un campo `rrfScore`**. Por lo tanto, `candidate.rrfScore || 0` es **siempre 0**, para el 100% de los chunks, en el 100% de las queries, desde que este código existe.

**Consecuencia:** el componente semántico de la fórmula final (`rrfScore * 10 * 0.35`) — el de MAYOR peso individual en la fórmula (0.35, más que BM25 0.25 o keywordDensity 0.20) — **es código muerto**. La similitud semántica real (que SÍ se calculó en `_weightedFusion` como `fusionScore`) se descarta por completo al reordenar. Esto explica de forma mucho más fundamental por qué tantos chunks del mismo documento boosteado empatan exactamente en `docBoost` (0.25): para chunks sin BM25/frase/acrónimo/sección, **`docBoost` es literalmente el ÚNICO componente no-cero de toda la fórmula**, sin importar cuán semánticamente relevante sea el chunk.

Este hallazgo cambia el diagnóstico: el problema no es solo que "DocBoost sea plano" — es que **el componente que debería competir con y diferenciar a DocBoost (la similitud semántica) nunca llega a la fórmula**. Corregir esto (no solo redecorar DocBoost) es probablemente la palanca de mayor impacto de las 3 sesiones de seguimiento.

### 2.3 Propuesta de rediseño (NO implementada — solo diagnóstico, según instrucción)

**Opción 1 — Reconectar `rrfScore` (bug fix, no redesign):** pasar el `fusionScore` real (ya calculado en `_weightedFusion`) como `rrfScore` al llamar `rerankingService.rerank()`.
- **Costo:** mínimo — una línea (pasar/renombrar el campo).
- **Riesgo:** **ALTO pese al costo bajo** — cambia el `finalScore` de absolutamente TODOS los chunks del corpus, en TODAS las queries, porque restaura un componente que pesa 0.35 (el mayor peso individual) y que hoy es 0 en el 100% de los casos. Esto puede reordenar rankings ya calibrados y validados en 3 sesiones de trabajo (los 21 + 15 OOD). Requiere el benchmark completo de 100 preguntas del proyecto antes de aplicar.
- **Impacto estimado en los 21 casos:** para "embriagado", con `rrfScore` real restaurado, el chunk correcto (falta grave #14, score semántico crudo previo observado en logs: 0.7699 antes de cualquier boost) tendría `rrfScore*10*0.35 ≈ 0.77*3.5 ≈ 2.7`(!) — un valor que hoy no existe en ninguna parte de la fórmula. Esto probablemente ROMPE la escala completa de `finalScore` actual (hoy los valores observados rondan 0.0–0.8; con rrfScore activo podrían dispararse a 2-3+), lo que a su vez requeriría **recalibrar el gate de 0.20 y probablemente los pesos de la fórmula completa** — no es un cambio aislado.
- **Impacto estimado en el set OOD:** el guardrail de Relevancia Temática Mínima (punto 1) ya blinda contra alucinaciones independientemente de este bug, así que el riesgo de seguridad ya está mitigado por una capa distinta — pero sin esa capa, restaurar `rrfScore` real habría probablemente EMPEORADO los falsos positivos OOD (más señal semántica real = confidence más alta también para coincidencias temáticas parciales genuinas, no solo para ruido).

**Opción 2 — DocBoost multiplicativo/proporcional (ej. `docBoost = 0.15 × (bm25 + kwDensity + sectionBoost)` en vez de flat ±0.25):**
- **Costo:** bajo — cambio de fórmula acotado a `rerankingService.js`.
- **Riesgo:** **esta opción NO debe implementarse antes que la Opción 1.** Evidencia: para "embriagado", los 6 chunks empatados hoy tienen `bm25≈0`, `kwDensity=0`, `sectionBoost=0` (confirmado en `seguimiento_2.md` — solo `docBoost` es no-cero). Si `docBoost` pasa a ser proporcional a componentes que HOY son 0 (porque `rrfScore` tampoco aporta), **el boost completo desaparecería** y esos chunks caerían a `finalScore≈0` — peor que el status quo, no mejor. La Opción 2 solo tiene sentido DESPUÉS de que la Opción 1 restaure señal real a la que ser proporcional.
- **Impacto estimado (si se aplicara sola, sin Opción 1 primero):** regresión severa en las 10+ reglas de `DOC_PRIORITY_MAP` que hoy dependen de `docBoost` como único diferenciador para chunks de match semántico puro (sin BM25/frase exacta) — probablemente bajaría la cobertura real observada en el set de 21 preguntas.

**Opción 3 — Recalibrar el gate (0.20) en vez de tocar la fórmula:**
- **Costo:** mínimo — cambiar una constante.
- **Riesgo:** bajo en el código, pero es un parche que no resuelve la causa raíz (rrfScore muerto) y requiere análisis estadístico de la distribución real de `confidence_score` sobre una muestra representativa (el benchmark de 100 preguntas) para elegir un nuevo umbral con fundamento, no a ojo. Podría subir el umbral lo suficiente para bloquear más falsos positivos OOD, pero también bloquearía casos legítimos de confianza intermedia (ej. varias de las 21 preguntas hoy pasan con confidence 0.20-0.30, un margen estrecho).

**Recomendación de secuencia (no implementada, pendiente de decisión del usuario):** Opción 1 (reconectar `rrfScore`) es la más fundamental pero también la de mayor alcance/riesgo — debe hacerse en una sesión dedicada con el benchmark de 100 preguntas como red de seguridad ANTES/DESPUÉS, y probablemente requiera recalibrar tanto los pesos de la fórmula (0.35/0.25/0.20/etc.) como el gate de 0.20 en conjunto, no por separado. Las Opciones 2 y 3 son secundarias y dependientes de la 1.

---

## 3. Chunking RIT — fix de menor riesgo implementado (topK), resultado parcial

### 3.1 Elección técnica y hallazgo adicional durante la implementación

Se eligió subir `topK` (Opción 1 de `seguimiento_2.md`) por ser la de menor riesgo/costo. Al revisar dónde se define `topK`, se encontró una causa adicional no documentada antes: **`intentRoutingService.getParams()` asigna `topK: 4` al intent `CORPORATIVA`**, y la lista de keywords que dispara ese intent incluye la palabra **`'empresa'`** — presente en ambas queries problemáticas ("llego embriagado **a la empresa**", "hablar mal de la **empresa** en facebook"). Confirmado en logs: ambas queries tenían `intent: "corporativa"` y `semanticCount: 4` (el canal semántico solo consideraba 4 candidatos). La query de Art. 110 ("echar del trabajo") tenía `intent: "estandar"` (topK=12 por defecto, no 4).

**Cambios aplicados:**
```js
// intentRoutingService.js
CORPORATIVA: { topK: 4 → 12, ... }   // 'empresa' es demasiado genérica para topK=4
default (ESTANDAR): { topK: 12 → 20, ... }
```

### 3.2 Validación contra Art. 110 y Art. 89

**Art. 89 (facebook, intent corporativa, topK 4→12):** la respuesta cambió de citar Art. 88 (confidencialidad, impreciso) a: *"No se menciona explícitamente si el contrato de aprendizaje permite o no hablar mal de la empresa en Facebook..."* — **mejora en honestidad** (ya no fabrica un número de artículo incorrecto), pero **el contenido del chunk 178 (Art. 89, "reputación"/redes sociales) sigue sin aparecer en el contexto ensamblado**. `confidence` sin cambio (0.209).

**Art. 110 (echar del trabajo, intent estandar, topK 12→20):** la respuesta cambió de citar Art. 38 (fiesta no determinada, irrelevante) a citar **Art. 39** (suspensión por falta injustificada — temáticamente más cercano, pero SIGUE SIN ser el Art. 110 correcto). El contexto ensamblado sigue centrado en la región de domingo/vacaciones (Art. 36-39), **sin ningún chunk de la región 242-245 (Art. 110/111)**. `confidence` prácticamente sin cambio (0.447 vs. 0.455).

**Conclusión: el aumento de topK NO resolvió ninguno de los 2 casos**, aunque mejoró marginalmente la honestidad de una respuesta (Art. 89) y la cercanía temática de la otra (Art. 39 vs. Art. 38). Los chunks correctos (178, 242-245) simplemente no ganan suficiente score — ni semántico ni BM25 — para entrar al top-6 final, ni siquiera con un pool de candidatos más amplio. **Esto confirma que la causa raíz es más profunda que el tamaño del pool de candidatos**: es el chunking (contenido fragmentado, título separado del cuerpo) combinado con el bug de `rrfScore` (punto 2.2) — sin señal semántica real operando, ampliar el pool no ayuda si el chunk correcto no tiene ningún componente de score (BM25/frase/kwDensity) que lo distinga una vez dentro del pool.

### 3.3 Validación de regresión (21 + 15 preguntas)

- **21 preguntas de dominio:** 0 gate flips — ninguna pasó a fallar ni viceversa. Fluctuaciones menores de confidence (±0.01-0.02) en ambas direcciones, dentro de ruido esperado por el cambio de pool de candidatos.
- **15 preguntas OOD:** 15/15 siguen correctamente rechazadas — el guardrail de Relevancia Temática Mínima (punto 1) es independiente del tamaño de `topK` y sigue blindando contra alucinaciones aunque el pool de candidatos sea más amplio.

**El fix de topK se deja aplicado** (mejora honestidad sin costo de regresión), pero **no se considera resuelto el problema de fondo**.

### 3.4 Pendiente: re-chunking header-aware

Tal como se pidió, no se implementa todavía. Se deja marcado como siguiente paso, con el mismo prerrequisito ya identificado en `seguimiento_2.md`: **ejecutar el benchmark de 100 preguntas del proyecto (`run_100_benchmark.cjs`) antes y después** de cualquier cambio de chunking, dado que re-fragmentar el RIT completo afecta todos sus ~700+ chunks, no solo los de Art. 89/110. Adicionalmente, dado el hallazgo del punto 2.2 (`rrfScore` muerto), se recomienda evaluar si conviene resolver primero ese bug de wiring — un chunking mejor con una fórmula de scoring que todavía ignora la similitud semántica real podría seguir sin resolver casos como estos.

---

## Resumen ejecutivo

1. **Falso positivo de seguridad: confirmado como patrón (47% de OOD cruzaban el gate, 43% de esos alucinaban con citas fabricadas), corregido con un guardrail de Relevancia Temática Mínima, validado: 15/15 OOD ahora rechazadas correctamente, 0 regresiones en las 21 preguntas de dominio.** Se deja aplicado.
2. **DocBoost: documentada la fórmula exacta (aditiva, flat ±0.25) y descubierto un bug más fundamental: `rrfScore` (peso 0.35, el mayor de la fórmula) nunca se asigna y es SIEMPRE 0** — el componente semántico real está muerto en el reranking final. Se presentan 3 opciones con costo/riesgo; se recomienda NO implementar ninguna todavía y priorizar arreglar el bug de `rrfScore` en una sesión dedicada con el benchmark de 100 preguntas como red de seguridad, antes de considerar un DocBoost proporcional.
3. **Chunking: se implementó el fix de menor riesgo (subir topK, más el hallazgo adicional de `intent: corporativa` con topK=4 gatillado por la palabra genérica "empresa").** Mejoró la honestidad de las respuestas pero NO resolvió ninguno de los 2 casos de fondo (Art. 89/110 siguen sin entrar al contexto con el score suficiente). 0 regresiones en ambos sets de prueba. El re-chunking header-aware queda pendiente, con el benchmark de 100 preguntas como prerrequisito explícito.
