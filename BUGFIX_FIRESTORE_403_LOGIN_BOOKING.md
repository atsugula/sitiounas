# Bugfix Firestore 403 — Login y reservas

Fecha: 2026-08-08 · Rama `mejora-v2` · Proyecto `ramos-nails` · `salonId` `nails-con-val`

**`firestore.rules` no se ha modificado.** El arreglo consiste en que la
aplicación escriba lo que las Rules ya exigían, no en relajar las Rules.

---

## Síntomas

1. Al reservar, Firestore devolvía `403 PERMISSION_DENIED`.
2. El login de clienta hacía `signInWithEmailAndPassword` → lectura de Firestore
   → `signOut` dentro de `handleUserLogin`.
3. En la consola aparecía `net::ERR_BLOCKED_BY_CLIENT` sobre
   `Firestore/Listen/channel ... TYPE=terminate`.

---

## Causa raíz del booking

**El formato de la hora.** `startTime` y `endTime` se guardaban con el texto
visible de 12 horas (`"02:00 PM"`, 8 caracteres) y `validAppointmentShape()`
exige `isShortString(startTime, 5)` — 5 caracteres, que es el formato canónico
`"HH:MM"` con el que `assets/js/booking-slots.js` construye los ids de los
locks. La cita se rechazaba entera y, al estar dentro de `runTransaction`, se
caía también la creación de los locks: ninguna clienta podía reservar.

El origen es `ALL_TIME_SLOTS` en `assets/js/availability.js`, que son cadenas de
12 horas (`'08:00 AM'` …). `prepareWhatsAppBooking()` las copiaba tal cual a
`startTime` y derivaba `endTime` con `formatMinutesToTimeString()`, que también
devuelve 12 horas.

### Demostrado, no supuesto

Contra el proyecto real, misma sesión, mismo payload, cambiando **solo** la hora:

```text
startTime "02:00 PM" / endTime "04:00 PM"  → permission-denied :: Missing or insufficient permissions.
startTime "14:00"    / endTime "16:00"     → ESCRITURA ACEPTADA
```

Y en la Rules Test API sobre `firestore.rules`:

```text
DENY   reserva: hora en formato visible de 12 h (BUG)
DENY   reserva: endTime de 12 h
ALLOW  reserva: payload real de la clienta
```

### Segundo fallo, en la cita presencial del admin

`handleAdminWalkInSubmit()` escribía `serviceIds: []`, y la Rule exige
`serviceIds.size() >= 1`. El walk-in estaba roto por partida doble: hora en 12
horas **y** lista de servicios vacía. No aparecía en el informe porque nadie lo
había probado contra las Rules reales.

### Tercer fallo, en la cancelación

`renderAdminCharts()` usaba `promoTableBody` sin declararla nunca →
`ReferenceError`. Como `requestClientCancellation()` llama a esa función, la
cancelación sí liberaba los locks en Firestore pero petaba justo después, así
que la clienta no llegaba a ver la confirmación.

---

## Causa raíz del login

**No hay ninguna.** La hipótesis del punto 7 (cuenta de Auth sin
`users/{uid}`) se comprobó y **queda refutada** para las cuentas que existen hoy:

| Auth UID | Email | `users/{uid}` | `uid` campo | `salonId` | `role` |
| --- | --- | --- | --- | --- | --- |
| `wm6KOnTo…` | admin-ramos@gmail.com | existe | == docId | `nails-con-val` | `admin` |
| `zNyQWcgS…` | atsgula@gmail.com | existe | == docId | `nails-con-val` | `client` |

Los tres valores (Authentication UID, id del documento y campo `uid`) coinciden
en ambos casos, y los dos perfiles tienen las nueve claves con los tipos
correctos. Las otras 5 cuentas de Auth son anónimas y no deben tener perfil.

Además:

- Las Rules **sí están desplegadas** en `ramos-nails` (se comprobó leyendo el
  ruleset publicado y comparándolo con `firestore.rules`: idénticos salvo una
  línea en blanco final). La hipótesis "siguen las Rules restrictivas iniciales"
  queda descartada con evidencia.
- La Rules Test API confirma `ALLOW` para que una clienta lea su propio perfil y
  `DENY` para el de otra. No hay dependencia circular.
- Todas las cuentas de Auth se crearon **después** del primer despliegue de
  Rules (17:36:51Z), así que ninguna quedó huérfana por escribir bajo las reglas
  restrictivas iniciales.

Con esos datos, el `signOut` observado solo puede venir de una de las ramas
declaradas de `handleUserLogin`, y la más probable es la deliberada:
**`admin-ramos@gmail.com` tiene `role: 'admin'`, y el formulario de clienta
cierra la sesión a propósito** con el mensaje «Esta cuenta corresponde a
administración. Usa el acceso administrativo.»

No puedo confirmarlo por reproducción: **no me está permitido crear cuentas ni
escribir contraseñas**, así que el login con credenciales reales tienes que
probarlo tú. Para que la próxima vez la causa sea evidente sin adivinar, cada
rama de fallo ahora dice exactamente qué pasó (ver «Cambios realizados»).

### Un dato suelto que conviene mirar

`users/5NNTj4J4qYTS7SVmAqGIeS8iFu52` existe en Firestore con `role: 'client'`
pero **no tiene cuenta de Auth**. Es el caso inverso al del punto 7: parece una
cuenta de prueba cuyo Auth se borró. No la he tocado — borrar datos reales no es
una decisión automática.

---

## ERR_BLOCKED_BY_CLIENT

**Es consecuencia, no causa.**

- En un navegador limpio, sin extensiones, todo el flujo funcionó: sesión
  anónima, listener de `bookingSlots`, transacción de reserva, cancelación. Cero
  `ERR_BLOCKED_BY_CLIENT`.
- `ERR_BLOCKED_BY_CLIENT` lo genera el navegador (extensión o bloqueador), nunca
  el servidor. No hay nada que arreglar en Firebase por él.
- El 403 que reportaste **demuestra que tus peticiones sí llegan a Firestore**:
  un `PERMISSION_DENIED` solo lo puede emitir Google. Si el bloqueo fuera total,
  el error habría sido `unavailable`, no 403.
- La petición concreta era `Listen/channel … TYPE=terminate`, que es el **cierre**
  del listener y se dispara justo al hacer `signOut`. Aparece porque se cerró la
  sesión, no al revés.

Comprobación pendiente por tu parte: repetir el login en incógnito y sin
bloqueadores. Si el mensaje cambia, el nuevo texto ya te dirá cuál es la rama.

---

## Rules involucradas

Ninguna modificada. Las que decidían el rechazo:

```text
match /appointments/{appointmentId}
  validAppointmentShape():
    isShortString(incoming().startTime, 5)   ← rechazaba "02:00 PM"
    isShortString(incoming().endTime, 5)     ← rechazaba "04:00 PM"
    incoming().serviceIds.size() >= 1        ← rechazaba el walk-in

match /users/{userId}
  allow get: if isUser(userId) || isAdmin()  ← permite leer el perfil propio
```

---

## Código involucrado

| Fichero | Función |
| --- | --- |
| `index.html` | `prepareWhatsAppBooking()`, `handleAdminWalkInSubmit()`, `handleUserLogin()`, `handleUserRegister()`, `hydrateClientSession()`, `renderAdminCharts()` |
| `assets/js/availability.js` | `ALL_TIME_SLOTS` (origen del formato de 12 h) — sin cambios |
| `assets/js/booking-slots.js` | `formatMinutesTo24h()`, `computeSlotIdsForAppointment()` — sin cambios |

---

## Cambios realizados

1. **`toCanonicalTime()`** nueva en `index.html`: convierte la hora visible al
   formato canónico de 24 h.
2. **`prepareWhatsAppBooking()`**: `startTime` y `endTime` se guardan en 24 h.
   `time` conserva el texto de 12 h, que es lo que lee toda la UI — por eso la
   clienta no ve ningún cambio.
3. **`handleAdminWalkInSubmit()`**: misma normalización, y `serviceIds` se
   resuelve contra el catálogo por nombre, con `['presencial']` como respaldo en
   vez de una lista vacía.
4. **`renderAdminCharts()`**: se declara `promoTableBody`, que faltaba.
5. **`handleUserLogin()`**: las tres ramas de fallo dejan de dar el mismo
   mensaje. Perfil ausente, sin permiso, red caída y perfil incompleto se
   distinguen, y se registra el `code` del error en consola (sin PII ni tokens).
   Nuevo helper `getProfileReadErrorMessage()`.
6. **`handleUserRegister()`**: si la cuenta se crea pero el perfil se rechaza, se
   dice explícitamente y con el motivo. No se anuncia como registro correcto.
7. **`hydrateClientSession()`**: deja rastro en consola en vez de limpiar la
   sesión en silencio.

No se implementó reconstrucción automática del perfil en el login: `name`,
`phone` y `birthdate` solo existirían en el navegador, y el navegador no es
autoridad sobre el perfil. Inventarlos habría sido peor que informar.

---

## Payload antes

```js
startTime: "02:00 PM",   // 8 caracteres → RECHAZADO
endTime:   "04:00 PM",   // 8 caracteres → RECHAZADO
time:      "02:00 PM"
serviceIds: []           // solo en el walk-in → RECHAZADO
```

## Payload después

```js
startTime: "14:00",      // canónico, igual que el id del lock
endTime:   "16:00",
time:      "02:00 PM"    // texto visible, sin restricción en Rules
serviceIds: ["mani_semi"]        // web
serviceIds: ["presencial"]       // walk-in sin coincidencia en catálogo
```

---

## Tests de Rules agregados

**`tools/check-rules-remote.mjs`** + `npm run test:rules:api` — 35 casos contra
la Rules Test API de Firebase. Existe porque el emulador necesita Java y esta
máquina no lo tiene: quedarse sin probar las Rules fue justo la ceguera que dejó
pasar el bug. No sustituye al emulador (no prueba secuencias con estado), lo
complementa.

**`tests/appointment-payload.test.mjs`** — 11 tests puros que fijan el contrato
entre `ALL_TIME_SLOTS` y los límites de las Rules. Habrían detectado el bug: el
test viejo usaba `'14:00'`, un valor que la aplicación nunca producía.

**`tests/firestore.rules.test.mjs`** — 8 casos nuevos para el emulador: hora en
12 h rechazada, `endTime` en 12 h rechazado, `serviceIds` vacío rechazado (como
clienta y como admin), walk-in correcto aceptado, `clientUid` nulo rechazado,
reserva anónima aceptada, lock con hora de 12 h rechazado.

---

## npm test

```text
# tests 173   # suites 40   # pass 173   # fail 0
```

(162 previos + 11 nuevos)

`npm run check` → 4 bloques inline, 0 errores. `git diff --check` → limpio.

## npm run test:rules

```text
Error: Could not spawn `java -version`. Please make sure Java is installed and on your system PATH.
```

⛔ **BLOQUEO EXTERNO — no ejecutado.** No hay JDK en la máquina (se buscó en
`JAVA_HOME` y en las rutas habituales de Windows). No afirmo que estos tests
pasen. Desbloqueo:

```text
winget install EclipseAdoptium.Temurin.21.JDK
```

## npm run test:rules:api

```text
# casos 35   # pass 35   # fail 0
```

Ejecutado de verdad contra `ramos-nails`.

---

## Prueba contra Firebase real

Sí, salvo lo que requiere contraseña. Navegador limpio, sesión anónima, proyecto
`ramos-nails`:

| Prueba | Resultado |
| --- | --- |
| Reserva de 2 h por el flujo real de la UI | `appointments/app_1786214173957` creada, `startTime: "14:00"`, `endTime: "16:00"`, `clientUid` = uid de la sesión, `salonId: nails-con-val` |
| Locks | **exactamente 4**: `…_2026-08-28_14:00`, `14:30`, `15:00`, `15:30` |
| Disponibilidad tras reservar | 13:30–15:30 bloqueados, 16:00 libre |
| Segundo intento sobre el mismo turno | «Ese horario acaba de ser reservado por otra clienta» — `SLOT_TAKEN`, **no** `permission-denied` |
| Cancelación | cita a `cancelada` y **los 4 locks borrados** |
| Turno tras cancelar | vuelve a aparecer libre |
| 403 | ninguno |

La cita de prueba se borró después; `appointments` y `bookingSlots` quedaron a 0.

### No probado

- **Registro y login de clienta con credenciales reales**, y **panel de admin**:
  no me está permitido crear cuentas ni escribir contraseñas. Te toca a ti. El
  código de esas rutas está revisado y los casos de Rules correspondientes están
  en verde, pero eso no es lo mismo que haberlo ejecutado.

---

## Rules desplegadas

**No.** No hacía falta: `firestore.rules` no se ha tocado y lo desplegado en
`ramos-nails` ya coincide con el fichero local. Desplegar habría sido ruido.

Además, el punto 21 condiciona el despliegue a que `npm run test:rules` esté en
verde, y ese comando está bloqueado por la falta de Java.

## Índices

**No desplegados**, por el mismo motivo. La única consulta que hace la clienta
(`where('clientUid','==',uid)`) es de campo único y Firestore la resuelve con el
índice automático; no apareció ningún error de índice en las pruebas reales.

---

## Riesgos

- Las citas creadas **antes** de este arreglo tendrían la hora en 12 h. No hay
  ninguna: `appointments` estaba vacía. Si aparecieran, `parseTimeToMinutes()`
  entiende los dos formatos, así que la aritmética de locks seguiría funcionando.
- `['presencial']` no es un id del catálogo. `getAppointmentDurationMinutes()`
  usa `durationMinutes` primero y cae al texto del servicio si no reconoce el
  id, así que degrada bien.
- El emulador sigue sin ejecutarse. Hasta que haya JDK, las secuencias con
  estado (crear → actualizar → borrar) no están cubiertas.

## Cosas no modificadas

`firestore.rules`, `firestore.indexes.json`, `firebase.json`, `.firebaserc`,
`salonId` (`nails-con-val`), `projectId` (`ramos-nails`), el diseño, la marca
visible, la fidelidad, y la lógica de Auth más allá de los mensajes de error.

No se usó Test Mode, ni `allow read, write: if true`, ni se hizo admin a nadie,
ni se creó a mano por Consola nada que deba crear la aplicación, ni se
reintrodujo `localStorage` como autoridad.
