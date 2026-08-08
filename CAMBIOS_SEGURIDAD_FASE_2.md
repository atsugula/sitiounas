# Cambios de seguridad - Fase 2

## Parche 2.1 - Entrada Admin

### Funciones modificadas
- `openAdminPanelModal`
- `handleAdminAuthSubmit`

### Helper creado
- `checkFirebaseAdminRole(user)`
  - Lee `users/{uid}` en Firestore.
  - Devuelve `true` solo si `role === "admin"`.
  - Devuelve `false` si el usuario no existe, el documento no existe, ocurre un error o el rol es distinto.

### Fallbacks eliminados solo en estas funciones
- Acceso por `password === "1234"`.
- Acceso por `password === "admin123"`.
- Acceso por `ncv_admin_password`.
- Acceso por PIN.
- Acceso por email hardcodeado sin validar `role`.
- Uso de `window.isAdminAuthenticated` como fuente primaria de autorización.

### Comportamiento actual de entrada admin
- `openAdminPanelModal`
  - Revisa primero si hay un Firebase user autenticado.
  - Si no hay usuario o no tiene `role === "admin"`, muestra `admin-auth-modal` y no abre el panel.
  - Si el documento Firestore confirma `role === "admin"`, abre `admin-panel-modal`.
- `handleAdminAuthSubmit`
  - Autentica con Firebase Authentication.
  - Lee `users/{uid}`.
  - Solo abre el panel si el rol es `admin`.
  - Si el rol no es admin, ejecuta `signOut()`, limpia flags de memoria y muestra:
    - `Esta cuenta no tiene permisos administrativos.`

### Validaciones realizadas
- Usuario Firebase con `role="admin"`: puede abrir panel.
- Usuario Firebase con `role="client"`: no puede abrir panel.
- Usuario Firebase sin documento Firestore: no puede abrir panel.
- Password `1234`: no concede acceso admin en estas funciones.
- Password `admin123`: no concede acceso admin en estas funciones.
- Cambiar `ncv_admin_password` en `localStorage`: no afecta estas funciones.

### Compatibilidad mantenida
- Se mantiene el panel visual.
- Se mantiene el login de clientes.
- Se mantiene el registro de clientes.
- Se mantiene la agenda.
- Se mantiene el comportamiento legacy fuera de estas dos funciones.

### Usos restantes de `localStorage` relacionados con auth
- Persistencia de sesión cliente (`ncv_current_user`).
- Cache/compatibilidad de usuarios antiguos (`ncv_users`).
- No se añadió ningún nuevo almacenamiento administrativo en `localStorage`.

### Fallbacks inseguros encontrados fuera del alcance
- `saveAdminPasswordChange` sigue presente.
- `saveAdminPinChange` sigue presente.
- Referencias legacy a `ncv_admin_password` siguen presentes.
- Referencias legacy a `1234` y `admin123` siguen presentes fuera de estas dos funciones.

### Próximos bloques recomendados
- `onAuthStateChanged`
- `logoutAdmin`
- `handleUserRegister`
- `handleUserLogin`
- Remoción final de `saveAdminPasswordChange` y `saveAdminPinChange`

## Parche 2.2 - Estado de Sesión Admin

### Funciones modificadas
- `onAuthStateChanged`
- `logoutAdmin`

### Helper reutilizado
- `checkFirebaseAdminRole(user)`
  - Se reutiliza como fuente única de verificación administrativa para sesión y restauración tras recarga.
  - No se duplica lógica de autorización por email, PIN, `localStorage` ni flags manuales.

### Comportamiento nuevo de `onAuthStateChanged`
- Cuando Firebase informa un usuario autenticado, se consulta `checkFirebaseAdminRole(user)`.
- Si devuelve `true`, se restablece el estado administrativo en memoria:
  - `window.isAdminAuthenticated = true`
  - `window.currentAdminProfile` con `uid`, `email` y `role: "admin"`
- Si devuelve `false`, se limpian los flags administrativos en memoria.
- Un usuario `role="client"` permanece autenticado como cliente.
- Un usuario sin documento `users/{uid}` no obtiene privilegios admin.
- No se persiste ningún privilegio administrativo en `localStorage`.

### Comportamiento nuevo de `logoutAdmin`
- Cierra `admin-panel-modal`.
- Limpia exclusivamente los flags administrativos en memoria.
- Ejecuta `Firebase signOut()` solo si la sesión activa corresponde realmente a un admin.
- No escribe contraseñas, PIN, tokens ni permisos en `localStorage`.
- No restaura fallbacks legacy.
- Después del logout, `window.isAdminAuthenticated` queda en `false`.

### Restauración tras recarga
- Admin autenticado con `role="admin"`:
  - Firebase restaura la sesión.
  - Firestore confirma el rol.
  - El estado admin vuelve a activarse en memoria.
- Cliente autenticado con `role="client"`:
  - Firebase restaura solo la sesión cliente.
  - No se activan controles admin.
- Usuario no autenticado:
  - No conserva privilegios admin anteriores.

### Flags en memoria conservados
- `window.isAdminAuthenticated`
- `window.currentAdminProfile`
- `window.currentFirebaseUser`

### Referencias legacy todavía pendientes
- `saveAdminPasswordChange`
- `saveAdminPinChange`
- `handleUserRegister`
- `handleUserLogin`
- Cualquier fallback antiguo fuera de `onAuthStateChanged` y `logoutAdmin`

### Verificaciones realizadas
- Admin con `role="admin"` inicia sesión y recupera estado admin tras recarga.
- Cliente con `role="client"` permanece autenticado como cliente y no obtiene controles admin.
- Usuario sin documento `users/{uid}` no obtiene permisos admin.
- `logoutAdmin` cierra el panel y limpia flags.
- Cambios manuales en `localStorage` con `ncv_admin_password` o `ncv_admin_pin` no producen sesión admin.

### Riesgos encontrados
- Persisten referencias legacy de autenticación fuera del alcance de este parche.
- La seguridad definitiva sigue dependiendo de completar las reglas de Firestore en una fase posterior.
- El estado admin en memoria sigue siendo UI/compatibilidad, no fuente primaria de autorización.

## Parche 2.3 - Registro Seguro de Clientes

### Funciones modificadas
- `handleUserRegister`

### Helpers creados
- `syncRegisterPasswordRequirements()`
  - Ajusta el campo visual de contraseña a `minlength = 6` y actualiza el placeholder.
- `getRegisterAuthErrorMessage(error)`
  - Traduce errores comunes de Firebase Auth a mensajes comprensibles.
- `buildSafeClientProfile(...)`
  - Construye el perfil público de cliente sin contraseña.
- `getLegacyBookedCount(phone, email)`
  - Recupera `bookedCount` histórico si ya existía una coincidencia compatible en `ncv_users`.

### Estructura actual de `users/{uid}`
- `uid`
- `salonId: "nails-con-val"`
- `name`
- `phone`
- `email`
- `birthdate`
- `role: "client"`
- `bookedCount`
- `createdAt`

### Campos que se dejaron de guardar
- `password`
- `passwordHash`
- Cualquier credencial derivada o copia de contraseña
- Cualquier `role` definido por el navegador para este flujo

### Comportamiento de `ncv_users`
- Para cuentas nuevas se guarda solo un perfil no sensible.
- No se guarda contraseña.
- Si existe un registro legado compatible por teléfono o correo, se preserva `bookedCount`.
- Los registros viejos no se borran masivamente.

### Comportamiento de `ncv_current_user`
- Guarda únicamente datos públicos/no sensibles.
- No guarda contraseña ni tokens.
- Permanece como cache temporal de compatibilidad de UI.

### Validaciones de contraseña
- Se alineó el campo visual a `mínimo 6 caracteres`.
- Se valida en JavaScript antes de llamar a Firebase Auth.
- La contraseña solo se usa para `createUserWithEmailAndPassword(...)`.

### Validación de role
- El flujo fija internamente `role = "client"`.
- No toma `role` del formulario ni de variables manipulables del navegador.
- No puede generarse `role: "admin"` desde este registro.

### Tratamiento de usuarios legacy
- No se migraron usuarios antiguos de forma masiva.
- No se intentó convertir passwords legacy.
- Se conserva compatibilidad histórica de `ncv_users` y `bookedCount`.
- La deuda técnica de `handleUserLogin` sigue pendiente para una fase posterior.

### Escenarios probados
- Nueva clienta válida: crea usuario en Firebase Auth.
- `users/{uid}`: se crea con `role = "client"` y sin contraseña.
- `ncv_users` nuevo: no contiene contraseña.
- `ncv_current_user`: no contiene contraseña.
- Forzar `role="admin"` desde el navegador: sigue registrando `role="client"`.
- Email duplicado: muestra error de Firebase y no escribe perfil parcial.
- Error en `createUserWithEmailAndPassword`: no se crea perfil Firestore.
- Error al guardar Firestore tras crear Auth user: se informa visible y no se persiste el perfil local.
- Login admin y sesión admin: no se tocaron.
- Agenda: no se tocó.

### Riesgos encontrados
- `handleUserLogin` sigue siendo legado y depende de la compatibilidad histórica de credenciales.
- Si Firestore falla después de crear el usuario Auth, queda una cuenta Auth creada sin perfil sincronizado.
- No se eliminó aún la compatibilidad vieja fuera de `handleUserRegister`.

### Próximos pasos recomendados
- `handleUserLogin` para retirar el último uso de passwords en `localStorage` y Firestore.
- Consolidar la lectura de sesión cliente desde Firebase Auth.
- Reglas de Firestore para proteger `users/{uid}` y el resto de colecciones.
## Parche 2.4 - Login Seguro de Clientes

### Funciones modificadas
- `handleUserLogin`

### Helpers creados
- `isValidEmailAddress(value)`
- `getClientLoginAuthErrorMessage(error)`
- `resolveClientLoginEmail(identifier)`
- `buildSafeClientSession(profileData, fallbackProfile)`
- `persistCurrentClientSession(profile)`
- `upsertSafeLegacyClientRecord(profile)`

### Cómo autentica ahora
- La contraseña solo se usa en `signInWithEmailAndPassword(auth, email, password)`.
- No se compara contra passwords en `localStorage` ni en Firestore.
- Después del Auth exitoso, `users/{uid}` pasa a ser la fuente principal del perfil.

### Comportamiento login por email
- Si el identificador es un email válido, se usa directamente en Firebase Auth.
- El perfil se lee desde `users/{uid}`.
- Si el documento no existe, la sesión de aplicación no se completa.

### Comportamiento login por teléfono
- Si el identificador no es email, se busca solo una coincidencia de teléfono en `ncv_users`.
- `ncv_users` se usa únicamente como directorio `phone -> email`.
- Si no se puede resolver un email seguro, se muestra:
  - `Por seguridad, inicia sesión con el correo asociado a tu cuenta.`

### Eliminación de comparación de passwords
- Se eliminó la validación contra `acc.password`.
- Se eliminó la lectura de `docSnap.data().password`.
- Ya no se usa `ncv_users` para autenticar contraseñas.
- Ya no se usa Firestore para comprobar credenciales.

### Comportamiento de `ncv_users`
- Para la cuenta que inició sesión, se reemplaza el registro legacy por una versión segura.
- Se elimina `password` solo de esa cuenta.
- Los demás registros legacy permanecen intactos.

### Migración progresiva de cuenta actual
- Tras login exitoso se sanearon:
  - `ncv_current_user`
  - la entrada correspondiente en `ncv_users`
- Se conservan solo campos públicos/no sensibles.
- No se guardan tokens ni credenciales Firebase.

### Comportamiento de `ncv_current_user`
- Guarda solo:
  - `uid`
  - `salonId`
  - `name`
  - `phone`
  - `email`
  - `birthdate`
  - `role`
  - `bookedCount`
- No guarda contraseña.

### Separación admin/client
- Si `users/{uid}.role === "admin"`:
  - no se abre sesión cliente
  - se cierra la sesión Firebase de esa ruta
  - se muestra:
    - `Esta cuenta corresponde a administración. Usa el acceso administrativo.`
- Si el documento no existe:
  - no se completa la sesión
  - se informa que el perfil está incompleto

### Errores Auth
- Correo o contraseña incorrectos
- Correo electrónico no válido
- Demasiados intentos
- Cuenta deshabilitada
- Error de red
- Mensaje genérico seguro para credenciales inválidas

### Verificaciones realizadas
- Email + password Firebase válidos: login correcto.
- Email + password incorrectos: rechazo por Firebase.
- Modificar password en `ncv_users`: no altera el login.
- Modificar password en Firestore legacy: no altera el login.
- Teléfono con email asociado en `ncv_users`: resuelve email y autentica.
- Teléfono sin email resoluble: pide usar correo.
- Cliente `role="client"`: entra como cliente.
- Admin `role="admin"` usando login cliente: recibe aviso para usar acceso administrativo.
- Usuario Auth válido pero sin `users/{uid}`: no obtiene sesión de aplicación.
- `ncv_current_user`: no contiene password.
- Usuario legacy que inicia sesión: su entrada en `ncv_users` queda saneada sin password.

### Riesgos pendientes
- `handleUserLogin` todavía convive con compatibilidad legacy de `ncv_users` como directorio de correo.
- Si el perfil Firestore existe pero está incompleto, se bloquea la sesión para evitar estados ambiguos.
- La protección definitiva depende de las reglas de Firestore en una fase posterior.

### Compatibilidad legacy restante
- `handleUserRegister` ya no guarda passwords nuevas.
- `handleUserLogin` todavía depende de `ncv_users` como puente temporal para resolver emails por teléfono.
- Los registros antiguos de otras clientas no se migran todavía de forma masiva.

## Parche 2.5A - Cambio Seguro de Contraseña Admin

### Función modificada
- `saveAdminPasswordChange`

### Imports Firebase añadidos/reutilizados
- `EmailAuthProvider`
- `reauthenticateWithCredential`
- `updatePassword`

### Flujo de reautenticación
- Requiere `auth.currentUser` y una verificación positiva de `checkFirebaseAdminRole(auth.currentUser)`.
- No confía en `window.isAdminAuthenticated` como autorización primaria.
- Usa la contraseña actual solo para reautenticar al usuario Firebase.

### Flujo `updatePassword`
- Después de reautenticar correctamente, llama a `updatePassword(...)`.
- La nueva contraseña no se guarda en `localStorage`, `sessionStorage`, Firestore ni globals.
- Tras éxito, limpia ambos inputs y mantiene la sesión si Firebase lo permite.

### Mecanismos legacy eliminados de esta función
- `ncv_admin_password`
- `localStorage` como almacenamiento de contraseña admin
- `password === "1234"`
- `password === "admin123"`
- PIN como validación de contraseña
- escritura de contraseña en Firestore

### Comportamiento de errores
- Contraseña actual incorrecta:
  - `La contraseña actual no es correcta.`
- Sesión antigua / reautenticación requerida:
  - `Por seguridad debes volver a iniciar sesión antes de cambiar la contraseña.`
- Contraseña nueva débil:
  - `La nueva contraseña debe tener al menos 6 caracteres.`
- Demasiados intentos:
  - `Demasiados intentos. Intenta de nuevo más tarde.`
- Error de red:
  - `No pudimos conectar con Firebase. Revisa tu internet.`
- Usuario no disponible:
  - `No tienes una sesión administrativa válida.`

### Verificaciones realizadas
- Admin `role="admin"` con contraseña actual correcta: Firebase actualiza la contraseña.
- Admin `role="admin"` con contraseña actual incorrecta: Firebase rechaza y no cambia la contraseña.
- Usuario `role="client"`: no puede usar esta función.
- Usuario sin `users/{uid}`: no puede cambiar contraseña por esta ruta.
- Cambiar `window.isAdminAuthenticated` manualmente: no concede permiso.
- Cambiar `ncv_admin_password`: no afecta el cambio.
- Cambios en `localStorage`: no conceden permiso.
- Nueva contraseña menor a 6 caracteres: rechazada.
- Después de éxito: `localStorage` no contiene la nueva contraseña.
- Firestore no recibe contraseña.
- Login admin continúa funcionando con la nueva contraseña Firebase.
- Login cliente, agenda y panel visual permanecen intactos.

### Referencias legacy aún pendientes
- `saveAdminPinChange`
- Campos visuales de PIN
- Otras referencias legacy fuera de `saveAdminPasswordChange`

### Riesgos encontrados
- La seguridad final sigue dependiendo de las reglas de Firestore en una fase posterior.
- Si la sesión Firebase es demasiado antigua, el usuario deberá reautenticarse antes de cambiar la contraseña.
- El campo de PIN sigue existiendo visualmente por compatibilidad, pero no participa en este flujo.

## Parche 2.5B - Eliminación de PIN Admin Legacy

### Función modificada / renombrada
- `saveAdminPinChange` fue reemplazada por `saveAdminPaymentKeyChange`

### Referencias PIN eliminadas
- `admin-new-pin-input`
- `ncv_admin_pin`
- Cualquier lectura o escritura de PIN para autenticación o autorización
- Cualquier fallback del PIN como validación administrativa

### Cambios de UI
- Se eliminó el bloque visual de PIN rápido.
- El panel quedó centrado en:
  - `Número de la Llave de Pago`
- El título de la sección pasó de PIN a:
  - `Seguridad & Configuración`

### Cómo se autoriza ahora el cambio de llave
- Requiere `auth.currentUser`.
- Requiere que `checkFirebaseAdminRole(auth.currentUser)` devuelva `true`.
- No confía en `window.isAdminAuthenticated`.

### Cómo se persiste actualmente la llave
- No se introdujo persistencia nueva en este parche.
- La llave sigue mostrándose desde los elementos de UI existentes y el valor inicial hardcoded del formulario.
- No se guarda en `localStorage`, `sessionStorage` ni Firestore.
- La migración a un almacenamiento centralizado queda pendiente para una fase posterior.

### Elementos visuales actualizados
- `llave-card-number`
- `llave-display-number`

### Referencias legacy que todavía queden
- Los textos hardcoded de la llave en otras secciones del sitio siguen existiendo.
- El formulario de configuración de Firebase Auth sigue separado y sin cambios en esta fase.

### Verificaciones realizadas
- Modificar `ncv_admin_pin` manualmente no concede privilegios.
- Crear `ncv_admin_pin` manualmente no concede admin.
- No quedó ninguna ruta activa que compare PIN para autenticar.
- Admin `role="admin"` puede cambiar el número de llave.
- Cliente `role="client"` no puede cambiar el número de llave.
- Manipular `window.isAdminAuthenticated` no permite cambiar la llave sin admin real.
- Actualizar la llave cambia los displays correspondientes.
- Login admin sigue funcionando.
- Cambio de contraseña admin sigue funcionando.
- Login cliente sigue funcionando.
- Agenda sigue intacta.
- No se crean nuevos valores `ncv_admin_pin`.

### Riesgos pendientes
- La llave aún se mantiene como valor de interfaz, no como configuración centralizada en Firestore.
- Existen hardcodes de la llave en otras zonas del sitio que deberán revisarse en una fase posterior.
- El nombre de la función ya es semántico, pero la persistencia real de la llave sigue siendo temporal.

## Parche 2.6 - Barrido Final Auth Legacy

### Resumen del barrido
- Se revisó `index.html` buscando restos activos de autenticación, autorización y persistencia insegura.
- No se encontraron rutas activas que sigan usando `ncv_admin_password` o `ncv_admin_pin`.
- Los usos de `password` que permanecen son legítimos y temporales en formularios/Auth.
- `window.isAdminAuthenticated` y `window.currentAdminProfile` quedan como estado de UI/compatibilidad, no como autoridad primaria.

### Tabla de coincidencias
| Patrón | Coincidencias | Estado |
| --- | ---: | --- |
| `ncv_admin_password` | 0 | eliminado |
| `ncv_admin_pin` | 0 | eliminado |
| `admin123` | 0 | eliminado |
| `1234` | 0 | eliminado como fallback de auth |
| `password` persistido | 0 | ninguno |
| `token` persistido | 0 | ninguno |
| `role` por email hardcoded | 0 | eliminado |
| `window.isAdminAuthenticated` | 24 | solo UI/compatibilidad |
| `window.currentAdminProfile` | 10 | solo UI/compatibilidad |
| `signInWithEmailAndPassword` | 6 | legítimo |
| `createUserWithEmailAndPassword` | 1 | legítimo |
| `updatePassword` | 1 | legítimo |
| `reauthenticateWithCredential` | 1 | legítimo |

### Código modificado
- No se requirió un cambio funcional nuevo en `index.html` para este barrido.
- El resultado fue de auditoría y confirmación de estado tras los parches 2.1 a 2.5B.

### Código no modificado
- `saveAdminPasswordChange`
- `saveAdminPaymentKeyChange`
- `handleAdminAuthSubmit`
- `handleUserRegister`
- `handleUserLogin`
- `openAdminPanelModal`
- `logoutAdmin`
- Agenda, fidelidad, servicios, galería, comunidad y métricas

### Coincidencias legítimas conservadas
- `signInWithEmailAndPassword(...)`
- `createUserWithEmailAndPassword(...)`
- `updatePassword(...)`
- `reauthenticateWithCredential(...)`
- `password` como variable temporal de formulario/Auth
- `currentAdminProfile` como perfil de UI
- `window.isAdminAuthenticated` como estado visual temporal

### Posibles falsos positivos
- `admin@nailsconval.com` en el placeholder de correo admin.
- `password` en inputs y mensajes de error.
- `localStorage` para datos legítimos de la app como sesiones de cliente, citas, galería y configuraciones.

### Riesgos pendientes
- La seguridad definitiva sigue dependiendo de Firestore Rules en una fase posterior.
- `window.isAdminAuthenticated` sigue siendo estado de UI; no debe crecer como fuente de autorización.
- La llave de pago aún se conserva como valor de interfaz y no como configuración centralizada.

### Deuda legacy de datos antiguos
- Puede haber `ncv_users` antiguos con `password` guardado en navegadores históricos.
- Esa compatibilidad no se usa ya para autenticar.
- No se hizo migración masiva de datos antiguos en este parche.
