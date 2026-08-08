// Tests del planificador de la migración a producción.
//
// El migrador no se puede ejecutar contra Firestore real sin credenciales, así
// que la única forma honesta de saber si hace lo correcto es probar su lógica
// pura con snapshots sintéticos: qué decide tocar, qué decide no tocar, y que
// una segunda pasada sobre el estado ya migrado no proponga nada.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    buildPlan,
    audit,
    normalizePhone,
    appointmentStartDate,
    SALON_ID
} from '../tools/migrate-firebase-production.mjs';

const NOW = new Date(2026, 7, 8, 10, 0, 0); // 2026-08-08 10:00 local
const FUTURE_ISO = '2026-09-01';
const PAST_ISO = '2026-07-01';

function emptySnapshot(overrides = {}) {
    return {
        users: [],
        appointments: [],
        bookingSlots: [],
        loyalty_transactions: [],
        reviews: [],
        community_posts: [],
        settings: {},
        ...overrides
    };
}

function user(id, extra = {}) {
    return { id, data: { uid: id, salonId: SALON_ID, role: 'client', bookedCount: 0, ...extra } };
}

function appointment(id, extra = {}) {
    return {
        id,
        data: {
            id,
            salonId: SALON_ID,
            appointmentDateIso: FUTURE_ISO,
            dateKey: 'Tue Sep 01 2026',
            startTime: '14:00',
            endTime: '16:00',
            durationMinutes: 120,
            status: 'confirmada',
            serviceIds: ['s1'],
            name: 'Clienta',
            phone: '600112233',
            ...extra
        }
    };
}

function lock(slotId, appointmentId, extra = {}) {
    const [, dateIso, startTime] = slotId.match(/^(.+)_(\d{4}-\d{2}-\d{2})_(\d{2}:\d{2})$/).slice(0);
    return {
        id: slotId,
        data: {
            salonId: SALON_ID,
            dateKey: '',
            dateIso: slotId.match(/_(\d{4}-\d{2}-\d{2})_/)[1],
            startTime: slotId.slice(-5),
            appointmentId,
            ...extra
        }
    };
}

describe('normalizePhone', () => {
    test('compara el mismo número escrito de formas distintas', () => {
        assert.equal(normalizePhone('+34 600 11 22 33'), normalizePhone('600112233'));
    });

    test('descarta basura demasiado corta', () => {
        assert.equal(normalizePhone('123'), null);
        assert.equal(normalizePhone(''), null);
        assert.equal(normalizePhone(null), null);
    });
});

describe('appointmentStartDate', () => {
    test('lee fecha ISO + hora 24h', () => {
        const date = appointmentStartDate({ appointmentDateIso: '2026-09-01', startTime: '14:30' });
        assert.equal(date.getFullYear(), 2026);
        assert.equal(date.getMonth(), 8);
        assert.equal(date.getDate(), 1);
        assert.equal(date.getHours(), 14);
        assert.equal(date.getMinutes(), 30);
    });

    test('acepta el formato 12h de las citas antiguas', () => {
        const date = appointmentStartDate({ appointmentDateIso: '2026-09-01', time: '02:30 PM' });
        assert.equal(date.getHours(), 14);
    });

    test('devuelve null si la fecha no es legible', () => {
        assert.equal(appointmentStartDate({ appointmentDateIso: 'ayer', startTime: '14:00' }), null);
        assert.equal(appointmentStartDate({ appointmentDateIso: '2026-09-01', startTime: 'tarde' }), null);
    });
});

describe('salonId', () => {
    test('rellena salonId solo cuando falta', () => {
        const snapshot = emptySnapshot({
            users: [user('u1', { salonId: undefined })],
            appointments: [appointment('a1', { salonId: undefined })]
        });

        const plan = buildPlan(snapshot, NOW);
        const sets = plan.actions.filter((a) => a.kind === 'SET_SALON_ID');

        assert.equal(sets.length, 2);
        assert.ok(sets.every((a) => a.value === SALON_ID));
    });

    test('nunca pisa un salonId distinto: lo reporta como conflicto', () => {
        const snapshot = emptySnapshot({ users: [user('u1', { salonId: 'otro-salon' })] });
        const plan = buildPlan(snapshot, NOW);

        assert.equal(plan.actions.filter((a) => a.kind === 'SET_SALON_ID').length, 0);
        assert.equal(plan.conflicts.filter((c) => c.type === 'SALON_ID_DISTINTO').length, 1);
    });
});

describe('clientUid', () => {
    test('resuelve una coincidencia inequívoca por teléfono', () => {
        const snapshot = emptySnapshot({
            users: [user('uid-ana', { phone: '+34 600 11 22 33' })],
            appointments: [appointment('a1', { phone: '600112233', clientUid: null })]
        });

        const plan = buildPlan(snapshot, NOW);
        const set = plan.actions.find((a) => a.kind === 'SET_CLIENT_UID');

        assert.equal(set.id, 'a1');
        assert.equal(set.value, 'uid-ana');
    });

    test('aborta si dos usuarias comparten el teléfono', () => {
        const snapshot = emptySnapshot({
            users: [user('uid-ana', { phone: '600112233' }), user('uid-eva', { phone: '600112233' })],
            appointments: [appointment('a1', { phone: '600112233' })]
        });

        const plan = buildPlan(snapshot, NOW);

        assert.equal(plan.actions.filter((a) => a.kind === 'SET_CLIENT_UID').length, 0);
        assert.equal(plan.skipped.find((s) => s.id === 'a1').reason, 'COINCIDENCIA_AMBIGUA');
    });

    test('no inventa uid si no hay usuaria que coincida', () => {
        const snapshot = emptySnapshot({
            users: [user('uid-ana', { phone: '600999888' })],
            appointments: [appointment('a1', { phone: '600112233' })]
        });

        const plan = buildPlan(snapshot, NOW);

        assert.equal(plan.actions.filter((a) => a.kind === 'SET_CLIENT_UID').length, 0);
        assert.equal(plan.skipped.find((s) => s.id === 'a1').reason, 'SIN_USUARIO_COINCIDENTE');
    });

    test('ignora usuarios legacy cuyo id no es un uid de Auth', () => {
        const legacy = { id: '600112233', data: { salonId: SALON_ID, phone: '600112233', name: 'Ana' } };
        const snapshot = emptySnapshot({
            users: [legacy],
            appointments: [appointment('a1', { phone: '600112233' })]
        });

        const plan = buildPlan(snapshot, NOW);

        assert.equal(plan.actions.filter((a) => a.kind === 'SET_CLIENT_UID').length, 0);
        assert.equal(plan.skipped.find((s) => s.id === 'a1').reason, 'SIN_USUARIO_COINCIDENTE');
    });

    test('no toca una cita que ya tiene clientUid', () => {
        const snapshot = emptySnapshot({
            users: [user('uid-ana', { phone: '600112233' })],
            appointments: [appointment('a1', { clientUid: 'uid-otro' })]
        });

        const plan = buildPlan(snapshot, NOW);
        assert.equal(plan.actions.filter((a) => a.kind === 'SET_CLIENT_UID').length, 0);
    });
});

describe('locks', () => {
    test('una cita de 2 h futura pide exactamente 4 locks', () => {
        const snapshot = emptySnapshot({ appointments: [appointment('a1')] });
        const locks = buildPlan(snapshot, NOW).actions.filter((a) => a.kind === 'CREATE_SLOT_LOCK');

        assert.deepEqual(locks.map((l) => l.id), [
            `${SALON_ID}_${FUTURE_ISO}_14:00`,
            `${SALON_ID}_${FUTURE_ISO}_14:30`,
            `${SALON_ID}_${FUTURE_ISO}_15:00`,
            `${SALON_ID}_${FUTURE_ISO}_15:30`
        ]);
    });

    test('una cita de 3 h pide 6 locks', () => {
        const snapshot = emptySnapshot({
            appointments: [appointment('a1', { durationMinutes: 180, endTime: '17:00' })]
        });
        const locks = buildPlan(snapshot, NOW).actions.filter((a) => a.kind === 'CREATE_SLOT_LOCK');
        assert.equal(locks.length, 6);
    });

    test('el lock creado tiene exactamente la forma que aceptan las Rules', () => {
        const snapshot = emptySnapshot({ appointments: [appointment('a1')] });
        const first = buildPlan(snapshot, NOW).actions.find((a) => a.kind === 'CREATE_SLOT_LOCK');

        assert.deepEqual(Object.keys(first.value).sort(), [
            'appointmentId', 'dateIso', 'dateKey', 'salonId', 'startTime'
        ]);
        assert.equal(first.value.salonId, SALON_ID);
        assert.equal(first.value.appointmentId, 'a1');
    });

    test('no bloquea citas pasadas', () => {
        const snapshot = emptySnapshot({
            appointments: [appointment('a1', { appointmentDateIso: PAST_ISO })]
        });
        assert.equal(buildPlan(snapshot, NOW).actions.filter((a) => a.kind === 'CREATE_SLOT_LOCK').length, 0);
    });

    test('no bloquea citas canceladas', () => {
        const snapshot = emptySnapshot({
            appointments: [appointment('a1', { status: 'cancelada' })]
        });
        assert.equal(buildPlan(snapshot, NOW).actions.filter((a) => a.kind === 'CREATE_SLOT_LOCK').length, 0);
    });

    test('es idempotente: con los locks ya creados no propone nada', () => {
        const app = appointment('a1');
        const existing = ['14:00', '14:30', '15:00', '15:30']
            .map((t) => lock(`${SALON_ID}_${FUTURE_ISO}_${t}`, 'a1'));

        const snapshot = emptySnapshot({ appointments: [app], bookingSlots: existing });
        const plan = buildPlan(snapshot, NOW);

        assert.equal(plan.actions.length, 0);
        assert.equal(plan.conflicts.length, 0);
    });

    test('no pisa un lock que pertenece a otra cita', () => {
        const snapshot = emptySnapshot({
            appointments: [appointment('a1')],
            bookingSlots: [lock(`${SALON_ID}_${FUTURE_ISO}_15:00`, 'a-otra')]
        });

        const plan = buildPlan(snapshot, NOW);

        assert.ok(plan.conflicts.some((c) => c.type === 'LOCK_OCUPADO_POR_OTRA_CITA'));
        assert.equal(
            plan.actions.filter((a) => a.kind === 'CREATE_SLOT_LOCK' && a.id.endsWith('15:00')).length,
            0
        );
    });

    test('dos citas activas sobre el mismo turno: ninguna gana automáticamente', () => {
        const snapshot = emptySnapshot({
            appointments: [
                appointment('a1', { startTime: '14:00', durationMinutes: 60 }),
                appointment('a2', { startTime: '14:00', durationMinutes: 60 })
            ]
        });

        const plan = buildPlan(snapshot, NOW);
        const contested = plan.actions.filter(
            (a) => a.kind === 'CREATE_SLOT_LOCK' && a.id.endsWith('14:00')
        );

        assert.equal(contested.length, 0);
        assert.ok(plan.conflicts.some((c) => c.type === 'DOS_CITAS_ACTIVAS_MISMO_TURNO'));
        assert.ok(plan.skipped.some((s) => s.reason === 'LOCK_EN_CONFLICTO_NO_SE_CREA'));
    });

    test('reporta duración inválida en lugar de bloquear al azar', () => {
        const snapshot = emptySnapshot({
            appointments: [appointment('a1', { durationMinutes: 0 })]
        });

        const plan = buildPlan(snapshot, NOW);
        assert.equal(plan.actions.filter((a) => a.kind === 'CREATE_SLOT_LOCK').length, 0);
        assert.ok(plan.skipped.some((s) => s.id === 'a1' && s.reason === 'DURACION_INVALIDA'));
    });
});

describe('audit', () => {
    test('cuenta las citas futuras activas sin locks completos', () => {
        const snapshot = emptySnapshot({
            appointments: [appointment('a1')],
            bookingSlots: [lock(`${SALON_ID}_${FUTURE_ISO}_14:00`, 'a1')],
            settings: {}
        });

        const result = audit(snapshot, NOW);

        assert.equal(result.futureActiveCount, 1);
        assert.equal(result.futureActiveWithoutLocks.length, 1);
        assert.equal(result.futureActiveWithoutLocks[0].missing.length, 3);
    });

    test('detecta el choque histórico entre dos citas sin resolverlo', () => {
        const snapshot = emptySnapshot({
            appointments: [
                appointment('a1', { appointmentDateIso: PAST_ISO, durationMinutes: 60 }),
                appointment('a2', { appointmentDateIso: PAST_ISO, durationMinutes: 60 })
            ],
            settings: {}
        });

        const result = audit(snapshot, NOW);
        const clash = result.conflicts.find((c) => c.type === 'DOS_CITAS_MISMO_TURNO');

        assert.ok(clash);
        assert.equal(clash.horizon, 'historico');
        assert.deepEqual(clash.appointmentIds.sort(), ['a1', 'a2']);
    });

    test('marca los usuarios legacy con id de teléfono', () => {
        const snapshot = emptySnapshot({
            users: [user('uid-ana'), { id: '600112233', data: { salonId: SALON_ID, phone: '600112233' } }],
            settings: {}
        });

        const result = audit(snapshot, NOW);
        assert.equal(result.legacyUsers.length, 1);
        assert.equal(result.legacyUsers[0].id, '600112233');
    });

    test('detecta locks huérfanos y obsoletos sin borrarlos', () => {
        const snapshot = emptySnapshot({
            appointments: [appointment('a1', { status: 'cancelada' })],
            bookingSlots: [
                lock(`${SALON_ID}_${FUTURE_ISO}_14:00`, 'a1'),
                lock(`${SALON_ID}_${FUTURE_ISO}_18:00`, 'no-existe')
            ],
            settings: {}
        });

        const result = audit(snapshot, NOW);
        assert.equal(result.staleSlots.length, 1);
        assert.equal(result.orphanSlots.length, 1);
    });
});
