# Seguimiento — Bug del Confidence Engine y Gaps de Citación del LLM 3B

**Generado:** 2026-08-03
**Contexto:** Continuación de `auditoria_vocabulario_completa.md`, que dejó 2 problemas abiertos: (1) el Confidence Engine parecía evaluar solo el chunk en posición 0 tras la fusión, causando un Fast Reject injusto en la query original del diagnóstico; (2) 3 preguntas donde el LLM citaba el artículo equivocado del RIT teniendo (aparentemente) el correcto en el contexto.

**Entorno de prueba:** mismo Qdrant (890 puntos) + Express + Ollama levantados en la sesión anterior, reutilizados sin detener. Todo se validó en vivo contra `POST /api/query`, no se simuló nada.

---

## 1. Bug del Confidence Engine — CONFIRMADO y CORREGIDO

### 1.1 Localización exacta

`services/ragService.js`, método `_buildContextExpanded` (recibe `results` = el array `reranked` completo, hasta ~20+ candidatos tras fusión + reranking léxico):

```js
// CÓDIGO ANTERIOR (con bug):
const topScore = results.length > 0 ? results[0].finalScore : 0;
...
return {
    ...
    rawConfidence: topScore,   // ← SIEMPRE posición 0, nunca el máximo real
    ...
};
```

Y en `processQuery`, dos métricas adicionales del Confidence Engine también leían ciegamente `reranked[0]`:

```js
// CÓDIGO ANTERIOR (con bug):
const { confidence, querySpecificityTokens } = retrievalConfidence.calculateConfidence({
    similarity: rawConfidence,
    keywordDensity: reranked.length > 0 ? (reranked[0].keywordScore || 0) : 0,        // ← posición 0
    hasPhraseMatch: exactPhraseResults.length > 0,
    hasAcronymMatch: foundAcronyms.length > 0,
    hasSectionRelevance: reranked.length > 0 ? (reranked[0].boostReason?.includes('section') || false) : false, // ← posición 0 Y bug de casing
    query,
});
```

**Confirmado: el engine SÍ evaluaba únicamente el chunk en posición 0 tras la fusión/reranking**, no el de mayor score real entre los chunks que efectivamente entraron al contexto (`criticalChunks` + `supportChunks`, hasta 6 chunks). Esto es exactamente lo que documentó `diagnostico_rag.md`/`auditoria_vocabulario_completa.md`: cuando `DOC_PRIORITY_MAP` aplica un boost plano a todo un documento, varios chunks pueden empatar en `finalScore`, y el chunk realmente relevante puede terminar en cualquier posición del empate — pero el Confidence Engine solo miraba la posición 0, que en el caso de "Qué pasaría si llego embriagado a la empresa" resultaba ser un chunk genérico irrelevante ("La Empresa, de acuerdo con sus necesidades operativas...").

**Bug adicional encontrado como bonus (no reportado antes):** `hasSectionRelevance` comparaba `boostReason?.includes('section')` en minúscula, pero el valor real que asigna `rerankingService.js:190` es `` `Section` `` (con S mayúscula). Por ser `String.includes()` sensible a mayúsculas, **esta señal era `false` SIEMPRE, en el 100% de las queries**, independientemente de la posición. Se corrigió de paso.

### 1.2 Corrección aplicada

En `_buildContextExpanded`, después de construir `criticalChunks` + `supportChunks` (los chunks que REALMENTE entran al contexto ensamblado):

```js
// CÓDIGO NUEVO:
const channelCount = (c) => (c.searchType || '').split('+').filter(Boolean).length;
const usedChunks = criticalChunks.concat(supportChunks);
const bestChunk = usedChunks.reduce((best, c) => {
    if (!best) return c;
    const bestScore = best.finalScore ?? 0;
    const cScore    = c.finalScore ?? 0;
    if (cScore > bestScore) return c;
    if (cScore === bestScore) {
        const bestKw = best.keywordScore || 0;
        const cKw    = c.keywordScore || 0;
        if (cKw > bestKw) return c;
        if (cKw === bestKw && channelCount(c) > channelCount(best)) return c;
    }
    return best;
}, null);

return {
    ...
    rawConfidence: bestChunk ? (bestChunk.finalScore ?? 0) : 0,
    bestKeywordScore: bestChunk ? (bestChunk.keywordScore || 0) : 0,
    bestHasSectionRelevance: bestChunk ? (bestChunk.boostReason?.includes('Section') || false) : false,
    ...
};
```

Criterio de selección: **mayor `finalScore`** → desempate por **mayor `keywordScore`** → segundo desempate por **mayor número de canales de búsqueda corroborantes** (`searchType`, ej. `"bm25+expanded_semantic"` = 2 canales vs `"semantic"` = 1 canal). Este último desempate se agregó tras el primer test empírico (ver 1.4) porque en el caso "embriagado" `finalScore` y `keywordScore` estaban empatados en TODOS los candidatos, y solo `searchType` distinguía al chunk realmente recuperado por señal léxica real.

En `processQuery`, se reemplazó `reranked[0].keywordScore` y `reranked[0].boostReason` por los valores del `bestChunk` devueltos por `_buildContextExpanded`:

```js
const { confidence, querySpecificityTokens } = retrievalConfidence.calculateConfidence({
    similarity: rawConfidence,
    keywordDensity: bestKeywordScore || 0,
    hasPhraseMatch: exactPhraseResults.length > 0,
    hasAcronymMatch: foundAcronyms.length > 0,
    hasSectionRelevance: bestHasSectionRelevance || false,
    query,
});
```

### 1.3 Validación completa — 21 preguntas, comparación antes/después

Se guardó el resultado exacto de las 21 preguntas ANTES del fix (`validation_results_BEFORE_confidence_fix.json`, igual a los resultados ya reportados en `auditoria_vocabulario_completa.md`) y se comparó campo por campo contra el resultado DESPUÉS del fix:

| Query | Confidence antes | Confidence después | Diferencia |
|---|---|---|---|
| Que pasaria si llego embriagado a la empresa | 0.000 | 0.000 | 0 |
| Que pasa si llego borracho al trabajo | 0.278 | 0.278 | 0 |
| Me pueden despedir si llego tomado a la planta | 0.209 | 0.209 | 0 |
| Tome unos tragos anoche, puedo ir a trabajar igual | 0.220 | 0.220 | 0 |
| Es falta grave presentarse ebrio en la empresa | 0.418 | 0.418 | 0 |
| Mi jefe me maltrata y me humilla frente a mis companeros | 0.332 | 0.332 | 0 |
| Un companero me toco sin permiso, que hago | 0.252 | 0.252 | 0 |
| Como denuncio acoso laboral | 0.724 | 0.724 | 0 |
| Que es el comite de convivencia laboral | 0.799 | 0.799 | 0 |
| Me estan haciendo bullying en el trabajo | 0.238 | 0.238 | 0 |
| Me pueden despedir sin justa causa | 0.747 | 0.747 | 0 |
| Cuando me pueden echar del trabajo | 0.455 | 0.455 | 0 |
| Que pasa si falto 3 veces sin permiso | 0.249 | 0.249 | 0 |
| Puedo trabajar desde la casa | 0.452 | 0.452 | 0 |
| Que es el home office en Plastitec | 0.550 | 0.550 | 0 |
| Requisitos para trabajo remoto | 0.617 | 0.617 | 0 |
| Cada cuanto me dan la dotacion | 0.395 | 0.395 | 0 |
| Tengo derecho a botas y overol nuevos | 0.230 | 0.230 | 0 |
| Puedo hablar mal de la empresa en facebook | 0.209 | 0.209 | 0 |
| Me pueden revisar el whatsapp del trabajo | 0.480 | 0.480 | 0 |
| Estoy haciendo una pasantia, aplican las mismas reglas | 0.254 | 0.254 | 0 |

**Diff = 0 en las 21 preguntas. Sin regresiones.** `chunksUsed` tampoco cambió en ninguna.

**¿Por qué el fix no cambió ningún número si el bug era real?** Porque en 20 de las 21 queries, el chunk en posición 0 YA era el de mayor `finalScore` real (no había empate, o el empate no afectaba el resultado). El bug solo se manifiesta cuando (a) hay empate de `finalScore` entre varios chunks del mismo documento boosteado por `DOC_PRIORITY_MAP`, Y (b) el chunk relevante no cae en posición 0 dentro de ese empate. Esto es poco frecuente pero real y determinístico — el fix es correcto y necesario para esos casos, aunque no se manifieste en la mayoría de las 21 preguntas de prueba.

### 1.4 Por qué la query original ("embriagado") SIGUE fallando — segunda causa raíz encontrada

Se probó específicamente la query original tras el fix (2 iteraciones, incluyendo el desempate por `channelCount`) y **sigue devolviendo `confidence: 0`, `chunksUsed: 0`**. Se investigó por qué con el log real (`rag_1785788938169`):

- Los 6 chunks que entran al contexto están TODOS empatados en `finalScore: 0.2500` (por el DocBoost plano de la regla #11 de alcohol, que boostea el documento RIT entero).
- El chunk correcto ("40. Presentarse al trabajo bajo el efecto de alcohol...") SÍ tiene más canales corroborantes (`searchType: "bm25+expanded_semantic"`, 2 canales) que el chunk irrelevante en posición 0 (`searchType: "semantic"`, 1 canal) — mi desempate por `channelCount` SÍ lo selecciona correctamente como `bestChunk`.
- **Pero su `keywordScore` es 0 — igual que el del chunk irrelevante.** Causa: `keywordScore` (`kwDensity` en `rerankingService.js`) se calcula contra los tokens LITERALES de la query (`keywords = this._extractKeywords(spellCorrectedQuery)` = `["pasaria","llego","embriagado"]`), NO contra `expanded_terms` (`embriaguez`, `alcohol`, `efectos del alcohol`). El texto del chunk 40 contiene "alcohol"/"drogas"/"sustancias psicoactivas" pero **no contiene literalmente la palabra "embriagado"** — por lo tanto `kwDensity = 0` para ESE chunk también, exactamente igual que para el chunk irrelevante.
- Como `finalScore` y `keywordScore` del `bestChunk` resultan idénticos a los del chunk en posición 0 (0.25 y 0 respectivamente), y ninguno de esos dos valores —los únicos que alimentan la fórmula de `calculateConfidence`— cambia, **el `confidence_score` final es matemáticamente idéntico (0.0563) sin importar cuál de los 6 chunks empatados se elija como "mejor".**

**Esto es un bug DISTINTO al de posición-0**, descubierto como efecto colateral de esta investigación: **`keywordDensity` no reconoce coincidencias vía sinónimos expandidos** (`expanded_terms`), solo coincidencias literales de la query original. El retrieval SÍ usa `expanded_terms` para el canal BM25 (`cleanKeywordQuery`), pero el Confidence Engine, aguas abajo, vuelve a medir densidad de palabras clave usando SOLO los tokens originales — una desconexión entre lo que realmente recuperó el chunk y lo que el Confidence Engine "ve" como evidencia.

**No se implementó un fix para esto en esta sesión** — está fuera del alcance de "posición 0 vs. score máximo" que se pidió corregir, y una corrección apresurada (ej. hacer que `keywordDensity` cuente también `expanded_terms`) tiene mayor riesgo de regresión sobre las 21 preguntas ya validadas sin una batería de pruebas más amplia. Se documenta como hallazgo de seguimiento (ver conclusiones).

**Conclusión de la Parte 1:** el fix solicitado (usar el score máximo entre los chunks que entraron al contexto, no ciegamente la posición 0) se implementó correctamente, se validó sin regresiones en 21/21 preguntas, y corrige el bug tal como fue diagnosticado. La query "embriagado" en particular no se arregla con ESTE fix porque su causa raíz real es una segunda desconexión (keywordDensity vs. términos expandidos) que no formaba parte del bug reportado originalmente — se recomienda como ítem de seguimiento, no se fuerza un parche adicional no solicitado.

---

## 2. Gaps de citación del LLM 3B — investigados

### 2.1 Contexto y respuesta exactos (antes del ajuste de prompt)

**Caso A — "Cuando me pueden echar del trabajo"** (cita Art. 38 en vez de Art. 110):

- `confidence: 0.455`, `chunksUsed: 6`, fuente única: RIT.
- Contexto real recibido por el LLM (primeros chunks): *"Cuando se tratare de trabajos habituales o permanentes en domingo..."*, *"a) El empleador y el trabajador pueden acordar temporal o indefinidamente..."*, *"e) Ejecutar los trabajos que le confíen con honradez, buena voluntad..."* — **el Art. 110 (causales de terminación con justa causa) NO aparece en ninguno de los 6 chunks del contexto ensamblado.**
- Respuesta: *"Según el artículo 38 de la Ley 50 de 1990, PLASTITEC está obligada a pagar al trabajador en caso de suspensión del trabajo por motivo no determinado en la Ley 51 del 22 de diciembre de 1983..."*
- **Diagnóstico correcto: esto NO es un problema de citación del LLM — es un problema de RETRIEVAL.** El artículo correcto nunca llegó al contexto. La query expandió correctamente a "terminación con justa causa" (confirmado en logs: `expandedTerms: ["echar del trabajo","terminación con justa causa","despido"]`), y el DOC_PRIORITY_MAP boostea el RIT completo, pero el chunk específico del Art. 110 no superó en score a chunks genéricos de jornada/domingo que tenían mayor score semántico crudo. El LLM respondió honestamente con lo que tenía — el contenido real simplemente no estaba disponible.

**Caso B — "Puedo hablar mal de la empresa en facebook"** (cita Art. 88/87 en vez de Art. 89):

- `confidence: 0.209`, `chunksUsed: 4`.
- Contexto real: incluye Art. 87 (herramientas tecnológicas) y Art. 88 (auditoría/confidencialidad), pero el contexto se corta (límite `MAX_CONTEXT_CHARS`/selección de chunks) **antes de incluir el texto completo del Art. 89 (regulación del uso de redes sociales)**, que es el artículo que específicamente prohíbe "comentarios... que afecten la reputación... de PLASTITEC" en redes sociales.
- Respuesta (3 corridas): cita Art. 88 una vez, Art. 87 dos veces — nunca Art. 89.
- **Diagnóstico: también es mayormente un gap de contexto/retrieval**, no solo de citación — el artículo más preciso no estaba completo en el contexto ensamblado, aunque el tema (tecnología/confidencialidad) sí estaba parcialmente presente. La CONCLUSIÓN de la respuesta ("no está permitido") es correcta en las 3 corridas — el gap es de precisión de la cita, no de la sustancia.

**Caso C — "Estoy haciendo una pasantía, ¿aplican las mismas reglas?"** (respuesta vaga/rechazo):

- `confidence: 0.254`, `chunksUsed: 6`.
- Contexto real: chunks del RIT sobre contrato de aprendizaje y modalidades de práctica universitaria (Art. 10-18) — el contenido SÍ está relacionado, pero no hay una frase única que diga explícitamente "las mismas obligaciones generales aplican a los practicantes".
- Respuesta (antes del ajuste): *"No encontré información sobre las reglas específicas de pasantía"* (rechazo, en 2 de 2 corridas observadas).

### 2.2 Ajuste de prompt probado

Se agregó al prompt Tri-Estado CoT XML (`services/llmService.js`, sección `xmlPrompt`) un bloque nuevo — **GROUNDING DE CITAS DE ARTÍCULOS** — instruyendo explícitamente:
1. Verificar que el texto del artículo citado contenga literalmente la respuesta.
2. Priorizar, entre varios artículos del contexto, el que trate el TEMA EXACTO de la pregunta.
3. Nunca citar un artículo solo por aparecer primero en el contexto.
4. Si ningún artículo trata el tema exacto, responder con la información general disponible SIN inventar un número de artículo.

Se probó cada uno de los 3 casos **3 veces** (para controlar por la estocasticidad conocida del modelo 3B, documentada en notas previas del proyecto) contra el pipeline real ya corregido (Parte 1).

### 2.3 Resultado del ajuste de prompt

| Caso | Antes | Después (3 corridas) | ¿Se resolvió? |
|---|---|---|---|
| A — "Cuando me pueden echar del trabajo" | Cita Art. 38 (incorrecto) | Cita Art. 38 en las 3/3 corridas (incorrecto, idéntico patrón) | ❌ **NO** — confirma que es un gap de retrieval, no de prompt |
| B — "Puedo hablar mal de la empresa en facebook" | Cita Art. 88 (impreciso) | Cita Art. 88 (1/3) y Art. 87 (2/3) — nunca Art. 89 | ❌ **NO** — mismo gap de contexto, el prompt no puede citar lo que no está presente |
| C — "Estoy haciendo una pasantía..." | Rechazo/vago ("No encontré información") | Respuesta sustancial y consistente en 3/3 corridas, citando el marco legal de aprendices (Leyes 30/1992 y 115/1994) | ✅ **Mejoró** — ya no rechaza, aunque tampoco da la afirmación explícita "sí, las mismas reglas generales aplican" |

**El ajuste de prompt NO resolvió los casos A y B — confirmado, como pide el encargo, que no se debe forzar más parches sobre esto.** La razón, verificada con evidencia de contexto real: en ambos casos el artículo correcto (110 y 89 respectivamente) **no estaba disponible o no estaba completo en el `contextText` que recibió el LLM** — ninguna instrucción de prompt puede hacer que el modelo cite un texto que no tiene enfrente. Esto es, en última instancia, **un gap de retrieval/ensamblaje de contexto** (candidato a una futura Parte B/D de auditoría: por qué el Art. 110 no supera en score a los chunks de "domingo"/"jornada" para la frase "echar del trabajo", y por qué el Art. 89 se trunca antes de aparecer completo), no una limitación de citación del modelo 3B como se había hipotizado inicialmente en `auditoria_vocabulario_completa.md`. **Se corrige esa hipótesis previa**: no es (solo) inestabilidad de `llama3.2:3b` en citar — es que el contenido correcto no siempre llega íntegro al contexto.

**El ajuste SÍ mejoró el caso C** (de rechazo/vago a respuesta sustancial y estable en 3/3 corridas) sin causar regresión en las consultas ya correctas — se verificó explícitamente que "Me pueden despedir sin justa causa" (Art. 110 ✅), "Me pueden revisar el whatsapp del trabajo" (Art. 89 ✅) y "Qué es el comité de convivencia laboral" siguen respondiendo correctamente tras el cambio de prompt.

**Decisión recomendada, no forzada:** se deja el ajuste de prompt aplicado (es una mejora neta, sin regresión detectada), pero **no se intentó ningún parche adicional para los casos A y B** porque la causa real (retrieval, no citación) está fuera del alcance de "ajustar el prompt sin cambiar de modelo" que se pidió probar primero. Queda como decisión pendiente para el usuario evaluar:
- Investigar por qué el Art. 110 no gana suficiente score para "echar del trabajo" pese a la expansión de vocabulario ya aplicada (posible ajuste fino de `DOC_PRIORITY_MAP` o de los pesos de fusión).
- Revisar el límite `MAX_CONTEXT_CHARS`/la lógica de selección de chunks que trunca antes de llegar al Art. 89 en el caso de redes sociales.
- Evaluar `llama3.2:8b` u otro modelo **solo si** lo anterior no es suficiente — dado que las notas de bake-off previas del proyecto ya descartaron modelos de 7-8B por exceder el presupuesto de latencia (>30s en este hardware), esto tendría implicaciones de infraestructura, no solo de calidad.

---

## Resumen ejecutivo

1. **Bug del Confidence Engine: confirmado y corregido.** El engine leía ciegamente `reranked[0]` para similarity/keywordDensity/hasSectionRelevance. Se corrigió para usar el chunk de mayor score real entre los que efectivamente entran al contexto (con desempate por keywordScore y luego por canales de búsqueda corroborantes). **0 regresiones en 21/21 preguntas.** Bonus: se corrigió también un bug de casing (`'section'` vs `'Section'`) que hacía que `hasSectionRelevance` fuera siempre `false`.
2. **La query original ("embriagado") sigue fallando** — pero ahora con una causa raíz precisa y distinta: `keywordDensity` no reconoce coincidencias vía sinónimos expandidos, solo tokens literales de la query. Es un bug real, documentado, fuera del alcance de este encargo puntual.
3. **Los 3 gaps de citación NO se resolvieron con ajuste de prompt** — se investigó y se determinó que 2 de 3 son en realidad gaps de retrieval (el artículo correcto no llega, o no llega completo, al contexto), no inestabilidad de citación del modelo 3B como se pensaba. El tercer caso (pasantía) sí mejoró con el ajuste de prompt, sin regresiones. No se recomienda evaluar cambio de modelo todavía — el problema real está antes, en retrieval/ensamblaje de contexto.
