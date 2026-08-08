// Saneamiento de contenido generado por usuarias (Fase 9).
//
// El muro de la comunidad y las reseñas son de escritura pública: lo que se
// guarde ahí acaba en el HTML de todas las visitantes. Si un valor entra sin
// sanear en un atributo, deja de ser contenido y pasa a ser código.
//
// Lógica pura, sin DOM, para poder probarla con `node --test`.

/** Caracteres de control: se usan para partir esquemas y romper atributos. */
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;
const CONTROL_CHARS_GLOBAL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Escapa texto para insertarlo como contenido o dentro de un atributo. */
export function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

const SAFE_DATA_IMAGE = /^data:image\/(png|jpe?g|gif|webp|avif);base64,[A-Za-z0-9+/]+=*$/i;

/**
 * Devuelve una URL de imagen segura, o `null` si no lo es.
 *
 * Solo se aceptan dos formas:
 *   - `data:image/<tipo>;base64,...` — lo que produce `FileReader` al subir
 *     una foto desde el móvil;
 *   - `https://...` — enlaces externos.
 *
 * Se rechaza todo lo demás, y en particular `javascript:`, `vbscript:`,
 * `data:text/html` y `data:image/svg+xml`. El SVG queda fuera a propósito: un
 * SVG puede contener `<script>`, así que como imagen remota es un vector de
 * ejecución.
 *
 * `http://` también se rechaza: el sitio va por HTTPS y una imagen en claro
 * rompería la página además de permitir manipulación en tránsito.
 */
export function sanitizeImageUrl(value) {
    if (typeof value !== 'string') return null;

    const trimmed = value.trim();
    if (!trimmed) return null;
    if (CONTROL_CHARS.test(trimmed)) return null;

    if (SAFE_DATA_IMAGE.test(trimmed)) return trimmed;

    if (/^https:\/\//i.test(trimmed)) {
        // Comillas, ángulos o backtick dentro de la URL solo sirven para
        // escapar del atributo donde se va a insertar.
        if (/["'<>`]/.test(trimmed)) return null;
        try {
            const url = new URL(trimmed);
            return url.protocol === 'https:' ? url.href : null;
        } catch {
            return null;
        }
    }

    return null;
}

/**
 * Normaliza un texto de usuaria: recorta, limita longitud y elimina
 * caracteres de control. No convierte a HTML: eso es trabajo de `escapeHtml`
 * en el momento de pintar.
 */
export function sanitizeUserText(value, maxLength = 2000) {
    return String(value === null || value === undefined ? '' : value)
        .replace(CONTROL_CHARS_GLOBAL, '')
        .trim()
        .slice(0, maxLength);
}

/** Nombre visible de una autora. */
export function sanitizeDisplayName(value, maxLength = 120) {
    return sanitizeUserText(value, maxLength);
}

/** Puntuación de reseña acotada al rango que aceptan las Rules. */
export function sanitizeRating(value) {
    const rating = parseInt(value, 10);
    if (!Number.isFinite(rating)) return 5;
    return Math.min(5, Math.max(1, rating));
}

/**
 * Construye el documento de una reseña, ya saneado y con los campos que
 * exigen las Rules (`authorUid`, `salonId`, `rating` entero).
 */
export function buildReviewDocument({ id, name, service, rating, comment, photoUrl, authorUid, salonId, createdAt }) {
    if (!authorUid) throw new Error('CONTENT_MISSING_AUTHOR');

    const safeName = sanitizeDisplayName(name);
    const safeService = sanitizeUserText(service, 120);
    const safeComment = sanitizeUserText(comment, 2000);

    if (!safeName || !safeService || !safeComment) throw new Error('CONTENT_EMPTY_FIELDS');

    return {
        id,
        authorUid,
        salonId,
        name: safeName,
        service: safeService,
        rating: sanitizeRating(rating),
        comment: safeComment,
        photoUrl: sanitizeImageUrl(photoUrl),
        createdAt
    };
}

/** Construye el documento de una publicación del muro, ya saneado. */
export function buildCommunityPostDocument({ id, name, message, photoUrl, authorUid, salonId, createdAt }) {
    if (!authorUid) throw new Error('CONTENT_MISSING_AUTHOR');

    const safeName = sanitizeDisplayName(name);
    const safeMessage = sanitizeUserText(message, 2000);

    if (!safeName || !safeMessage) throw new Error('CONTENT_EMPTY_FIELDS');

    return {
        id,
        authorUid,
        salonId,
        name: safeName,
        message: safeMessage,
        photoUrl: sanitizeImageUrl(photoUrl),
        likes: 0,
        createdAt
    };
}
