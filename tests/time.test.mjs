// Tests de las utilidades de fecha y hora extraídas en la Fase 11.
//
//   npm run test:time

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    toIsoDateString,
    formatMinutesToTimeString,
    matchesDate,
    getSelectedServicesDurationMinutes,
    getServiceDurationFromSummary,
    getAppointmentDurationMinutes,
    computeEndTime,
    parseTimeToMinutes
} from '../assets/js/time.js';

const CATALOGO = [
    { id: 'mani_semi', name: 'Manicura semipermanente', durationHours: 2 },
    { id: 'pedi_basi', name: 'Pedicura basica', durationHours: 1 },
    { id: 'ext_acri', name: 'Extensión en acrílico', durationHours: 3 }
];

describe('toIsoDateString', () => {
    test('usa la fecha local, no UTC', () => {
        // 23:30 local del 1 de septiembre debe seguir siendo el día 1.
        assert.equal(toIsoDateString(new Date(2026, 8, 1, 23, 30)), '2026-09-01');
    });

    test('rellena mes y día con ceros', () => {
        assert.equal(toIsoDateString(new Date(2026, 0, 5)), '2026-01-05');
    });
});

describe('formatMinutesToTimeString', () => {
    test('convierte a formato de 12 horas', () => {
        assert.equal(formatMinutesToTimeString(840), '02:00 PM');
        assert.equal(formatMinutesToTimeString(0), '12:00 AM');
        assert.equal(formatMinutesToTimeString(720), '12:00 PM');
        assert.equal(formatMinutesToTimeString(1140), '07:00 PM');
    });

    test('da la vuelta al pasar de medianoche', () => {
        assert.equal(formatMinutesToTimeString(1500), '01:00 AM');
    });

    test('es la inversa del parseo', () => {
        ['08:00 AM', '02:30 PM', '11:45 PM'].forEach((time) => {
            assert.equal(formatMinutesToTimeString(parseTimeToMinutes(time)), time);
        });
    });
});

describe('matchesDate', () => {
    const dia = new Date(2026, 8, 1);
    const iso = '2026-09-01';

    test('reconoce el campo ISO de la Fase 1', () => {
        assert.equal(matchesDate({ appointmentDateIso: iso }, dia, iso), true);
    });

    test('reconoce el dateKey de toDateString', () => {
        assert.equal(matchesDate({ dateKey: dia.toDateString() }, dia, iso), true);
    });

    test('reconoce un dateKey que ya venía en ISO', () => {
        assert.equal(matchesDate({ dateKey: iso }, dia, iso), true);
    });

    test('rechaza otra fecha', () => {
        assert.equal(matchesDate({ appointmentDateIso: '2026-09-02' }, dia, iso), false);
    });

    test('tolera basura', () => {
        assert.equal(matchesDate(null, dia, iso), false);
        assert.equal(matchesDate({}, dia, iso), false);
        assert.equal(matchesDate({ dateKey: 'cuando sea' }, dia, iso), false);
    });
});

describe('duración de servicios', () => {
    test('varios servicios suman su duración real', () => {
        assert.equal(getSelectedServicesDurationMinutes([
            { durationHours: 2 }, { durationHours: 1 }
        ]), 180);
    });

    test('una lista vacía no suma', () => {
        assert.equal(getSelectedServicesDurationMinutes([]), 0);
        assert.equal(getSelectedServicesDurationMinutes(null), 0);
    });

    test('los servicios sin duración válida no suman', () => {
        assert.equal(getSelectedServicesDurationMinutes([
            { durationHours: 2 }, { durationHours: 'dos' }, {}
        ]), 120);
    });

    test('deduce la duración del texto del servicio', () => {
        assert.equal(getServiceDurationFromSummary('Manicura semipermanente', CATALOGO), 120);
        assert.equal(getServiceDurationFromSummary('Extensión en acrílico', CATALOGO), 180);
    });

    test('suma cuando el texto menciona varios servicios', () => {
        assert.equal(
            getServiceDurationFromSummary('Manicura semipermanente + Pedicura basica', CATALOGO),
            180
        );
    });

    test('cae a 120 si no reconoce nada', () => {
        assert.equal(getServiceDurationFromSummary('algo raro', CATALOGO), 120);
        assert.equal(getServiceDurationFromSummary('', CATALOGO), 120);
    });
});

describe('getAppointmentDurationMinutes', () => {
    test('prefiere el campo explícito', () => {
        assert.equal(getAppointmentDurationMinutes({ durationMinutes: 90 }, CATALOGO), 90);
    });

    test('si no lo hay, suma los ids de servicio', () => {
        assert.equal(
            getAppointmentDurationMinutes({ serviceIds: ['mani_semi', 'pedi_basi'] }, CATALOGO),
            180
        );
    });

    test('si tampoco, deduce del texto', () => {
        assert.equal(
            getAppointmentDurationMinutes({ serviceSummary: 'Extensión en acrílico' }, CATALOGO),
            180
        );
    });

    test('una cita antigua sin nada de eso cae a 120', () => {
        assert.equal(getAppointmentDurationMinutes({}, CATALOGO), 120);
        assert.equal(getAppointmentDurationMinutes(null, CATALOGO), 120);
    });

    test('una duración explícita inválida no gana', () => {
        assert.equal(
            getAppointmentDurationMinutes({ durationMinutes: 0, serviceIds: ['ext_acri'] }, CATALOGO),
            180
        );
    });
});

describe('computeEndTime', () => {
    test('una cita de dos horas desde las 14:00 termina a las 16:00', () => {
        assert.equal(computeEndTime('02:00 PM', 120), '04:00 PM');
    });

    test('acepta formato de 24 horas en la entrada', () => {
        assert.equal(computeEndTime('14:00', 120), '04:00 PM');
    });

    test('devuelve vacío si la hora no se entiende', () => {
        assert.equal(computeEndTime('cuando sea', 120), '');
    });
});
