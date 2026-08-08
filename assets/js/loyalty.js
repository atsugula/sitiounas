// Reglas de fidelidad (Fase 7).
//
// Lógica pura y determinista: sin DOM, sin Firestore, sin `window`. Es la
// parte del sistema donde un error se traduce en regalar servicios o en
// quitarle estampas a una clienta, así que conviene poder probarla.
//
// Principios:
//   - La clienta nunca escribe estampas. Se derivan de una cita completada.
//   - Una cita concede como mucho una estampa, aunque se marque completada
//     diez veces. Por eso el id de la transacción es determinista.
//   - `bookedCount` en `users/{uid}` es una cache derivada, no la autoridad.
//     La autoridad es el historial de `loyalty_transactions`.

export const REWARD_THRESHOLD = 10;
export const DEFAULT_SALON_ID = 'nails-con-val';

export const LOYALTY_TYPES = {
    EARN: 'earn',
    REDEEM: 'redeem',
    ADJUST: 'adjust'
};

/**
 * Id determinista de la transacción.
 *
 * Es lo que impide duplicar la recompensa: si el admin marca dos veces la
 * misma cita como completada, la segunda escritura apunta al mismo documento
 * y se detecta que ya existe.
 */
export function buildLoyaltyTxId(type, referenceId) {
    return `${type}_${referenceId}`;
}

/** El saldo de estampas es la suma del historial. Nunca baja de cero. */
export function computeStampsFromTransactions(transactions) {
    const total = (transactions || []).reduce((sum, tx) => {
        const delta = Number(tx && tx.stampsDelta);
        return sum + (Number.isFinite(delta) ? delta : 0);
    }, 0);
    return Math.max(0, total);
}

export function isRewardUnlocked(stamps) {
    return Number(stamps) >= REWARD_THRESHOLD;
}

/**
 * Qué transacciones debe generar una cita que se acaba de completar.
 *
 * `existingTxIds` son las que ya existen en la base. Se pasan explícitamente
 * para que la decisión sea pura y comprobable: esta función no consulta nada.
 *
 * Una cita genera:
 *   - `earn`   +1  siempre que sea una cita completada y con dueño;
 *   - `redeem` -10 además, si la cita se agendó usando el cupón de fidelidad.
 */
export function resolveLoyaltyGrant({ appointment, existingTxIds = [], createdBy }) {
    if (!appointment) return [];
    if (appointment.status !== 'completada') return [];
    if (!appointment.clientUid) return [];

    const already = new Set(existingTxIds);
    const salonId = appointment.salonId || DEFAULT_SALON_ID;
    const pending = [];

    const earnId = buildLoyaltyTxId(LOYALTY_TYPES.EARN, appointment.id);
    if (!already.has(earnId)) {
        pending.push({
            id: earnId,
            userId: appointment.clientUid,
            appointmentId: appointment.id,
            salonId,
            type: LOYALTY_TYPES.EARN,
            stampsDelta: 1,
            reason: 'Cita completada',
            createdBy: createdBy || null
        });
    }

    if (appointment.loyaltyRedeemed) {
        const redeemId = buildLoyaltyTxId(LOYALTY_TYPES.REDEEM, appointment.id);
        if (!already.has(redeemId)) {
            pending.push({
                id: redeemId,
                userId: appointment.clientUid,
                appointmentId: appointment.id,
                salonId,
                type: LOYALTY_TYPES.REDEEM,
                stampsDelta: -REWARD_THRESHOLD,
                reason: 'Cupón de fidelidad canjeado',
                createdBy: createdBy || null
            });
        }
    }

    return pending;
}

/**
 * Ajuste manual de admin. Se valida aquí para que un error de dedo no
 * convierta la tarjeta de una clienta en cualquier cosa.
 */
export function buildManualAdjustment({ userId, stampsDelta, reason, createdBy, salonId = DEFAULT_SALON_ID, timestampSuffix }) {
    const delta = Number(stampsDelta);

    if (!userId) throw new Error('LOYALTY_MISSING_USER');
    if (!Number.isInteger(delta) || delta === 0) throw new Error('LOYALTY_INVALID_DELTA');
    if (Math.abs(delta) > REWARD_THRESHOLD) throw new Error('LOYALTY_DELTA_TOO_LARGE');
    if (!reason || !String(reason).trim()) throw new Error('LOYALTY_MISSING_REASON');
    if (!createdBy) throw new Error('LOYALTY_MISSING_AUTHOR');

    return {
        id: buildLoyaltyTxId(LOYALTY_TYPES.ADJUST, `${userId}_${timestampSuffix}`),
        userId,
        appointmentId: null,
        salonId,
        type: LOYALTY_TYPES.ADJUST,
        stampsDelta: delta,
        reason: String(reason).trim(),
        createdBy
    };
}

/** Nuevo valor de la cache `bookedCount` tras aplicar unos deltas. */
export function applyDeltasToCachedCount(currentCount, transactions) {
    const base = Number(currentCount);
    const start = Number.isFinite(base) && base > 0 ? base : 0;
    const delta = (transactions || []).reduce((sum, tx) => sum + (Number(tx.stampsDelta) || 0), 0);
    return Math.max(0, start + delta);
}
