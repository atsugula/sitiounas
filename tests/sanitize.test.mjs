// Tests de saneamiento de contenido (Fase 9).
//
//   npm run test:sanitize

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    escapeHtml,
    sanitizeImageUrl,
    sanitizeUserText,
    sanitizeDisplayName,
    sanitizeRating,
    buildReviewDocument,
    buildCommunityPostDocument
} from '../assets/js/sanitize.js';

const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('escapeHtml', () => {
    test('neutraliza las etiquetas', () => {
        assert.equal(escapeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
    });

    test('neutraliza comillas, que es lo que rompe un atributo', () => {
        assert.equal(escapeHtml('x" onerror="alert(1)'), 'x&quot; onerror=&quot;alert(1)');
        assert.equal(escapeHtml("x' onerror='alert(1)"), 'x&#039; onerror=&#039;alert(1)');
    });

    test('escapa el ampersand primero, sin doble escape cruzado', () => {
        assert.equal(escapeHtml('&lt;'), '&amp;lt;');
    });

    test('tolera null y undefined', () => {
        assert.equal(escapeHtml(null), '');
        assert.equal(escapeHtml(undefined), '');
    });
});

describe('sanitizeImageUrl', () => {
    test('acepta una imagen base64 real', () => {
        assert.equal(sanitizeImageUrl(PIXEL), PIXEL);
    });

    test('acepta https', () => {
        assert.equal(sanitizeImageUrl('https://i.ibb.co/abc/foto.jpg'), 'https://i.ibb.co/abc/foto.jpg');
    });

    // Este es el ataque concreto que existía: photoUrl se insertaba en
    // src="${...}" sin escapar, así que bastaba cerrar la comilla.
    test('rechaza el escape de atributo con onerror', () => {
        assert.equal(sanitizeImageUrl('x" onerror="alert(document.cookie)'), null);
        assert.equal(sanitizeImageUrl('https://ok.com/a.jpg" onerror="alert(1)'), null);
    });

    test('rechaza javascript: y vbscript:', () => {
        assert.equal(sanitizeImageUrl('javascript:alert(1)'), null);
        assert.equal(sanitizeImageUrl('JaVaScRiPt:alert(1)'), null);
        assert.equal(sanitizeImageUrl('vbscript:msgbox(1)'), null);
    });

    test('rechaza esquemas partidos con caracteres de control', () => {
        assert.equal(sanitizeImageUrl('java\u0000script:alert(1)'), null);
        assert.equal(sanitizeImageUrl('java\nscript:alert(1)'), null);
        assert.equal(sanitizeImageUrl('java\tscript:alert(1)'), null);
    });

    test('rechaza data: que no sea imagen', () => {
        assert.equal(sanitizeImageUrl('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=='), null);
        assert.equal(sanitizeImageUrl('data:application/javascript;base64,YWxlcnQoMSk='), null);
    });

    test('rechaza SVG embebido, que puede llevar script dentro', () => {
        assert.equal(sanitizeImageUrl('data:image/svg+xml;base64,PHN2Zz48c2NyaXB0PmFsZXJ0KDEpPC9zY3JpcHQ+PC9zdmc+'), null);
        assert.equal(sanitizeImageUrl('data:image/svg+xml,<svg onload="alert(1)"></svg>'), null);
    });

    test('rechaza http en claro', () => {
        assert.equal(sanitizeImageUrl('http://ejemplo.com/foto.jpg'), null);
    });

    test('rechaza rutas relativas y protocolo implícito', () => {
        assert.equal(sanitizeImageUrl('//evil.com/x.jpg'), null);
        assert.equal(sanitizeImageUrl('/local/x.jpg'), null);
        assert.equal(sanitizeImageUrl('foto.jpg'), null);
    });

    test('rechaza vacío y tipos que no son texto', () => {
        [null, undefined, '', '   ', 42, {}, []].forEach((value) => {
            assert.equal(sanitizeImageUrl(value), null, `deberia rechazar ${JSON.stringify(value)}`);
        });
    });
});

describe('sanitizeUserText', () => {
    test('recorta y limita la longitud', () => {
        assert.equal(sanitizeUserText('  hola  '), 'hola');
        assert.equal(sanitizeUserText('a'.repeat(5000)).length, 2000);
        assert.equal(sanitizeUserText('a'.repeat(500), 10).length, 10);
    });

    test('elimina caracteres de control pero conserva los saltos de línea', () => {
        assert.equal(sanitizeUserText('ho\u0000la'), 'hola');
        assert.equal(sanitizeUserText('linea1\nlinea2'), 'linea1\nlinea2');
    });

    test('no convierte a HTML: eso se hace al pintar', () => {
        assert.equal(sanitizeUserText('<b>hola</b>'), '<b>hola</b>');
    });

    test('el nombre visible se limita a 120', () => {
        assert.equal(sanitizeDisplayName('a'.repeat(300)).length, 120);
    });
});

describe('sanitizeRating', () => {
    test('acota al rango 1-5', () => {
        assert.equal(sanitizeRating(0), 1);
        assert.equal(sanitizeRating(-3), 1);
        assert.equal(sanitizeRating(9), 5);
        assert.equal(sanitizeRating(4), 4);
    });

    test('por defecto 5 ante basura', () => {
        assert.equal(sanitizeRating('muchas'), 5);
        assert.equal(sanitizeRating(null), 5);
    });

    test('trunca decimales', () => {
        assert.equal(sanitizeRating('3.9'), 3);
    });
});

describe('buildReviewDocument', () => {
    const base = {
        id: 'rev_1',
        name: 'Ana Pérez',
        service: 'Manicura semipermanente',
        rating: 5,
        comment: 'Quedaron preciosas',
        authorUid: 'cliente-a',
        salonId: 'nails-con-val',
        createdAt: '2026-08-01'
    };

    test('produce un documento con los campos que exigen las Rules', () => {
        const doc = buildReviewDocument(base);
        assert.equal(doc.authorUid, 'cliente-a');
        assert.equal(doc.salonId, 'nails-con-val');
        assert.equal(doc.rating, 5);
        assert.equal(doc.photoUrl, null);
    });

    test('exige autor: sin sesión no hay reseña', () => {
        assert.throws(() => buildReviewDocument({ ...base, authorUid: null }), /CONTENT_MISSING_AUTHOR/);
    });

    test('rechaza campos vacíos', () => {
        assert.throws(() => buildReviewDocument({ ...base, comment: '   ' }), /CONTENT_EMPTY_FIELDS/);
        assert.throws(() => buildReviewDocument({ ...base, name: '' }), /CONTENT_EMPTY_FIELDS/);
    });

    test('una foto maliciosa se convierte en null, no en un fallo silencioso', () => {
        const doc = buildReviewDocument({ ...base, photoUrl: 'x" onerror="alert(1)' });
        assert.equal(doc.photoUrl, null);
    });

    test('una foto legítima sobrevive', () => {
        assert.equal(buildReviewDocument({ ...base, photoUrl: PIXEL }).photoUrl, PIXEL);
    });

    test('acota la puntuación aunque llegue manipulada', () => {
        assert.equal(buildReviewDocument({ ...base, rating: 9999 }).rating, 5);
    });

    test('recorta un comentario desmedido', () => {
        assert.equal(buildReviewDocument({ ...base, comment: 'a'.repeat(9000) }).comment.length, 2000);
    });
});

describe('buildCommunityPostDocument', () => {
    const base = {
        id: 'post_1',
        name: 'Ana',
        message: 'Me encantó el diseño',
        authorUid: 'anon-1',
        salonId: 'nails-con-val',
        createdAt: '2026-08-01'
    };

    test('arranca siempre con cero me gusta', () => {
        assert.equal(buildCommunityPostDocument(base).likes, 0);
    });

    test('los me gusta no se pueden precargar', () => {
        assert.equal(buildCommunityPostDocument({ ...base, likes: 9999 }).likes, 0);
    });

    test('exige autor', () => {
        assert.throws(() => buildCommunityPostDocument({ ...base, authorUid: '' }), /CONTENT_MISSING_AUTHOR/);
    });

    test('el mensaje se sanea y se acota', () => {
        const doc = buildCommunityPostDocument({ ...base, message: '  hola\u0000 mundo  ' });
        assert.equal(doc.message, 'hola mundo');
    });

    test('una foto con javascript: se descarta', () => {
        assert.equal(buildCommunityPostDocument({ ...base, photoUrl: 'javascript:alert(1)' }).photoUrl, null);
    });
});
