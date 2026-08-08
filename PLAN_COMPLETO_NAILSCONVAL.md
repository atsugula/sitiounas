# PLAN COMPLETO DE IMPLEMENTACIÓN — NAILSCONVAL

## 1. Objetivo

Llevar la landing/app actual de NailsConVal a una versión estable, segura y utilizable en producción de bajo costo, preservando al máximo el frontend existente y utilizando **Firebase Authentication + Cloud Firestore** como backend principal.

El proyecto seguirá siendo, por ahora, una solución ligera basada en:

- HTML/CSS/JavaScript vanilla.
- Tailwind por CDN mientras no exista una razón fuerte para cambiarlo.
- Firebase Authentication.
- Cloud Firestore.
- Hosting estático.
- WhatsApp como canal de confirmación/contacto.
- Sin backend Node propio en el MVP.
- Sin migración a React/Vue/Angular.
- Sin migración a Supabase en esta etapa.

## 2. Fuera de alcance actual

Queda explícitamente fuera de este plan:

- Bot de Telegram.
- Multi-salón completo.
- App móvil nativa.
- Backend Node/Express propio.
- Migración a framework frontend.
- Sistema de pagos en línea integrado.
- SaaS multi-tenant completo.
- Firebase Custom Claims, salvo que las Rules basadas en documentos resulten insuficientes y se documente primero.
- Reescritura visual completa de la web.

El bot de Telegram podrá evaluarse posteriormente como módulo adicional de notificaciones, pero **no debe implementarse ni prepararse en esta ejecución**.

---

# 3. Estado actual consolidado

## Fase 0 — Auditoría y baseline

**Estado: COMPLETADA**

Ya existe:

- Auditoría técnica del proyecto.
- Identificación del stack.
- Identificación de riesgos.
- Recomendación de mantener frontend actual + Firebase.
- Git como mecanismo de control de cambios.
- Estrategia de cambios pequeños y verificables.

Documento de referencia:

- `AUDITORIA_PROYECTO.md`

La auditoría determinó que el proyecto es una landing/app monolítica basada principalmente en `index.html`, con Firebase Auth + Firestore y compatibilidad histórica con `localStorage`.

---

## Fase 1 — Agenda por duración e intervalos

**Estado: COMPLETADA**

Objetivos ya resueltos:

- Duración real de servicios.
- Suma de duración para múltiples servicios.
- Citas de 2, 3 o más horas bloquean todo el intervalo ocupado.
- Validación correcta de solapamiento.
- Compatibilidad con registros antiguos.
- Normalización parcial del documento de cita.

Campos incorporados:

- `appointmentDateIso`
- `dateKey`
- `serviceIds`
- `serviceSummary`
- `durationMinutes`
- `startTime`
- `endTime`
- `salonId`

Documento:

- `CAMBIOS_AGENDA_FASE_1.md`

Riesgo todavía pendiente:

La validación de intervalos existe en frontend, pero aún falta garantizar atomicidad y evitar doble reserva concurrente desde Firestore.

Commit de referencia esperado:

```text
feat: normalize appointment duration and availability
```

---

## Fase 2 — Autenticación y seguridad del frontend

**Estado: COMPLETADA**

Subfases cerradas:

- 2.1 Entrada segura al panel admin.
- 2.2 Restauración segura de sesión admin.
- 2.3 Registro seguro de clientes.
- 2.4 Login seguro de clientes.
- 2.5A Cambio de contraseña admin mediante Firebase Auth.
- 2.5B Eliminación del PIN admin legacy.
- 2.6 Barrido final de autenticación legacy.

Estado logrado:

- Firebase Auth es la autoridad de contraseñas.
- No se persisten passwords.
- No se persisten tokens.
- No existe fallback `1234`.
- No existe fallback `admin123`.
- No existe `ncv_admin_password`.
- No existe `ncv_admin_pin`.
- Cliente y administrador tienen rutas separadas.
- Admin requiere `users/{uid}.role === "admin"`.
- `window.isAdminAuthenticated` queda únicamente como estado de UI/compatibilidad.
- `ncv_users` ya no autentica contraseñas.
- El PIN fue eliminado.
- La llave de pago sigue siendo configuración visual y todavía no está centralizada.

Documento:

- `CAMBIOS_SEGURIDAD_FASE_2.md`

Commit de cierre recomendado:

```text
feat: secure firebase auth and remove legacy admin credentials
```

---

# 4. Fases restantes

# Fase 3 — Modelo Firestore y Rules

**Prioridad: CRÍTICA**

## 3.1 Inventario real de Firestore

Antes de escribir Rules:

- Auditar todas las llamadas `collection`, `doc`, `getDoc`, `getDocs`, `setDoc`, `addDoc`, `deleteDoc`, `onSnapshot`, `query`, `where`.
- Crear matriz recurso → operación → actor.
- Identificar consultas que podrían romperse al endurecer permisos.
- Definir campos inmutables.
- Definir ownership.

Entregable:

- `MODELO_FIRESTORE_FASE_3.md`

No debe modificar código funcional.

## 3.2 Esquema objetivo mínimo

Mantener, salvo razón técnica documentada, las colecciones actuales:

```text
users/{uid}
appointments/{appointmentId}
settings/{settingId}
reviews/{reviewId}
community_posts/{postId}
```

Mantener `salonId: "nails-con-val"` como campo para preparar evolución futura sin hacer todavía migración multi-tenant.

### users/{uid}

Modelo objetivo:

```js
{
  uid,
  salonId,
  name,
  phone,
  email,
  birthdate,
  role,
  bookedCount,
  createdAt
}
```

Reglas clave:

- Cliente puede leer su perfil.
- Cliente puede modificar solo campos permitidos.
- Cliente nunca puede modificar `role`.
- Cliente nunca puede modificar `uid`.
- Cliente no debe controlar `bookedCount`.
- Admin puede consultar y administrar usuarios según necesidades reales del panel.

### appointments/{id}

Modelo objetivo aproximado:

```js
{
  id,
  userId,
  salonId,
  name,
  phone,
  serviceIds,
  serviceSummary,
  appointmentDateIso,
  dateKey,
  startTime,
  endTime,
  durationMinutes,
  status,
  notes,
  promoCode,
  paidStatus,
  refundEligible,
  isRefunded,
  createdAt,
  updatedAt
}
```

Las Rules deberán diferenciar:

- creación del cliente;
- lectura de sus propias citas;
- cancelación limitada;
- edición administrativa;
- estados que solo puede cambiar admin.

### settings

Clasificar cada documento como:

- `PUBLIC READ / ADMIN WRITE`
- `ADMIN READ / ADMIN WRITE`

Configuraciones candidatas:

- servicios;
- descuentos;
- bloqueos de agenda;
- galería;
- popup;
- horarios;
- llave de pago;
- meta de ingresos;
- fidelidad;
- configuraciones visuales.

### reviews / community_posts

Definir:

- lectura pública o autenticada según UX existente;
- creación con esquema validado;
- ownership;
- moderación admin;
- límites de longitud;
- campos permitidos.

## 3.3 Firestore Rules

Crear:

- `firestore.rules`

Helpers conceptuales:

```text
isSignedIn()
isOwner(uid)
isAdmin()
sameSalon()
validUserCreate()
validUserUpdate()
validAppointmentCreate()
validAppointmentUpdate()
```

Principio:

> El frontend nunca es la frontera de seguridad. Firestore debe rechazar operaciones no autorizadas incluso si alguien manipula JavaScript desde DevTools.

## 3.4 Tests de Rules

Preferencia:

- Firebase Emulator Suite si puede añadirse sin convertir el proyecto en una migración tecnológica.
- Si no es viable en este momento, documentar pruebas manuales reproducibles.

Casos mínimos:

- cliente no puede darse `role: "admin"`;
- cliente no puede cambiar `bookedCount`;
- cliente no puede leer perfil ajeno;
- cliente no puede cambiar status administrativo de una cita;
- admin sí puede operar donde corresponde;
- público no puede leer PII;
- settings privados no son públicos.

## Criterio de cierre Fase 3

- Modelo documentado.
- Rules existentes.
- Rules probadas.
- No hay escalamiento de rol desde cliente.
- Datos personales protegidos.
- Consultas principales siguen funcionando.

Documento de cierre:

- `CAMBIOS_FIRESTORE_FASE_3.md`

Commit:

```text
feat: define firestore model and enforce security rules
```

---

# Fase 4 — Firestore como fuente de verdad

**Prioridad: ALTA**

Objetivo:

Eliminar la dependencia de `localStorage` como autoridad para datos de negocio.

## Datos que deben pasar a autoridad Firestore

- usuarios;
- citas;
- servicios personalizados;
- descuentos;
- bloqueos;
- galería;
- reviews;
- community posts;
- popup;
- configuraciones del negocio;
- llave de pago;
- fidelidad.

## Datos que pueden mantenerse localmente

Solo cache/UI no sensible, por ejemplo:

- sesión visual derivada;
- preferencias de UI;
- datos de conveniencia que puedan regenerarse.

## Trabajo

- Centralizar lecturas Firestore.
- Centralizar escrituras Firestore.
- Evitar patrón “escribo local y luego intento nube”.
- Definir comportamiento offline/error.
- Mantener compatibilidad de lectura legacy durante transición controlada.
- No usar datos locales como autoridad si Firestore está disponible.

## Llave de pago

Mover a configuración central, por ejemplo:

```text
settings/business
```

o estructura equivalente documentada.

Eliminar hardcodes visibles duplicados y renderizar desde una única fuente.

## Recuperación de perfil incompleto

Resolver el riesgo:

```text
Firebase Auth ✅
users/{uid}   ❌
```

Crear estrategia controlada de reparación/upsert sin permitir escalamiento de rol.

## Criterio de cierre

- Firestore es fuente de verdad para datos de negocio.
- `localStorage` queda degradado a cache.
- La llave de pago persiste realmente.
- Los fallos de red tienen comportamiento explícito.
- No se crean divergencias silenciosas.

Documento:

- `CAMBIOS_PERSISTENCIA_FASE_4.md`

Commit:

```text
refactor: make firestore the source of truth
```

---

# Fase 5 — Reserva atómica y anti doble-reserva

**Prioridad: CRÍTICA**

La Fase 1 resolvió disponibilidad lógica en UI. Esta fase garantiza integridad real.

## Modelo recomendado

Usar slots de 30 minutos como locks deterministas.

Ejemplo:

```text
bookingSlots/{YYYY-MM-DD_HH-mm}
```

o equivalente incluyendo `salonId`.

Una cita de:

```text
14:00 → 16:00
```

debe adquirir:

```text
14:00
14:30
15:00
15:30
```

## Operación

Usar transacción Firestore:

1. calcular todos los slots requeridos;
2. comprobar que no existan;
3. crear locks;
4. crear appointment;
5. commit atómico.

Si un slot ya existe:

- cancelar toda la operación;
- informar que el horario acaba de ser ocupado;
- refrescar disponibilidad.

## Cancelación

La cancelación autorizada debe:

- cambiar status;
- liberar los locks correspondientes;
- hacerlo de forma atómica.

## Reprogramación

Si se implementa:

- reservar nuevos locks;
- liberar antiguos;
- actualizar cita;
- una sola transacción o estrategia consistente.

## Buffer opcional

Preparar el modelo para:

```js
bufferMinutes
```

pero no añadirlo si no es requerido aún.

## Criterios

- dos clientas simultáneas no pueden reservar el mismo intervalo;
- una cita larga bloquea todo el tiempo;
- múltiples servicios bloquean suma real;
- cancelar libera horario;
- límite de cierre del salón respetado;
- bloqueos administrativos respetados.

Documento:

- `CAMBIOS_RESERVAS_FASE_5.md`

Commit:

```text
feat: add atomic booking and slot locking
```

---

# Fase 6 — Panel administrativo y operaciones del negocio

**Prioridad: ALTA**

Objetivo:

Hacer que el panel actual gestione datos reales de Firestore de manera segura.

Incluye:

- citas;
- estados;
- cancelaciones;
- walk-ins;
- bloqueos de fechas;
- bloqueos horarios;
- servicios;
- precios;
- promociones;
- galería;
- popup;
- reviews;
- comunidad;
- cumpleaños;
- métricas;
- meta de ingresos;
- llave de pago.

## Reglas

- Toda acción privilegiada debe depender de Firebase Auth + Firestore Rules.
- `window.isAdminAuthenticated` nunca autoriza backend.
- Evitar escritura duplicada en localStorage + Firestore.
- Los formularios deben manejar errores reales de Firestore.
- No permitir campos administrativos desde datos manipulables del cliente.

## Criterio

El panel sigue teniendo la apariencia actual pero todas las operaciones críticas tienen persistencia y permisos consistentes.

Documento:

- `CAMBIOS_ADMIN_FASE_6.md`

Commit:

```text
feat: harden admin operations and business settings
```

---

# Fase 7 — Fidelidad auditable

**Prioridad: MEDIA-ALTA**

Problema actual:

`bookedCount` es un contador visual y no constituye un historial auditable.

## Modelo recomendado

Crear:

```text
loyalty_transactions/{id}
```

Campos:

```js
{
  userId,
  appointmentId,
  salonId,
  type,
  stampsDelta,
  reason,
  createdAt,
  createdBy
}
```

Ejemplos de tipo:

- `appointment_completed`
- `manual_adjustment`
- `reward_redeemed`
- `correction`

## Principios

- Cliente no modifica sus estampas.
- Cita reservada no necesariamente gana estampa.
- La estampa debería otorgarse al completar cita.
- Una cita no debe dar premio dos veces.
- Ajustes manuales solo admin.
- Recompensa debe tener trazabilidad.

`bookedCount` puede mantenerse como campo derivado/cache si simplifica UI, pero no como única fuente de verdad.

## Criterio

- historial trazable;
- no duplicación;
- admin puede auditar;
- cliente solo ve su progreso.

Documento:

- `CAMBIOS_FIDELIDAD_FASE_7.md`

Commit:

```text
feat: add auditable loyalty transactions
```

---

# Fase 8 — Ciclo de vida de cuentas y perfil

**Prioridad: MEDIA**

Incluye:

- recuperación de contraseña;
- mejora de perfil;
- actualización segura de nombre/teléfono/cumpleaños;
- sesión restaurada desde Firebase + Firestore;
- estrategia para usuarios legacy;
- eliminar progresivamente la necesidad de `ncv_users` como directorio teléfono → email.

## Login por teléfono

Decidir formalmente una de estas opciones:

1. dejar login solo por email;
2. Firebase Phone Auth;
3. mecanismo backend seguro de resolución.

No crear una búsqueda pública de `users` por teléfono solo para resolver email.

## Password reset

Usar Firebase Auth oficial:

```text
sendPasswordResetEmail
```

No generar passwords manualmente.

## Criterio

- recuperación de contraseña operativa;
- perfil consistente;
- usuario legacy tiene ruta de migración;
- no se exponen directorios de usuarios.

Documento:

- `CAMBIOS_USUARIOS_FASE_8.md`

Commit:

```text
feat: complete client account lifecycle
```

---

# Fase 9 — Contenido, reviews, comunidad y galería

**Prioridad: MEDIA**

Objetivo:

Cerrar esquema, seguridad y moderación del contenido editable.

Incluye:

- reviews;
- community posts;
- galería;
- popup;
- imágenes remotas;
- sanitización y límites.

## Seguridad

- validar tipos;
- validar longitud;
- limitar campos;
- impedir que cliente elija `userId` ajeno;
- moderación/borrado admin;
- ownership si aplica;
- revisar usos de `innerHTML`;
- continuar usando escape/sanitización.

## Imágenes

No introducir Firebase Storage si no es necesario.

Si las imágenes siguen siendo URLs externas:

- validar esquema HTTPS;
- limitar hosts si es razonable;
- manejar imagen inválida.

Si el producto necesita subida real:

- diseñar Firebase Storage como subfase separada.

Documento:

- `CAMBIOS_CONTENIDO_FASE_9.md`

Commit:

```text
feat: secure community reviews and content management
```

---

# Fase 10 — UX, móvil, accesibilidad y performance

**Prioridad: MEDIA**

Solo después de estabilizar datos y seguridad.

## UX

- flujo de reserva más claro;
- resumen de servicios;
- duración;
- precio;
- fecha/hora;
- mensajes de error;
- estados loading/success/error;
- confirmación clara.

## Mobile

- panel admin usable;
- modal de reserva;
- calendario;
- botones;
- inputs;
- tablas;
- navegación.

## Accesibilidad

- labels;
- foco;
- teclado;
- contraste;
- `aria-*` donde sea necesario;
- mensajes de error asociados.

## Performance

- reducir JS repetido;
- minimizar renders innecesarios;
- revisar imágenes;
- lazy loading;
- evitar listeners duplicados;
- revisar Chart.js solo cuando se necesite;
- conservar compatibilidad del sitio.

Documento:

- `CAMBIOS_UX_PERFORMANCE_FASE_10.md`

Commit:

```text
refactor: improve mobile ux accessibility and performance
```

---

# Fase 11 — Modularización controlada

**Prioridad: MEDIA-BAJA**

El sitio actualmente vive principalmente en `index.html`.

No migrar de framework.

Extraer gradualmente:

```text
assets/js/firebase.js
assets/js/auth.js
assets/js/services.js
assets/js/availability.js
assets/js/booking.js
assets/js/loyalty.js
assets/js/admin.js
assets/js/content.js
assets/js/app.js
```

Solo hacerlo cuando el comportamiento esté estabilizado.

## Reglas

- una extracción a la vez;
- sin reescribir lógica innecesariamente;
- comprobar comportamiento antes/después;
- no mezclar modularización con features grandes.

Documento:

- `CAMBIOS_MODULARIZACION_FASE_11.md`

Commit:

```text
refactor: modularize frontend javascript
```

---

# Fase 12 — QA, seguridad final y despliegue

**Prioridad: ALTA antes de producción**

## QA funcional

Probar:

- landing;
- registro;
- login;
- logout;
- admin;
- cambio contraseña admin;
- perfil;
- reserva simple;
- reserva múltiple;
- cita 2h;
- cita 3h;
- solapamiento;
- doble click;
- concurrencia;
- cancelación;
- bloqueos;
- servicios;
- precios;
- descuentos;
- galería;
- reviews;
- comunidad;
- fidelidad;
- llave de pago.

## QA de permisos

Probar como:

- público;
- cliente A;
- cliente B;
- admin.

Intentos negativos:

- cliente A lee B;
- cliente cambia role;
- cliente cambia bookedCount;
- cliente cambia settings;
- cliente borra cita ajena;
- público lee usuarios;
- cliente crea cita con campos administrativos;
- usuario manipula `salonId`.

## Seguridad web

Revisar:

- Firestore Rules;
- Storage Rules si existe Storage;
- CSP viable;
- XSS/innerHTML;
- URLs externas;
- inputs;
- secretos;
- config Firebase;
- errores;
- logging de PII.

## Deploy

Preferencia de bajo costo:

- Firebase Hosting o hosting estático compatible.

Crear:

- instrucciones de despliegue;
- configuración;
- checklist de producción;
- rollback.

## Criterio final

El proyecto solo puede marcarse `READY FOR PRODUCTION` si:

- Rules están aplicadas;
- no hay bypass conocido;
- booking concurrente está protegido;
- datos críticos no dependen de localStorage;
- pruebas principales pasan;
- no hay credenciales hardcodeadas;
- existe rollback.

Documento:

- `CIERRE_PROYECTO_FASE_12.md`

Commit:

```text
chore: complete production hardening and release checklist
```

---

# Fase 13 — Preparación futura multi-salón

**Estado: DIFERIDA / NO IMPLEMENTAR AHORA**

El código ya puede conservar `salonId`, pero no se debe introducir arquitectura multi-tenant completa durante este MVP.

Posible evolución futura:

```text
salons/{salonId}/users/{uid}
salons/{salonId}/appointments/{id}
salons/{salonId}/services/{id}
salons/{salonId}/settings/{id}
```

Evaluar solo cuando exista un segundo salón real o una decisión comercial firme.

No implementar ahora.

---

# 5. Orden obligatorio

```text
Fase 0  Auditoría / baseline                    ✅
Fase 1  Agenda e intervalos                     ✅
Fase 2  Auth y seguridad frontend               ✅
Fase 3  Firestore model + Rules                 ⬜
Fase 4  Firestore source of truth               ⬜
Fase 5  Booking atómico / anti double-booking   ⬜
Fase 6  Admin y settings reales                 ⬜
Fase 7  Fidelidad auditable                     ⬜
Fase 8  Usuarios / recovery / perfil            ⬜
Fase 9  Reviews / comunidad / galería           ⬜
Fase 10 UX / móvil / performance                ⬜
Fase 11 Modularización                          ⬜
Fase 12 QA / seguridad / deploy                 ⬜
Fase 13 Multi-salón                             DIFERIDA
```

No saltar una dependencia crítica para acelerar una fase visual.

---

# 6. Política de commits

Cada fase debe terminar con:

1. pruebas mínimas;
2. `git diff --check`;
3. revisión de `git status`;
4. archivo MD de documentación;
5. commit exclusivo de esa fase.

Formato recomendado:

```text
feat: ...
fix: ...
refactor: ...
chore: ...
docs: ...
```

No combinar dos fases completas en el mismo commit.

Si una fase requiere varios parches internos, se permiten commits intermedios, pero siempre debe existir un commit final de cierre.

Ejemplo:

```text
feat: secure firestore user rules
feat: secure firestore appointment rules
docs: close firestore security phase
```

o un único commit final cuando el cambio sea suficientemente pequeño.

---

# 7. Plantilla obligatoria de documentación por fase

Cada documento `CAMBIOS_*_FASE_X.md` debe incluir:

```markdown
# Fase X — Nombre

## Objetivo

## Estado inicial

## Archivos modificados

## Funciones modificadas

## Archivos nuevos

## Modelo de datos afectado

## Decisiones técnicas

## Compatibilidad mantenida

## Seguridad

## Pruebas ejecutadas

## Resultado de git diff --check

## Riesgos encontrados

## Deuda técnica

## Cosas deliberadamente no modificadas

## Próxima fase recomendada

## Commit de cierre
```

---

# 8. Reglas de seguridad del proyecto

1. Firebase Auth es la única autoridad de passwords.
2. Nunca almacenar passwords.
3. Nunca almacenar access tokens/refresh tokens manualmente.
4. Nunca usar PIN local como autorización.
5. Nunca usar un flag JS como frontera backend.
6. `role` no puede ser controlado por cliente.
7. `bookedCount` no puede ser controlado por cliente.
8. Firestore Rules deben proteger PII.
9. Una cita no puede confiar solamente en comprobación de frontend.
10. Settings administrativos deben requerir admin en Rules.
11. `localStorage` no puede ser source of truth de negocio.
12. No introducir secretos en Git.
13. Config Firebase pública no debe confundirse con un secreto.
14. No permitir consultas públicas de usuarios por teléfono/email para implementar UX.
15. Evitar ampliar alcance sin documentarlo.

---

# 9. Regla de costos

Priorizar siempre la alternativa de menor costo operativo que preserve seguridad y mantenibilidad.

Orden de preferencia:

1. frontend actual + Firebase;
2. Firestore + Auth + Hosting;
3. funciones/backend solo si existe requisito imposible de resolver correctamente con las capas actuales;
4. no añadir servicios pagos sin necesidad clara.

---

# 10. Definición de terminado

El proyecto estará técnicamente listo para entrega cuando:

- Fases 3 a 12 estén cerradas.
- Cada fase tenga documentación.
- Cada fase tenga commit de cierre.
- Working tree esté limpio.
- Rules estén probadas.
- Booking concurrente esté protegido.
- Auth esté saneado.
- localStorage no sea autoridad de datos críticos.
- fidelidad sea auditable.
- panel admin opere sobre backend protegido.
- QA final esté documentado.
- exista guía de despliegue y rollback.
- Telegram no haya sido implementado.
