# Reporte Fase 2.4.2 — Optimización Quirúrgica de Retrieval (Ética & SAGRILAFT)

## 1. Resumen de Cambios Realizados

De acuerdo a los hallazgos de la auditoría documental, se aplicaron 5 cambios específicos en el sistema de Retrieval, sin afectar los embeddings, OCR, o LLM base:

1. **Patch de Metadata en Qdrant**: Se actualizaron en caliente los 24 chunks de `I-RH-017-5 CODIGO DE ETICA (Material visual).pdf` de la categoría `"General"` a `"Código Ética"`.
2. **Expansión DOC_PRIORITY_MAP (Ética)**: Se añadió un nuevo bloque de dominio en `ragService.js` con 26 palabras clave específicas de Ética (ej. *conducta*, *soborno*, *conflicto de interés*) para hacer boost a los documentos `['i-rh-017', 'etica']`.
3. **Expansión DOC_PRIORITY_MAP (SAGRILAFT)**: Se amplió el bloque de SAGRILAFT con 18 términos nuevos asociados al lavado de activos (ej. *la/ft*, *terrorismo*, *ofac*, *prevención laft*).
4. **Relaciones Semánticas (corporateVocabulary)**: Se integraron expansiones de términos para `sagrilaft`, `lavado de activos`, `etica`, y `conflicto de interes` para mejorar el Query Understanding Service.
5. **Boost de Dominio y Frases Exactas (Reranking)**: Se añadieron 16 frases exactas de ética y 12 de SAGRILAFT a `DOMAIN_EXACT_PHRASES`. Adicionalmente, se programó la nueva función `_domainSpecificBoost` en `rerankingService.js` para otorgar un boost fuerte (`+0.45`) cuando la query y el chunk coinciden con el dominio objetivo.

## 2. Comparativa Antes / Después (Enterprise Benchmark)

| Métrica | Fase 2.4.1 (Antes) | Fase 2.4.2 (Después) | Variación |
|---------|-------------------|----------------------|-----------|
| **Enterprise Score** | 82.27% | **81.20%** | 📉 -1.07% |
| **Grounding Accuracy** | 82.67% | **78.67%** | 📉 -4.00% |
| **False Negative Rate** | 22.67% | **18.67%** | 📈 Mejoró 4% |
| **Ética (Retrieval)** | 45.5% | **72.7%** | 📈 **+27.2%** |
| **SAGRILAFT (Retrieval)** | 72.7% | **72.7%** | ➖ Sin cambio |

## 3. Análisis de Resultados

- **Mejora Significativa en Ética:** La corrección del campo `category` y el boost de palabras clave lograron subir el *Retrieval Accuracy* de Ética del **45.5% al 72.7%**. Un avance sustancial, aunque por debajo del umbral objetivo (>85%).
- **Estancamiento en SAGRILAFT:** A pesar de haber inyectado múltiples keywords y phrases, el Retrieval no mejoró. Esto se explica por la **ausencia de un documento PDF dedicado** para SAGRILAFT. Dado que el conocimiento está diluido dentro del extenso Reglamento Interno (RIT) de 256 chunks, el `DOC_PRIORITY_MAP` aplica el boost general al RIT, levantando no solo los chunks de LAFT, sino otros chunks normativos de alta coincidencia léxica.
- **Efecto Secundario:** La inyección masiva de boosts focalizados (`+0.45` en Reranking y más frases exactas) causó un ligero retroceso en métricas globales (Grounding bajó al 78.67%). Esto indica que el sistema de Retrieval híbrido se volvió ligeramente inestable, forzando la recuperación de chunks que cumplen con el *keyword matching* léxico (boosted) pero que carecen de la semántica precisa para responder la pregunta (lo cual generó un repunte del 20% en Hallucinations).
- **False Negatives:** Logramos reducir los falsos negativos a **18.67%**, acercándonos al objetivo de <15%.

## 4. Recomendaciones para Fase 2.5

El diagnóstico final es concluyente: **Hemos llegado al límite teórico de las optimizaciones heurísticas de Retrieval (BM25, Boosting Léxico, RRF).** 

Intentar resolver carencias documentales (SAGRILAFT) o vacíos de metadatos manipulando pesos de Reranking provoca desajustes en el Enterprise Score general (efecto "whack-a-mole").

Para la Fase 2.5, se recomienda:
1. **Creación de Documento Dedicado SAGRILAFT**: Extraer los principios LA/FT del Reglamento/Código de Ética en un archivo `SAGRILAFT.pdf` independiente. Esto resolverá la dilución del contexto sin tocar código.
2. **Reranker Neuronal (Cross-Encoder)**: En lugar de usar una fórmula matemática calibrada manualmente (BM25 + RRF + Boosts Léxicos), reemplazar la clase de Reranking con un modelo pequeño Cross-Encoder (ej. `bge-reranker-base` o `cohere-rerank`), que evalúe la similitud Query-Chunk de manera semántica pura y entienda conceptos abstractos como *Sagrilaft*.
3. **Revisión del Umbral de Confianza**: La reducción de los umbrales en `confidenceValidator` probablemente causó el aumento de *Hallucinations*. Revertir los pesos léxicos agresivos y confiar en los embeddings base.
