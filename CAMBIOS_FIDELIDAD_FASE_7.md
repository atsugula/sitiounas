# Fase 7 — Fidelidad auditable

## Objetivo

Que las estampas del club de fidelidad tengan historial y no se puedan
falsificar.

Hasta la Fase 4, el navegador incrementaba `bookedCount` por su cuenta cada vez
que se pulsaba "reservar": la clienta se acreditaba sola su propia fidelidad, y
bastaba con editar `localStorage` para regalarse el premio. La Fase 4 quitó ese
incremento, dejando la tarjeta congelada. Esta fase la vuelve a poner en
marcha, pero bien.

## Estado inicial

- `bookedCount` en `users/{uid}`, inmutable para la clienta desde la Fase 3.
- Sin historial: no había forma de saber por qué alguien tenía 7 estampas.
- La tarjeta llevaba congelada desde la Fase 4 (regresión temporal declarada).
- `loyalty_transactions` ya existía en `firestore.rules` con escritura
  exclusiva de admin, pero ninguna función la usaba.

## Archivos modificados

- `index.html`
- `package.json`

## Archivos nuevos

- `assets/js/loyalty.js` — reglas puras de fidelidad.
- `tests/loyalty.test.mjs` — 24 tests.
- `CAMBIOS_FIDELIDAD_FASE_7.md`

## Modelo de datos afectado

### `loyalty_transactions/{id}`

```js
{
  userId,          // users/{uid} de la clienta
  appointmentId,   // null en ajustes manuales
  salonId,
  type,            // 'earn' | 'redeem' | 'adjust'
  stampsDelta,     // +1 al completar, -10 al canjear, ±n en ajuste
  reason,
  createdAt,
  createdBy        // uid del admin que lo provocó
}
```

**El id es determinista**: `earn_{appointmentId}`, `redeem_{appointmentId}`,
`adjust_{userId}_{timestamp}`. Es lo que impide duplicar la recompensa: si el
admin marca la misma cita como completada tres veces, las tres escrituras
apuntan al mismo documento y la transacción detecta que ya existe.

### `users/{uid}.bookedCount`

Pasa a ser **cache derivada**. Sirve para pintar la tarjeta sin leer el
historial entero, pero la autoridad es la suma de `loyalty_transactions`. Se
actualiza dentro de la misma transacción que crea la transacción de fidelidad,
así que no puede quedar descuadrada por una escritura a medias.

### `appointments/{id}.loyaltyRedeemed`

Marca que la cita se agendó usando el cupón. La escribe la clienta al crear su
propia cita —que es lo único que puede escribir—, pero **no descuenta nada**:
el descuento de 10 estampas lo registra el admin al completar la cita.

## Funciones nuevas

### `assets/js/loyalty.js` — lógica pura

| Función | Qué hace |
| --- | --- |
| `buildLoyaltyTxId(type, referenceId)` | Id determinista. La defensa contra duplicados. |
| `computeStampsFromTransactions(txs)` | Saldo = suma del historial, nunca negativo. |
| `isRewardUnlocked(stamps)` | ¿Llegó a 10? |
| `resolveLoyaltyGrant({appointment, existingTxIds, createdBy})` | Qué transacciones faltan por crear para una cita completada. |
| `buildManualAdjustment({...})` | Valida y construye un ajuste de admin. |
| `applyDeltasToCachedCount(current, txs)` | Nuevo valor de `bookedCount`. |

### `index.html`

| Función | Qué hace |
| --- | --- |
| `grantLoyaltyForCompletedAppointment(appointment)` | Transacción: lee las transacciones candidatas y el perfil, crea las que faltan y actualiza la cache. |
| `window.adminAdjustClientLoyalty(userId, delta, reason)` | Ajuste manual con verificación de rol, validación y rastro. |
| `window.promptAdminLoyaltyAdjustment(userId, name)` | Diálogo del panel. |
| `getLoyaltyAdjustErrorMessage(error)` | Mensajes de error legibles. |

## Funciones modificadas

- `changeBookingStatus` — al marcar `completada`, concede la estampa.
- `redeemFreeCoupon` — marca la cita en vez de tocar el saldo.
- `prepareWhatsAppBooking` — la cita lleva `loyaltyRedeemed`.
- `confirmWhatsAppBooking` — consume la marca del cupón tras reservar.
- `updateLoyaltyCardUI` — usa `REWARD_THRESHOLD` del módulo.
- `renderAdminBirthdays` — la tabla muestra el saldo y el botón de ajuste
  cuando la clienta tiene perfil real (`uid`).

## Decisiones técnicas

1. **La estampa se deriva de una cita completada, no de una reservada.** Quien
   reserva y no aparece no acumula fidelidad. Es también la única forma de que
   el evento lo dispare el admin, que es quien puede escribir.
2. **Id determinista antes que comprobación.** Podría comprobarse "¿ya di la
   estampa?" con una consulta, pero eso es una carrera. Con el id determinista,
   la unicidad la garantiza Firestore.
3. **El canje se registra al completar, no al agendar.** Si se descontara al
   agendar, una cita cancelada dejaría a la clienta sin premio y sin servicio.
   Además la clienta no puede escribir en `loyalty_transactions`, así que el
   registro tiene que hacerlo el admin de todos modos.
4. **Un ajuste manual exige motivo.** Sin motivo no hay auditoría, solo un
   número que cambió. La validación es dura a propósito: entero, distinto de
   cero, como máximo 10, con motivo y con autor.
5. **`bookedCount` se actualiza en la misma transacción.** Si estuviera fuera,
   un fallo de red dejaría el historial y la cache diciendo cosas distintas.
6. **La cache nunca crea usuarios.** Si `users/{uid}` no existe, se registra la
   transacción pero no se inventa un perfil.
7. **El saldo nunca es negativo.** Un ajuste desmedido no puede dejar la
   tarjeta en números rojos.

## Compatibilidad mantenida

- El diseño y el texto de la tarjeta de fidelidad no cambian.
- El umbral sigue siendo 10 citas y el premio sigue siendo el configurado en
  `settings/discount_settings`.
- `bookedCount` conserva su nombre y su significado visible.
- Fases 1 a 6 intactas.

## Seguridad

| Antes | Ahora |
| --- | --- |
| El navegador incrementaba `bookedCount`. | Solo el admin escribe fidelidad, y las Rules lo imponen. |
| Editar `localStorage` regalaba el premio. | El saldo vive en Firestore y se deriva de un historial. |
| Sin rastro de por qué alguien tenía N estampas. | Cada movimiento tiene tipo, motivo, autor y fecha. |
| Marcar una cita completada dos veces daba dos estampas. | Id determinista: como mucho una. |
| El canje no dejaba constancia. | Transacción `redeem` de -10 ligada a la cita. |
| Un ajuste manual no existía; se editaba el número a mano. | Existe, exige motivo y queda registrado. |

## Pruebas ejecutadas

### Unitarias — ejecutadas

```bash
npm test
# tests 51 | pass 51 | fail 0
```

De ellas, 24 son de fidelidad:

| Grupo | Cubre |
| --- | --- |
| Saldo | Suma del historial; el canje resta; nunca negativo; ignora deltas corruptos; umbral en 10 |
| Estampa derivada | Una cita completada concede una; **marcarla dos veces no duplica**; una cita no completada no concede; una cita sin dueño no concede; id determinista |
| Canje | Genera `earn` y `redeem`; tampoco se duplica; un canje a medias se completa sin repetir; **ciclo completo de 10 citas + canje deja saldo coherente** |
| Ajuste manual | Ajuste válido; negativos permitidos; exige motivo; exige autor; rechaza cero, decimal y desmedido; rechaza usuario ausente |
| Cache | Aplica deltas; nunca negativa; tolera cache ausente o corrupta; **coincide con el historial recalculado** |

### En navegador — ejecutadas sobre `http://localhost:5173`

| # | Prueba | Resultado |
| --- | --- | --- |
| 1 | Los 5 bloques `<script>` inline compilan | 5/5 OK |
| 2 | `window.loyaltyUtils` cargado, umbral 10 | OK |
| 3 | Primera vez que se completa una cita: 1 transacción | OK |
| 4 | Segunda vez sobre la misma cita: 0 transacciones | OK |
| 5 | `adminAdjustClientLoyalty` sin sesión admin | Devuelve `false`, no escribe |
| 6 | La tarjeta usa el umbral del módulo | `"4 / 10 citas"` |
| 7 | Una cita con cupón produce `earn:+1` y `redeem:-10` | OK |
| 8 | `git diff --check` | Sin avisos |

### No ejecutado — BLOQUEO EXTERNO

- Los 40 tests de `firestore.rules` (el emulador requiere Java).
- **No se ha visto una transacción de fidelidad ejecutarse contra Firestore
  real.** En este entorno la autenticación responde HTTP 400. La lógica está
  probada; el viaje de ida y vuelta, no.

## Resultado de git diff --check

Sin avisos.

## Riesgos encontrados

- **La fidelidad histórica se pierde.** Los `bookedCount` que existan hoy
  provienen del incremento del navegador y no tienen historial detrás. Quedan
  como están: ni se borran ni se validan. Para regularizarlos, el admin puede
  usar el ajuste manual, que sí deja rastro.
- **La cache y el historial pueden divergir** si alguien edita `bookedCount` a
  mano desde la consola de Firebase. La autoridad sigue siendo el historial;
  conviene una función de recálculo, que hoy no existe.
- **El cupón se marca en el navegador.** `window.pendingLoyaltyRedeem` es una
  variable de UI: alguien podría marcarla y agendar una cita con
  `loyaltyRedeemed: true` sin tener 10 estampas. El daño está acotado —el
  descuento lo aplica el salón a mano y el `redeem` de -10 dejaría el saldo en
  cero—, pero **la validación de "tiene derecho al premio" todavía no ocurre
  del lado servidor**. Sería trabajo de una Cloud Function y queda fuera del
  alcance acordado (sin backend propio).
- **El ajuste manual usa `prompt()`.** Funciona, pero es tosco; la Fase 10
  puede darle un formulario.
- **La tabla de cumpleaños solo ofrece ajuste a clientas con `uid`.** Las
  walk-in sin perfil no tienen dónde acumular fidelidad.

## Deuda técnica

- Función de recálculo de `bookedCount` desde el historial.
- Vista de historial de fidelidad por clienta en el panel.
- Validación servidor del derecho al premio (requiere Cloud Functions).
- Sustituir `prompt()` por un formulario (Fase 10).

## Cosas deliberadamente no modificadas

- El diseño de la tarjeta de fidelidad.
- El umbral de 10 citas y el texto del premio.
- Los `bookedCount` heredados.
- No se añadió backend propio ni Cloud Functions.
- **Bot de Telegram: NO IMPLEMENTADO — fuera de alcance.**

## Próxima fase

Fase 8 — Ciclo de vida de cuentas: recuperación de contraseña con Firebase
Auth, edición segura de perfil, restauración de sesión, y retirada del puente
local `teléfono -> email` junto con `ncv_users`. Incluye el fallo detectado en
la Fase 6: `handleUserLogout` no cierra la sesión de Firebase Auth.

## Commit de cierre

```text
feat: add auditable loyalty transactions
```
