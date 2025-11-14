import DOM from './dom-elements.js';
import { state, setState } from './state.js';
import { saveSessionStats } from './services/firestore.js';
import { navigateToView } from './ui/navigation.js';
import { resizeHomeCharts, resizeStatsCharts } from './ui/charts.js';

let isInitialSetup = true;

// --- Main Event Listener Setup ---

export function setupAllEventListeners() {
    if (DOM.sidebarToggleBtn && isInitialSetup) {
        DOM.sidebarToggleBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            if (window.innerWidth < 768) {
                document.body.classList.toggle('sidebar-open-mobile');
            } else {
                document.body.classList.toggle('sidebar-collapsed');
                setTimeout(() => {
                    if (DOM.inicioView && !DOM.inicioView.classList.contains('hidden')) resizeHomeCharts();
                    if (DOM.estatisticasView && !DOM.estatisticasView.classList.contains('hidden')) resizeStatsCharts();
                }, 350);
            }
        });
    }

    if (isInitialSetup) {
        document.addEventListener('click', async (event) => {
            const target = event.target;

            // Close menus on outside click
            if (document.body.classList.contains('sidebar-open-mobile') && !target.closest('#sidebar-nav') && !target.closest('#sidebar-toggle-btn')) {
                document.body.classList.remove('sidebar-open-mobile');
            }
            if (!target.closest('.caderno-menu-dropdown') && !target.closest('.caderno-menu-btn') && !target.closest('.folder-menu-btn')) {
                document.querySelectorAll('.caderno-menu-dropdown').forEach(d => d.classList.add('hidden'));
            }
            if (!target.closest('.folder-info-menu-dropdown') && !target.closest('#folder-info-menu-btn')) {
                document.querySelectorAll('.folder-info-menu-dropdown').forEach(d => d.classList.add('hidden'));
            }
            if (!target.closest('.custom-select-container')) {
                document.querySelectorAll('.custom-select-panel').forEach(panel => panel.classList.add('hidden'));
            }
            if (DOM.statsPeriodoPanel && !target.closest('#stats-periodo-button') && !target.closest('#stats-periodo-panel')) {
                DOM.statsPeriodoPanel.classList.add('hidden');
                if (DOM.statsPeriodoCustomRange) DOM.statsPeriodoCustomRange.classList.add('hidden');
            }

            if (target.closest('.nav-link')) {
                event.preventDefault();
                await navigateToView(target.closest('.nav-link').dataset.view);
                return true;
            }

            if (target.closest('#reset-all-progress-btn')) {
                if (!state.currentUser) return true;
                setState('deletingId', null);
                setState('deletingType', 'all-progress');
                if (DOM.confirmationModalTitle) DOM.confirmationModalTitle.textContent = 'Resetar Progresso';
                if (DOM.confirmationModalText) DOM.confirmationModalText.innerHTML = `Tem certeza que deseja apagar o seu progresso? Isso irá apagar <strong>SOMENTE</strong> suas estatísticas, resoluções de questões e agendamentos de revisão. <br><br>Seus filtros, pastas e cadernos serão mantidos. <br><span class="font-bold text-red-600">Esta ação não pode ser desfeita.</span>`;
                if (DOM.confirmationModal) DOM.confirmationModal.classList.remove('hidden');
                return true;
            }
        });

        window.addEventListener('pagehide', () => {
            if (state.currentUser && state.sessionStats.length > 0) {
                saveSessionStats();
            }
        });
    }

    isInitialSetup = false;
}
