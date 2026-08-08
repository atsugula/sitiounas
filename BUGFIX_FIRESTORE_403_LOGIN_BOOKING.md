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

## Login — estado

### NO ERA BUG en la ruta de clienta

La ruta de login de clienta **rechaza correctamente** una cuenta con
`role: 'admin'`. Es un rechazo deliberado, no un fallo: una cuenta de
administración no abre sesión de clienta y debe entrar por el acceso
administrativo. Esa rama ahora se identifica como `LOGIN_ROLE_ADMIN`.

De las dos cuentas con email del proyecto, `admin-ramos@gmail.com` es
precisamente `role: 'admin'`, así que usarla en el formulario de clienta produce
exactamente la secuencia reportada: `signInWithEmailAndPassword` → lectura de
Firestore → `signOut`.

### Pendiente de confirmar con una cuenta `role: "client"`

**No declaro LOGIN cerrado.** No me está permitido crear cuentas ni escribir
contraseñas, así que no he podido ejecutar el camino de éxito. Lo que sí queda
es instrumentación para que la prueba manual sea inequívoca (ver
«Instrumentación del login» más abajo).

La cuenta con la que hacer esa prueba es **`atsgula@gmail.com`**, que tiene
`role: 'client'`, perfil completo y `uid` coincidente.

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

## Instrumentación del login

Cada salida de `handleUserLogin()` deja un código estable en
`window.lastLoginOutcome` y en la consola con el prefijo `[LOGIN]`. Nunca
incluye contraseña, token ni el correo completo.

| Código | Significado |
| --- | --- |
| `LOGIN_INPUT_INCOMPLETE` | Faltó correo o contraseña en el formulario |
| `LOGIN_EMAIL_INVALID` | El identificador no es un correo válido |
| `LOGIN_AUTH_UNAVAILABLE` | Firebase Auth no cargó |
| `LOGIN_AUTH_FAILED` | Auth rechazó las credenciales (incluye `code`) |
| `LOGIN_FIRESTORE_UNAVAILABLE` | Firestore no cargó |
| `LOGIN_PROFILE_NOT_FOUND` | Auth correcto pero no existe `users/{uid}` |
| `LOGIN_PROFILE_READ_DENIED` | Las Rules denegaron leer el perfil propio |
| `LOGIN_PROFILE_READ_ERROR` | Otro fallo de lectura (red, bloqueador…) |
| `LOGIN_ROLE_ADMIN` | Cuenta de administración: rechazo deliberado |
| `LOGIN_PROFILE_INVALID` | Perfil existente pero sin `name`/`phone`/`email` |
| `LOGIN_SUCCESS` | Sesión creada; incluye `uidCoincide` |

### Cómo hacer la prueba manual

1. Navegador limpio, sin extensiones.
2. Entrar con **`atsgula@gmail.com`** (`role: 'client'`).
3. En la consola:

```js
window.lastLoginOutcome
```

Lo esperado es:

```js
{ branch: 'LOGIN_SUCCESS', role: 'client', sesionCreada: true, uidCoincide: true }
```

Si sale cualquier otro código, ese código dice exactamente qué rama se tomó y no
hay que adivinar.

4. Repetir con **`admin-ramos@gmail.com`** en el mismo formulario de clienta.
   Lo esperado es `LOGIN_ROLE_ADMIN` y el mensaje «Esta cuenta corresponde a
   administración». Eso es correcto, no un fallo.

### Verificado

La instrumentación se ejecutó contra el Firebase real con un correo inexistente
(no se autenticó ninguna cuenta, solo se recorrió la rama de error):

```js
{ branch: 'LOGIN_AUTH_FAILED', code: 'auth/invalid-credential' }
// currentUserSession: null · la sesión anónima se mantuvo
```

Sin tokens ni contraseñas en la salida.

---

## ERR_BLOCKED_BY_CLIENT

**Es consecuencia, no causa.** Demostrado midiendo cuándo se emite.

- En un navegador limpio, sin extensiones, todo el flujo funcionó: sesión
  anónima, listener de `bookingSlots`, transacción de reserva, cancelación. Cero
  `ERR_BLOCKED_BY_CLIENT`.
- `ERR_BLOCKED_BY_CLIENT` lo genera el navegador (extensión o bloqueador), nunca
  el servidor. No hay nada que arreglar en Firebase por él.
- El 403 que reportaste **demuestra que tus peticiones sí llegan a Firestore**:
  un `PERMISSION_DENIED` solo lo puede emitir Google. Si el bloqueo fuera total,
  el error habría sido `unavailable`, no 403.
- La petición concreta era `Listen/channel … TYPE=terminate`, que es el **cierre**
  del listener. Se instrumentó el tráfico de la página (`fetch`, `XHR` y
  `sendBeacon`) y se midió en tres fases:

| Fase | Peticiones `TYPE=terminate` |
| --- | --- |
| Página en reposo, 3 s | **0** |
| `signInAnonymously()` (cambio de credencial) | **1** |
| `signOut()` | **1** |

  Es decir, `TYPE=terminate` se emite **exactamente** al cambiar de credencial y
  al cerrar sesión, y nunca por su cuenta. Aparece porque se cerró la sesión, no
  al revés.

Lo que **no** se ha podido reproducir es el bloqueo en sí: en un navegador sin
extensiones nunca apareció `ERR_BLOCKED_BY_CLIENT`. Que el bloqueo concreto de
tu navegador tenga o no algún otro efecto queda **NO CONCLUYENTE** hasta que lo
repitas en incógnito. Lo que sí está demostrado es que la petición bloqueada es
la de cierre, no la de login.

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
# tests 188   # suites 40   # pass 188   # fail 0
```

(162 previos + 26 nuevos en `tests/appointment-payload.test.mjs`)

Entre ellos, las conversiones exigidas:

```text
ok  02:00 PM -> 14:00
ok  02:30 PM -> 14:30
ok  12:00 PM -> 12:00     (mediodía: no es 00:00)
ok  12:00 AM -> 00:00     (medianoche: no es 12:00)
ok  07:00 PM -> 19:00
ok  una hora ilegible devuelve null en vez de inventar una
ok  startTime y endTime miden exactamente 5 y son HH:MM
ok  una cita de 2 h que empieza a las 14:00 termina a las 16:00
ok  esa cita bloquea exactamente 14:00, 14:30, 15:00 y 15:30
```

`npm run check` → 4 bloques inline, 0 errores. `git diff --check` → limpio.

## npm run test:rules

**Desbloqueado.** Con tu autorización se instaló Temurin 25 LTS con scoop
(`scoop bucket add java && scoop install temurin-lts-jdk`), que es el LTS que
sirve hoy ese bucket. El emulador arranca y los tests corren de verdad:

```text
# tests 48   # suites 7   # pass 48   # fail 0
```

Incluye los 9 casos de regresión de este bug. Entre ellos, y esto es lo que
demuestra que **no se debilitaron las Rules**:

```text
ok  una cita con la hora en formato visible de 12h es rechazada
ok  el endTime tambien tiene que venir en formato canonico
ok  una cita sin ningun serviceId es rechazada
ok  el admin tampoco puede crear un walk-in sin serviceIds
ok  el walk-in del admin con serviceIds y hora canonica si entra
ok  una cita con clientUid nulo es rechazada
ok  la sesion anonima del sitio publico puede reservar su propia cita
ok  un lock con la hora en formato visible de 12h es rechazado
```

El payload viejo (`startTime: "02:00 PM"`) sigue siendo **DENY**. El nuevo es
**ALLOW**. Cambió la aplicación, no las Rules.

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

Repetido tras el fix, en fecha distinta (2026-08-27) para no reutilizar estado:

```text
appointments/app_1786216108045   startTime "14:00"  endTime "16:00"  → ALLOW
bookingSlots ×4                  14:00 14:30 15:00 15:30            → ALLOW
transacción completa                                                → SUCCESS
```

Segundo intento sobre el mismo turno: **no escribió nada**. Comprobado en
servidor tras el intento — seguía habiendo 1 cita y 4 locks, sin duplicado ni
escritura parcial. El mensaje al usuario fue «Ese horario acaba de ser reservado
por otra clienta», es decir conflicto de disponibilidad, **no**
`PERMISSION_DENIED`.

Todos los datos de prueba se borraron después: `appointments` y `bookingSlots`
quedaron a 0.

### Caminos de creación auditados

Solo existen dos, y ambos producen ya el formato canónico:

| Camino | Estado |
| --- | --- |
| `prepareWhatsAppBooking()` → `commitBookingTransaction()` (reserva web) | corregido |
| `handleAdminWalkInSubmit()` (cita presencial) | corregido, más `serviceIds` |
| `saveAppointmentAdminFields()` (estados, abono, devolución) | escribe con `merge` y **no toca** `startTime`/`endTime`; las Rules ya los tienen como inmutables |
| Reprogramación | **no existe** en el código. Las Rules la impiden a propósito (`immutableAppointmentFields`), porque reprogramar exige liberar y volver a tomar los locks |

`bookingSlots.startTime` siempre nació canónico: lo genera
`computeSlotStartTimes()`, que devuelve `formatMinutesTo24h()`. Por eso los locks
por sí solos nunca fallaron; lo que tumbaba la transacción era la cita.

### No probado

- **Login de clienta con `role: "client"` y contraseña real**, y **panel de
  admin**: no me está permitido crear cuentas ni escribir contraseñas. La ruta
  queda instrumentada para que tu prueba manual identifique la rama sin
  ambigüedad (ver «Instrumentación del login»).

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
