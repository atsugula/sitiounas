# Reporte de migración de Firestore — Ramos Nails (`nailsconval`)

Estado: ⛔ **MIGRACIÓN NO EJECUTADA — BLOQUEO EXTERNO**
Fecha del intento: 2026-08-08

---

## Resumen honesto

**No se ha escrito ni un solo documento en Firestore de producción.**

Faltan las tres condiciones que la propia herramienta exige antes de tocar nada:

1. sesión de Firebase CLI (`npx firebase login`);
2. cuenta de servicio en `GOOGLE_APPLICATION_CREDENTIALS`;
3. backup/export previo confirmado.

Salida real de las barreras, en esta máquina:

```text
$ node tools/migrate-firebase-production.mjs --dry-run
ERROR: Falta GOOGLE_APPLICATION_CREDENTIALS. Exporta la ruta a la cuenta de
servicio (fuera del repositorio) antes de ejecutar. BLOQUEO EXTERNO.

$ node tools/migrate-firebase-production.mjs --apply
BLOQUEO: --apply exige --backup-verified="<referencia del export>".
```

Lo que sí está verificado es la **lógica** del migrador: 25 tests sobre el
planificador, verdes, dentro de `npm test` (162 tests en total). Ver
`CAMBIOS_INTEGRACION_BACKEND_FASE_B.md`.

---

## Lo que hará la migración cuando se ejecute

| Acción | Criterio | Reversible |
| --- | --- | --- |
| `SET_SALON_ID` | Solo si el campo falta. Un `salonId` distinto se reporta, no se pisa | Sí (backup) |
| `SET_CLIENT_UID` | Solo coincidencia única e inequívoca con un `users/{uid}` real | Sí (backup) |
| `CREATE_SLOT_LOCK` | Solo citas activas con fecha futura, y solo si el turno está libre | Sí (borrar el lock) |

No hay ninguna acción de borrado.

---

## Plantilla a rellenar con la ejecución real

### Backup

```text
Comando:  gcloud firestore export gs://<bucket>/<fecha> --project=nailsconval
Referencia: _(pendiente)_
Fecha/hora: _(pendiente)_
Verificado por: _(pendiente)_
```

### Dry-run previo

```text
$ node tools/migrate-firebase-production.mjs --dry-run --json=plan-antes.json
```

| Acción | Contadas |
| --- | --- |
| `SET_SALON_ID` | _(pendiente)_ |
| `SET_CLIENT_UID` | _(pendiente)_ |
| `CREATE_SLOT_LOCK` | _(pendiente)_ |

| No se toca | Contadas |
| --- | --- |
| `SIN_USUARIO_COINCIDENTE` | _(pendiente)_ |
| `COINCIDENCIA_AMBIGUA` | _(pendiente)_ |
| `FECHA_U_HORA_ILEGIBLE` | _(pendiente)_ |
| `DURACION_INVALIDA` | _(pendiente)_ |
| `LOCK_EN_CONFLICTO_NO_SE_CREA` | _(pendiente)_ |

| Conflictos | Contados | Decisión tomada |
| --- | --- | --- |
| `LOCK_OCUPADO_POR_OTRA_CITA` | _(pendiente)_ | _(pendiente)_ |
| `DOS_CITAS_ACTIVAS_MISMO_TURNO` | _(pendiente)_ | _(pendiente)_ |
| `SALON_ID_DISTINTO` | _(pendiente)_ | _(pendiente)_ |

### Apply

```text
$ node tools/migrate-firebase-production.mjs --apply --backup-verified="<ref>"

aplicadas: _(pendiente)_
fallidas:  _(pendiente)_
```

### Dry-run posterior (prueba de idempotencia)

```text
$ node tools/migrate-firebase-production.mjs --dry-run --json=plan-despues.json

Plan de migración: _(debe decir "0 acciones pendientes")_
```

Si este segundo dry-run no queda a cero, la migración **no** está terminada y no
se despliegan Rules.

---

## Rollback

1. Restaurar el export:
   `gcloud firestore import gs://<bucket>/<fecha> --project=nailsconval`
2. Alternativa quirúrgica para los locks: los documentos creados por el migrador
   son identificables por su id determinista
   (`nails-con-val_AAAA-MM-DD_HH:MM`) y por su `appointmentId`; se pueden borrar
   sin tocar nada más.
3. `salonId` y `clientUid` añadidos: el backup es la vía; el migrador no guarda
   el valor anterior porque el valor anterior era la ausencia del campo.
