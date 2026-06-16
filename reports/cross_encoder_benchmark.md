# Cross-Encoder Benchmark — Fase 2.5.1
> Fecha: 2026-06-05T13:30:36.268Z
> Modelo: `Xenova/bge-reranker-base`
> Total preguntas: 75

## Métricas Globales

| Métrica | Línea Base | **Post CE** | Δ | Objetivo | Estado |
|---------|-----------|-------------|---|----------|--------|
| Retrieval Accuracy | 82.67% | **84%** | 🟢 +1.33 | >90% | ❌ |
| Grounding Accuracy | 82.67% | **94.67%** | 🟢 +12.00 | >88% | ✅ |
| Hallucination Rate | 12% | **5.33%** | 🟢 -6.67 | <5% | ❌ |
| False Negative Rate | 22.67% | **4%** | 🟢 -18.67 | <10% | ✅ |
| Avg Latency | 12400ms | **27671ms** | 🔴 +15271.00 | <15000ms | ❌ |
| **Enterprise Score** | 82.27% | **91.6%** | 🟢 +9.33 | >88% | ✅ |
| RAM Adicional (RSS) | - | **+-36MB** | - | - | - |

## Matriz por Categoría

| Categoría | n | Retrieval | Grounding | Alucinaciones | FP Neg | Latencia | Score |
|-----------|---|-----------|-----------|---------------|--------|----------|-------|
| 🟡 BPM | 17 | 64.7% | 94.1% | 5.9% | 0% | 27360ms | **85.9%** |
| 🟡 SAGRILAFT | 11 | 72.7% | 90.9% | 9.1% | 0% | 18470ms | **86.4%** |
| 🟢 SST | 13 | 100% | 92.3% | 7.7% | 0% | 28135ms | **95.4%** |
| 🟢 Aprendices SENA | 12 | 100% | 91.7% | 8.3% | 8.3% | 29048ms | **94.2%** |
| 🟢 Código Ética | 11 | 72.7% | 100% | 0% | 9.1% | 29595ms | **90.9%** |
| 🟢 Reglamento Interno | 11 | 100% | 100% | 0% | 9.1% | 33376ms | **99.1%** |

## Conclusión

✅ **La Fase 2.5.1 ha superado el objetivo de Enterprise Score ≥88%.**

El Cross-Encoder Neural Reranking se confirma como arquitectura candidata para producción.
