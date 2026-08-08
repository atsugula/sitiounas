# Fase 6 — Endurecer el panel de administración

## Objetivo

Dejar el panel conectado al modelo protegido, con una regla clara:

```text
Frontend admin  = experiencia de usuario
Firestore Rules = autorización real
```

`window.isAdminAuthenticated` no es un permiso. Es un interruptor de UI. Que
alguien lo ponga en `true` desde la consola del navegador no debe darle nada.

## Estado inicial

Tras las Fases 4 y 5, la mayoría de las operaciones del panel ya escribían en
la nube primero. Esta fase audita el resto y cierra lo que quedaba.

## Auditoría de las operaciones del panel

| Operación | Estado | Dónde se resolvió |
| --- | --- | --- |
| Citas (lectura) | Suscripción admin a la colección completa | Fase 5 |
| Estados de cita | Escritura confirmada; cancelar libera locks | Fase 5 |
| Walk-ins | Transacción con locks, modelo alineado a Fase 1 | Fase 5 |
| Bloqueos de día y turno | Nube primero, error visible | Fase 4 |
| Servicios y precios | Nube primero, error visible | Fase 4 |
| Descuentos y banner | Nube primero, error visible | Fase 4 |
| Galería | Nube primero, error visible | Fase 4 |
| Pop-up de marketing | Nube primero, error visible | Fase 4 |
| Meta de ingresos | `settings/income_goal`, privado | Fase 4 |
| Llave de pago | `settings/payment_key` | Fase 4 |
| **Abono devuelto / retenido** | **Corregido en esta fase** | Fase 6 |
| **Alertas de cancelación** | **Clave muerta eliminada** | Fase 6 |
| **Cumpleaños** | **Se retira el respaldo a `ncv_users`** | Fase 6 |
| **Cierre de sesión admin** | **Corregido en esta fase** | Fase 6 |
| Métricas y CSV | Derivadas de `allAppointmentsList` | — |
| Reseñas y comunidad | Pendiente | Fase 9 |
| Contraseña admin | Firebase Auth con reautenticación | Fase 2 |

## Archivos modificados

- `index.html`

## Archivos nuevos

- `CAMBIOS_ADMIN_FASE_6.md`

## Funciones modificadas

| Función | Cambio |
| --- | --- |
| `toggleAbonoRefund` | Pasa a `async`. Escribe en Firestore y **espera confirmación** antes de tocar la UI. Si falla, avisa y no muta nada. |
| `requestClientCancellation` | Deja de escribir `ncv_cancellation_alerts`. |
| `changeBookingStatus` | Ídem. |
| `renderAdminBirthdays` | Deja de caer a `ncv_users`. Usa solo `window.allUsersList`. |
| `logoutAdmin` | Cierra explícitamente los tres listeners con PII y restaura la sesión anónima. |
| Bloque de inicialización de Firebase | `signInAnonymously` se expone en `window.firebaseAuthUtils`. |

## Hallazgo: `ncv_cancellation_alerts` era dato muerto

La clave se escribía en dos sitios (cancelación de clienta y cancelación desde
el panel) pero **no la leía nadie**: `renderAdminCancellationAlerts()` deriva
las alertas de las citas con `status === 'cancelada'`.

Era, además, una copia paralela de datos de cancelación guardada en el
navegador **de la clienta**, donde el admin nunca la iba a ver. No se migró a
Firestore: se eliminó, porque la información ya existe en `appointments`.

Con esto la clave desaparece del proyecto.

## Hallazgo: cerrar sesión de admin dejaba el sitio mudo

`logoutAdmin` hacía `signOut()` y no volvía a abrir sesión. Como la web pública
funciona sobre una sesión anónima de Firebase, tras cerrar el panel el sitio se
quedaba sin sesión: la disponibilidad dejaba de actualizarse hasta recargar.

Ahora, después del `signOut`, se vuelve a `signInAnonymously()`.

Además, los listeners de `users`, `income_goal` y `appointments` se cierran de
forma explícita en `logoutAdmin`, sin esperar al callback de
`onAuthStateChanged`. La única garantía de que deja de fluir la base de
clientas no debería ser un callback asíncrono.

## Modelo de datos afectado

Ninguno nuevo. Una clave de `localStorage` menos (`ncv_cancellation_alerts`).

## Decisiones técnicas

1. **`window.isAdminAuthenticated` se queda como está, y está bien.** Sus 25
   usos son todos de UI: mostrar o esconder controles y decidir si vale la pena
   repintar una tabla. Ninguno concede acceso a datos. El acceso lo conceden
   las Rules.
2. **El dinero espera confirmación.** Marcar un abono como devuelto es una
   decisión económica; que la UI la dé por hecha antes de que la base la acepte
   es peor que un error visible.
3. **Ningún respaldo local para datos personales.** Si la lista de clientas no
   llegó desde Firestore, el panel muestra vacío. Es preferible a pintar una
   copia vieja que además es manipulable.
4. **Eliminar antes que migrar.** `ncv_cancellation_alerts` no necesitaba una
   colección nueva: necesitaba desaparecer.

## Compatibilidad mantenida

- Fases 1, 2, 4 y 5 intactas.
- Ni un cambio visual.
- Sin framework ni backend propio.

## Seguridad

| Antes | Ahora |
| --- | --- |
| Cerrar el panel dejaba abiertos los listeners con PII hasta que respondiera un callback. | Se cierran de forma explícita e inmediata. |
| Cerrar el panel dejaba el sitio público sin sesión. | Se restaura la sesión anónima. |
| Los cumpleaños podían pintarse desde `ncv_users`, editable desde la consola. | Solo desde la suscripción admin a Firestore. |
| Marcar un abono como devuelto mutaba la UI aunque la nube fallara. | Solo tras confirmación. |
| Datos de cancelación duplicados en el navegador de la clienta. | Eliminados. |

## Pruebas ejecutadas

Sobre `http://localhost:5173`, en navegador real.

| # | Prueba | Resultado |
| --- | --- | --- |
| 1 | Los 5 bloques `<script>` inline compilan (`npm run check`) | 5/5 OK |
| 2 | `isAdminAuthenticated` arranca en `false` | OK |
| 3 | Sin sesión admin no hay lista de usuarias cargada | `allUsersList` vacía |
| 4 | Sin sesión admin no hay lista de citas cargada | `allAppointmentsList` vacía |
| 5 | `saveAppointmentAdminFields` falla explícitamente sin Firestore | lanza `FIRESTORE_UNAVAILABLE` |
| 6 | `toggleAbonoRefund` **no** muta el estado si la nube falla | `isRefunded` sigue en `false` |
| 7 | `ncv_cancellation_alerts` ya no se escribe | clave ausente en `localStorage` |
| 8 | Encender `isAdminAuthenticated` a mano no concede rol real | `checkFirebaseAdminRole()` sigue devolviendo `false` |
| 9 | `git diff --check` | Sin avisos |

### No ejecutado — BLOQUEO EXTERNO

- Los 40 tests de `firestore.rules` (el emulador requiere Java).
- No se probó un ciclo real de login admin contra Firebase: en este entorno el
  proveedor de autenticación responde HTTP 400. **No se ha visto un inicio de
  sesión administrativo funcionando de extremo a extremo.**

## Resultado de git diff --check

Sin avisos.

## Riesgos encontrados

- **`handleUserLogout` no cierra la sesión de Firebase Auth.** Limpia la sesión
  local pero la clienta sigue autenticada, así que sus suscripciones siguen
  vivas. Es un fallo real y se corrige en la Fase 8, que es la fase del ciclo
  de vida de cuentas.
- **El panel sigue sin paginar.** `subscribeAdminAppointments` trae la
  colección entera. Con pocos cientos de citas da igual; a varios miles, no.
- **Las lecturas admin caen a `ncv_appointments`** cuando la nube aún no
  respondió. Es cache de solo lectura, no autoridad, pero puede mostrar datos
  viejos un instante.
- **Reseñas y comunidad siguen escribiendo con el error tragado** (Fase 9).

## Deuda técnica

- Paginar o filtrar por rango de fechas la suscripción admin de citas.
- Retirar `ncv_appointments` también como cache de lectura del panel.
- Unificar las lecturas sueltas de `localStorage` en `readCache` (Fase 11).

## Cosas deliberadamente no modificadas

- El diseño y la disposición del panel.
- Reseñas y comunidad (Fase 9).
- La fidelidad, que sigue congelada a la espera de la Fase 7.
- El flujo de autenticación admin de la Fase 2.
- **Bot de Telegram: NO IMPLEMENTADO — fuera de alcance.**

## Próxima fase

Fase 7 — Fidelidad auditable: `loyalty_transactions`, la estampa derivada de
una cita completada, sin duplicados, con ajuste manual solo de admin y
`bookedCount` como cache derivado.

## Commit de cierre

```text
feat: harden admin operations and business settings
```
