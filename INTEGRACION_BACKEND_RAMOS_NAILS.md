# Integración backend real — Ramos Nails

## Objetivo

Conectar el frontend terminado con el proyecto Firebase real y dejar operativos Firebase Authentication, Cloud Firestore, Security Rules, índices, reservas atómicas, usuarios/admin, fidelidad, settings, reviews/comunidad y Hosting.

**No se construye otro backend.** El backend objetivo ya es Firebase.

## Identificadores que NO se cambian

```text
Marca visible: Ramos Nails
Firebase projectId: nailsconval
salonId interno: nails-con-val
```

El rebranding no implica migrar Firebase ni `salonId`.

---

## Orden seguro obligatorio

```text
1. Preparar entorno local
2. Ejecutar tests actuales
3. Ejecutar tests de Firestore Rules
4. Confirmar proyecto Firebase real
5. Configurar Auth
6. Hacer backup de Firestore
7. Auditar datos reales
8. Migrar clientUid y bookingSlots legacy
9. Crear/verificar cuenta admin
10. Crear/verificar settings
11. Probar end-to-end contra Firebase real
12. Desplegar Rules
13. Desplegar índices
14. Repetir QA con Rules reales
15. Desplegar Hosting
```

No desplegar Rules antes de preparar los datos existentes.

---

# Fase A — Entorno y Rules

Desde PowerShell:

```powershell
cd "D:\trabajo\cloneWebSites\sitiounas"
git status
git branch --show-current
git log -10 --oneline
```

Verificar:

```powershell
node --version
npm --version
java -version
firebase --version
```

Recomendación: instalar JDK 21.

Si Firebase CLI no existe:

```powershell
npm install -g firebase-tools
firebase login
firebase projects:list
```

Instalar dependencias:

```powershell
npm install
npm test
npm run check
git diff --check
```

Después ejecutar obligatoriamente:

```powershell
npm run test:rules
```

El proyecto ya tiene unos 40 tests de Firestore Rules. Criterio de salida:

```text
0 failed
```

Si falla alguno, corregir Rules/fixtures y repetir. No desplegar hasta quedar verde.

Documento:

```text
CAMBIOS_INTEGRACION_BACKEND_FASE_A.md
```

Commit:

```text
chore: validate firebase backend integration locally
```

---

# Fase B — Conectar proyecto y auditar datos reales

Confirmar:

```powershell
firebase use
firebase projects:list
```

Proyecto esperado:

```text
nailsconval
```

No crear un proyecto nuevo por el rebranding.

## Authentication

En Firebase Console habilitar:

```text
Email/Password
Anonymous
```

Revisar también `Authorized domains` para localhost, Firebase Hosting y dominio personalizado si existe.

## Firestore

Antes de modificar datos reales: **backup obligatorio**.

Después auditar estas colecciones:

```text
users
appointments
bookingSlots
loyalty_transactions
reviews
community_posts
settings
```

Crear:

```text
AUDITORIA_FIREBASE_REAL.md
```

Debe incluir al menos:

- conteo por colección;
- `salonId` encontrados;
- citas futuras activas;
- citas sin `clientUid`;
- citas futuras sin locks;
- usuarios legacy;
- settings existentes;
- conflictos detectados.

---

# Fase C — Migración previa a Rules

Crear:

```text
tools/migrate-firebase-production.mjs
```

Debe soportar:

```text
--dry-run
--apply
```

## Reglas del migrador

- idempotente;
- no destructivo por defecto;
- sin secretos en código;
- no inventar UID;
- detenerse ante ambigüedades;
- reutilizar `assets/js/booking-slots.js` para generar locks;
- mantener `salonId = nails-con-val`;
- reportar conflictos sin sobrescribirlos.

## Migrar `clientUid`

Para citas sin propietario:

1. buscar coincidencia inequívoca en `users/{uid}`;
2. normalizar teléfono/email con la misma lógica de la app;
3. si hay cero o múltiples candidatos, reportar;
4. nunca elegir arbitrariamente.

## Migrar `bookingSlots`

Para cada cita activa futura, generar exactamente los locks de 30 minutos que usaría la app.

Ejemplo:

```text
14:00–16:00
→ 14:00
→ 14:30
→ 15:00
→ 15:30
```

Si dos citas históricas chocan, no sobrescribir. Reportar conflicto.

Ejecutar primero:

```powershell
node tools/migrate-firebase-production.mjs --dry-run
```

Solo con backup y dry-run limpio:

```powershell
node tools/migrate-firebase-production.mjs --apply
```

Después volver a ejecutar `--dry-run`; debería quedar sin operaciones pendientes salvo excepciones documentadas.

Documento:

```text
REPORTE_MIGRACION_FIREBASE.md
CAMBIOS_INTEGRACION_BACKEND_FASE_B.md
```

Commit:

```text
feat: migrate legacy firestore data for production rules
```

### Credenciales

Usar Admin SDK con credenciales locales fuera del repo. Nunca commitear service-account JSON, passwords, tokens ni secretos. Revisar `.gitignore` y `git diff --cached` antes de cada commit.

---

# Fase D — Cuenta admin y settings

Crear o identificar la cuenta real de administración en Firebase Auth.

Crear/verificar:

```text
users/{ADMIN_UID}
```

con estructura equivalente a:

```js
{
  uid: ADMIN_UID,
  salonId: "nails-con-val",
  name: "Administración Ramos Nails",
  email: "<correo real>",
  phone: "",
  birthdate: "",
  role: "admin",
  bookedCount: 0,
  createdAt: ...
}
```

Nunca guardar contraseña en Firestore.

Verificar/crear sin sobrescribir datos reales:

```text
settings/custom_services
settings/discount_settings
settings/schedule_blocks
settings/gallery_items
settings/marketing_popup
settings/payment_key
settings/income_goal
```

Confirmar especialmente la llave de pago real.

---

# Fase E — Pruebas contra Firebase real antes de Rules

## Cliente

Probar:

- registro;
- login;
- logout;
- recuperación de contraseña;
- edición de perfil.

## Reserva

Probar:

- disponibilidad;
- cita 30 min;
- cita 2 h;
- cita 3 h;
- múltiples servicios;
- transacción real;
- locks creados;
- dos navegadores intentando mismo turno;
- exactamente una reserva gana;
- cancelación libera locks.

## Admin

Probar:

- login;
- restauración de sesión;
- panel;
- cambio de estado;
- completar cita;
- fidelidad;
- settings;
- moderación de reviews/comunidad;
- logout.

Crear:

```text
CAMBIOS_INTEGRACION_BACKEND_FASE_C.md
```

Commit si hubo cambios locales:

```text
feat: connect Ramos Nails to production firebase backend
```

---

# Fase F — Desplegar Rules e índices

Antes de Rules:

```powershell
npm run test:rules
firebase use
```

Confirmar de nuevo que el proyecto es `nailsconval`.

Después:

```powershell
firebase deploy --only firestore:rules
```

Luego:

```powershell
firebase deploy --only firestore:indexes
```

Esperar a que los índices necesarios estén disponibles.

---

# Fase G — QA de seguridad con Rules reales

Probar cuatro actores:

```text
Público/anónimo
Cliente A
Cliente B
Admin
```

Cliente A NO debe poder:

- leer user B;
- leer citas de B;
- modificar `role`;
- modificar `bookedCount`;
- modificar settings;
- completar citas;
- escribir fidelidad como admin.

Anónimo NO debe poder:

- leer `users`;
- leer `appointments`;
- escribir settings.

Admin SÍ debe poder operar los recursos administrativos contemplados por el panel.

No considerar la integración terminada hasta probar esto contra el proyecto real.

---

# Fase H — Hosting

Antes:

```powershell
npm test
npm run check
git diff --check
```

Después:

```powershell
firebase deploy --only hosting
```

Abrir la URL publicada y repetir smoke tests.

Crear:

```text
CIERRE_INTEGRACION_BACKEND.md
```

Commit final:

```text
chore: complete Ramos Nails backend integration
```

---

# Checklist final

- [ ] JDK funcionando.
- [ ] Firebase CLI autenticado.
- [ ] Proyecto `nailsconval` confirmado.
- [ ] `npm test` verde.
- [ ] `npm run check` verde.
- [ ] Firestore Rules tests verdes.
- [ ] Backup Firestore realizado.
- [ ] Auditoría real completada.
- [ ] `clientUid` migrado.
- [ ] Locks migrados.
- [ ] Conflictos históricos resueltos/revisados.
- [ ] Email/Password habilitado.
- [ ] Anonymous habilitado.
- [ ] Authorized domains configurados.
- [ ] Cuenta admin real creada.
- [ ] `role: admin` confirmado.
- [ ] Settings reales cargados.
- [ ] Registro real probado.
- [ ] Login real probado.
- [ ] Reset password probado.
- [ ] Booking real probado.
- [ ] Concurrencia real probada.
- [ ] Cancelación real probada.
- [ ] Fidelidad real probada.
- [ ] Rules desplegadas.
- [ ] Índices desplegados.
- [ ] QA de seguridad post-Rules.
- [ ] Hosting desplegado.
- [ ] Rollback documentado.

---

# Fuera de alcance

No implementar en esta integración:

- bot de Telegram;
- Cloud Functions salvo nueva aprobación;
- multi-salón;
- cambio de `projectId`;
- cambio de `salonId`;
- backend Node propio;
- Supabase;
- cambio de framework.
