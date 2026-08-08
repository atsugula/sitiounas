# Fase 4 — Firestore como fuente de verdad

## Objetivo

Invertir la relación entre `localStorage` y Firestore. Hasta ahora el patrón
era *escribir local y luego intentar la nube en segundo plano con el error
tragado*; a partir de esta fase el patrón es:

```text
escribir en Firestore -> esperar confirmación -> refrescar cache y UI
```

Y que ningún dato de negocio —roles, fidelidad, citas, ajustes
administrativos, usuarios— tenga su autoridad en el navegador.

## Estado inicial

- Fase 3 dejó `firestore.rules` escrito pero sin desplegar, con nueve
  incompatibilidades listadas entre el contrato de seguridad y el código.
- Trece claves `ncv_*` en `localStorage`, varias actuando como fuente de
  verdad y no como cache.
- La llave de pago estaba escrita a mano en seis sitios distintos.
- La meta de ingresos vivía solo en el navegador de quien la configuró.

## Archivos modificados

- `index.html`
- `package.json` (script `npm run check`)

## Archivos nuevos

- `tools/check-inline-scripts.mjs` — valida la sintaxis de cada `<script>`
  embebido. El proyecto no tiene build ni linter, así que sin esto un error de
  sintaxis solo aparecería en el navegador de una clienta.
- `CAMBIOS_PERSISTENCIA_FASE_4.md`

## Funciones modificadas

### Nuevas

| Función | Qué hace |
| --- | --- |
| `isFirestoreReady()` | Comprueba que la SDK esté disponible antes de intentar escribir. |
| `saveSettingsDoc(docId, data, merge)` | Escribe un documento de `settings` y **espera** confirmación. |
| `cacheLocally(key, value)` | Guarda cache local de solo lectura. Nunca es autoridad. |
| `readCache(key, fallback)` | Lee cache tolerando JSON corrupto. |
| `persistAdminSetting({...})` | Nube primero; si falla, avisa y **no** toca cache ni UI. |
| `window.applyPaymentKeyToUI()` | Propaga la llave de pago a todos los puntos de la web. |
| `window.applyServicesData(list)` | Sincroniza `SERVICES_DATA` entre el ámbito módulo y el clásico. |
| `window.applyDiscountSettings(s)` | Igual para los descuentos. |
| `window.subscribeAdminUsers()` / `window.unsubscribeAdminUsers()` | Abren y cierran el listener de `users` solo con sesión admin. |
| `window.subscribeIncomeGoal()` / `window.unsubscribeIncomeGoal()` | Igual para `settings/income_goal`. |
| `window.hydrateClientSession(authUser)` | Reconstruye la sesión de cliente **desde Firestore**. |
| `clearClientSession()` | Limpieza única de sesión local. |

### Reescritas para escribir en la nube primero

`toggleBlockEntireDate`, `removeBlockedDate`, `toggleAdminSlotBlock`,
`saveAdminDiscountSettings`, `saveAdminPopupSettings`, `saveSingleServiceData`,
`adminDeleteGalleryItem`, `handleSaveGalleryItem`, `saveAdminGoal`,
`saveAdminPaymentKeyChange`.

Todas pasaron a `async` y todas construyen el estado candidato **sin mutar el
estado vivo** hasta que Firestore confirma. Si la nube rechaza, lo que ve la
clienta sigue siendo lo último bueno.

### Otras

- `handleUserRegister` — la fidelidad ya no se precarga desde el navegador.
- `handleUserLogin` — dejó de reescribir el documento del usuario.
- `confirmWhatsAppBooking` — eliminada la escritura legacy y el auto-incremento
  de fidelidad.
- `renderAdminCharts` / `updateGoalProgress` — leen la meta desde Firestore.
- `renderGalleryPortfolio` — la cache solo hidrata el primer pintado.
- `handleUserLogout` — delega en `clearClientSession()`.
- Eliminada `getLegacyBookedCount()` (quedó sin uso y su único propósito era
  precargar fidelidad desde el navegador).

## Clasificación de las claves `localStorage`

| Clave | Clasificación | Estado tras esta fase |
| --- | --- | --- |
| `ncv_custom_services` | CACHE | Autoridad en `settings/custom_services`. |
| `ncv_discount_settings` | CACHE | Autoridad en `settings/discount_settings`. |
| `ncv_blocked_dates_list` | CACHE | Autoridad en `settings/schedule_blocks`. |
| `ncv_blocked_time_slots` | CACHE | Autoridad en `settings/schedule_blocks`. |
| `ncv_gallery_items` | CACHE | Autoridad en `settings/gallery_items`. |
| `ncv_marketing_popup` | CACHE | Autoridad en `settings/marketing_popup`. |
| `ncv_payment_key` | CACHE (nueva) | Autoridad en `settings/payment_key`. |
| `ncv_current_user` | CACHE | Solo UI. Se rehidrata forzando `role: 'client'` y se confirma o borra contra Firestore. |
| `ncv_firebase_config` | CACHE | Configuración local de conexión. La config de Firebase es pública, no un secreto. |
| `ncv_income_goal` | ELIMINADA | Migrada a `settings/income_goal` (privado, admin-only). |
| `ncv_income_goal_type` | ELIMINADA | Idem, dentro del mismo documento. |
| `ncv_appointments` | MIGRAR A FIRESTORE | Pendiente **Fase 5**: depende de las reservas atómicas. |
| `ncv_users` | LEGACY | Ya no autentica ni aporta fidelidad. Su retirada final es de la **Fase 8**. |
| `ncv_client_reviews` | MIGRAR A FIRESTORE | Pendiente **Fase 9**. |
| `ncv_community_posts` | MIGRAR A FIRESTORE | Pendiente **Fase 9**. |
| `ncv_cancellation_alerts` | MIGRAR A FIRESTORE | No estaba en el inventario original del plan; apareció en la auditoría. Pendiente **Fase 6**. |

## Modelo de datos afectado

Documentos nuevos en Firestore:

```js
settings/payment_key = { value: '0090984300', salonId: 'nails-con-val' }   // lectura pública
settings/income_goal = { amount: 0, type: 'mensual', salonId: '...' }      // admin-only
```

Ambos ya estaban contemplados en `firestore.rules` (Fase 3): `payment_key`
está en la lista de documentos públicos, `income_goal` no.

`users/{uid}` no cambia de forma, pero cambia de régimen: `role`, `bookedCount`
y `createdAt` dejan de ser escritos por el navegador en el flujo normal.

## Bug real encontrado y corregido

`serverTimestamp` se importaba **solo** en el `<script type="module">`, pero se
invocaba como global desde el script clásico:

```js
// index.html, dentro de handleUserRegister — script clásico
createdAt: serverTimestamp()   // ReferenceError: serverTimestamp is not defined
```

Son dos ámbitos distintos, así que la llamada lanzaba `ReferenceError` fuera de
cualquier `try`: **el registro de clientas estaba roto**. Se corrigió exponiendo
`serverTimestamp` en `window.firestoreUtils` y usándolo desde ahí, además de
mover la comprobación de disponibilidad de Firestore antes de construir el
perfil.

La segunda aparición (`handleUserLogin`) desapareció al eliminar la reescritura
de perfil en el login.

## Decisiones técnicas

1. **Nube primero, y el estado candidato aparte.** Los handlers construyen una
   copia nueva (`nextServices`, `nextItems`, …) y solo la promueven a estado
   vivo si Firestore confirma. Evita dejar la UI mostrando algo que la base de
   datos rechazó.
2. **Los errores se ven.** Los `catch (e) { }` vacíos de los flujos de ajustes
   se sustituyeron por un `showToast(..., 'error')` más `console.error`. Un
   rechazo de Rules tiene que ser visible, sobre todo cuando esas Rules se
   desplieguen.
3. **Los listeners con PII se abren bajo demanda.** `users` e `income_goal`
   solo se suscriben con sesión admin confirmada, y se cierran al perderla.
   Antes cualquier visitante abría un listener sobre la base de clientas
   completa.
4. **El login solo lee.** Reescribir el documento entero en cada entrada
   convertía al navegador en escritor de `role`, `bookedCount` y `createdAt`.
   Ahora la sesión local se deriva del documento y nunca al revés.
5. **La fidelidad no se autoacredita.** El navegador dejó de incrementar
   `bookedCount` al reservar. Queda pendiente de la Fase 7, donde la estampa se
   deriva de una cita completada y se registra en `loyalty_transactions`.
6. **La llave de pago tiene un solo dueño.** Estaba escrita a mano en seis
   sitios y el formulario del panel solo tocaba el DOM: el cambio se perdía al
   recargar y jamás llegaba al mensaje de WhatsApp. Ahora hay una sola
   autoridad y un solo camino de propagación.
7. **Setters entre ámbitos.** `SERVICES_DATA` y `adminDiscountSettings` son
   `let` del script clásico, invisibles para el script de módulo. Los snapshots
   actualizaban solo `window.*` y dejaban una copia obsoleta sirviendo precios
   viejos. `applyServicesData` / `applyDiscountSettings` cierran ese hueco.
8. **La rehidratación optimista se mantiene, pero desarmada.** Se restaura la
   sesión desde cache para que la UI no parpadee, forzando `role: 'client'`, y
   `hydrateClientSession()` la confirma o la borra contra Firestore en cuanto
   Auth resuelve.

## Compatibilidad mantenida

- Fase 1 (agenda por intervalos) intacta: no se tocó disponibilidad, duración
  ni cálculo de solapamiento.
- Fase 2 (Firebase Auth) intacta: no se reintrodujo ningún PIN, password local
  ni token persistido.
- Ni un cambio visual. Mismo HTML, mismo Tailwind, mismos textos.
- Las claves de cache conservan su nombre y su formato, así que un navegador
  con datos previos sigue pintando lo mismo en el primer render.
- Sin framework, sin bundler, sin backend propio.

## Seguridad

| Antes | Ahora |
| --- | --- |
| Todo visitante abría un listener sobre `users` (base de clientas completa). | Solo se suscribe una sesión admin confirmada. |
| El registro copiaba `bookedCount` desde `ncv_users`, editable desde la consola. | Un perfil nuevo nace en cero. |
| Cada reserva incrementaba `bookedCount` desde el navegador. | El navegador ya no escribe fidelidad. |
| El login reescribía `role`, `bookedCount` y `createdAt`. | El login solo lee. |
| `confirmWhatsAppBooking` escribía `users/{telefono}`, ruta paralela a `users/{uid}`. | Eliminada. |
| La sesión se restauraba con el `role` que dijera `localStorage`. | El rol se fuerza a `client` y se verifica contra Firestore. |
| La meta de ingresos vivía en el navegador. | En `settings/income_goal`, admin-only en lectura y escritura. |
| Los fallos de escritura en la nube eran invisibles. | Se muestran a quien está operando. |

Sin secretos versionados. No se movió la `firebaseConfig` pública: sigue siendo
identificación de proyecto, no credencial, y las Rules siguen siendo el único
control real.

## Pruebas ejecutadas

Todas ejecutadas de verdad sobre `index.html` cargado en un navegador real.

| # | Prueba | Método | Resultado |
| --- | --- | --- | --- |
| 1 | Los 5 bloques `<script>` inline compilan | `npm run check` | 5/5 OK, 0 errores |
| 2 | La página carga sin `ReferenceError` ni excepción no capturada | consola del navegador | Sin errores de JS |
| 3 | Todos los helpers nuevos existen en runtime | evaluación en la página | 12/12 definidos |
| 4 | `serverTimestamp` accesible desde el script clásico | `typeof window.firestoreUtils.serverTimestamp` | `"function"` |
| 5 | La llave de pago se propaga a los 4 puntos de la UI + cache | cambio de `PAYMENT_KEY` + `applyPaymentKeyToUI()` | card, display, FAQ, input admin y cache actualizados |
| 6 | La respuesta de la IA usa la llave viva y no la hardcodeada | `getValAiSmartResponse('...llave...')` | Contiene la nueva, no contiene la vieja |
| 7 | El mensaje de WhatsApp usa la variable y no el número fijo | inspección del fuente de `prepareWhatsAppBooking` | `window.PAYMENT_KEY` presente, `0090984300` ausente |
| 8 | Un guardado admin sin Firestore falla de forma visible | `dbInstance = null` + `persistAdminSetting(...)` | Devuelve `false`, no toca cache |
| 9 | Una cache con `role: 'admin'` no produce sesión admin | `ncv_current_user` manipulado + rehidratación | Sesión restaurada como `client`; `isAdminAuthenticated` sigue `false` |
| 10 | Estado inicial coherente | inspección de `SERVICES_DATA`, galería, meta | 12 servicios, 11 fotos, meta en 0 |
| 11 | Sin espacios en blanco problemáticos | `git diff --check` | Sin avisos |

### No ejecutado — BLOQUEO EXTERNO (sigue de la Fase 3)

- Los 39 tests de `firestore.rules` siguen sin ejecutarse: el emulador de
  Firestore necesita Java y esta máquina no lo tiene.
- No se probó contra el proyecto Firebase real. En este entorno
  `signInAnonymously()` responde HTTP 400 (el origen `file://` no está
  autorizado y/o el proveedor anónimo no está habilitado), así que los
  listeners de Firestore no reciben datos. Las pruebas verifican la lógica de
  la aplicación, **no** el viaje de ida y vuelta contra Firestore.

## Resultado de git diff --check

Sin avisos.

## Riesgos encontrados

- **`ncv_appointments` sigue siendo autoridad de las citas.** Es el mayor
  resto de deuda y no puede resolverse sin las reservas atómicas de la Fase 5.
- **La confirmación de reserva sigue tragando el error de Firestore.** Se deja
  deliberadamente para la Fase 5, donde ese bloque se reescribe entero como
  transacción.
- **Todavía no hay `clientUid` en las citas**, así que las Rules siguen sin
  poder desplegarse. Fase 5.
- **`bookedCount` quedó congelado.** Al quitar el auto-incremento y no existir
  todavía la capa de fidelidad, la tarjeta de estampas no avanza entre esta
  fase y la Fase 7. Es intencional: preferimos una tarjeta quieta a una
  falsificable, pero es una regresión funcional temporal y visible.
- **La meta de ingresos configurada antes de esta fase no se migra sola.** Al
  vivir solo en el navegador de quien la puso, hay que volver a guardarla una
  vez desde el panel.

## Deuda técnica

- Migrar `ncv_appointments`, `ncv_client_reviews`, `ncv_community_posts` y
  `ncv_cancellation_alerts` (Fases 5, 6 y 9).
- Retirar `ncv_users` por completo (Fase 8).
- Quedan `catch (e) { }` vacíos fuera del alcance de esta fase, sobre todo en
  los flujos de citas.
- `readCache` / `cacheLocally` conviven con llamadas directas a `localStorage`
  en el código no tocado; unificarlas en la Fase 11.
- `refreshUserAppointmentsUI()` sigue filtrando las citas por teléfono en vez
  de por `clientUid` (Fase 5).

## Cosas deliberadamente no modificadas

- El diseño, los textos y el HTML visible.
- La lógica de disponibilidad de la Fase 1.
- El flujo de autenticación de la Fase 2.
- El listener global de `appointments`: se reescribe en la Fase 5, no antes.
- Reviews y community posts: son de la Fase 9.
- No se migró a `salons/{salonId}/...`.
- No se introdujo React, Vue, Next.js, backend propio ni Supabase.
- **Bot de Telegram: NO IMPLEMENTADO — fuera de alcance.**

## Próxima fase

Fase 5 — Booking atómico: `bookingSlots` con locks de 30 minutos dentro de una
transacción, `clientUid` en las citas, liberación de locks al cancelar y prueba
de concurrencia. Cierra las incompatibilidades 1, 2 y 7 de la Fase 3 y permite
retirar `ncv_appointments` como autoridad.

## Commit de cierre

```text
refactor: make firestore the source of truth
```
