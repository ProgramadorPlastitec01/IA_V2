# Enterprise Benchmark Real — Fase 2.3
> Fecha: 2026-06-09T18:21:40.224Z
> Total preguntas evaluadas: 75

## Métricas Globales

| Métrica | Resultado | Objetivo | Estado |
|---------|-----------|----------|--------|
| Retrieval Accuracy | 90.67% | >90% | ✅ |
| Grounding Accuracy | 72% | >90% | ❌ |
| Hallucination Rate | 28% | <5% | ❌ |
| False Negative Rate | 25.33% | 0% | ❌ |
| Avg Latency | 24479ms | <12000ms | ❌ |
| **Enterprise Score** | **77.87%** | >85% | ❌ |

## Matriz de Debilidades por Categoría

| Categoría | n | Retrieval | Grounding | Alucinaciones | FP Neg | Latencia | Score |
|-----------|---|-----------|-----------|---------------|--------|----------|-------|
| 🟡 BPM | 17 | 88.2% | 70.6% | 29.4% | 11.8% | 22059ms | **77.6%** |
| 🔴 SAGRILAFT | 11 | 72.7% | 63.6% | 36.4% | 27.3% | 22396ms | **67.2%** |
| 🟢 SST | 13 | 92.3% | 84.6% | 15.4% | 23.1% | 26108ms | **86.1%** |
| 🟡 Aprendices SENA | 12 | 100% | 58.3% | 41.7% | 41.7% | 25565ms | **70.8%** |
| 🟡 Código Ética | 11 | 90.9% | 81.8% | 18.2% | 18.2% | 25340ms | **84.5%** |
| 🟡 Reglamento Interno | 11 | 100% | 72.7% | 27.3% | 36.4% | 26332ms | **80%** |

## Análisis de Patrones

### 🔴 Categorías Débiles (Score < 70%)
- SAGRILAFT

### 🟢 Categorías Fuertes (Score ≥ 85%)
- SST

### ⚠️ Categorías con Alta Tasa de Alucinación (>20%)
- BPM
- SAGRILAFT
- Aprendices SENA
- Reglamento Interno

### ⚠️ Categorías con Falsos Negativos (>10%)
- BPM
- SAGRILAFT
- SST
- Aprendices SENA
- Código Ética
- Reglamento Interno

### 🐢 Categorías con Latencia Alta (>15s)
- BPM
- SAGRILAFT
- SST
- Aprendices SENA
- Código Ética
- Reglamento Interno

## Preguntas con Alucinaciones Detectadas
- **BPM:** ¿Los hombres pueden dejarse la barba y el bigote si tienen contacto con el producto?
- **BPM:** ¿Cómo se deben lavar los uniformes?
- **SAGRILAFT:** ¿Qué es el SAGRILAFT?
- **SST:** ¿Qué es el COPASST?
- **Aprendices SENA:** ¿Cuánto dura el contrato de aprendizaje SENA?
- **BPM:** ¿Está permitido fumar dentro de las instalaciones de la planta?
- **BPM:** ¿Se puede comer en las áreas de proceso?
- **BPM:** ¿Qué tipo de calzado se debe usar en la planta?
- **SST:** ¿Qué factores de riesgo existen en la planta?
- **Código Ética:** ¿Qué valores promueve el código de ética de Plastitec?
- **Código Ética:** ¿Qué debe hacer un empleado que conoce de un acto de corrupción?
- **SAGRILAFT:** ¿Qué es el lavado de activos?
- **SAGRILAFT:** ¿Qué es la financiación del terrorismo?
- **SAGRILAFT:** ¿Qué es una persona políticamente expuesta (PEP)?
- **Reglamento Interno:** ¿Cuál es la jornada laboral máxima según el reglamento?
- **Reglamento Interno:** ¿Qué es el periodo de prueba?
- **Reglamento Interno:** ¿Puede un empleado realizar otro trabajo mientras está en la empresa?
- **Aprendices SENA:** ¿Qué es un contrato de aprendizaje?
- **Aprendices SENA:** ¿Cuánto se le paga al aprendiz SENA en etapa lectiva?
- **Aprendices SENA:** ¿Cuánto se le paga al aprendiz SENA en etapa productiva?
- **Aprendices SENA:** ¿El aprendiz tiene derecho a vacaciones?

## Preguntas con Falsos Negativos Detectados
- **SST:** ¿Qué es el COPASST?
- **Código Ética:** ¿Se pueden recibir regalos de proveedores?
- **Aprendices SENA:** ¿Cuánto dura el contrato de aprendizaje SENA?
- **SST:** ¿Qué debe hacer un empleado en caso de accidente laboral?
- **BPM:** ¿Qué prendas debe usar el personal en áreas de proceso?
- **BPM:** ¿Qué tipo de calzado se debe usar en la planta?
- **SST:** ¿Qué elementos de protección personal son obligatorios?
- **Código Ética:** ¿Qué valores promueve el código de ética de Plastitec?
- **SAGRILAFT:** ¿Cuál es el objetivo del SAGRILAFT?
- **SAGRILAFT:** ¿Qué información debe verificarse de los clientes según el SAGRILAFT?
- **SAGRILAFT:** ¿Qué es una persona políticamente expuesta (PEP)?
- **Reglamento Interno:** ¿Qué sucede si un empleado llega tarde reiteradamente?
- **Reglamento Interno:** ¿Qué es el periodo de prueba?
- **Reglamento Interno:** ¿Puede un empleado realizar otro trabajo mientras está en la empresa?
- **Reglamento Interno:** ¿Cuántos días de incapacidad cubre la empresa directamente?
- **Aprendices SENA:** ¿Cuánto se le paga al aprendiz SENA en etapa lectiva?
- **Aprendices SENA:** ¿Cuánto se le paga al aprendiz SENA en etapa productiva?
- **Aprendices SENA:** ¿Puede la empresa terminar un contrato de aprendizaje antes de su vencimiento?
- **Aprendices SENA:** ¿Qué obligaciones tiene el aprendiz SENA?

## Recomendaciones para Fase 2.4
- **Optimización quirúrgica** en: SAGRILAFT.
- Reducir la Hallucination Rate (actual: 28%).
- Eliminar los Falsos Negativos residuales.
- Optimizar la latencia promedio (actual: 24479ms).
