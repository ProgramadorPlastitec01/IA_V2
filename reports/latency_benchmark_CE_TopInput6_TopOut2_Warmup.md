# Latency Benchmark — Fase 2.5.2 [CE-TopInput6-TopOut2-Warmup]
> Fecha: 2026-06-05T19:44:21.942Z
> Top-Input: 6 | Top-Output: 2
> Total preguntas: 75 | RAM: 29MB RSS

## Métricas de Calidad

| Métrica | Baseline | Fase 2.5.1 | **CE-TopInput6-TopOut2-Warmup** | Objetivo | Estado |
|---------|----------|------------|-------------|----------|--------|
| Enterprise Score | 82.27% | 91.60% | **79.06%** | ≥90% | ❌ |
| Grounding Accuracy | 82.67% | 94.67% | **73.33%** | ≥90% | ❌ |
| Hallucination Rate | 12.00% | 5.33% | **26.67%** | ≤5% | ❌ |
| False Negative Rate | 22.67% | 4.00% | **1.33%** | ≤5% | ✅ |

## Distribución de Latencia

| Estadístico | Baseline | Fase 2.5.1 | **CE-TopInput6-TopOut2-Warmup** | Objetivo | Estado |
|-------------|----------|------------|-------------|----------|--------|
| Latencia Media | 12,400ms | 27,671ms | **23730ms** | ≤15000ms | ❌ |
| P50 | — | — | **23594ms** | ≤15,000ms | ❌ |
| P90 | — | — | **36120ms** | ≤20,000ms | ❌ |
| P95 | — | — | **37854ms** | ≤25,000ms | ❌ |
| P99 | — | — | **49961ms** | — | — |
| Min | — | — | 11914ms | — | — |
| Max | — | — | 49961ms | — | — |

## Matriz por Categoría

| Categoría | n | Retrieval | Grounding | Hall | FN | Lat.Avg | Lat.P90 | Score |
|-----------|---|-----------|-----------|------|----|---------|---------|-------|
| 🟡 BPM | 17 | 64.7% | 82.4% | 17.6% | 5.9% | 24946ms | 36319ms | **78.3%** |
| 🟡 SAGRILAFT | 11 | 72.7% | 90.9% | 9.1% | 0% | 20097ms | 28153ms | **86.4%** |
| 🟡 SST | 13 | 100% | 61.5% | 38.5% | 0% | 23573ms | 28750ms | **76.9%** |
| 🟡 Aprendices SENA | 12 | 100% | 75% | 25% | 0% | 24729ms | 37854ms | **85%** |
| 🟡 Código Ética | 11 | 72.7% | 81.8% | 18.2% | 0% | 20942ms | 27095ms | **80.9%** |
| 🔴 Reglamento Interno | 11 | 100% | 45.5% | 54.5% | 0% | 27366ms | 36284ms | **67.3%** |

## Veredicto Final

> [!WARNING]
> ❌ **Criterios de aceptación NO completamente cumplidos.**
> Se requiere optimización adicional antes de activar en producción.
> Revisar los items marcados con ❌ en las tablas de arriba.
