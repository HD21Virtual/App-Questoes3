import { html, render } from 'https://cdn.jsdelivr.net/npm/lit-html@3.3.1/lit-html.js';
import DOM from '../dom-elements.js';
import { state, setState, subscribe } from '../state.js';
import { navigateToView } from '../ui/navigation.js';
import { clearAllFilters, applyFilters } from './filter.js';

/**
 * Ordena strings alfanumericamente (ex: "2.10" vem depois de "2.9").
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function naturalSort(a, b) {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

// --- MODIFICAÇÃO: Contagem para 4 níveis ---
function countQuestions(materia, assunto = null, subAssunto = null, subSubAssunto = null) {
    return state.allQuestions.filter(q => {
        const materiaMatch = q.materia === materia;
        const assuntoMatch = !assunto || q.assunto === assunto;
        const subAssuntoMatch = !subAssunto || q.subAssunto === subAssunto;
        // Adiciona a verificação do subSubAssunto
        const subSubAssuntoMatch = !subSubAssunto || q.subSubAssunto === subSubAssunto;
        return materiaMatch && assuntoMatch && subAssuntoMatch && subSubAssuntoMatch;
    }).length;
}
// --- FIM DA MODIFICAÇÃO ---

// --- MODIFICAÇÃO: Construção de hierarquia de 4 níveis sem 'Questões Gerais' ---
function buildHierarchy(questions, materiaName) {
    // Estrutura: Map<Assunto, Map<SubAssunto, Set<SubSubAssunto>>>
    const hierarchy = new Map();
    questions.forEach(q => {
        if (q.materia !== materiaName || !q.assunto) return;

        // Nível 1: Assunto
        if (!hierarchy.has(q.assunto)) {
            hierarchy.set(q.assunto, new Map());
        }
        const subAssuntosMap = hierarchy.get(q.assunto);

        // Se não houver subAssunto, a questão pertence diretamente ao Assunto.
        // A hierarquia não precisa de mais nada.
        if (!q.subAssunto) {
            return;
        }

        // Nível 2: SubAssunto (agora sabemos que q.subAssunto existe)
        if (!subAssuntosMap.has(q.subAssunto)) {
            subAssuntosMap.set(q.subAssunto, new Set());
        }

        // Se não houver subSubAssunto, a questão pertence ao SubAssunto.
        if (!q.subSubAssunto) {
            return;
        }

        // Nível 3: SubSubAssunto (sabemos que q.subSubAssunto existe)
        const subSubAssuntosSet = subAssuntosMap.get(q.subAssunto);
        subSubAssuntosSet.add(q.subSubAssunto);
    });
    return hierarchy;
}
// --- FIM DA MODIFICAÇÃO ---


export function renderMateriasView() {
    if (!state.currentUser) {
        render(html`<p class="text-center text-gray-500">Por favor, faça login para ver as matérias.</p>`, DOM.materiasListContainer);
        DOM.assuntosListContainer.classList.add('hidden');
        return;
    }

    if (state.selectedMateria) {
        DOM.materiasViewTitle.textContent = state.selectedMateria.name;
        DOM.materiasListContainer.classList.add('hidden');
        DOM.assuntosListContainer.classList.remove('hidden');
        DOM.backToMateriasBtn.classList.remove('hidden');

        const hierarchy = buildHierarchy(state.allQuestions, state.selectedMateria.name);

        const sortedAssuntos = Array.from(hierarchy.keys()).sort(naturalSort);

        const listItemsTemplate = sortedAssuntos.map(assunto => {
            const subAssuntosMap = hierarchy.get(assunto);
            const sortedSubAssuntos = Array.from(subAssuntosMap.keys()).sort(naturalSort);
            const totalQuestoesAssunto = countQuestions(state.selectedMateria.name, assunto);
            const hasSubAssuntos = sortedSubAssuntos.length > 0;

            return html`
                <li class="assunto-group">
                    <div class="flex justify-between items-center p-2 hover:bg-gray-100 rounded-lg cursor-pointer" data-action="${hasSubAssuntos ? 'toggle-assunto' : 'filter-item'}">
                        <div class="flex items-center flex-grow">
                            ${hasSubAssuntos ? html`<i class="fas fa-chevron-right text-gray-400 w-4 text-center mr-2 transition-transform duration-200 rotate-90"></i>` : html`<span class="w-6 mr-2"></span>`}
                            <span class="font-semibold text-gray-800 assunto-item" data-materia-name="${state.selectedMateria.name}" data-assunto-name="${assunto}">${assunto}</span>
                        </div>
                        <div class="w-20 flex justify-center">
                            <span class="text-sm text-gray-500 bg-gray-200 px-2 py-1 rounded-lg w-full text-center">${totalQuestoesAssunto}</span>
                        </div>
                    </div>
                    ${hasSubAssuntos ? html`
                        <ul class="pl-8 mt-1 space-y-1">
                            ${sortedSubAssuntos.map(subAssunto => {
                                const subSubAssuntosSet = subAssuntosMap.get(subAssunto);
                                const sortedSubSubAssuntos = Array.from(subSubAssuntosSet).sort(naturalSort);
                                const totalQuestoesSubAssunto = countQuestions(state.selectedMateria.name, assunto, subAssunto);
                                const hasSubSubAssuntos = sortedSubSubAssuntos.length > 0;

                                return html`
                                    <li class="sub-assunto-group">
                                        <div class="flex justify-between items-center p-2 hover:bg-blue-50 rounded-lg cursor-pointer" data-action="${hasSubSubAssuntos ? 'toggle-subassunto' : 'filter-item'}">
                                            <div class="flex items-center flex-grow">
                                                ${hasSubSubAssuntos ? html`<i class="fas fa-chevron-right text-gray-400 w-4 text-center mr-2 transition-transform duration-200 rotate-90"></i>` : html`<span class="w-6 mr-2"></span>`}
                                                <span class="sub-assunto-item" data-materia-name="${state.selectedMateria.name}" data-assunto-name="${assunto}" data-subassunto-name="${subAssunto}">${subAssunto}</span>
                                            </div>
                                            <div class="w-20 flex justify-center">
                                                <span class="text-sm text-gray-500 bg-gray-200 px-2 py-1 rounded-lg w-full text-center">${totalQuestoesSubAssunto}</span>
                                            </div>
                                        </div>
                                        ${hasSubSubAssuntos ? html`
                                            <ul class="pl-8 mt-1 space-y-1">
                                                ${sortedSubSubAssuntos.map(subSubAssunto => {
                                                    const totalQuestoesSubSubAssunto = countQuestions(state.selectedMateria.name, assunto, subAssunto, subSubAssunto);
                                                    return html`
                                                        <li class="sub-sub-assunto-item cursor-pointer flex justify-between items-center p-2 hover:bg-green-50 rounded-lg" data-materia-name="${state.selectedMateria.name}" data-assunto-name="${assunto}" data-subassunto-name="${subAssunto}" data-subsubassunto-name="${subSubAssunto}">
                                                            <span>${subSubAssunto}</span>
                                                            <div class="w-20 flex justify-center">
                                                                <span class="text-sm text-gray-500 bg-gray-200 px-2 py-1 rounded-lg w-full text-center">${totalQuestoesSubSubAssunto}</span>
                                                            </div>
                                                        </li>
                                                    `;
                                                })}
                                            </ul>
                                        ` : ''}
                                    </li>
                                `;
                            })}
                        </ul>
                    ` : ''}
                </li>
            `;
        });

        const template = html`
            <div class="mb-4 flex items-center gap-2">
                <div class="relative flex-grow">
                    <span class="absolute inset-y-0 left-0 flex items-center pl-3">
                        <i class="fas fa-search text-gray-400"></i>
                    </span>
                    <input type="text" id="assunto-search-input" placeholder="Digite o nome ou trecho do assunto." class="w-full p-2 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                </div>
                <button id="assunto-search-btn" class="bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700">Buscar</button>
            </div>
            <div id="assuntos-card" class="bg-gray-50 p-6 rounded-xl shadow-md">
                <div class="flex justify-between items-center p-2 mb-2 border-b">
                    <h3 class="font-bold text-gray-600">Assuntos desta matéria</h3>
                    <div class="w-20 text-center">
                        <h3 class="font-bold text-gray-600">Questões</h3>
                    </div>
                </div>
                <ul class="space-y-1">
                    ${listItemsTemplate}
                </ul>
            </div>
        `;
        render(template, DOM.assuntosListContainer);

        const searchInput = document.getElementById('assunto-search-input');
        const searchBtn = document.getElementById('assunto-search-btn');

        const performSearch = () => {
            const searchTerm = searchInput.value.toLowerCase();
            const card = document.getElementById('assuntos-card');
            const assuntoGroups = card.querySelectorAll('.assunto-group');

            assuntoGroups.forEach(group => {
                const assuntoText = group.querySelector('.assunto-item').textContent.toLowerCase();
                const subAssuntoGroups = group.querySelectorAll('.sub-assunto-group');
                let hasVisibleSubAssunto = false;

                subAssuntoGroups.forEach(subGroup => {
                    const subAssuntoText = subGroup.querySelector('.sub-assunto-item').textContent.toLowerCase();
                    const subSubAssuntoItems = subGroup.querySelectorAll('.sub-sub-assunto-item');
                    let hasVisibleSubSubAssunto = false;

                    subSubAssuntoItems.forEach(item => {
                        const subSubAssuntoText = item.querySelector('span').textContent.toLowerCase();
                        if (subSubAssuntoText.includes(searchTerm)) {
                            item.style.display = 'flex';
                            hasVisibleSubSubAssunto = true;
                        } else {
                            item.style.display = 'none';
                        }
                    });

                    if (subAssuntoText.includes(searchTerm) || hasVisibleSubSubAssunto) {
                        subGroup.style.display = 'block';
                        hasVisibleSubAssunto = true;
                        if (searchTerm && hasVisibleSubSubAssunto) {
                            subGroup.querySelector('ul')?.classList.remove('hidden');
                            subGroup.querySelector('i')?.classList.add('rotate-90');
                        }
                    } else {
                        subGroup.style.display = 'none';
                    }
                });

                if (assuntoText.includes(searchTerm) || hasVisibleSubAssunto) {
                    group.style.display = 'block';
                    if (searchTerm && hasVisibleSubAssunto) {
                        group.querySelector('ul')?.classList.remove('hidden');
                        group.querySelector('i')?.classList.add('rotate-90');
                    }
                } else {
                    group.style.display = 'none';
                }
            });
        };

        searchBtn.addEventListener('click', performSearch);
        searchInput.addEventListener('keyup', (event) => {
            if (event.key === 'Enter') {
                performSearch();
            }
        });

    } else {
        DOM.materiasViewTitle.textContent = 'Matérias';
        DOM.materiasListContainer.classList.remove('hidden');
        DOM.assuntosListContainer.classList.add('hidden');
        DOM.backToMateriasBtn.classList.add('hidden');

        if (state.filterOptions.materia.length === 0) {
            render(html`<p class="text-center text-gray-500">Nenhuma matéria encontrada. Adicione questões para vê-las aqui.</p>`, DOM.materiasListContainer);
            return;
        }

        const materiasTemplate = state.filterOptions.materia.map(materia => {
            const totalQuestoes = countQuestions(materia.name);
             return html`
            <div class="bg-gray-50 p-4 shadow-md hover:shadow-lg transition-shadow cursor-pointer materia-item rounded-lg" data-materia-name="${materia.name}">
                <div class="flex justify-between items-center">
                    <div class="flex items-center">
                        <i class="fas fa-book-open text-blue-500 mr-4 text-xl"></i>
                        <div>
                            <h3 class="font-bold text-lg text-gray-800">${materia.name}</h3>
                            <p class="text-sm text-gray-500">${totalQuestoes} questões</p>
                        </div>
                    </div>
                    <i class="fas fa-chevron-right text-gray-400"></i>
                </div>
            </div>
        `;
        });
        render(html`${materiasTemplate}`, DOM.materiasListContainer);
    }
}


function handleMateriaListClick(event) {
    const materiaItem = event.target.closest('.materia-item');
    if (materiaItem) {
        const materiaName = materiaItem.dataset.materiaName;
        const materiaData = state.filterOptions.materia.find(m => m.name === materiaName) || { name: materiaName, assuntos: [] };
        setState('selectedMateria', materiaData);
    }
}

// ===== INÍCIO DA MODIFICAÇÃO: Função agora é async =====
async function handleAssuntoListClick(event) {
// ===== FIM DA MODIFICAÇÃO =====
    // --- MODIFICAÇÃO: Lógica de clique e toggle refatorada ---
    const toggleAssunto = event.target.closest('[data-action="toggle-assunto"]');
    const toggleSubAssunto = event.target.closest('[data-action="toggle-subassunto"]');

    // 1. Handle Toggles
    if (toggleAssunto) {
        const parentLi = toggleAssunto.closest('.assunto-group');
        const sublist = parentLi.querySelector('ul');
        const icon = toggleAssunto.querySelector('i');
        if (sublist) {
            sublist.classList.toggle('hidden');
            icon.classList.toggle('rotate-90');
        }
        return;
    }

    if (toggleSubAssunto) {
        const parentLi = toggleSubAssunto.closest('.sub-assunto-group');
        const sublist = parentLi.querySelector('ul');
        const icon = toggleSubAssunto.querySelector('i');
        if (sublist) {
            sublist.classList.toggle('hidden');
            icon.classList.toggle('rotate-90');
        }
        return;
    }

    // 2. Handle Filter Clicks
    // Encontra o item clicável mais próximo
    const filterItemElement = event.target.closest('.sub-sub-assunto-item, [data-action="filter-item"]');
    let dataset = null;

    if (filterItemElement) {
        if (filterItemElement.classList.contains('sub-sub-assunto-item')) {
            dataset = filterItemElement.dataset;
        } else {
            // É um [data-action="filter-item"], precisamos pegar o span filho
            const span = filterItemElement.querySelector('.assunto-item, .sub-assunto-item');
            if (span) {
                dataset = span.dataset;
            }
        }
    }

    if (dataset) {
        const { materiaName, assuntoName, subassuntoName, subsubassuntoName } = dataset;

        // ===== INÍCIO DA MODIFICAÇÃO: Adicionado await =====
        await navigateToView('vade-mecum-view', false);
        // ===== FIM DA MODIFICAÇÃO =====

        setTimeout(() => {
            clearAllFilters();

            // 1. Seleciona Matéria
            const materiaCheckbox = DOM.materiaFilter.querySelector(`.custom-select-option[data-value="${materiaName}"]`);
            if (materiaCheckbox) {
                materiaCheckbox.checked = true;
                DOM.materiaFilter.querySelector('.custom-select-options').dispatchEvent(new Event('change', { bubbles: true }));
            }

            // 2. Aguarda o filtro de assunto ser populado
            setTimeout(() => {
                // 3. Seleciona APENAS o item mais específico clicado
                let checkboxToSelect = null;
                if (subsubassuntoName) {
                    checkboxToSelect = DOM.assuntoFilter.querySelector(`.custom-select-option[data-value="${subsubassuntoName}"]`);
                } else if (subassuntoName) {
                    checkboxToSelect = DOM.assuntoFilter.querySelector(`.custom-select-option[data-value="${subassuntoName}"]`);
                } else if (assuntoName) {
                    checkboxToSelect = DOM.assuntoFilter.querySelector(`.custom-select-option[data-value="${assuntoName}"]`);
                }

                if (checkboxToSelect) {
                    checkboxToSelect.checked = true;
                }

                // 4. Dispara o evento de change no container de assuntos para aplicar a seleção
                DOM.assuntoFilter.querySelector('.custom-select-options').dispatchEvent(new Event('change', { bubbles: true }));

                // 5. Aplica os filtros
                applyFilters();
            }, 100); // Pequeno delay para garantir que o DOM do filtro de assunto foi atualizado
        }, 50); // Pequeno delay para garantir a navegação da view
    }
    // --- FIM DA MODIFICAÇÃO ---
}

function handleBackToMaterias() {
    setState('selectedMateria', null);
}

export function setupMateriasEventListeners() {
    if (DOM.materiasListContainer) {
        DOM.materiasListContainer.addEventListener('click', handleMateriaListClick);
    }
    if (DOM.assuntosListContainer) {
        DOM.assuntosListContainer.addEventListener('click', handleAssuntoListClick);
    }
    if (DOM.backToMateriasBtn) {
        DOM.backToMateriasBtn.addEventListener('click', handleBackToMaterias);
    }
}

subscribe('selectedMateria', renderMateriasView);
