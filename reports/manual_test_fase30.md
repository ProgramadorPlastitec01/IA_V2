# Reporte de Pruebas Manuales — Fase 3.0 Conversacional
> Fecha: 2026-06-09T17:45:01.672Z
> Resultado Global: ✅ APROBADO — Proceder con Benchmark

## Resumen por Caso

| # | Pregunta | Modo | Directa | Sin Juridico | Sin Arts | Longitud | Conf. | Lat. |
|---|----------|------|---------|--------------|----------|----------|-------|------|
| 1 | ¿Puedo hacer horas extras como aprendiz SENA?... | SHORT_ANSWER ✅ | ✅ | ✅ | ⚠️ | ✅ (17w) | 13% | 18200ms |
| 2 | ¿Qué datos están prohibidos pedir en entrevis... | SHORT_ANSWER ✅ | ✅ | ✅ | ✅ | ✅ (11w) | 10% | 8853ms |
| 3 | ¿Cuál es la sanción por llegada tarde?... | SHORT_ANSWER ✅ | ✅ | ✅ | ✅ | ✅ (10w) | 0% | 18987ms |
| 4 | ¿Cómo reporto un accidente de trabajo?... | PROCEDURE ✅ | ❌ | ✅ | ✅ | ✅ (20w) | 17% | 22333ms |
| 5 | ¿Qué es el SAGRILAFT?... | DETAILED_POLICY ⚠️ | ✅ | ✅ | ✅ | ✅ (7w) | 35% | 17952ms |
| 6 | ¿Qué es el Código de Ética?... | DETAILED_POLICY ⚠️ | ✅ | ✅ | ✅ | ✅ (20w) | 25% | 19292ms |
| 7 | ¿Qué debo hacer si observo una conducta irreg... | PROCEDURE ✅ | ❌ | ✅ | ✅ | ✅ (10w) | 10% | 23332ms |
| 8 | ¿Quién puede recibir una denuncia?... | SHORT_ANSWER ✅ | ✅ | ✅ | ✅ | ✅ (5w) | 8% | 13848ms |
| 9 | ¿Qué elementos de protección debo usar?... | SHORT_ANSWER ⚠️ | ❌ | ✅ | ✅ | ✅ (4w) | 13% | 22413ms |
| 10 | ¿Qué ocurre si incumplo una norma de segurida... | SHORT_ANSWER ✅ | ❌ | ✅ | ✅ | ✅ (9w) | 13% | 19544ms |

---

## Detalle por Caso

### Caso 1: ¿Puedo hacer horas extras como aprendiz SENA?

**Modo detectado:** `SHORT_ANSWER` (esperado: `SHORT_ANSWER`) ✅

**Confianza RAG:** 12.5% | **Fuentes:** RIT PLASTITEC 25 NOV 2025.pdf | **Latencia:** 18200ms

**Criterio de evaluación:**
> 0 mezcla, 0 reglas inventadas, no citas de artículos

**Respuesta generada:**
No, según el artículo 11 de la ley, las prácticas con estudiantes universitarios no incluyen horas extras.

**Análisis:**
- Respuesta directa (Sí/No/Debes...): ✅
- Sin lenguaje jurídico: ✅
- Sin citas de artículos: ⚠️ CITA artículos
- Longitud: 17 palabras, 1 líneas ✅

---

### Caso 2: ¿Qué datos están prohibidos pedir en entrevista?

**Modo detectado:** `SHORT_ANSWER` (esperado: `SHORT_ANSWER`) ✅

**Confianza RAG:** 10.0% | **Fuentes:** RIT PLASTITEC 25 NOV 2025.pdf, I-RH- 012 VERSIÓN 6 .pdf | **Latencia:** 8853ms

**Criterio de evaluación:**
> 0 mezcla, 0 reglas inventadas, no citas de artículos

**Respuesta generada:**
la religión que profesan o el partido político al cual pertenezca

**Análisis:**
- Respuesta directa (Sí/No/Debes...): ✅
- Sin lenguaje jurídico: ✅
- Sin citas de artículos: ✅
- Longitud: 11 palabras, 1 líneas ✅

---

### Caso 3: ¿Cuál es la sanción por llegada tarde?

**Modo detectado:** `SHORT_ANSWER` (esperado: `SHORT_ANSWER`) ✅

**Confianza RAG:** 0.0% | **Fuentes:** I-RH-004 - 14 Induccion en Seguridad Salud en el Trabajo.pdf, RIT PLASTITEC 25 NOV 2025.pdf | **Latencia:** 18987ms

**Criterio de evaluación:**
> 0 mezcla, 0 reglas inventadas, no citas de artículos

**Respuesta generada:**
No se encuentra información sobre la sanción por llegada tarde

**Análisis:**
- Respuesta directa (Sí/No/Debes...): ✅
- Sin lenguaje jurídico: ✅
- Sin citas de artículos: ✅
- Longitud: 10 palabras, 1 líneas ✅

---

### Caso 4: ¿Cómo reporto un accidente de trabajo?

**Modo detectado:** `PROCEDURE` (esperado: `PROCEDURE`) ✅

**Confianza RAG:** 16.7% | **Fuentes:** I-RH-004 - 14 Induccion en Seguridad Salud en el Trabajo.pdf | **Latencia:** 22333ms

**Criterio de evaluación:**
> 0 mezcla de procedimientos ajenos, 0 pasos inventados

**Respuesta generada:**
Se informa al brigadista el Evento ocurrido, y luego reportar a la ARL para remitirlo al centro de atención médica

**Análisis:**
- Respuesta directa (Sí/No/Debes...): ❌
- Sin lenguaje jurídico: ✅
- Sin citas de artículos: ✅
- Longitud: 20 palabras, 1 líneas ✅

---

### Caso 5: ¿Qué es el SAGRILAFT?

**Modo detectado:** `DETAILED_POLICY` (esperado: `DEFINITION`) ⚠️

**Confianza RAG:** 35.0% | **Fuentes:** I-RH-017-5 CODIGO DE ETICA (Material visual).pdf, RIT PLASTITEC 25 NOV 2025.pdf | **Latencia:** 17952ms

**Criterio de evaluación:**
> Sin falsos negativos, definición sintetizada

**Respuesta generada:**
El SAGRILAFT es un operador económico autorizado

**Análisis:**
- Respuesta directa (Sí/No/Debes...): ✅
- Sin lenguaje jurídico: ✅
- Sin citas de artículos: ✅
- Longitud: 7 palabras, 1 líneas ✅

---

### Caso 6: ¿Qué es el Código de Ética?

**Modo detectado:** `DETAILED_POLICY` (esperado: `DEFINITION`) ⚠️

**Confianza RAG:** 25.0% | **Fuentes:** I-RH-017-5 CODIGO DE ETICA (Material visual).pdf | **Latencia:** 19292ms

**Criterio de evaluación:**
> Sin falsos negativos, definición sintetizada

**Respuesta generada:**
El Código de Ética es un conjunto de principios y normas que rigen el comportamiento de los colaboradores de Plastitec.

**Análisis:**
- Respuesta directa (Sí/No/Debes...): ✅
- Sin lenguaje jurídico: ✅
- Sin citas de artículos: ✅
- Longitud: 20 palabras, 1 líneas ✅

---

### Caso 7: ¿Qué debo hacer si observo una conducta irregular?

**Modo detectado:** `PROCEDURE` (esperado: `PROCEDURE`) ✅

**Confianza RAG:** 10.0% | **Fuentes:** RIT PLASTITEC 25 NOV 2025.pdf | **Latencia:** 23332ms

**Criterio de evaluación:**
> 0 mezcla de procedimientos, pasos literales

**Respuesta generada:**
Observa la conducta irregular y sigue las instrucciones del reglamento

**Análisis:**
- Respuesta directa (Sí/No/Debes...): ❌
- Sin lenguaje jurídico: ✅
- Sin citas de artículos: ✅
- Longitud: 10 palabras, 1 líneas ✅

---

### Caso 8: ¿Quién puede recibir una denuncia?

**Modo detectado:** `SHORT_ANSWER` (esperado: `SHORT_ANSWER`) ✅

**Confianza RAG:** 8.3% | **Fuentes:** RIT PLASTITEC 25 NOV 2025.pdf | **Latencia:** 13848ms

**Criterio de evaluación:**
> Lista de responsables sin artículos

**Respuesta generada:**
Las víctimas de acoso sexual

**Análisis:**
- Respuesta directa (Sí/No/Debes...): ✅
- Sin lenguaje jurídico: ✅
- Sin citas de artículos: ✅
- Longitud: 5 palabras, 1 líneas ✅

---

### Caso 9: ¿Qué elementos de protección debo usar?

**Modo detectado:** `SHORT_ANSWER` (esperado: `LIST`) ⚠️

**Confianza RAG:** 12.5% | **Fuentes:** I-RH-004 - 14 Induccion en Seguridad Salud en el Trabajo.pdf | **Latencia:** 22413ms

**Criterio de evaluación:**
> Elementos del documento sin inventar adicionales

**Respuesta generada:**
Elementos de protección personal

**Análisis:**
- Respuesta directa (Sí/No/Debes...): ❌
- Sin lenguaje jurídico: ✅
- Sin citas de artículos: ✅
- Longitud: 4 palabras, 1 líneas ✅

---

### Caso 10: ¿Qué ocurre si incumplo una norma de seguridad?

**Modo detectado:** `SHORT_ANSWER` (esperado: `SHORT_ANSWER`) ✅

**Confianza RAG:** 12.5% | **Fuentes:** I-RH-004 - 14 Induccion en Seguridad Salud en el Trabajo.pdf | **Latencia:** 19544ms

**Criterio de evaluación:**
> Consecuencias de la evidencia sin inventar sanciones

**Respuesta generada:**
Se informa a los Coordinadores y/o Jefes de área

**Análisis:**
- Respuesta directa (Sí/No/Debes...): ❌
- Sin lenguaje jurídico: ✅
- Sin citas de artículos: ✅
- Longitud: 9 palabras, 1 líneas ✅

