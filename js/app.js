import { initAuth } from './services/auth.js';
// ===== INÍCIO DA CORREÇÃO: Imports consolidados =====
// CORREÇÃO: Removido 'setupAllEventListeners'. Isso agora é chamado dentro de 'initAuth'.
import { fetchAllQuestions } from './services/firestore.js';
// ===== FIM DA CORREÇÃO =====
import { applyFilters, setupCustomSelects } from './features/filter.js';
import { initDOM } from './dom-elements.js';

async function main() {
    // 1. Initialize all DOM element references now that the page is loaded
    initDOM();

    // 2. Initialize authentication which sets up the user state and initial view
    // 'initAuth' agora é responsável por chamar 'setupAllListeners' com o user.uid
    initAuth();

    // 3. Set up all event listeners for the application (REMOVIDO)
    // setupAllEventListeners(); // <-- REMOVIDO (Chamado por initAuth)

    // 4. Fetch initial data required for the app to function
    await fetchAllQuestions();

    // 5. Once data is fetched, setup UI components that depend on it
    setupCustomSelects();

    // 6. Apply default filters to show some questions initially
    applyFilters();
}

// Wait for the DOM to be fully loaded before running the main script
document.addEventListener('DOMContentLoaded', main);
