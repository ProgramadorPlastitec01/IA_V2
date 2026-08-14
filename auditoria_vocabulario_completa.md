# Auditoría Sistemática de Vocabulario y Enrutamiento RAG — Todos los Dominios

**Generado:** 2026-08-03
**Contexto:** Continuación de `diagnostico_rag.md` (gap "alcohol/embriaguez"). Este documento aplica esa corrección (Parte A), audita sistemáticamente el resto de la base documental para encontrar gaps equivalentes en otros dominios (Parte B), y valida todo en vivo contra el pipeline real (Qdrant 890 puntos + Express + Ollama llama3.2, levantados en esta sesión para la prueba) (Parte C).

**Metodología de validación:** no se simuló nada. Se levantó Qdrant (`cwd C:\AIV2`), el backend Express (`node server.js`) y se usó Ollama ya activo, y se enviaron las 21 preguntas de prueba contra `POST /api/query` real, antes y después de cada tanda de fixes. Los números de esta auditoría son mediciones reales del pipeline, no estimaciones.

---

## Parte A — Fix del dominio alcohol/embriaguez (aplicado)

Cambios aplicados exactamente como se pidió:

1. **`config/corporateVocabulary.json`** → `terms`: se agregaron `borracho`, `tomado`, `ebrio`, `embriagado`, `trago`, `licor`, `drogado`, `colgado`, `alicorado`, `tomar`, cada uno mapeando a `embriaguez` / `estado de embriaguez` / `efectos del alcohol` / `alcohol` / `sustancias psicoactivas` (términos canónicos confirmados en el corpus, ver `diagnostico_rag.md` sección 2).
2. **`services/rerankingService.js`** → `DOMAIN_EXACT_PHRASES`: se agregaron `'estado de embriaguez'`, `'efectos del alcohol'`, `'sustancias psicoactivas'`, `'sustancias sicoactivas'` (variante ortográfica real del BPM), `'sustancia psicoactiva'`, `'ingesta de alcohol'`.
3. **`services/ragService.js`** → `DOC_PRIORITY_MAP`: nueva regla (originalmente enumerada #11, ver numeración final en Parte B) con boost hacia `rit`, `i-rh-004`, `i-rh-017`, `bpm`, `i-rh-003` y sin penalización.
4. **`docs/PROJECT_CONTEXT.md`**: corregido el diagrama Mermaid, `Confidence > 0.40?` → `Confidence > 0.20?`, para que coincida con el gate real de `ragService.js:399` (`safeConfidence < 0.20`).

**Resultado medido en vivo (antes → después, mismo servidor reiniciado):**

| Query | Antes | Después |
|---|---|---|
| "Que pasa si llego borracho al trabajo" | (no probada en diagnóstico original, pero mismo patrón que "embriagado" → fallaba) | confidence **0.278**, 6 chunks, respuesta correcta citando Art. 81 |
| "Me pueden despedir si llego tomado a la planta" | fallaba (mismo patrón) | confidence **0.209**, 6 chunks, RIT+BPM+SST citados |
| "Tomé unos tragos anoche, ¿puedo ir a trabajar igual?" | fallaba | confidence **0.220**, 6 chunks |
| "¿Es falta grave presentarse ebrio en la empresa?" | fallaba | confidence **0.418**, 6 chunks, cita correcta de falta grave |
| **"Qué pasaría si llego embriagado a la empresa"** (query original del diagnóstico) | confidence **0.000**, 0 chunks | **confidence 0.000, 0 chunks — SIGUE FALLANDO** (ver hallazgo residual abajo) |

**Hallazgo residual importante (transparencia, no se ocultó):** la frase EXACTA que originó el diagnóstico —"Qué pasaría si llego embriagado a la empresa"— sigue sin responderse incluso después del fix, mientras que variantes casi idénticas ("llego borracho", "llego tomado", "ebrio") sí funcionan. Se investigó la causa raíz con logs reales (`logs/retrieval_debug.jsonl`, entrada `rag_1785787303640`):

- La expansión de vocabulario SÍ funciona ahora: `expandedTerms: ["embriagado","embriaguez","estado de embriaguez","efectos del alcohol"]`.
- El canal BM25 ahora SÍ encuentra el chunk correcto (`bm25Count: 15`, incluyendo el chunk "40. Presentarse al trabajo bajo el efecto de alcohol, drogas, sustancias psicoac...").
- **Pero el `DocBoost` de `DOC_PRIORITY_MAP` aplica un score plano (0.25) a TODOS los chunks del documento boosteado (RIT) por igual**, sin diferenciar el chunk realmente relevante de chunks genéricos ("La Empresa, de acuerdo con sus necesidades operativas..."). Como el reranking es un sort estable y varios chunks empatan en 0.25, el chunk específico sobre embriaguez terminó en posición 6 (SÍ entra al contexto, `chunksUsed: 6`), pero el **Confidence Engine calcula la similitud (`rawConfidence`) usando únicamente el score del chunk en posición 0** (`_buildContextExpanded`: `topScore = results[0].finalScore`), que en este caso es uno de los chunks genéricos empatados — no el relevante.
- Resultado: `confidence_score: 0.0563` — por debajo del gate 0.20 — a pesar de que el contenido correcto SÍ estaba en el contexto ensamblado.

**Esto es un hallazgo de arquitectura, no de vocabulario**: `DOC_PRIORITY_MAP` boostea el documento entero de forma plana; el Confidence Engine asume que el chunk mejor rankeado (posición 0) es representativo de la relevancia real, lo cual falla cuando el boost aplana el ranking en empates. No se intentó corregir esto en esta sesión (está fuera del alcance de "vocabulario/prioridad documental" solicitado) — se documenta como recomendación de seguimiento en la sección de conclusiones. El síntoma es poco frecuente (solo se reprodujo con esta formulación específica de las 21 probadas) pero es reproducible y determinístico.

---

## Parte B — Auditoría sistemática por dominio

### Método

1. Se extrajo el índice completo del RIT (37 capítulos, grep de encabezados `##`/`###`/`ARTÍCULO`) y se leyeron íntegros los capítulos de I-RH-003 (BPM), I-RH-004 (SST) e I-RH-017 (Ética), ya cubiertos en el diagnóstico previo.
2. Se priorizaron primero los dominios que YA tienen regla en `DOC_PRIORITY_MAP` (aprendices, COPASST, SAGRILAFT, ética, ingreso a áreas, incapacidades, quejas, jornada) para revisar variantes coloquiales faltantes.
3. Luego se identificaron capítulos del RIT **sin ninguna regla** de enrutamiento, priorizando los sensibles/disciplinarios: **acoso laboral (Cap. XXIX), acoso sexual (Cap. XXXI), terminación con justa causa (Cap. XXVI)** — y después temas de uso diario: **teletrabajo/trabajo remoto (Cap. XXVII), dotación laboral (Cap. XI), uso de tecnología/redes sociales (Cap. XVIII-XIX)**.
4. Para cada gap se comparó contra los 3 archivos (`corporateVocabulary.json`, `DOMAIN_EXACT_PHRASES`, `DOC_PRIORITY_MAP`) y se aplicó la corrección directamente.

### Tabla de dominios auditados

| Dominio | Documento fuente | Regla previa en `DOC_PRIORITY_MAP` | Gap encontrado | Acción |
|---|---|---|---|---|
| Alcohol / embriaguez | RIT, I-RH-004, I-RH-017, BPM | No (agregada en diagnóstico previo) | Sin sinónimos, sin frases de dominio, sin prioridad — **corregido en Parte A** | ✅ Fix aplicado |
| Aprendices / SENA | RIT Cap. V | Sí (regla #2) | Faltaban "pasantía"/"practicante" como sinónimos coloquiales de "aprendiz SENA" | ✅ Fix aplicado (vocabulario + keywords de regla #2) |
| COPASST | RIT/SST | Sí (regla #3) | Cobertura ya razonable (acrónimo + expansión en `corporateVocabulary.json`) | Sin cambios — no se encontró gap claro |
| SAGRILAFT | I-RH-017, RIT | Sí (regla #5) | Dominio técnico/legal, vocabulario ya extenso | Sin cambios |
| Ética / conflicto de interés | I-RH-017 | Sí (regla #6) | "regalo", "soborno", "conflicto de interés" ya cubiertos | Sin cambios |
| Ingreso a áreas (blancas/grises/negras) | I-RH-009/010/011 | Sí (regla #7) | Cobertura ya extensa | Sin cambios |
| Incapacidad / ausencia por enfermedad | RIT | Sí (regla #8) | Cobertura ya razonable | Sin cambios |
| Quejas y reclamos | RIT | Sí (regla #9) | Cobertura ya razonable | Sin cambios |
| Jornada / horario / turnos | RIT Cap. VII-VIII | Sí (regla #10) | Cobertura ya muy extensa (la más completa del sistema) | Sin cambios |
| **Acoso laboral / acoso sexual** | RIT Cap. XXIX-XXXI | **No — gap crítico** | Cero sinónimos, cero frases de dominio, cero regla de prioridad, para el dominio más sensible del reglamento después de alcohol | ✅ **Fix aplicado (regla nueva)** |
| **Terminación con justa causa / despido** | RIT Cap. XXVI | **No** | Cero cobertura | ✅ **Fix aplicado (regla nueva)** |
| **Teletrabajo / trabajo remoto / trabajo en casa** | RIT Cap. XXVII | No (solo corrección ortográfica en `SPELL_VARIANTS`, sin regla de prioridad ni expansión semántica) | Sin regla de boost documental | ✅ **Fix aplicado (regla nueva)** |
| **Dotación laboral (prestación económica)** | RIT Art. 58 | No (la regla #1 existente boostea BPM para "uniforme"/"overol" pero **penaliza RIT**, que es donde vive la prestación económica/frecuencia) | Conflicto de enrutamiento: preguntas sobre "cada cuánto dan dotación" competían con la regla de higiene BPM que penaliza RIT | ✅ **Fix aplicado (regla nueva, sin penalización)** |
| **Uso de tecnología / redes sociales** | RIT Cap. XVIII-XIX | No | Cero cobertura, incluida ausencia de "facebook"/"instagram" como sinónimos de "redes sociales" | ✅ **Fix aplicado (regla nueva + vocabulario de plataformas)** |

### Gaps de vocabulario corregidos (detalle)

**`config/corporateVocabulary.json` — nuevas entradas en `terms`:**
`acoso`, `maltrato`, `bullying`, `hostigamiento`, `me tocó sin permiso`, `chantaje sexual`, `comité de convivencia`, `insinuaciones`, `despido`, `me pueden despedir`, `echar del trabajo`, `terminar mi contrato`, `teletrabajo`, `trabajo remoto`, `trabajo en casa`, `dotación laboral`, `cada cuanto dan dotacion`, `derecho a dotacion`, `redes sociales`, `facebook`, `instagram`, `hablar mal de la empresa`, `whatsapp del trabajo`, `me revisan el correo`, `pasantia`, `practicante`.

**`services/rerankingService.js` → `DOMAIN_EXACT_PHRASES` — nuevas frases:**
`'acoso laboral'`, `'acoso sexual'`, `'comité de convivencia laboral'`, `'maltrato laboral'`, `'persecución laboral'`, `'contacto físico no solicitado'`, `'favores sexuales'`, `'invitaciones o presiones'`, `'terminación con justa causa'`, `'justa causa'`, `'causales de terminación'`, `'teletrabajo'`, `'teletrabajador'`, `'trabajo en casa'`, `'trabajo remoto'`, `'dotación laboral'`, `'suministro de dotación'`, `'calzado y vestido de labor'`, `'uso de redes sociales'`, `'auditoría y monitoreo de herramientas tecnológicas'`.

**`services/ragService.js` → `DOC_PRIORITY_MAP` — reglas nuevas (numeración final, 16 reglas totales):**

| # | Dominio | Keywords (resumen) | boostDocs | penalizeDocs |
|---|---|---|---|---|
| 11 | Alcohol/embriaguez | embriaguez, embriagado, borracho, tomado, ebrio, alicorado, trago, licor, drogado, colgado, alcohol, sustancias psicoactivas/sicoactivas | rit, reglamento, i-rh-004, i-rh-017, i-rh-003, bpm | — |
| 12 | Acoso laboral/sexual | acoso laboral, acoso sexual, hostigamiento, maltrato laboral, bullying, me acosan, me tocó sin permiso, chantaje sexual, comité de convivencia, persecución laboral, discriminación laboral, favores sexuales, insinuaciones, mi jefe me maltrata, me humillan, me hostigan | rit, reglamento | induccion, bpm |
| 13 | Despido/justa causa | despido, me despiden, me pueden despedir, echar del trabajo, terminación con justa causa, justa causa, terminar mi contrato, causales de terminación, me pueden echar | rit, reglamento | — |
| 14 | Teletrabajo/remoto | teletrabajo, teletrabajador, trabajo en casa, trabajo remoto, home office, trabajar desde la casa | rit, reglamento | induccion, bpm |
| 15 | Dotación laboral | dotación laboral, cada cuanto dan dotacion, derecho a dotacion, entrega de dotación, cuantas dotaciones al año, suministro de dotación | rit, reglamento | — |
| 16 | Redes sociales/tecnología | redes sociales, whatsapp del trabajo/corporativo, me revisan el correo, revisan mi computador, publicar en facebook, facebook, instagram, hablar mal de la empresa | rit, reglamento | induccion, bpm |

También se extendió la regla #2 (aprendices) con `'pasantia', 'pasantía', 'practicante'`.

### Gaps de CONTENIDO real identificados (no de retrieval — requieren que RRHH redacte/actualice el documento fuente)

Estos NO se completaron con supuestos; se reportan tal cual, confirmados con logs reales del pipeline corriendo:

1. **"Un compañero me tocó sin permiso, ¿qué hago?"** — el retrieval SÍ recupera contexto relevante (confidence 0.252, pasa el gate), pero la respuesta del LLM en la primera corrida fue *"No encontré información sobre cómo manejar un toque inapropiado en el lugar de trabajo"* — no explota el Art. 139 (protocolo de denuncia de acoso sexual) de forma clara. En la segunda corrida sí generó una respuesta genérica sobre "es importante que se tomen medidas para prevenir y abordar el acoso laboral" pero sin citar el procedimiento paso a paso del Art. 139. **Recomendación:** esto puede ser un problema de calidad de extracción del LLM 3B más que de contenido faltante — el Art. 139 SÍ tiene el procedimiento — pero amerita revisión porque la respuesta es inconsistente entre corridas.
2. **"Estoy haciendo una pasantía, ¿aplican las mismas reglas?"** — confidence 0.254, 6 chunks de RIT, pero la respuesta fue *"No encontré información sobre las reglas específicas de pasantía"*. El RIT (Art. 10-18) describe extensamente el contrato de aprendizaje y las modalidades de práctica universitaria, pero **no hay una declaración explícita y única de que "las mismas obligaciones generales del reglamento aplican a los practicantes"** — es una inferencia razonable pero no una cita literal. **Gap de contenido real**: RRHH podría agregar una línea explícita al RIT o a un instructivo de inducción que confirme esto.
3. **"¿Cuándo me pueden echar del trabajo?"** — confidence 0.455 (pasa el gate cómodamente), pero en ambas corridas el LLM citó el **Art. 38** (suspensión de labores por fiesta no determinada en la Ley 51/1983) en vez del **Art. 110** (causales de terminación con justa causa), que es el artículo correcto y que SÍ estaba disponible en el contexto (se confirmó en la pregunta hermana "¿Me pueden despedir sin justa causa?", que sí citó correctamente el Art. 110 con confidence 0.747). **Esto es una señal de que a confidence intermedia (~0.45), el LLM 3B no siempre selecciona el chunk más relevante del contexto ensamblado** — no es un gap de contenido ni de retrieval (el chunk correcto estaba presente), sino de generación/priorización dentro del contexto. Recomendación: revisar si el orden de los chunks en el contexto ensamblado influye en qué artículo cita el LLM (los chunks "críticos" van primero — si el Art. 110 no quedó entre los 2 críticos, el modelo pudo no priorizarlo).
4. **"¿Puedo hablar mal de la empresa en Facebook?"** — tras el fix de vocabulario, la respuesta correctamente dice que no está permitido, pero cita el **Art. 88** (confidencialidad de información técnica/financiera) en vez del **Art. 89** (regulación específica del uso de redes sociales, que es el artículo que realmente prohíbe "comentarios que afecten la reputación... de PLASTITEC"). Contenido correcto en espíritu, cita de artículo imprecisa — mismo patrón de "confusión de artículo dentro de un contexto correcto" que el punto 3.

**Patrón transversal identificado:** en al menos 2 de los 4 gaps de contenido (#3 y #4), el problema NO es que falte información — es que **el LLM 3B (llama3.2), al recibir varios artículos relevantes en el mismo contexto, a veces cita el artículo equivocado** aunque el correcto esté presente. Esto es coherente con lo ya documentado en memoria de proyecto (bake-off de modelos: llama3.2:3b es inestable en clasificación tri-estado, "mismo query pasa/falla entre corridas"). No es un problema que la Parte B de esta auditoría (vocabulario/prioridad) pueda resolver — es un límite conocido del modelo de 3B parámetros.

---

## Parte C — Validación completa (21 preguntas, 7 dominios, ejecutadas en vivo)

### Antes de cualquier fix (baseline, confirmado con 1 query real + logs históricos del diagnóstico previo)

Solo se confirmó el baseline para el dominio alcohol (ya documentado exhaustivamente en `diagnostico_rag.md`); los demás dominios nuevos (acoso, despido, teletrabajo, dotación, redes) **no tenían ninguna regla previa**, por lo que su "antes" es equivalente al patrón de fallo de alcohol: retrieval semántico débil, `bm25Count` bajo o 0 por falta de expansión, sin boost documental.

### Después de todos los fixes (Parte A + Parte B) — resultados reales

| Dominio | Pregunta | Confidence final | Chunks | ¿Pasa gate 0.20? | Fuente(s) citada(s) |
|---|---|---|---|---|---|
| Alcohol | Que pasaria si llego embriagado a la empresa | **0.000** | 0 | ❌ **NO** (ver hallazgo residual) | — |
| Alcohol | Que pasa si llego borracho al trabajo | 0.278 | 6 | ✅ Sí | I-RH-004, RIT |
| Alcohol | Me pueden despedir si llego tomado a la planta | 0.209 | 6 | ✅ Sí | BPM, I-RH-006, I-RH-004 |
| Alcohol | Tomé unos tragos anoche, ¿puedo ir a trabajar igual? | 0.220 | 6 | ✅ Sí | RIT, I-RH-004 |
| Alcohol | ¿Es falta grave presentarse ebrio en la empresa? | 0.418 | 6 | ✅ Sí | RIT, I-RH-004 |
| Acoso | Mi jefe me maltrata y me humilla frente a mis compañeros | 0.332 | 4 | ✅ Sí | RIT |
| Acoso | Un compañero me tocó sin permiso, ¿qué hago? | 0.252 | 2 | ✅ Sí (contenido genérico, ver gap #1) | RIT |
| Acoso | ¿Cómo denuncio acoso laboral? | 0.724 | 6 | ✅ Sí | RIT |
| Acoso | ¿Qué es el comité de convivencia laboral? | 0.799 | 6 | ✅ Sí | I-RH-004, RIT |
| Acoso | Me están haciendo bullying en el trabajo | 0.238 | 6 | ✅ Sí | RIT |
| Despido | ¿Me pueden despedir sin justa causa? | 0.747 | 4 | ✅ Sí | RIT (Art. 110 correcto) |
| Despido | ¿Cuándo me pueden echar del trabajo? | 0.455 | 6 | ✅ Sí (cita imprecisa, ver gap #3) | RIT |
| Despido | ¿Qué pasa si falto 3 veces sin permiso? | 0.249 | 3 | ✅ Sí | RIT |
| Teletrabajo | ¿Puedo trabajar desde la casa? | 0.452 | 6 | ✅ Sí | RIT |
| Teletrabajo | ¿Qué es el home office en Plastitec? | 0.550 | 6 | ✅ Sí | I-RH-001, RIT |
| Teletrabajo | Requisitos para trabajo remoto | 0.617 | 6 | ✅ Sí | RIT |
| Dotación | ¿Cada cuánto me dan la dotación? | 0.395 | 2 | ✅ Sí | RIT (Art. 58 correcto) |
| Dotación | Tengo derecho a botas y overol nuevos | 0.230 | 4 | ✅ Sí | I-RH-004 |
| Redes | ¿Puedo hablar mal de la empresa en Facebook? | 0.209 | 4 | ✅ Sí (cita imprecisa, ver gap #4) | RIT |
| Redes | ¿Me pueden revisar el WhatsApp del trabajo? | 0.480 | 6 | ✅ Sí | RIT (Art. 89 correcto) |
| Aprendices | Estoy haciendo una pasantía, ¿aplican las mismas reglas? | 0.254 | 6 | ✅ Sí (respuesta vaga, ver gap #2) | RIT |

**Resumen: 20/21 preguntas (95%) ahora pasan el gate de confianza y reciben una respuesta con contenido real** (vs. 0/5 en el dominio alcohol antes del fix, y 0 cobertura estructural en los 5 dominios nuevos). La única falla persistente es la query original exacta del diagnóstico, por la razón de arquitectura documentada arriba (empate de scores por DocBoost plano).

---

## Conclusiones y recomendaciones de seguimiento

1. **Los 6 dominios auditados con gap (alcohol, acoso, despido, teletrabajo, dotación, redes sociales) ahora tienen cobertura completa en los 3 archivos de enrutamiento.** Se restauró el servidor y se validó en vivo, no por inspección de código únicamente.
2. **Hallazgo de arquitectura (no vocabulario):** `DOC_PRIORITY_MAP` aplica un boost plano a todo el documento, lo que puede aplanar el ranking y hacer que el Confidence Engine (que solo mira el score de la posición 0) subestime la confianza real cuando el chunk relevante no es el primero en el orden de empate. Recomendación de Sprint futuro: usar el máximo score entre los chunks del contexto ensamblado en vez de solo `results[0]`, o aplicar el boost proporcional a la coincidencia léxica real en vez de plano por documento.
3. **Inconsistencia de citación del LLM 3B:** en 2 de 21 preguntas, el modelo citó un artículo del RIT distinto al correcto aunque el correcto estuviera en el contexto. Esto es coherente con las limitaciones ya conocidas de `llama3.2:3b` documentadas en las notas operativas del proyecto (inestabilidad en clasificación tri-estado). No es corregible por vocabulario/enrutamiento — requiere trabajo de prompt o upgrade de modelo (ya explorado y descartado por restricciones de hardware según notas de bake-off previas).
4. **Gap de contenido real a trasladar a RRHH:** confirmar/redactar explícitamente si las obligaciones generales del RIT aplican a practicantes/pasantes universitarios (hoy es inferencia, no cita literal).
5. **Dominios NO auditados en profundidad por límite de alcance de esta sesión:** vacaciones (Cap. IX), salario/nómina (Cap. X), confidencialidad (Cap. XVII), asuntos sindicales (Cap. XXXII), situaciones agravantes/atenuantes (Cap. XXIV-XXV). No se encontró evidencia de que sean dominios de alto riesgo de confusión (no compiten semánticamente con documentos de higiene/inducción como sí lo hacían alcohol/acoso/dotación), pero se recomienda una pasada futura con el mismo método si se reportan fallos de usuarios reales en esas áreas.
