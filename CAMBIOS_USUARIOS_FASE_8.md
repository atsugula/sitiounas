# Fase 8 — Ciclo de vida de cuentas de clienta

## Objetivo

Cerrar el ciclo de vida de una cuenta: recuperar la contraseña, editar el
perfil sin poder tocar lo que no le corresponde, restaurar la sesión de forma
verificada, cerrar sesión de verdad, y retirar el puente local
`teléfono -> email` junto con el directorio `ncv_users`.

## Estado inicial

- Fase 2 dejó Firebase Auth como autoridad de contraseñas, pero **no existía
  forma de recuperar una contraseña olvidada**.
- No se podían editar los datos del perfil desde ningún sitio.
- `handleUserLogout` limpiaba la sesión local pero **no cerraba la sesión de
  Firebase Auth** (detectado en la Fase 6).
- El login por teléfono resolvía el correo consultando `ncv_users`, una copia
  local de la base de clientas.

## Archivos modificados

- `index.html`

## Archivos nuevos

- `CAMBIOS_USUARIOS_FASE_8.md`

## Funciones modificadas

### Nuevas

| Función | Qué hace |
| --- | --- |
| `window.handleClientPasswordReset()` | Envía el correo oficial de restablecimiento de Firebase Auth. |
| `window.handleClientProfileUpdate(event)` | Guarda nombre, teléfono y cumpleaños. Nada más. |
| `fillClientProfileEditForm()` | Rellena el formulario de edición desde la sesión. |
| `purgeLegacyClientDirectory()` | Borra `ncv_users` del navegador al arrancar. |

### Reescritas

| Función | Cambio |
| --- | --- |
| `handleUserLogout` | Pasa a `async`. Cierra sesión en Firebase Auth, corta las suscripciones y recupera la sesión anónima. |
| `resolveClientLoginEmail` | Solo acepta correo. Normaliza antes de validar. |
| `handleUserRegister` | Deja de escribir `ncv_users`; usa `persistCurrentClientSession`. |
| `handleUserLogin` | Mensajes acordes al acceso por correo. |
| `openUserProfileModal` | Rellena el formulario de edición. |

### Eliminada

- `upsertSafeLegacyClientRecord()` — mantenía el directorio local de clientas.

## Cambios de interfaz

- Enlace **"¿Olvidaste tu contraseña?"** en el formulario de acceso.
- Botón **"Cambiar mi contraseña"** en el perfil.
- Bloque plegable **"Editar mis datos"** en el perfil, con nombre, WhatsApp y
  cumpleaños.
- El campo de acceso pasa de "WhatsApp o Correo" a "Correo Electrónico", y de
  `type="text"` a `type="email"`.

Son añadidos dentro de los modales existentes, con las clases del sitio
(`ncv-input`, `ncv-btn-primary`). No se rediseñó nada.

## Modelo de datos afectado

Ninguna colección nueva. La edición de perfil escribe únicamente
`{ name, phone, birthdate }` sobre `users/{uid}` con `merge`, lo que encaja con
la regla de la Fase 3: `uid`, `salonId`, `role`, `bookedCount` y `createdAt`
son inmutables para la clienta.

Una clave de `localStorage` menos: **`ncv_users` desaparece**, y además se
borra activamente la que existiera de antes.

## Decisiones técnicas

1. **La recuperación es la de Firebase, no una propia.** No se genera ninguna
   contraseña, no se guarda ningún token, no se manda ningún correo desde el
   frontend. Se llama a `sendPasswordResetEmail` y Firebase se encarga.
2. **La respuesta no revela si el correo existe.** `auth/user-not-found` se
   trata como éxito y el mensaje es siempre el mismo. Si dijera "ese correo no
   está registrado", el formulario se convertiría en un comprobador de qué
   clientas tiene el salón.
3. **Se retira el login por teléfono, y no se sustituye por una consulta.**
   Hacerlo "bien" en Firestore exigiría una consulta pública sobre `users` por
   teléfono, es decir, publicar el directorio de clientas. Firebase Auth se
   identifica por correo; se pide el correo. Es menos cómodo y bastante más
   seguro. Quien no lo recuerde tiene el enlace de recuperación.
4. **`ncv_users` no se migra: se borra.** Guardaba nombre, teléfono, correo y
   cumpleaños de cada clienta que hubiera entrado en ese equipo. En un
   ordenador compartido eso es una filtración esperando a ocurrir. Todo lo que
   contenía ya vive en `users/{uid}`.
5. **La edición no envía los campos prohibidos.** No se mandan y se ignoran:
   directamente no se incluyen en la escritura. Las Rules son la garantía; el
   frontend no debería ni intentarlo.
6. **El correo no se edita desde el perfil.** Es el identificador de acceso en
   Firebase Auth; cambiarlo exige reautenticación y es otro flujo. Se dice
   explícitamente en el formulario.
7. **Cerrar sesión devuelve la sesión anónima.** Igual que en la Fase 6 con el
   admin: sin sesión, la web pública se queda sin disponibilidad.

## Compatibilidad mantenida

- Fases 1 a 7 intactas.
- El diseño y la paleta no cambian; los añadidos usan las clases existentes.
- `ncv_current_user` sigue funcionando igual como cache de UI.
- Sin framework, sin bundler, sin backend propio.

## Cambio funcional visible

**Ya no se puede iniciar sesión con el número de WhatsApp.** Es una pérdida de
comodidad deliberada, explicada arriba. El mensaje de error lo dice y remite al
enlace de recuperación.

## Seguridad

| Antes | Ahora |
| --- | --- |
| Sin forma de recuperar la contraseña. | Flujo oficial de Firebase Auth. |
| — | La recuperación no revela si un correo tiene cuenta. |
| "Cerrar sesión" no cerraba la sesión de Firebase: el token seguía vivo. | Se cierra de verdad y se recupera la sesión anónima. |
| El login por teléfono dependía de un directorio local de clientas. | Solo correo; ningún directorio. |
| `ncv_users` guardaba PII de varias clientas en el navegador. | Se borra al arrancar. |
| El perfil no se podía editar. | Se edita, y solo los campos de contacto. |

## Pruebas ejecutadas

Sobre `http://localhost:5173`, en navegador real.

| # | Prueba | Resultado |
| --- | --- | --- |
| 1 | Los 5 bloques `<script>` inline compilan (`npm run check`) | 5/5 OK |
| 2 | Los tests unitarios siguen en verde (`npm test`) | 51/51 |
| 3 | `purgeLegacyClientDirectory()` borra un `ncv_users` sembrado | clave eliminada |
| 4 | El puente teléfono → email ya no resuelve | `resolveClientLoginEmail('3192395653')` → `null` |
| 5 | El correo se normaliza antes de validar | `'  Cliente@Gmail.COM '` → `'cliente@gmail.com'` |
| 6 | Entradas basura se rechazan | `''`, `null`, `'no-es-correo'` → `null` |
| 7 | Las tres funciones nuevas existen en runtime | OK |
| 8 | `sendPasswordResetEmail` accesible desde el script clásico | `"function"` |
| 9 | El formulario de perfil se rellena desde la sesión | nombre, teléfono y cumpleaños correctos |
| 10 | El formulario **no** tiene campo de correo editable | confirmado |
| 11 | Editar el perfil sin sesión de Auth se rechaza | no escribe |
| 12 | El campo de acceso es `type="email"` | OK |
| 13 | `git diff --check` | Sin avisos |

Durante estas pruebas se encontró y corrigió un fallo real:
`resolveClientLoginEmail` validaba **antes** de normalizar, así que un correo
con espacios alrededor se rechazaba.

### No ejecutado — BLOQUEO EXTERNO

- Los 40 tests de `firestore.rules` (el emulador requiere Java).
- **No se ha visto llegar un correo de recuperación real.** Requiere un
  proyecto Firebase con el proveedor Email/Password habilitado y el dominio
  autorizado; en este entorno la autenticación responde HTTP 400.
- Tampoco se ha probado un ciclo real de registro → login → edición →
  recuperación → logout contra Firebase.

## Resultado de git diff --check

Sin avisos.

## Riesgos encontrados

- **Las clientas que solo recuerden su teléfono quedan fuera** hasta que usen
  la recuperación por correo. Conviene avisarlo antes de publicar.
- **El correo de recuperación depende de configuración remota**: proveedor
  Email/Password habilitado, plantilla de correo y dominio autorizado en la
  consola de Firebase. Si falta algo, el enlace no llega y la web no puede
  detectarlo (la respuesta es intencionadamente opaca).
- **La recuperación usa `prompt()`.** Funciona pero es tosco; la Fase 10 puede
  darle un modal.
- **No hay verificación de correo.** Alguien puede registrarse con un correo
  que no es suyo. Firebase ofrece `sendEmailVerification`; no se activó para no
  bloquear el registro de clientas reales sin avisar antes.
- **No hay borrado de cuenta.** El RGPD no aplica aquí, pero es una carencia.
- **El flujo de cancelación por teléfono sigue pendiente.** Se identificó en la
  Fase 5: busca citas por número escrito en un campo. Con las Rules desplegadas
  no encontrará nada para una visitante anónima. Debería rehacerse sobre la
  sesión de clienta; **no se hizo en esta fase** y queda como deuda explícita.

## Deuda técnica

- Rehacer la cancelación por teléfono sobre sesión de clienta.
- Verificación de correo en el registro.
- Borrado de cuenta.
- Sustituir los `prompt()` por modales (Fase 10).
- Cambio de correo con reautenticación.

## Cosas deliberadamente no modificadas

- El diseño general; solo se añadieron controles con las clases existentes.
- El flujo de acceso administrativo (Fase 2).
- La fidelidad (Fase 7).
- Reseñas y comunidad (Fase 9).
- No se añadió verificación de correo obligatoria.
- **Bot de Telegram: NO IMPLEMENTADO — fuera de alcance.**

## Próxima fase

Fase 9 — Contenido: reseñas, muro de la comunidad, galería y pop-up.
Sanitización, revisión de `innerHTML`, `authorUid` y `salonId` para que las
Rules de la Fase 3 acepten las escrituras, moderación de admin y retirada de
`ncv_client_reviews` y `ncv_community_posts` como fuente de verdad.

## Commit de cierre

```text
feat: complete client account lifecycle
```
