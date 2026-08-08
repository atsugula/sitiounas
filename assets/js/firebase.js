// Arranque de Firebase: inicialización, sesión y suscripciones en tiempo real.
//
// Extraído de index.html en la Fase 11. Se carga como módulo ES, así que se
// ejecuta diferido: cuando corre, el script clásico ya definió sus funciones
// globales y el DOM está construido.

import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, EmailAuthProvider, reauthenticateWithCredential, updatePassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, addDoc, getDoc, collection, onSnapshot, getDocs, query, where, deleteDoc, serverTimestamp, runTransaction } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import * as bookingSlots from "./booking-slots.js";
import * as loyalty from "./loyalty.js";
import * as sanitize from "./sanitize.js";

// La aritmética de locks y las reglas de fidelidad viven en módulos
// aparte para poder probarlas con `node --test`. Aquí solo se publican
// para el script clásico.
window.bookingSlotUtils = bookingSlots;
window.loyaltyUtils = loyalty;
window.sanitizeUtils = sanitize;

const savedFbConfig = JSON.parse(localStorage.getItem('ncv_firebase_config') || 'null');

// Proyecto Firebase de Ramos Nails. Estos valores son públicos por diseño en
// Firebase Web: `apiKey` identifica al proyecto, no autoriza nada. Lo que
// protege los datos son las Rules, no esta clave.
//
// `ncv_firebase_config` en localStorage sigue teniendo prioridad para poder
// apuntar a otro proyecto en pruebas sin tocar el código. Ojo: un navegador
// que conserve la config del proyecto anterior seguirá usándola hasta que se
// limpie esa clave.
const explicitFirebaseConfig = savedFbConfig || {
    apiKey: "AIzaSyC5LskLSBP7BaeqqxbKb697Tv4zSTCOLWw",
    authDomain: "ramos-nails.firebaseapp.com",
    projectId: "ramos-nails",
    storageBucket: "ramos-nails.firebasestorage.app",
    messagingSenderId: "653901900568",
    appId: "1:653901900568:web:69e74cf542c73d79d18c6d",
    measurementId: "G-7KJ8YPJ511"
};

try {
    const app = getApps().length ? getApp() : initializeApp(explicitFirebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);

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

    onAuthStateChanged(auth, async (user) => {
        window.currentFirebaseUser = user || null;

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

    signInAnonymously(auth).then(() => {
        console.log("Firebase Auth listo y conectado a:", explicitFirebaseConfig.projectId);
    }).catch((err) => {
        console.warn("Firebase Auth fallback activado.");
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

window.timeUtils = timeUtils;
window.availabilityUtils = availability;
