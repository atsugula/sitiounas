# Fase 3 — Modelo Firestore y Security Rules

## Objetivo

Definir el modelo de datos objetivo de Cloud Firestore y escribir reglas de
seguridad de minimo privilegio que hagan de Firestore —y no del JavaScript del
navegador— la autoridad real de autorizacion.

Esta fase **no modifica `index.html`**. Produce el contrato de seguridad
(`firestore.rules`) y su banco de pruebas. La alineacion del frontend con ese
contrato es el trabajo de las Fases 4, 5 y 6.

## Estado inicial

- Fase 1 (agenda por intervalos) y Fase 2 (Firebase Auth como autoridad de
  passwords) ya cerradas.
- `MODELO_FIRESTORE_FASE_3.md` (paso 3.1) ya contenia la auditoria de uso de
  Firestore. Se verifico contra el codigo real antes de escribir reglas.
- El proyecto no tenia `firestore.rules`, `firebase.json`, `.firebaserc` ni
  `package.json`. En la practica la base de datos dependia de la configuracion
  de reglas que hubiera en la consola remota, no del repositorio.
- Un unico `index.html` de ~486 KB con todo el JavaScript embebido.

## Verificacion de la auditoria 3.1 contra el codigo

Se recorrieron todas las llamadas a `collection(`, `doc(`, `getDoc(`,
`getDocs(`, `setDoc(`, `addDoc(`, `deleteDoc(`, `onSnapshot(`, `query(` y
`where(` en `index.html`. La auditoria 3.1 resulto correcta. Precisiones
encontradas al revisar el codigo real:

| Hallazgo | Ubicacion | Consecuencia en Rules |
| --- | --- | --- |
| El sitio publico llama `signInAnonymously()` al cargar | `index.html:3348` | "Publico" y "anonimo autenticado" son casi lo mismo. `request.auth != null` **no** es un control de acceso util por si solo; por eso los admins exigen `sign_in_provider != 'anonymous'`. |
| `onSnapshot(collection(db,'appointments'))` se suscribe para todo visitante | `index.html:3354` | Hoy cualquiera con la web abierta recibe nombre, telefono y notas de todas las clientas. Es la mayor fuga de PII del proyecto. |
| `onSnapshot(collection(db,'users'))` se suscribe para todo visitante | `index.html:3385` | Igual: expone la base de clientas completa. |
| `const role = 'client'` esta hardcodeado en el registro | `index.html:5999` | El frontend no permite elegir rol, pero eso es UX; la garantia real la da la regla de `users`. |
| El registro guarda `bookedCount: getLegacyBookedCount(...)` leido de `localStorage` | `index.html:6030` | Fidelidad de origen cliente. Las reglas obligan `bookedCount == 0` al crear. |
| `confirmWhatsAppBooking` escribe `users/{phone}` con la sesion completa | `index.html:6691` | Ruta legacy que rompe la unicidad por `uid`. Queda denegada por las reglas. |
| Las citas **no** llevan campo de propietario | `index.html:6618` | Sin `clientUid` no existe ownership demostrable. Se define como campo obligatorio del modelo. |
| Casi todas las escrituras a Firestore van dentro de `try { } catch (e) { }` vacio | multiples | Un rechazo de Rules sera silencioso. Se corrige al alinear cada flujo (Fases 4-6). |

## Archivos nuevos

| Archivo | Proposito |
| --- | --- |
| `firestore.rules` | Reglas de seguridad de minimo privilegio. Nucleo de la fase. |
| `firestore.indexes.json` | Indices compuestos que exigen las queries por propietario y por dia. |
| `firebase.json` | Configuracion de Firestore, Hosting estatico y emulador. |
| `.firebaserc` | Alias de proyecto (`nailsconval`). El projectId no es un secreto. |
| `package.json` | Solo tooling de pruebas y despliegue. No introduce framework ni build. |
| `tests/firestore.rules.test.mjs` | Banco de pruebas de Rules sobre el emulador. |
| `.gitignore` | Evita versionar `node_modules`, logs del emulador y cualquier `.env` o clave. |

## Archivos modificados

Ninguno. `index.html` no se toco en esta fase.

## Funciones modificadas

Ninguna. Los helpers nuevos viven dentro de `firestore.rules`:
`salonId`, `isSignedIn`, `isRegistered`, `isUser`, `selfProfile`, `isAdmin`,
`incoming`, `existing`, `changedKeys`, `locked`, `onlyChanges`,
`isShortString`, `belongsToSalon`, mas los helpers locales de cada coleccion.

## Modelo de datos afectado

Se mantiene el **modelo A**: colecciones planas con `salonId` como campo. No se
migra a `salons/{salonId}/...`.

### Colecciones

```text
users/{uid}
appointments/{appointmentId}
bookingSlots/{dateKey_startTime}      <- nuevo, se implementa en Fase 5
settings/{docId}
reviews/{reviewId}
community_posts/{postId}
loyalty_transactions/{txId}           <- nuevo, se implementa en Fase 7
```

### users/{uid}

```js
{
  uid, salonId, name, phone, email, birthdate,
  role,         // 'client' | 'admin'  — inmutable para el cliente
  bookedCount,  // cache derivado      — inmutable para el cliente
  createdAt
}
```

`uid`, `salonId`, `role`, `bookedCount` y `createdAt` son inmutables en
cualquier escritura de cliente. El documento se cierra con `keys().hasOnly(...)`
para que nadie inyecte campos extra.

### appointments/{id}

Se conservan todos los campos de Fase 1 (`appointmentDateIso`, `dateKey`,
`serviceIds`, `serviceSummary`, `durationMinutes`, `startTime`, `endTime`,
`salonId`) y se **añade `clientUid` como campo obligatorio**: sin el no hay
ownership verificable y las reglas de lectura/cancelacion no pueden existir.

### bookingSlots/{dateKey_startTime}

```js
{ salonId, dateKey, startTime, appointmentId, createdAt }
```

Deliberadamente **sin PII**. Es el unico recurso de disponibilidad de lectura
publica; sustituye la lectura publica de `appointments`.

### settings/{docId}

Documentos de lectura publica: `custom_services`, `discount_settings`,
`schedule_blocks`, `gallery_items`, `marketing_popup`, `payment_key`.
Cualquier otro documento (`income_goal`, futuros ajustes) es admin-only en
lectura y escritura.

### loyalty_transactions/{id}

```js
{ userId, appointmentId, salonId, type, stampsDelta, reason, createdAt, createdBy }
```

Definido ahora para que el cliente quede bloqueado desde el primer despliegue.
La logica se implementa en Fase 7.

## Decisiones tecnicas

1. **`request.auth != null` no basta.** El sitio inicia sesion anonima al
   cargar, asi que "estar autenticado" es el estado por defecto de cualquier
   visitante. `isAdmin()` exige `sign_in_provider != 'anonymous'`.
2. **`isAdmin()` por `get()` de `users/{uid}`**, tal como pedia el plan. La
   escalada de privilegios se cierra por el otro lado: `role` es inmutable en
   toda escritura de cliente y forzado a `'client'` en la creacion. Custom
   Claims queda como alternativa futura documentada, no ejecutada.
3. **`appointments` deja de ser de lectura publica.** Contiene nombre,
   telefono y notas. La disponibilidad publica se sirve desde `bookingSlots`,
   que no tiene PII. Este es el cambio de modelo mas importante de la fase.
4. **`get` y `list` separados.** En `users` y `appointments` el listado de la
   coleccion completa es admin-only; el cliente accede a lo suyo por
   documento o por query filtrada por `clientUid`.
5. **Inmutabilidad via `diff().affectedKeys()`.** Con escrituras `merge`,
   `request.resource.data` ya es el documento resultante, asi que `diff` contra
   `resource.data` describe exactamente lo que cambia.
6. **El dinero es del admin.** El cliente puede cancelar (`status`,
   `cancellationNoticeHours`) pero no puede marcar `refundEligible` ni
   `isRefunded`. Hoy el frontend los escribe desde el cliente; se corrige en
   Fase 6.
7. **Los locks no se editan.** `bookingSlots` solo admite create y delete. Un
   update en sitio permitiria robar un turno ajeno.
8. **Validacion de forma, no solo de actor.** Longitudes maximas de strings,
   rangos de `rating` y `durationMinutes`, y listas cerradas de campos, para
   limitar payloads y abuso de almacenamiento.
9. **Deny por defecto** en `match /{document=**}`.

## Compatibilidad mantenida

- No se migra a subcolecciones por salon.
- `salonId` sigue siendo un campo, con el valor `nails-con-val`.
- Todos los campos de Fase 1 se conservan; ninguno se renombra.
- `settings/*` conserva los mismos ids de documento que ya usa el frontend.
- No se toca `index.html`, por lo que el comportamiento visible del sitio es
  identico tras esta fase.

## Seguridad

Riesgos que estas reglas cierran, una vez desplegadas:

| Ataque | Resultado |
| --- | --- |
| Cliente se promueve a admin (`role: 'admin'`) | Denegado: `role` inmutable y forzado a `client` al crear. |
| Cliente infla su fidelidad (`bookedCount`) | Denegado: inmutable para el cliente, `0` obligatorio al crear. |
| Lectura del perfil de otra clienta | Denegado: `get` limitado a dueño o admin. |
| Volcado completo de `users` | Denegado: `list` es admin-only. |
| Volcado completo de `appointments` (PII) | Denegado: `list` admin-only; el cliente solo con query por `clientUid`. |
| Edicion o cancelacion de cita ajena | Denegado: exige `clientUid == request.auth.uid`. |
| Cliente se auto-aprueba una devolucion | Denegado: `refundEligible` / `isRefunded` son admin-only. |
| Cliente escribe precios, descuentos o bloqueos | Denegado: `settings` es admin-write. |
| Cliente lee la meta de ingresos | Denegado: `settings/income_goal` no esta en la lista publica. |
| Cliente se regala estampas | Denegado: `loyalty_transactions` es admin-write. |
| Bypass de `window.isAdminAuthenticated` desde la consola | Irrelevante: ese flag es solo UI; la autorizacion vive en Rules. |
| Escritura directa a Firestore desde consola del navegador | Sujeta a las mismas reglas que la app. |
| Inflar likes de un post | Denegado: solo `likes` y solo `+1` exacto. |
| Robar un turno editando su lock | Denegado: `bookingSlots` no admite update. |

No se versiono ningun secreto. La `firebaseConfig` publica sigue en
`index.html`, que es correcto: es identificacion de proyecto, no credencial, y
por eso mismo las Rules son el unico control real.

## Pruebas ejecutadas

### Ejecutadas en esta maquina

| Prueba | Comando | Resultado |
| --- | --- | --- |
| Sintaxis del banco de pruebas | `node --check tests/firestore.rules.test.mjs` | OK |
| Validez de los JSON de configuracion | `node -e "JSON.parse(...)"` sobre `firebase.json`, `firestore.indexes.json`, `package.json`, `.firebaserc` | OK |
| Balance estructural de `firestore.rules` | script de conteo de llaves / parentesis / corchetes | 0 / 0 / 0 |
| Ausencia de reglas permisivas | busqueda de `allow read, write: if true` | Sin coincidencias |

### NO ejecutadas — BLOQUEO EXTERNO

**Los 39 tests de Rules de `tests/firestore.rules.test.mjs` no se ejecutaron.**

Motivo: el emulador de Firestore corre sobre la JVM y esta maquina no tiene
Java instalado.

```text
$ java -version
java NOT found
```

Tampoco hay `firebase-tools` instalado ni `node_modules`.

No se afirma que estas reglas hayan pasado ninguna prueba de comportamiento.
Estan revisadas manualmente y estructuralmente, nada mas.

Para desbloquear:

1. Instalar un JDK 11+ (por ejemplo Temurin) y verificar `java -version`.
2. Instalar dependencias:

```bash
npm install
```

3. Ejecutar el banco de pruebas:

```bash
npm run test:rules
```

Ese comando levanta el emulador de Firestore con `firestore.rules` y corre los
tests con el runner integrado de Node. Cubre los diez casos minimos pedidos por
el plan, mas los de `bookingSlots`, `community_posts`, `reviews`,
`loyalty_transactions` y denegacion por defecto.

## Resultado de git diff --check

Sin avisos de espacios en blanco.

## Incompatibilidades conocidas (por que estas reglas todavia NO se despliegan)

`firestore.rules` describe el estado objetivo. El frontend actual aun choca con
el en estos puntos. **Desplegar ahora romperia funcionalidad viva.**

| # | Punto del frontend | Ubicacion | Efecto si se despliega hoy | Se resuelve en |
| --- | --- | --- | --- | --- |
| 1 | Las citas no llevan `clientUid` | `index.html:6618` | Toda creacion de cita rechazada | Fase 5 |
| 2 | `onSnapshot(collection(db,'appointments'))` global | `index.html:3354` | Listener rechazado; la disponibilidad se queda sin datos hasta migrar a `bookingSlots` | Fase 5 |
| 3 | `onSnapshot(collection(db,'users'))` global | `index.html:3385` | Listener rechazado para todo no-admin (comportamiento correcto, pero hay que condicionar la suscripcion) | Fase 4 |
| 4 | Registro escribe `bookedCount` legacy | `index.html:6030` | Creacion de perfil rechazada | Fase 4 |
| 5 | Login reescribe `createdAt` si falta | `index.html:6213` | Update rechazado en perfiles antiguos sin `createdAt` | Fase 4 |
| 6 | `setDoc(users/{phone})` legacy | `index.html:6691` | Rechazado (es el objetivo), pero conviene retirar la llamada | Fase 4 |
| 7 | `requestClientCancellation` escribe `refundEligible` / `isRefunded` | `index.html:4000` | Cancelacion de cliente rechazada | Fase 6 |
| 8 | `reviews` y `community_posts` sin `authorUid` ni `salonId` | `index.html:7446`, `index.html:7680` | Creacion rechazada | Fase 9 |
| 9 | Meta de ingresos vive en `localStorage`, no en `settings/income_goal` | varias | Sin efecto inmediato; el documento aun no existe | Fase 4 |

**Orden de despliegue seguro:** cerrar Fases 4, 5, 6 y 9, y desplegar las
reglas dentro del checklist de la Fase 12.

```bash
firebase deploy --only firestore:rules
```

## Riesgos encontrados

- **Fuga de PII activa en produccion.** Mientras las reglas remotas actuales
  sigan siendo permisivas, cualquier visitante recibe la lista completa de
  citas y de usuarias. Es el riesgo mas grave abierto del proyecto y solo se
  cierra desplegando estas reglas.
- **`isAdmin()` cuesta una lectura** por evaluacion. Es aceptable para el
  volumen de un salon; Custom Claims lo eliminaria.
- **`bookingSlots` expone `appointmentId`.** Es un identificador opaco, sin
  PII, pero permite inferir cuantas reservas hay. Se acepta a cambio de no
  exponer `appointments`.
- **`catch (e) { }` vacio en casi todas las escrituras.** Tras desplegar
  reglas, los rechazos serian invisibles para la usuaria. Debe corregirse al
  alinear cada flujo.
- **Los tests no se han ejecutado.** Una regla puede tener un error de
  compilacion no detectado por la revision manual.

## Deuda tecnica

- Ejecutar el banco de pruebas en cuanto haya JDK.
- Migrar `isAdmin()` a Custom Claims si el coste de lecturas molesta.
- `services` sigue como documento unico `settings/custom_services` en vez de
  coleccion `services/{id}`; sirve para un salon, no escala a multi-salon.
- No hay reglas de Cloud Storage porque el proyecto no usa Storage (las
  imagenes van en base64 / URL). Si eso cambia, hacen falta.
- Falta politica de retencion de PII para citas antiguas.

## Cosas deliberadamente no modificadas

- `index.html`: ni una linea.
- Fase 1 (agenda por intervalos): intacta.
- Fase 2 (Firebase Auth, sin PIN ni passwords locales): intacta.
- No se migro a `salons/{salonId}/...`.
- No se introdujo React, Vue, Next.js, backend propio ni Supabase.
- No se añadio bundler ni paso de build: `package.json` solo trae tooling de
  test y de despliegue.
- **Bot de Telegram: NO IMPLEMENTADO — fuera de alcance.**

## Proxima fase

Fase 4 — Firestore como fuente de verdad: clasificar las claves `ncv_*`,
invertir el orden `localStorage -> Firestore` a `Firestore -> cache`,
centralizar la llave de pago y resolver el caso "usuario de Auth sin documento
en `users`". Resuelve ademas los puntos 3, 4, 5, 6 y 9 de la tabla de
incompatibilidades.

## Commit de cierre

```text
feat: define firestore model and enforce security rules
```
