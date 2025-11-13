import DOM from './dom-elements.js';
import { state, setState, clearSessionStats } from './state.js';
import {
    closeSaveModal, closeCadernoModal, closeNameModal, handleConfirmation,
    openSaveModal, openCadernoModal, openNameModal, openLoadModal, closeLoadModal,
    handleLoadModalEvents, updateSavedFiltersList, closeConfirmationModal,
    closeStatsModal, openAuthModal, closeAuthModal, openSubfolderModal,
    closeSubfolderModal
} from './ui/modal.js';
import { createCaderno, createOrUpdateName, saveFilter, saveSessionStats } from './services/firestore.js';
import { handleStatsFilter } from "./features/stats.js";
import { handleAuth, handleGoogleAuth } from './services/auth.js';
import {
    handleAddQuestionsToCaderno, handleCadernoItemClick, handleFolderItemClick,
    handleBackToFolders, cancelAddQuestions,
    addFilteredQuestionsToCaderno, toggleMoveMode, cancelMoveMode,
    handleMoveFooterFolderSelect, confirmMoveSelectedItems
} from './features/caderno.js';
import { removeQuestionFromCaderno } from './features/caderno-actions.js';
import { handleAssuntoListClick, handleMateriaListClick, handleBackToMaterias } from './features/materias.js';
import { handleStartReview, handleSrsFeedback, renderReviewView } from './features/srs.js';
import { navigateQuestion, handleOptionSelect, checkAnswer, handleDiscardOption } from './features/question-viewer.js';
import { applyFilters, clearAllFilters, removeFilter } from './features/filter.js';
import { navigateToView } from './ui/navigation.js';
import { updateSelectedFiltersDisplay } from './ui/ui-helpers.js';
import { resizeHomeCharts, resizeStatsCharts } from './ui/charts.js';

// --- Handlers for specific actions ---
const handleSaveFilter = async () => {
    const name = DOM.filterNameInput.value.trim();
    if (!name || !state.currentUser) return;
    const currentFilters = {
        name: name,
        materias: JSON.parse(DOM.materiaFilter.dataset.value || '[]'),
        assuntos: JSON.parse(DOM.assuntoFilter.dataset.value || '[]'),
        tipo: DOM.tipoFilterGroup.querySelector('.active-filter')?.dataset.value || 'todos',
        search: DOM.searchInput.value
    };
    await saveFilter(currentFilters);
    DOM.filterNameInput.value = '';
    closeSaveModal();
};

const handleNameConfirm = async () => {
    const name = DOM.nameInput.value.trim();
    if (!name || !state.currentUser || !state.editingType) return;
    await createOrUpdateName(state.editingType, name, state.editingId);
    closeNameModal();
};

const handleCadernoConfirm = async () => {
    const name = DOM.cadernoNameInput.value.trim();
    if (!name || !state.currentUser) return;
    const folderId = DOM.folderSelect.value || null;
    let questionIds = [];
    if (state.createCadernoWithFilteredQuestions) {
        questionIds = state.filteredQuestions.map(q => q.id);
    }
    await createCaderno(name, questionIds, folderId);
    DOM.cadernoNameInput.value = '';
    closeCadernoModal();
};

function handleStatsTableSelection(event) {
    const target = event.target;
    if (!target.matches('input[type="checkbox"]')) return;

    const tableContainer = DOM.statsDesempenhoMateriaContainer;
    if (!tableContainer) return;

    const allCheckboxes = tableContainer.querySelectorAll('.row-checkbox');
    const selectAllCheckbox = tableContainer.querySelector('#select-all-stats-checkbox');

    if (target.id === 'select-all-stats-checkbox') {
        const isChecked = target.checked;
        allCheckboxes.forEach(cb => {
            cb.checked = isChecked;
            cb.closest('tr').classList.toggle('selected-row', isChecked);
            cb.indeterminate = false;
        });
    } else if (target.classList.contains('row-checkbox')) {
        const row = target.closest('tr');
        const rowId = row.dataset.id;
        const isChecked = target.checked;
        row.classList.toggle('selected-row', isChecked);

        const childRows = tableContainer.querySelectorAll(`tr[data-parent-id="${rowId}"]`);
        childRows.forEach(child => {
            const childCheckbox = child.querySelector('.row-checkbox');
            childCheckbox.checked = isChecked;
            child.classList.toggle('selected-row', isChecked);
            childCheckbox.indeterminate = false;

            const grandChildRows = tableContainer.querySelectorAll(`tr[data-parent-id="${child.dataset.id}"]`);
            grandChildRows.forEach(gc => {
                const gcCheckbox = gc.querySelector('.row-checkbox');
                gcCheckbox.checked = isChecked;
                gc.classList.toggle('selected-row', isChecked);

                const greatGrandChildRows = tableContainer.querySelectorAll(`tr[data-parent-id="${gc.dataset.id}"]`);
                greatGrandChildRows.forEach(ggc => {
                    const ggcCheckbox = ggc.querySelector('.row-checkbox');
                    ggcCheckbox.checked = isChecked;
                    ggc.classList.toggle('selected-row', isChecked);
                });
            });
        });

        let parentId = row.dataset.parentId;
        while (parentId) {
            const parentRow = tableContainer.querySelector(`tr[data-id="${parentId}"]`);
            if (!parentRow) break;
            const parentCheckbox = parentRow.querySelector('.row-checkbox');
            const siblingRows = tableContainer.querySelectorAll(`tr[data-parent-id="${parentId}"]`);
            const siblingCheckboxes = Array.from(siblingRows).map(r => r.querySelector('.row-checkbox'));

            const checkedSiblings = siblingCheckboxes.filter(cb => cb.checked).length;
            const indeterminateSiblings = siblingCheckboxes.filter(cb => cb.indeterminate).length;

            if (checkedSiblings === 0 && indeterminateSiblings === 0) {
                parentCheckbox.checked = false;
                parentCheckbox.indeterminate = false;
            } else if (checkedSiblings === siblingCheckboxes.length) {
                parentCheckbox.checked = true;
                parentCheckbox.indeterminate = false;
            } else {
                parentCheckbox.checked = false;
                parentCheckbox.indeterminate = true;
            }
            parentRow.classList.toggle('selected-row', parentCheckbox.checked || parentCheckbox.indeterminate);

            parentId = parentRow.dataset.parentId;
        }

        const allChecked = tableContainer.querySelectorAll('.row-checkbox:checked').length;
        const allIndeterminate = tableContainer.querySelectorAll('.row-checkbox:indeterminate').length;
        if (allChecked === 0 && allIndeterminate === 0) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        } else if (allChecked === allCheckboxes.length) {
            selectAllCheckbox.checked = true;
            selectAllCheckbox.indeterminate = false;
        } else {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = true;
        }
    }

    let totalResolvidas = 0;
    let totalAcertos = 0;
    let totalErros = 0;

    const selectedRows = tableContainer.querySelectorAll('tr.selected-row');
    selectedRows.forEach(row => {
        const rowId = row.dataset.id;
        const isParentOfSelected = tableContainer.querySelector(`tr.selected-row[data-parent-id="${rowId}"]`);

        if (!isParentOfSelected) {
            totalResolvidas += parseInt(row.dataset.total || 0, 10);
            totalAcertos += parseInt(row.dataset.correct || 0, 10);
            totalErros += parseInt(row.dataset.incorrect || 0, 10);
        }
    });

    if (DOM.statsFooterResolvidas) DOM.statsFooterResolvidas.textContent = totalResolvidas;
    if (DOM.statsFooterAcertos) DOM.statsFooterAcertos.textContent = totalAcertos;
    if (DOM.statsFooterErros) DOM.statsFooterErros.textContent = totalErros;
}

function handleReviewTableSelection(checkbox) {
    const row = checkbox.closest('tr');
    const rowId = row.dataset.id;
    const isChecked = checkbox.checked;

    const updateChildren = (parentId, checked) => {
        const children = document.querySelectorAll(`tr[data-parent-id="${parentId}"]`);
        children.forEach(child => {
            const cb = child.querySelector('.review-checkbox:not(:disabled)');
            if (cb) {
                cb.checked = checked;
                cb.indeterminate = false;
            }
            updateChildren(child.dataset.id, checked);
        });
    };
    updateChildren(rowId, isChecked);

    let parentId = row.dataset.parentId;
    while (parentId) {
        const parentRow = document.querySelector(`tr[data-id="${parentId}"]`);
        if (!parentRow) break;

        const parentCheckbox = parentRow.querySelector('.review-checkbox');
        if (!parentCheckbox) break;

        const siblingCheckboxes = Array.from(document.querySelectorAll(`tr[data-parent-id="${parentId}"] .review-checkbox:not(:disabled)`));

        if (siblingCheckboxes.length > 0) {
            const checkedSiblings = siblingCheckboxes.filter(cb => cb.checked).length;
            const indeterminateSiblings = siblingCheckboxes.filter(cb => cb.indeterminate).length;

            if (checkedSiblings === 0 && indeterminateSiblings === 0) {
                parentCheckbox.checked = false;
                parentCheckbox.indeterminate = false;
            } else if (checkedSiblings === siblingCheckboxes.length) {
                parentCheckbox.checked = true;
                parentCheckbox.indeterminate = false;
            } else {
                parentCheckbox.checked = false;
                parentCheckbox.indeterminate = true;
            }
        }
        parentId = parentRow.dataset.parentId;
    }

    const selectAllCheckbox = DOM.reviewTableContainer.querySelector('#select-all-review-materias');
    const allTopLevelCheckboxes = Array.from(document.querySelectorAll(`tr[data-level="1"] .review-checkbox:not(:disabled)`));

    if (allTopLevelCheckboxes.length > 0) {
        const checkedTopLevel = allTopLevelCheckboxes.filter(cb => cb.checked).length;
        const indeterminateTopLevel = allTopLevelCheckboxes.filter(cb => cb.indeterminate).length;

        if (checkedTopLevel === 0 && indeterminateTopLevel === 0) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        } else if (checkedTopLevel === allTopLevelCheckboxes.length) {
            selectAllCheckbox.checked = true;
            selectAllCheckbox.indeterminate = false;
        } else {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = true;
        }
    }

    const anyChecked = DOM.reviewTableContainer.querySelector('.review-checkbox:checked');
    DOM.startSelectedReviewBtn.disabled = !anyChecked;
}

// --- Refactored Event Handlers for UI Areas ---

async function handleAuthEvents(target, targetId) {
    if (target.closest('#show-login-modal-btn') || target.closest('#login-from-empty') || target.closest('#show-login-modal-btn-sidebar')) {
        openAuthModal();
        return true;
    }
    if (targetId === 'login-btn') {
        await handleAuth('login');
        return true;
    }
    if (targetId === 'register-btn') {
        await handleAuth('register');
        return true;
    }
    if (targetId === 'google-login-btn') {
        await handleGoogleAuth();
        return true;
    }
    if (target.closest('#logout-btn') || target.closest('#logout-btn-sidebar')) {
        await handleAuth('logout');
        return true;
    }
    return false;
}

async function handleModalEvents(target, targetId) {
    if (target.closest('#close-auth-modal')) { closeAuthModal(); return true; }
    if (target.closest('#save-filter-btn')) { openSaveModal(); return true; }
    if (target.closest('#close-save-modal') || target.closest('#cancel-save-btn')) { closeSaveModal(); return true; }
    if (target.closest('#confirm-save-btn')) { await handleSaveFilter(); return true; }
    if (target.closest('#saved-filters-list-btn')) { openLoadModal(); return true; }
    if (target.closest('#close-load-modal')) { closeLoadModal(); return true; }
    if (target.closest('#saved-filters-list-container')) { handleLoadModalEvents(event); return true; }
    if (target.closest('#create-caderno-btn')) { openCadernoModal(true); return true; }
    if (target.closest('#add-caderno-to-folder-btn')) { openCadernoModal(false, state.currentFolderId); return true; }
    if (target.closest('#close-caderno-modal') || target.closest('#cancel-caderno-btn')) { closeCadernoModal(); return true; }
    if (target.closest('#confirm-caderno-btn')) { await handleCadernoConfirm(); return true; }
    if (target.closest('#create-folder-btn')) { openNameModal('folder'); return true; }
    if (target.closest('#close-name-modal') || target.closest('#cancel-name-btn')) { closeNameModal(); return true; }
    if (target.closest('#confirm-name-btn')) { await handleNameConfirm(); return true; }
    if (target.closest('#cancel-confirmation-btn')) { closeConfirmationModal(); return true; }
    if (target.closest('#confirm-delete-btn')) { await handleConfirmation(); return true; }
    if (target.closest('#close-stats-modal')) { closeStatsModal(); return true; }
    if (target.closest('.create-subfolder-btn')) {
        event.preventDefault();
        openSubfolderModal();
        const dropdown = target.closest('.folder-info-menu-dropdown');
        if (dropdown) dropdown.classList.add('hidden');
        return true;
    }
    if (target.closest('#cancel-subfolder-btn')) { closeSubfolderModal(); return true; }
    if (target.closest('#confirm-subfolder-btn')) {
        const name = DOM.subfolderNameInput.value.trim();
        if (name && state.currentUser && state.currentFolderId) {
            await createOrUpdateName('folder', name, null, state.currentFolderId);
        }
        closeSubfolderModal();
        return true;
    }
    return false;
}

async function handleQuestionEvents(target) {
    if (target.closest('#prev-question-btn')) { await navigateQuestion('prev'); return true; }
    if (target.closest('#next-question-btn')) { await navigateQuestion('next'); return true; }
    if (target.closest('.option-item') && !target.closest('.discard-btn')) { handleOptionSelect(event); return true; }
    if (target.closest('#submit-btn')) { await checkAnswer(); return true; }
    if (target.closest('.discard-btn')) { handleDiscardOption(event); return true; }
    if (target.closest('.srs-feedback-btn')) { await handleSrsFeedback(target.closest('.srs-feedback-btn').dataset.feedback); return true; }
    if (target.closest('.remove-question-btn')) { removeQuestionFromCaderno(target.closest('.remove-question-btn').dataset.questionId); return true; }
    return false;
}

async function handleCadernoEvents(target) {
    if (target.closest('.caderno-menu-btn')) {
        const button = target.closest('.caderno-menu-btn');
        const dropdown = document.getElementById(`menu-dropdown-${button.dataset.cadernoId}`);
        if (dropdown) {
            document.querySelectorAll('.caderno-menu-dropdown, .folder-info-menu-dropdown').forEach(d => {
                if (d.id !== dropdown.id) d.classList.add('hidden');
            });
            dropdown.classList.toggle('hidden');
        }
        return true;
    }
    if (target.closest('.folder-menu-btn')) {
        const button = target.closest('.folder-menu-btn');
        const dropdown = document.getElementById(`menu-dropdown-folder-${button.dataset.folderId}`);
        if (dropdown) {
            document.querySelectorAll('.caderno-menu-dropdown, .folder-info-menu-dropdown').forEach(d => {
                if (d.id !== dropdown.id) d.classList.add('hidden');
            });
            dropdown.classList.toggle('hidden');
        }
        return true;
    }
    if (target.closest('.edit-folder-btn')) {
        const btn = target.closest('.edit-folder-btn');
        openNameModal('folder', btn.dataset.id, btn.dataset.name);
        return true;
    }
    if (target.closest('.delete-folder-btn')) {
        const btn = target.closest('.delete-folder-btn');
        const folderId = btn.dataset.id;
        const folderName = btn.dataset.name || state.userFolders.find(f => f.id === folderId)?.name || 'esta pasta';
        setState('deletingId', folderId);
        setState('deletingType', 'folder');
        if (DOM.confirmationModalTitle) DOM.confirmationModalTitle.textContent = `Excluir Pasta`;
        if (DOM.confirmationModalText) DOM.confirmationModalText.innerHTML = `Deseja excluir a pasta <strong>"${folderName}"</strong>? <br><br> <span class="font-bold text-red-600">Todos os cadernos e subpastas dentro dela também serão excluídos.</span>`;
        if (DOM.confirmationModal) DOM.confirmationModal.classList.remove('hidden');
        return true;
    }
    if (target.closest('.edit-caderno-btn')) {
        const btn = target.closest('.edit-caderno-btn');
        openNameModal('caderno', btn.dataset.id, btn.dataset.name);
        return true;
    }
    if (target.closest('.delete-caderno-btn')) {
        const btn = target.closest('.delete-caderno-btn');
        const cadernoId = btn.dataset.id;
        const cadernoName = btn.dataset.name || state.userCadernos.find(c => c.id === cadernoId)?.name || 'este caderno';
        setState('deletingId', cadernoId);
        setState('deletingType', 'caderno');
        if (DOM.confirmationModalTitle) DOM.confirmationModalTitle.textContent = `Excluir Caderno`;
        if (DOM.confirmationModalText) DOM.confirmationModalText.innerHTML = `Deseja excluir o caderno <strong>"${cadernoName}"</strong>?`;
        if (DOM.confirmationModal) DOM.confirmationModal.classList.remove('hidden');
        return true;
    }
    if (target.closest('#folder-info-menu-btn')) {
        const button = target.closest('#folder-info-menu-btn');
        const dropdown = document.getElementById(`folder-info-menu-dropdown-${button.dataset.folderId}`);
        if (dropdown) {
            document.querySelectorAll('.caderno-menu-dropdown, .folder-info-menu-dropdown').forEach(d => {
                if (d.id !== dropdown.id) d.classList.add('hidden');
            });
            dropdown.classList.toggle('hidden');
        }
        return true;
    }
    if (target.closest('.toggle-folder-contents')) {
        const toggleSpan = target.closest('.toggle-folder-contents');
        const folderId = toggleSpan.dataset.folderId;
        if (folderId) {
            const isCurrentlyExpanded = toggleSpan.textContent === toggleSpan.dataset.textCollapse;
            const isExpanded = !isCurrentlyExpanded;
            toggleSpan.textContent = isExpanded ? toggleSpan.dataset.textCollapse : toggleSpan.dataset.textExpand;
            document.querySelectorAll(`.notebook-child-of-${folderId}`).forEach(row => {
                row.classList.toggle('hidden', !isExpanded);
            });
        }
        return true;
    }
    if (target.closest('#saved-cadernos-list-container')) {
        handleCadernoItemClick(event);
        handleFolderItemClick(event);
        return true;
    }
    if (target.closest('#back-to-folders-btn')) { handleBackToFolders(); return true; }
    if (target.closest('#add-questions-to-caderno-btn')) { await handleAddQuestionsToCaderno(); return true; }
    if (target.closest('#cancel-add-questions-btn')) { await cancelAddQuestions(); return true; }
    if (target.closest('.toggle-move-mode-btn-from-dropdown')) {
        const button = target.closest('.toggle-move-mode-btn-from-dropdown');
        setState('itemToPreselectOnMove', { id: button.dataset.cadernoId, type: 'caderno' });
        toggleMoveMode();
        const dropdown = target.closest('.caderno-menu-dropdown');
        if (dropdown) dropdown.classList.add('hidden');
        return true;
    }
    if (target.closest('#cancel-move-selected-btn')) { cancelMoveMode(); return true; }
    if (target.closest('#confirm-move-selected-btn')) { await confirmMoveSelectedItems(); return true; }
    return false;
}

async function handleMateriasEvents(target) {
    if (target.closest('#materias-list-container')) { handleMateriaListClick(event); return true; }
    if (target.closest('#assuntos-list-container')) { await handleAssuntoListClick(event); return true; }
    if (target.closest('#back-to-materias-btn')) { handleBackToMaterias(); return true; }
    return false;
}

async function handleReviewEvents(target) {
    if (target.closest('#start-selected-review-btn')) { await handleStartReview(); return true; }
    if (target.closest('#exit-review-mode-btn')) {
        setState('isReviewSession', false);
        if (DOM.reviewQuestionContainer) DOM.reviewQuestionContainer.classList.add('hidden');
        if (DOM.reviewTableContainer) DOM.reviewTableContainer.classList.remove('hidden');
        if (DOM.startSelectedReviewBtn) DOM.startSelectedReviewBtn.classList.remove('hidden');
        clearSessionStats();
        setState('filteredQuestions', []);
        setState('currentQuestionIndex', 0);
        renderReviewView();
        return true;
    }
    if (target.closest('.toggle-review-row')) {
        const row = target.closest('tr');
        const rowId = row.dataset.id;
        const isExpanded = target.classList.toggle('rotate-90');
        document.querySelectorAll(`tr[data-parent-id="${rowId}"]`).forEach(childRow => {
            childRow.classList.toggle('hidden', !isExpanded);
            if (!isExpanded) {
                const childIcon = childRow.querySelector('.toggle-review-row');
                if (childIcon && childIcon.classList.contains('rotate-90')) {
                    childIcon.classList.remove('rotate-90');
                    const grandChildRows = document.querySelectorAll(`tr[data-parent-id="${childRow.dataset.id}"]`);
                    grandChildRows.forEach(gc => gc.classList.add('hidden'));
                }
            }
        });
        return true;
    }
    return false;
}

async function handleFilterEvents(target) {
    if (target.closest('#filter-btn')) {
        if (state.isAddingQuestionsMode.active) {
            await addFilteredQuestionsToCaderno();
        } else {
            await applyFilters();
        }
        return true;
    }
    if (target.closest('#clear-filters-btn')) { clearAllFilters(); return true; }
    if (target.closest('.remove-filter-btn')) {
        const btn = target.closest('.remove-filter-btn');
        removeFilter(btn.dataset.filterType, btn.dataset.filterValue);
        return true;
    }
    if (target.closest('.filter-btn-toggle')) {
        const group = target.closest('.filter-btn-group');
        if (group) {
            const currentActive = group.querySelector('.active-filter');
            if (currentActive) currentActive.classList.remove('active-filter');
            target.classList.add('active-filter');
            updateSelectedFiltersDisplay();
        }
        return true;
    }
    if (target.closest('#toggle-filters-btn')) {
        DOM.filterCard.classList.toggle('hidden');
        const isHidden = DOM.filterCard.classList.contains('hidden');
        const btn = target.closest('#toggle-filters-btn');
        btn.innerHTML = isHidden
            ? `<i class="fas fa-eye mr-2"></i> Mostrar Filtros`
            : `<i class="fas fa-eye-slash mr-2"></i> Ocultar Filtros`;
        return true;
    }
    return false;
}

async function handleNavigationEvents(target) {
    if (target.closest('.nav-link')) {
        event.preventDefault();
        await navigateToView(target.closest('.nav-link').dataset.view);
        return true;
    }
    return false;
}

async function handleStatsEvents(target) {
    if (target.closest('#stats-periodo-button')) {
        event.preventDefault();
        DOM.statsPeriodoPanel.classList.toggle('hidden');
        return true;
    }
    if (target.closest('.period-option-item')) {
        const selectedOption = target.closest('.period-option-item');
        const value = selectedOption.dataset.value;
        let text = selectedOption.textContent;
        let startDate, endDate;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const formatDate = (date) => {
            const d = date.getDate().toString().padStart(2, '0');
            const m = (date.getMonth() + 1).toString().padStart(2, '0');
            const y = date.getFullYear();
            return `${d}/${m}/${y}`;
        };
        const formatDateForInput = (date) => {
            const d = date.getDate().toString().padStart(2, '0');
            const m = (date.getMonth() + 1).toString().padStart(2, '0');
            const y = date.getFullYear();
            return `${y}-${m}-${d}`;
        }
        switch (value) {
            case 'hoje': startDate = new Date(today); endDate = new Date(today); text = formatDate(today); break;
            case 'ontem': const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1); startDate = new Date(yesterday); endDate = new Date(yesterday); text = formatDate(yesterday); break;
            case 'ultimos-7-dias': const sevenDaysAgo = new Date(today); sevenDaysAgo.setDate(today.getDate() - 6); startDate = new Date(sevenDaysAgo); endDate = new Date(today); text = `${formatDate(sevenDaysAgo)} - ${formatDate(today)}`; break;
            case 'ultimos-15-dias': const fifteenDaysAgo = new Date(today); fifteenDaysAgo.setDate(today.getDate() - 14); startDate = new Date(fifteenDaysAgo); endDate = new Date(today); text = `${formatDate(fifteenDaysAgo)} - ${formatDate(today)}`; break;
            case 'este-mes': const firstDayMonth = new Date(today.getFullYear(), today.getMonth(), 1); startDate = new Date(firstDayMonth); endDate = new Date(today); text = `${formatDate(firstDayMonth)} - ${formatDate(today)}`; break;
            case 'mes-passado': const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1); const firstDayLastMonth = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1); const lastDayLastMonth = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0); startDate = new Date(firstDayLastMonth); endDate = new Date(lastDayLastMonth); text = `${formatDate(firstDayLastMonth)} - ${formatDate(lastDayLastMonth)}`; break;
            case 'ultimos-6-meses': const sixMonthsAgo = new Date(today); sixMonthsAgo.setMonth(today.getMonth() - 6); startDate = new Date(sixMonthsAgo); endDate = new Date(today); text = `${formatDate(sixMonthsAgo)} - ${formatDate(today)}`; break;
            case 'ultimo-ano': const oneYearAgo = new Date(today); oneYearAgo.setFullYear(today.getFullYear() - 1); startDate = new Date(oneYearAgo); endDate = new Date(today); text = `${formatDate(oneYearAgo)} - ${formatDate(today)}`; break;
            case 'tudo': text = 'Tudo'; startDate = null; endDate = null; break;
        }
        DOM.statsPeriodoOptions.querySelectorAll('.period-option-item').forEach(opt => opt.classList.remove('active'));
        if (value === 'personalizado') {
            DOM.statsPeriodoCustomRange.classList.remove('hidden');
            selectedOption.classList.add('active');
            const lastStart = DOM.statsPeriodoButton.dataset.startDate;
            const lastEnd = DOM.statsPeriodoButton.dataset.endDate;
            DOM.statsPeriodoStart.value = lastStart || formatDateForInput(today);
            DOM.statsPeriodoEnd.value = lastEnd || formatDateForInput(today);
        } else {
            DOM.statsPeriodoValue.textContent = text;
            DOM.statsPeriodoButton.dataset.value = value;
            DOM.statsPeriodoButton.dataset.startDate = startDate ? formatDateForInput(startDate) : '';
            DOM.statsPeriodoButton.dataset.endDate = endDate ? formatDateForInput(endDate) : '';
            selectedOption.classList.add('active');
            DOM.statsPeriodoPanel.classList.add('hidden');
            DOM.statsPeriodoCustomRange.classList.add('hidden');
        }
        return true;
    }
    if (target.closest('#stats-periodo-custom-apply')) {
        event.preventDefault();
        const start = DOM.statsPeriodoStart.value;
        const end = DOM.statsPeriodoEnd.value;
        if (start && end) {
            const startDate = new Date(start + 'T00:00:00');
            const endDate = new Date(end + 'T00:00:00');
            if (startDate > endDate) { return; }
            const formattedStart = start.split('-').reverse().join('/');
            const formattedEnd = end.split('-').reverse().join('/');
            const text = `${formattedStart} - ${formattedEnd}`;
            DOM.statsPeriodoValue.textContent = text;
            DOM.statsPeriodoButton.dataset.value = 'personalizado';
            DOM.statsPeriodoButton.dataset.startDate = start;
            DOM.statsPeriodoButton.dataset.endDate = end;
            DOM.statsPeriodoPanel.classList.add('hidden');
            DOM.statsPeriodoCustomRange.classList.add('hidden');
        }
        return true;
    }
    if (target.closest('#stats-tabs-container .tab-button')) {
        const tabButton = target.closest('#stats-tabs-container .tab-button');
        const tabName = tabButton.dataset.tab;
        if (!tabButton.classList.contains('active')) {
            DOM.statsTabsContainer.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('#stats-tabs-content-container .stats-tab-content').forEach(content => content.classList.add('hidden'));
            tabButton.classList.add('active');
            const activeContent = document.getElementById(`${tabName}-tab`);
            if (activeContent) activeContent.classList.remove('hidden');
        }
        return true;
    }
    if (target.closest('.tree-table .toggle-icon:not(.no-children)')) {
        const row = target.closest('.tree-table-row');
        if (row) {
            const rowId = row.dataset.id;
            const icon = row.querySelector('.toggle-icon');
            icon.classList.toggle('rotate-90');
            const isExpanded = icon.classList.contains('rotate-90');
            const childRows = document.querySelectorAll(`.tree-table-row[data-parent-id="${rowId}"]`);
            childRows.forEach(child => {
                child.classList.toggle('hidden-row', !isExpanded);
                if (!isExpanded) {
                    const childIcon = child.querySelector('.toggle-icon');
                    if (childIcon && childIcon.classList.contains('rotate-90')) {
                        childIcon.classList.remove('rotate-90');
                        const grandChildRows = document.querySelectorAll(`.tree-table-row[data-parent-id="${child.dataset.id}"]`);
                        grandChildRows.forEach(gc => gc.classList.add('hidden-row'));
                    }
                }
            });
        }
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
    if (target.id === 'stats-filter-btn') {
        await handleStatsFilter();
        return true;
    }
    return false;
}


// --- Main Event Listener Setup ---

export function setupAllEventListeners() {
    if (DOM.sidebarToggleBtn) {
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

    document.addEventListener('click', async (event) => {
        const target = event.target;
        const targetId = target.id;

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

        // Delegate to specific handlers
        if (await handleAuthEvents(target, targetId)) return;
        if (await handleModalEvents(target, targetId)) return;
        if (await handleQuestionEvents(target)) return;
        if (await handleCadernoEvents(target)) return;
        if (await handleMateriasEvents(target)) return;
        if (await handleReviewEvents(target)) return;
        if (await handleFilterEvents(target)) return;
        if (await handleNavigationEvents(target)) return;
        if (await handleStatsEvents(target)) return;
    });

    if (DOM.searchSavedFiltersInput) {
        DOM.searchSavedFiltersInput.addEventListener('input', updateSavedFiltersList);
    }

    window.addEventListener('pagehide', () => {
        if (state.currentUser && state.sessionStats.length > 0) {
            saveSessionStats();
        }
    });

    document.addEventListener('change', (event) => {
        const target = event.target;
        if (target.closest('#stats-desempenho-materia-container')) {
            handleStatsTableSelection(event);
        } else if (target.closest('#review-table-container')) {
            if (target.matches('.review-checkbox')) {
                handleReviewTableSelection(target);
            } else if (target.matches('#select-all-review-materias')) {
                const isChecked = target.checked;
                DOM.reviewTableContainer.querySelectorAll('.review-checkbox:not(:disabled)').forEach(cb => {
                    cb.checked = isChecked;
                    cb.indeterminate = false;
                });
                const selectAllCheckbox = DOM.reviewTableContainer.querySelector('#select-all-review-materias');
                if (selectAllCheckbox && isChecked) selectAllCheckbox.indeterminate = false;
                const anyChecked = DOM.reviewTableContainer.querySelector('.review-checkbox:checked');
                if(DOM.startSelectedReviewBtn) DOM.startSelectedReviewBtn.disabled = !anyChecked;
            }
        } else if (target.matches('input[name="evolucao-filter"]')) {
            handleStatsFilter();
        } else if (target.id === 'move-footer-folder-select') {
            handleMoveFooterFolderSelect();
        }
    });
}
