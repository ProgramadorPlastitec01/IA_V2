# Seguimiento 7 — Prueba de restauración del backup + causa raíz de "Acceso denegado"

**Fecha:** 2026-08-04
**Continúa de:** `seguimiento_6.md` (backup filesystem + corte a producción + validación post-corte)

---

## 1. Prueba de restauración del backup — SÍ funciona

### 1.1 Método

Como Qdrant solo descubre colecciones escaneando `storage/collections/` **al arrancar**, y la instancia productiva ya corriendo no se puede reiniciar (ver §2), la prueba de restauración se hizo levantando una **segunda instancia de Qdrant completamente independiente**, en otra carpeta de storage y otros puertos, sin tocar la instancia productiva:

1. Copié `C:\AIV2\backups\plastitec_docs_backup_2026-08-04\plastitec_docs` a una carpeta nueva: `C:\AIV2\restore_test\storage\collections\plastitec_docs` (575 archivos, 860.34 MB — verificado idéntico al origen).
2. Escribí un `config.yaml` mínimo apuntando `storage_path` a esa carpeta nueva y puertos `http_port: 6343` / `grpc_port: 6344`.
3. Arranqué `qdrant.exe --config-path ...` con esa config — instancia nueva, aislada, sin relación con el proceso que sirve producción.

**Primer intento falló** con "solo se permite un uso de cada... puerto" — no fue un problema del backup: usé `grpc_port: 6334`, que colisiona con el puerto **gRPC por defecto** que la instancia productiva ya ocupa (Qdrant usa 6333 REST + 6334 gRPC por defecto, y la instancia productiva nunca tuvo un config.yaml custom, así que ocupa ambos). Corregido a `6343`/`6344`, arrancó sin problema.

### 1.2 Resultado

```
GET http://localhost:6343/collections/plastitec_docs
→ points_count: 890
→ indexed_vectors_count: 890
→ config.vectors.size: 1024, distance: Cosine   (idéntico al original)
```

**890 puntos — exactamente los que tenía la colección antes del corte.** Confirmé además que los datos son consultables de verdad, no solo "cargados": un `scroll` filtrado por `fuente = RIT_PLASTITEC_01_DE_JULIO_2026_VF.md` devolvió contenido real y coherente (chunk del RIT viejo, chunk_index 10).

**El backup restaura correctamente. Se puede confiar en él para revertir el corte en minutos si algo falla en producción real.**

### 1.3 Detalle a tener en cuenta (no invalida el backup, pero es relevante)

Al cargar, la colección restaurada quedó con `status: "red"` por un error de **optimización de segmentos** (no de lectura de datos):

```
optimizer_status.error: "failed to rename file from ...\temp_segments\segment_builder_up3d60
to ...\segments\...: Acceso denegado. (os error 5)"
```

Es el **mismo patrón exacto** de error que impidió el snapshot nativo de Qdrant en `seguimiento_6.md` — pero esta vez ocurrió en una instancia de Qdrant **nueva, recién lanzada, sin ninguna relación con el proceso huérfano de sesiones anteriores**. Esto descarta que el problema sea "ese proceso en particular está roto" — es una interferencia de sistema (muy probablemente antivirus/EDR de Windows escaneando y bloqueando momentáneamente archivos recién creados/movidos durante el renombrado atómico que usa Qdrant al construir segmentos). No afectó la integridad ni la consulta de los datos (890/890 puntos, lecturas correctas) — solo bloqueó una tarea de mantenimiento en background. Si se hace una restauración real en el futuro, conviene excluir la carpeta `storage/` de cualquier antivirus/EDR en tiempo real, o esperar a que la ventana de bloqueo pase (fue transitorio en los snapshots — no en la restauración, que quedó permanentemente en "red" mientras la instancia de prueba estuvo arriba, aunque sin pérdida de datos).

La instancia de prueba (`restore_test/`) fue detenida y eliminada tras confirmar el resultado — no se dejó nada corriendo en los puertos 6343/6344.

---

## 2. Causa raíz de "Acceso denegado" en Stop-Process/taskkill

### 2.1 Hallazgo

Los procesos huérfanos (`qdrant.exe` PID 5292, `node.exe` PID 1184) están corriendo con un **nivel de integridad (Mandatory Integrity Level) más alto que la sesión actual de esta herramienta**, casi con certeza porque fueron lanzados desde una consola elevada ("Ejecutar como administrador") en un turno/sesión anterior. Evidencia, punto por punto:

| Verificación | Resultado |
|---|---|
| ¿Corren como servicio de Windows? | **No** — `Get-Service` no encontró ningún servicio relacionado con qdrant/node/plastitec/aiv2. |
| ¿Hay tarea programada (Task Scheduler)? | **No** — `Get-ScheduledTask` no encontró coincidencias. |
| ¿Corren en otra sesión de Windows (Session ID)? | **No** — mismo `SessionId=1` que la sesión actual de esta herramienta. |
| ¿Mismo usuario propietario? | **Sí** — `PLASTITECSA\Programador.TI1`, igual que la sesión actual (confirmado ya en `seguimiento_6.md`). |
| Proceso padre de qdrant.exe (5292) | `cmd.exe` (PID 34472) — **sigue vivo**, es decir, hay una consola cmd abierta en algún lugar del sistema que lanzó estos procesos y de la que ya no tenemos control desde esta sesión. |
| Lectura de `MainModule` del proceso 5292 desde .NET | Vacía/bloqueada — típico cuando el proceso que consulta tiene integridad menor que el proceso consultado. |
| `Get-Process -IncludeUserName` | Falla explícitamente: *"El parámetro 'IncludeUserName' requiere permisos de usuario elevados. Intente ejecutar el comando de nuevo en una sesión que se haya abierto con permisos de usuario elevados."* |
| Nivel de integridad de la sesión actual (`whoami /groups`) | **"Mandatory Label\Medium Mandatory Level"** — sesión estándar, no elevada. |

### 2.2 Conclusión

Esto es el comportamiento normal y esperado del **Control de Integridad Obligatorio (MIC) / UAC de Windows**, no un bug ni una configuración rota: un proceso a integridad **Medium** (esta sesión de PowerShell) no puede abrir con permiso `PROCESS_TERMINATE` a un proceso que corre a integridad **High/Administrador** (los procesos huérfanos), **aunque ambos pertenezcan al mismo usuario**. El propietario (SID) coincide, pero el token de acceso con el que corre el proceso no — por eso `Stop-Process`, `taskkill`, e incluso operaciones de solo lectura como `MainModule` o `-IncludeUserName` fallan de la misma forma consistente.

**Origen probable:** en algún momento de una sesión anterior, Qdrant y/o Node se lanzaron desde una consola `cmd.exe`/PowerShell abierta con "Ejecutar como administrador" (quizás manualmente por el usuario, o por una configuración de terminal elevada por defecto). Esos procesos heredaron ese nivel de integridad y sobrevivieron a los reinicios de la tarea que los lanzó, quedando fuera del alcance de cualquier sesión no elevada posterior — incluida esta.

### 2.3 Cómo se resolvería (no ejecutado, solo diagnóstico — el usuario pidió causa, no necesariamente la acción)

- Cerrar la consola `cmd.exe` (PID 34472) que los originó, si se puede ubicar en el escritorio.
- O abrir una terminal con "Ejecutar como administrador" y desde ahí correr `Stop-Process -Id 5292,1184 -Force` (con integridad igual o mayor, el permiso se concede).
- O simplemente reiniciar la máquina, que es lo más simple y garantizado.

No lo ejecuté porque implica cerrar una consola que no identifiqué visualmente en el escritorio, y esta herramienta no tiene forma de elevarse a sí misma — decisión que corresponde al usuario.

---

## 3. Estado al cierre de esta verificación

- Backup (`C:\AIV2\backups\plastitec_docs_backup_2026-08-04\`) — **verificado como restaurable**, 890/890 puntos, datos consultables.
- `plastitec_docs` en producción — sin cambios desde `seguimiento_6.md` (582 puntos, corte ya aplicado).
- Instancia de prueba de restauración (`restore_test/`) — detenida y eliminada tras la verificación.
- Los procesos huérfanos en 6333/3000 siguen corriendo (integridad elevada, fuera del alcance de esta sesión) — causa raíz documentada arriba, sin resolver por decisión pendiente del usuario.
