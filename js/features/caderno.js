import { Timestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { state, setState } from '../state.js';
import DOM from '../dom-elements.js';
import { navigateToView } from '../ui/navigation.js';
import { displayQuestion } from './question-viewer.js';
import { generateStatsForQuestions } from './stats.js';
import { showItemStatsModal, openNameModal } from '../ui/modal.js';
import { applyFilters } from './filter.js';
import { removeQuestionIdFromCaderno as removeQuestionIdFromFirestore, addQuestionIdsToCaderno as addQuestionIdsToFirestore } from '../services/firestore.js';

/**
 * Ordena strings alfanumericamente (ex: "2.10" vem depois de "2.9").
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function naturalSort(a, b) {
    // Adiciona uma verificação para garantir que a e b são strings
    const strA = String(a || '');
    const strB = String(b || '');
    return strA.localeCompare(strB, undefined, { numeric: true, sensitivity: 'base' });
}


// Renders the view when inside a specific notebook, showing the question solver UI.
async function renderCadernoContentView() {
    const caderno = state.userCadernos.find(c => c.id === state.currentCadernoId);
    if (!caderno) { 
        setState('currentCadernoId', null);
        await renderFoldersAndCadernos(); 
        return; 
    }

    DOM.cadernosViewTitle.textContent = caderno.name;
    DOM.backToFoldersBtn.classList.remove('hidden');
    DOM.addCadernoToFolderBtn.classList.add('hidden');
    DOM.createFolderBtn.classList.add('hidden');
    DOM.addQuestionsToCadernoBtn.classList.remove('hidden');

    // Clones the question solver UI from the main "Questões" tab and injects it here.
    const tempContainer = document.createElement('div');
    const mainContentHtml = DOM.vadeMecumView.querySelector('#tabs-and-main-content').outerHTML;
    tempContainer.innerHTML = mainContentHtml;
    DOM.savedCadernosListContainer.innerHTML = '';
    DOM.savedCadernosListContainer.appendChild(tempContainer.firstChild);

    // Filters questions to show only those belonging to the current notebook.
    setState('filteredQuestions', state.allQuestions.filter(q => caderno.questionIds.includes(q.id)));
    const savedState = state.userCadernoState.get(state.currentCadernoId);
    const newIndex = (savedState && savedState.lastQuestionIndex < state.filteredQuestions.length) ? savedState.lastQuestionIndex : 0;
    setState('currentQuestionIndex', newIndex);
    
    // Resets session stats and displays the first (or last saved) question.
    setState('sessionStats', []);
    await displayQuestion();
}

// Renders the view when inside a specific folder, showing the notebooks within it.
function renderFolderContentView() {
    const folder = state.userFolders.find(f => f.id === state.currentFolderId);
    if (!folder) { 
        setState('currentFolderId', null);
        renderFoldersAndCadernos(); 
        return; 
    }

    DOM.cadernosViewTitle.textContent = folder.name;
    DOM.backToFoldersBtn.classList.remove('hidden');
    DOM.addCadernoToFolderBtn.classList.remove('hidden');
    DOM.createFolderBtn.classList.add('hidden');
    DOM.addQuestionsToCadernoBtn.classList.add('hidden');

    // --- MUDANÇA: Ordenação natural dos cadernos ---
    const cadernosInFolder = state.userCadernos
        .filter(c => c.folderId === state.currentFolderId)
        .sort((a, b) => naturalSort(a.name, b.name));
    // --- FIM DA MUDANÇA ---

    if (cadernosInFolder.length > 0) {
         // --- MODIFICAÇÃO: Wrapper para o layout de lista ---
         let html = '<div class="bg-white rounded-lg shadow-sm">';
         cadernosInFolder.forEach((caderno, index) => {
             const isLast = index === cadernosInFolder.length - 1;
             // --- MODIFICAÇÃO: HTML do item do caderno para layout de lista (removida a borda) ---
             html += `
                <div class="caderno-item flex justify-between items-center p-3 hover:bg-gray-50" data-caderno-id="${caderno.id}">
                    <!-- Left: Icon + Name (clickable to open) -->
                    <div class="flex items-center flex-grow cursor-pointer" data-action="open" style="min-width: 0;"> <!-- min-width: 0 para truncamento -->
                        <i class="far fa-file-alt text-blue-500 text-lg w-6 text-center mr-3 sm:mr-4"></i>
                        <span class="font-medium text-gray-800 truncate" title="${caderno.name}">${caderno.name}</span>
                    </div>
                    
                    <!-- Middle: Question Count -->
                    <div class="flex-shrink-0 mx-4">
                        <span class="text-sm text-gray-500 whitespace-nowrap">${caderno.questionIds ? caderno.questionIds.length : 0} questões</span>
                    </div>

                    <!-- Right: Menu -->
                    <div class="relative flex-shrink-0">
                        <button class="caderno-menu-btn p-2 rounded-full text-gray-500 hover:bg-gray-200" data-caderno-id="${caderno.id}">
                            <i class="fas fa-ellipsis-v pointer-events-none"></i>
                        </button>
                        <!-- Dropdown Panel -->
                        <div id="menu-dropdown-${caderno.id}" class="caderno-menu-dropdown hidden absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-20 border">
                            <a href="#" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 stats-caderno-btn" data-id="${caderno.id}" data-name="${caderno.name}"><i class="fas fa-chart-bar w-5 mr-2 text-gray-500"></i>Desempenho</a>
                            <a href="#" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 edit-caderno-btn" data-id="${caderno.id}" data-name="${caderno.name}"><i class="fas fa-pencil-alt w-5 mr-2 text-gray-500"></i>Renomear</a>
                            <a href="#" class="block px-4 py-2 text-sm text-red-600 hover:bg-gray-100 delete-caderno-btn" data-id="${caderno.id}" data-name="${caderno.name}"><i class="fas fa-trash-alt w-5 mr-2"></i>Excluir</a>
                        </div>
                    </div>
                </div>`;
            // --- FIM DA MODIFICAÇÃO ---
         });
         html += '</div>'; // --- FIM do wrapper
         DOM.savedCadernosListContainer.innerHTML = html;
    } else {
        DOM.savedCadernosListContainer.innerHTML = '<p class="text-center text-gray-500 bg-white p-6 rounded-lg shadow-sm">Nenhum caderno nesta pasta ainda. Clique em "Adicionar Caderno" para criar um.</p>';
    }
}

// Renders the root view of the "Cadernos" tab, showing all folders and unfiled notebooks.
function renderRootCadernosView() {
    DOM.cadernosViewTitle.textContent = 'Meus Cadernos';
    DOM.backToFoldersBtn.classList.add('hidden');
    DOM.addCadernoToFolderBtn.classList.add('hidden');
    DOM.createFolderBtn.classList.remove('hidden');
    DOM.addQuestionsToCadernoBtn.classList.add('hidden');

    // --- MUDANÇA: Ordenação natural dos cadernos sem pasta ---
    const unfiledCadernos = state.userCadernos
        .filter(c => !c.folderId)
        .sort((a, b) => naturalSort(a.name, b.name));
    // --- FIM DA MUDANÇA ---

    // --- MUDANÇA: Ordenação alfabética padrão para as pastas ---
    const sortedFolders = state.userFolders.sort((a, b) => a.name.localeCompare(b.name));
    // --- FIM DA MUDANÇA ---

    if (sortedFolders.length === 0 && unfiledCadernos.length === 0) {
        DOM.savedCadernosListContainer.innerHTML = '<p class="text-center text-gray-500 bg-white p-6 rounded-lg shadow-sm">Nenhum caderno ou pasta criada ainda.</p>';
        return;
    }
    
    let html = '';

    // Render folders (mantendo ordenação alfabética)
    sortedFolders.forEach(folder => {
        const folderCadernosCount = state.userCadernos.filter(c => c.folderId === folder.id).length;
        html += `
            <div class="bg-white rounded-lg shadow-sm p-4 hover:bg-gray-50 transition folder-item mb-2" data-folder-id="${folder.id}">
                <div class="flex justify-between items-center">
                    <div class="flex items-center cursor-pointer flex-grow" data-action="open">
                        <i class="fas fa-folder-open text-yellow-500 text-2xl mr-4"></i>
                        <div>
                            <span class="font-bold text-lg">${folder.name}</span>
                            <p class="text-sm text-gray-500">${folderCadernosCount} caderno(s)</p>
                        </div>
                    </div>
                    <div class="flex items-center space-x-1">
                         <button class="stats-folder-btn text-gray-400 hover:text-blue-600 p-2 rounded-full" data-id="${folder.id}" data-name="${folder.name}"><i class="fas fa-chart-bar pointer-events-none"></i></button>
                         <button class="edit-folder-btn text-gray-400 hover:text-blue-600 p-2 rounded-full" data-id="${folder.id}" data-name="${folder.name}"><i class="fas fa-pencil-alt pointer-events-none"></i></button>
                         <button class="delete-folder-btn text-gray-400 hover:text-red-600 p-2 rounded-full" data-id="${folder.id}"><i class="fas fa-trash-alt pointer-events-none"></i></button>
                         <i class="fas fa-chevron-right text-gray-400 ml-2"></i>
                    </div>
                </div>
            </div>`;
    });

    // Render unfiled cadernos (com ordenação natural)
    if (unfiledCadernos.length > 0) {
        if (sortedFolders.length > 0) { 
            html += '<h3 class="mt-6 mb-2 text-md font-semibold text-gray-600">Cadernos sem Pasta</h3>'; 
        }
        
        // --- MODIFICAÇÃO: Wrapper para o layout de lista ---
        html += '<div class="bg-white rounded-lg shadow-sm">';

        unfiledCadernos.forEach((caderno, index) => {
            const isLast = index === unfiledCadernos.length - 1;
            // --- MODIFICAÇÃO: HTML do item do caderno para layout de lista (removida a borda) ---
            html += `
                <div class="caderno-item flex justify-between items-center p-3 hover:bg-gray-50" data-caderno-id="${caderno.id}">
                    <!-- Left: Icon + Name (clickable to open) -->
                    <div class="flex items-center flex-grow cursor-pointer" data-action="open" style="min-width: 0;"> <!-- min-width: 0 para truncamento -->
                        <i class="far fa-file-alt text-blue-500 text-lg w-6 text-center mr-3 sm:mr-4"></i>
                        <span class="font-medium text-gray-800 truncate" title="${caderno.name}">${caderno.name}</span>
                    </div>
                    
                    <!-- Middle: Question Count -->
                    <div class="flex-shrink-0 mx-4">
                        <span class="text-sm text-gray-500 whitespace-nowrap">${caderno.questionIds ? caderno.questionIds.length : 0} questões</span>
                    </div>

                    <!-- Right: Menu -->
                    <div class="relative flex-shrink-0">
                        <button class="caderno-menu-btn p-2 rounded-full text-gray-500 hover:bg-gray-200" data-caderno-id="${caderno.id}">
                            <i class="fas fa-ellipsis-v pointer-events-none"></i>
                        </button>
                        <!-- Dropdown Panel -->
                        <div id="menu-dropdown-${caderno.id}" class="caderno-menu-dropdown hidden absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-20 border">
                            <a href="#" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 stats-caderno-btn" data-id="${caderno.id}" data-name="${caderno.name}"><i class="fas fa-chart-bar w-5 mr-2 text-gray-500"></i>Desempenho</a>
                            <a href="#" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 edit-caderno-btn" data-id="${caderno.id}" data-name="${caderno.name}"><i class="fas fa-pencil-alt w-5 mr-2 text-gray-500"></i>Renomear</a>
                            <a href="#" class="block px-4 py-2 text-sm text-red-600 hover:bg-gray-100 delete-caderno-btn" data-id="${caderno.id}" data-name="${caderno.name}"><i class="fas fa-trash-alt w-5 mr-2"></i>Excluir</a>
                        </div>
                    </div>
                </div>`;
            // --- FIM DA MODIFICAÇÃO ---
        });
        
        html += '</div>'; // --- FIM do wrapper
    }
    DOM.savedCadernosListContainer.innerHTML = html;
}


// Main function to control the rendering of the "Cadernos" tab view.
export async function renderFoldersAndCadernos() {
    // ===== INÍCIO DA MODIFICAÇÃO: Remove o card de info da pasta se existir =====
    const existingCard = document.getElementById('folder-info-card');
    if (existingCard) {
        existingCard.remove();
    }
    // ===== FIM DA MODIFICAÇÃO =====

    DOM.savedCadernosListContainer.innerHTML = '';

    if (state.currentCadernoId) {
        await renderCadernoContentView();
    } else if (state.currentFolderId) {
        // ===== INÍCIO DA MODIFICAÇÃO: Adiciona o card de info da pasta =====
        const folder = state.userFolders.find(f => f.id === state.currentFolderId);
        if (folder) {
            const count = state.userCadernos.filter(c => c.folderId === folder.id).length;
            const cardHtml = `
            <div class="bg-white rounded-lg shadow-sm p-4 mb-4 border-b border-gray-200">
                <div class="flex justify-between items-center">
                    <!-- Lado Esquerdo: Ícone, Nome, Opções -->
                    <div class="flex items-center">
                        <i class="fas fa-folder text-yellow-500 text-xl mr-3"></i>
                        <div>
                            <h3 class="text-lg font-semibold text-blue-600">${folder.name}</h3>
                            <div class="text-sm">
                                <!-- Botões com classes de delegação -->
                                <button class="text-blue-600 hover:underline font-medium p-0 edit-folder-btn" data-id="${folder.id}" data-name="${folder.name}">Renomear</button>
                                <span class="text-gray-300 mx-1">•</span>
                                <button class="text-red-500 hover:underline font-medium p-0 delete-folder-btn" data-id="${folder.id}" data-name="${folder.name}">Excluir</button>
                            </div>
                        </div>
                    </div>
                    <!-- Lado Direito: Contagem e Menu -->
                    <div class="flex items-center space-x-3">
                        <span class="text-sm text-gray-500">${count} cadernos</span>
                        <button class="text-gray-400 hover:text-gray-600 p-1 rounded-full">
                            <i class="fas fa-ellipsis-h"></i>
                        </button>
                    </div>
                </div>
            </div>
            `;
            // Cria um elemento temporário para o HTML e o insere
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = cardHtml.trim();
            const cardElement = tempDiv.firstChild;
            cardElement.id = 'folder-info-card'; // ID para remoção futura

            // Insere o card ANTES do container da lista de cadernos
            DOM.savedCadernosListContainer.before(cardElement);
        }
        // ===== FIM DA MODIFICAÇÃO =====

        renderFolderContentView();
    } else {
        renderRootCadernosView();
    }
}

// Handles clicks on folder items to open them, edit, delete, or view stats.
export function handleFolderItemClick(event) {
    const folderItem = event.target.closest('.folder-item');
    if (!folderItem) return;

    const folderId = folderItem.dataset.folderId;
    const folder = state.userFolders.find(f => f.id === folderId);
    if (!folder) return;

    // Handle opening the folder
    if (event.target.closest('[data-action="open"]')) {
        setState('currentFolderId', folderId);
        renderFoldersAndCadernos();
        return;
    }

    // Handle viewing stats
    if (event.target.closest('.stats-folder-btn')) {
        showItemStatsModal(folderId, 'folder', folder.name);
        return;
    }

    // ===== INÍCIO DA MODIFICAÇÃO: Lógica de editar/excluir movida para event-listeners.js =====
    // O código de 'edit-folder-btn' e 'delete-folder-btn' foi removido daqui.
    // ===== FIM DA MODIFICAÇÃO =====
}

// Handles clicks on notebook items to open them, edit, delete, or view stats.
export function handleCadernoItemClick(event) {
    const cadernoItem = event.target.closest('.caderno-item');
    if (!cadernoItem) return;

    // --- NOVO: Fecha o dropdown após um clique em uma ação ---
    const dropdown = cadernoItem.querySelector('.caderno-menu-dropdown');
    // Verifica se o clique NÃO foi para abrir o caderno (data-action=open)
    if (dropdown && !dropdown.classList.contains('hidden') && !event.target.closest('[data-action="open"]')) {
         dropdown.classList.add('hidden');
    }
    // --- FIM DO NOVO ---

    const cadernoId = cadernoItem.dataset.cadernoId;
    const caderno = state.userCadernos.find(c => c.id === cadernoId);
    if(!caderno) return;
    
    // Handle opening the notebook
    if (event.target.closest('[data-action="open"]')) {
        setState('currentCadernoId', cadernoId);
        renderFoldersAndCadernos();
        return;
    }
    
    // Handle viewing stats
    if (event.target.closest('.stats-caderno-btn')) {
        showItemStatsModal(cadernoId, 'caderno', caderno.name);
        return;
    }
    
    // ===== INÍCIO DA MODIFICAÇÃO: Lógica de editar/excluir movida para event-listeners.js =====
    // O código de 'edit-caderno-btn' e 'delete-caderno-btn' foi removido daqui.
    // ===== FIM DA MODIFICAÇÃO =====
}

// Handles the "Back" button to navigate up the folder/notebook hierarchy.
export function handleBackToFolders() {
    if (state.currentCadernoId) {
        // When going back from a caderno, go to its folder if it has one
        const caderno = state.userCadernos.find(c => c.id === state.currentCadernoId);
        setState('currentCadernoId', null);
        if(caderno && caderno.folderId) {
            setState('currentFolderId', caderno.folderId);
        } else {
            setState('currentFolderId', null);
        }
    } else if (state.currentFolderId) {
        setState('currentFolderId', null);
    }
    renderFoldersAndCadernos();
}

// Initiates the mode to add questions to the currently opened notebook.
// ===== INÍCIO DA MODIFICAÇÃO: Função agora é async =====
export async function handleAddQuestionsToCaderno() {
// ===== FIM DA MODIFICAÇÃO =====
    const caderno = state.userCadernos.find(c => c.id === state.currentCadernoId);
    if (!caderno) return;

    setState('isAddingQuestionsMode', { active: true, cadernoId: state.currentCadernoId });
    DOM.addQuestionsBanner.classList.remove('hidden');
    DOM.addQuestionsBannerText.textContent = `Selecione questões para adicionar ao caderno "${caderno.name}".`;
    // ===== INÍCIO DA MODIFICAÇÃO: Adicionado await =====
    await navigateToView('vade-mecum-view', false);
    // ===== FIM DA MODIFICAÇÃO =====
}

// Exits the "add questions" mode.
export function exitAddMode() {
    if (state.isAddingQuestionsMode.active) {
        setState('isAddingQuestionsMode', { active: false, cadernoId: null });
        DOM.addQuestionsBanner.classList.add('hidden');
        DOM.filterBtn.textContent = 'Filtrar questões';
        DOM.filterBtn.disabled = false;
        
        const mainContentContainer = DOM.vadeMecumContentArea.querySelector('#tabs-and-main-content');
        if (mainContentContainer) mainContentContainer.classList.remove('hidden');
    }
}

// Cancels the "add questions" process and returns to the notebooks view.
// ===== INÍCIO DA MODIFICAÇÃO: Função agora é async =====
export async function cancelAddQuestions() {
// ===== FIM DA MODIFICAÇÃO =====
    exitAddMode();
    // ===== INÍCIO DA MODIFICAÇÃO: Adicionado await =====
    await navigateToView('cadernos-view');
    // ===== FIM DA MODIFICAÇÃO =====
}

// Adds filtered questions to the current notebook.
export async function addFilteredQuestionsToCaderno() {
    if (!state.isAddingQuestionsMode.active || !state.currentUser) return;

    const { cadernoId } = state.isAddingQuestionsMode;
    const caderno = state.userCadernos.find(c => c.id === cadernoId);
    if (!caderno) return;

    // Only get IDs of questions not already in the notebook
    const existingIds = new Set(caderno.questionIds || []);
    const newQuestionIds = state.filteredQuestions
        .map(q => q.id)
        .filter(id => !existingIds.has(id));

    if (newQuestionIds.length > 0) {
        await addQuestionIdsToFirestore(cadernoId, newQuestionIds);
    }
    
    exitAddMode();
    setState('isNavigatingBackFromAddMode', true); // Flag to prevent view reset
    setState('currentCadernoId', cadernoId);
    // ===== INÍCIO DA MODIFICAÇÃO: Adicionado await =====
    await navigateToView('cadernos-view');
    // ===== FIM DA MODIFICAÇÃO =====
}

// Removes a specific question from the currently opened notebook.
export async function removeQuestionFromCaderno(questionId) {
    if (!state.currentCadernoId || !state.currentUser) return;
    await removeQuestionIdFromFirestore(state.currentCadernoId, questionId);
}
