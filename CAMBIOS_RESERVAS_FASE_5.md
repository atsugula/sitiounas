# Fase 5 — Booking atómico y locks de turno

## Objetivo

Que dos clientas no puedan reservar el mismo horario, y que esa garantía no
dependa del navegador.

Hasta ahora la comprobación de disponibilidad vivía **solo** en el cliente y la
cita se guardaba con un `setDoc` suelto. Dos personas que abrieran la agenda a
la vez veían el mismo turno libre y las dos podían confirmarlo: ambas quedaban
"confirmada" y el conflicto se descubría el día de la cita.

## Estado inicial

- Fase 4 dejó Firestore como autoridad de los ajustes de negocio, pero las
  citas seguían escribiéndose sin coordinación.
- Las citas no tenían campo de propietario, así que las Rules de la Fase 3 no
  podían desplegarse.
- Todo visitante abría un listener sobre `appointments` y recibía nombre,
  teléfono y notas de todas las clientas.

## Archivos modificados

- `index.html`
- `firestore.rules` (se añade `dateIso` a la forma del lock)
- `tests/firestore.rules.test.mjs`
- `package.json`

## Archivos nuevos

- `assets/js/booking-slots.js` — aritmética pura de los locks.
- `tests/booking-slots.test.mjs` — 27 tests, incluida la concurrencia.
- `tools/serve.mjs` — servidor estático de desarrollo.
- `.claude/launch.json`
- `CAMBIOS_RESERVAS_FASE_5.md`

## Funciones modificadas

### Nuevas — `assets/js/booking-slots.js`

Lógica pura, sin DOM, sin Firestore y sin `window`. Se separó precisamente para
poder probarla de verdad.

| Función | Qué hace |
| --- | --- |
| `parseTimeToMinutes` / `formatMinutesTo24h` | Conversión de horas. `HH:MM` en 24h es el formato canónico del lock. |
| `computeSlotStartTimes(startTime, duration)` | Turnos de 30 min que ocupa una cita. |
| `buildSlotId(dateIso, slotStart, salonId)` | Id determinista del lock. |
| `computeSlotIdsForAppointment({...})` | Todos los ids que necesita una cita. |
| `resolveBookingConflict(existingSlots)` | Decide si se puede reservar y qué turnos estorban. |
| `groupLockedSlotsByDate(slotDocs)` | Mapa `fecha -> Set(horas ocupadas)`. |
| `isRangeFree(locked, startTime, duration)` | ¿Cabe la cita? Solo con locks, sin leer PII. |

### Nuevas — `index.html`

| Función | Qué hace |
| --- | --- |
| `commitBookingTransaction(appointmentData)` | La reserva atómica completa. |
| `releaseAppointmentAndSlots(id, {...})` | Cancela y libera locks en la misma transacción. |
| `saveAppointmentAdminFields(id, fields)` | Escritura admin sobre una cita, con confirmación. |
| `window.subscribeAdminAppointments()` | Listener de la colección entera, solo admin. |
| `window.subscribeClientAppointments(uid)` | Query filtrada por `clientUid`. |
| `window.unsubscribeAppointments()` | Cierra el que esté activo. |

### Reescritas

- `confirmWhatsAppBooking` — ahora es una transacción y **falla antes** de abrir
  WhatsApp si el turno se ocupó.
- `requestClientCancellation` — libera los locks; ya no escribe campos de dinero.
- `changeBookingStatus` — cancelar desde el panel también libera turnos.
- `handleAdminWalkInSubmit` — la cita presencial pasa por la misma transacción y
  se alinea con el modelo de la Fase 1.
- `computeClientAvailability` — la ocupación también se lee de los locks.
- `refreshUserAppointmentsUI` — filtra por `clientUid`, no por teléfono.

## Modelo de datos afectado

### `bookingSlots/{salonId}_{YYYY-MM-DD}_{HH:MM}`

```js
{
  salonId,        // 'nails-con-val'
  dateKey,        // formato Fase 1, para compatibilidad
  dateIso,        // 'YYYY-MM-DD'
  startTime,      // 'HH:MM' en 24h
  appointmentId,
  createdAt
}
```

Sin nombre, sin teléfono, sin notas. Es lo que permite que la disponibilidad
sea de lectura pública sin exponer a nadie.

El id es determinista a propósito: dos navegadores que pidan el mismo turno
generan **el mismo id de documento**, y ahí es donde Firestore arbitra la
carrera.

### `appointments/{id}`

Campo nuevo obligatorio: **`clientUid`**. Sin él no hay propiedad demostrable.

Las citas presenciales pasan además a llevar `serviceIds`, `serviceSummary`,
`durationMinutes`, `startTime`, `endTime` y `salonId`, que antes les faltaban.

## Decisiones técnicas

1. **Unidad de 30 minutos.** Una cita de 14:00 a 16:00 bloquea 14:00, 14:30,
   15:00 y 15:30. Las 16:00 quedan libres: la cita termina justo cuando empieza
   ese turno. Es la semántica que ya fijó la Fase 1.
2. **Todo o nada.** Si un solo turno del rango está ocupado, la transacción
   entera aborta. No existe la reserva parcial.
3. **Lecturas antes que escrituras.** Firestore lo exige dentro de una
   transacción, así que primero se leen todos los locks y solo después se
   escribe.
4. **Citas mal alineadas.** El inicio se redondea hacia abajo y el final hacia
   arriba al múltiplo de 30. Una cita de 14:10 a 14:50 bloquea 14:00 y 14:30.
   Nunca queda un hueco medio ocupado que parezca libre.
5. **La disponibilidad pública se sirve desde los locks.** Es el cambio que
   permite dejar de exponer `appointments` al mundo.
6. **Durante la migración se suman las dos fuentes.** La ocupación es la unión
   de los locks y de los intervalos de las citas visibles, porque las citas
   anteriores a esta fase todavía no tienen lock. Si solo se miraran los locks,
   una agenda ya llena aparecería vacía.
7. **La cancelación libera en la misma transacción.** Marcar cancelada sin
   soltar los turnos dejaría huecos muertos en la agenda; soltarlos en una
   escritura aparte podría fallar a medias.
8. **El dinero es del admin.** `requestClientCancellation` dejó de escribir
   `refundEligible` e `isRefunded`. Los calcula para informar a la clienta, pero
   quien los persiste es el panel.
9. **Se reserva antes de mandar a WhatsApp.** Antes la clienta podía transferir
   el abono de un turno que ya no existía.
10. **La cita presencial compite igual.** Un walk-in que no tomara locks
    permitiría que la web vendiera el mismo hueco.

## Compatibilidad mantenida

- La semántica de disponibilidad de la Fase 1 es idéntica; solo cambia de dónde
  sale el dato de ocupación.
- Se conservan `dateKey`, `time` y `service` como alias.
- Ni un cambio visual.
- Sin framework, sin bundler, sin backend propio.

## Cambio operativo importante

`index.html` ahora importa un módulo ES relativo (`./assets/js/booking-slots.js`).
Los navegadores bloquean esos imports bajo `file://` por CORS, así que **abrir
`index.html` con doble clic ya no basta**. Hay que servirlo:

```bash
npm start
```

En producción lo resuelve Firebase Hosting. Esto era inevitable de todos modos:
la Fase 11 extrae el JavaScript a `assets/js/`.

## Seguridad

| Antes | Ahora |
| --- | --- |
| Dos clientas podían confirmar el mismo turno. | La transacción garantiza que solo una gane. |
| La disponibilidad se validaba solo en el navegador. | Firestore arbitra con locks deterministas. |
| Toda visitante recibía la agenda completa con PII. | La disponibilidad pública no contiene datos personales. |
| Las citas no tenían propietario. | `clientUid` obligatorio. |
| "Mis citas" se filtraba por teléfono. | Se filtra por `clientUid` con query que las Rules pueden autorizar. |
| La clienta escribía si le tocaba devolución. | Lo decide el admin. |
| Los errores de reserva se tragaban. | Se muestran antes de mandar a WhatsApp. |

## Pruebas ejecutadas

### Unitarias — ejecutadas

```bash
node --test tests/booking-slots.test.mjs
# tests 27 | pass 27 | fail 0
```

| Grupo | Cubre |
| --- | --- |
| Parseo y formato | 12h, 24h, medianoche, mediodía, turno noche, entradas basura |
| Cálculo de turnos | 14:00-16:00 = 4 turnos; 16:00 libre; 3 h = 6 turnos; media hora = 1; cita desalineada; duración inválida |
| Ids de lock | Determinismo, `salonId` en el id, salones que no comparten locks |
| Conflicto | Reserva limpia; un turno ocupado aborta el conjunto |
| Disponibilidad | Agrupación por fecha; 13:30 no cabe con 14:00-16:00; 16:00 sí |
| **Concurrencia** | Reserva limpia; **dos a la vez, solo una gana**; escritura externa entre lectura y confirmación; solapamiento parcial; contiguas sin choque; días distintos; **diez a la vez, exactamente una gana** |

La concurrencia se prueba contra una Firestore falsa en memoria que reproduce
el control optimista real: cada transacción registra la versión de lo que leyó
y, si algo cambió antes de confirmar, reintenta. Es una simulación del
contrato de `runTransaction`, no de Firestore entera; queda dicho.

### En navegador — ejecutadas sobre `http://localhost:5173`

| # | Prueba | Resultado |
| --- | --- | --- |
| 1 | Los 5 bloques `<script>` inline compilan (`npm run check`) | 5/5 OK |
| 2 | El módulo `booking-slots.js` carga y expone sus 10 símbolos | OK |
| 3 | `runTransaction` accesible desde el script clásico | `"function"` |
| 4 | `commitBookingTransaction` y `releaseAppointmentAndSlots` definidas | OK |
| 5 | Los tres controladores de suscripción existen | OK |
| 6 | Con locks de 14:00-16:00, `13:30` pasa a `no-space` | OK |
| 7 | `14:00`, `14:30`, `15:30` pasan a `booked` | OK |
| 8 | `16:00` sigue disponible | OK |
| 9 | La página carga sin errores de JavaScript | OK |
| 10 | `git diff --check` | Sin avisos |

### No ejecutado — BLOQUEO EXTERNO

- Los 40 tests de `firestore.rules` siguen sin ejecutarse: el emulador necesita
  Java y esta máquina no lo tiene.
- No se probó una reserva real contra el proyecto Firebase. En este entorno
  `signInAnonymously()` responde HTTP 400 (proveedor anónimo deshabilitado y/o
  origen no autorizado), así que **no se ha visto una transacción de Firestore
  ejecutarse de verdad**. La lógica está probada; el viaje de ida y vuelta, no.

## Resultado de git diff --check

Sin avisos.

## Migración obligatoria antes de desplegar las Rules

Las citas creadas antes de esta fase no tienen `clientUid` ni locks. Hay que
hacer un relleno **una sola vez y antes** de desplegar `firestore.rules`,
porque las Rules marcan `clientUid` como inmutable incluso para el admin.

Pasos, en este orden:

1. Crear los locks de las citas activas futuras, con
   `computeSlotIdsForAppointment` para calcular los ids.
2. Rellenar `clientUid` cruzando `appointments.phone` con `users.phone`.
3. Revisar a mano las citas sin correspondencia (walk-ins de teléfono
   desconocido); pueden quedarse con `clientUid: null` si son del salón.
4. Desplegar las Rules.

**BLOQUEO EXTERNO:** el relleno necesita credenciales de administración
(`firebase-admin` con una cuenta de servicio) o ejecutarse desde una sesión
admin del panel. No se ejecuta aquí y no se inventa el resultado.

## Riesgos encontrados

- **Las citas antiguas dejan de aparecer en "Mis citas"** hasta que se rellene
  `clientUid`. Es visible para la clienta.
- **La ocupación combinada es transitoria por diseño.** Mientras convivan citas
  con y sin lock, la disponibilidad se calcula con las dos fuentes. Una vez
  hecha la migración, se puede simplificar a locks puros.
- **La búsqueda de cancelación por teléfono sigue leyendo
  `window.allAppointmentsList`.** Con las Rules desplegadas, una visitante
  anónima no verá nada ahí. Ese flujo necesita rehacerse en la Fase 8 sobre
  sesión de clienta, no sobre un teléfono escrito en un campo.
- **Un lock huérfano bloquea agenda.** Si una transacción de cancelación falla
  a medias por red, puede quedar un turno ocupado sin cita. Conviene una tarea
  de limpieza; hoy el admin puede borrarlo.
- **`ncv_cancellation_alerts` sigue siendo local** (Fase 6).
- **Abrir el HTML con doble clic ya no funciona.** Hay que servirlo.

## Deuda técnica

- Script de relleno de `clientUid` y de locks.
- Limpieza de locks huérfanos.
- Simplificar la disponibilidad a locks puros tras la migración.
- El flujo de cancelación por teléfono (Fase 8).
- `ncv_appointments` sigue como cache; ya no es autoridad, pero conviene
  reducir su uso.

## Cosas deliberadamente no modificadas

- El diseño y los textos.
- La semántica de disponibilidad de la Fase 1.
- La autenticación de la Fase 2.
- La fidelidad: sigue congelada a la espera de la Fase 7.
- Reviews y community posts (Fase 9).
- No se migró a `salons/{salonId}/...`.
- **Bot de Telegram: NO IMPLEMENTADO — fuera de alcance.**

## Próxima fase

Fase 6 — Endurecer el panel admin: revisar cada operación contra el modelo
protegido, migrar `ncv_cancellation_alerts`, y dejar claro que el frontend
admin es UX y que la autorización real vive en las Rules.

## Commit de cierre

```text
feat: add atomic booking and slot locking
```
