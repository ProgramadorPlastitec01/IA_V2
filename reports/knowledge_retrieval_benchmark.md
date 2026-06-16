# Reporte Comparativo: Arquitectura Base vs Híbrida Dual (Knowledge Extraction)

Este reporte detalla los resultados empíricos obtenidos al implementar la **Capa de Extracción de Conocimiento** (Fase 2.4.5) y el posterior **Dual Retrieval** contra la línea base (Hybrid Search V2 estándar).

## 1. Comparativa Global (Pre vs Post Fase 2.4.5)

| Métrica | Base (Solo Documentos) | Post (Doc + Knowledge Base) | Diferencia | Estado |
|---------|-----------------------|-----------------------------|------------|--------|
| **Enterprise Score** | **82.27%** | **75.33%** | 🔻 -6.94% | ⚠️ Empeoró |
| **Retrieval Accuracy** | 82.67% | 77.33% | 🔻 -5.34% | ⚠️ Empeoró |
| **Grounding Accuracy** | 82.67% | 73.33% | 🔻 -9.34% | ⚠️ Empeoró |
| **Hallucination Rate** | 12.00% | 22.67% | 🔺 +10.67% | ⚠️ Empeoró |
| **False Negative Rate** | 22.67% | 26.67% | 🔺 +4.00% | ⚠️ Empeoró |
| **Latencia Promedio** | 12.4s | 29.8s | 🔺 +17.4s | ❌ Muy lento |

## 2. Análisis por Dominios (Post-Fase 2.4.5)

* **SST y SENA:** Mantuvieron puntajes excepcionales (>90%). El conocimiento extraído aquí funcionó de forma excelente porque las políticas son sumamente literales.
* **BPM:** Bajó levemente, pero se mantuvo sólido en 84.1%.
* **Código de Ética y Reglamento Interno:** Ambos sufrieron caídas (71.8% y 80.9%).
* **SAGRILAFT:** Colapsó dramáticamente (22.8% de Enterprise Score). Tuvo 72.7% de alucinaciones y solo 27.3% de Retrieval.

## 3. Conclusiones y Diagnóstico Técnico

Paradójicamente, la inclusión de una base de conocimiento estructurada **empeoró el rendimiento general del sistema RAG** por las siguientes razones:

1. **Dilución del Contexto (Distracción del LLM):** Al inyectar 4 fragmentos ultra-estructurados (KB) + 3 fragmentos originales extensos, el prompt final se saturó con formatos JSON o Markdown que obligan a Llama 3.2 a analizar "metadatos" y no el texto fluido, provocando pérdida de foco y elevando las alucinaciones.
2. **Caída drástica de Retrieval en SAGRILAFT:** El filtro de Quality Gate o la forma en la que se extrajo el conocimiento de SAGRILAFT dejó fragmentos muy cortos o desconectados del vocabulario original (las palabras clave se desordenaron durante la generación del LLM en la extracción).
3. **Explosión de Latencia:** Enviar 7 chunks combinados y evaluar la relevancia de los registros estructurados forzó un procesamiento de más de 6,000 tokens de entrada, lo cual provocó que el tiempo de inferencia de Llama 3.2 pasara de 12 segundos a casi 30 segundos por pregunta.

## 4. Decisión Arquitectónica Recomendada

> [!WARNING]
> Dado que la línea base (82.27%) era notablemente superior y mucho más rápida (12s), se recomienda **revertir temporalmente la inyección de la Knowledge Base** y volver a la arquitectura anterior (solo `plastitec_docs`).
> 
> Si deseamos superar el 90%, el problema real radica en el **Retrieval Semántico** y en el entendimiento cruzado de preguntas complejas (especialmente en Ética y SAGRILAFT). Esto confirma que se hace indispensable la **Fase 2.5: Cross-Encoder (Neural Reranking)**. Un modelo dedicado a cruzar semánticamente el query con el chunk resolverá los falsos negativos de SAGRILAFT sin necesidad de duplicar el contexto.
