# Reporte de Patch de Metadata — Código de Ética
Generado: 2026-06-04T15:16:22.631Z

---

## Objetivo

Actualizar el campo `metadata.category` de los chunks del documento:

```
I-RH-017-5 CODIGO DE ETICA (Material visual).pdf
```

**Cambio aplicado:**
- Antes: `"General"`
- Después: `"Código Ética"`

---

## Resultados del Patch

| Métrica | Valor |
|---------|-------|
| Chunks encontrados | 24 |
| Ya correctos (sin cambio) | 0 |
| Chunks actualizados | 24 |
| Fallidos | 0 |

---

## Validación Post-Patch

| Métrica | Valor |
|---------|-------|
| Total chunks Ética en Qdrant | 24 |
| Con categoría correcta | 0 ✅ |
| Con categoría incorrecta | 24 ⚠️ |

> ⚠️ **VALIDACIÓN PARCIAL:** 24 chunks aún tienen categoría incorrecta.

### Chunks con categoría incorrecta:

- ID: `001cb84c-fcde-4ccb-ba90-d0a696b1dcf2` | Category: `General` | Texto: "7. SER EJEMPLO Todos los empleados tienen la responsabilidad de actuar en forma ..."
- ID: `0b6b830e-1f7a-491d-95a1-d688de5ddfb3` | Category: `BPM / Higiene` | Texto: "3. PREVENCIÒN DEL RIESGO DE LAVADO DE ACTIVOS,FINANCIAMIENTO DEL TERRORISMO Y DE..."
- ID: `12713f4a-c11a-45d0-a876-d6730f30054f` | Category: `BPM / Higiene` | Texto: "9. SEGURIDAD Y SALUD EN EL TRABAJO En PLASTITEC estamos comprometidos con la pro..."

---

## Impacto Esperado

Con esta corrección de metadata:

1. **DOC_PRIORITY_MAP** en `ragService.js` ahora reconocerá los chunks de Ética cuando se aplique el boost de dominio.
2. **RerankingService** podrá discriminar correctamente los chunks del Código de Ética al calcular `finalScore`.
3. **Retrieval Accuracy** para preguntas de ética debería mejorar significativamente.
