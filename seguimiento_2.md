# Seguimiento 2 — keywordDensity vs. Sinónimos Expandidos, y Chunking del RIT

**Generado:** 2026-08-03
**Contexto:** Continuación de `seguimiento_confidence_engine.md`, que dejó 2 problemas abiertos: (1) `keywordDensity` no reconocía coincidencias vía sinónimos expandidos (`expanded_terms`), solo tokens literales de la query; (2) 2 de los 3 gaps de citación resultaron ser en realidad problemas de retrieval/contexto, no de citación del LLM — había que confirmar si es chunking (artículo partido) o topK/ranking (chunk completo pero no seleccionado).

**Entorno:** mismo Qdrant (890 puntos) + Express + Ollama reutilizados sin detener, hasta el cierre de esta sesión (se detienen al final, según instrucción).

---

## 1. keywordDensity vs. términos expandidos

### 1.1 Confirmación

En `services/ragService.js`, `_buildContextExpanded` (la función corregida en la iteración anterior para elegir el "mejor chunk"), el `keywordScore` del chunk seleccionado provenía ÚNICAMENTE de `rerankingService.js`, que a su vez lo calcula así:

```js
// rerankingService.js — kwDensity (línea ~153)
const kwPresent = keywordsNorm.filter(kw => textNorm.includes(kw)).length;
const kwDensity = keywordsNorm.length > 0 ? kwPresent / keywordsNorm.length : 0;
```

Donde `keywordsNorm` proviene del parámetro `keywords` pasado por `ragService.js`:

```js
// ragService.js processQuery (línea ~311)
const keywords = this._extractKeywords(spellCorrectedQuery);  // SOLO tokens literales de la query
...
const lexicalReranked = rerankingService.rerank(merged, spellCorrectedQuery, keywords, docPriority, foundAcronyms);
```

**Confirmado: se calcula EXCLUSIVAMENTE contra los tokens literales de la query original** (`spellCorrectedQuery` tokenizado), nunca contra `expanded_terms` (los sinónimos que `queryUnderstandingService.understand()` ya genera y que SÍ se usan para el canal BM25 de retrieval — `cleanKeywordQuery = expanded_terms.join(' ')` — pero NO para esta métrica de confianza posterior).

### 1.2 Corrección aplicada (acotada)

Se agregó un cálculo de densidad ADICIONAL, aplicado solo al `bestChunk` ya seleccionado (sin tocar el criterio de selección de `bestChunk` ni el `finalScore`/orden de reranking — blast radius limitado a la métrica de confianza reportada):

```js
// ragService.js — _buildContextExpanded, después de seleccionar bestChunk
const literalKeywordScore = bestChunk ? (bestChunk.keywordScore || 0) : 0;
const expandedKeywordScore = bestChunk
    ? this._computeKeywordDensity(bestChunk.payload?.texto_original, expandedTerms)
    : 0;
const bestKeywordScore = Math.max(literalKeywordScore, expandedKeywordScore);
```

```js
_computeKeywordDensity(text, tokens) {
    if (!tokens || tokens.length === 0 || !text) return 0;
    const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const textNorm = norm(text);
    const tokensNorm = tokens.map(norm).filter(t => t.length > 0);
    if (tokensNorm.length === 0) return 0;
    const present = tokensNorm.filter(t => textNorm.includes(t)).length;
    return present / tokensNorm.length;
}
```

Se pasa `expanded_terms` como nuevo parámetro a `_buildContextExpanded(reranked, query, keywords, expanded_terms)`. El resultado es siempre `Math.max(literal, expandido)` — **nunca puede bajar** el `keywordDensity` respecto al comportamiento anterior, solo puede subirlo cuando el chunk seleccionado matchea vía sinónimo en vez de token literal.

### 1.3 Validación — 21 preguntas + query original

Se comparó campo por campo contra el resultado inmediatamente anterior (post-fix del Confidence Engine, antes de este cambio):

| Query | Antes (solo fix posición-0) | Después (+ expanded_terms) | Diferencia |
|---|---|---|---|
| Que pasaria si llego embriagado a la empresa | 0.0000 | 0.0000 | 0 |
| Que pasa si llego borracho al trabajo | 0.2782 | 0.2782 | 0 |
| Me pueden despedir si llego tomado a la planta | 0.2088 | 0.2088 | 0 |
| **Tome unos tragos anoche, puedo ir a trabajar igual** | **0.2202** | **0.2470** | **+0.0268** ✅ |
| Es falta grave presentarse ebrio en la empresa | 0.4175 | 0.4175 | 0 |
| Mi jefe me maltrata y me humilla frente a mis companeros | 0.3317 | 0.3317 | 0 |
| Un companero me toco sin permiso, que hago | 0.2525 | 0.2525 | 0 |
| Como denuncio acoso laboral | 0.7243 | 0.7243 | 0 |
| Que es el comite de convivencia laboral | 0.7990 | 0.7990 | 0 |
| Me estan haciendo bullying en el trabajo | 0.2380 | 0.2380 | 0 |
| Me pueden despedir sin justa causa | 0.7470 | 0.7470 | 0 |
| Cuando me pueden echar del trabajo | 0.4547 | 0.4547 | 0 |
| Que pasa si falto 3 veces sin permiso | 0.2489 | 0.2489 | 0 |
| Puedo trabajar desde la casa | 0.4515 | 0.4515 | 0 |
| Que es el home office en Plastitec | 0.5503 | 0.5503 | 0 |
| Requisitos para trabajo remoto | 0.6167 | 0.6167 | 0 |
| Cada cuanto me dan la dotacion | 0.3950 | 0.3950 | 0 |
| Tengo derecho a botas y overol nuevos | 0.2300 | 0.2300 | 0 |
| Puedo hablar mal de la empresa en facebook | 0.2088 | 0.2088 | 0 |
| Me pueden revisar el whatsapp del trabajo | 0.4800 | 0.4800 | 0 |
| Estoy haciendo una pasantia, aplican las mismas reglas | 0.2542 | 0.2542 | 0 |

**Resultado: 1 de 21 preguntas mejoró (+0.027, ya pasaba el gate antes, sigue pasando, con una confianza más honesta), 20 de 21 sin cambio. 0 regresiones.**

**La query original ("embriagado") NO cruza el gate 0.20 ni con este fix.** Causa exacta verificada con el log real (`rag_1785789668096`): el `bestChunk` seleccionado (falta grave #14, `"40. Presentarse al trabajo bajo el efecto de alcohol..."`) tiene 0 coincidencias incluso contra `expanded_terms` (`["embriagado","embriaguez","estado de embriaguez","efectos del alcohol"]`), porque su texto real dice **"efecto de alcohol"** (singular) mientras el término expandido canónico es **"efectos del alcohol"** (plural, tomado de la redacción del Art. 81.2, no de esta falta grave específica) — no hay coincidencia de substring exacta entre ambas variantes. Se hizo el cálculo manual de cuánto subiría la confianza si se agregara "efecto de alcohol" como término adicional: `keywordDensity` pasaría de 0 a ~0.20 (1 de 5 términos), lo que da `confidence ≈ 0.1625` — **sigue por debajo de 0.20**. La razón de fondo es que el `finalScore` de este chunk está topeado en 0.25 por el DocBoost plano de `DOC_PRIORITY_MAP` (mismo hallazgo ya documentado en `seguimiento_confidence_engine.md` #1.4), no por falta de vocabulario. **No se agregó ese término adicional** para evitar seguir parcheando vocabulario puntual (whack-a-mole) sin resolver la causa real (el techo de 0.25 del score).

### 1.4 Chequeo de falsos positivos

Se probaron dos queries adicionales fuera de las 21 para verificar que el fix no infla confianza en queries irrelevantes:

- **Gibberish** ("xzq wblk ratm ple") → `confidence: 0`, `chunksUsed: 0` — sigue rechazando correctamente. `expanded_terms` vacío (sin match de vocabulario), sin cambio de comportamiento.
- **Fuera de dominio** ("¿Cuál es la capital de Francia?") → `confidence: 0.241`, **pasa el gate y el LLM alucina "París, según información generalmente conocida"** citando fuentes RIT/Conocimiento Plastitec de forma espuria.
  - **Se verificó que esto es un problema PREEXISTENTE, no causado por este fix**: el log (`rag_1785790025441`) muestra `expandedTerms: []` (vacío) — el match viene de que la palabra "Francia" aparece LITERALMENTE en el corpus (historial de exportaciones de Plastitec a "Brasil, Argentina, Chile,... Francia"), vía BM25 literal, con `keywordDensity` ya positivo ANTES de este fix. Como `expandedTerms` está vacío, `Math.max(literal, 0) = literal` — el fix no cambia nada aquí.
  - **Se reporta igualmente por transparencia** (el encargo pidió vigilar falsos positivos): existe un gap conocido y NO relacionado con esta sesión — el Confidence Engine no distingue coincidencias de nombres propios incidentales (ej. "Francia" mencionada de pasada en un historial corporativo) de relevancia temática real. Es un candidato a auditoría futura, fuera del alcance de este encargo.

**Conclusión 1.4: el fix de `expanded_terms` en `keywordDensity` es seguro (0 regresiones, 1 mejora real, sin evidencia de inflar falsos positivos nuevos) y se deja aplicado.**

---

## 2. Chunking del RIT — Art. 110 (despido) y Art. 89 (redes sociales)

Se consultó directamente Qdrant (`points/scroll`, filtrando por `fuente` y `chunk_index`) para inspeccionar los chunks reales alrededor de ambos artículos, byte por byte.

### 2.1 Configuración de chunking vigente

`services/ingestionService.js`:
```js
const CHUNK_SIZE    = 900;   // Chars por chunk
const CHUNK_OVERLAP = 150;   // Overlap entre chunks
const MIN_CHUNK_LEN = 60;    // Descartar chunks muy cortos
```
Chunker semántico basado en bloques (párrafos/listas/tablas), con overlap del último párrafo corto del chunk anterior. Preserva listas y tablas como unidades atómicas SI caben en el espacio restante del chunk actual; si no caben, cierra el chunk actual y empieza uno nuevo con el bloque completo.

### 2.2 Caso A — Art. 110/111 (terminación con justa causa): SÍ está partido, en 4 chunks

Se recuperaron los chunks 241-246 de `RIT_PLASTITEC_01_DE_JULIO_2026_VF.md`:

| chunk_index | Chars | Contenido |
|---|---|---|
| 241 | 889 | Atenuantes (Art. 108) + inicio "### ARTÍCULO 109." |
| **242** | 837 | Cierre Art. 109 + `## CAPÍTULO XXVI` + `### ARTÍCULO 110. Causales de terminación con justa causa.` + párrafo introductorio (**sin la lista numerada**) |
| **243** | 794 | Causales 1-8 de la lista del Art. 110 (**sin el título del artículo**) |
| **244** | 767 | Causal 8 (repetida por overlap) + causales 9-12 |
| **245** | 886 | Causales 13-14 + `### ARTÍCULO 111.` completo |
| 246 | 711 | Parágrafo del Art. 111 + `## CAPÍTULO XXVII` (trabajo en casa) |

**El Art. 110 está partido en 4 chunks (242-245)**: el TÍTULO del artículo y su intro están en 242, pero la lista de 14 causales (el contenido que realmente responde "¿cuándo me pueden despedir/echar?") está repartida entre 243, 244 y 245, sin el título "ARTÍCULO 110" en ninguno de esos tres.

**Causa raíz: es un problema de TAMAÑO DE CHUNK, no de topK/ranking.** El bloque completo del Art. 110 (título + intro + 14 causales) mide ~2400+ caracteres — más de 2.6× el `CHUNK_SIZE` de 900 — por lo que el chunker, al preservar la lista como unidad atómica pero no caber en un solo chunk, la reparte secuencialmente. Esto diluye la señal léxica: ninguna consulta sobre "por qué me pueden despedir" puede recuperar en un SOLO chunk tanto el título/número de artículo como el contenido sustantivo completo.

**Por qué "Me pueden despedir sin justa causa" SÍ funcionó (Art. 110 citado correctamente, confidence 0.747) pero "Cuando me pueden echar del trabajo" NO:** la primera query contiene literalmente la frase "justa causa", que hace match de FRASE EXACTA (canal `exactPhraseResults`, peso 0.20) directamente contra el chunk 242 (que tiene el título "Causales de terminación con **justa causa**"), dándole un score alto suficiente para entrar en top-6 pese a competir con chunks de jornada/domingo de score semántico crudo más alto. La segunda query usa "echar del trabajo" (coloquial); aunque la expansión de vocabulario SÍ agrega "terminación con justa causa" como término expandido (confirmado en logs), el chunk 242 no gana suficiente score adicional por esa vía porque el canal de frase exacta (`searchExactPhrase`) se ejecuta contra `spellCorrectedQuery` (la query original corregida), NO contra `expanded_query` — por lo que la ventaja de "frase exacta" que sí ayudó a la primera query nunca se activa para la segunda. El chunk 242 queda compitiendo solo por score semántico/BM25 puro contra chunks de "domingo"/"jornada" con score crudo más alto (0.76 vs. lo que sea que saque 242 para esta query), y pierde.

### 2.3 Caso B — Art. 89 (redes sociales): partido Y con el título "huérfano"

Se recuperaron los chunks 175-179:

| chunk_index | Chars | Contenido |
|---|---|---|
| 175 | 694 | `## CAPÍTULO XVIII` + Art. 87 completo (herramientas tecnológicas) + inicio Art. 88 |
| 176 | 825 | Cuerpo completo del Art. 88 (auditoría/monitoreo) + `## CAPÍTULO XIX` + **`### ARTÍCULO 89. REGULACIÓN DEL USO DE REDES SOCIALES.`** (solo el título, al final del chunk) |
| **177** | **186** | Solo 1 oración: *"El trabajador podrá usar redes sociales personales en su tiempo libre..."* |
| **178** | 941 | El cuerpo sustantivo completo del Art. 89 (la lista de contenidos que constituyen falta grave — incluye "reputación", "imagen corporativa", "red social") — **sin el título "ARTÍCULO 89" ni el número** |
| 179 | 682 | `## CAPÍTULO XX` (conflicto de intereses) |

**Este caso es más grave que el A: el título del Art. 89 queda "huérfano"** al final del chunk 176, que semánticamente está dominado por el contenido del Art. 88 (auditoría, monitoreo, WhatsApp corporativo — un tema relacionado pero distinto). Cualquier embedding/BM25 de ese chunk 176 va a puntuar alto para queries de "auditoría"/"monitoreo"/"whatsapp", no para "redes sociales"/"facebook". Mientras tanto, el chunk 178 —que sí tiene el contenido sustantivo relevante para "hablar mal de la empresa en redes sociales"— **no contiene el número de artículo en absoluto**.

**Consecuencia observada exactamente como predicho:** en las 3 corridas de prueba de `seguimiento_confidence_engine.md`, el LLM citó Art. 87 (2/3) y Art. 88 (1/3) — nunca Art. 89 — porque esos son los chunks que SÍ traen consigo un número de artículo reconocible, aunque el chunk 178 (con el contenido realmente relevante) probablemente también estuviera presente en el contexto ensamblado. El LLM no tiene forma de inventar el número correcto si el chunk con el contenido relevante no lo incluye.

**Causa raíz: combinación de tamaño de chunk (el chunk 177 de 186 caracteres es anormalmente corto — muy por debajo del target de 900 — sugiriendo que el chunker cerró el chunk apenas después del título+1 oración porque el siguiente bloque, la lista `(a)...(e)`, es más grande que el espacio restante) Y de un límite estructural del chunker: no hay ninguna regla que mantenga el título de un artículo pegado a TODO su contenido cuando el contenido excede el espacio remanente del chunk actual.**

### 2.4 Diagnóstico consolidado

| | Caso A (Art. 110) | Caso B (Art. 89) |
|---|---|---|
| ¿El chunk relevante existe completo en algún punto? | No — repartido en 3 chunks (243/244/245), ninguno con el título | No — título en 176 (dominado por Art. 88), cuerpo en 177+178 (sin título) |
| ¿Es un problema de tamaño de chunk? | **Sí** — el bloque total (~2400 chars) excede 2.6× el CHUNK_SIZE | **Sí** — chunk 177 de 186 chars sugiere corte prematuro antes de la lista larga |
| ¿Es también un problema de topK/ranking? | **Sí, adicionalmente** — el chunk 242 (con el título) no gana boost de frase exacta para queries coloquiales sin la frase literal "justa causa" | Parcialmente — aunque el contenido correcto (178) puede entrar al contexto, sin su número de artículo el LLM no puede citarlo correctamente |

**Ambos casos son primariamente un problema de CHUNKING** (el chunk_size de 900 caracteres es insuficiente para preservar artículos con listas largas como una unidad, y el chunker no garantiza que el título quede pegado al cuerpo cuando este excede el espacio restante). El componente de topK/ranking (Caso A) es secundario y agrava el problema para frases coloquiales, pero no es la causa raíz.

---

## 3. Opciones de fix propuestas (NO implementadas — solo diagnóstico, según encargo)

### Opción 1 — Subir `topK` de retrieval (más barata, sin re-ingesta)

Aumentar `topK` en `qdrantService.searchSimilar`/`searchKeyword` (actualmente 20/15) a, por ejemplo, 30-40.

- **Costo:** mínimo — un cambio de constante, sin re-ingesta, efecto inmediato.
- **Riesgo:** bajo — solo amplía el pool de candidatos ANTES del reranking; no puede empeorar resultados existentes (los candidatos actuales siguen presentes), pero tampoco garantiza que el chunk relevante entre al top-6 FINAL si su score post-boost sigue siendo bajo frente a competidores (no resuelve el Caso B, donde el problema es de contenido fragmentado, no de candidatos insuficientes).
- **Cuándo ayuda:** solo si el chunk relevante existe en el pool pero se corta antes del top-K actual (más probable en el Caso A que en el B).
- **Recomendación:** probar primero por ser el cambio de menor riesgo, aunque se espera que NO resuelva completamente ninguno de los 2 casos por sí solo.

### Opción 2 — Chunking header-aware + re-ingesta selectiva del RIT (fix más correcto, mayor costo)

Modificar `ingestionService.js` para que un bloque que matchee el patrón de encabezado de artículo (`### ARTÍCULO N.` o similar) **nunca quede como último elemento de un chunk** — forzar que el chunk se extienda (excediendo `CHUNK_SIZE` si es necesario) hasta incluir al menos el primer párrafo/bloque sustantivo siguiente, o alternativamente, iniciar SIEMPRE un chunk nuevo en cada encabezado de artículo (chunking por artículo en vez de por tamaño fijo, con un tamaño máximo más generoso solo para listas largas).

- **Costo:** moderado — cambio de lógica en `_agruparBloquesEnChunks` (o el método equivalente) + re-ingesta completa o selectiva. Dado que el RIT es el documento más grande y con más artículos numerados, se puede acotar la re-ingesta a solo ese archivo (`rebuild_rag.js` soporta reprocesar un doc específico, a confirmar) en vez de las 890 unidades completas — más barato que un rebuild total.
- **Riesgo:** medio — cambia los límites de chunk de TODO el RIT (no solo Art. 89/110), lo que requiere volver a correr el benchmark completo de 21+ preguntas (y idealmente el benchmark de 100 preguntas ya existente en el proyecto, `run_100_benchmark.cjs`) para descartar regresiones en las docenas de queries que hoy funcionan bien con el chunking actual. Este es exactamente el tipo de cambio que el proyecto ya trató con cautela en sprints anteriores (notas de memoria: "D6 chunking" listado como palanca de software pendiente).
- **Cuándo ayuda:** resuelve la causa raíz de fondo para AMBOS casos y para cualquier otro artículo largo del RIT con el mismo patrón (probablemente hay más, no auditados en esta sesión).

### Opción 3 — Ampliar ventana de neighbor retrieval + detección de encabezado huérfano (barata, sin re-ingesta, mitigación parcial)

En `ragService.js` → `_buildContextExpanded`, la lógica de "Section Reconstruction" ya existe (detecta si un chunk crítico PARECE un título corto y trae los siguientes 3 chunks) pero solo mira hacia ADELANTE (`idx + r`) y solo se activa si el chunk crítico ES el título. No cubre el caso inverso: un chunk crítico que es el CUERPO (ej. chunk 178) cuyo título vive en el chunk ANTERIOR-ANTERIOR (176, no 177). Se podría ampliar la ventana de vecinos de ±1 a ±2 o ±3 específicamente cuando se detecte que ninguno de los chunks ya traídos contiene un patrón `ARTÍCULO \d+` reconocible.

- **Costo:** bajo — cambio acotado a `_buildContextExpanded`, sin re-ingesta, testeable de inmediato contra el pipeline vivo.
- **Riesgo:** bajo-medio — amplía el contexto ensamblado (más tokens al LLM, más `MAX_CONTEXT_CHARS` consumido), lo que podría desplazar otros chunks de soporte fuera del presupuesto de caracteres en queries con muchas fuentes distintas. Requiere validar que no empeore la latencia/calidad en queries que hoy ya funcionan bien.
- **Cuándo ayuda:** mitiga el Caso B (título huérfano) con un fix quirúrgico; ayuda parcialmente al Caso A si el chunk 242 llega a ser "crítico" en algún momento (haría que 243/244/245 se traigan como vecinos, ya cubierto por el neighbor retrieval hacia adelante existente — este caso YA debería beneficiarse del código actual SI 242 entra como crítico, lo cual no ocurre hoy porque 242 no gana suficiente score para consultas coloquiales, ver 2.2).

**Recomendación de secuencia, sin implementar nada todavía:** probar Opción 1 primero (más barata, descarta si el problema es solo de topK), luego Opción 3 (mitigación dirigida sin re-ingesta) para el caso de título huérfano, y reservar la Opción 2 (re-chunking) para una sesión dedicada con el benchmark completo de 100 preguntas como red de seguridad, dado su mayor costo y alcance sobre todo el corpus.

---

## Resumen ejecutivo

1. **keywordDensity vs. expanded_terms: corregido, validado, sin regresiones** (1/21 mejoró, 20/21 sin cambio). La query original "embriagado" sigue sin cruzar el gate por una causa matemáticamente distinta y ya cuantificada (techo de 0.25 en finalScore + variante de redacción "efecto" vs. "efectos" que no coincide ni con el vocabulario expandido actual) — no se parcheó más para evitar whack-a-mole sin abordar la causa de fondo.
2. **Se encontró y reportó, por transparencia, un false-positive PREEXISTENTE no relacionado con este fix** (alucinación en pregunta fuera de dominio "capital de Francia" por coincidencia literal de nombre propio en el corpus) — queda documentado como hallazgo aparte, no se tocó.
3. **Los 2 casos de citación incorrecta SÍ son problemas de chunking**, confirmados con evidencia byte-a-byte de los chunks reales en Qdrant: el Art. 110 está partido en 4 chunks sin que ninguno tenga título+contenido completo; el Art. 89 tiene su título huérfano en un chunk dominado por el Art. 88, con su cuerpo relevante en chunks separados sin numeración. Se proponen 3 opciones de fix (topK, re-chunking header-aware, ventana de vecinos ampliada) con costo/riesgo diferenciado, sin implementar ninguna todavía — decisión pendiente para el usuario sobre cuál priorizar.
