# Prompt maestro — Integración Firebase real de Ramos Nails

Actúa como ingeniero senior responsable de conectar Ramos Nails con su Firebase real sin romper las Fases 1–12 ni el rebranding.

Repositorio esperado:

```text
D:\trabajo\cloneWebSites\sitiounas
```

## Contexto obligatorio

Lee antes de modificar:

```text
RESUMEN_FINAL_PROYECTO.md
CAMBIOS_REBRANDING_RAMOS_NAILS.md
CIERRE_PROYECTO_FASE_12.md
CAMBIOS_FIRESTORE_FASE_3.md
CAMBIOS_PERSISTENCIA_FASE_4.md
CAMBIOS_RESERVAS_FASE_5.md
CAMBIOS_ADMIN_FASE_6.md
CAMBIOS_FIDELIDAD_FASE_7.md
CAMBIOS_USUARIOS_FASE_8.md
CAMBIOS_CONTENIDO_FASE_9.md
firestore.rules
firestore.indexes.json
firebase.json
.firebaserc
package.json
assets/js/firebase.js
assets/js/booking-slots.js
index.html
```

Mantén:

```text
Marca visible = Ramos Nails
projectId = nailsconval
salonId = nails-con-val
```

NO implementes Telegram.

---

## 1. Precheck Git

```bash
git status
git branch --show-current
git log -10 --oneline
git diff --check
```

No borres cambios del usuario. No uses `reset --hard`, `clean -fd` ni force push.

---

## 2. Entorno

Comprobar:

```bash
node --version
npm --version
java -version
firebase --version
```

Preferir JDK 21 para el emulador.

Si Java falta, continúa con auditoría independiente y marca el test de Rules como `BLOQUEO EXTERNO`.

---

## 3. Baseline

Ejecutar:

```bash
npm install
npm test
npm run check
git diff --check
```

No continuar con migración si hay regresiones.

---

## 4. Rules

Ejecutar:

```bash
npm run test:rules
```

No afirmar que funcionan si no se ejecutaron.

Corregir hasta 0 fallos.

Crear:

```text
CAMBIOS_INTEGRACION_BACKEND_FASE_A.md
```

Commit:

```text
chore: validate firebase backend integration locally
```

---

## 5. Proyecto real

Ejecutar:

```bash
firebase projects:list
firebase use
```

Proyecto esperado: `nailsconval`.

Si no hay login Firebase CLI, marcar `BLOQUEO EXTERNO: firebase login`.

Nunca crear otro proyecto solo por el nombre Ramos Nails.

---

## 6. Auth remoto

Verificar en Firebase Console:

```text
Email/Password habilitado
Anonymous habilitado
Authorized Domains correctos
```

Si no tienes acceso, documentar pasos y no deformar el código para evitar la configuración remota.

---

## 7. Auditoría Firestore real

Antes de escribir, inspeccionar:

```text
users
appointments
bookingSlots
loyalty_transactions
reviews
community_posts
settings
```

Crear `AUDITORIA_FIREBASE_REAL.md` con conteos, `salonId`, citas sin `clientUid`, citas futuras sin locks, users legacy, settings y conflictos.

No escribir durante esta auditoría.

---

## 8. Backup obligatorio

Antes de migrar, exigir backup/export.

Si no existe permiso para hacerlo, no ejecutar la parte destructiva. Marcar `BLOQUEO EXTERNO`.

---

## 9. Migrador

Crear:

```text
tools/migrate-firebase-production.mjs
```

Con:

```text
--dry-run
--apply
```

Requisitos:

- idempotente;
- seguro por defecto;
- sin credenciales en código;
- no inventar UID;
- abortar ambigüedades;
- importar/reutilizar `assets/js/booking-slots.js`;
- mantener `salonId = nails-con-val`;
- no sobrescribir locks en conflicto.

### clientUid

Resolver solo coincidencias inequívocas entre appointment y user.

### locks

Crear locks para citas activas futuras usando exactamente la aritmética existente.

Si dos citas históricas chocan, reportar y no resolver automáticamente.

Ejecutar:

```bash
node tools/migrate-firebase-production.mjs --dry-run
```

Solo con backup + dry-run limpio:

```bash
node tools/migrate-firebase-production.mjs --apply
node tools/migrate-firebase-production.mjs --dry-run
```

El segundo dry-run debe demostrar idempotencia.

Crear:

```text
REPORTE_MIGRACION_FIREBASE.md
CAMBIOS_INTEGRACION_BACKEND_FASE_B.md
```

Commit:

```text
feat: migrate legacy firestore data for production rules
```

Nunca commitear service-account JSON ni secretos.

---

## 10. Admin real

Crear/identificar cuenta Firebase Auth real y verificar `users/{uid}` con:

```text
uid = auth uid
salonId = nails-con-val
role = admin
```

Nunca password en Firestore.

Probar login, panel, reload y logout.

---

## 11. Settings

Verificar sin sobrescribir innecesariamente:

```text
settings/custom_services
settings/discount_settings
settings/schedule_blocks
settings/gallery_items
settings/marketing_popup
settings/payment_key
settings/income_goal
```

Confirmar llave de pago real.

---

## 12. E2E Firebase real antes de Rules

Probar realmente:

### Cliente
- registro
- login
- logout
- reset password
- editar perfil

### Booking
- disponibilidad
- cita 2 h
- cita 3 h
- multiservicio
- locks
- dos navegadores mismo turno: solo uno gana
- cancelación libera locks

### Admin
- login
- citas
- estados
- completar
- fidelidad
- settings
- moderación

Crear `CAMBIOS_INTEGRACION_BACKEND_FASE_C.md`.

---

## 13. Deploy Rules

Solo con Rules tests verdes y migración revisada:

```bash
firebase use
firebase deploy --only firestore:rules
```

Confirmar proyecto antes de ejecutar.

---

## 14. Deploy índices

```bash
firebase deploy --only firestore:indexes
```

Verificar que los índices requeridos terminen de construirse.

---

## 15. QA de seguridad con Rules reales

Probar como:

```text
Anónimo
Cliente A
Cliente B
Admin
```

Cliente A no puede leer/modificar recursos de B ni cambiar `role`, `bookedCount`, settings o fidelidad admin.

Anónimo no puede leer `users` ni `appointments`.

Admin debe seguir operando el panel.

No inventar resultados.

---

## 16. Hosting

Solo después del QA:

```bash
npm test
npm run check
git diff --check
firebase deploy --only hosting
```

Abrir la URL real y repetir smoke test.

---

## 17. Cierre

Crear:

```text
CIERRE_INTEGRACION_BACKEND.md
```

Incluye:

- proyecto conectado;
- providers Auth;
- backup;
- auditoría;
- migración;
- admin;
- settings;
- Rules tests;
- E2E;
- deploy Rules;
- deploy índices;
- deploy Hosting;
- URLs;
- commits;
- bloqueos;
- rollback.

No declarar `BACKEND FUNCIONANDO EN PRODUCCIÓN` si Auth + Firestore + Rules reales no fueron probados.

Commit final:

```text
chore: complete Ramos Nails backend integration
```

---

## Seguridad absoluta

NO:

- cambiar `salonId`;
- cambiar projectId;
- crear proyecto Firebase nuevo;
- usar Rules permisivas para salir del paso;
- guardar secrets en Git;
- hardcodear passwords;
- inventar UID;
- ignorar conflictos de locks;
- reintroducir localStorage como source of truth;
- implementar Telegram.

Cuando falten credenciales, Console, backup o permisos de deploy, marca `BLOQUEO EXTERNO`, continúa con lo independiente y deja el repo consistente.
