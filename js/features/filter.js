import { state, setState, clearSessionStats } from '../state.js';
import DOM from '../dom-elements.js';
import { renderQuestionListForAdding, displayQuestion } from './question-viewer.js';
import { updateAssuntoFilter, updateSelectedFiltersDisplay } from '../ui/ui-helpers.js';
import { saveSessionStats } from '../services/firestore.js';
import { addFilteredQuestionsToCaderno } from './caderno.js';

export async function applyFilters() {
    if (!state.isAddingQuestionsMode.active && state.sessionStats.length > 0 && !state.isReviewSession) {
        await saveSessionStats();
        clearSessionStats();
    }

    DOM.materiaFilter.querySelector('.custom-select-panel').classList.add('hidden');
    DOM.assuntoFilter.querySelector('.custom-select-panel').classList.add('hidden');

    const selectedMaterias = JSON.parse(DOM.materiaFilter.dataset.value || '[]');
    const selectedAssuntosAndSub = JSON.parse(DOM.assuntoFilter.dataset.value || '[]');
    const activeTipoBtn = DOM.tipoFilterGroup.querySelector('.active-filter');
    const selectedTipo = activeTipoBtn ? activeTipoBtn.dataset.value : 'todos';
    const searchTerm = DOM.searchInput.value.toLowerCase();

    const filtered = state.allQuestions.filter(q => {
        const materiaMatch = selectedMaterias.length === 0 || selectedMaterias.includes(q.materia);
        const assuntoMatch = selectedAssuntosAndSub.length === 0 ||
                             selectedAssuntosAndSub.includes(q.assunto) ||
                             (q.subAssunto && selectedAssuntosAndSub.includes(q.subAssunto)) ||
                             (q.subSubAssunto && selectedAssuntosAndSub.includes(q.subSubAssunto));
        const tipoMatch = selectedTipo === 'todos' || q.tipo === selectedTipo;
        const searchMatch = !searchTerm || q.text.toLowerCase().includes(searchTerm) ||
                            (q.assunto && q.assunto.toLowerCase().includes(searchTerm)) ||
                            (q.subAssunto && q.subAssunto.toLowerCase().includes(searchTerm)) ||
                            (q.subSubAssunto && q.subSubAssunto.toLowerCase().includes(searchTerm));

        return materiaMatch && assuntoMatch && tipoMatch && searchMatch;
    });

    setState('filteredQuestions', filtered);
    setState('currentQuestionIndex', 0);

    if (state.isAddingQuestionsMode.active) {
        const caderno = state.userCadernos.find(c => c.id === state.isAddingQuestionsMode.cadernoId);
        const existingIds = caderno ? caderno.questionIds : [];

        const newQuestions = state.filteredQuestions.filter(q => !existingIds.includes(q.id));
        const newQuestionsCount = newQuestions.length;

        if (newQuestionsCount > 0) {
            DOM.filterBtn.textContent = `Adicionar ${newQuestionsCount} questões ao Caderno`;
            DOM.filterBtn.disabled = false;
        } else {
            DOM.filterBtn.textContent = `Nenhuma questão nova para adicionar`;
            DOM.filterBtn.disabled = true;
        }
        renderQuestionListForAdding(state.filteredQuestions, existingIds);
    } else {
        const mainContentContainer = DOM.vadeMecumView.querySelector('#tabs-and-main-content');
        if(mainContentContainer) mainContentContainer.classList.remove('hidden');
        await displayQuestion();
    }

    updateSelectedFiltersDisplay();
}

export function setupCustomSelect(container, onValueChangeCallback = null) {
    const button = container.querySelector('.custom-select-button');
    const panel = container.querySelector('.custom-select-panel');
    const searchInput = container.querySelector('.custom-select-search');
    const optionsContainer = container.querySelector('.custom-select-options');
    const valueSpan = container.querySelector('.custom-select-value');
    const originalText = valueSpan.textContent;

    button.addEventListener('click', () => {
        if (button.disabled) return;

        document.querySelectorAll('.custom-select-container').forEach(otherContainer => {
            if (otherContainer !== container) {
                otherContainer.querySelector('.custom-select-panel').classList.add('hidden');
            }
        });

        panel.classList.toggle('hidden');
    });

    searchInput.addEventListener('input', () => {
        const searchTerm = searchInput.value.toLowerCase();
        optionsContainer.querySelectorAll('label, .assunto-group > div, .sub-assunto-group > div').forEach(el => {
            const text = el.textContent.toLowerCase();
            const parent = el.closest('li, .assunto-group, .sub-assunto-group, label');
            if (parent) {
                if (el.querySelector('[data-type^="select-all"]')) {
                     parent.style.display = '';
                     return;
                }
                parent.style.display = text.includes(searchTerm) ? '' : 'none';
            } else {
                 el.style.display = text.includes(searchTerm) ? '' : 'none';
            }
        });
    });

    optionsContainer.addEventListener('change', (e) => {
        const changedCheckbox = e.target;

        if (changedCheckbox.matches('.custom-select-option')) {
            const isChecked = changedCheckbox.checked;
            const type = changedCheckbox.dataset.type;

            if (type === 'assunto') {
                const parentGroup = changedCheckbox.closest('.assunto-group');
                parentGroup.querySelectorAll('.custom-select-option[data-type="subassunto"], .custom-select-option[data-type="subsubassunto"]').forEach(childCb => {
                    childCb.checked = isChecked;
                    childCb.indeterminate = false;
                });
            } else if (type === 'subassunto') {
                const parentGroup = changedCheckbox.closest('.sub-assunto-group');
                parentGroup.querySelectorAll('.custom-select-option[data-type="subsubassunto"]').forEach(childCb => {
                    childCb.checked = isChecked;
                    childCb.indeterminate = false;
                });
                updateParentCheckbox(changedCheckbox.closest('.assunto-group'), '.custom-select-option[data-type="assunto"]', '.custom-select-option[data-type="subassunto"]');
            } else if (type === 'subsubassunto') {
                const subAssuntoGroup = changedCheckbox.closest('.sub-assunto-group');
                updateParentCheckbox(subAssuntoGroup, '.custom-select-option[data-type="subassunto"]', '.custom-select-option[data-type="subsubassunto"]');
                const assuntoGroup = changedCheckbox.closest('.assunto-group');
                updateParentCheckbox(assuntoGroup, '.custom-select-option[data-type="assunto"]', '.custom-select-option[data-type="subassunto"]');
            }
        }

        let callbackResult = null;
        if (onValueChangeCallback) {
            callbackResult = onValueChangeCallback([], e);
        }

        const finalSelected = Array.isArray(callbackResult) ? callbackResult : [];

        if (!Array.isArray(callbackResult)) {
            optionsContainer.querySelectorAll('.custom-select-option:checked').forEach(cb => {
                if (!cb.indeterminate && cb.dataset.type && !cb.dataset.type.startsWith('select-all')) {
                    finalSelected.push(cb.dataset.value);
                }
            });
        }

        container.dataset.value = JSON.stringify(finalSelected);

        const indeterminateCount = optionsContainer.querySelectorAll('.custom-select-option:indeterminate:not([data-type^="select-all"])').length;

        if (finalSelected.length === 0 && indeterminateCount === 0) {
            valueSpan.textContent = originalText;
            valueSpan.classList.add('text-gray-500');
        } else if (finalSelected.length === 1 && indeterminateCount === 0) {
             const cb = optionsContainer.querySelector(`.custom-select-option[data-value="${finalSelected[0]}"]`);
             const label = cb ? cb.closest('label') : null;
             valueSpan.textContent = label && label.querySelector('span') ? label.querySelector('span').textContent : finalSelected[0];
            valueSpan.classList.remove('text-gray-500');
        } else {
            const totalSelected = finalSelected.length + indeterminateCount;
            valueSpan.textContent = `${totalSelected} itens selecionados`;
            valueSpan.classList.remove('text-gray-500');
        }

        if (container.id === 'materia-filter') {
            updateSelectedFiltersDisplay();
        }

        if (state.isAddingQuestionsMode.active) {
            applyFilters();
        }
    });
}

function updateParentCheckbox(parentGroup, parentSelector, childSelector) {
    if (!parentGroup) return;
    const parentCheckbox = parentGroup.querySelector(parentSelector);
    if (!parentCheckbox) return;

    const childList = parentGroup.querySelector('.sub-assunto-list, .sub-sub-assunto-list');
    if (!childList) return;

    const childCheckboxes = Array.from(childList.querySelectorAll(`:scope > * > div > label > ${childSelector}, :scope > * > label > ${childSelector}`));

    if (childCheckboxes.length === 0) return;

    const checkedChildren = childCheckboxes.filter(cb => cb.checked).length;
    const indeterminateChildren = childCheckboxes.filter(cb => cb.indeterminate).length;

    if (checkedChildren === 0 && indeterminateChildren === 0) {
        parentCheckbox.checked = false;
        parentCheckbox.indeterminate = false;
    } else if (checkedChildren === childCheckboxes.length && indeterminateChildren === 0) {
        parentCheckbox.checked = true;
        parentCheckbox.indeterminate = false;
    } else {
        parentCheckbox.checked = false;
        parentCheckbox.indeterminate = true;
    }
}

export function setupCustomSelects() {
    const materiaContainer = DOM.materiaFilter.querySelector('.custom-select-options');
    if (materiaContainer) {
        const materiaOptions = state.filterOptions.materia.map(m => m.name);
        materiaContainer.innerHTML = materiaOptions.map(opt => `
            <label class="flex items-center space-x-2 p-1 rounded-md hover:bg-gray-100 cursor-pointer">
                <input type="checkbox" data-value="${opt}" class="custom-select-option rounded">
                <span>${opt}</span>
            </label>
        `).join('');
    }

    if (DOM.materiaFilter) {
        setupCustomSelect(DOM.materiaFilter, (selected, e) => {
            const selectedMaterias = [];
             DOM.materiaFilter.querySelectorAll('.custom-select-option:checked').forEach(cb => {
                selectedMaterias.push(cb.dataset.value);
            });
            updateAssuntoFilter(selectedMaterias);
            return selectedMaterias;
        });
    }
    if (DOM.assuntoFilter) {
        setupCustomSelect(DOM.assuntoFilter);
    }
}

export function clearAllFilters() {
    DOM.searchInput.value = '';

    const materiaContainer = DOM.materiaFilter;
    materiaContainer.dataset.value = '[]';
    materiaContainer.querySelector('.custom-select-value').textContent = 'Disciplina';
    materiaContainer.querySelector('.custom-select-value').classList.add('text-gray-500');
    materiaContainer.querySelectorAll('.custom-select-option:checked').forEach(cb => cb.checked = false);

    updateAssuntoFilter([]);
    const assuntoContainer = DOM.assuntoFilter;
    assuntoContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.checked = false;
        cb.indeterminate = false;
    });

    const activeTipo = DOM.tipoFilterGroup.querySelector('.active-filter');
    if (activeTipo) activeTipo.classList.remove('active-filter');
    DOM.tipoFilterGroup.querySelector('[data-value="todos"]').classList.add('active-filter');

    applyFilters();
}

export function removeFilter(type, value) {
    let container;
    let shouldApplyFilter = true;
    switch (type) {
        case 'materia': container = DOM.materiaFilter; break;
        case 'assunto': container = DOM.assuntoFilter; break;
        case 'tipo': {
            const currentActive = DOM.tipoFilterGroup.querySelector('.active-filter');
            if (currentActive) currentActive.classList.remove('active-filter');
            DOM.tipoFilterGroup.querySelector('[data-value="todos"]').classList.add('active-filter');
            break;
        }
        case 'search': DOM.searchInput.value = ''; break;
        default: shouldApplyFilter = false;
    }

    if (container) {
        const checkbox = container.querySelector(`.custom-select-option[data-value="${value}"]`);
        if (checkbox) {
            checkbox.checked = false;
            container.querySelector('.custom-select-options').dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    if (shouldApplyFilter) {
        applyFilters();
    }
}

export function setupFilterEventListeners() {
    DOM.vadeMecumView.addEventListener('click', async (event) => {
        const target = event.target;

        if (target.closest('#filter-btn')) {
            if (state.isAddingQuestionsMode.active) {
                await addFilteredQuestionsToCaderno();
            } else {
                await applyFilters();
            }
        } else if (target.closest('#clear-filters-btn')) {
            clearAllFilters();
        } else if (target.closest('.remove-filter-btn')) {
            const btn = target.closest('.remove-filter-btn');
            removeFilter(btn.dataset.filterType, btn.dataset.filterValue);
        } else if (target.closest('.filter-btn-toggle')) {
            const group = target.closest('.filter-btn-group');
            if (group) {
                const currentActive = group.querySelector('.active-filter');
                if (currentActive) currentActive.classList.remove('active-filter');
                target.classList.add('active-filter');
                updateSelectedFiltersDisplay();
            }
        } else if (target.closest('#toggle-filters-btn')) {
            DOM.filterCard.classList.toggle('hidden');
            const isHidden = DOM.filterCard.classList.contains('hidden');
            const btn = target.closest('#toggle-filters-btn');
            btn.innerHTML = isHidden
                ? `<i class="fas fa-eye mr-2"></i> Mostrar Filtros`
                : `<i class="fas fa-eye-slash mr-2"></i> Ocultar Filtros`;
        }
    });
}
