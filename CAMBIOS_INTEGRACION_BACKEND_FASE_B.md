# Fase B — Migrador de datos legacy hacia el modelo de producción

Fecha: 2026-08-08
Rama: `mejora-v2`

`salonId` = `nails-con-val` · `projectId` = `nailsconval` · Marca = Ramos Nails.
Ninguno se ha modificado.

---

## Estado

| Parte | Estado |
| --- | --- |
| Herramienta de migración escrita | ✅ Hecho |
| Lógica del plan verificada con tests | ✅ 25 tests nuevos, verdes |
| Auditoría contra Firestore real | ⛔ **BLOQUEO EXTERNO** (sin credenciales) |
| Backup / export previo | ⛔ **BLOQUEO EXTERNO** (sin acceso al proyecto) |
| `--dry-run` contra producción | ⛔ **BLOQUEO EXTERNO** |
| `--apply` contra producción | ⛔ **BLOQUEO EXTERNO** — no ejecutado, por diseño |

Ver `CAMBIOS_INTEGRACION_BACKEND_FASE_A.md` para el detalle de los bloqueos.

---

## 1. Qué se ha añadido

### `tools/migrate-firebase-production.mjs`

Migrador de los datos históricos hacia lo que las Rules de la Fase 3 dan por
supuesto pero los datos antiguos no cumplen:

1. **`salonId` ausente** → se rellena con `nails-con-val`.
   Si el documento ya tiene *otro* `salonId`, **no se pisa**: se reporta como
   conflicto `SALON_ID_DISTINTO`.

2. **`clientUid` ausente en citas** → se resuelve **solo** si hay una única
   usuaria de Auth que coincida de forma inequívoca (teléfono normalizado a los
   últimos 9 dígitos, y/o email). Si hay cero candidatas, dos o más, o si la
   única candidata es un documento legacy `users/{telefono}` cuyo id no es un
   uid de Auth, la cita se deja intacta y se reporta.
   **Nunca se inventa un UID.**

3. **Locks ausentes en citas activas futuras** → se crean en `bookingSlots`
   usando `computeSlotIdsForAppointment()` importado de
   `assets/js/booking-slots.js`. No se reimplementa la aritmética de los 30
   minutos: si esa regla cambiara, cambia en un solo sitio y el migrador la
   sigue.

### `tests/migrate-plan.test.mjs`

25 tests sobre la lógica pura del planificador, con snapshots sintéticos.
Añadido a `npm test`.

### `package.json`

`firebase-admin` como `devDependency`. Es la única dependencia nueva y solo la
usa la herramienta de línea de comandos; el frontend no la carga.

---

## 2. Garantías de seguridad del migrador

| Requisito | Cómo se cumple | Test que lo prueba |
| --- | --- | --- |
| Seguro por defecto | Sin flags imprime el uso y sale con código 2. `--dry-run` y `--audit` no escriben nada | — |
| Backup obligatorio | `--apply` sin `--backup-verified="<ref>"` aborta con código 3 | verificado a mano (salida abajo) |
| Sin credenciales en código | Solo lee `GOOGLE_APPLICATION_CREDENTIALS`. Rechaza una cuenta de servicio situada dentro del repositorio, aunque `.gitignore` la cubra | — |
| Proyecto correcto | Comprueba que `.firebaserc` y el `project_id` de la cuenta de servicio son `nailsconval`. Si no, aborta | — |
| No inventa UID | Solo resuelve coincidencias únicas | `no inventa uid si no hay usuaria que coincida`, `aborta si dos usuarias comparten el teléfono`, `ignora usuarios legacy cuyo id no es un uid de Auth` |
| Aborta ambigüedades | Todo lo dudoso va a `skipped` con motivo explícito | idem |
| No sobrescribe locks en conflicto | Un turno reclamado por dos citas activas, o ya ocupado por otra cita, se retira del plan entero | `no pisa un lock que pertenece a otra cita`, `dos citas activas sobre el mismo turno: ninguna gana automáticamente` |
| Conflictos históricos no se auto-resuelven | Se reportan con `horizon: 'historico'` y no generan ninguna acción | `detecta el choque histórico entre dos citas sin resolverlo` |
| Idempotente | Con los locks ya creados y los campos ya puestos, el plan queda en 0 acciones | `es idempotente: con los locks ya creados no propone nada` |
| No borra nada | No hay ninguna llamada `delete()` en la herramienta. Locks huérfanos y obsoletos se reportan, no se limpian | `detecta locks huérfanos y obsoletos sin borrarlos` |
| Escrituras compatibles con Rules | El lock se crea con exactamente las 6 claves que permite `match /bookingSlots/{slotId}` | `el lock creado tiene exactamente la forma que aceptan las Rules` |
| Sin `localStorage` como fuente | La herramienta solo lee Firestore | — |
| Sin Telegram | No implementado, no mencionado | — |

Además, `--apply` usa `create()` para los locks, no `set()`: si alguien reserva
ese turno entre el plan y la escritura, la creación falla y se reporta, en vez
de pisar la reserva de una clienta real.

---

## 3. Verificación ejecutada

```text
$ npm test
# tests 162  # suites 36  # pass 162  # fail 0
```

(137 previos + 25 nuevos)

```text
$ npm run check
4 bloque(s) inline revisados en index.html, 0 con error.

$ git diff --check
(limpio)
```

Comprobación de las barreras de seguridad, sin credenciales en la máquina:

```text
$ node tools/migrate-firebase-production.mjs --dry-run
ERROR: Falta GOOGLE_APPLICATION_CREDENTIALS. Exporta la ruta a la cuenta de
servicio (fuera del repositorio) antes de ejecutar. BLOQUEO EXTERNO.

$ node tools/migrate-firebase-production.mjs --apply
BLOQUEO: --apply exige --backup-verified="<referencia del export>".
Haz primero un export de Firestore:
  gcloud firestore export gs://<bucket>/$(date +%F) --project=nailsconval
```

Las dos barreras funcionan. **No se ha ejecutado ninguna escritura contra
Firestore real.**

---

## 4. Procedimiento para cuando existan credenciales

Requisitos previos:

- `npx firebase login` hecho.
- Cuenta de servicio del proyecto `nailsconval` con rol *Cloud Datastore User*,
  descargada **fuera del repositorio**.

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/ruta/fuera/del/repo/serviceAccount.json"
```

### Paso 1 — Auditoría (no escribe)

```bash
node tools/migrate-firebase-production.mjs --audit --json=auditoria.json
```

Volcar los conteos en `AUDITORIA_FIREBASE_REAL.md`.

### Paso 2 — Backup obligatorio

```bash
gcloud firestore export gs://nailsconval-backups/$(date +%F) --project=nailsconval
```

Sin este paso, **no continuar**.

### Paso 3 — Dry-run

```bash
node tools/migrate-firebase-production.mjs --dry-run --json=plan-antes.json
```

Revisar `Conflictos` y `No se toca`. Los conflictos se resuelven a mano en la
consola antes de aplicar, no con el script.

### Paso 4 — Apply

```bash
node tools/migrate-firebase-production.mjs --apply --backup-verified="gs://nailsconval-backups/AAAA-MM-DD"
```

### Paso 5 — Prueba de idempotencia

```bash
node tools/migrate-firebase-production.mjs --dry-run --json=plan-despues.json
```

Debe reportar `0 acciones pendientes`. Si no, la migración no terminó y hay que
entender por qué antes de desplegar Rules.

Registrar la salida real de los pasos 1, 3, 4 y 5 en
`REPORTE_MIGRACION_FIREBASE.md`.

---

## 5. Qué NO hace esta fase

- No borra los documentos legacy `users/{telefono}`. Se reportan para que una
  persona decida; borrarlos es destructivo y no reversible sin el backup.
- No limpia locks huérfanos ni obsoletos. Mismo motivo.
- No resuelve choques de agenda entre dos citas.
- No crea cuentas de Auth ni promueve a nadie a admin (eso es la Fase 10 del
  plan, y va por Consola).
- No toca `index.html`, `firestore.rules`, `firestore.indexes.json` ni ningún
  fichero del frontend.
