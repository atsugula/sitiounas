// Tests del cálculo de disponibilidad (lógica de la Fase 1 + locks de la
// Fase 5), extraído a un módulo puro en la Fase 11.
//
//   npm run test:availability
//
// Hasta ahora esta lógica —la más delicada del negocio— no tenía ni una
// prueba automática. Los escenarios que CAMBIOS_AGENDA_FASE_1.md decía haber
// comprobado a mano quedan aquí fijados.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    ALL_TIME_SLOTS,
    computeAvailability,
    mergeAppointmentSources
} from '../assets/js/availability.js';

const CATALOGO = [
    { id: 'mani_semi', name: 'Manicura semipermanente', durationHours: 2 },
    { id: 'pedi_basi', name: 'Pedicura basica', durationHours: 1 },
    { id: 'ext_acri', name: 'Extensión en acrílico', durationHours: 3 }
];

const DIA = '2026-09-01';
// Un momento fijo y temprano, para que "hoy" nunca contamine los tests.
const MANIANA = new Date(2026, 8, 1, 7, 0);

function disponibilidad(overrides = {}) {
    return computeAvailability({
        dateIso: DIA,
        durationMinutes: 120,
        now: MANIANA,
        todayIso: '2026-08-15',   // el día pedido NO es hoy
        servicesCatalog: CATALOGO,
        ...overrides
    });
}

function estado(resultado, hora) {
    const slot = resultado.slots.find((s) => s.time === hora);
    return slot.available ? 'libre' : slot.reason;
}

describe('estructura basica', () => {
    test('devuelve un estado por cada turno del estudio', () => {
        const r = disponibilidad();
        assert.equal(r.slots.length, ALL_TIME_SLOTS.length);
        assert.equal(r.date, DIA);
        assert.equal(r.closed, false);
    });

    test('un día sin citas está mayormente libre', () => {
        const r = disponibilidad();
        assert.ok(r.slots.filter((s) => s.available).length > 15);
    });
});

describe('bloqueos del estudio', () => {
    test('un día bloqueado cierra todos los turnos', () => {
        const r = disponibilidad({ blockedDates: [{ date: DIA, reason: 'Festivo' }] });
        assert.equal(r.closed, true);
        assert.ok(r.slots.every((s) => !s.available && s.reason === 'closed'));
    });

    test('un turno bloqueado solo cierra ese turno', () => {
        const r = disponibilidad({ blockedSlotsByDate: { [DIA]: ['10:00 AM'] } });
        assert.equal(estado(r, '10:00 AM'), 'closed');
        assert.equal(estado(r, '10:30 AM'), 'libre');
    });

    test('un bloqueo de otro día no afecta', () => {
        const r = disponibilidad({ blockedSlotsByDate: { '2026-09-02': ['10:00 AM'] } });
        assert.equal(estado(r, '10:00 AM'), 'libre');
    });
});

describe('horas pasadas', () => {
    test('si el día es hoy, lo ya pasado no se ofrece', () => {
        const r = disponibilidad({
            todayIso: DIA,
            now: new Date(2026, 8, 1, 11, 15)
        });
        assert.equal(estado(r, '10:00 AM'), 'past');
        assert.equal(estado(r, '11:00 AM'), 'past');
        assert.equal(estado(r, '11:30 AM'), 'libre');
    });

    test('en un día futuro nada es pasado', () => {
        const r = disponibilidad({ now: new Date(2026, 8, 1, 23, 0) });
        assert.notEqual(estado(r, '08:00 AM'), 'past');
    });
});

// ── Escenarios declarados en CAMBIOS_AGENDA_FASE_1.md ────────────────────

describe('agenda por intervalos (Fase 1)', () => {
    const citaDe2h = [{
        id: 'app_1', appointmentDateIso: DIA, time: '02:00 PM',
        durationMinutes: 120, status: 'confirmada'
    }];

    test('una cita de 14:00 a 16:00 bloquea 14:00, 14:30, 15:00 y 15:30', () => {
        const r = disponibilidad({ cloudAppointments: citaDe2h, durationMinutes: 30 });
        assert.equal(estado(r, '02:00 PM'), 'booked');
        assert.equal(estado(r, '02:30 PM'), 'no-space');
        assert.equal(estado(r, '03:00 PM'), 'no-space');
        assert.equal(estado(r, '03:30 PM'), 'no-space');
    });

    test('las 16:00 quedan libres: la cita termina justo ahí', () => {
        const r = disponibilidad({ cloudAppointments: citaDe2h, durationMinutes: 120 });
        assert.equal(estado(r, '04:00 PM'), 'libre');
    });

    test('un servicio de 13:30 a 14:30 no cabe si existe 14:00-16:00', () => {
        const r = disponibilidad({ cloudAppointments: citaDe2h, durationMinutes: 60 });
        assert.equal(estado(r, '01:30 PM'), 'no-space');
    });

    test('las 13:00 sí caben para una cita de una hora', () => {
        const r = disponibilidad({ cloudAppointments: citaDe2h, durationMinutes: 60 });
        assert.equal(estado(r, '01:00 PM'), 'libre');
    });

    test('una cita de 3 horas bloquea su intervalo completo', () => {
        const r = disponibilidad({
            cloudAppointments: [{
                id: 'app_3h', appointmentDateIso: DIA, time: '10:00 AM',
                durationMinutes: 180, status: 'confirmada'
            }],
            durationMinutes: 30
        });
        ['10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM', '12:00 PM', '12:30 PM']
            .forEach((hora) => assert.notEqual(estado(r, hora), 'libre', `${hora} deberia estar ocupada`));
        assert.equal(estado(r, '01:00 PM'), 'libre');
    });

    test('varios servicios suman su duración real', () => {
        const r = disponibilidad({
            cloudAppointments: [{
                id: 'app_multi', appointmentDateIso: DIA, time: '10:00 AM',
                serviceIds: ['mani_semi', 'pedi_basi'], status: 'confirmada'
            }],
            durationMinutes: 30
        });
        // 2 h + 1 h = 10:00 a 13:00
        assert.notEqual(estado(r, '12:30 PM'), 'libre');
        assert.equal(estado(r, '01:00 PM'), 'libre');
    });

    test('una cita cancelada libera su horario', () => {
        const r = disponibilidad({
            cloudAppointments: [{ ...citaDe2h[0], status: 'cancelada' }],
            durationMinutes: 120
        });
        assert.equal(estado(r, '02:00 PM'), 'libre');
    });

    test('una cita de otro día no estorba', () => {
        const r = disponibilidad({
            cloudAppointments: [{ ...citaDe2h[0], appointmentDateIso: '2026-09-02' }],
            durationMinutes: 120
        });
        assert.equal(estado(r, '02:00 PM'), 'libre');
    });

    test('una cita antigua sin durationMinutes se deduce del catálogo', () => {
        const r = disponibilidad({
            cloudAppointments: [{
                id: 'app_viejo', appointmentDateIso: DIA, time: '10:00 AM',
                serviceSummary: 'Extensión en acrílico', status: 'confirmada'
            }],
            durationMinutes: 30
        });
        // 3 h -> hasta las 13:00
        assert.notEqual(estado(r, '12:30 PM'), 'libre');
        assert.equal(estado(r, '01:00 PM'), 'libre');
    });
});

describe('cierre del estudio', () => {
    test('una cita que terminaría después del cierre no se ofrece', () => {
        const r = disponibilidad({ durationMinutes: 120 });
        // 18:30 + 2 h = 20:30, pasa de las 20:00
        assert.equal(estado(r, '06:30 PM'), 'closing');
    });

    test('el turno noche de las 19:00 admite hasta 3 horas', () => {
        assert.equal(estado(disponibilidad({ durationMinutes: 180 }), '07:00 PM'), 'libre');
    });

    test('pero no más de 3 horas', () => {
        assert.equal(estado(disponibilidad({ durationMinutes: 240 }), '07:00 PM'), 'closing');
    });

    test('las 18:00 admiten dos horas justas', () => {
        assert.equal(estado(disponibilidad({ durationMinutes: 120 }), '06:00 PM'), 'libre');
    });
});

describe('locks de reserva (Fase 5)', () => {
    const locked = new Set(['14:00', '14:30', '15:00', '15:30']);

    test('un turno con lock aparece como reservado', () => {
        assert.equal(estado(disponibilidad({ lockedStartTimes: locked, durationMinutes: 120 }), '02:00 PM'), 'booked');
    });

    test('el hueco anterior no cabe', () => {
        assert.equal(estado(disponibilidad({ lockedStartTimes: locked, durationMinutes: 60 }), '01:30 PM'), 'no-space');
    });

    test('el turno siguiente al lock queda libre', () => {
        assert.equal(estado(disponibilidad({ lockedStartTimes: locked, durationMinutes: 120 }), '04:00 PM'), 'libre');
    });

    test('los locks y las citas se suman durante la migración', () => {
        const r = disponibilidad({
            lockedStartTimes: new Set(['10:00']),
            cloudAppointments: [{
                id: 'sin_lock', appointmentDateIso: DIA, time: '02:00 PM',
                durationMinutes: 120, status: 'confirmada'
            }],
            durationMinutes: 30
        });
        assert.equal(estado(r, '10:00 AM'), 'booked');
        assert.equal(estado(r, '02:00 PM'), 'booked');
    });
});

describe('mergeAppointmentSources', () => {
    test('una cancelación local se impone sobre la copia de la nube', () => {
        const merged = mergeAppointmentSources(
            [{ id: 'a', status: 'confirmada' }],
            [{ id: 'a', status: 'cancelada' }]
        );
        assert.equal(merged.length, 1);
        assert.equal(merged[0].status, 'cancelada');
    });

    test('una cita solo local se añade', () => {
        const merged = mergeAppointmentSources([], [{ id: 'b', status: 'confirmada' }]);
        assert.equal(merged.length, 1);
    });

    test('no duplica lo que ya está en la nube', () => {
        const merged = mergeAppointmentSources(
            [{ id: 'a', status: 'confirmada' }],
            [{ id: 'a', status: 'confirmada' }]
        );
        assert.equal(merged.length, 1);
    });

    test('no muta las listas de entrada', () => {
        const nube = [{ id: 'a', status: 'confirmada' }];
        mergeAppointmentSources(nube, [{ id: 'a', status: 'cancelada' }]);
        assert.equal(nube[0].status, 'confirmada');
    });

    test('tolera entradas ausentes', () => {
        assert.deepEqual(mergeAppointmentSources(), []);
        assert.deepEqual(mergeAppointmentSources(null, null), []);
    });
});
