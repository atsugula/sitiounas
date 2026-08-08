# REBRANDING COMPLETO — RAMOS NAILS

## Objetivo

Rebrandear por completo el proyecto actual desde la marca anterior hacia:

# Ramos Nails

El resultado debe verse elegante, femenino, moderno, premium y limpio, sin cambiar la arquitectura ni romper las fases técnicas ya cerradas.

## Dirección visual

Marca objetivo:

- Nombre: **Ramos Nails**
- Personalidad: elegante, delicada, premium, femenina, moderna.
- Sensación: salón boutique de uñas, cuidado personal y confianza.
- Evitar: estética infantil, colores neón excesivos, saturación, iconos genéricos de esmalte por todas partes.

Paleta recomendada:

- Marfil / crema como fondo principal.
- Rosa empolvado como acento.
- Vino / borgoña suave para contraste.
- Champagne / dorado tenue para detalles.
- Negro cálido / carbón para textos.

Tipografía:
- Mantener las fuentes actuales si ya funcionan bien.
- Si la marca usa una serif decorativa en títulos, combinarla con una sans limpia para textos.
- No introducir fuentes nuevas si empeora carga o CSP.

---

# PROMPT PARA EL AGENTE

Trabaja en el repositorio actual de Ramos Nails, que anteriormente estaba identificado como NailsConVal.

Antes de modificar:

```bash
git status
git branch --show-current
git log -5 --oneline
```

Lee:

- `RESUMEN_FINAL_PROYECTO.md`
- `CAMBIOS_SEGURIDAD_FASE_2.md`
- `CAMBIOS_FIRESTORE_FASE_3.md`
- `CAMBIOS_PERSISTENCIA_FASE_4.md`
- `CAMBIOS_RESERVAS_FASE_5.md`
- `CAMBIOS_ADMIN_FASE_6.md`
- `CAMBIOS_FIDELIDAD_FASE_7.md`
- `CAMBIOS_USUARIOS_FASE_8.md`
- `CAMBIOS_CONTENIDO_FASE_9.md`
- `CAMBIOS_UX_PERFORMANCE_FASE_10.md`
- `CAMBIOS_MODULARIZACION_FASE_11.md`
- `index.html`

No reescribas ninguna fase técnica.

NO cambies:
- booking atómico;
- Firestore Rules salvo que sea estrictamente necesario por una migración de `salonId`;
- autenticación;
- fidelidad;
- esquema de citas;
- permisos admin;
- lógica de disponibilidad;
- sanitización;
- tests existentes;
- arquitectura;
- Firebase projectId;
- `.firebaserc`;
- `firebaseConfig`;
- colecciones Firestore;
- índices;
- proveedores Auth.

El objetivo de este commit es principalmente **BRANDING**.

---

## 1. BÚSQUEDA GLOBAL OBLIGATORIA

Busca en TODO el repositorio, incluyendo HTML, JS, JSON, Markdown y configuración:

```text
NailsConVal
Nails Con Val
Nails con Val
nailsconval
nails-con-val
NAILSCONVAL
admin@nailsconval.com
logo.jpg
```

También busca variaciones visuales o textos que claramente correspondan a la marca anterior.

Genera primero un inventario interno de coincidencias.

Clasifica cada coincidencia como:

```text
A. BRANDING VISIBLE
B. IDENTIFICADOR TÉCNICO
C. DOCUMENTACIÓN HISTÓRICA
D. CONFIGURACIÓN EXTERNA
```

No hagas reemplazo ciego global.

---

## 2. NOMBRE DE MARCA

Todo texto visible para visitantes o administradora debe pasar a:

```text
Ramos Nails
```

Revisar como mínimo:

- navbar;
- hero;
- título principal;
- footer;
- modales;
- login;
- registro;
- perfil;
- panel admin;
- tarjeta de fidelidad;
- agenda;
- confirmaciones;
- mensajes de error;
- WhatsApp;
- popup;
- CSV/exportaciones si llevan nombre de negocio;
- textos de IA/FAQ si contienen la marca;
- título del navegador;
- metadatos.

---

## 3. SEO Y METADATOS

Actualizar:

```html
<title>
<meta name="description">
<meta property="og:title">
<meta property="og:description">
<meta property="og:image">
<meta name="twitter:title">
<meta name="twitter:description">
```

Si existen.

Nombre sugerido:

```text
Ramos Nails | Uñas, Diseño y Cuidado
```

Descripción sugerida:

```text
Ramos Nails: diseños de uñas, manicure y cuidado profesional con reserva de citas en línea.
```

No inventar ciudad, dirección ni servicios no existentes.

---

## 4. LOGO

Reemplazar el logo anterior por una identidad de Ramos Nails.

Preferencia visual:

```text
RAMOS
NAILS
```

o:

```text
RN
Ramos Nails
```

Estilo:
- minimalista;
- editorial;
- elegante;
- sin clipart;
- fondo transparente cuando sea posible;
- legible tanto en escritorio como móvil.

Si el repositorio ya contiene un nuevo logo suministrado por el usuario:
usar ese archivo.

Si NO existe un logo nuevo:
NO inventar un PNG de baja calidad.
Crear temporalmente un logo tipográfico limpio mediante HTML/CSS o SVG propio simple, y documentar que puede sustituirse por el logo final más adelante.

Nombre recomendado de asset:

```text
assets/brand/ramos-nails-logo.svg
```

Actualizar:
- navbar;
- footer;
- favicon si existe;
- alt;
- accesibilidad;
- cualquier modal donde aparezca.

Eliminar referencias visibles al logo anterior.

---

## 5. HERO / IMAGEN PRINCIPAL

Cambiar la imagen principal antigua por una imagen coherente con Ramos Nails.

Dirección visual:

- manicure profesional;
- manos cuidadas;
- composición limpia;
- luz suave;
- tonos crema / rosa / vino;
- estética boutique;
- espacio negativo suficiente para que el texto siga siendo legible;
- evitar imágenes con texto incrustado;
- evitar stock excesivamente artificial.

Si ya existe una imagen nueva proporcionada por el usuario:
usar esa.

Si no:
dejar el código preparado para:

```text
assets/brand/ramos-nails-hero.webp
```

y mantener un fallback funcional hasta que el asset final exista.

NO usar una URL externa inestable como única imagen principal si puede evitarse.

Actualizar alt a algo descriptivo y neutral.

---

## 6. PALETA Y ACABADO VISUAL

Sin rediseñar toda la página, hacer un refinamiento de marca.

Objetivo:
que el sitio se sienta claramente Ramos Nails y no una plantilla con nombre cambiado.

Revisar:

- color del CTA principal;
- fondos de secciones;
- bordes;
- hover;
- badges;
- tarjetas;
- hero;
- botones;
- tarjeta de fidelidad;
- encabezados.

Mantener contraste accesible.

No cambiar lógica ni estructura.

Preferir variables CSS / tokens existentes en vez de reemplazar cientos de clases manualmente.

Si actualmente existen colores repetidos, crear variables CSS centrales como:

```css
--brand-ivory
--brand-blush
--brand-wine
--brand-champagne
--brand-ink
```

solo si puede hacerse con un diff razonable.

---

## 7. WHATSAPP Y MENSAJES

Buscar mensajes generados para WhatsApp.

Cambiar cualquier saludo o firma de la marca anterior por:

```text
Ramos Nails
```

No modificar:
- número de WhatsApp;
- llave de pago;
- precios;
- horarios;
- duración;
- formato de reserva;

salvo que estén hardcodeados únicamente como branding antiguo.

---

## 8. PANEL ADMIN

Actualizar visualmente:

```text
Panel Administrativo — Ramos Nails
```

o equivalente coherente.

No tocar la autorización.

No cambiar:
- `checkFirebaseAdminRole`;
- Auth;
- Rules;
- listeners;
- funciones de negocio.

---

## 9. EMAIL ADMIN

Si `admin@nailsconval.com` aparece únicamente como:

- placeholder;
- texto informativo;
- ejemplo;

cambiarlo por un valor neutral como:

```text
admin@ramosnails.com
```

PERO:

si ese correo corresponde a una cuenta Firebase real o una lógica externa:
NO cambiarlo silenciosamente.

Documentar:

```text
BLOQUEO EXTERNO: actualizar correo de cuenta admin en Firebase Auth.
```

Nunca asumir que cambiar un string local cambia el correo real de Firebase.

---

## 10. SALON ID — MUY IMPORTANTE

Actualmente el sistema utiliza:

```text
salonId = "nails-con-val"
```

y este valor puede existir en:

- users;
- appointments;
- bookingSlots;
- loyalty_transactions;
- reviews;
- community_posts;
- settings;
- Rules;
- tests;
- IDs deterministas de locks.

NO hacer:

```text
nails-con-val -> ramos-nails
```

con búsqueda/reemplazo ciego.

### Estrategia

Primero determinar si existe información real en Firebase con el salonId antiguo.

Si NO existe información real y el proyecto todavía no fue desplegado:
se permite migrar técnicamente a:

```text
ramos-nails
```

pero debes:

1. actualizar constante central;
2. actualizar Rules;
3. actualizar tests;
4. actualizar IDs de fixtures;
5. ejecutar toda la suite;
6. documentarlo.

Si EXISTEN datos reales o no puedes comprobarlo:

MANTENER temporalmente:

```text
salonId = "nails-con-val"
```

como identificador interno legacy.

Visualmente todo debe decir Ramos Nails.

Documentar:

```text
IDENTIFICADOR LEGACY CONSERVADO:
"nails-con-val" permanece como salonId interno para no romper datos existentes.
```

Preparar, si es útil, un plan separado de migración de salonId.

NO ejecutar migración destructiva sin backup y acceso administrativo.

---

## 11. FIREBASE PROJECT ID

NO cambiar:

```text
firebase projectId
.firebaserc
firebaseConfig
```

solo por rebranding.

El nombre comercial y el projectId de Firebase NO necesitan coincidir.

Si se quiere otro proyecto Firebase, eso es una migración separada.

---

## 12. LOCALSTORAGE Y KEYS

NO renombrar automáticamente claves `ncv_*`.

Aunque tengan prefijo de la marca vieja, hoy forman parte de compatibilidad/cache.

Renombrarlas generaría pérdida de cache y posibles regresiones.

En este rebranding:

- pueden quedarse;
- deben considerarse identificadores técnicos legacy;
- documentar su existencia.

Si se desea renombrarlas, hacerlo después con estrategia de:

```text
leer key vieja
→ migrar a key nueva
→ conservar fallback temporal
→ retirar antigua en versión posterior
```

NO hacerlo dentro de este commit salvo que sea estrictamente necesario.

---

## 13. DOCUMENTACIÓN

No reescribir los documentos históricos para fingir que siempre se llamó Ramos Nails.

Los documentos de Fases 1–12 son historial técnico.

Conservar referencias antiguas cuando describen el estado de ese momento.

Solo actualizar:
- documentos de uso actual;
- README si existe;
- instrucciones de ejecución visibles;
- documentación que describa el estado presente.

Crear:

```text
CAMBIOS_REBRANDING_RAMOS_NAILS.md
```

Debe contener:

```markdown
# Rebranding — Ramos Nails

## Objetivo

## Archivos modificados

## Referencias visibles reemplazadas

## Logo

## Hero

## Paleta / acabado visual

## SEO y metadata

## WhatsApp y textos

## Referencias técnicas legacy conservadas

## salonId

## Firebase projectId

## localStorage legacy

## Tests ejecutados

## Verificación visual

## Riesgos

## Cosas deliberadamente no modificadas

## Commit
```

---

## 14. TESTS

Ejecutar:

```bash
npm test
npm run check
git diff --check
```

No aceptar regresiones.

Verificar además en navegador:

- desktop;
- 375px móvil;
- navbar;
- hero;
- logo;
- CTA;
- agenda;
- login;
- registro;
- perfil;
- fidelidad;
- reviews;
- comunidad;
- footer;
- panel admin.

Comprobar consola.

No afirmar revisión visual si no se abrió realmente la página.

---

## 15. BARRIDO FINAL DE MARCA

Antes del commit, repetir búsqueda global.

La búsqueda de:

```text
NailsConVal
Nails Con Val
nailsconval
```

debe devolver solo:

- documentación histórica;
- identificadores técnicos legacy deliberadamente conservados;
- configuración externa que no puede cambiarse sin migración.

Cada coincidencia restante debe estar documentada.

Todo texto visible debe decir Ramos Nails.

---

## 16. COMMIT

Cuando termine y solo cuando:

- tests estén verdes;
- `npm run check` pase;
- `git diff --check` pase;
- no haya regresión visual;
- exista `CAMBIOS_REBRANDING_RAMOS_NAILS.md`;

hacer:

```bash
git add .
git commit -m "feat: rebrand site to Ramos Nails"
```

No mezclar con otro feature.

---

## 17. ENTREGA

Al final reportar:

```text
1. commit hash
2. archivos modificados
3. referencias antiguas que quedaron y por qué
4. logo utilizado
5. hero utilizado
6. tests
7. cualquier bloqueo externo
```

Si faltan los assets definitivos de logo o hero, no ocultarlo.

No inventar que fueron generados si no existen.

---

## REGLA FINAL

Este trabajo es:

```text
REBRANDING
```

No es:

```text
migración Firebase
reescritura del sistema
nueva fase de seguridad
cambio de backend
bot de Telegram
```

El bot de Telegram sigue fuera de alcance.

El objetivo es que una clienta vea una marca coherente y bonita llamada:

# Ramos Nails

sin romper todo lo que ya quedó estable en las Fases 1–12.
