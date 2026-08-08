# NailsConVal — Resumen final del proyecto

Endurecimiento del sitio existente desde el estado tras la Fase 2 hasta una
versión lista para desplegar.

Rama: `mejora-v2` · Arquitectura: HTML/CSS/JavaScript vanilla sobre Firebase
Authentication y Cloud Firestore, con hosting estático.

---

## Estado por fase

| Fase | Estado | Commit | Documento | Riesgos |
| --- | --- | --- | --- | --- |
| 1 — Agenda por intervalos | Cerrada antes | `bde32db` | `CAMBIOS_AGENDA_FASE_1.md` | Citas antiguas sin `durationMinutes` |
| 2 — Auth y seguridad frontend | Cerrada antes | `2b5f1cf` | `CAMBIOS_SEGURIDAD_FASE_2.md` | — |
| 3 — Modelo Firestore y Rules | **Cerrada** | `6d90480` | `MODELO_FIRESTORE_FASE_3.md`, `CAMBIOS_FIRESTORE_FASE_3.md` | **Las reglas nunca se han ejecutado** |
| 4 — Firestore como fuente de verdad | **Cerrada** | `6763770` | `CAMBIOS_PERSISTENCIA_FASE_4.md` | Fidelidad congelada hasta la Fase 7 |
| 5 — Booking atómico | **Cerrada** | `e19de56` | `CAMBIOS_RESERVAS_FASE_5.md` | Exige relleno de datos antes de desplegar |
| 6 — Panel admin | **Cerrada** | `fea7ad9` | `CAMBIOS_ADMIN_FASE_6.md` | Sin paginación |
| 7 — Fidelidad auditable | **Cerrada** | `b0857b2` | `CAMBIOS_FIDELIDAD_FASE_7.md` | El derecho al premio no se valida en servidor |
| 8 — Ciclo de vida de cuentas | **Cerrada** | `269847f` | `CAMBIOS_USUARIOS_FASE_8.md` | Se pierde el acceso por teléfono |
| 9 — Contenido seguro | **Cerrada** | `bea0d5c`, `990ffdb` | `CAMBIOS_CONTENIDO_FASE_9.md` | Fotos base64 sin redimensionar |
| 10 — UX, móvil y rendimiento | **Cerrada** | `f75dc80` | `CAMBIOS_UX_PERFORMANCE_FASE_10.md` | Tailwind por CDN |
| 11 — Modularización | **Cerrada parcial** | `6b60991` | `CAMBIOS_MODULARIZACION_FASE_11.md` | Seis módulos del plan no extraídos, con motivo |
| 12 — QA, seguridad y despliegue | **Cerrada** | (este commit) | `CIERRE_PROYECTO_FASE_12.md` | Nada probado contra Firebase real |

---

## Commits realizados

```text
bde32db  baseline NailsConVal before refactor                     (previo)
2b5f1cf  feat: secure firebase auth and remove legacy admin creds (previo)
6d90480  feat: define firestore model and enforce security rules  (Fase 3)
6763770  refactor: make firestore the source of truth             (Fase 4)
e19de56  feat: add atomic booking and slot locking                (Fase 5)
fea7ad9  feat: harden admin operations and business settings      (Fase 6)
b0857b2  feat: add auditable loyalty transactions                 (Fase 7)
269847f  feat: complete client account lifecycle                  (Fase 8)
bea0d5c  feat: secure community reviews and content management    (Fase 9)
990ffdb  docs: quita un byte NUL del documento de la fase 9
f75dc80  refactor: improve mobile ux accessibility and performance (Fase 10)
6b60991  refactor: modularize frontend javascript                 (Fase 11)
         chore: complete production hardening and release checklist (Fase 12)
```

---

## Archivos creados

### Código

```text
assets/js/firebase.js        Arranque de Firebase, sesión y suscripciones
assets/js/availability.js    Cálculo de disponibilidad (Fase 1 + locks)
assets/js/booking-slots.js   Aritmética de locks de reserva
assets/js/loyalty.js         Reglas de fidelidad
assets/js/sanitize.js        Saneamiento de contenido de usuarias
assets/js/time.js            Fecha, hora y duración
```

### Configuración

```text
firestore.rules              Reglas de seguridad
firestore.indexes.json       Índices compuestos
firebase.json                Firestore, Hosting, emulador, CSP y cabeceras
.firebaserc                  Alias de proyecto
package.json                 Solo tooling de test y despliegue
.gitignore
.claude/launch.json
```

### Pruebas y herramientas

```text
tests/booking-slots.test.mjs     27 tests
tests/loyalty.test.mjs           24 tests
tests/sanitize.test.mjs          33 tests
tests/time.test.mjs              24 tests
tests/availability.test.mjs      29 tests
tests/firestore.rules.test.mjs   40 tests  (NUNCA EJECUTADOS)
tools/check-inline-scripts.mjs   Valida los <script> embebidos
tools/serve.mjs                  Servidor local con las cabeceras de producción
```

### Documentación

Un documento de cierre por fase, más `CIERRE_PROYECTO_FASE_12.md` y este
resumen.

---

## Arquitectura final

Sin cambios de arquitectura. Sigue siendo HTML/CSS/JavaScript vanilla con
Tailwind, Firebase Authentication, Cloud Firestore y hosting estático. Sin
framework, sin bundler, sin transpilador, sin backend propio.

```text
index.html            8.887 lineas, 4 bloques <script> embebidos
assets/js/*.js        6 modulos ES, 1.062 lineas
```

**Cambio operativo:** `index.html` importa módulos ES relativos, así que ya no
puede abrirse con doble clic. Hay que servirlo (`npm start` en local; Firebase
Hosting en producción).

---

## Modelo Firestore final

Colecciones planas con `salonId` como campo. **No** se migró a
`salons/{salonId}/...`.

```js
users/{uid} = {
  uid, salonId, name, phone, email, birthdate,
  role,        // 'client' | 'admin'  — inmutable para el cliente
  bookedCount, // cache derivada      — inmutable para el cliente
  createdAt
}

appointments/{id} = {
  id, clientUid, salonId,
  appointmentDateIso, dateKey, serviceIds, serviceSummary,
  durationMinutes, startTime, endTime, time,
  name, phone, service, notes, promoCode, birthday,
  status, createdAt, isWalkIn, paidStatus,
  refundEligible, isRefunded, cancellationNoticeHours,
  loyaltyRedeemed
}

bookingSlots/{salonId}_{YYYY-MM-DD}_{HH:MM} = {
  salonId, dateKey, dateIso, startTime, appointmentId, createdAt
}

loyalty_transactions/{tipo}_{referencia} = {
  userId, appointmentId, salonId, type, stampsDelta,
  reason, createdAt, createdBy
}

reviews/{id}         = { id, authorUid, salonId, name, service, rating, comment, photoUrl, createdAt }
community_posts/{id} = { id, authorUid, salonId, name, message, photoUrl, likes, createdAt }

settings/custom_services    settings/discount_settings
settings/schedule_blocks    settings/gallery_items
settings/marketing_popup    settings/payment_key      <- lectura publica
settings/income_goal                                  <- admin only
```

---

## Rules finales

`firestore.rules`, con deny por defecto.

| Colección | Público | Cliente | Admin |
| --- | --- | --- | --- |
| `users` | nada | lee y edita el suyo, sin tocar `role`, `bookedCount`, `salonId`, `uid`, `createdAt` | todo |
| `appointments` | nada | crea la suya, lee las suyas por query, solo cancela | todo salvo reasignar dueño u horario |
| `bookingSlots` | **lee** | crea; borra los suyos | todo, sin update |
| `settings/*` | lee los públicos | igual | escribe |
| `reviews` | **lee** | crea con su `authorUid` | modera |
| `community_posts` | **lee** | crea; un `+1` exacto en `likes` | modera |
| `loyalty_transactions` | nada | lee el suyo | escribe |

Tres `allow read: if true` deliberados: `bookingSlots` (sin datos personales),
`reviews` y `community_posts` (contenido público del sitio).

---

## Estado de localStorage

Ninguna clave es ya fuente de verdad de datos de negocio.

| Clave | Estado |
| --- | --- |
| `ncv_custom_services` | Cache de `settings/custom_services` |
| `ncv_discount_settings` | Cache |
| `ncv_blocked_dates_list` | Cache |
| `ncv_blocked_time_slots` | Cache |
| `ncv_gallery_items` | Cache |
| `ncv_marketing_popup` | Cache |
| `ncv_payment_key` | Cache (nueva) |
| `ncv_client_reviews` | Cache |
| `ncv_community_posts` | Cache |
| `ncv_community_likes` | Local, un "me gusta" por navegador |
| `ncv_appointments` | Cache de lectura |
| `ncv_current_user` | Cache de UI; el rol se fuerza a `client` y se verifica |
| `ncv_firebase_config` | Configuración local de conexión |
| `ncv_users` | **ELIMINADA** y purgada al arrancar |
| `ncv_cancellation_alerts` | **ELIMINADA** (era dato muerto) |
| `ncv_income_goal`, `ncv_income_goal_type` | **ELIMINADAS**, migradas a Firestore |

---

## Estado del booking concurrente

Resuelto. `bookingSlots` con locks deterministas de 30 minutos e id
`{salonId}_{fecha}_{hora}`: dos navegadores que pidan el mismo turno generan el
**mismo id de documento**, y ahí arbitra Firestore.

La reserva es una transacción: lee todos los locks, aborta entera si alguno
está ocupado, y solo entonces crea locks y cita. No hay reserva parcial. La
cancelación libera los locks en la misma transacción.

Probado con una Firestore falsa que reproduce el control optimista: dos y diez
reservas simultáneas sobre el mismo turno, **gana exactamente una**.

**No se ha ejecutado una transacción real contra Firestore.**

---

## Estado de la fidelidad

Auditable. La autoridad es el historial `loyalty_transactions`; `bookedCount`
es cache derivada.

La estampa se deriva de una cita **completada**, no reservada. El id
determinista (`earn_{appointmentId}`) impide duplicar la recompensa. El canje
se marca en la cita y lo registra el admin al completarla, como transacción de
-10. El ajuste manual es solo admin, exige motivo y queda con autor y fecha.

Pendiente: la validación del derecho al premio del lado servidor necesitaría
Cloud Functions, fuera del alcance acordado.

---

## Estado del panel admin

Todas las operaciones escriben en Firestore y esperan confirmación; los fallos
son visibles. Los listeners con datos personales solo se abren con sesión admin
confirmada y se cierran al perderla.

`window.isAdminAuthenticated` es únicamente UI: sus 25 usos se auditaron y
ninguno concede acceso a datos. Verificado que encenderlo a mano no otorga rol.

---

## Tests ejecutados

```bash
npm test     # 137 tests | 137 pass | 0 fail
npm run check  # 4 bloques inline, 0 errores
```

| Suite | Tests | Cubre |
| --- | --- | --- |
| `booking-slots` | 27 | Aritmética de locks y **concurrencia** |
| `loyalty` | 24 | Estampas, canje, no duplicación, ajuste manual |
| `sanitize` | 33 | XSS, esquemas, límites, autoría |
| `time` | 24 | Fechas, horas y duraciones |
| `availability` | 29 | **Los escenarios de la Fase 1** más locks y cierre |

Más 16 ataques ejecutados en el navegador (sección 2 de
`CIERRE_PROYECTO_FASE_12.md`), todos bloqueados.

### Tests escritos y NO ejecutados

`tests/firestore.rules.test.mjs`, **40 tests**. El emulador de Firestore
requiere Java y esta máquina no lo tiene. **Las reglas de seguridad nunca se
han ejecutado.**

---

## Bloqueos externos

| Bloqueo | Impacto |
| --- | --- |
| **Sin Java** | Los 40 tests de Rules no se han ejecutado |
| **Auth responde HTTP 400** | Nada probado contra Firebase real: ni registro, ni login, ni reserva, ni correo de recuperación |
| Sin credenciales de administración | El relleno de `clientUid` y locks no se pudo hacer |
| Sin autorización de despliegue | No se desplegó nada |
| Configuración de la consola de Firebase | Proveedores de Auth, dominios y cuenta admin quedan pendientes |

---

## Pasos de despliegue

Detalle completo en `CIERRE_PROYECTO_FASE_12.md`. En orden:

1. Exportar los datos actuales.
2. Rellenar `clientUid` y crear los locks de las citas futuras.
3. Crear `settings/payment_key`.
4. Habilitar los proveedores de Auth y autorizar el dominio.
5. Crear la cuenta admin y ponerle `role: "admin"` a mano.
6. `npm run test:rules` — **debe pasar antes de continuar**.
7. `firebase deploy --only firestore:rules`
8. `firebase deploy --only firestore:indexes`
9. `firebase deploy --only hosting`

---

## Rollback

- **Hosting:** consola → historial de versiones → Rollback. Inmediato.
- **Reglas:** `git checkout <commit> -- firestore.rules` y volver a desplegar,
  o restaurar desde el historial de la consola.
- **Código:** cada fase es un commit; `git revert <commit>`.
- **Datos:** no hay vuelta atrás automática. Exportar antes del paso 2.

---

## Deuda técnica

1. Ejecutar los tests de Rules en cuanto haya JDK.
2. Probar el ciclo completo contra Firebase real.
3. Terminar la modularización (plan en `CAMBIOS_MODULARIZACION_FASE_11.md`).
4. Compilar Tailwind en vez de servirlo por CDN.
5. Endurecer `script-src` retirando `'unsafe-inline'`.
6. Verificación de correo en el registro.
7. Redimensionar las fotos antes de guardarlas.
8. Paginar la suscripción admin de citas.
9. Recálculo de `bookedCount` desde el historial.
10. Limpieza de locks huérfanos.
11. Atrapar el foco dentro de los diálogos.
12. Rehacer la cancelación por teléfono sobre sesión de clienta.
13. Custom Claims para `isAdmin()` si el coste de lecturas molesta.

---

## Funciones deliberadamente fuera de alcance

- **Bot de Telegram: NO IMPLEMENTADO — fuera de alcance actual.**
- Multi-salón completo: se mantiene `salonId` como campo, sin migrar a
  subcolecciones.
- Cloud Functions y backend propio.
- Firebase Storage: las fotos siguen en base64 o por URL.
- Migración a React, Vue, Angular, Next.js o Supabase.
- Moderación previa de contenido.
- Borrado de cuenta.
- Cambio de correo desde el perfil.
- Bundler, transpilador o paso de compilación.

---

## Lo que no está probado

Conviene que quede junto y sin adornos:

- **Las reglas de seguridad nunca se han ejecutado.** Un error de compilación
  en `firestore.rules` bloquearía el sitio entero al desplegarlas.
- **Nada se ha probado contra el Firebase real.** Toda la lógica está probada
  en aislamiento; el viaje de ida y vuelta contra la base de datos, no.
- El relleno de datos previo al despliegue no se ha ejecutado ni ensayado.
- No se ha medido el rendimiento con herramientas reales.
- No se ha probado en dispositivos físicos; la comprobación de móvil se hizo
  midiendo el DOM a 375 px, no mirando la pantalla.

Mientras las reglas no se desplieguen, **la fuga de datos personales que
motivó el proyecto sigue viva en producción**: cualquier visitante con la web
abierta recibe la agenda completa y la lista de clientas.
