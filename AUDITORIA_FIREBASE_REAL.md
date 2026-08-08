# Auditoría de Firestore real — Ramos Nails (`nailsconval`)

Estado: ⛔ **NO EJECUTADA — BLOQUEO EXTERNO**
Fecha del intento: 2026-08-08

---

## Por qué no hay datos en este documento

La auditoría exige leer el Firestore de producción. La CLI de Firebase de esta
máquina no tiene sesión:

```text
$ npx firebase projects:list
Error: Failed to authenticate, have you run firebase login?

$ npx firebase use
Error: Failed to authenticate, have you run firebase login?
```

Tampoco hay ninguna cuenta de servicio disponible
(`GOOGLE_APPLICATION_CREDENTIALS` no está definida).

**No se han inventado conteos.** Este documento queda como el formulario exacto
que rellena la herramienta, con el comando que lo produce, para que los números
sean reales cuando existan credenciales.

`.firebaserc` sigue apuntando a `nailsconval` y no se ha modificado. No se ha
creado ningún proyecto Firebase nuevo.

---

## Cómo generarla (solo lectura, no escribe nada)

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/ruta/fuera/del/repo/serviceAccount.json"
node tools/migrate-firebase-production.mjs --audit --json=auditoria.json
```

El modo `--audit` no ejecuta ninguna escritura: solo hace `get()` sobre las
colecciones y los documentos de `settings`.

---

## 1. Conteos por colección

| Colección | Documentos |
| --- | --- |
| `users` | _(pendiente)_ |
| `appointments` | _(pendiente)_ |
| `bookingSlots` | _(pendiente)_ |
| `loyalty_transactions` | _(pendiente)_ |
| `reviews` | _(pendiente)_ |
| `community_posts` | _(pendiente)_ |

## 2. `salonId`

Valor esperado en todos los documentos: `nails-con-val`.

| Comprobación | Resultado |
| --- | --- |
| `users` sin `salonId` correcto | _(pendiente)_ |
| `appointments` sin `salonId` correcto | _(pendiente)_ |
| `bookingSlots` sin `salonId` correcto | _(pendiente)_ |
| Documentos con un `salonId` **distinto** (conflicto, no se migra) | _(pendiente)_ |

## 3. Citas sin `clientUid`

Sin este campo, las Rules no pueden reconocer a la dueña de la cita y la clienta
deja de poder leer su propia reserva.

| Comprobación | Resultado |
| --- | --- |
| Total de `appointments` sin `clientUid` | _(pendiente)_ |
| De ellas, resolubles de forma inequívoca | _(pendiente)_ |
| De ellas, ambiguas (dos usuarias con el mismo teléfono) | _(pendiente)_ |
| De ellas, sin ninguna usuaria coincidente | _(pendiente)_ |

## 4. Citas futuras activas sin locks

Una cita futura sin sus locks en `bookingSlots` deja el turno aparentemente
libre y se puede sobrevender.

| Comprobación | Resultado |
| --- | --- |
| Citas activas (`confirmada` / `pendiente`) con fecha futura | _(pendiente)_ |
| De ellas, con locks incompletos o ausentes | _(pendiente)_ |
| Total de locks que faltan por crear | _(pendiente)_ |
| Citas con fecha u hora ilegible (no migrables) | _(pendiente)_ |

## 5. Locks anómalos

Se reportan; **no se borran** en esta fase.

| Comprobación | Resultado |
| --- | --- |
| Locks huérfanos (su `appointmentId` no existe) | _(pendiente)_ |
| Locks obsoletos (su cita está cancelada o completada) | _(pendiente)_ |

## 6. Usuarios legacy

`users/{telefono}` es la ruta legacy documentada en
`MODELO_FIRESTORE_FASE_3.md`. El id del documento no es un uid de Auth, así que
las Rules nunca podrán reconocer a esa persona como dueña de nada.

| Comprobación | Resultado |
| --- | --- |
| Documentos de `users` con `id != uid` (o sin `uid`) | _(pendiente)_ |
| Reparto por `role` (`client` / `admin` / sin role) | _(pendiente)_ |
| Cuentas con `role: 'admin'` | _(pendiente)_ |

## 7. `settings`

| Documento | Existe | Claves |
| --- | --- | --- |
| `custom_services` | _(pendiente)_ | |
| `discount_settings` | _(pendiente)_ | |
| `schedule_blocks` | _(pendiente)_ | |
| `gallery_items` | _(pendiente)_ | |
| `marketing_popup` | _(pendiente)_ | |
| `payment_key` | _(pendiente)_ | |
| `income_goal` | _(pendiente)_ | |

Los seis primeros son de lectura pública según `firestore.rules`;
`income_goal` es solo de admin. Si `payment_key` no existe o no contiene la
llave de pago real, la UI de pago no funcionará tras el despliegue de Rules.

## 8. Conflictos

| Tipo | Ocurrencias |
| --- | --- |
| `DOS_CITAS_MISMO_TURNO` (futuro) | _(pendiente)_ |
| `DOS_CITAS_MISMO_TURNO` (histórico) | _(pendiente)_ |
| `LOCK_DE_OTRA_CITA` | _(pendiente)_ |
| `SALON_ID_DISTINTO` | _(pendiente)_ |

Los conflictos **no los resuelve el migrador**. Cada uno implica decidir qué
clienta conserva su hora, y eso es una decisión del salón.

---

## 9. Desbloqueo

```bash
npx firebase login
```

Y, en la consola de Google Cloud del proyecto `nailsconval`, crear una cuenta de
servicio con rol *Cloud Datastore User*, descargar el JSON **fuera del
repositorio** y exportar `GOOGLE_APPLICATION_CREDENTIALS`.
