# Latency Benchmark — Fase 2.5.2 [CE-TopInput6-Warmup]
> Fecha: 2026-06-05T18:19:17.860Z
> Top-Input: 6 | Top-Output: 4
> Total preguntas: 75 | RAM: 31MB RSS

## Métricas de Calidad

| Métrica | Baseline | Fase 2.5.1 | **CE-TopInput6-Warmup** | Objetivo | Estado |
|---------|----------|------------|-------------|----------|--------|
| Enterprise Score | 82.27% | 91.60% | **NaN%** | ≥90% | ❌ |
| Grounding Accuracy | 82.67% | 94.67% | **NaN%** | ≥90% | ❌ |
| Hallucination Rate | 12.00% | 5.33% | **NaN%** | ≤5% | ❌ |
| False Negative Rate | 22.67% | 4.00% | **1.33%** | ≤5% | ✅ |

## Distribución de Latencia

| Estadístico | Baseline | Fase 2.5.1 | **CE-TopInput6-Warmup** | Objetivo | Estado |
|-------------|----------|------------|-------------|----------|--------|
| Latencia Media | 12,400ms | 27,671ms | **23558ms** | ≤15000ms | ❌ |
| P50 | — | — | **23400ms** | ≤15,000ms | ❌ |
| P90 | — | — | **32693ms** | ≤20,000ms | ❌ |
| P95 | — | — | **35148ms** | ≤25,000ms | ❌ |
| P99 | — | — | **61874ms** | — | — |
| Min | — | — | 10828ms | — | — |
| Max | — | — | 61874ms | — | — |

## Matriz por Categoría

| Categoría | n | Retrieval | Grounding | Hall | FN | Lat.Avg | Lat.P90 | Score |
|-----------|---|-----------|-----------|------|----|---------|---------|-------|
| 🔴 BPM | 17 | 64.7% | NaN% | NaN% | 0% | 24773ms | 35148ms | **NaN%** |
| 🔴 SAGRILAFT | 11 | 72.7% | NaN% | NaN% | 0% | 17903ms | 25278ms | **NaN%** |
| 🔴 SST | 13 | 100% | NaN% | NaN% | 0% | 24156ms | 32693ms | **NaN%** |
| 🔴 Aprendices SENA | 12 | 100% | NaN% | NaN% | 0% | 24802ms | 30382ms | **NaN%** |
| 🔴 Código Ética | 11 | 72.7% | NaN% | NaN% | 9.1% | 20061ms | 25572ms | **NaN%** |
| 🔴 Reglamento Interno | 11 | 100% | NaN% | NaN% | 0% | 28771ms | 35107ms | **NaN%** |

## Veredicto Final

> [!WARNING]
> ❌ **Criterios de aceptación NO completamente cumplidos.**
> Se requiere optimización adicional antes de activar en producción.
> Revisar los items marcados con ❌ en las tablas de arriba.
