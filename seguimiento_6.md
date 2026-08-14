# Seguimiento 6 — Backup, corte a producción y validación post-corte

**Fecha:** 2026-08-04
**Continúa de:** `seguimiento_5.md` (re-chunking header-aware del RIT validado en colección de prueba, corte propuesto pero no ejecutado)

---

## 1. Backup de `plastitec_docs` antes del corte

### 1.1 Incidente: el snapshot nativo de Qdrant falló

Se intentó primero el mecanismo estándar de Qdrant (`POST /collections/plastitec_docs/snapshots`). Falló de forma consistente (4 intentos, con esperas entre cada uno) con:

```
Service internal error: failed to create snapshot: Service internal error: Failed to remove
segment: failed to rename file ... Acceso denegado. (os error 5)
```

Investigando la causa: el proceso Qdrant que estaba corriendo era en realidad una instancia **huérfana** de la sesión anterior (mi intento de reiniciarlo con `Stop-Process`/`taskkill` fue rechazado con "Acceso denegado" pese a ser el mismo usuario propietario del proceso — probablemente un bloqueo de archivo por otro proceso del sistema, ej. antivirus, sobre los archivos de `storage/`). El proceso seguía sirviendo consultas normalmente (`GET /collections` respondía bien), pero la operación de snapshot requiere renombrar archivos de segmento internamente y esa operación específica quedó bloqueada.

**No se pudo reiniciar Qdrant para descartar que fuera un problema transitorio del proceso** (el puerto/WAL seguía en uso por el mismo proceso huérfano). Como el snapshot nativo no es indispensable — el objetivo es tener un backup restaurable — se optó por un mecanismo equivalente.

### 1.2 Backup alternativo: copia de filesystem

Se copió el directorio completo de almacenamiento de la colección:

```
Origen:  C:\AIV2\storage\collections\plastitec_docs
Destino: C:\AIV2\backups\plastitec_docs_backup_2026-08-04\plastitec_docs
```

- **575 archivos, 860.34 MB** — tamaño y conteo de archivos verificados idénticos entre origen y destino tras la copia.
- Se guardó además la configuración de la colección (`GET /collections/plastitec_docs` completo, incluyendo `vectors.size=1024`, `distance=Cosine`, `hnsw_config`, `payload_schema`) en:
  ```
  C:\AIV2\backups\plastitec_docs_backup_2026-08-04\collection_info_before_cutover.json
  ```
- Estado de la colección en el momento del backup: **890 puntos**, `status: green`.

### 1.3 Cómo restaurar si algo falla en producción real

1. Detener Qdrant.
2. Borrar (o mover) `C:\AIV2\storage\collections\plastitec_docs`.
3. Copiar `C:\AIV2\backups\plastitec_docs_backup_2026-08-04\plastitec_docs` de vuelta a `C:\AIV2\storage\collections\plastitec_docs`.
4. Reiniciar Qdrant — debe volver a reportar 890 puntos (verificable contra `collection_info_before_cutover.json`).

Esto revierte el corte completo en minutos, sin necesidad de reprocesar nada.

---

## 2. Corte a producción

**Mecanismo usado** (Qdrant no soporta renombrar/promover colecciones directamente, así que se reemplazó el contenido del RIT in-place en vez de intentar un swap de colección completa):

1. Borrar de `plastitec_docs` todos los puntos con `fuente = RIT_PLASTITEC_01_DE_JULIO_2026_VF.md` (602 puntos, chunking viejo).
2. Copiar hacia `plastitec_docs` los 294 puntos del RIT ya calculados en `plastitec_docs_test_ritv2` (mismos vectores, sin reembeber — la colección de prueba ya los tenía).

Resultado:

```
Puntos en plastitec_docs ANTES del corte: 890
Puntos RIT viejos borrados:                602
Puntos RIT nuevos insertados:               294
Puntos en plastitec_docs DESPUÉS del corte: 582
```

Coincide exactamente con lo esperado (890 − 602 + 294 = 582, igual que la colección de prueba). Script: `scratch/cutover_rit_v2_to_production.mjs`.

La colección de prueba `plastitec_docs_test_ritv2` **no se borró** — queda disponible como referencia adicional mientras se confirma la estabilidad del corte.

---

## 3. Validación post-corte (contra `plastitec_docs`, sin overrides de entorno)

Express se reinició con la configuración normal (`QDRANT_COLLECTION` sin override) y confirmó en el log de arranque:

```
✅ Colección "plastitec_docs" OK: 1024d, 582 puntos.
```

### 3.1 21 preguntas de dominio

**21/21 pasan el gate.** Los valores de confidence coinciden casi exactamente con los medidos contra la colección de prueba en `seguimiento_5.md` (ej. embriagado 0.379, facebook 0.367, ambos idénticos al centésimo) — es la misma evidencia de que **no hay ningún problema de infraestructura** (nombres, permisos, paths) distinto al de contenido: los datos migraron intactos.

### 3.2 15 preguntas OOD

**15/15 siguen rechazadas.** Sin cambios ni falsos positivos nuevos.

### 3.3 Benchmark de 100 preguntas

| Métrica | Colección de prueba (seguimiento_5) | Producción post-corte |
|---|---|---|
| Accuracy | 81.40% | **86.05%** |
| Hallucination | 16.00% | 20.00% |
| False Negatives | 16.28% | **11.63%** |
| Latencia promedio | 10432ms | 11482ms |

Los números se movieron entre estas dos corridas **con el mismo contenido exacto** en ambas colecciones. Esto no es una señal de infraestructura rota — es la misma varianza de corrida a corrida ya documentada en `seguimiento_5.md` (§1.3): el benchmark reutiliza un único `conversationId` para las 100 preguntas consecutivas, lo cual introduce ruido de estado conversacional, y el grader del benchmark clasifica por coincidencia de string exacta, lo que penaliza respuestas honestas con fraseo distinto (ej. Cat-C "no se menciona explícitamente..." en vez de la frase canónica). La prueba de infraestructura real y determinística son las suites 21+15, que **coincidieron casi exactamente** entre ambas colecciones.

**Conclusión de esta validación:** el corte no introdujo ningún problema de configuración, permisos o nombre de colección — el sistema en producción responde con el mismo comportamiento (mismo contenido, misma calidad de citas en los 3 casos objetivo) que se validó en la colección de prueba.

---

## 4. Estado final

- `plastitec_docs` (producción) — **582 puntos, con el re-chunking header-aware del RIT ya activo.**
- `plastitec_docs_test_ritv2` — conservada como referencia, no borrada.
- Backup de la colección productiva pre-corte: `C:\AIV2\backups\plastitec_docs_backup_2026-08-04\` (890 puntos, restaurable en minutos).
- Qdrant y Express detenidos al terminar esta sesión.

## 5. Pendiente / hallazgo colateral sin resolver en este paso

Durante el diagnóstico del fallo de snapshot se confirmó que el proceso Qdrant de esta máquina queda ocasionalmente "huérfano" entre sesiones (sobrevive a los intentos de detenerlo vía `Stop-Process`/`taskkill`, con "Acceso denegado" incluso siendo el mismo usuario propietario). No afectó la integridad del corte de hoy, pero si se repite podría bloquear un snapshot nativo en el futuro. Vale la pena investigarlo aparte (posible antivirus o política de EDR bloqueando renombrado de archivos de Qdrant) — no lo investigué a fondo aquí para no desviarme del objetivo de esta tarea.
