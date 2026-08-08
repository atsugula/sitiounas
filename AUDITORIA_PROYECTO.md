# Auditoria del proyecto `sitioauditoria`

## Resumen ejecutivo
- El proyecto es una **landing/app de una sola pagina** hecha en **HTML estatico + JavaScript vanilla embebido**, con **Tailwind por CDN** y bastante logica de negocio dentro de `index.html`.
- No hay `package.json`, `src/`, build pipeline ni framework SPA. La app vive casi por completo en un unico archivo grande.
- Existe integracion con **Firebase Auth + Firestore** por CDN, pero la app tambien cae a **localStorage** como fallback. Eso la hace util como demo, pero fragile para produccion si no se cierran reglas y validaciones.
- La mayor parte del disenio actual si es reutilizable. Lo que mas urge reconstruir es **seguridad, persistencia real, modelo de datos y autorizacion**.

## 1) Estructura del proyecto

### Inventario
| Archivo | Tamano aprox. | Rol |
|---|---:|---|
| `index.html` | 465,570 B (~455 KB) | App completa: HTML, CSS y JS embebido |
| `logo.jpg` | 44,315 B (~43 KB) | Asset propio de marca |

### Arbol relevante
```text
D:\trabajo\sitioauditoria
├─ index.html
└─ logo.jpg
```

### Clasificacion
- Propios: `index.html`, `logo.jpg`.
- Externos/generados: ninguno dentro del repo.
- No hay carpetas de codigo, dependencias locales, ni build artifacts.

## 2) Stack actual

### Tecnologias detectadas
- **HTML/CSS/JS vanilla**: si, todo esta en `index.html`.
- **Tailwind CSS**: si, por `https://cdn.tailwindcss.com`.
- **Bootstrap**: no detectado.
- **React/Vue/Angular**: no detectado.
- **Firebase**: si, Auth + Firestore por CDN.
- **Supabase**: no detectado.
- **Chart.js**: si, cargado dinamicamente para graficas admin.
- **Google Fonts**: si, `Playfair Display` y `Plus Jakarta Sans`.
- **Font Awesome**: si.
- **WhatsApp**: si, enlaces y redireccion para reservas.
- **Google Maps**: si, iframe/links de ubicacion.
- **Pinterest / Instagram / TikTok / Facebook**: si, enlaces sociales.
- **Imagenes externas**: si, `unsplash.com` e `i.ibb.co`.

### Dependencias remotas visibles
- Tailwind CDN.
- Google Fonts.
- Font Awesome CDN.
- Firebase JS SDK.
- Chart.js CDN.
- WhatsApp API.
- Google Maps embed.
- Redes sociales externas.
- Imagenes externas de galeria y hero.

## 3) Arquitectura actual
- **No es SPA de framework**.
- **No es una app compilada**.
- **Si es una SPA de facto** en el sentido de una sola pagina con secciones y modales, pero sin router real.
- **Es una combinacion de HTML estatico + JS embebido + Firebase opcional + localStorage**.
- Hay una ruta/entrada administrativa por `#admin` o `/admin`, pero es solo una convención del frontend.

## 4) Firebase y backend

### Firebase detectado
Fuentes principales:
- `index.html:3255-3397`
- `index.html:3539-3544`
- `index.html:5714-5751`
- `index.html:6230-6261`
- `index.html:6822-6875`
- `index.html:6993-7251`

### Que usa hoy
- `initializeApp`
- `getAuth`
- `signInAnonymously`
- `signInWithEmailAndPassword`
- `createUserWithEmailAndPassword`
- `signOut`
- `onAuthStateChanged`
- `getFirestore`
- `doc`, `setDoc`, `addDoc`, `getDoc`
- `collection`, `query`, `where`, `getDocs`, `deleteDoc`
- `onSnapshot`

### Que NO vi
- No hay `fetch()` a backend propio.
- No hay `Realtime Database` implementada.
- No hay `Cloud Functions` implementadas.
- No hay uso real de `Storage`, aunque el `storageBucket` esta configurado.

### Servicios remotos que si dependen de la nube
- Auth de admin y cliente, cuando Firebase responde.
- Sincronizacion de:
  - `appointments`
  - `users`
  - `settings/custom_services`
  - `settings/discount_settings`
  - `settings/schedule_blocks`
  - `settings/gallery_items`
  - `settings/marketing_popup`
  - `community_posts`
  - `reviews`
- Si Firestore falla, la app cae a `localStorage`, pero eso no es multi-dispositivo ni confiable.

## 5) Autenticacion
- **Si existe login** de cliente.
- **Si existe registro** de cliente.
- **No existe recuperacion de contrasena**.
- **No existe sistema de roles real** en servidor.
- **Admin** y **cliente** existen solo como conceptos de UI.
- La persistencia de sesion depende de `localStorage` (`ncv_current_user`) y del estado de Firebase Auth si esta disponible.
- El login de cliente busca en `localStorage` y tambien en Firestore.
- El registro guarda `password` en claro en el cliente y tambien puede copiarse a Firestore. Esto es un riesgo alto.
- El panel admin valida por email hardcodeado y contrasena local o Firebase. No hay autorizacion de servidor.

## 6) Agenda / reservas

### Flujo actual
1. El usuario selecciona uno o varios servicios.
2. El calendario bloquea domingos, fechas bloqueadas y horarios ocupados.
3. La disponibilidad se calcula por duracion total del paquete.
4. El usuario llena nombre, telefono, notas y adjunta comprobante de abono.
5. Se genera un preview de WhatsApp.
6. Al confirmar, la cita se guarda en `localStorage` y tambien en Firestore si esta disponible.
7. Luego se redirige a WhatsApp.

### Lo que si existe
- Servicios con precio y duracion.
- Calendario mensual.
- Horarios por bloques de 30 min.
- Bloqueo de dias y slots.
- Prevencion de solapamientos en la UI.
- Cancelacion por telefono.
- Estados: `confirmada`, `cancelada`, `completada` en partes del planner/admin.
- Citas presenciales desde admin.
- Registro de abono de $10.000 y politica de devolucion por 24h.

### Lo que falta para ser robusto
- Bloqueo anti doble-reserva garantizado del lado servidor.
- Validacion fuerte de horario y duracion en backend/reglas.
- Manejo transaccional de cancelacion y reprogramacion.
- Reglas de negocio por profesional/servicio si se agregan multiples staff.

## 7) Tarjeta de fidelidad
- Existe una tarjeta visual de 10 sellos.
- El contador real viene de `bookedCount`.
- Al llegar a 10 citas se habilita un descuento para la cita 11.
- El descuento y texto son configurables desde admin.
- No existe ledger real de puntos/sellos con historial.
- No existe tabla/coleccion de transacciones de fidelidad.
- Hoy la fidelidad es **derivada del contador** mas que un sistema auditable.

## 8) Panel administrativo

### Funcionalidades visibles
- Gestion de citas.
- Registro manual de citas presenciales.
- Cambio de estado de citas.
- Bloqueo de fechas y turnos.
- Edicion de servicios y precios.
- Galeria de trabajos.
- Configuracion de promociones y banner.
- Configuracion de tarjeta de fidelidad.
- Reseñas.
- Muro/comunidad.
- Cumpleanos y metricas.
- Graficas de ingresos/reservas.
- Meta de ingresos.
- Cambio de contrasena admin y PIN.

### Observacion clave
- El panel es potente, pero sigue siendo **frontend-trust**: si el cliente manipula el navegador, no hay barrera real de autorizacion salvo Firebase Rules.

## 9) Datos

### Lo que ya existe hoy
Persistencia local actual:
- `ncv_users`
- `ncv_current_user`
- `ncv_appointments`
- `ncv_custom_services`
- `ncv_discount_settings`
- `ncv_blocked_dates_list`
- `ncv_blocked_time_slots`
- `ncv_gallery_items`
- `ncv_client_reviews`
- `ncv_community_posts`
- `ncv_marketing_popup`
- `ncv_admin_password`
- `ncv_admin_pin`
- `ncv_income_goal`
- `ncv_income_goal_type`
- `ncv_firebase_config`

### Modelo de datos sugerido, minimo viable
- `users`
  - `id`, `name`, `phone`, `email`, `birthdate`, `passwordHash` o auth uid, `role`, `bookedCount`, `createdAt`
- `appointments`
  - `id`, `userId`, `name`, `phone`, `serviceSummary`, `serviceIds`, `dateKey`, `appointmentDateIso`, `time`, `durationMinutes`, `status`, `notes`, `promoCode`, `paidStatus`, `refundEligible`, `isRefunded`, `createdAt`
- `services`
  - `id`, `name`, `price`, `durationMinutes`, `category`, `active`, `order`
- `settings`
  - documentos tipo `custom_services`, `discount_settings`, `schedule_blocks`, `marketing_popup`
- `reviews`
  - `id`, `userId` opcional, `name`, `service`, `rating`, `comment`, `photoUrl`, `createdAt`
- `community_posts`
  - `id`, `userId` opcional, `name`, `message`, `photoUrl`, `likes`, `createdAt`
- `loyalty_transactions`
  - `id`, `userId`, `appointmentId`, `type`, `stampsDelta`, `reason`, `createdAt`
- `staff`
  - solo si se vuelve multi-profesional
- `schedules`
  - solo si se necesita agenda por profesional

### Nota
- No conviene inventar mas tablas ahora. El sistema actual pide poca estructura, pero si se quiere vender a multiples salones, `appointments`, `users`, `services` y `settings` son el nucleo.

## 10) Seguridad

### Hallazgos
- Configuracion publica de Firebase visible en el frontend. No es un secreto, pero tampoco protege nada por si sola.
- Contrasenas de admin con fallback trivial en cliente.
- PIN de admin guardado localmente.
- Contrasenas de clientes en claro en `localStorage` y potencialmente en Firestore.
- Autorizacion solo en frontend.
- `signInAnonymously` abre la puerta a confiar demasiado en reglas laxas.
- Mucho uso de `innerHTML`, aunque gran parte del contenido de usuario pasa por `escapeHtml`.
- No vi CSP, validacion server-side ni reglas del lado backend en este repo.

### Lo que haria falta en Firebase Rules
- Escritura de `appointments` solo a usuarios autenticados o via claims/control de reglas.
- Lectura/escritura de `users` restringida al propio usuario o admin.
- `settings` solo admin.
- `reviews` y `community_posts` con validacion de esquema y limites.
- Denegar acceso anonimo a datos sensibles si se va a usar auth real.

## 11) Dependencias de Internet

### Necesita Internet para funcionar bien
- Tailwind CDN.
- Google Fonts.
- Font Awesome.
- Firebase Auth/Firestore.
- Chart.js.
- Imagenes externas.
- Google Maps.
- WhatsApp links.
- Redes sociales.

### Puede funcionar local/offline solo de forma limitada
- La estructura HTML base.
- Parte del contenido ya renderizado.
- Estado cacheado en `localStorage`.

### No es un offline-first real
- Sin CDN, sin red y sin cache previo, la experiencia se degrada mucho.

## 12) Estado funcional

| Funcionalidad | Existe | Funciona | Backend requerido | Estado | Notas |
|---|---|---|---|---|---|
| Landing | Si | Parcial | No | Activa | Depende de CDNs e imagenes externas |
| Servicios | Si | Si | No | Activa | Data en array + sync opcional |
| Precios | Si | Si | No | Activa | Editable desde admin |
| Login | Si | Parcial | Si | Debil | Fallback localStorage y sin recovery |
| Registro | Si | Parcial | Si | Debil | Guarda password en claro |
| Agenda | Si | Parcial | Si | Debil | UI funcional, integridad no garantizada |
| Disponibilidad | Si | Parcial | Si | Debil | Calculada en frontend |
| Fidelidad | Si | Parcial | Si | Debil | Basada en `bookedCount` |
| Perfil | Si | Parcial | No | Activa | Perfil local de sesion |
| Panel admin | Si | Parcial | Si | Debil | Autorizacion solo frontend |
| Reseñas | Si | Parcial | Si | Activa | Persistencia local + Firestore opcional |
| WhatsApp | Si | Si | No | Activa | Depende de WhatsApp externo |
| Mapas | Si | Si | No | Activa | Embed externo |

## 13) Propuesta de arquitectura de bajo costo

### A) Frontend actual + Firebase
- **Costo**: muy bajo.
- **Mantenimiento**: bajo.
- **Desarrollo**: rapido.
- **Seguridad**: media-baja si no se endurecen rules.
- **Multi-salon**: posible, pero el modelo actual no esta pensado para eso.
- **Veredicto**: la opcion mas compatible con lo que ya existe.

### B) Frontend actual + Supabase
- **Costo**: bajo.
- **Mantenimiento**: bajo-medio.
- **Desarrollo**: medio.
- **Seguridad**: buena con RLS.
- **Multi-salon**: mejor base relacional.
- **Veredicto**: buena si ya saben que el producto sera SaaS multi-tenant.

### C) Frontend actual + backend propio Node
- **Costo**: medio-alto.
- **Mantenimiento**: alto.
- **Desarrollo**: mas lento.
- **Seguridad**: alta si se hace bien.
- **Multi-salon**: muy flexible.
- **Veredicto**: solo vale la pena si aparecen necesidades que Firebase/Supabase no cubran.

### D) Solo frontend + localStorage
- **Costo**: minimo.
- **Mantenimiento**: minimo.
- **Desarrollo**: rapido.
- **Seguridad**: mala.
- **Multi-salon**: no viable.
- **Veredicto**: sirve para demo o prototipo, no para producto real.

### Recomendacion final
- **Recomendacion inmediata: A) Frontend actual + Firebase**, pero solo si se endurecen reglas y se elimina la confianza en `localStorage` para datos sensibles.
- Si el objetivo comercial real es venderlo como sistema multi-salon, la segunda opcion a evaluar seria **B) Supabase** por el modelo relacional.

## 14) Plan de implementacion

### Fase 0 - limpieza y preparacion
- Modificar: `index.html`.
- Nuevos: opcionalmente `assets/js/*` si se decide modularizar.
- Dependencias: ninguna nueva.
- Riesgo: bajo.
- Dificultad: baja.

### Fase 1 - persistencia/base de datos
- Modificar: `index.html`.
- Nuevos: `assets/js/firebase.js`, `assets/js/storage.js` o equivalente.
- Dependencias: Firebase SDK.
- Riesgo: medio.
- Dificultad: media.

### Fase 2 - autenticacion
- Modificar: auth modal y flujos de sesion.
- Nuevos: `assets/js/auth.js`.
- Dependencias: Firebase Auth.
- Riesgo: alto.
- Dificultad: media-alta.

### Fase 3 - agenda
- Modificar: booking, calendario, cancelacion, estados.
- Nuevos: `assets/js/booking.js`.
- Dependencias: Firestore rules/transactions.
- Riesgo: alto.
- Dificultad: alta.

### Fase 4 - administracion
- Modificar: panel admin, tabs, permisos.
- Nuevos: `assets/js/admin.js`.
- Dependencias: claims/rules.
- Riesgo: alto.
- Dificultad: alta.

### Fase 5 - fidelidad
- Modificar: tarjeta, contador, premio.
- Nuevos: `assets/js/loyalty.js`.
- Dependencias: transacciones de fidelidad.
- Riesgo: medio.
- Dificultad: media.

### Fase 6 - seguridad
- Modificar: auth, almacenamiento, validaciones, escape/sanitizacion.
- Nuevos: reglas de Firebase, validadores.
- Dependencias: Firebase Rules.
- Riesgo: alto.
- Dificultad: alta.

### Fase 7 - despliegue
- Modificar: config final y assets.
- Nuevos: solo si se separa bundle.
- Dependencias: hosting estatico.
- Riesgo: bajo.
- Dificultad: baja-media.

## 15) Reutilizacion
- **Aproximadamente 80-85% del frontend visual se puede reutilizar**.
- Mantener:
  - hero, navbar, secciones y copy.
  - tarjetas de servicios.
  - modal de reserva.
  - tarjeta de fidelidad.
  - galeria.
  - panel visual admin.
  - enlaces a WhatsApp, mapas y redes.
- Reconstruir:
  - autenticacion real.
  - persistencia segura.
  - reglas de agenda.
  - autorizacion admin.
  - historial de fidelidad.
  - capa de datos.
- No conviene reescribir todavia:
  - el look actual.
  - los textos comerciales.
  - los componentes visuales ya alineados con la marca.

## 16) Conclusion

### Diagnostico en 10 puntos
1. Es una landing monolitica de un solo archivo.
2. Tailwind, Font Awesome y Firebase vienen por CDN.
3. No hay build system ni framework moderno.
4. La agenda ya existe, pero la integridad depende del frontend.
5. El login/registro existen, pero son debiles para produccion.
6. La fidelidad es visual y derivada del contador, no auditable.
7. El panel admin es amplio, pero su autorizacion es solo cliente.
8. Reviews, comunidad, galeria y settings ya tienen persistencia local y sincronizacion opcional.
9. La seguridad es el mayor hueco actual.
10. La UI actual tiene mucho valor reutilizable.

### Arquitectura recomendada
- **Frontend actual + Firebase**, endurecido con reglas serias y eliminando password storage en claro.

### Primera accion a ejecutar
- Definir y cerrar el **modelo de datos + Firebase Rules** para `users`, `appointments`, `settings`, `reviews` y `community_posts` antes de ampliar funcionalidades.

### 10 secciones mas importantes para empezar
1. `index.html:1-140` - head, metas, Tailwind, Fonts, Font Awesome.
2. `index.html:315-620` - navbar, hero y banner de fidelidad.
3. `index.html:607-980` - servicios y flujo de reserva.
4. `index.html:1829-1867` - modal de auth admin.
5. `index.html:2049-3243` - panel admin completo.
6. `index.html:3255-3397` - Firebase init y sincronizacion.
7. `index.html:3528-3810` - login/registro de cliente y sesion.
8. `index.html:4170-5497` - calendario, horarios, bloqueos, descuentos y popup.
9. `index.html:6683-7337` - galeria, reseñas y comunidad.
10. `index.html:7420-7777` - init general, popup marketing y planner tipo agenda.

