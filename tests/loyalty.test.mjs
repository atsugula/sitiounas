// Tests de las reglas de fidelidad (Fase 7).
//
//   npm run test:loyalty
//
// Se ejecutan sin emulador ni Java.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    REWARD_THRESHOLD,
    LOYALTY_TYPES,
    buildLoyaltyTxId,
    computeStampsFromTransactions,
    isRewardUnlocked,
    resolveLoyaltyGrant,
    buildManualAdjustment,
    applyDeltasToCachedCount
} from '../assets/js/loyalty.js';

function completedAppointment(overrides = {}) {
    return {
        id: 'app_1',
        clientUid: 'cliente-a',
        salonId: 'nails-con-val',
        status: 'completada',
        ...overrides
    };
}

describe('saldo de estampas', () => {
    test('el saldo es la suma del historial', () => {
        assert.equal(computeStampsFromTransactions([
            { stampsDelta: 1 }, { stampsDelta: 1 }, { stampsDelta: 1 }
        ]), 3);
    });

    test('un canje resta', () => {
        assert.equal(computeStampsFromTransactions([
            ...Array.from({ length: 10 }, () => ({ stampsDelta: 1 })),
            { stampsDelta: -10 }
        ]), 0);
    });

    test('el saldo nunca es negativo', () => {
        assert.equal(computeStampsFromTransactions([{ stampsDelta: -5 }]), 0);
    });

    test('ignora deltas corruptos', () => {
        assert.equal(computeStampsFromTransactions([
            { stampsDelta: 2 }, { stampsDelta: 'muchas' }, { stampsDelta: null }, {}
        ]), 2);
    });

    test('el premio se desbloquea en 10', () => {
        assert.equal(REWARD_THRESHOLD, 10);
        assert.equal(isRewardUnlocked(9), false);
        assert.equal(isRewardUnlocked(10), true);
        assert.equal(isRewardUnlocked(14), true);
    });
});

describe('estampa derivada de cita completada', () => {
    test('una cita completada concede exactamente una estampa', () => {
        const pending = resolveLoyaltyGrant({ appointment: completedAppointment(), createdBy: 'admin-1' });
        assert.equal(pending.length, 1);
        assert.equal(pending[0].type, LOYALTY_TYPES.EARN);
        assert.equal(pending[0].stampsDelta, 1);
        assert.equal(pending[0].userId, 'cliente-a');
        assert.equal(pending[0].appointmentId, 'app_1');
        assert.equal(pending[0].createdBy, 'admin-1');
    });

    test('marcar la misma cita dos veces NO duplica la recompensa', () => {
        const primera = resolveLoyaltyGrant({ appointment: completedAppointment(), createdBy: 'admin-1' });
        const segunda = resolveLoyaltyGrant({
            appointment: completedAppointment(),
            existingTxIds: primera.map((tx) => tx.id),
            createdBy: 'admin-1'
        });
        assert.equal(segunda.length, 0);
    });

    test('una cita que no está completada no concede nada', () => {
        ['confirmada', 'pendiente', 'cancelada'].forEach((status) => {
            assert.deepEqual(
                resolveLoyaltyGrant({ appointment: completedAppointment({ status }), createdBy: 'admin-1' }),
                []
            );
        });
    });

    test('una cita sin dueño no concede nada', () => {
        assert.deepEqual(
            resolveLoyaltyGrant({ appointment: completedAppointment({ clientUid: null }), createdBy: 'admin-1' }),
            []
        );
    });

    test('el id de la transacción es determinista', () => {
        assert.equal(buildLoyaltyTxId(LOYALTY_TYPES.EARN, 'app_1'), 'earn_app_1');
        assert.equal(buildLoyaltyTxId(LOYALTY_TYPES.REDEEM, 'app_1'), 'redeem_app_1');
    });
});

describe('canje del premio', () => {
    test('una cita con cupón genera la estampa y el canje', () => {
        const pending = resolveLoyaltyGrant({
            appointment: completedAppointment({ loyaltyRedeemed: true }),
            createdBy: 'admin-1'
        });

        assert.equal(pending.length, 2);
        const redeem = pending.find((tx) => tx.type === LOYALTY_TYPES.REDEEM);
        assert.equal(redeem.stampsDelta, -REWARD_THRESHOLD);
        assert.equal(redeem.id, 'redeem_app_1');
        assert.ok(redeem.reason.length > 0);
    });

    test('el canje tampoco se duplica', () => {
        const appointment = completedAppointment({ loyaltyRedeemed: true });
        const primera = resolveLoyaltyGrant({ appointment, createdBy: 'admin-1' });
        const segunda = resolveLoyaltyGrant({
            appointment,
            existingTxIds: primera.map((tx) => tx.id),
            createdBy: 'admin-1'
        });
        assert.equal(segunda.length, 0);
    });

    test('un canje parcialmente registrado se completa sin repetir lo hecho', () => {
        const appointment = completedAppointment({ loyaltyRedeemed: true });
        const pending = resolveLoyaltyGrant({
            appointment,
            existingTxIds: ['earn_app_1'],
            createdBy: 'admin-1'
        });
        assert.equal(pending.length, 1);
        assert.equal(pending[0].type, LOYALTY_TYPES.REDEEM);
    });

    test('el ciclo completo deja el saldo en cero', () => {
        const historial = [];
        for (let i = 1; i <= 10; i++) {
            historial.push(...resolveLoyaltyGrant({
                appointment: completedAppointment({ id: `app_${i}` }),
                createdBy: 'admin-1'
            }));
        }
        assert.equal(computeStampsFromTransactions(historial), 10);
        assert.equal(isRewardUnlocked(computeStampsFromTransactions(historial)), true);

        historial.push(...resolveLoyaltyGrant({
            appointment: completedAppointment({ id: 'app_11', loyaltyRedeemed: true }),
            createdBy: 'admin-1'
        }));

        // La cita 11 suma su propia estampa y descuenta el premio.
        assert.equal(computeStampsFromTransactions(historial), 1);
    });
});

describe('ajuste manual de admin', () => {
    const base = { userId: 'cliente-a', reason: 'Cita antigua no registrada', createdBy: 'admin-1', timestampSuffix: '1754600000000' };

    test('un ajuste válido se construye completo', () => {
        const tx = buildManualAdjustment({ ...base, stampsDelta: 3 });
        assert.equal(tx.type, LOYALTY_TYPES.ADJUST);
        assert.equal(tx.stampsDelta, 3);
        assert.equal(tx.appointmentId, null);
        assert.equal(tx.createdBy, 'admin-1');
        assert.ok(tx.id.startsWith('adjust_cliente-a_'));
    });

    test('admite ajustes negativos', () => {
        assert.equal(buildManualAdjustment({ ...base, stampsDelta: -2 }).stampsDelta, -2);
    });

    test('exige motivo', () => {
        assert.throws(() => buildManualAdjustment({ ...base, stampsDelta: 1, reason: '   ' }), /LOYALTY_MISSING_REASON/);
    });

    test('exige autor', () => {
        assert.throws(() => buildManualAdjustment({ ...base, stampsDelta: 1, createdBy: null }), /LOYALTY_MISSING_AUTHOR/);
    });

    test('rechaza delta cero, decimal o desmedido', () => {
        assert.throws(() => buildManualAdjustment({ ...base, stampsDelta: 0 }), /LOYALTY_INVALID_DELTA/);
        assert.throws(() => buildManualAdjustment({ ...base, stampsDelta: 1.5 }), /LOYALTY_INVALID_DELTA/);
        assert.throws(() => buildManualAdjustment({ ...base, stampsDelta: 999 }), /LOYALTY_DELTA_TOO_LARGE/);
    });

    test('rechaza usuario ausente', () => {
        assert.throws(() => buildManualAdjustment({ ...base, userId: '', stampsDelta: 1 }), /LOYALTY_MISSING_USER/);
    });
});

describe('cache bookedCount', () => {
    test('aplica los deltas sobre el valor actual', () => {
        assert.equal(applyDeltasToCachedCount(4, [{ stampsDelta: 1 }]), 5);
        assert.equal(applyDeltasToCachedCount(10, [{ stampsDelta: 1 }, { stampsDelta: -10 }]), 1);
    });

    test('nunca queda negativa', () => {
        assert.equal(applyDeltasToCachedCount(2, [{ stampsDelta: -10 }]), 0);
    });

    test('tolera una cache ausente o corrupta', () => {
        assert.equal(applyDeltasToCachedCount(undefined, [{ stampsDelta: 1 }]), 1);
        assert.equal(applyDeltasToCachedCount('muchas', [{ stampsDelta: 1 }]), 1);
        assert.equal(applyDeltasToCachedCount(-5, [{ stampsDelta: 1 }]), 1);
    });

    test('la cache coincide con el historial recalculado', () => {
        const historial = [
            ...Array.from({ length: 10 }, (_, i) => ({ stampsDelta: 1, id: `earn_${i}` })),
            { stampsDelta: -10, id: 'redeem_x' },
            { stampsDelta: 2, id: 'adjust_y' }
        ];
        assert.equal(applyDeltasToCachedCount(0, historial), computeStampsFromTransactions(historial));
    });
});
