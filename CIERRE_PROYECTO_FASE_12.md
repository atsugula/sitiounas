# Fase 12 — QA, seguridad y preparación del despliegue

## Objetivo

Ejecutar la matriz de pruebas, intentar los ataques básicos contra el sistema
ya endurecido, revisar la seguridad de extremo a extremo y dejar preparado el
despliegue con su checklist y su plan de vuelta atrás.

## Archivos modificados

- `firebase.json` — cabeceras de seguridad y CSP.
- `tools/serve.mjs` — el servidor local aplica las mismas cabeceras.

## Archivos nuevos

- `CIERRE_PROYECTO_FASE_12.md`
- `RESUMEN_FINAL_PROYECTO.md`

---

## 1. Matriz de QA por rol

Leyenda: **OK** verificado en esta máquina · **RULES** depende de reglas aún
no desplegadas · **BLOQ** bloqueo externo, no verificable aquí.

### Público (sin sesión / anónimo)

| Caso | Estado | Nota |
| --- | --- | --- |
| Carga del sitio sin errores de JavaScript | OK | Consola limpia en pestaña nueva |
| Ver servicios, precios y galería | OK | 12 servicios, 11 fotos |
| Ver disponibilidad sin exponer PII | OK | Se sirve desde `bookingSlots` |
| Leer reseñas y muro | OK | |
| **No** poder listar `users` | RULES | `allow list: if isAdmin()` |
| **No** poder listar `appointments` | RULES | `allow list` admin o query propia |
| **No** poder escribir `settings` | RULES | `allow write: if isAdmin()` |
| Publicar reseña o post | OK (lógica) / BLOQ (ida y vuelta) | Exige `authorUid` |

### Cliente A

| Caso | Estado | Nota |
| --- | --- | --- |
| Registro | BLOQ | Auth responde HTTP 400 en este entorno |
| Login por correo | BLOQ | |
| Login por teléfono ya no funciona | OK | Retirado a propósito en la Fase 8 |
| Recuperación de contraseña | BLOQ | No se ha visto llegar el correo |
| La recuperación no revela si el correo existe | OK | `auth/user-not-found` se trata como éxito |
| Editar perfil (nombre, teléfono, cumpleaños) | OK (lógica) | |
| **No** poder editar rol, fidelidad ni salón | OK + RULES | Ni se envían |
| Reservar cita | OK (lógica) / BLOQ (transacción real) | |
| Reserva con varios servicios, 2 h y 3 h | OK | 29 tests de disponibilidad |
| Cancelar cita propia y liberar turnos | OK (lógica) | |
| Ver solo sus citas | OK | Filtrado por `clientUid` |
| Cerrar sesión de verdad | OK | Cierra Firebase Auth y recupera la anónima |

### Cliente B

| Caso | Estado | Nota |
| --- | --- | --- |
| **No** ver el perfil de A | RULES | |
| **No** ver ni cancelar la cita de A | RULES | |
| **No** ver la fidelidad de A | RULES | |
| Competir por el mismo turno que A | OK | Simulado: gana exactamente una |

### Admin

| Caso | Estado | Nota |
| --- | --- | --- |
| Acceso con Firebase Auth y rol en Firestore | BLOQ | |
| El flag `isAdminAuthenticated` no concede nada | OK | Verificado |
| Cambiar contraseña con reautenticación | BLOQ | Fase 2 |
| Ver citas, estados y métricas | OK (lógica) | |
| Cita presencial con locks | OK (lógica) | |
| Bloquear día y turno | OK | Error visible si falla |
| Servicios, precios, descuentos, popup, galería | OK | Nube primero |
| Llave de pago | OK | Propaga a los 4 puntos |
| Meta de ingresos | OK | `settings/income_goal`, privada |
| Ajustar fidelidad con motivo | OK | Rechazado sin sesión admin |
| Moderar reseñas y muro | OK | Espera confirmación |
| Cumpleaños | OK | Sin respaldo local |

---

## 2. Ataques básicos

Todos ejecutados de verdad en el navegador contra la aplicación cargada.

| # | Ataque | Resultado |
| --- | --- | --- |
| A1 | Encender `window.isAdminAuthenticated = true` desde la consola | `checkFirebaseAdminRole()` sigue devolviendo `false`; el ajuste de fidelidad se rechaza |
| A2 | Poner `role: "admin"` en `ncv_current_user` | La sesión se reconstruye como `client` |
| A3 | Duplicar una estampa marcando la cita completada dos veces | 0 transacciones nuevas |
| A3b | Conceder estampa por cita no completada | 0 |
| A3c | Conceder estampa a cita sin dueño | 0 |
| A3d | Dejar el saldo de fidelidad en negativo | Acotado a 0 |
| A4 | XSS por escape de atributo: `x" onerror="…` | `null` |
| A4b | `javascript:` en una foto | `null` |
| A4c | SVG embebido con `<script>` | `null` |
| A4d | `data:text/html` | `null` |
| A4e | `http://` en claro | `null` |
| A4f | Publicar contenido sin autor | `CONTENT_MISSING_AUTHOR` |
| A4g | Precargar `likes: 9999` | Forzado a 0 |
| A5 | Doble reserva del mismo turno | Ids deterministas; conflicto detectado; 4 locks |
| A6 | Escribir ajustes sin nube | Devuelve `false`, no toca la cache |
| A6b | Escribir campos de cita sin nube | Lanza `FIRESTORE_UNAVAILABLE` |

### Ataques que dependen de las Rules

Escritura directa a Firestore desde la consola, lectura del perfil ajeno,
edición de cita ajena y escritura de `settings` por un cliente **no se
pudieron probar aquí**: exigen las reglas desplegadas y un proyecto Firebase
accesible. Están cubiertos por los 40 tests de `firestore.rules`, que tampoco
se han ejecutado (ver bloqueos).

---

## 3. Revisión de seguridad

### Rules

`firestore.rules`, 40 tests escritos. Deny por defecto. Tres `allow read: if
true` deliberados y revisados: `bookingSlots` (sin PII), `reviews` y
`community_posts` (contenido público del sitio).

### Secretos

Búsqueda en todo el repositorio de claves privadas, cuentas de servicio,
tokens y contraseñas: **sin resultados**. Ninguna escritura de contraseña, PIN
o token en `localStorage`. Las claves legacy de la Fase 2
(`ncv_admin_password`, `ncv_admin_pin`) no existen.

La `firebaseConfig` sigue pública en el cliente, que es lo correcto: es
identificación de proyecto, no credencial.

### PII

| Antes del proyecto | Ahora |
| --- | --- |
| Toda visitante recibía la agenda completa con nombres, teléfonos y notas | La disponibilidad pública no lleva datos personales |
| Toda visitante recibía la lista completa de clientas | Solo con sesión admin |
| `ncv_users` guardaba la base de clientas en el navegador | Eliminada y purgada al arrancar |

### XSS y CSP

XSS almacenado corregido en la Fase 9 (lista blanca al escribir y al pintar).

Se añadió CSP y cabeceras de seguridad en `firebase.json`, y el servidor local
las aplica para poder probarlas.

**La CSP se probó y descubrió una regresión:** `frame-src 'none'` bloqueaba el
iframe de Google Maps. Corregido a `frame-src https://maps.google.com
https://www.google.com`. Tras la corrección, **cero violaciones** y la
aplicación funciona: Tailwind aplica estilos, los cinco módulos cargan, el
mapa se muestra, Chart.js carga bajo demanda y la agenda calcula.

Limitación honesta: `script-src` necesita `'unsafe-inline'` y `'unsafe-eval'`
porque quedan cuatro bloques de script embebidos y Tailwind CDN compila en el
navegador. **La CSP no protege hoy frente a inyección de scripts.** Sí acota
los orígenes permitidos, `connect-src`, `object-src`, `base-uri`,
`form-action` y `frame-ancestors`. Endurecer `script-src` requiere terminar la
Fase 11 y compilar Tailwind.

### Registros

No se registran contraseñas ni tokens. Los `console.error` de las escrituras
fallidas incluyen el objeto de error de Firestore, que puede llevar la ruta del
documento pero no datos personales.

---

## 4. Despliegue

### Requisitos previos

```bash
node --version    # 18 o superior
npm install
npm install -g firebase-tools    # o usar npx
firebase login
```

### Orden obligatorio

El orden importa. Desplegar las reglas antes del relleno deja el sitio roto.

```text
1. Relleno de datos    (clientUid + locks)   <- ANTES que las reglas
2. Reglas de Firestore
3. Índices
4. Hosting
```

### Paso 1 — Relleno de datos (BLOQUEO EXTERNO)

Las citas anteriores a la Fase 5 no tienen `clientUid` ni locks. Las Rules
marcan `clientUid` como inmutable **incluso para el admin**, así que el relleno
tiene que ir antes.

1. Crear los locks de las citas activas futuras usando
   `computeSlotIdsForAppointment` de `assets/js/booking-slots.js`.
2. Rellenar `clientUid` cruzando `appointments.phone` con `users.phone`.
3. Revisar a mano las que no casen (walk-ins de teléfono desconocido); pueden
   quedarse con `clientUid: null`.
4. Crear `settings/payment_key` con la llave real.
5. Crear `settings/income_goal` si se usaba la meta.

Requiere credenciales de administración (`firebase-admin` con cuenta de
servicio). **No se ejecutó aquí y no se inventa el resultado.**

### Paso 2 — Reglas

```bash
npm run test:rules
```

```bash
firebase deploy --only firestore:rules
```

El primer comando exige JDK 11+. **No ejecutar el despliegue sin haber pasado
los tests**: las reglas nunca se han probado.

### Paso 3 — Índices

```bash
firebase deploy --only firestore:indexes
```

### Paso 4 — Hosting

```bash
firebase deploy --only hosting
```

### Configuración remota necesaria (BLOQUEO EXTERNO)

En la consola de Firebase:

- Authentication → habilitar **Anónimo** y **Correo/Contraseña**.
- Authentication → Settings → **Dominios autorizados**: añadir el dominio.
- Authentication → Templates → revisar el correo de restablecimiento.
- Firestore → confirmar la región.
- Crear la cuenta de administración y poner `role: "admin"` en su
  `users/{uid}` **a mano desde la consola**. Ningún flujo de la aplicación
  puede crear un admin, por diseño.

---

## 5. Checklist previo a publicar

- [ ] `npm test` en verde (137 tests)
- [ ] `npm run check` en verde
- [ ] `npm run test:rules` en verde ← **nunca ejecutado**
- [ ] Relleno de `clientUid` y locks hecho
- [ ] `settings/payment_key` creado con la llave real
- [ ] Proveedores de Auth habilitados
- [ ] Dominio autorizado en Auth
- [ ] Cuenta admin creada con `role: "admin"`
- [ ] Reglas desplegadas
- [ ] Índices desplegados
- [ ] Probado: reservar, cancelar, login, recuperar contraseña
- [ ] Probado: acceso admin y una operación de cada tipo
- [ ] Consola del navegador sin errores en producción
- [ ] Avisar a las clientas de que el acceso pasa a ser por correo

---

## 6. Vuelta atrás

### Reglas

```bash
git log --oneline -- firestore.rules
git checkout <commit> -- firestore.rules
firebase deploy --only firestore:rules
```

La consola de Firebase también guarda el historial de reglas y permite
restaurar una anterior desde la interfaz.

### Hosting

Firebase Hosting conserva las versiones anteriores. Desde la consola:
Hosting → historial de versiones → **Rollback**. Es inmediato y no requiere
volver a compilar nada.

Por línea de comandos:

```bash
firebase hosting:versions:list
```

### Código

Cada fase es un commit identificable en `mejora-v2`:

```bash
git log --oneline main..mejora-v2
git revert <commit>
```

### Datos

**No hay vuelta atrás automática para los datos.** Antes del relleno del
paso 1, exportar:

```bash
gcloud firestore export gs://<bucket>/backup-pre-fase5
```

Sin esa exportación, un relleno mal hecho no se deshace.

---

## 7. Pruebas ejecutadas en esta fase

| # | Prueba | Resultado |
| --- | --- | --- |
| 1 | Suite completa (`npm test`) | 137/137 |
| 2 | Bloques inline (`npm run check`) | 4/4 |
| 3 | Los 16 ataques de la sección 2 | Todos bloqueados |
| 4 | Secretos versionados | Ninguno |
| 5 | Contraseñas o tokens en almacenamiento | Ninguno |
| 6 | Claves legacy de la Fase 2 | Ninguna |
| 7 | `allow read, write: if true` en datos de negocio | Ninguno |
| 8 | Rastro de Telegram en el código | Ninguno |
| 9 | El servidor local aplica las cabeceras | 4 cabeceras activas |
| 10 | **La CSP rompía Google Maps** | Detectado y corregido |
| 11 | Consola sin violaciones de CSP tras la corrección | OK |
| 12 | La app funciona bajo CSP | Tailwind, módulos, mapa, agenda |
| 13 | Chart.js carga bajo CSP | `function` |
| 14 | `git diff --check` | Sin avisos |

### No ejecutado — BLOQUEO EXTERNO

- **Los 40 tests de `firestore.rules`.** El emulador de Firestore necesita
  Java y esta máquina no lo tiene (`java: command not found`). **Las reglas
  nunca se han ejecutado.**
- **Nada contra Firebase real.** `signInAnonymously()` responde HTTP 400, así
  que no se ha visto funcionar de extremo a extremo: ni un registro, ni un
  login, ni una transacción de reserva, ni un correo de recuperación.
- No se hizo despliegue. No se tocó ningún dato real.
- No se midió rendimiento con herramientas reales.
- No se probó en dispositivos físicos.

---

## 8. Riesgos abiertos

| Riesgo | Gravedad | Nota |
| --- | --- | --- |
| Las Rules nunca se han ejecutado | **Alto** | Un error de compilación bloquearía el sitio entero |
| Nada probado contra Firebase real | **Alto** | La lógica está probada; el viaje de ida y vuelta no |
| El relleno de datos es manual y sin deshacer | **Alto** | Exportar antes |
| Mientras no se desplieguen las reglas, la fuga de PII sigue viva | **Alto** | Es el motivo del proyecto |
| `script-src` con `'unsafe-inline'` | Medio | La CSP no frena inyección de scripts hoy |
| Tailwind por CDN | Medio | Él mismo lo desaconseja |
| Sin verificación de correo | Medio | Cualquiera se registra con un correo ajeno |
| El derecho al premio no se valida en servidor | Medio | Requiere Cloud Functions |
| Fotos en base64 sin redimensionar | Medio | Límite de 1 MB por documento |
| Sin paginación en el panel | Bajo | Molesta a partir de miles de citas |
| Locks huérfanos posibles | Bajo | Un fallo de red a medias |
| Fidelidad heredada sin historial | Bajo | Regularizable con ajuste manual |

---

## Cosas deliberadamente no hechas

- No se desplegó nada.
- No se tocó ningún dato real.
- No se instaló Java ni tooling pesado sin autorización.
- No se creó ninguna cuenta de administración.
- No se activó verificación de correo obligatoria.
- No se añadió Cloud Functions ni backend propio.
- **Bot de Telegram: NO IMPLEMENTADO — fuera de alcance actual.**

## Commit de cierre

```text
chore: complete production hardening and release checklist
```
