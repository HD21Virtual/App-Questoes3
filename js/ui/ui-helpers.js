import DOM from '../dom-elements.js';
import { state } from '../state.js';
// NOVO: Imports para a função updateUserUI
import { handleAuth } from '../services/auth.js';
import { openAuthModal } from './modal.js';

/**
 * @file js/ui/ui-helpers.js
 * @description Funções auxiliares para manipulação da UI.
 */

export function updateAssuntoFilter(disciplinas) {
    const assuntoContainer = DOM.assuntoFilter;
    const assuntoButton = assuntoContainer.querySelector('.custom-select-button');
    const valueSpan = assuntoContainer.querySelector('.custom-select-value');
    const optionsContainer = assuntoContainer.querySelector('.custom-select-options');
    
    valueSpan.textContent = 'Assunto';
    valueSpan.classList.add('text-gray-500');
    assuntoContainer.dataset.value = '[]';
    optionsContainer.innerHTML = '';

    if (disciplinas.length === 0) {
        assuntoButton.disabled = true;
        optionsContainer.innerHTML = `<div class="p-2 text-center text-gray-400 text-sm">Selecione uma disciplina</div>`;
    } else {
        assuntoButton.disabled = false;
        let newHtml = '';
        
        disciplinas.forEach(disciplinaName => {
            const materiaObj = state.filterOptions.materia.find(m => m.name === disciplinaName);
            if (materiaObj && materiaObj.assuntos.length > 0) {
                newHtml += `<div class="font-bold text-sm text-gray-700 mt-2 px-1">${materiaObj.name}</div>`;

                // --- MODIFICAÇÃO: Renderização de 4 níveis ---
                materiaObj.assuntos.forEach(assunto => { // Nível 2: Assunto
                    const hasSubAssuntos = assunto.subAssuntos && assunto.subAssuntos.length > 0;
                    // AJUSTE: Removido 'rotate-90' para começar recolhido
                    newHtml += `
                        <div class="assunto-group">
                            <div class="flex items-center p-1 rounded-lg hover:bg-gray-100">
                                ${hasSubAssuntos ?
                                    `<i class="fas fa-chevron-right text-gray-400 w-4 text-center mr-2 cursor-pointer transition-transform duration-200 assunto-toggle"></i>` : // Removido rotate-90
                                    `<span class="w-6 mr-2"></span>`
                                }
                                <label class="flex-grow flex items-center space-x-2 cursor-pointer">
                                    <input type="checkbox" data-value="${assunto.name}" data-type="assunto" class="custom-select-option rounded">
                                    <span>${assunto.name}</span>
                                </label>
                            </div>
                    `;

                    if (hasSubAssuntos) {
                        // AJUSTE: Adicionado 'hidden' para começar recolhido
                        newHtml += `<div class="sub-assunto-list pl-6 mt-1 space-y-1 hidden">`; // Adicionado hidden
                        assunto.subAssuntos.forEach(subAssunto => { // Nível 3: SubAssunto
                            const hasSubSubAssuntos = subAssunto.subSubAssuntos && subAssunto.subSubAssuntos.length > 0;
                            // AJUSTE: Removido 'rotate-90' para começar recolhido
                            newHtml += `
                                <div class="sub-assunto-group">
                                    <div class="flex items-center p-1 rounded-lg hover:bg-gray-100">
                                        ${hasSubSubAssuntos ?
                                            `<i class="fas fa-chevron-right text-gray-400 w-4 text-center mr-2 cursor-pointer transition-transform duration-200 assunto-toggle"></i>` : // Removido rotate-90
                                            `<span class="w-6 mr-2"></span>`
                                        }
                                        <label class="flex-grow flex items-center space-x-2 cursor-pointer">
                                            <input type="checkbox" data-value="${subAssunto.name}" data-parent-assunto="${assunto.name}" data-type="subassunto" class="custom-select-option rounded">
                                            <span>${subAssunto.name}</span>
                                        </label>
                                    </div>
                            `;

                            if (hasSubSubAssuntos) {
                                // AJUSTE: Adicionado 'hidden' para começar recolhido
                                newHtml += `<div class="sub-sub-assunto-list pl-6 mt-1 space-y-1 hidden">`; // Adicionado hidden
                                subAssunto.subSubAssuntos.forEach(subSubAssunto => { // Nível 4: SubSubAssunto
                                    newHtml += `
                                        <label class="flex items-center space-x-2 p-1 rounded-lg hover:bg-gray-100 cursor-pointer">
                                            <input type="checkbox" data-value="${subSubAssunto}" data-parent-assunto="${assunto.name}" data-parent-subassunto="${subAssunto.name}" data-type="subsubassunto" class="custom-select-option rounded">
                                            <span>${subSubAssunto}</span>
                                        </label>
                                    `;
                                });
                                newHtml += `</div>`;
                            }
                            newHtml += `</div>`; // Fim .sub-assunto-group
                        });
                        newHtml += `</div>`; // Fim .sub-assunto-list
                    }
                    newHtml += `</div>`; // Fim .assunto-group
                });
                // --- FIM DA MODIFICAÇÃO ---
            }
        });

        optionsContainer.innerHTML = newHtml;

        // Adiciona listeners para os botões de toggle (agora aninhados)
        optionsContainer.querySelectorAll('.assunto-toggle').forEach(toggle => {
            toggle.addEventListener('click', (e) => {
                e.stopPropagation();
                // Encontra o 'irmão' que é a lista (seja sub-assunto-list or sub-sub-assunto-list)
                const list = e.target.closest('.assunto-group, .sub-assunto-group').querySelector('.sub-assunto-list, .sub-sub-assunto-list');
                if (list) {
                    list.classList.toggle('hidden');
                    e.target.classList.toggle('rotate-90');
                }
            });
        });
    }
}

export function updateSelectedFiltersDisplay() {
    DOM.selectedFiltersContainer.innerHTML = '';
    let hasFilters = false;

    const createFilterTag = (type, value, label) => {
        hasFilters = true;
        const tag = document.createElement('div');
        tag.className = 'flex items-center bg-gray-200 border border-gray-300 rounded-lg pl-2 pr-1 py-1 text-sm';
        tag.innerHTML = `
            <span class="font-semibold mr-1">${label}:</span>
            <span class="mr-1">${value}</span>
            <button data-filter-type="${type}" data-filter-value="${value}" class="remove-filter-btn ml-1 text-gray-500 hover:text-gray-800">
                <svg class="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
        `;
        DOM.selectedFiltersContainer.appendChild(tag);
    };

    const selectedMaterias = JSON.parse(DOM.materiaFilter.dataset.value || '[]');
    selectedMaterias.forEach(m => createFilterTag('materia', m, 'Disciplina'));

    // --- MODIFICAÇÃO: A label agora pode ser Assunto, Sub-assunto, etc. ---
    // A lógica de `removeFilter` no `filter.js` ainda trata todos como 'assunto',
    // o que funciona, pois apenas desmarca o checkbox correspondente.
    const selectedAssuntos = JSON.parse(DOM.assuntoFilter.dataset.value || '[]');
    selectedAssuntos.forEach(a => createFilterTag('assunto', a, 'Assunto'));
    // --- FIM DA MODIFICAÇÃO ---
    
    const activeTipoBtn = DOM.tipoFilterGroup.querySelector('.active-filter');
    if (activeTipoBtn && activeTipoBtn.dataset.value !== 'todos') {
        createFilterTag('tipo', activeTipoBtn.textContent, 'Tipo');
    }

    if (DOM.searchInput.value) {
        createFilterTag('search', DOM.searchInput.value, 'Busca');
    }

    if (!hasFilters) {
        DOM.selectedFiltersContainer.innerHTML = `<span class="text-gray-500 text-sm">Nenhum filtro aplicado.</span>`;
    }
}

export function updateUserUI(user) {
    // const mobileContainer = DOM.userAccountContainerMobile; // REMOVIDO
    const sidebarContainer = DOM.userAccountSidebarContainer; // NOVO
    const desktopContainer = DOM.userAccountContainer;

    if (!sidebarContainer || !desktopContainer) return;

    desktopContainer.innerHTML = '';
    sidebarContainer.innerHTML = ''; // Limpa o novo container da sidebar

    if (user) {
        // HTML para o Header (desktop/tablet) - Apenas o botão de Sair
        // MODIFICAÇÃO: String vazia para remover o botão do header.
        const loggedInDesktopHTML = '';
        
        // HTML para a Sidebar (mobile/desktop) - Email + Botão Sair
        const loggedInSidebarHTML = `
            <div class="flex flex-col space-y-2">
                <span class="text-gray-300 text-sm truncate" title="${user.email}">${user.email}</span>
                <button id="logout-btn-sidebar" class="text-gray-300 hover:bg-gray-700 hover:text-white block w-full text-left px-3 py-2 rounded-lg text-sm font-medium">Sair</button>
            </div>`;
        
        desktopContainer.innerHTML = loggedInDesktopHTML;
        sidebarContainer.innerHTML = loggedInSidebarHTML;
        
        // Adiciona listener para o NOVO botão de logout na sidebar
        const logoutBtnSidebar = document.getElementById('logout-btn-sidebar');
        if (logoutBtnSidebar) {
            // Re-usa a função handleAuth importada
            logoutBtnSidebar.addEventListener('click', () => handleAuth('logout'));
        }

    } else {
        // HTML para o Header (desktop/tablet)
        const loggedOutDesktopHTML = `<button id="show-login-modal-btn" class="text-gray-600 bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-2 rounded-lg text-sm font-medium">Minha Conta</button>`;
        
        // HTML para a Sidebar (mobile/desktop)
        const loggedOutSidebarHTML = `<button id="show-login-modal-btn-sidebar" class="text-gray-300 hover:bg-gray-700 hover:text-white block w-full text-left px-3 py-2 rounded-lg text-sm font-medium">Minha Conta</button>`;
        
        desktopContainer.innerHTML = loggedOutDesktopHTML;
        sidebarContainer.innerHTML = loggedOutSidebarHTML;

        // Adiciona listener para o NOVO botão de login na sidebar
        const loginBtnSidebar = document.getElementById('show-login-modal-btn-sidebar');
        if (loginBtnSidebar) {
            // Re-usa a função openAuthModal importada
            loginBtnSidebar.addEventListener('click', openAuthModal);
        }

        // ===== INÍCIO DA CORREÇÃO =====
        // Adiciona listener para o botão de login do DESKTOP (cabeçalho)
        const loginBtnDesktop = document.getElementById('show-login-modal-btn');
        if (loginBtnDesktop) {
            loginBtnDesktop.addEventListener('click', openAuthModal);
        }
        // ===== FIM DA CORREÇÃO =====
    }
}
