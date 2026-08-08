# PROMPT MAESTRO — AGENTE AUTÓNOMO NAILSCONVAL

Actúa como agente senior responsable de terminar de forma segura el proyecto NailsConVal existente.

Tu misión es ejecutar el plan completo desde el estado actual hasta una versión lista para producción, trabajando directamente sobre el repositorio existente y realizando commits parciales y documentación al cerrar cada fase.

---

# CONTEXTO DEL PROYECTO

Repositorio local esperado:

```text
D:\trabajo\cloneWebSites\sitiounas
```

Antes de asumir rutas, confirma el repositorio real con:

```bash
git rev-parse --show-toplevel
git status
```

Archivos de contexto que debes leer antes de modificar código:

```text
AUDITORIA_PROYECTO.md
CAMBIOS_AGENDA_FASE_1.md
CAMBIOS_SEGURIDAD_FASE_2.md
PLAN_COMPLETO_NAILSCONVAL.md
index.html
```

Si existe documentación de fases posteriores, también debes leerla antes de continuar.

---

# ESTADO QUE DEBES RESPETAR

## COMPLETADO

### Fase 1 — Agenda

Ya se normalizaron:

- `appointmentDateIso`
- `dateKey`
- `serviceIds`
- `serviceSummary`
- `durationMinutes`
- `startTime`
- `endTime`
- `salonId`

La disponibilidad utiliza intervalos y duración real.

NO reviertas este comportamiento.

### Fase 2 — Auth / seguridad frontend

Ya está cerrado:

- Firebase Auth como autoridad de passwords.
- admin requiere `users/{uid}.role === "admin"`.
- no `1234`.
- no `admin123`.
- no `ncv_admin_password`.
- no `ncv_admin_pin`.
- no passwords persistidos.
- no tokens persistidos.
- login cliente usa Firebase Auth.
- registro cliente usa Firebase Auth.
- cambio password admin usa `reauthenticateWithCredential + updatePassword`.
- `saveAdminPaymentKeyChange` reemplazó el antiguo PIN.
- `window.isAdminAuthenticated` es solo UI/compatibilidad.

NO reintroduzcas mecanismos legacy.

---

# EXCLUSIÓN OBLIGATORIA

NO IMPLEMENTES BOT DE TELEGRAM.

No agregues:

- librerías Telegram;
- webhooks Telegram;
- tokens Telegram;
- variables Telegram;
- documentación de instalación Telegram;
- placeholders Telegram;
- arquitectura futura Telegram.

Telegram queda fuera de alcance hasta una decisión posterior.

---

# ARQUITECTURA OBJETIVO

Mantener:

- HTML/CSS/JavaScript vanilla.
- Tailwind actual salvo necesidad técnica.
- Firebase Authentication.
- Cloud Firestore.
- Hosting estático.
- WhatsApp.
- frontend visual existente.

NO migrar a:

- React;
- Vue;
- Angular;
- Next.js;
- backend Node propio;
- Supabase;

salvo que exista un bloqueo técnico real y lo documentes sin ejecutarlo automáticamente.

---

# FORMA DE TRABAJO

Trabaja fase por fase.

NO intentes reescribir todo el sitio de una sola vez.

Para cada fase:

1. lee contexto;
2. inspecciona código real;
3. documenta plan específico;
4. aplica cambios mínimos;
5. prueba;
6. revisa diff;
7. crea documento de cierre;
8. realiza commit;
9. confirma working tree;
10. continúa a la siguiente fase.

Puedes ejecutar automáticamente todas las fases sin pedir confirmación entre ellas SI:

- no hay pérdida de datos;
- no necesitas credenciales;
- no necesitas acciones destructivas externas;
- no existe un bloqueo que requiera decisión humana.

Si surge un bloqueo real:

- no inventes;
- no destruyas;
- documenta el bloqueo;
- completa todo lo demás posible;
- deja el repo en estado consistente.

---

# POLÍTICA GIT OBLIGATORIA

Antes de empezar:

```bash
git status
git branch --show-current
git log -5 --oneline
```

No uses:

```text
git reset --hard
git clean -fd
git push --force
git rebase --onto
```

sin autorización explícita.

No borres cambios del usuario.

No alteres commits históricos.

No hagas commit de:

- secretos;
- tokens;
- `.env` con credenciales;
- claves privadas;
- archivos temporales;
- dumps de datos sensibles.

## Cierre de cada fase

Ejecuta:

```bash
git diff --check
git status
```

Después:

```bash
git add <archivos de la fase>
git commit -m "<mensaje de la fase>"
```

Verifica:

```bash
git status
git show --stat --oneline HEAD
```

Cada fase debe quedar identificable en Git.

---

# DOCUMENTACIÓN OBLIGATORIA

Cada fase debe producir su archivo Markdown.

Usa:

```text
MODELO_FIRESTORE_FASE_3.md
CAMBIOS_FIRESTORE_FASE_3.md
CAMBIOS_PERSISTENCIA_FASE_4.md
CAMBIOS_RESERVAS_FASE_5.md
CAMBIOS_ADMIN_FASE_6.md
CAMBIOS_FIDELIDAD_FASE_7.md
CAMBIOS_USUARIOS_FASE_8.md
CAMBIOS_CONTENIDO_FASE_9.md
CAMBIOS_UX_PERFORMANCE_FASE_10.md
CAMBIOS_MODULARIZACION_FASE_11.md
CIERRE_PROYECTO_FASE_12.md
```

Cada documento debe incluir:

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

## Próxima fase

## Commit de cierre
```

No escribas documentación que afirme pruebas que no ejecutaste.

---

# FASE 3 — FIRESTORE MODEL + RULES

## Paso 3.1 — Análisis

Primero crea:

```text
MODELO_FIRESTORE_FASE_3.md
```

Audita TODO uso de:

```js
collection(
doc(
getDoc(
getDocs(
setDoc(
addDoc(
deleteDoc(
onSnapshot(
query(
where(
```

Documenta:

- colección;
- operación;
- función;
- actor;
- ownership;
- PII;
- query;
- riesgo;
- permiso objetivo.

Colecciones esperadas, pero NO las asumas sin verificar:

```text
users
appointments
settings
reviews
community_posts
```

Analiza también cualquier otra.

## Modelo users

Objetivo:

```js
users/{uid} = {
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

Cliente:

- own read;
- own limited update.

Cliente NO puede modificar:

```text
uid
role
bookedCount
salonId
createdAt
```

Admin:

- permisos necesarios para el panel.

## Admin en Rules

Inicialmente puede utilizarse conceptualmente:

```text
request.auth != null
+
get(users/{request.auth.uid}).data.role == "admin"
```

Pero DEBES impedir que un cliente pueda promoverse a admin.

Custom Claims quedan como alternativa futura, no como migración automática.

## Appointments

Audita campos reales.

Incluye los de Fase 1:

```text
appointmentDateIso
dateKey
serviceIds
serviceSummary
durationMinutes
startTime
endTime
salonId
```

Define permisos por actor.

## Rules

Crear:

```text
firestore.rules
```

Implementar helpers mínimos y reglas de mínimo privilegio.

Nunca usar:

```text
allow read, write: if true;
```

para datos sensibles.

## Tests

Si Firebase Emulator Suite ya existe o puede configurarse con bajo riesgo, crear tests de Rules.

Si requiere instalar tooling razonable, puedes hacerlo siempre que:

- documentes dependencias;
- no migres arquitectura;
- mantengas bajo costo.

Tests mínimos:

1. cliente lee propio perfil;
2. cliente no lee otro perfil;
3. cliente no cambia role;
4. cliente no cambia bookedCount;
5. admin opera usuarios;
6. público no lee users;
7. cliente crea cita válida;
8. cliente no cambia campos admin de cita;
9. admin modifica cita;
10. settings administrativos están protegidos.

## Cierre Fase 3

Crear:

```text
CAMBIOS_FIRESTORE_FASE_3.md
```

Commit sugerido:

```text
feat: define firestore model and enforce security rules
```

---

# FASE 4 — FIRESTORE SOURCE OF TRUTH

Objetivo:

Firestore debe ser la autoridad de datos de negocio.

Audita estas keys:

```text
ncv_users
ncv_current_user
ncv_appointments
ncv_custom_services
ncv_discount_settings
ncv_blocked_dates_list
ncv_blocked_time_slots
ncv_gallery_items
ncv_client_reviews
ncv_community_posts
ncv_marketing_popup
ncv_income_goal
ncv_income_goal_type
ncv_firebase_config
```

Clasifica cada una:

```text
CACHE
LEGACY
MIGRAR A FIRESTORE
ELIMINAR
```

Nunca uses localStorage como autoridad para:

- roles;
- citas;
- fidelidad;
- settings administrativos;
- usuarios.

## Estrategia

Preferir:

```text
Firestore write
→ success
→ actualizar UI/cache
```

No:

```text
localStorage write
→ luego intento Firestore
```

## Llave de pago

Centralizarla en Firestore.

Eliminar hardcodes duplicados cuando sea seguro.

## Perfil Auth sin Firestore

Resolver:

```text
Auth user existente
+
users/{uid} inexistente
```

con estrategia segura.

Nunca reconstruir role admin desde datos del navegador.

## Cierre

Documento:

```text
CAMBIOS_PERSISTENCIA_FASE_4.md
```

Commit:

```text
refactor: make firestore the source of truth
```

---

# FASE 5 — BOOKING ATÓMICO

Implementar protección real contra doble reserva.

## Slots

Unidad:

```text
30 minutos
```

Ejemplo:

```text
14:00-16:00
```

locks:

```text
14:00
14:30
15:00
15:30
```

Crea estructura determinista compatible con `salonId`.

Ejemplo posible:

```text
bookingSlots/{dateKey_startTime}
```

o estructura mejor si el modelo resultante de Fase 3 lo requiere.

## Transacción

Una reserva debe:

1. calcular slots;
2. leer todos;
3. abortar si alguno está ocupado;
4. crear todos los locks;
5. crear appointment;
6. completar una sola transacción.

## Cancelación

Debe cambiar cita + liberar locks de manera consistente.

## Concurrencia

Simula o prueba dos reservas sobre mismo horario.

Solo una debe ganar.

## Cierre

Documento:

```text
CAMBIOS_RESERVAS_FASE_5.md
```

Commit:

```text
feat: add atomic booking and slot locking
```

---

# FASE 6 — ADMIN

Conectar todo el panel al modelo protegido.

Verifica:

- citas;
- estados;
- walk-ins;
- bloqueos;
- servicios;
- precios;
- descuentos;
- galería;
- popup;
- reviews;
- comunidad;
- cumpleaños;
- métricas;
- meta de ingresos;
- llave.

Regla:

Frontend admin = UX.

Firestore Rules = autorización real.

Nunca permitir que `window.isAdminAuthenticated` sea permiso backend.

Documento:

```text
CAMBIOS_ADMIN_FASE_6.md
```

Commit:

```text
feat: harden admin operations and business settings
```

---

# FASE 7 — FIDELIDAD

Crear historial auditable.

Preferencia:

```text
loyalty_transactions/{id}
```

Campos mínimos:

```text
userId
appointmentId
salonId
type
stampsDelta
reason
createdAt
createdBy
```

Reglas:

- cliente no escribe estampas;
- estampa se deriva de cita completada;
- no duplicar recompensa;
- ajuste manual solo admin;
- premio/redeem trazable.

`bookedCount` puede mantenerse como cache derivado, no como autoridad.

Documento:

```text
CAMBIOS_FIDELIDAD_FASE_7.md
```

Commit:

```text
feat: add auditable loyalty transactions
```

---

# FASE 8 — CUENTAS Y PERFIL

Implementar:

- password reset Firebase;
- edición segura de perfil;
- restauración de sesión;
- migración progresiva de legacy;
- estrategia para eliminar puente `phone -> email` local.

Para password reset usar Firebase Auth oficial.

NO crear password manual.

NO exponer query pública por teléfono/email.

Documento:

```text
CAMBIOS_USUARIOS_FASE_8.md
```

Commit:

```text
feat: complete client account lifecycle
```

---

# FASE 9 — CONTENIDO

Asegurar:

- reviews;
- community posts;
- galería;
- popup;
- URLs de imágenes;
- sanitización;
- ownership;
- moderación.

Revisar `innerHTML`.

No añadir Firebase Storage salvo necesidad real.

Documento:

```text
CAMBIOS_CONTENIDO_FASE_9.md
```

Commit:

```text
feat: secure community reviews and content management
```

---

# FASE 10 — UX / MOBILE / PERFORMANCE

Solo después de seguridad y datos.

Mejorar:

- flujo booking;
- loaders;
- errores;
- confirmaciones;
- responsive;
- admin móvil;
- accesibilidad;
- rendimiento;
- imágenes;
- listeners;
- renders.

NO rediseñar marca completa.

Documento:

```text
CAMBIOS_UX_PERFORMANCE_FASE_10.md
```

Commit:

```text
refactor: improve mobile ux accessibility and performance
```

---

# FASE 11 — MODULARIZACIÓN

Extraer JS gradualmente.

Objetivo aproximado:

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

No cambiar framework.

No hacer “big bang rewrite”.

Prueba después de cada extracción.

Documento:

```text
CAMBIOS_MODULARIZACION_FASE_11.md
```

Commit:

```text
refactor: modularize frontend javascript
```

---

# FASE 12 — QA / SECURITY / DEPLOY

Ejecuta matriz final de QA.

## Roles

Probar:

```text
Público
Cliente A
Cliente B
Admin
```

## Casos

- registro;
- login;
- reset;
- logout;
- admin;
- password admin;
- reserva;
- múltiples servicios;
- 2h;
- 3h;
- simultaneidad;
- cancelación;
- bloqueos;
- loyalty;
- settings;
- reviews;
- community;
- galería;
- payment key.

## Ataques básicos

Intentar:

- role escalation;
- bookedCount manipulation;
- lectura de user ajeno;
- edición cita ajena;
- escritura settings cliente;
- bypass de flags JS;
- escritura directa a Firestore;
- payloads HTML en contenido.

## Seguridad

Revisar:

- Rules;
- Storage Rules si aplica;
- CSP viable;
- XSS;
- PII;
- logs;
- secretos.

## Deploy

Preparar despliegue estático de bajo costo.

No hagas deploy irreversible a producción sin credenciales/autorización.

Sí puedes preparar:

- config;
- comandos;
- guía;
- checklist;
- rollback.

Crear:

```text
CIERRE_PROYECTO_FASE_12.md
```

Commit:

```text
chore: complete production hardening and release checklist
```

---

# MULTI-SALÓN

NO implementar multi-salón completo.

Mantener `salonId`.

Documentar posibles pasos futuros.

No migrar a:

```text
salons/{salonId}/...
```

en esta ejecución salvo que el código existente ya use ese modelo y mantenerlo sea necesario.

---

# CRITERIOS GLOBALES DE SEGURIDAD

Nunca:

```text
password in localStorage
password in Firestore
accessToken in localStorage manual
refreshToken in localStorage manual
PIN local como auth
role desde formulario cliente
bookedCount desde cliente
allow write if true en datos de negocio
```

Firebase config pública no es un secreto.

No muevas Firebase config a un “secreto” de frontend creyendo que eso reemplaza Rules.

---

# CRITERIOS DE CALIDAD

En cada fase:

- menor diff razonable;
- nombres claros;
- sin duplicación innecesaria;
- compatibilidad preservada;
- errores visibles;
- no ocultar excepciones críticas;
- no afirmar test sin ejecutarlo;
- no dejar código muerto evidente nuevo.

Ejecuta al menos:

```bash
git diff --check
```

Además usa cualquier validación disponible en el proyecto.

Si agregas tooling, documenta cómo ejecutarlo.

---

# MANEJO DE BLOQUEOS

Si una operación requiere:

- login Firebase Console;
- cambiar Rules en proyecto remoto;
- credenciales;
- API keys privadas;
- activar Billing;
- DNS;
- deploy producción;
- eliminar datos reales;

NO inventes ni ejecutes acciones destructivas.

En su lugar:

1. prepara archivos;
2. prepara comandos;
3. documenta paso exacto;
4. continúa con tareas locales independientes;
5. marca:

```text
BLOQUEO EXTERNO
```

en el documento de fase.

---

# RESULTADO FINAL OBLIGATORIO

Al terminar todas las fases ejecutables, genera:

```text
RESUMEN_FINAL_PROYECTO.md
```

Debe incluir:

## Estado por fase

Tabla:

```text
Fase | Estado | Commit | Documento | Riesgos
```

## Commits realizados

Listar hashes y mensajes.

## Archivos creados

## Arquitectura final

## Modelo Firestore final

## Rules finales

## Estado de localStorage

## Estado de booking concurrente

## Estado de fidelidad

## Estado del panel admin

## Tests ejecutados

## Bloqueos externos

## Pasos de despliegue

## Rollback

## Deuda técnica

## Funciones deliberadamente fuera de alcance

Incluir expresamente:

```text
Bot de Telegram: NO IMPLEMENTADO — fuera de alcance actual.
```

---

# REGLA FINAL

No te detengas simplemente porque una fase sea grande.

Divide internamente en parches pequeños.

Cierra cada fase con:

```text
código consistente
+ pruebas
+ documentación
+ commit
```

y continúa.

No mezcles fases si puedes evitarlo.

No sacrifiques seguridad para mantener un fallback legacy.

No reescribas el frontend visual sin necesidad.

El objetivo es terminar el producto existente, no convertirlo en otro proyecto.
