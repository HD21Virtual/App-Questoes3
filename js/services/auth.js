import {
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    GoogleAuthProvider,
    signInWithPopup,
    signOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { auth } from '../firebase-config.js';
// --- CORREÇÃO: Importar 'state' e 'saveSessionStats' ---
import { state, setState, resetStateOnLogout, clearUnsubscribes, clearSessionStats, subscribe } from '../state.js';
// CORREÇÃO: Importar saveSessionStats para salvar o progresso ao deslogar
import { setupAllListeners, saveSessionStats } from '../services/firestore.js';
import { updateUserUI } from '../ui/ui-helpers.js';
import { closeAuthModal } from '../ui/modal.js';
import DOM from '../dom-elements.js';
import { navigateToView } from "../ui/navigation.js";

export function initAuth() {
    // ===== INÍCIO DA MODIFICAÇÃO: Callback agora é async =====
    onAuthStateChanged(auth, async (user) => {
    // ===== FIM DA MODIFICAÇÃO =====
        clearUnsubscribes();
        setState('currentUser', user);

        if (user) {
            closeAuthModal();
            setupAllListeners(user.uid);
            // ===== INÍCIO DA MODIFICAÇÃO: Adicionado await =====
            await navigateToView('inicio-view');
            // ===== FIM DA MODIFICAÇÃO =====
        } else {
            resetStateOnLogout();
            // ===== INÍCIO DA MODIFICAÇÃO: Adicionado await =====
            await navigateToView('inicio-view');
            // ===== FIM DA MODIFICAÇÃO =====
        }
    });
}

export async function handleAuth(action) {
    DOM.authError.classList.add('hidden');
    try {
        if (action === 'login') {
            await signInWithEmailAndPassword(auth, DOM.emailInput.value, DOM.passwordInput.value);
        } else if (action === 'register') {
            await createUserWithEmailAndPassword(auth, DOM.emailInput.value, DOM.passwordInput.value);
        } else if (action === 'logout') {
            // ===== INÍCIO DA MODIFICAÇÃO (BUG FIX) =====
            // Salva a sessão atual ANTES de fazer o logout
            if (state.currentUser && state.sessionStats.length > 0) {
                await saveSessionStats();
                clearSessionStats(); // Limpa localmente após salvar
            }
            await signOut(auth);
            // ===== FIM DA MODIFICAÇÃO =====
        }
    } catch (error) {
        DOM.authError.textContent = error.message;
        DOM.authError.classList.remove('hidden');
    }
}

export async function handleGoogleAuth() {
    DOM.authError.classList.add('hidden');
    try {
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
    } catch (error) {
        DOM.authError.textContent = error.message;
        DOM.authError.classList.remove('hidden');
    }
}

subscribe('currentUser', updateUserUI);
