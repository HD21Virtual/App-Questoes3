import { initAuth } from './services/auth.js';
import { fetchAllQuestions } from './services/firestore.js';
import { setupAllEventListeners } from './event-listeners.js';
import { applyFilters, setupCustomSelects } from './features/filter.js';
import { initDOM } from './dom-elements.js';

async function main() {
    // 1. Initialize all DOM element references now that the page is loaded
    initDOM();

    // 2. Initialize authentication which sets up the user state and initial view
    initAuth();

    // 3. Set up all event listeners for the application
    setupAllEventListeners();

    // 4. Fetch initial data required for the app to function
    await fetchAllQuestions();

    // 5. Once data is fetched, setup UI components that depend on it
    setupCustomSelects();

    // 6. Apply default filters to show some questions initially
    applyFilters();
}

// Wait for the DOM to be fully loaded before running the main script
document.addEventListener('DOMContentLoaded', main);
