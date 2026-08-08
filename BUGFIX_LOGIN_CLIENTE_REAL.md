# Login cliente — Bugfix real

Fecha: 2026-08-08 · Proyecto `ramos-nails` · `salonId` `nails-con-val`
HEAD al empezar: `144dfe6`

---

## Resumen en una línea

**La base de datos de Firestore había sido eliminada del proyecto.** Toda lectura
devolvía `unavailable`, y nuestro código convertía ese fallo de red en un
`signOut()`, expulsando a una clienta cuyo login Firebase sí había funcionado.

---

## Síntoma reproducido

Tu propia traza lo cerró:

```json
{ "branch": "LOGIN_PROFILE_READ_ERROR", "code": "unavailable" }
```

Reproducido después en mi navegador limpio, sin extensiones:

```text
[warn] No pudimos sincronizar la disponibilidad:
       FirebaseError: The database 'ramos-nails' does not exist.
getDoc(users/{uid}) → unavailable :: Failed to get document because the client is offline.
```

Y confirmado fuera del navegador, contra la API de Google:

```text
$ npx firebase firestore:databases:list --project ramos-nails
No databases found.

$ npx firebase firestore:databases:get "(default)" --project ramos-nails
HTTP Error: 404, Project 'ramos-nails' or database '(default)' does not exist.
```

Esa misma base existía horas antes: se leyó, se escribió una cita real y se
crearon cuatro locks. Entre medias desapareció.

---

## Línea exacta que hacía signOut

`index.html:6764` en el HEAD `144dfe6`:

```js
} catch (cloudErr) {
    traceLoginOutcome(
        cloudErr?.code === 'permission-denied' ? 'LOGIN_PROFILE_READ_DENIED' : 'LOGIN_PROFILE_READ_ERROR',
        { code: cloudErr?.code || 'sin-codigo' }
    );
    showToast(getProfileReadErrorMessage(cloudErr), "error");
    if (window.firebaseAuthUtils && window.firebaseAuthUtils.signOut) {
        await window.firebaseAuthUtils.signOut(window.authInstance).catch(() => { });  // ← 6764
    }
    return;
}
```

### Todos los `signOut()` de `handleUserLogin`, en el código real

| # | Línea (antes) | Condición | Motivo | ¿Correcto? |
| --- | --- | --- | --- | --- |
| A | 6728 | `window.dbInstance` / `firestoreUtils` no cargaron | No se puede verificar el rol | Sí |
| B | 6748 | `!docSnap.exists()` — no hay `users/{uid}` | Sin perfil no hay sesión de clienta | Sí |
| C | **6764** | **cualquier error leyendo el perfil, incluido `unavailable`** | — | **NO. Este era el bug.** |
| D | 6776 | `role === 'admin'` | Rechazo deliberado de la ruta de clienta | Sí |
| E | 6797 | falta `name`, `phone` o `email` en el perfil | Perfil inservible | Sí |

## Condición que se cumplía erróneamente

C. `cloudErr.code === 'unavailable'` es **transitorio**: dice que el cliente de
Firestore no pudo hablar con el servidor. No dice nada sobre la identidad ni
sobre los permisos de quien acaba de entrar. Tratarlo como fatal convertía una
caída de infraestructura en un cierre de sesión.

## Causa raíz

Dos capas, ambas reales:

1. **Infraestructura**: la base `(default)` de Firestore fue eliminada de
   `ramos-nails`. Sin ella, *cualquier* clienta recibe `unavailable`.
2. **Frontend**: `handleUserLogin` no distinguía «no puedo leer ahora» de «no
   debes entrar», y ante el primero cerraba la sesión.

Arreglar solo la 1 dejaría la bomba puesta para el próximo corte de red.
Arreglar solo la 2 dejaría la aplicación sin base de datos. Se arreglan las dos.

---

## Firebase Auth

Las 7 cuentas de Authentication **sobrevivieron**: Auth y Firestore son servicios
distintos y borrar la base no toca las cuentas.

| UID | Email | Estado |
| --- | --- | --- |
| `wm6KOnTo0kd3OMiXqCNGKKLEKQd2` | admin-ramos@gmail.com | activa |
| `zNyQWcgSMfPEyeYlZExFjrFI9jn2` | atsgula@gmail.com | activa |
| otras 5 | (anónimas) | activas |

## users/{uid}

Los tres perfiles anteriores se perdieron con la base. Recreados con los mismos
UID de Authentication:

```text
users/wm6KOnTo0kd3OMiXqCNGKKLEKQd2   role admin    salonId nails-con-val
users/zNyQWcgSMfPEyeYlZExFjrFI9jn2   role client   salonId nails-con-val
```

Verificado tipo por tipo en el documento real:

```json
{
  "docId": "zNyQWcgSMfPEyeYlZExFjrFI9jn2",
  "docIdEsUid": true,
  "uidCampo": "zNyQWcgSMfPEyeYlZExFjrFI9jn2",
  "role": "client",
  "salonId": "nails-con-val",
  "bookedCountTipo": "integerValue",
  "bookedCountValor": "0",
  "claves": "birthdate,bookedCount,createdAt,email,name,phone,role,salonId,uid"
}
```

`role` es exactamente `"client"` en minúscula, `bookedCount` es entero y no
cadena, y las nueve claves son las que permite `validProfileShape()`.

**`name` y `phone` son provisionales** (`Clienta Ramos Nails` / `0000000000`)
porque los originales se perdieron y no me corresponde inventar tus datos. Se
corrigen desde «Mi Perfil» en la web, que ya funciona.

---

## Carrera onAuthStateChanged

Auditada. `handleUserLogin` y `onAuthStateChanged` leen los dos el perfil al
entrar, pero **ninguno de los dos cierra sesión** por su cuenta:
`hydrateClientSession()` solo limpia la sesión *local* si el perfil no existe, y
ante un error de lectura se limita a avisar. No se encontró ninguna carrera que
provoque `signOut()`.

## signInAnonymously

**Aquí sí había un segundo bug, y rompía la persistencia tras recargar.**

Antes, en `assets/js/firebase.js`, al cargar el módulo:

```js
signInAnonymously(auth).then(...)   // sin ninguna condición
```

`signInAnonymously()` no respeta al usuario actual: si había una clienta con
sesión persistida, la sustituía por un anónimo nuevo. Es decir, **recargar la
página deslogueaba a la clienta**, exactamente el punto 21 de tu lista.

Ahora la decisión se toma dentro de `onAuthStateChanged`, que es el único
momento en que Firebase ya restauró la sesión guardada:

```js
function ensureAnonymousSession(user) {
    if (user || anonymousSignInInFlight) return;
    ...
}
```

Regla resultante: sin usuario → anónimo; con clienta → se mantiene; con admin →
se mantiene.

---

## Cambio realizado

| Fichero | Cambio |
| --- | --- |
| `assets/js/firebase.js` | `getFirestore()` → `initializeFirestore(app, { experimentalAutoDetectLongPolling: true })` |
| `assets/js/firebase.js` | `signInAnonymously()` deja de ser incondicional; se decide en `onAuthStateChanged` |
| `assets/js/firebase.js` | `window.RAMOS_BUILD` para descartar cache o carpeta equivocada |
| `index.html` | `readClientProfileWithRetry()`: 3 intentos con espera creciente; `permission-denied` no se reintenta |
| `index.html` | El error transitorio **conserva la sesión**; solo `permission-denied` cierra |
| `index.html` | Nueva rama `LOGIN_UID_MISMATCH`: se comprueba que el id del documento y el campo `uid` coinciden con la sesión |
| `index.html` | Mensaje de `unavailable` reescrito: dice que la sesión sigue abierta |

`experimentalAutoDetectLongPolling` merece una nota: el transporte por defecto de
Firestore es un canal WebChannel de larga duración, y los bloqueadores y algunos
proxies lo cortan (`ERR_BLOCKED_BY_CLIENT`). Con esta opción el SDK detecta el
corte y cae a long polling. **No toca la seguridad**: mismas credenciales, mismas
Rules, mismos datos; solo cambia cómo viajan.

### Infraestructura

```text
firebase firestore:databases:create "(default)" --location us-east1 --project ramos-nails
firebase deploy --only firestore:rules      → released rules to cloud.firestore
firebase deploy --only firestore:indexes    → deployed successfully
```

Ubicación `us-east1`, elegida por ti. **No se puede cambiar después.**

`firestore.rules` **no se modificó**: se desplegó el fichero tal cual estaba.

---

## Login manual después del fix

✅ **PASS.** Prueba manual del usuario con `atsgula@gmail.com` (`role: client`),
contraseña real escrita por él, 2026-08-08T20:14:18Z:

```json
{
  "branch": "LOGIN_SUCCESS",
  "at": "2026-08-08T20:14:18.032Z",
  "role": "client",
  "sesionCreada": true,
  "uidCoincide": true
}
```

Lo que demuestra, punto por punto:

| Comprobación | Evidencia |
| --- | --- |
| Firebase Auth acepta | se llegó a una rama posterior a `signInWithEmailAndPassword` |
| `users/{uid}` se leyó | se llegó a evaluar `role`, que sale del documento |
| `role === 'client'` | `role: "client"` |
| Sesión de app creada | `sesionCreada: true` |
| `currentUserSession.uid === auth.currentUser.uid` | `uidCoincide: true` |
| **No hubo `signOut()`** | la rama final es `LOGIN_SUCCESS`, no `LOGIN_PROFILE_READ_ERROR` |

Antes del arreglo, esa misma cuenta daba
`{ branch: "LOGIN_PROFILE_READ_ERROR", code: "unavailable" }` seguido de
`signOut()`.

**Nota sobre el resto de la cadena:** la sesión vive en el navegador del usuario,
no en el que yo controlo, así que las comprobaciones de persistencia a 5 s,
recarga, perfil y reserva autenticada las tiene que ejecutar él. Quedan abajo
como pendientes explícitos: no las declaro PASS sin haberlas visto.

> **El sitio está en `http://localhost:5183`, no en 5173.** Windows tiene el
> puerto 5173 en su rango reservado y el servidor no puede enlazarlo.

Comprobado antes de dejártelo, con sesión anónima:

```json
{
  "build": { "commit": "144dfe6+login-fix", "loginDebug": "v3", "firestoreTransport": "autoDetectLongPolling" },
  "proyecto": "ramos-nails",
  "lecturaPublica": "OK exists=false",
  "lecturaPerfilAjenoDesdeAnonimo": "permission-denied (correcto)"
}
```

Firestore vuelve a responder y las Rules siguen protegiendo los perfiles ajenos.

## Persistencia después de reload

⏳ Pendiente de la misma prueba. El bug que la rompía (`signInAnonymously`
incondicional) está corregido en el código.

## Perfil

⏳ Pendiente. `name` y `phone` saldrán provisionales hasta que los edites.

## Reserva autenticada

⏳ Pendiente. El flujo de reserva quedó verificado en el bugfix anterior con
sesión anónima (cita + 4 locks + cancelación); falta repetirlo con sesión de
clienta real para confirmar que `appointments.clientUid === auth.currentUser.uid`.

---

## ERR_BLOCKED_BY_CLIENT

**Consecuencia, y además no era la causa de tu login.** La causa era la base de
datos borrada. Medido en el bugfix anterior instrumentando `fetch`, `XHR` y
`sendBeacon`: `TYPE=terminate` aparece 0 veces en reposo, 1 al cambiar de
credencial y 1 al cerrar sesión. Es el cierre del listener.

Con la base restaurada y `autoDetectLongPolling` activo, si tu bloqueador cortaba
el WebChannel el SDK ahora cambia de transporte por su cuenta. No se tocó nada de
Firestore por ese error.

## Pendientes separados, fuera de este bugfix

- `/assets/brand/ramos-nails-hero.webp` → 404. Es branding, no login.
- `firebase-*.js.map` bloqueados por CSP: son source maps de depuración. No se
  afloja la CSP por ellos.

---

## Tests finales

```text
npm test              # tests 188   # pass 188   # fail 0
npm run test:rules    # tests 48    # pass 48    # fail 0
npm run test:rules:api  # casos 35  # pass 35    # fail 0
npm run check         4 bloques inline, 0 errores
git diff --check      limpio
```

Verdes, pero **eso no cierra este bug**: el criterio es tu login manual.
