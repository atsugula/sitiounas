// Arranque de Firebase: inicialización, sesión y suscripciones en tiempo real.
//
// Extraído de index.html en la Fase 11. Se carga como módulo ES, así que se
// ejecuta diferido: cuando corre, el script clásico ya definió sus funciones
// globales y el DOM está construido.

import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, EmailAuthProvider, reauthenticateWithCredential, updatePassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { initializeFirestore, doc, setDoc, addDoc, getDoc, collection, onSnapshot, getDocs, query, where, deleteDoc, serverTimestamp, runTransaction } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import * as bookingSlots from "./booking-slots.js";
import * as loyalty from "./loyalty.js";
import * as sanitize from "./sanitize.js";

// La aritmética de locks y las reglas de fidelidad viven en módulos
// aparte para poder probarlas con `node --test`. Aquí solo se publican
// para el script clásico.
window.bookingSlotUtils = bookingSlots;
window.loyaltyUtils = loyalty;
window.sanitizeUtils = sanitize;

// Proyecto Firebase de Ramos Nails. Esta es LA autoridad: cualquier otra fuente
// de configuración se valida contra ella.
//
// Estos valores son públicos por diseño en Firebase Web: `apiKey` identifica al
// proyecto, no autoriza nada. Lo que protege los datos son las Rules.
export const CANONICAL_FIREBASE_CONFIG = {
    apiKey: "AIzaSyC5LskLSBP7BaeqqxbKb697Tv4zSTCOLWw",
    authDomain: "ramos-nails.firebaseapp.com",
    projectId: "ramos-nails",
    storageBucket: "ramos-nails.firebasestorage.app",
    messagingSenderId: "653901900568",
    appId: "1:653901900568:web:69e74cf542c73d79d18c6d",
    measurementId: "G-7KJ8YPJ511"
};

const FIREBASE_CONFIG_KEY = 'ncv_firebase_config';

/**
 * Configuración de arranque, con `ncv_firebase_config` como override acotado.
 *
 * El override existe para poder rotar credenciales del MISMO proyecto desde el
 * panel sin tocar el código. Lo que no puede hacer es cambiar de proyecto: un
 * navegador que guardó esa clave cuando el sitio apuntaba a otro sitio seguiría
 * conectándose allí para siempre, en silencio, leyendo y escribiendo datos de
 * clientas en una base que ya no es la del salón.
 *
 * Por eso el `projectId` no es negociable: si no es el canónico, la entrada se
 * borra del navegador y se arranca con la configuración del código.
 */
function resolveFirebaseConfig() {
    let raw = null;

    try {
        raw = localStorage.getItem(FIREBASE_CONFIG_KEY);
    } catch (err) {
        // localStorage inaccesible (modo privado): no hay override posible.
        return { ...CANONICAL_FIREBASE_CONFIG };
    }

    if (raw === null) return { ...CANONICAL_FIREBASE_CONFIG };

    // Se purga sobre `raw`, no sobre el resultado de JSON.parse: una entrada
    // corrupta también hay que borrarla, o se queda ahí para siempre.
    const purge = (reason) => {
        try {
            localStorage.removeItem(FIREBASE_CONFIG_KEY);
        } catch (err) {
            // Nada que hacer si el navegador no deja escribir.
        }
        console.warn(`[firebase] ${FIREBASE_CONFIG_KEY} descartado: ${reason}. Se usa la configuración de ${CANONICAL_FIREBASE_CONFIG.projectId}.`);
    };

    let saved = null;
    try {
        saved = JSON.parse(raw);
    } catch (err) {
        saved = null;
    }

    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) {
        purge('no es un objeto de configuración válido');
        return { ...CANONICAL_FIREBASE_CONFIG };
    }

    if (saved.projectId !== CANONICAL_FIREBASE_CONFIG.projectId) {
        purge(`projectId "${saved.projectId}" no es "${CANONICAL_FIREBASE_CONFIG.projectId}"`);
        return { ...CANONICAL_FIREBASE_CONFIG };
    }

    // Mismo proyecto: se acepta, pero sobre la base canónica, para que un
    // override incompleto no deje campos sin definir.
    return { ...CANONICAL_FIREBASE_CONFIG, ...saved, projectId: CANONICAL_FIREBASE_CONFIG.projectId };
}

const explicitFirebaseConfig = resolveFirebaseConfig();

// El script clásico de index.html no puede importar este módulo, y necesita
// saber cuál es el proyecto legítimo para no ofrecer guardar otro.
window.firebaseCanonicalConfig = CANONICAL_FIREBASE_CONFIG;

try {
    const app = getApps().length ? getApp() : initializeApp(explicitFirebaseConfig);
    const auth = getAuth(app);
    // `initializeFirestore` en vez de `getFirestore` por una razón concreta:
    // el transporte por defecto de Firestore es un canal WebChannel de larga
    // duración contra `firestore.googleapis.com`. Los bloqueadores de anuncios
    // y bastantes proxies corporativos lo cortan (`ERR_BLOCKED_BY_CLIENT`), y
    // entonces cada lectura muere con `code: 'unavailable'` aunque la red y las
    // credenciales estén perfectas.
    //
    // `experimentalAutoDetectLongPolling` detecta ese caso y cae a long polling
    // sobre peticiones normales, que el bloqueador no distingue del resto del
    // tráfico. No afecta a la seguridad: mismas credenciales, mismas Rules,
    // mismos datos; solo cambia cómo viajan.
    const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });

    window.dbInstance = db;
    window.authInstance = auth;
    window.firebaseAuthUtils = { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, signInAnonymously, sendPasswordResetEmail };
    // `serverTimestamp` faltaba aquí: el script clásico lo invocaba
    // como global y lanzaba ReferenceError, lo que rompía el registro
    // de clientas. Todo lo que use el script clásico debe exponerse
    // explícitamente, porque son ámbitos distintos.
    window.firestoreUtils = { doc, setDoc, addDoc, getDoc, collection, query, where, getDocs, deleteDoc, serverTimestamp, runTransaction, onSnapshot };

    window.currentFirebaseUser = null;
    window.currentAdminProfile = null;

    window.isCurrentUserAdmin = async function (user = window.authInstance?.currentUser) {
        if (!user || user.isAnonymous) return false;

        try {
            const adminDocRef = doc(db, 'users', user.uid);
            const adminSnap = await getDoc(adminDocRef);
            return adminSnap.exists() && adminSnap.data()?.role === 'admin';
        } catch (err) {
            console.warn("Admin role check failed:", err);
            return false;
        }
    };

    window.refreshAdminSession = async function (user = window.authInstance?.currentUser) {
        window.currentFirebaseUser = user || null;
        const isAdmin = await window.isCurrentUserAdmin(user);
        window.isAdminAuthenticated = isAdmin;
        if (!isAdmin) {
            window.currentAdminProfile = null;
        }
        return isAdmin;
    };

    function clearAdminSessionMemory() {
        window.isAdminAuthenticated = false;
        window.currentAdminProfile = null;
        window.currentFirebaseUser = window.authInstance ? window.authInstance.currentUser : null;
        if (typeof window.unsubscribeAdminUsers === 'function') window.unsubscribeAdminUsers();
        if (typeof window.unsubscribeIncomeGoal === 'function') window.unsubscribeIncomeGoal();
        if (typeof window.unsubscribeAppointments === 'function') window.unsubscribeAppointments();
    }

    // La sesión anónima solo debe crearse cuando NO hay nadie autenticado.
    //
    // Antes se llamaba a `signInAnonymously()` al cargar el módulo, sin
    // condición. `signInAnonymously()` no respeta al usuario actual: si había
    // una clienta con sesión persistida, la sustituía por un anónimo nuevo. El
    // resultado era que recargar la página deslogueaba a la clienta.
    //
    // Ahora se decide dentro de `onAuthStateChanged`, que es el único momento
    // en el que Firebase ya ha restaurado la sesión guardada y `user` es un
    // dato fiable y no un estado intermedio.
    let anonymousSignInInFlight = false;

    function ensureAnonymousSession(user) {
        if (user || anonymousSignInInFlight) return;
        anonymousSignInInFlight = true;
        signInAnonymously(auth)
            .then(() => {
                console.log('Firebase Auth listo y conectado a:', explicitFirebaseConfig.projectId);
            })
            .catch(() => {
                console.warn('No pudimos abrir la sesión anónima del sitio público.');
            })
            .finally(() => {
                anonymousSignInInFlight = false;
            });
    }

    onAuthStateChanged(auth, async (user) => {
        window.currentFirebaseUser = user || null;

        ensureAnonymousSession(user);

        if (!user || user.isAnonymous) {
            clearAdminSessionMemory();
            return;
        }

        const isAdmin = await checkFirebaseAdminRole(user);
        if (!isAdmin) {
            clearAdminSessionMemory();
            // Cuenta de clienta: su sesión se rehidrata desde
            // Firestore, no desde lo que haya en localStorage, y solo
            // se le suscriben sus propias citas.
            if (typeof window.hydrateClientSession === 'function') {
                window.hydrateClientSession(user);
            }
            window.subscribeClientAppointments(user.uid);
            const adminPanel = document.getElementById('admin-panel-modal');
            if (adminPanel && !adminPanel.classList.contains('hidden')) {
                adminPanel.classList.add('hidden');
            }
            const adminAuth = document.getElementById('admin-auth-modal');
            if (adminAuth && !adminAuth.classList.contains('hidden')) {
                adminAuth.classList.add('hidden');
            }
            return;
        }

        window.isAdminAuthenticated = true;
        window.currentAdminProfile = { uid: user.uid, email: user.email || '', role: 'admin' };
        if (typeof window.subscribeAdminUsers === 'function') window.subscribeAdminUsers();
        if (typeof window.subscribeIncomeGoal === 'function') window.subscribeIncomeGoal();
        window.subscribeAdminAppointments();

        if (window.location.hash === '#admin' || window.location.pathname.endsWith('/admin')) {
            const authModal = document.getElementById('admin-auth-modal');
            if (authModal) authModal.classList.add('hidden');
            const panelModal = document.getElementById('admin-panel-modal');
            if (panelModal) panelModal.classList.remove('hidden');
            if (typeof window.renderAdminCharts === 'function') window.renderAdminCharts();
            if (typeof window.renderAdminBookingsTable === 'function') window.renderAdminBookingsTable();
            if (typeof window.renderAdminServicesEditor === 'function') window.renderAdminServicesEditor();
            if (typeof window.renderAdminGalleryEditor === 'function') window.renderAdminGalleryEditor();
            if (typeof loadDiscountFormValues === 'function') loadDiscountFormValues();
            if (typeof window.renderAdminBlockedDatesList === 'function') window.renderAdminBlockedDatesList();
        }

        if (typeof window.renderCommunityFeed === 'function') window.renderCommunityFeed();
        if (typeof window.renderReviewsList === 'function') window.renderReviewsList();
        if (typeof window.renderGalleryPortfolio === 'function') window.renderGalleryPortfolio();
    });

    // ── Disponibilidad pública: bookingSlots ────────────────────
    // Antes, TODA visitante abría un listener sobre `appointments`, es
    // decir recibía nombre, teléfono y notas de todas las clientas
    // solo por cargar la web. Ahora la disponibilidad se sirve desde
    // los locks, que no contienen ningún dato personal.
    window.lockedSlotsByDate = {};

    onSnapshot(collection(db, 'bookingSlots'), (snapshot) => {
        const slots = [];
        snapshot.forEach((docSnap) => {
            const data = docSnap.data() || {};
            slots.push({ id: docSnap.id, dateIso: data.dateIso, startTime: data.startTime });
        });

        window.lockedSlotsByDate = bookingSlots.groupLockedSlotsByDate(slots);

        if (typeof window.renderCalendar === 'function') window.renderCalendar();
        if (typeof window.renderTimeSlots === 'function') window.renderTimeSlots();
    }, (error) => {
        console.warn("No pudimos sincronizar la disponibilidad:", error);
    });

    // ── Citas ───────────────────────────────────────────────────
    // `appointments` contiene PII, así que ya no hay un listener
    // global. El admin ve la colección entera; la clienta solo sus
    // propias citas, mediante una query filtrada por `clientUid` que
    // es la única que las Rules permiten.
    let unsubscribeAppointments = null;

    function applyAppointmentsSnapshot(snapshot) {
        const allAppointments = [];
        snapshot.forEach((docSnap) => {
            allAppointments.push({ ...docSnap.data(), id: docSnap.id });
        });

        window.allAppointmentsList = allAppointments;

        if (typeof window.renderCalendar === 'function') window.renderCalendar();
        if (typeof window.renderTimeSlots === 'function') window.renderTimeSlots();
        if (typeof window.refreshUserAppointmentsUI === 'function') window.refreshUserAppointmentsUI();
        if (typeof window.renderAdminCharts === 'function' && window.isAdminAuthenticated) window.renderAdminCharts();
        if (typeof window.renderAdminBookingsTable === 'function' && window.isAdminAuthenticated) window.renderAdminBookingsTable();
        if (typeof window.renderAdminBirthdays === 'function' && window.isAdminAuthenticated) window.renderAdminBirthdays();
    }

    window.unsubscribeAppointments = function () {
        if (unsubscribeAppointments) {
            unsubscribeAppointments();
            unsubscribeAppointments = null;
        }
        window.allAppointmentsList = [];
    };

    window.subscribeAdminAppointments = function () {
        window.unsubscribeAppointments();
        unsubscribeAppointments = onSnapshot(
            collection(db, 'appointments'),
            applyAppointmentsSnapshot,
            (error) => console.warn("Firestore appointments sync error:", error)
        );
    };

    window.subscribeClientAppointments = function (uid) {
        window.unsubscribeAppointments();
        if (!uid) return;
        unsubscribeAppointments = onSnapshot(
            query(collection(db, 'appointments'), where('clientUid', '==', uid)),
            applyAppointmentsSnapshot,
            (error) => console.warn("Firestore client appointments sync error:", error)
        );
    };

    // La coleccion `users` contiene PII y solo es listable por admin.
    // Por eso la suscripcion se abre unicamente cuando hay una sesion
    // administrativa confirmada, y se cierra al perderla.
    let unsubscribeAdminUsers = null;

    window.subscribeAdminUsers = function () {
        if (unsubscribeAdminUsers) return;
        unsubscribeAdminUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
            const allUsers = [];
            snapshot.forEach((docSnap) => {
                allUsers.push({ uid: docSnap.id, id: docSnap.id, ...docSnap.data() });
            });

            window.allUsersList = allUsers;

            if (typeof window.renderAdminBirthdays === 'function' && window.isAdminAuthenticated) window.renderAdminBirthdays();
        }, (error) => {
            console.warn("Firestore users sync error", error);
        });
    };

    window.unsubscribeAdminUsers = function () {
        if (unsubscribeAdminUsers) {
            unsubscribeAdminUsers();
            unsubscribeAdminUsers = null;
        }
        window.allUsersList = [];
    };

    // Sincronización en tiempo real de Servicios personalizados (PC <-> Celular)
    onSnapshot(doc(db, 'settings', 'custom_services'), (docSnap) => {
        if (docSnap.exists() && docSnap.data().services) {
            if (typeof window.applyServicesData === 'function') {
                window.applyServicesData(docSnap.data().services);
            } else {
                window.SERVICES_DATA = docSnap.data().services;
            }
            localStorage.setItem('ncv_custom_services', JSON.stringify(window.SERVICES_DATA));
            if (typeof window.renderPublicServicesGrid === 'function') window.renderPublicServicesGrid();
            if (typeof window.renderMultiServicesCheckboxes === 'function') window.renderMultiServicesCheckboxes();
            if (typeof window.renderAdminServicesEditor === 'function' && window.isAdminAuthenticated) window.renderAdminServicesEditor();
        }
    }, (err) => { });

    // Sincronización en tiempo real de Configuración de Descuentos & Banner
    onSnapshot(doc(db, 'settings', 'discount_settings'), (docSnap) => {
        if (docSnap.exists()) {
            if (typeof window.applyDiscountSettings === 'function') {
                window.applyDiscountSettings(docSnap.data());
            } else {
                window.adminDiscountSettings = docSnap.data();
            }
            localStorage.setItem('ncv_discount_settings', JSON.stringify(window.adminDiscountSettings));
            if (typeof window.updateDiscountUIElements === 'function') window.updateDiscountUIElements();
        }
    }, (err) => { });

    // Sincronización en tiempo real de Días y Turnos Bloqueados (Horarios)
    onSnapshot(doc(db, 'settings', 'schedule_blocks'), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.blockedDates !== undefined) {
                localStorage.setItem('ncv_blocked_dates_list', JSON.stringify(data.blockedDates));
            }
            if (data.blockedSlots !== undefined) {
                localStorage.setItem('ncv_blocked_time_slots', JSON.stringify(data.blockedSlots));
            }
            if (typeof window.renderCalendar === 'function') window.renderCalendar();
            if (typeof window.renderTimeSlots === 'function') window.renderTimeSlots();
            if (typeof window.renderAdminBlockedDatesList === 'function' && window.isAdminAuthenticated) window.renderAdminBlockedDatesList();
            if (typeof window.renderAdminSlotPicker === 'function' && window.isAdminAuthenticated) window.renderAdminSlotPicker();
        }
    }, (err) => { });

    // Sincronización en tiempo real de Galería de Portafolio
    onSnapshot(doc(db, 'settings', 'gallery_items'), (docSnap) => {
        if (docSnap.exists() && docSnap.data().items) {
            window.GALLERY_ITEMS_DATA = docSnap.data().items;
            localStorage.setItem('ncv_gallery_items', JSON.stringify(window.GALLERY_ITEMS_DATA));
            if (typeof window.renderGalleryPortfolio === 'function') window.renderGalleryPortfolio();
            if (typeof window.renderAdminGalleryEditor === 'function' && window.isAdminAuthenticated) window.renderAdminGalleryEditor();
        }
    }, (err) => { });

    // Sincronización en tiempo real de la Llave de pago.
    // Firestore es la autoridad: el valor del HTML solo es el arranque
    // en frío mientras llega el primer snapshot.
    onSnapshot(doc(db, 'settings', 'payment_key'), (docSnap) => {
        if (docSnap.exists() && docSnap.data().value) {
            window.PAYMENT_KEY = String(docSnap.data().value);
            if (typeof window.applyPaymentKeyToUI === 'function') window.applyPaymentKeyToUI();
        }
    }, (err) => { });

    // Meta de ingresos: configuración privada del panel. Solo un admin
    // puede leerla, así que el listener se abre bajo demanda.
    let unsubscribeIncomeGoal = null;

    window.subscribeIncomeGoal = function () {
        if (unsubscribeIncomeGoal) return;
        unsubscribeIncomeGoal = onSnapshot(doc(db, 'settings', 'income_goal'), (docSnap) => {
            if (docSnap.exists()) {
                window.adminIncomeGoal = {
                    amount: Number(docSnap.data().amount) || 0,
                    type: docSnap.data().type || 'mensual'
                };
                if (typeof window.renderAdminCharts === 'function' && window.isAdminAuthenticated) window.renderAdminCharts();
            }
        }, (err) => { });
    };

    window.unsubscribeIncomeGoal = function () {
        if (unsubscribeIncomeGoal) {
            unsubscribeIncomeGoal();
            unsubscribeIncomeGoal = null;
        }
    };

    // Sincronización en tiempo real de las Reseñas.
    // Antes no existía: las reseñas se ESCRIBÍAN en Firestore pero se
    // LEÍAN de `localStorage`, así que cada clienta veía únicamente las
    // suyas y la moderación del admin no llegaba a nadie.
    onSnapshot(collection(db, 'reviews'), (snapshot) => {
        const reviews = [];
        snapshot.forEach((docSnap) => {
            reviews.push({ id: docSnap.id, ...docSnap.data() });
        });
        reviews.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

        window.clientReviewsList = reviews;
        localStorage.setItem('ncv_client_reviews', JSON.stringify(reviews));
        if (typeof window.renderReviewsList === 'function') window.renderReviewsList();
    }, (err) => {
        console.warn("No pudimos sincronizar las reseñas:", err);
    });

    // Sincronización en tiempo real del Muro de la Comunidad
    onSnapshot(collection(db, 'community_posts'), (snapshot) => {
        // Antes se ignoraba el snapshot vacío, así que borrar la última
        // publicación desde el panel dejaba el muro pintado con la
        // copia local: la moderación no se veía.
        const posts = [];
        snapshot.forEach((dSnap) => {
            posts.push({ id: dSnap.id, ...dSnap.data() });
        });
        posts.sort((a, b) => (b.id || '').localeCompare(a.id || ''));

        window.communityPostsList = posts;
        localStorage.setItem('ncv_community_posts', JSON.stringify(posts));
        if (typeof window.renderCommunityFeed === 'function') window.renderCommunityFeed();
    }, (err) => {
        console.warn("No pudimos sincronizar el muro de la comunidad:", err);
    });

} catch (e) {
    console.warn("Inicialización de Firebase omitida:", e);
}

// Módulos de lógica pura publicados para el script clásico de index.html.
// Se exponen aquí, en un solo sitio, para que quede claro qué depende de qué.
import * as timeUtils from "./time.js";
import * as availability from "./availability.js";

// Sello de build. Sirve para descartar en un segundo que el navegador esté
// sirviendo una copia cacheada o una carpeta distinta del repositorio: basta
// con comparar `window.RAMOS_BUILD.commit` con `git rev-parse --short HEAD`.
window.RAMOS_BUILD = {
    commit: '144dfe6+login-fix',
    loginDebug: 'v3',
    firestoreTransport: 'autoDetectLongPolling'
};

window.timeUtils = timeUtils;
window.availabilityUtils = availability;
