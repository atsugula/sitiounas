# Fase A — Validación local previa a la integración con Firebase real

Fecha de ejecución: 2026-08-08
Rama: `mejora-v2`
Commit base: `7324395 feat: rebrand site to Ramos Nails`

Marca visible: **Ramos Nails**
`projectId`: `nailsconval`
`salonId`: `nails-con-val`

Ninguno de los tres se ha modificado en esta fase.

---

## 1. Precheck Git

```text
git status            → limpio salvo dos ficheros del usuario sin seguimiento:
                        INTEGRACION_BACKEND_RAMOS_NAILS.md
                        PROMPT_AGENTE_INTEGRACION_FIREBASE_RAMOS_NAILS.md
                        (NO se han tocado, movido ni commiteado)
git branch --show-current → mejora-v2
git diff --check      → sin conflictos ni espacios en blanco erróneos
```

No se ha usado `reset --hard`, `clean -fd` ni `push --force`.

---

## 2. Entorno

| Herramienta | Resultado | Estado |
| --- | --- | --- |
| `node --version` | `v22.23.1` | OK |
| `npm --version` | `10.9.8` | OK |
| `java -version` | `command not found` | **BLOQUEO EXTERNO** |
| `firebase --version` | no está en PATH global; sí como binario local del proyecto (`node_modules/.bin/firebase`, `13.35.1`) | OK vía `npx` |

Se ha buscado un JDK instalado en las rutas habituales de Windows
(`C:\Program Files\Java`, `Eclipse Adoptium`, `Microsoft\jdk*`, `Amazon Corretto`,
`C:\Program Files (x86)\Java`) y en `JAVA_HOME`: **no hay ninguna JVM en la máquina**.

### BLOQUEO EXTERNO 1 — Java ausente

El emulador de Firestore es un binario Java. Sin JVM no se puede levantar y, por
tanto, **no se ha podido ejecutar `npm run test:rules`**.

Salida real obtenida:

```text
!  emulators: You are not currently authenticated so some features may not work correctly.
i  emulators: Shutting down emulators.
Error: Could not spawn `java -version`. Please make sure Java is installed and on your system PATH.
```

Acción requerida por el usuario (preferible JDK 21):

```bash
winget install EclipseAdoptium.Temurin.21.JDK
```

Después, en una terminal nueva:

```bash
npx firebase emulators:exec --only firestore "node --test tests/firestore.rules.test.mjs"
```

**No se afirma que las Rules funcionen.** El fichero `tests/firestore.rules.test.mjs`
existe y está referenciado por `npm run test:rules`, pero su resultado sigue siendo
desconocido hasta que exista una JVM. El despliegue de Rules (paso 13 del plan)
queda bloqueado por esta misma causa.

---

## 3. Baseline

Ejecutado y verde:

```text
npm install   → OK
npm test      → # tests 137  # suites 30  # pass 137  # fail 0
npm run check → 4 bloque(s) inline revisados en index.html, 0 con error
git diff --check → limpio
```

No hay regresiones respecto a las Fases 1–12 ni al rebranding. El baseline permite
continuar.

Detalle de la suite `npm test` (lógica pura, sin red ni Firestore):

- `tests/booking-slots.test.mjs` — aritmética de locks de 30 minutos
- `tests/loyalty.test.mjs` — fidelidad auditable
- `tests/sanitize.test.mjs` — saneado de entrada
- `tests/time.test.mjs` — parseo y formateo horario
- `tests/availability.test.mjs` — disponibilidad

---

## 4. Rules

**Estado: BLOQUEO EXTERNO (Java).** Ver punto 2.

`firestore.rules` no se ha modificado en esta fase. Su contenido sigue siendo el
cerrado en la Fase 12: `salonId()` fijo en `nails-con-val`, `isAdmin()` basado en
`users/{uid}.role == 'admin'`, `users` sin lectura pública, `appointments` con
ownership por `clientUid`, `bookingSlots` de lectura pública sin PII, y
denegación por defecto en `match /{document=**}`.

No se han introducido Rules permisivas de ningún tipo para "salir del paso".

---

## 5. Conexión con el proyecto real

**Estado: BLOQUEO EXTERNO 2 — Firebase CLI sin sesión.**

Salida real:

```text
$ npx firebase projects:list
Error: Failed to authenticate, have you run firebase login?

$ npx firebase use
Error: Failed to authenticate, have you run firebase login?
```

`.firebaserc` ya apunta al proyecto correcto y **no se ha modificado**:

```json
{ "projects": { "default": "nailsconval" } }
```

No se ha creado ni se creará ningún proyecto Firebase nuevo. Acción requerida por
el usuario:

```bash
npx firebase login
```

---

## Resumen de bloqueos de la Fase A

| # | Bloqueo | Impacto | Desbloquea |
| --- | --- | --- | --- |
| 1 | No hay JDK instalado | Sin `test:rules`, sin despliegue de Rules verificado | `winget install EclipseAdoptium.Temurin.21.JDK` |
| 2 | Firebase CLI sin sesión | Sin auditoría real, sin backup, sin migración, sin deploy | `npx firebase login` |

Ambos bloqueos son de credenciales/entorno del usuario y **no se han sorteado
deformando el código**. El repositorio queda consistente y con el baseline verde.

## Siguiente paso

Fase B: migrador `tools/migrate-firebase-production.mjs` (`--dry-run` / `--apply`),
que se puede escribir y revisar sin credenciales, pero **no ejecutar** contra
producción hasta resolver el bloqueo 2 y disponer de backup.
