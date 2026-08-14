# Diagnóstico RAG — Dominio "Embriaguez / Alcohol / Sustancias Psicoactivas"

**Generado:** 2026-08-03
**Motivo:** El asistente responde "No encontré información sobre este tema en la documentación disponible" ante consultas sobre presentarse a trabajar bajo efectos del alcohol, a pesar de que el RIT, el I-RH-004 y el I-RH-017 SÍ contienen esta política. Este documento consolida evidencia de código, contenido documental y logs reales para diagnosticar la causa raíz.

> Nota de fuentes: no existe un archivo llamado `project_context_claude.md` en el repo (`c:\AIV2`). El documento de contexto de proyecto equivalente es [`docs/PROJECT_CONTEXT.md`](docs/PROJECT_CONTEXT.md); se copia íntegro en la sección 1. Tampoco existe una carpeta de "analytics" separada de logs — se usó `logs/*.jsonl`.

---

## 1. Copia íntegra de `docs/PROJECT_CONTEXT.md`

```markdown
# Contexto del Proyecto: Plastitec AI

## 1. Visión General
**Plastitec AI** es un asistente conversacional basado en la arquitectura RAG (Retrieval-Augmented Generation) diseñado para la empresa PLASTITEC. Su propósito es brindar respuestas precisas a los empleados sobre políticas, Reglamentos Internos de Trabajo (RIT), procesos de manufactura (BPMM), inducción de SST y temas éticos (SAGRILAFT).

### Comparación frente a NotebookLM
A diferencia de *Google NotebookLM* que actúa como un entorno cerrado de investigación personal donde el usuario sube documentos bajo demanda, Plastitec AI es un sistema **Enterprise RAG**:
- Centraliza la Base de Conocimiento oficial de la compañía.
- Opera en un entorno local (On-Premise) por privacidad de datos utilizando modelos abiertos (LLaMA 3.2, mxbai-embed-large).
- Incorpora *Confidence Engines* y *Reranking* heurístico que evitan activamente las alucinaciones y fuerzan respuestas negativas si no existe evidencia documental corporativa (Zero-Hallucination Policy).

---

## 2. Cronología de Evolución
- **Fase 1.0 a 1.2:** Creación de RAG base con Gemma y embeddings ligeros. Problemas de alucinación masiva y context loss.
- **Fase 1.3:** Migración a Ollama local con LLaMA 3.2. Implementación de Confidence Validator y Reranking simple.
- **Fase 2.1 a 2.3:** Benchmark semántico. Ajuste duro del umbral de confianza. Implementación de BM25 + Reciprocal Rank Fusion (RRF). Reducción de False Negatives.
- **Fase 2.4.2:** Optimización quirúrgica del Retrieval para los dominios problemáticos (Ética y SAGRILAFT) mediante parcheo de metadatos en Qdrant y expansión de vocabulario.
- **Fase 2.4.4A:** (Actual) Auditoría técnica, limpieza de deuda tecnológica y documentación integral de arquitectura.
- **Fase 2.4.5 (WIP):** Capa de Knowledge Extraction (generación de FAQs y procesos estructurados mediante LLM).

---

## 3. Arquitectura Actual (Fase 2.4.4A)

El sistema opera bajo un pipeline lineal y determinista.

### Pipeline Completo
\`\`\`mermaid
flowchart TD
    %% Ingestion
    A[PDF/Documento] --> B[OCR / pdfProcessor]
    B --> C[Chunking / ingestionService]
    C --> D[Embeddings mxbai]
    D --> E[(Qdrant: plastitec_docs)]

    %% Retrieval
    F[User Query] --> G[queryUnderstandingService]
    G --> H[ragService Híbrido]
    H --> E
    E -.-> I[Top K Chunks]
    I --> J[rerankingService + Heurísticas]

    %% Validation
    J --> K[retrievalConfidence]
    K --> L{Confidence > 0.40?}
    L -- No --> M[Respuesta Negativa Segura]

    %% Generation
    L -- Sí --> N[LLaMA 3.2 via llmService]
    N --> O[Respuesta al Usuario]
\`\`\`

---

## 4. Work In Progress (WIP) - Fase 2.4.5: Knowledge Extraction

Se está construyendo una capa paralela para superar las limitaciones del chunking de PDFs largos:

\`\`\`mermaid
flowchart TD
    %% WIP Ingestion
    A[PDF] --> B[knowledgeExtractionService]
    B --> C[ETICA_RAG.md, BPM_RAG.md...]
    C --> D[(Qdrant: knowledge_base)]

    %% WIP Retrieval
    F[User Query] --> G[ragService Búsqueda Dual]
    G --> D
    G --> E[(Qdrant: plastitec_docs)]
    D -.-> H[Fusión Inteligente]
    E -.-> H
    H --> I[LLaMA 3.2]
\`\`\`
*Nota: Estos componentes están en desarrollo y no actúan sobre el pipeline productivo actual.*

---

## 5. Descripción de Componentes

1. **`ingestionService.js`**: Divide los documentos PDF en fragmentos de texto (chunks) superpuestos.
2. **`pdfProcessor.js`**: Lee los bytes del PDF y utiliza OCR para digitalizar PDFs escaneados o imágenes embebidas.
3. **`ragService.js`**: Orquestador principal que consulta a Qdrant, enviando vectores densos y palabras clave.
4. **`queryUnderstandingService.js`**: Toma la frase del usuario y extrae la intención, expandiendo acrónimos (ej. COPASST) usando el `corporateVocabulary.json`.
5. **`rerankingService.js`**: Toma los chunks retornados por Qdrant y les asigna un nuevo peso combinando métricas densas, BM25 y multiplicadores si pertenecen al mismo dominio de la query.
6. **`retrievalConfidence.js`**: Mide qué tan relevante es el contexto encontrado evaluando densidad de keywords y similitud de coseno.
7. **`llmService.js`**: Capa agnóstica de conexión con Ollama. Implementa modo estricto, resúmenes, reintentos y prevención de timeouts.
8. **`answerJudge.js`**: (Uso en Benchmarks) LLM como juez para calificar las respuestas según Grounding, Hallucination y Correctitud semántica.
```

**Discrepancia detectada:** el diagrama del pipeline (paso 3) dice `Confidence > 0.40?`, pero el código real en `ragService.js` corta en `safeConfidence < 0.20` (ver sección 3 y 4). El documento de contexto está desactualizado respecto al umbral real vigente.

---

## 2. Contenido de la base de conocimiento sobre alcohol / embriaguez / sustancias psicoactivas

Búsqueda literal (`grep -i "embriag|alcohol|licor|sustancias psicoact"`) sobre los `.md` en `docs/` (fuente de los chunks indexados en Qdrant, colección `plastitec_docs`).

### `RIT_PLASTITEC_01_DE_JULIO_2026_VF.md`

**ARTÍCULO 81 — Se prohíbe a los trabajadores** (numeral 2):
> "2. Presentarse al trabajo en estado de embriaguez, bajo los efectos del alcohol, o bajo la influencia de narcóticos o de drogas enervantes."

**Listado de faltas graves — numeral 14:**
> "14. Ingesta de Alcohol o Drogas en el Trabajo: Presentarse al trabajo bajo los efectos de alcohol, drogas o cualquier sustancia psicoactiva que pueda comprometer la seguridad propia o de los demás."

**Listado de faltas graves — numeral 40:**
> "40. Presentarse al trabajo bajo el efecto de alcohol, drogas, sustancias psicoactivas o cualquier elemento que altere su estado de conciencia, poniendo en riesgo su seguridad y la de sus compañeros."

### `I-RH-004_Induccion_SST.md`

**Sección "Política Alcohol, Tabaco y Sustancias Psicoactivas":**
> "Plásticos Técnicos — Plastitec reconoce que el alcoholismo y la drogadicción representan un problema laboral y un riesgo para las actividades de la Compañía. Por tal razón y como parte de su permanente compromiso de proteger la salud y la seguridad de sus empleados y contratistas, define directrices que el empleado deberá atender y respetar en todo momento."

*(Nota: el título de la sección menciona la política, pero el cuerpo textual indexado es genérico — no enumera aquí las "directrices" concretas ni consecuencias; el detalle procedimental vive en el RIT, arts. 81/faltas graves arriba citados.)*

### `I-RH-017_CODIGO_DE_ETICA_Plastitec.md`

**Sección "10. Consumo de Alcohol, Tabaco y Sustancias Psicoactivas":**
> "Plastitec prohíbe, desde su Política de Consumo de Alcohol, Tabaco y Sustancias Psicoactivas, que toda persona que ingrese a sus instalaciones se encuentre bajo efectos de alcohol o drogas, ya que representa un riesgo para sí mismo, para la seguridad de las demás personas y para la empresa. Entre las sustancias prohibidas se incluyen las drogas ilegales, las sustancias controladas o el uso indebido de medicamentos recetados."

### `I-RH-003-V18-BPM_Buenas_Practicas_Manufactura.md`

**Normas de higiene / comportamiento en planta:**
> "- No fumar.
> - No beber.
> - No presentarse al trabajo bajo los efectos del alcohol o sustancias sicoactivas."

**Conclusión de la sección 2:** el dato SÍ existe, repetido en 4 documentos distintos (RIT, SST, Ética, BPM) con vocabulario variado: "embriaguez", "alcohol", "drogas", "sustancia(s) psicoactiva(s)" / "sicoactivas" (nótese la inconsistencia ortográfica entre docs: BPM usa "sicoactivas" sin `p`, el RIT usa "psicoactiva"). Esto es relevante para la sección 3-4: ningún mecanismo de expansión de sinónimos cubre esta familia de términos.

---

## 3. Código del pipeline de retrieval

### 3.1 Servicio de Retrieval Híbrido (4 canales) — `ragService.js` + `qdrantService.js`

Orquestación de los 4 canales en `ragService.processQuery` (`services/ragService.js`):

```js
// ── ETAPA 3: Hybrid Retrieval V2 ──────────────────────────────
const startRetrieval = Date.now();
const topK = intentParams.topK || 20;

const cleanKeywordQuery = expanded_terms.length > 0 ? expanded_terms.join(' ') : keywords.join(' ');

const [semanticResults, expandedSemanticResults, keywordResults, exactPhraseResults] = await Promise.all([
    qdrantService.searchSimilar(originalQueryEmbedding, topK),      // Canal 1: Semántico (query normalizada)
    qdrantService.searchSimilar(expandedQueryEmbedding, topK),      // Canal 4: Semántico (query expandida)
    qdrantService.searchKeyword(cleanKeywordQuery, 15),             // Canal 2: BM25 / léxico
    qdrantService.searchExactPhrase(spellCorrectedQuery, 10),       // Canal 3: Frase exacta
]);

metrics.retrieval_ms = Date.now() - startRetrieval;

// ── ETAPA 4: Weighted Fusion Reranking ────────────────────────
// Semantic = 0.45, BM25 = 0.25, Exact Phrase = 0.20, Expanded Query = 0.10
const merged = this._weightedFusion(
    semanticResults, 0.45,
    keywordResults, 0.25,
    exactPhraseResults, 0.20,
    expandedSemanticResults, 0.10
);
```

Fusión ponderada (`_weightedFusion`, mismo archivo):

```js
_weightedFusion(semantic, wSem, bm25, wBM25, exact, wExact, expanded, wExp) {
    const scores = new Map();

    const addResults = (results, weight, type) => {
        if (!results) return;
        results.forEach((res, rank) => {
            let itemScore = res.score || (1 / (rank + 1));
            if (itemScore > 1) itemScore = 1;

            const weightedScore = itemScore * weight;
            if (scores.has(res.id)) {
                const entry   = scores.get(res.id);
                entry.score  += weightedScore;
                entry.types.push(type);
            } else {
                scores.set(res.id, { res, score: weightedScore, types: [type] });
            }
        });
    };

    addResults(semantic, wSem, 'semantic');
    addResults(bm25, wBM25, 'bm25');
    addResults(exact, wExact, 'exact_phrase');
    addResults(expanded, wExp, 'expanded_semantic');

    return Array.from(scores.values())
        .sort((a, b) => b.score - a.score)
        .map(item => ({
            ...item.res,
            fusionScore: item.score,
            searchType:  item.types.join('+'),
            finalScore:  item.score
        }));
}
```

Implementación de los 3 canales de bajo nivel en `services/qdrantService.js` (el 4º canal, "expanded", reutiliza `searchSimilar` con un embedding distinto):

```js
// Canal Semántico
async searchSimilar(vector, topK = 20, collectionOverride = null) {
    const collectionToUse = collectionOverride || this.collection;
    return await this._withRetry(async () => {
        const response = await fetch(
            `${this.url}/collections/${collectionToUse}/points/search`,
            {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vector,
                    limit:           topK,
                    with_payload:    true,
                    score_threshold: 0.25, // Subido de 0.10 para eliminar ruido
                }),
            }
        );
        if (!response.ok) throw new Error(await response.text());
        const result = await response.json();
        return result.result || [];
    }, 'searchSimilar');
}

// Canal BM25 / léxico (vía filtro full-text de Qdrant + TF manual)
async searchKeyword(query, topK = 15, collectionOverride = null) {
    const collectionToUse = collectionOverride || this.collection;
    if (!query || query.trim().length === 0) return [];

    const terms = this._tokenizeQuery(query);
    if (terms.length === 0) return [];

    return await this._withRetry(async () => {
        const response = await fetch(
            `${this.url}/collections/${collectionToUse}/points/scroll`,
            {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filter: {
                        should: terms.map(t => ({
                            key:   'texto_original',
                            match: { text: t },
                        })),
                    },
                    limit:        topK * 2,
                    with_payload: true,
                }),
            }
        );
        if (!response.ok) throw new Error(await response.text());
        const result = await response.json();
        const points = result.result?.points || [];

        const scored = points.map(p => {
            const textNorm = (p.payload?.texto_original || '').toLowerCase()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            let matchCount = 0;
            let termScore  = 0;
            for (const term of terms) {
                const termNorm = term.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                const occurrences = (textNorm.match(new RegExp(termNorm, 'g')) || []).length;
                if (occurrences > 0) {
                    matchCount++;
                    termScore += Math.log1p(occurrences);
                }
            }
            const coverage  = terms.length > 0 ? matchCount / terms.length : 0;
            const tfNorm    = Math.min(termScore / terms.length, 1.0);
            const finalScore = (coverage * 0.7) + (tfNorm * 0.3);
            return { id: p.id, score: finalScore, payload: p.payload };
        })
        .filter(r => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);

        return scored;
    }, 'searchKeyword');
}

// Canal Frase Exacta
async searchExactPhrase(phrase, topK = 15, collectionOverride = null) {
    const collectionToUse = collectionOverride || this.collection;
    if (!phrase || phrase.trim().length === 0) return [];
    const cleanPhrase = phrase.trim().toLowerCase();

    return await this._withRetry(async () => {
        const response = await fetch(
            `${this.url}/collections/${collectionToUse}/points/scroll`,
            {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filter: { must: [{ key: 'texto_original', match: { text: phrase } }] },
                    limit:  topK * 2,
                    with_payload: true,
                }),
            }
        );
        if (!response.ok) throw new Error(await response.text());
        const result = await response.json();
        const points = result.result?.points || [];

        const scored = points.map(p => {
            const textNorm = (p.payload?.texto_original || '').toLowerCase();
            let score = 0;
            if (textNorm.includes(cleanPhrase)) {
                score = 1.0;
            } else {
                const words = cleanPhrase.split(/\s+/);
                let matchCount = 0;
                for (const word of words) if (textNorm.includes(word)) matchCount++;
                score = (matchCount / words.length) * 0.5;
            }
            return { id: p.id, score, payload: p.payload };
        })
        .filter(r => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);

        return scored;
    }, 'searchExactPhrase');
}
```

**Hallazgo clave sobre `searchKeyword`/BM25:** el filtro `should` de Qdrant usa `match: { text: t }` con el índice full-text (`tokenizer: 'word'`), que hace *tokenización exacta* — no stemming ni fuzzy match. Si la query trae "embriagado" (participio) y el corpus solo contiene "embriaguez" (sustantivo), **no hay coincidencia de token** y el canal BM25 devuelve 0 resultados (confirmado en logs, sección 5).

### 3.2 Query Expansion / Sinónimos — `queryUnderstandingService.js`

```js
export const SPELL_VARIANTS = {
    // ── Accidentes / Seguridad ────────────────────────────────────────────
    'acidentes':           'accidentes',
    'acidente':            'accidente',
    // ... (ver diccionario completo abajo)
    'lisencia':            'licencia',
    'lisencias':           'licencias',
    'reglamentto':         'reglamento',
    'teletrabjo':          'teletrabajo',
    'homeoffice':          'teletrabajo',
    'dotacion':            'dotación',
    'vacasiones':          'vacaciones',
    'incapasidad':         'incapacidad',
    'eps':                 'EPS',
    'arl':                 'ARL',
    'nomina':              'nómina',
    'sueldo':              'salario',
    'reclammos':           'reclamos',
    'copast':              'COPASST',
    'copasst':             'COPASST',
    'copaset':             'COPASST',
};

understand(query) {
    if (!query || typeof query !== 'string') {
        return { expanded_query: query, expanded_terms: [], normalizedTerms: [] };
    }
    const { normalizedQuery, normalizedTerms } = this._normalizeSpelling(query.trim());
    const originalQuery = normalizedQuery;
    const lowerQuery    = originalQuery.toLowerCase();
    const words         = originalQuery.split(/\s+/);

    let expandedTermsSet = new Set();

    // Check acronyms (desde corporateVocabulary.json)
    for (const [acronym, expansions] of Object.entries(this.vocabulary.acronyms)) {
        const pattern = new RegExp(`\\b${acronym.replace(/[-]/g, '[\\-]')}\\b`, 'i');
        if (pattern.test(originalQuery)) {
            expandedTermsSet.add(acronym);
            expansions.forEach(exp => expandedTermsSet.add(exp));
        }
    }
    // Check terms (desde corporateVocabulary.json)
    for (const [term, expansions] of Object.entries(this.vocabulary.terms)) {
        if (lowerQuery.includes(term.toLowerCase())) {
            expandedTermsSet.add(term);
            expansions.forEach(exp => expandedTermsSet.add(exp));
        }
    }

    const expanded_terms = Array.from(expandedTermsSet);
    let expanded_query = originalQuery;
    if (expanded_terms.length > 0 && words.length <= 15) {
        const uniqueAdditions = expanded_terms.filter(t => !lowerQuery.includes(t.toLowerCase()));
        if (uniqueAdditions.length > 0) {
            expanded_query = `${originalQuery} ${uniqueAdditions.join(' ')}`;
        }
    }
    return { expanded_query, expanded_terms, normalizedTerms };
}
```

**Hallazgo clave:** ni `SPELL_VARIANTS` ni `config/corporateVocabulary.json` (`terms`/`acronyms`) contienen ninguna entrada para `embriag*`, `alcohol`, `licor`, `borrach*`, `ebrio`, `tomado`, `sustancia(s) psicoactiva(s)`. La query del usuario nunca se expande hacia el vocabulario canónico del RIT ("embriaguez", "efectos del alcohol"), así que el canal semántico expandido (`expandedSemanticResults`, peso 0.10) tampoco aporta señal nueva en este dominio.

### 3.3 Pipeline Tri-Estado CoT XML — `llmService.js` → `generateRAGResponse`

```js
async generateRAGResponse(question, context, session = null, retrievalConfidence = 0, sources = []) {
    this._log('info', 'Iniciando Pipeline Tri-Estado (CoT XML)', { questionLen: question.length });

    const xmlPrompt = `<|begin_of_text|><|start_header_id|>system<|end_header_id|>
Eres el motor de Inferencia Tri-Estado de Plastitec AI.
Tu tarea es leer el contexto, analizar la pregunta y decidir si existe información suficiente para responder.

REGLAS DE CLASIFICACIÓN:
- FULL_MATCH: Todas las entidades o condiciones solicitadas están en el contexto y responden a la pregunta.
- PARTIAL_MATCH: El sustantivo principal (ej. "teletrabajo") existe, pero falta un modificador o condición secundaria (ej. "comercial").
- NO_INFORMATION_FOUND: El SUSTANTIVO PRINCIPAL O TEMA CENTRAL (ej. "drones", "España", "SAP") no existe en absoluto en el contexto.
...
FORMATO DE RESPUESTA OBLIGATORIO:
<razonamiento>
- Entidades clave: [X, Y, Z]
- Hallazgos: [Qué encontraste y qué no]
</razonamiento>
<clasificacion>PARTIAL_MATCH</clasificacion>
<respuesta>
[Aquí tu respuesta final.]
</respuesta>
...
<|user|>
CONTEXTO DOCUMENTAL:
${context}

PREGUNTA DEL EMPLEADO:
"${question}"
<|end|>

<|assistant|>`;

    let finalResponseStr;
    try {
        finalResponseStr = await this.generateResponse(xmlPrompt, this.model, false);
    } catch (e) {
        finalResponseStr = "<clasificacion>NO_INFORMATION_FOUND</clasificacion>";
    }

    // Parser con 3 niveles de fallback: XML nativo → texto plano → cuerpo libre
    const VALID_CLASES = new Set(['FULL_MATCH', 'PARTIAL_MATCH', 'NO_INFORMATION_FOUND']);
    let clasificacion  = 'NO_INFORMATION_FOUND';
    let respuestaFinal = '';
    // ... extracción tolerante de <clasificacion>/<respuesta>, defensas anti-truncamiento
    // y limpieza de frases de "no encontré información" fabricadas (ver código completo
    // en services/llmService.js líneas 187-522).

    if (clasificacion === "NO_INFORMATION_FOUND") {
        return { jsonFacts: { error: "no_information_found" }, citations: "" };
    } else {
        const evidence = (sources || []).filter(Boolean).map(s => ({ source: s }));
        return {
            jsonFacts: { answer: respuestaFinal },
            citations: isRejection ? '' : citationBuilder.build(evidence, retrievalConfidence)
        };
    }
}
```

**Nota importante sobre la query de prueba "¿Qué pasaría si llego embriagado a la empresa?":** el Tri-Estado CoT XML **nunca llega a ejecutarse** para esta consulta — el pipeline la corta antes, en la Etapa 5 de `ragService.js` (gate de confianza `< 0.20`, ver sección 4 y 5). El LLM nunca ve la pregunta ni el contexto.

---

## 4. Configuración vigente

### `CONFIDENCE_THRESHOLD`
Definido en `services/citationBuilder.js:10`:
```js
const CONFIDENCE_THRESHOLD = 0.70; // Por debajo de esto se muestran fuentes automáticamente
```
Este umbral **solo controla si se muestran las fuentes/citas** en la respuesta — NO es el umbral que decide si se responde o no. El umbral real que bloquea la respuesta está *hardcodeado* en `services/ragService.js:399`:
```js
if (!contextText || chunksUsed === 0 || safeConfidence < 0.20 || isEntityHallucination) {
    // → "No encontré información sobre este tema en la documentación disponible."
}
```
También existe una constante `MIN_SCORE_THRESHOLD = 0.08` en `ragService.js:206`, declarada pero **no referenciada en ningún otro punto del archivo** (código muerto / config huérfana).

### `DOC_PRIORITY_MAP` — 10 reglas actuales (no 12)

El array real en `services/ragService.js` contiene **10 reglas**, no 12 (posible desalineación con expectativa previa del usuario/documentación antigua). Listado completo:

| # | Keywords (resumen) | boostDocs | penalizeDocs |
|---|---|---|---|
| 1 | visitante, overol, polaina, ropa de calle, escafandra, cofia, maquillaje, uniforme, lavado, hipoclorito, planchado | bpm, bpmm, visita, higiene, induccion | rit, reglamento, comunicado |
| 2 | aprendiz, sena, contrato aprendizaje | rit, reglamento | bpm |
| 3 | copasst, comité paritario, funciones copasst | induccion, sst | bpm, etica |
| 4 | misión, visión, valores, historia, quiénes somos, plastitec | conocimiento, visual, empresa | comunicado |
| 5 | sagrilaft, laft, lavado de activos, financiación del terrorismo, ofac, etc. | i-rh-017, etica, rit, reglamento | bpm, induccion |
| 6 | etica, conducta, integridad, transparencia, conflicto de interés, soborno, corrupción, denuncia, código de ética | i-rh-017, etica, codigo | bpm, induccion |
| 7 | ingreso a áreas, acceso a áreas, áreas blancas/grises/negras | i-rh-009, i-rh-010, i-rh-011, ingreso_areas | bpm |
| 8 | incapacidad, faltar/ausencia/licencia/reporte por enfermedad | rit, reglamento | induccion, i-rh-004 |
| 9 | quejas y reclamos, reclamo, trámite de reclamo | rit, reglamento | induccion, bpm |
| 10 | jornada, horario, turno, hora extra, recargo nocturno, jornada máxima, descanso remunerado | rit, reglamento | induccion, i-rh-004, bpm |

**Hallazgo clave: no existe ninguna regla de `DOC_PRIORITY_MAP` para el dominio alcohol/embriaguez/SST-conducta.** Ni boost hacia RIT/I-RH-004/I-RH-017 ni penalización de nada. Combinado con la ausencia de sinónimos (sección 3.2) y de frases de dominio en `rerankingService.js` (`DOMAIN_EXACT_PHRASES`, que tampoco incluye "embriaguez"/"alcohol"/"sustancias psicoactivas"), esta consulta llega al reranking **sin ningún mecanismo de boost léxico o de prioridad documental** — depende 100% de que el canal semántico puro encuentre el chunk correcto, lo cual falla (ver sección 5).

### Reglas de expansión de queries / glosario de sinónimos

`config/corporateVocabulary.json` completo — contiene `acronyms` (BPM, BPMM, SG-SST, SGSST, SST, COPASST, COPAST, PTEE, RIT, SAGRILAFT, OEA) y `terms` (escafandra, polainas, overol, cofia, visitantes, aprendiz sena, contrato aprendizaje, vello facial, lavado uniformes, ropa de calle, etica/ética, conflicto de interés, soborno, canal etico, sagrilaft, lavado de activos, financiación del terrorismo, primeros auxilios, quejas y reclamos, jornada/horario/turno/horas extras/trabajo nocturno/desconexión laboral, etc.).

**Ninguna entrada cubre alcohol/embriaguez/drogas/sustancias psicoactivas.** Es el gap central de este diagnóstico.

`rerankingService.js` → `DOMAIN_EXACT_PHRASES` (frases de dominio con boost de exact-match): tampoco incluye esta familia de términos (confirmado por lectura de código, líneas 24-65).

### `CACHE_ENABLED`

`.env`:
```
CACHE_ENABLED=false
```
Confirmado en `controllers/chatController.js:16`:
```js
const CACHE_ENABLED = String(process.env.CACHE_ENABLED || 'false').toLowerCase() === 'true';
```
Con `CACHE_ENABLED=false`, cada consulta (incluidas las de alcohol) va **fresca al pipeline RAG completo** — no hay caché SQLite interfiriendo en este diagnóstico. Esto fue desactivado el 2026-06-17 porque la similitud Dice del caché cruzaba preguntas no equivalentes.

---

## 5. Evidencia en logs de la consulta real

Se localizaron **2 ejecuciones exactas** de "Qué pasaría si llego embriagado a la empresa" en `logs/retrieval_debug.jsonl`, más 3 variantes relacionadas del mismo dominio, todas el 2026-07-30 (sesión de pruebas del usuario). Todas fallan de la misma manera.

### Ejecución 1 — `rag_1785431012354` (2026-07-30T17:03:32.354Z)

| Etapa | Resultado |
|---|---|
| Query | `"Qué pasaría si llego embriagado a la empresa"` |
| Expansión | `expandedQuery` = igual a la original (sin cambios), `expandedTerms: []`, `keywords: ["pasaría","llego","embriagado"]`, `intent: "corporativa"` |
| Embedding | `mxbai-embed-large`, 1024d, 672ms |
| **Semántico** | `semanticCount: 4` — Top scores 0.7699 y 0.7532 sobre chunks de **"jornada y horarios de trabajo"** / **"metas de productividad"** (irrelevantes al tema) |
| **BM25 (keyword)** | `bm25Count: 0` — cero resultados |
| **Frase exacta** | `phraseCount: 0` |
| Fusión + Reranking | `fusion_results: 4`, todos con `finalScore: 0.0000` (el peso semántico 0.45 sobre chunks irrelevantes decae a 0 tras reranking léxico porque no comparten ninguna keyword) |
| Contexto construido | 2033 caracteres, `chunksUsed: 2`, única fuente `RIT_PLASTITEC_01_DE_JULIO_2026_VF.md` — pero el contenido es sobre jornada laboral, no sobre embriaguez |
| **Confidence Engine** | `confidence_score: 0.0000` |
| **Corte del pipeline** | Etapa 5 de `ragService.js` — `safeConfidence < 0.20` → responde inmediatamente sin invocar el LLM (`modelUsed: "N/A (sin contexto)"`) |
| Respuesta entregada | *"No encontré información sobre este tema en la documentación disponible."* |
| Latencia total | 717ms (Fast Reject — nunca llega al LLM ni al pipeline Tri-Estado) |

### Ejecución 2 — `rag_1785434436823` (2026-07-30T18:00:36.823Z)

Idéntica a la Ejecución 1 en todos los aspectos (misma query, mismos 4 resultados semánticos, `bm25Count: 0`, `confidence_score: 0.0000`, mismo mensaje de rechazo). Confirma que el fallo es determinístico y reproducible, no un evento aislado.

### Variantes relacionadas (mismo dominio, mismo día de pruebas)

- **`rag_1785430994355`** — `"Si llego hembriagado calntr"` (typo doble: "hembriagado" + "calntr" sin terminar) → `bm25Count: 0`, `confidence_score: 0.0000` → mismo rechazo. El typo "hembriagado" tampoco está en `SPELL_VARIANTS`.
- **`rag_1785430700028`** — `"Hay un proceso en cuanto sospecha de estado de hembriaguez..."` → `confidence_score: 0.1620` (recupera contexto de I-RH-004 sobre accidentes de trabajo por *matching casual* de "proceso"/"accidente", no por el término "embriaguez") → mismo rechazo final.
- **`rag_1785431029082`** — `"...pueda resolver una sospecha en cuanto embriaguez de un trabajador"` → `confidence_score: 0.1876`, recupera chunks sobre "proceso disciplinario" / "conflicto de intereses" (match parcial casual vía BM25 con "sospecha"/"trabajador"), no el contenido real de la política → mismo rechazo.

**Diagnóstico de causa raíz (confirmado con evidencia de código + logs):**
1. El canal semántico (embeddings) no encuentra el chunk correcto del RIT/I-RH-004/I-RH-017 con score suficiente para esta formulación coloquial — el embedding de "llego embriagado a la empresa" no es lo bastante cercano al embedding de "presentarse al trabajo en estado de embriaguez, bajo los efectos del alcohol".
2. El canal BM25 (`searchKeyword`) requiere coincidencia de **token exacto** contra el índice full-text de Qdrant. "embriagado" (adjetivo/participio) no matchea "embriaguez" (sustantivo) ni "alcohol" — de ahí `bm25Count: 0`.
3. No hay expansión de sinónimos (`corporateVocabulary.json`) que traduzca "embriagado"/"tomado"/"borracho" → "embriaguez"/"alcohol"/"sustancias psicoactivas" (sección 3.2/4).
4. No hay regla de `DOC_PRIORITY_MAP` ni frase de dominio en `DOMAIN_EXACT_PHRASES` que blinde este tema con boost documental (sección 4).
5. Resultado: `confidence_score = 0.0000` < gate `0.20` → Fast Reject antes del LLM. El pipeline Tri-Estado CoT XML (sección 3.3) nunca se ejecuta para esta pregunta.

---

## 6. Preguntas de prueba (variantes coloquiales) agrupadas por documento fuente

### RIT (Reglamento Interno de Trabajo) — Art. 81.2, faltas graves 14 y 40

1. "¿Qué pasa si llego borracho al trabajo?"
2. "¿Me pueden despedir si llego tomado a la planta?"
3. "Tomé unos tragos anoche, ¿puedo ir a trabajar igual?"
4. "¿Es falta grave presentarse ebrio en la empresa?"
5. "¿Qué sanción hay por embriaguez en el trabajo?"

### SST / I-RH-004 (Inducción SST) — Política Alcohol, Tabaco y Sustancias Psicoactivas

6. "¿Cuál es la política de alcohol y drogas de Plastitec?"
7. "Si sospechan que estoy borracho, ¿me hacen alcoholimetría?"
8. "¿Qué hago si un compañero llega tomado a trabajar?"
9. "¿Puedo tomarme un trago en el almuerzo y volver a la planta?"
10. "¿Consumir drogas fuera del trabajo pero llegar 'colgado' es falta?"

### BPM / I-RH-003 (Buenas Prácticas de Manufactura)

11. "¿Puedo entrar al área de producción si tomé licor el fin de semana?"
12. "¿Está prohibido beber alcohol antes de entrar a planta?"
13. "¿Qué dice el BPM sobre presentarse tomado a la línea de producción?"

### Ética / I-RH-017 (Código de Ética) — punto 10, Consumo de Alcohol, Tabaco y Sustancias Psicoactivas

14. "¿Puedo llevar licor a las instalaciones aunque no lo consuma en el trabajo?"
15. "¿Qué dice el código de ética sobre el consumo de drogas?"
16. "¿Los visitantes también deben cumplir la política de alcohol?"
17. "¿Qué pasa si uso mal un medicamento recetado y eso afecta mi desempeño?"

### Dotación / General (cruce con higiene y comportamiento)

18. "Si voy a una fiesta de la empresa donde hay licor, ¿aplica la misma norma?"
19. "¿Qué pasaría si llego embriagado a la empresa?" *(query original de prueba — ya confirmada como fallo, sección 5)*
20. "Puedo ir tomado a la planta si es mi día libre y solo paso a recoger algo?"

---

## 7. Fragmento esperado por pregunta (respuesta esperada)

| # | Pregunta | Documento | Fragmento que debería responderla |
|---|---|---|---|
| 1 | ¿Qué pasa si llego borracho al trabajo? | RIT, Art. 81.2 | "Presentarse al trabajo en estado de embriaguez, bajo los efectos del alcohol, o bajo la influencia de narcóticos o de drogas enervantes" (prohibición explícita a los trabajadores) |
| 2 | ¿Me pueden despedir si llego tomado a la planta? | RIT, falta grave #40 | "Presentarse al trabajo bajo el efecto de alcohol, drogas, sustancias psicoactivas o cualquier elemento que altere su estado de conciencia, poniendo en riesgo su seguridad y la de sus compañeros" — clasificado como falta grave (justa causa de terminación) |
| 3 | Tomé unos tragos anoche, ¿puedo ir a trabajar igual? | RIT, Art. 81.2 + falta grave #14 | Ídem #1/#2 — la prohibición es sobre el estado al momento de presentarse, no sobre cuándo se consumió |
| 4 | ¿Es falta grave presentarse ebrio en la empresa? | RIT, falta grave #14 | "Ingesta de Alcohol o Drogas en el Trabajo: Presentarse al trabajo bajo los efectos de alcohol, drogas o cualquier sustancia psicoactiva que pueda comprometer la seguridad propia o de los demás" |
| 5 | ¿Qué sanción hay por embriaguez en el trabajo? | RIT, Art. 81 (encabezado "Se prohíbe a los trabajadores") + capítulo disciplinario | Art. 81.2 tipifica la conducta prohibida; el régimen disciplinario general del RIT determina la sanción aplicable (no hay una sanción numérica específica citada en el fragmento indexado — requiere contexto adicional del capítulo de sanciones) |
| 6 | ¿Cuál es la política de alcohol y drogas de Plastitec? | I-RH-004, sección "Política Alcohol, Tabaco y Sustancias Psicoactivas" | "Plastitec reconoce que el alcoholismo y la drogadicción representan un problema laboral y un riesgo para las actividades de la Compañía... define directrices que el empleado deberá atender y respetar en todo momento" |
| 7 | Si sospechan que estoy borracho, ¿me hacen alcoholimetría? | I-RH-004 | No se encontró en el fragmento indexado un procedimiento explícito de prueba de alcoholimetría — el chunk actual solo declara la política general, no el protocolo de verificación (posible gap de contenido, no solo de retrieval) |
| 8 | ¿Qué hago si un compañero llega tomado a trabajar? | I-RH-004 (política) + RIT (deber de reporte) | Vinculado a la obligación general de reportar condiciones inseguras (I-RH-004, sección de responsabilidades SST) — no hay un procedimiento específico "compañero ebrio" en el texto indexado |
| 9 | ¿Puedo tomarme un trago en el almuerzo y volver a la planta? | I-RH-004 + BPM | Política de alcohol aplica a "presentarse al trabajo" bajo efectos, sin distinción horaria — implícitamente prohibido por Art. 81.2 RIT y política SST |
| 10 | ¿Consumir drogas fuera del trabajo pero llegar 'colgado' es falta? | RIT, falta grave #40 | "...cualquier elemento que altere su estado de conciencia, poniendo en riesgo su seguridad..." — el criterio es el estado al llegar, no el momento de consumo |
| 11 | ¿Puedo entrar a producción si tomé licor el fin de semana? | BPM (I-RH-003) | "No presentarse al trabajo bajo los efectos del alcohol o sustancias sicoactivas" — depende de si persisten efectos, no del día de consumo |
| 12 | ¿Está prohibido beber alcohol antes de entrar a planta? | BPM (I-RH-003) | "No beber. No presentarse al trabajo bajo los efectos del alcohol o sustancias sicoactivas" |
| 13 | ¿Qué dice el BPM sobre presentarse tomado a la línea de producción? | BPM (I-RH-003) | Ídem #11/#12 — norma de higiene y comportamiento en planta |
| 14 | ¿Puedo llevar licor a las instalaciones aunque no lo consuma? | I-RH-017, punto 10 | "Plastitec prohíbe... que toda persona que ingrese a sus instalaciones se encuentre bajo efectos de alcohol o drogas" — el foco es el efecto al ingresar, no la mera posesión (el texto indexado no cubre explícitamente "portar" licor sin consumir) |
| 15 | ¿Qué dice el código de ética sobre el consumo de drogas? | I-RH-017, punto 10 | "...prohíbe... que toda persona que ingrese a sus instalaciones se encuentre bajo efectos de alcohol o drogas, ya que representa un riesgo para sí mismo, para la seguridad de las demás personas y para la empresa. Entre las sustancias prohibidas se incluyen las drogas ilegales, las sustancias controladas o el uso indebido de medicamentos recetados" |
| 16 | ¿Los visitantes también deben cumplir la política de alcohol? | I-RH-017, punto 10 | "...que toda persona que ingrese a sus instalaciones..." — redacción inclusiva de "toda persona", pero no menciona explícitamente "visitantes" como categoría — inferencia razonable, no cita literal |
| 17 | ¿Qué pasa si uso mal un medicamento recetado y afecta mi desempeño? | I-RH-017, punto 10 | "...el uso indebido de medicamentos recetados" está explícitamente listado entre las sustancias prohibidas |
| 18 | ¿En una fiesta de la empresa con licor aplica la misma norma? | Ninguno de los documentos indexados cubre explícitamente "eventos corporativos" | **Gap de contenido** — no hay fragmento que responda esto; el asistente debería declarar ausencia de información en vez de alucinar una respuesta |
| 19 | ¿Qué pasaría si llego embriagado a la empresa? | RIT Art. 81.2 + faltas graves #14/#40 | Ver fragmentos de #1-#5 — **confirmado que el sistema actualmente NO recupera este contenido** (sección 5) |
| 20 | ¿Puedo ir tomado a la planta en mi día libre solo a recoger algo? | RIT Art. 81.2 / I-RH-017 punto 10 | Ambos hablan de "presentarse al trabajo" / "ingresar a las instalaciones" — el texto de I-RH-017 ("toda persona que ingrese a sus instalaciones") sugiere que aplica incluso sin estar en turno, pero no hay una cita literal que resuelva "día libre" explícitamente — zona gris de interpretación |

---

## Resumen ejecutivo de causas raíz

1. **Gap de vocabulario (el más accionable):** `config/corporateVocabulary.json` y `DOMAIN_EXACT_PHRASES` (`rerankingService.js`) no tienen ninguna entrada para la familia alcohol/embriaguez/drogas/sustancias psicoactivas. Agregar sinónimos coloquiales (borracho, tomado, ebrio, trago, licor, drogado, colgado) → términos canónicos del corpus (embriaguez, efectos del alcohol, sustancias psicoactivas) debería resolver la mayoría de las 20 preguntas de prueba.
2. **Gap de `DOC_PRIORITY_MAP`:** no existe regla de boost para RIT Art. 81 / I-RH-004 / I-RH-017 en este dominio, a diferencia de otros dominios sensibles (ética, SAGRILAFT, ingreso a áreas) que sí tienen reglas dedicadas.
3. **BM25 exige coincidencia exacta de token** — sin normalización morfológica (stemming/lemmatización), términos coloquiales o conjugados nunca activan el canal léxico.
4. **El umbral real de corte (`0.20` en `ragService.js`) no coincide con el documentado en `PROJECT_CONTEXT.md` (`0.40`)** — la documentación de arquitectura está desactualizada.
5. Posible **gap de contenido real** (no solo de retrieval) para preguntas como "eventos corporativos con licor" o "procedimiento de alcoholimetría" — el corpus actual solo declara la prohibición general, no procedimientos operativos detallados.
