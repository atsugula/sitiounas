# Cierre — Integración backend Ramos Nails

Fecha: 2026-08-08
Rama: `mejora-v2`
Marca visible: **Ramos Nails** · `projectId`: `nailsconval` · `salonId`: `nails-con-val`

> ⚠️ **SUPERSEDIDO EN PARTE.** Después de escribir este cierre, el salón creó su
> propio proyecto Firebase: el `projectId` pasó a **`ramos-nails`**. Este
> documento se conserva como registro histórico; **donde diga `nailsconval`,
> léase `ramos-nails`** (incluidos los comandos `--project=` de la última
> sección). Ver `CAMBIOS_CONEXION_FIREBASE_RAMOS_NAILS.md`.
> El `salonId` sigue siendo `nails-con-val`.

---

## Veredicto

> **NO se declara BACKEND FUNCIONANDO EN PRODUCCIÓN.**

Auth real, Firestore real y Rules reales **no han sido probados**, porque no hay
credenciales en esta máquina. Declararlo funcionando sería mentir.

Lo entregado es todo lo que no depende de credenciales, con el repositorio
consistente y el baseline verde.

---

## Estado por punto del plan

| # | Punto | Estado |
| --- | --- | --- |
| 1 | Precheck Git | ✅ Hecho |
| 2 | Entorno | ⚠️ Node/npm OK; **sin JDK**; Firebase CLI solo como binario local |
| 3 | Baseline (`npm install`, `test`, `check`) | ✅ Verde — 162 tests, 0 fallos |
| 4 | Rules (`npm run test:rules`) | ⛔ **BLOQUEO EXTERNO** — sin JVM no arranca el emulador |
| 5 | Proyecto real (`projects:list`, `use`) | ⛔ **BLOQUEO EXTERNO** — `firebase login` |
| 6 | Auth remoto (providers, dominios) | ⛔ **BLOQUEO EXTERNO** — sin Consola |
| 7 | Auditoría Firestore real | ⛔ **BLOQUEO EXTERNO** — herramienta lista, sin credenciales |
| 8 | Backup obligatorio | ⛔ **BLOQUEO EXTERNO** — no hay permiso para exportar |
| 9 | Migrador | ✅ Escrito y probado · ⛔ **no ejecutado** contra producción |
| 10 | Admin real | ⛔ **BLOQUEO EXTERNO** — requiere crear cuenta y contraseña |
| 11 | Settings | ⛔ **BLOQUEO EXTERNO** — auditable solo con acceso |
| 12 | E2E Firebase real | ⛔ **BLOQUEO EXTERNO** — protocolo escrito en Fase C |
| 13 | Deploy Rules | ⛔ **BLOQUEO EXTERNO** — depende de 4 y 5 |
| 14 | Deploy índices | ⛔ **BLOQUEO EXTERNO** — depende de 5 |
| 15 | QA de seguridad con Rules reales | ⛔ **BLOQUEO EXTERNO** — depende de 13 |
| 16 | Hosting | ⛔ **BLOQUEO EXTERNO** — depende de 15 |
| 17 | Cierre | ✅ Este documento |

---

## 1. Proyecto conectado

El **frontend ya estaba conectado** al proyecto real desde fases anteriores:
`assets/js/firebase.js` inicializa con `projectId: "nailsconval"`. No hizo falta
ningún cambio de código para conectar el sitio.

`.firebaserc` apunta a `nailsconval` y **no se ha modificado**. No se ha creado
ningún proyecto Firebase nuevo, ni siquiera uno llamado "Ramos Nails".

Lo que falta es operación: sesión de CLI, cuenta de servicio y Consola.

## 2. Providers de Auth

No verificados. Requeridos por el código actual: **Email/Password** (clientas y
admin) y **Anonymous** (`signInAnonymously()` para la sesión pública que permite
leer disponibilidad y publicar en el muro). Sin Anonymous habilitado, el sitio
público se degrada.

## 3. Backup

No realizado. No hay permiso ni credenciales para exportar. El migrador
**se niega a aplicar** sin una referencia de backup explícita.

## 4. Auditoría

`AUDITORIA_FIREBASE_REAL.md` — formulario listo, sin datos. Se genera con:

```bash
node tools/migrate-firebase-production.mjs --audit --json=auditoria.json
```

## 5. Migración

`tools/migrate-firebase-production.mjs` — escrito, con 25 tests verdes sobre su
lógica. **No ejecutado.** Detalle en `CAMBIOS_INTEGRACION_BACKEND_FASE_B.md` y
`REPORTE_MIGRACION_FIREBASE.md`.

## 6. Admin

No creado. Es una acción con contraseña y por tanto del usuario. El modelo es:
cuenta de Firebase Auth normal + `users/{uid}` con `uid` = uid de Auth,
`salonId: 'nails-con-val'` y `role: 'admin'`. Nunca una contraseña en Firestore.

## 7. Settings

No verificados. Los seis documentos de lectura pública (`custom_services`,
`discount_settings`, `schedule_blocks`, `gallery_items`, `marketing_popup`,
`payment_key`) e `income_goal`, que es solo de admin, están en la sección 7 de
`AUDITORIA_FIREBASE_REAL.md`. **La llave de pago real no se ha confirmado.**

## 8. Rules tests

**No ejecutados.** `tests/firestore.rules.test.mjs` existe y `npm run test:rules`
lo invoca, pero el emulador de Firestore es un binario Java y no hay JVM
instalada. No se afirma nada sobre su resultado.

## 9. E2E

No ejecutado. Protocolo completo en `CAMBIOS_INTEGRACION_BACKEND_FASE_C.md`.

## 10-12. Deploys

Rules, índices y Hosting: **ninguno desplegado**. No hay URLs nuevas que
reportar.

## 13. Commits

| Commit | Contenido |
| --- | --- |
| `0fcfdea` | `chore: validate firebase backend integration locally` |
| `4de32a9` | `feat: migrate legacy firestore data for production rules` |
| _(este)_ | `chore: complete Ramos Nails backend integration` |

Los dos ficheros sin seguimiento del usuario
(`INTEGRACION_BACKEND_RAMOS_NAILS.md`,
`PROMPT_AGENTE_INTEGRACION_FIREBASE_RAMOS_NAILS.md`) **no** se han tocado ni
commiteado.

## 14. Bloqueos

| # | Bloqueo | Desbloqueo |
| --- | --- | --- |
| 1 | No hay JDK → sin `test:rules` | `winget install EclipseAdoptium.Temurin.21.JDK` |
| 2 | Firebase CLI sin sesión → sin proyecto, auditoría, migración ni deploy | `npx firebase login` |
| 3 | Sin cuenta de servicio → el migrador no puede leer ni escribir | Crear service account (*Cloud Datastore User*) en `nailsconval`, JSON **fuera del repo**, y exportar `GOOGLE_APPLICATION_CREDENTIALS` |
| 4 | Sin Consola de Firebase → providers de Auth y dominios sin verificar | Acceso del propietario del proyecto |
| 5 | Sin permiso de export → no hay backup | Acceso a `gcloud firestore export` |

Ninguno se ha sorteado deformando el código, relajando Rules ni tocando
`salonId` / `projectId`.

## 15. Rollback

- **Código**: los tres commits de esta integración son aditivos y no tocan
  `index.html`, `firestore.rules` ni `firestore.indexes.json`.
  `git revert 4de32a9 0fcfdea` deja el repo como antes.
- **Datos**: no se ha escrito nada en Firestore, así que no hay nada que
  revertir. Cuando se ejecute la migración, el rollback es el import del export
  previo (procedimiento en `REPORTE_MIGRACION_FIREBASE.md`).
- **Deploy**: no se ha desplegado nada. Lo que hay en producción es lo mismo que
  había antes de empezar.

---

## Secuencia para terminar la integración

```bash
winget install EclipseAdoptium.Temurin.21.JDK
npx firebase login
npx firebase use
npm run test:rules                         # debe quedar en 0 fallos
```

Después, con `GOOGLE_APPLICATION_CREDENTIALS` apuntando a la cuenta de servicio:

```bash
node tools/migrate-firebase-production.mjs --audit --json=auditoria.json
gcloud firestore export gs://<bucket>/$(date +%F) --project=nailsconval
node tools/migrate-firebase-production.mjs --dry-run --json=plan-antes.json
node tools/migrate-firebase-production.mjs --apply --backup-verified="gs://<bucket>/<fecha>"
node tools/migrate-firebase-production.mjs --dry-run             # debe dar 0 acciones
```

Solo entonces, y tras el E2E de la Fase C:

```bash
npx firebase deploy --only firestore:rules
npx firebase deploy --only firestore:indexes
npx firebase deploy --only hosting
```

Con el QA de seguridad (anónimo / cliente A / cliente B / admin) hecho **entre**
el despliegue de Rules y el de Hosting, no después.
