# Modelo Firestore Fase 3.1

## 1) Resumen ejecutivo
- El proyecto ya usa Firestore para `users`, `appointments`, varias configuraciones de `settings`, `community_posts` y `reviews`.
- El frontend sigue mezclando Firestore con `localStorage`, asi que hoy hay dos fuentes de datos vivas.
- El mayor riesgo no es solo el modelo, sino que el frontend aun puede leer y escribir colecciones completas desde una sola pagina.
- Para la siguiente fase, el modelo mas seguro y menos disruptivo es mantener colecciones planas con `salonId` como campo, y endurecer Rules por coleccion y por propiedad.

## 2) Inventario real de Firestore

### Lecturas activas
| Operacion | Recurso | Funcion | Quien la ejecuta hoy | Quien deberia poder hacerlo |
| --- | --- | --- | --- | --- |
| `getDoc()` | `users/{uid}` | `checkFirebaseAdminRole`, `handleAdminAuthSubmit`, `openAdminPanelModal`, `handleUserLogin` | Admin + cliente autenticado | Admin para validar rol; cliente solo su propio perfil |
| `onSnapshot()` | `appointments` | sincronizacion general y disponibilidad | Todo usuario al cargar la app | Publico solo si se expone un subconjunto seguro; idealmente cliente autenticado + admin |
| `onSnapshot()` | `users` | sync de usuarios para UI/admin | Todo usuario al cargar la app | Admin solamente |
| `onSnapshot()` | `settings/custom_services` | servicios personalizados | Todo usuario | Publico read / admin write |
| `onSnapshot()` | `settings/discount_settings` | descuentos, banner, ticket | Todo usuario | Publico read / admin write |
| `onSnapshot()` | `settings/schedule_blocks` | dias y turnos bloqueados | Todo usuario | Publico read / admin write |
| `onSnapshot()` | `settings/gallery_items` | galeria | Todo usuario | Publico read / admin write |
| `onSnapshot()` | `community_posts` | muro de comunidad | Todo usuario | Publico read / public create / admin moderate |

### Escrituras activas
| Operacion | Recurso | Funcion | Tipo | Quien deberia poder hacerlo |
| --- | --- | --- | --- | --- |
| `setDoc()` | `users/{uid}` | `handleUserRegister` | create/update perfil seguro | Cliente autenticado, solo su propio doc |
| `setDoc()` | `users/{uid}` | `handleUserLogin` | saneado de perfil actual | Cliente autenticado, solo su propio doc |
| `setDoc()` | `users/{phone}` | `confirmWhatsAppBooking` | legacy, inconsistente | Bloqueado en la siguiente fase; no deberia seguir activo para auth/profile |
| `setDoc()` | `appointments/{id}` | `confirmWhatsAppBooking` | create cita | Cliente/anonimo autenticado, propio registro |
| `setDoc()` | `appointments/{id}` | `handleAdminWalkInSubmit` | create cita presencial | Admin |
| `setDoc()` | `appointments/{id}` | `changeBookingStatus` | update status | Admin |
| `setDoc()` | `appointments/{id}` | `toggleAbonoRefund` | update finanzas/abono | Admin |
| `setDoc()` | `appointments/{id}` | `requestClientCancellation` | update cancelacion | Propietario de la cita o flujo publico controlado por su propia cita |
| `setDoc()` | `settings/custom_services` | `saveSingleServiceData` | update servicios | Admin |
| `setDoc()` | `settings/discount_settings` | `saveAdminDiscountSettings` | update descuentos | Admin |
| `setDoc()` | `settings/schedule_blocks` | `toggleBlockEntireDate`, `removeBlockedDate`, `toggleAdminSlotBlock` | update horarios | Admin |
| `setDoc()` | `settings/gallery_items` | admin gallery editor | update galeria | Admin |
| `setDoc()` | `settings/marketing_popup` | `saveAdminPopupSettings` | update popup | Admin |
| `addDoc()` | `reviews` | `submitReview` | create reseña | Publico autenticado o usuario del salon; hoy es publico |
| `setDoc()` | `reviews/{id}` | `adminEditReview` | update reseña | Admin |
| `deleteDoc()` | `reviews/{id}` | `adminDeleteReview` | delete reseña | Admin |
| `setDoc()` | `community_posts/{id}` | `submitCommunityPost` | create post | Publico hoy; en Rules futuras, usuario autenticado |
| `setDoc()` | `community_posts/{id}` | `adminEditCommunityPost` | update post | Admin |
| `deleteDoc()` | `community_posts/{id}` | `adminDeleteCommunityPost` | delete post | Admin |
| `setDoc()` | `community_posts/{id}` | `likeCommunityPost` | update likes | Publico autenticado / propietario del click, idealmente con limite anti-abuso |

### Operaciones que no aparecen activas
- No hay llamadas activas a `query()`, `where()` ni `getDocs()` en el runtime actual.
- Esas funciones solo estan importadas, pero no forman parte del flujo vivo encontrado.

## 3) Colecciones detectadas
- `users`
- `appointments`
- `settings/custom_services`
- `settings/discount_settings`
- `settings/schedule_blocks`
- `settings/gallery_items`
- `settings/marketing_popup`
- `community_posts`
- `reviews`

## 4) Users

### Esquema actual
- Alta de cliente: `handleUserRegister` escribe `users/{uid}` con un perfil seguro.
- Login de cliente: `handleUserLogin` lee `users/{uid}` y vuelve a sanear `users/{uid}` para la cuenta activa.
- Recoleccion admin: `onSnapshot(collection(users))` carga todos los usuarios.
- Legado activo: `confirmWhatsAppBooking` sigue escribiendo `users/{phone}` con `currentUserSession`, lo que mezcla ids por `uid` y por telefono.

### Esquema actual observado
```js
{
  uid,
  salonId: "nails-con-val",
  name,
  phone,
  email,
  birthdate,
  role,
  bookedCount,
  createdAt
}
```

### Riesgos actuales
- Un cliente no deberia poder cambiar `role`.
- Un cliente no deberia poder autoproclamarse admin.
- `bookedCount` no deberia ser editable libremente por el cliente.
- `users/{phone}` sigue siendo una ruta legacy que rompe la unicidad y complica Rules.

### Esquema objetivo
```js
users/{uid} = {
  uid,
  salonId,
  name,
  phone,
  email,
  birthdate,
  role,         // client | admin
  bookedCount,   // no editable por cliente
  createdAt
}
```

### Reglas conceptuales para users
- El cliente puede leer su propio perfil.
- El cliente puede editar solo campos permitidos de su perfil.
- El cliente no puede cambiar `role`, `uid`, `salonId` ni `bookedCount` directamente.
- El admin puede leer usuarios del salon y operar sobre ellos segun necesidad administrativa.

## 5) Admin

### Enfoque conceptual para `isAdmin()`
```text
request.auth != null
&&
get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "admin"
```

### Riesgo principal
- Si el cliente puede escribir su propio `role`, se puede promover a admin.
- Por eso, `role` debe ser inmutable para escrituras de cliente.

### Alternativa futura
- Firebase Custom Claims.
- No se implementa en esta fase, pero seria mas robusto para admin real.

## 6) Appointments

### Esquema actual real
El frontend ya escribe y lee citas con campos como:
```js
{
  id,
  appointmentDateIso,
  dateKey,
  serviceIds,
  serviceSummary,
  durationMinutes,
  startTime,
  endTime,
  time,
  name,
  phone,
  service,
  notes,
  promoCode,
  birthday,
  status,
  createdAt,
  salonId,
  isWalkIn,
  paidStatus,
  refundEligible,
  isRefunded,
  cancellationNoticeHours
}
```

### Flujo real actual
- Cita web: `prepareWhatsAppBooking()` construye `pendingAppointmentData`.
- Confirmacion: `confirmWhatsAppBooking()` persiste la cita en `appointments/{id}`.
- Cita presencial: `handleAdminWalkInSubmit()` crea una cita manual en `appointments/{id}`.
- Cancelacion admin: `changeBookingStatus()` actualiza `status`.
- Cancelacion cliente: `requestClientCancellation()` marca cancelada y escribe `refundEligible/isRefunded/cancellationNoticeHours`.
- Ajuste de devolucion: `toggleAbonoRefund()` cambia `isRefunded`.

### Riesgos y permisos
- Hoy el cliente puede iniciar una cancelacion por telefono sin login fuerte.
- Hoy el admin puede cambiar status, marcar completada y tocar el abono.
- El frontend calcula disponibilidad en cliente, pero Firestore aun guarda todas las citas completas.

### Esquema objetivo minimo
- Mantener la coleccion `appointments`.
- Agregar en la siguiente fase un campo de ownership real como `clientUid` o `ownerUid` para aplicar Rules solidas.
- Mantener `salonId` como campo.

## 7) Services

### Donde viven hoy
- Fuente local: `SERVICES_DATA` en memoria.
- Cache: `localStorage ncv_custom_services`.
- Firestore: `settings/custom_services` con `{ services: SERVICES_DATA }`.

### Modelo recomendado
Opcion 1, menos disruptiva ahora:
```text
settings/custom_services
```

Opcion 2, mejor a largo plazo:
```text
services/{serviceId}
```

### Recomendacion
- Mantener `settings/custom_services` por ahora.
- Migrar a `services/{serviceId}` solo cuando se haga una separacion multi-salon mas formal.

## 8) Settings

### Configuraciones detectadas
| Configuracion | Recurso actual | Clasificacion recomendada |
| --- | --- | --- |
| Servicios | `settings/custom_services` | Public read / Admin write |
| Descuentos y banner | `settings/discount_settings` | Public read / Admin write |
| Dias y turnos bloqueados | `settings/schedule_blocks` | Public read / Admin write |
| Galeria | `settings/gallery_items` | Public read / Admin write |
| Popup marketing | `settings/marketing_popup` | Public read / Admin write |
| Meta de ingresos | `ncv_income_goal`, `ncv_income_goal_type` | Admin only, luego Firestore |
| Llave de pago | UI actual | Public display / Admin write, pero aun no centralizada |

### Nota
- Aunque algunas configuraciones son "administrativas", varias deben seguir siendo de lectura publica porque alimentan la UI del sitio.

## 9) Reviews y Community

### Reviews
- Lectura actual: `localStorage ncv_client_reviews`.
- Escritura actual: `addDoc(reviews)` al crear, `setDoc/deleteDoc(reviews/{id})` al moderar.
- Publico puede crear una reseña hoy.
- Admin puede editar y borrar.

### Community posts
- Lectura actual: `onSnapshot(collection(community_posts))` y cache local.
- Escritura actual: `setDoc` para crear/editar y `deleteDoc` para borrar.
- Publico puede crear post hoy.
- Admin modera.

### Recomendacion de modelo
- Agregar `authorUid` en reviews y community posts para poder ligar ownership cuando Rules endurezcan.
- Mantener moderacion admin en ambos recursos.

## 10) Salon ID

### Modelo A
```text
users/{uid}
appointments/{id}
services/{id}
settings/{doc}
```
con `salonId` como campo.

### Modelo B
```text
salons/{salonId}/users/{uid}
salons/{salonId}/appointments/{id}
salons/{salonId}/services/{id}
```

### Recomendacion
- Para este proyecto, el modelo A es menos disruptivo y encaja con el frontend actual.
- El modelo B es mejor a largo plazo para multi-salon, pero implica una migracion grande que ahora no conviene.

## 11) BookedCount / Fidelidad

### Riesgo actual
- `bookedCount` se incrementa desde el frontend y tambien se escribe en `ncv_users` y `users`.
- Si el cliente puede modificarlo, la fidelidad se puede falsear.

### Regla conceptual
- El cliente no debe poder escribir `bookedCount` directamente.
- Ese campo deberia derivarse de citas completadas o de una capa de backend/fidelidad posterior.

## 12) LocalStorage vs Firestore

| Clave | Clasificacion | Nota |
| --- | --- | --- |
| `ncv_users` | D requiere migracion | Legado + cache de compatibilidad; ya no debe autenticar |
| `ncv_current_user` | A cache/UI | Sesion visual temporal |
| `ncv_appointments` | D requiere migracion | Cache local duplicada de Firestore |
| `ncv_custom_services` | D requiere migracion | Cache local de `settings/custom_services` |
| `ncv_discount_settings` | D requiere migracion | Cache local de `settings/discount_settings` |
| `ncv_blocked_dates_list` | D requiere migracion | Cache local de `settings/schedule_blocks` |
| `ncv_blocked_time_slots` | D requiere migracion | Cache local de `settings/schedule_blocks` |
| `ncv_gallery_items` | D requiere migracion | Cache local de `settings/gallery_items` |
| `ncv_client_reviews` | D requiere migracion | Fuente local actual de reviews |
| `ncv_community_posts` | D requiere migracion | Fuente local actual de community |
| `ncv_marketing_popup` | D requiere migracion | Configuracion duplicada |
| `ncv_income_goal` | D requiere migracion | Configuracion admin local |
| `ncv_income_goal_type` | D requiere migracion | Configuracion admin local |
| `ncv_firebase_config` | A cache/UI | Setup local del proyecto Firebase |

## 13) Matriz de permisos

| Recurso | Publico | Cliente | Propietario | Admin |
| --- | --- | --- | --- | --- |
| `users` | no | own read / limited write | own limited write | read/write |
| `appointments` | availability only o lectura restringida | create/read own | cancel own limitado | read/write |
| `settings/custom_services` | read | read | - | write |
| `settings/discount_settings` | read | read | - | write |
| `settings/schedule_blocks` | read | read | - | write |
| `settings/gallery_items` | read | read | - | write |
| `settings/marketing_popup` | read | read | - | write |
| `reviews` | read | create | own edit limitado | moderate |
| `community_posts` | read | create | own edit limitado | moderate |

## 14) Pseudocodigo de Rules

```text
isAuthenticated():
  request.auth != null

isOwner(uid):
  request.auth != null && request.auth.uid == uid

isAdmin():
  request.auth != null &&
  get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "admin"

sameSalon(salonId):
  resource.data.salonId == salonId || request.resource.data.salonId == salonId

validUserCreate():
  isAuthenticated() &&
  request.resource.data.uid == request.auth.uid &&
  request.resource.data.role == "client" &&
  request.resource.data.salonId == "nails-con-val" &&
  request.resource.data.role is immutable later

validUserUpdate():
  isOwner(resource.id) &&
  request.resource.data.uid == resource.data.uid &&
  request.resource.data.salonId == resource.data.salonId &&
  request.resource.data.role == resource.data.role &&
  request.resource.data.bookedCount == resource.data.bookedCount or admin-only

validAppointmentCreate():
  isAuthenticated() &&
  request.resource.data.salonId == "nails-con-val" &&
  request.resource.data.status in ["confirmada", "pendiente"]

validAppointmentUpdate():
  isAdmin() ||
  (isOwner(resource.data.clientUid) && only cancel fields change)
```

### Campos que deberian ser inmutables
- `uid`
- `salonId`
- `role`
- `createdAt`
- `clientUid` / `ownerUid` una vez creado
- `appointmentDateIso`
- `dateKey`
- `serviceIds`
- `durationMinutes`
- `startTime`
- `endTime`

## 15) Queries actuales que podrian romperse con Rules estrictas
- `onSnapshot(collection(db, 'appointments'))`
- `onSnapshot(collection(db, 'users'))`
- `onSnapshot(collection(db, 'community_posts'))`
- `onSnapshot(doc(db, 'settings', 'custom_services'))`
- `onSnapshot(doc(db, 'settings', 'discount_settings'))`
- `onSnapshot(doc(db, 'settings', 'schedule_blocks'))`
- `onSnapshot(doc(db, 'settings', 'gallery_items'))`

### Nota
- La mayor ruptura probable sera por lecturas amplias de colecciones completas, no por `query()` porque hoy no se usa de forma activa.

## 16) Orden recomendado para implementar Rules
1. `users` con rol y ownership.
2. `settings/*` de lectura publica y escritura admin.
3. `appointments` con ownership real y control de cancelacion/status.
4. `community_posts` y `reviews` con creacion publica limitada y moderacion admin.
5. Retirar gradualmente la dependencia de `localStorage` como fuente operativa.

## 17) Riesgos principales
- Un cliente podria intentar modificar `role` si las Rules de `users` no lo bloquean.
- `bookedCount` hoy es sensible y no deberia quedar editable por cliente.
- `users/{phone}` es una ruta legacy que complica ownership y debe dejar de usarse como doc principal.
- Las lecturas de colecciones completas no sobreviviran a Rules estrictas sin ajustar el frontend o la politica de acceso.

## 18) Cierre
- Para esta fase, el modelo menos disruptivo es `salonId` como campo en colecciones planas.
- El siguiente paso natural es escribir Rules por coleccion y despues corregir los puntos del frontend que hoy dependen de lecturas amplias o de la ruta legacy `users/{phone}`.
