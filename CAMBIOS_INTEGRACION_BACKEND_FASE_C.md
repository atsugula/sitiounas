# Fase C — E2E contra Firebase real

Estado: ⛔ **NO EJECUTADA — BLOQUEO EXTERNO**
Fecha del intento: 2026-08-08

---

## Por qué no se ha ejecutado

El E2E de esta fase exige tres cosas que no están disponibles en esta máquina:

1. **Consola de Firebase** del proyecto `nailsconval`, para comprobar los
   proveedores de Auth y los dominios autorizados (paso 6 del plan).
2. **Cuentas reales** de clienta y de admin en Auth, con su `users/{uid}` y
   `role: 'admin'` (paso 10). Crear cuentas y manejar contraseñas es
   responsabilidad del usuario, no del agente.
3. **Migración aplicada** (Fase B), que sigue bloqueada.

Además, la prueba de concurrencia ("dos navegadores, mismo turno, solo uno
gana") requiere dos sesiones autenticadas simultáneas contra el proyecto real.

**No se ha inventado ningún resultado.** Lo que sigue es el protocolo exacto,
con el criterio de aprobación de cada prueba.

---

## Estado real de la conexión con el proyecto

Un matiz importante: **el frontend ya está conectado al proyecto real**. La
configuración web vive en `assets/js/firebase.js` y apunta a
`projectId: "nailsconval"`. No hace falta ningún cambio de código para
"conectar" el sitio; la conexión ya existe desde las Fases 3–11.

Lo que falta es exclusivamente credenciales de operación (CLI, cuenta de
servicio, Consola) y el despliegue de Rules e índices.

La clave `apiKey` de esa configuración es pública por diseño en Firebase Web:
no es un secreto y no se ha movido a variables de entorno. Lo que protege los
datos son las Rules, no esa clave.

---

## Lo que sí está verificado sin backend real

| Pieza | Cómo se verifica | Estado |
| --- | --- | --- |
| Aritmética de locks (2 h → 4 turnos, 3 h → 6 turnos) | `tests/booking-slots.test.mjs` | ✅ verde |
| Disponibilidad calculada desde locks | `tests/availability.test.mjs` | ✅ verde |
| Fidelidad auditable | `tests/loyalty.test.mjs` | ✅ verde |
| Saneado de entrada | `tests/sanitize.test.mjs` | ✅ verde |
| Parseo horario 12 h / 24 h | `tests/time.test.mjs` | ✅ verde |
| Plan de migración | `tests/migrate-plan.test.mjs` | ✅ verde |
| Scripts inline de `index.html` | `npm run check` | ✅ 0 errores |
| Rules | `npm run test:rules` | ⛔ bloqueado (sin JDK) |

Total: **162 tests, 0 fallos**.

Esto cubre la lógica, no la integración. La carrera entre dos navegadores solo
la puede demostrar Firestore real.

---

## Protocolo E2E a ejecutar

Prerrequisitos: `npx firebase login`, Rules desplegadas, índices construidos,
migración aplicada y verificada idempotente.

### 6. Auth remoto (Consola)

- [ ] Email/Password habilitado.
- [ ] Anonymous habilitado — el sitio público usa `signInAnonymously()` y sin él
      la disponibilidad y el muro dejan de cargar.
- [ ] Authorized Domains incluye `nailsconval.web.app`, `nailsconval.firebaseapp.com`
      y cualquier dominio propio.

### Cliente

| # | Prueba | Criterio de aprobación | Resultado |
| --- | --- | --- | --- |
| C1 | Registro | Se crea `users/{uid}` con `role: 'client'`, `bookedCount: 0`, `salonId: nails-con-val` | _(pendiente)_ |
| C2 | Login | Entra y ve solo sus citas | _(pendiente)_ |
| C3 | Logout | Se limpian las suscripciones; no queda sesión admin residual | _(pendiente)_ |
| C4 | Reset de contraseña | Llega el email de Firebase | _(pendiente)_ |
| C5 | Editar perfil | Cambia nombre/teléfono; `role` y `bookedCount` **no** cambian | _(pendiente)_ |

### Booking

| # | Prueba | Criterio de aprobación | Resultado |
| --- | --- | --- | --- |
| B1 | Disponibilidad | Los turnos ocupados salen del calendario leyendo `bookingSlots` | _(pendiente)_ |
| B2 | Cita de 2 h | Crea la cita + exactamente 4 locks | _(pendiente)_ |
| B3 | Cita de 3 h | Crea la cita + exactamente 6 locks | _(pendiente)_ |
| B4 | Multiservicio | La duración suma y los locks cuadran con la suma | _(pendiente)_ |
| B5 | Locks | Los ids son `nails-con-val_AAAA-MM-DD_HH:MM` | _(pendiente)_ |
| B6 | **Dos navegadores, mismo turno** | Uno confirma; el otro recibe `SLOT_TAKEN` y **no** queda cita fantasma ni lock parcial | _(pendiente)_ |
| B7 | Cancelación | La cita queda `cancelada` y **todos** sus locks desaparecen | _(pendiente)_ |

B6 es la prueba central de la Fase 5. Se ejecuta con dos navegadores distintos
(o uno normal + uno en incógnito), ambos con sesión, confirmando el mismo turno
con pocos segundos de diferencia.

### Admin

| # | Prueba | Criterio de aprobación | Resultado |
| --- | --- | --- | --- |
| A1 | Login admin | Entra con la cuenta cuyo `users/{uid}.role == 'admin'` | _(pendiente)_ |
| A2 | Listado de citas | Ve todas las del salón | _(pendiente)_ |
| A3 | Cambio de estado | Permitido; no toca campos inmutables | _(pendiente)_ |
| A4 | Completar cita | Dispara la fidelidad | _(pendiente)_ |
| A5 | Fidelidad | Se escribe `loyalty_transactions` con el `userId` correcto | _(pendiente)_ |
| A6 | Settings | Guarda servicios, descuentos, bloqueos, galería y popup | _(pendiente)_ |
| A7 | Moderación | Edita/borra reviews y posts | _(pendiente)_ |
| A8 | Reload | Tras recargar sigue siendo admin (se revalida contra Firestore) | _(pendiente)_ |
| A9 | Logout | Pierde el panel de inmediato | _(pendiente)_ |

**Nunca** se guarda una contraseña en Firestore. La cuenta admin es una cuenta
de Firebase Auth normal; lo único que la distingue es `role: 'admin'` en su
documento de `users`, que el cliente no puede escribir (`immutableUserFields`).

---

## Desbloqueo

```bash
winget install EclipseAdoptium.Temurin.21.JDK
npx firebase login
```

Y acceso a la Consola de Firebase del proyecto `nailsconval`.
