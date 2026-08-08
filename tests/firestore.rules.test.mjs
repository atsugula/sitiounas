// Tests de Firestore Security Rules — NailsConVal (Fase 3)
//
// Requisitos para ejecutarlos:
//   1. Node 18+ (usa el runner integrado `node --test`).
//   2. JDK 11+ instalado y en PATH (el emulador de Firestore corre sobre Java).
//   3. npm install
//
// Ejecucion:
//   npm run test:rules
//
// El script levanta el emulador de Firestore con firestore.rules y corre
// este archivo contra el.

import { test, before, after, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    initializeTestEnvironment,
    assertSucceeds,
    assertFails
} from '@firebase/rules-unit-testing';
import {
    doc,
    getDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    collection,
    getDocs,
    query,
    where
} from 'firebase/firestore';

const SALON = 'nails-con-val';
const PROJECT_ID = 'nailsconval-rules-test';
// Mismo formato determinista que produce assets/js/booking-slots.js
const SLOT_ID = `${SALON}_2026-09-01_14:00`;

let testEnv;

/** Contexto autenticado con email/password (no anonimo). */
function registered(uid) {
    return testEnv.authenticatedContext(uid, {
        firebase: { sign_in_provider: 'password' }
    }).firestore();
}

/** Contexto anonimo, que es lo que usa el sitio publico. */
function anonymous(uid = 'anon-visitor') {
    return testEnv.authenticatedContext(uid, {
        firebase: { sign_in_provider: 'anonymous' }
    }).firestore();
}

/** Contexto sin sesion alguna. */
function unauthed() {
    return testEnv.unauthenticatedContext().firestore();
}

function clientProfile(uid, overrides = {}) {
    return {
        uid,
        salonId: SALON,
        name: 'Cliente Demo',
        phone: '3001234567',
        email: `${uid}@example.com`,
        birthdate: '1995-04-12',
        role: 'client',
        bookedCount: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        ...overrides
    };
}

function appointment(clientUid, overrides = {}) {
    return {
        id: 'app_1',
        clientUid,
        salonId: SALON,
        appointmentDateIso: '2026-09-01',
        dateKey: 'Tue Sep 01 2026',
        serviceIds: ['mani_semi'],
        serviceSummary: 'Manicura semipermanente',
        durationMinutes: 120,
        startTime: '14:00',
        endTime: '16:00',
        time: '14:00',
        name: 'Cliente Demo',
        phone: '3001234567',
        notes: '',
        status: 'confirmada',
        createdAt: '2026-08-01T00:00:00.000Z',
        isWalkIn: false,
        isRefunded: false,
        ...overrides
    };
}

before(async () => {
    testEnv = await initializeTestEnvironment({
        projectId: PROJECT_ID,
        firestore: {
            rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8')
        }
    });
});

after(async () => {
    if (testEnv) await testEnv.cleanup();
});

beforeEach(async () => {
    await testEnv.clearFirestore();

    // Semilla escrita con reglas desactivadas.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, 'users', 'admin-1'), clientProfile('admin-1', { role: 'admin' }));
        await setDoc(doc(db, 'users', 'cliente-a'), clientProfile('cliente-a'));
        await setDoc(doc(db, 'users', 'cliente-b'), clientProfile('cliente-b'));
        await setDoc(doc(db, 'appointments', 'app_a'), appointment('cliente-a', { id: 'app_a' }));
        await setDoc(doc(db, 'settings', 'custom_services'), { services: [] });
        await setDoc(doc(db, 'settings', 'income_goal'), { amount: 5000000 });
        await setDoc(doc(db, 'bookingSlots', SLOT_ID), {
            salonId: SALON,
            dateKey: 'Tue Sep 01 2026',
            dateIso: '2026-09-01',
            startTime: '14:00',
            appointmentId: 'app_a',
            createdAt: '2026-08-01T00:00:00.000Z'
        });
        await setDoc(doc(db, 'community_posts', 'post_1'), {
            authorUid: 'cliente-a',
            salonId: SALON,
            name: 'Cliente Demo',
            message: 'Hola',
            likes: 3
        });
        await setDoc(doc(db, 'loyalty_transactions', 'tx_1'), {
            userId: 'cliente-a',
            appointmentId: 'app_a',
            salonId: SALON,
            type: 'earn',
            stampsDelta: 1,
            reason: 'cita completada',
            createdAt: '2026-08-01T00:00:00.000Z',
            createdBy: 'admin-1'
        });
    });
});

describe('users', () => {
    // 1
    test('el cliente lee su propio perfil', async () => {
        const db = registered('cliente-a');
        await assertSucceeds(getDoc(doc(db, 'users', 'cliente-a')));
    });

    // 2
    test('el cliente no lee el perfil de otro cliente', async () => {
        const db = registered('cliente-a');
        await assertFails(getDoc(doc(db, 'users', 'cliente-b')));
    });

    // 3
    test('el cliente no puede cambiar su role', async () => {
        const db = registered('cliente-a');
        await assertFails(updateDoc(doc(db, 'users', 'cliente-a'), { role: 'admin' }));
    });

    // 4
    test('el cliente no puede cambiar su bookedCount', async () => {
        const db = registered('cliente-a');
        await assertFails(updateDoc(doc(db, 'users', 'cliente-a'), { bookedCount: 99 }));
    });

    test('el cliente si puede actualizar su telefono', async () => {
        const db = registered('cliente-a');
        await assertSucceeds(updateDoc(doc(db, 'users', 'cliente-a'), { phone: '3009998877' }));
    });

    test('el registro no puede crear un perfil con role admin', async () => {
        const db = registered('cliente-nuevo');
        await assertFails(setDoc(
            doc(db, 'users', 'cliente-nuevo'),
            clientProfile('cliente-nuevo', { role: 'admin' })
        ));
    });

    test('el registro no puede crear un perfil con fidelidad precargada', async () => {
        const db = registered('cliente-nuevo');
        await assertFails(setDoc(
            doc(db, 'users', 'cliente-nuevo'),
            clientProfile('cliente-nuevo', { bookedCount: 10 })
        ));
    });

    test('el registro valido crea el perfil propio', async () => {
        const db = registered('cliente-nuevo');
        await assertSucceeds(setDoc(
            doc(db, 'users', 'cliente-nuevo'),
            clientProfile('cliente-nuevo')
        ));
    });

    // 5
    test('el admin opera usuarios', async () => {
        const db = registered('admin-1');
        await assertSucceeds(getDoc(doc(db, 'users', 'cliente-a')));
        await assertSucceeds(getDocs(collection(db, 'users')));
        await assertSucceeds(updateDoc(doc(db, 'users', 'cliente-a'), { bookedCount: 4 }));
    });

    // 6
    test('el publico no lee users', async () => {
        await assertFails(getDoc(doc(unauthed(), 'users', 'cliente-a')));
        await assertFails(getDoc(doc(anonymous(), 'users', 'cliente-a')));
        await assertFails(getDocs(collection(anonymous(), 'users')));
    });

    test('un usuario anonimo no puede listar users', async () => {
        await assertFails(getDocs(collection(registered('cliente-a'), 'users')));
    });
});

describe('appointments', () => {
    // 7
    test('el cliente crea una cita valida propia', async () => {
        const db = registered('cliente-a');
        await assertSucceeds(setDoc(
            doc(db, 'appointments', 'app_nueva'),
            appointment('cliente-a', { id: 'app_nueva' })
        ));
    });

    test('el cliente no puede crear una cita a nombre de otro uid', async () => {
        const db = registered('cliente-a');
        await assertFails(setDoc(
            doc(db, 'appointments', 'app_ajena'),
            appointment('cliente-b', { id: 'app_ajena' })
        ));
    });

    // 8
    test('el cliente no puede tocar campos administrativos de su cita', async () => {
        const db = registered('cliente-a');
        await assertFails(updateDoc(doc(db, 'appointments', 'app_a'), { isRefunded: true }));
        await assertFails(updateDoc(doc(db, 'appointments', 'app_a'), { status: 'completada' }));
        await assertFails(updateDoc(doc(db, 'appointments', 'app_a'), { startTime: '09:00' }));
    });

    test('el cliente puede cancelar su propia cita', async () => {
        const db = registered('cliente-a');
        await assertSucceeds(updateDoc(doc(db, 'appointments', 'app_a'), {
            status: 'cancelada',
            cancellationNoticeHours: 48
        }));
    });

    test('el cliente no puede cancelar la cita de otro', async () => {
        const db = registered('cliente-b');
        await assertFails(updateDoc(doc(db, 'appointments', 'app_a'), {
            status: 'cancelada',
            cancellationNoticeHours: 48
        }));
    });

    test('el cliente no lee la cita de otro cliente', async () => {
        await assertFails(getDoc(doc(registered('cliente-b'), 'appointments', 'app_a')));
    });

    test('nadie sin admin puede listar todas las citas', async () => {
        await assertFails(getDocs(collection(anonymous(), 'appointments')));
        await assertFails(getDocs(collection(registered('cliente-a'), 'appointments')));
    });

    test('el cliente puede listar solo sus propias citas con query filtrada', async () => {
        const db = registered('cliente-a');
        await assertSucceeds(getDocs(query(
            collection(db, 'appointments'),
            where('clientUid', '==', 'cliente-a')
        )));
        await assertFails(getDocs(query(
            collection(db, 'appointments'),
            where('clientUid', '==', 'cliente-b')
        )));
    });

    // 9
    test('el admin modifica la cita y puede listar todo', async () => {
        const db = registered('admin-1');
        await assertSucceeds(updateDoc(doc(db, 'appointments', 'app_a'), {
            status: 'completada',
            isRefunded: true
        }));
        await assertSucceeds(getDocs(collection(db, 'appointments')));
    });

    test('el admin no puede reasignar el dueño de una cita', async () => {
        const db = registered('admin-1');
        await assertFails(updateDoc(doc(db, 'appointments', 'app_a'), { clientUid: 'cliente-b' }));
    });

    test('el cliente no puede borrar citas', async () => {
        await assertFails(deleteDoc(doc(registered('cliente-a'), 'appointments', 'app_a')));
        await assertSucceeds(deleteDoc(doc(registered('admin-1'), 'appointments', 'app_a')));
    });
});

describe('bookingSlots', () => {
    test('la disponibilidad es de lectura publica', async () => {
        await assertSucceeds(getDoc(doc(unauthed(), 'bookingSlots', SLOT_ID)));
    });

    test('un lock no puede modificarse en sitio', async () => {
        const db = registered('cliente-a');
        await assertFails(updateDoc(doc(db, 'bookingSlots', SLOT_ID), {
            appointmentId: 'app_otro'
        }));
    });

    test('el dueño de la cita libera su lock y un tercero no', async () => {
        await assertFails(deleteDoc(doc(registered('cliente-b'), 'bookingSlots', SLOT_ID)));
        await assertSucceeds(deleteDoc(doc(registered('cliente-a'), 'bookingSlots', SLOT_ID)));
    });

    test('un lock nuevo requiere sesion y forma valida', async () => {
        const nuevo = {
            salonId: SALON, dateKey: 'Wed Sep 02 2026', dateIso: '2026-09-02',
            startTime: '10:00', appointmentId: 'app_z'
        };
        const id = `${SALON}_2026-09-02_10:00`;

        await assertFails(setDoc(doc(unauthed(), 'bookingSlots', id), nuevo));
        // Campo extra no declarado en el modelo
        await assertFails(setDoc(doc(registered('cliente-a'), 'bookingSlots', id), { ...nuevo, clientPhone: '3001234567' }));
        await assertSucceeds(setDoc(doc(registered('cliente-a'), 'bookingSlots', id), nuevo));
    });

    test('un lock no puede llevar PII', async () => {
        await assertFails(setDoc(doc(registered('cliente-a'), 'bookingSlots', `${SALON}_2026-09-03_10:00`), {
            salonId: SALON, dateKey: 'Thu Sep 03 2026', dateIso: '2026-09-03',
            startTime: '10:00', appointmentId: 'app_z', name: 'Cliente Demo'
        }));
    });
});

describe('settings', () => {
    // 10
    test('la configuracion publica se lee sin sesion pero solo admin escribe', async () => {
        await assertSucceeds(getDoc(doc(unauthed(), 'settings', 'custom_services')));
        await assertFails(setDoc(doc(anonymous(), 'settings', 'custom_services'), { services: [] }));
        await assertFails(setDoc(doc(registered('cliente-a'), 'settings', 'custom_services'), { services: [] }));
        await assertSucceeds(setDoc(doc(registered('admin-1'), 'settings', 'custom_services'), { services: [] }));
    });

    test('la configuracion administrativa privada no es publica', async () => {
        await assertFails(getDoc(doc(anonymous(), 'settings', 'income_goal')));
        await assertFails(getDoc(doc(registered('cliente-a'), 'settings', 'income_goal')));
        await assertSucceeds(getDoc(doc(registered('admin-1'), 'settings', 'income_goal')));
    });

    test('un cliente no puede bloquear ni desbloquear horarios', async () => {
        const db = registered('cliente-a');
        await assertFails(setDoc(doc(db, 'settings', 'schedule_blocks'), { blockedDates: [] }));
    });
});

describe('community_posts y reviews', () => {
    test('el muro es de lectura publica', async () => {
        await assertSucceeds(getDocs(collection(unauthed(), 'community_posts')));
    });

    test('un post nuevo debe declarar su autor real y arrancar sin likes', async () => {
        const db = anonymous('anon-1');
        await assertFails(setDoc(doc(db, 'community_posts', 'p2'), {
            authorUid: 'cliente-a', salonId: SALON, name: 'X', message: 'hola', likes: 0
        }));
        await assertFails(setDoc(doc(db, 'community_posts', 'p3'), {
            authorUid: 'anon-1', salonId: SALON, name: 'X', message: 'hola', likes: 500
        }));
        await assertSucceeds(setDoc(doc(db, 'community_posts', 'p4'), {
            authorUid: 'anon-1', salonId: SALON, name: 'X', message: 'hola', likes: 0
        }));
    });

    test('un like solo puede sumar exactamente uno', async () => {
        const db = anonymous('anon-1');
        await assertFails(updateDoc(doc(db, 'community_posts', 'post_1'), { likes: 9999 }));
        await assertFails(updateDoc(doc(db, 'community_posts', 'post_1'), { likes: 4, message: 'editado' }));
        await assertSucceeds(updateDoc(doc(db, 'community_posts', 'post_1'), { likes: 4 }));
    });

    test('solo el admin o el autor borran un post', async () => {
        await assertFails(deleteDoc(doc(anonymous('anon-1'), 'community_posts', 'post_1')));
        await assertSucceeds(deleteDoc(doc(registered('admin-1'), 'community_posts', 'post_1')));
    });

    test('una reseña requiere autor real y rating valido', async () => {
        const db = anonymous('anon-1');
        await assertFails(setDoc(doc(db, 'reviews', 'r1'), {
            authorUid: 'anon-1', salonId: SALON, name: 'X', comment: 'ok', rating: 9
        }));
        await assertSucceeds(setDoc(doc(db, 'reviews', 'r2'), {
            authorUid: 'anon-1', salonId: SALON, name: 'X', comment: 'ok', rating: 5
        }));
    });

    test('solo el admin modera reseñas', async () => {
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
            await setDoc(doc(ctx.firestore(), 'reviews', 'r3'), {
                authorUid: 'anon-1', salonId: SALON, name: 'X', comment: 'ok', rating: 4
            });
        });
        await assertFails(deleteDoc(doc(anonymous('anon-1'), 'reviews', 'r3')));
        await assertSucceeds(deleteDoc(doc(registered('admin-1'), 'reviews', 'r3')));
    });
});

describe('loyalty_transactions', () => {
    test('el cliente lee su historial pero no lo escribe', async () => {
        const db = registered('cliente-a');
        await assertSucceeds(getDoc(doc(db, 'loyalty_transactions', 'tx_1')));
        await assertFails(setDoc(doc(db, 'loyalty_transactions', 'tx_fraude'), {
            userId: 'cliente-a', salonId: SALON, type: 'earn', stampsDelta: 10,
            reason: 'me lo regalo', createdAt: '2026-08-01T00:00:00.000Z', createdBy: 'cliente-a'
        }));
    });

    test('el cliente no lee el historial de otro', async () => {
        await assertFails(getDoc(doc(registered('cliente-b'), 'loyalty_transactions', 'tx_1')));
    });

    test('el admin escribe ajustes de fidelidad', async () => {
        const db = registered('admin-1');
        await assertSucceeds(setDoc(doc(db, 'loyalty_transactions', 'tx_2'), {
            userId: 'cliente-a', salonId: SALON, type: 'adjust', stampsDelta: -1,
            reason: 'ajuste manual', createdAt: '2026-08-02T00:00:00.000Z', createdBy: 'admin-1'
        }));
    });
});

describe('rutas no declaradas', () => {
    test('cualquier coleccion desconocida esta denegada', async () => {
        await assertFails(setDoc(doc(registered('cliente-a'), 'coleccion_inventada', 'x'), { a: 1 }));
        await assertFails(getDoc(doc(registered('admin-1'), 'coleccion_inventada', 'x')));
    });
});
