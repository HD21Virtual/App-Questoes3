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

// ===== INÍCIO DA MODIFICAÇÃO: Lógica de renderização hierárquica =====

// Helper para renderizar uma linha de caderno (usado em ambas as views)
function getCadernoRowHtml(caderno, isSubItem = false) {
    const indentation = isSubItem ? 'pl-10' : ''; // pl-10 = pl-4 (icon) + pl-6 (text)
    return `
    <div class="caderno-item flex justify-between items-center p-3 hover:bg-gray-50 ${indentation}" data-caderno-id="${caderno.id}">
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
                <a href="#" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 move-caderno-btn" data-id="${caderno.id}" data-name="${caderno.name}"><i class="fas fa-share w-5 mr-2 text-gray-500"></i>Mover</a>
                <a href="#" class="block px-4 py-2 text-sm text-red-600 hover:bg-gray-100 delete-caderno-btn" data-id="${caderno.id}" data-name="${caderno.name}"><i class="fas fa-trash-alt w-5 mr-2"></i>Excluir</a>
            </div>
        </div>
    </div>`;
}

// Helper para renderizar uma linha de pasta (usado em ambas as views)
function getFolderRowHtml(folder, isSubfolder = false) {
    const folderCadernosCount = state.userCadernos.filter(c => c.folderId === folder.id).length;
    const folderSubfoldersCount = state.userFolders.filter(f => f.parentId === folder.id).length;
    const indentation = isSubfolder ? 'pl-4' : ''; // Subpastas têm um leve recuo

    let countText = '';
    if (folderSubfoldersCount > 0 && folderCadernosCount > 0) {
        countText = `${folderSubfoldersCount} subpasta(s), ${folderCadernosCount} caderno(s)`;
    } else if (folderSubfoldersCount > 0) {
        countText = `${folderSubfoldersCount} subpasta(s)`;
    } else {
        countText = `${folderCadernosCount} caderno(s)`;
    }

    const iconClass = isSubfolder ? 'fa-folder text-gray-600' : 'fa-folder-open text-yellow-500';
    const iconSize = isSubfolder ? 'text-lg' : 'text-2xl';

    return `
    <div class="folder-item flex justify-between items-center p-3 hover:bg-gray-50" data-folder-id="${folder.id}">
        <!-- Left: Icon + Name (clickable to open) -->
        <div class="flex items-center flex-grow cursor-pointer" data-action="open" style="min-width: 0;">
            <i class="fas ${iconClass} ${iconSize} w-6 text-center mr-3 sm:mr-4"></i>
            <span class="font-medium text-gray-800 truncate" title="${folder.name}">${folder.name}</span>
        </div>
        
        <!-- Middle: Content Count -->
        <div class="flex-shrink-0 mx-4">
            <span class="text-sm text-gray-500 whitespace-nowrap">${countText}</span>
        </div>

        <!-- Right: Menu -->
        <div class="relative flex-shrink-0">
            <button class="folder-menu-btn p-2 rounded-full text-gray-500 hover:bg-gray-200" data-folder-id="${folder.id}">
                <i class="fas fa-ellipsis-v pointer-events-none"></i>
            </button>
            <!-- Dropdown Panel for Subfolder -->
            <div id="menu-dropdown-folder-${folder.id}" class="caderno-menu-dropdown hidden absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-20 border">
                <a href="#" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 stats-folder-btn" data-id="${folder.id}" data-name="${folder.name}"><i class="fas fa-chart-bar w-5 mr-2 text-gray-500"></i>Desempenho</a>
                <a href="#" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 edit-folder-btn" data-id="${folder.id}" data-name="${folder.name}"><i class="fas fa-pencil-alt w-5 mr-2 text-gray-500"></i>Renomear</a>
                <a href="#" class="block px-4 py-2 text-sm text-red-600 hover:bg-gray-100 delete-folder-btn" data-id="${folder.id}" data-name="${folder.name}"><i class="fas fa-trash-alt w-5 mr-2"></i>Excluir</a>
            </div>
        </div>
    </div>`;
}

// Renders the view when inside a specific folder, showing subfolders and notebooks hierarchically.
function renderFolderContentView() {
    const folder = state.userFolders.find(f => f.id === state.currentFolderId);
    if (!folder) { 
        setState('currentFolderId', null);
        renderFoldersAndCadernos(); 
        return; 
    }

    DOM.backToFoldersBtn.classList.remove('hidden');
    DOM.addCadernoToFolderBtn.classList.remove('hidden');
    DOM.createFolderBtn.classList.add('hidden');
    DOM.addQuestionsToCadernoBtn.classList.add('hidden');

    // 1. Get Subfolders
    const subfolders = state.userFolders
        .filter(f => f.parentId === state.currentFolderId)
        .sort(naturalSort);

    // 2. Get Cadernos nesta pasta
    const cadernosInThisFolder = state.userCadernos
        .filter(c => c.folderId === state.currentFolderId)
        .sort(naturalSort);
    
    let html = '';

    if (subfolders.length === 0 && cadernosInThisFolder.length === 0) {
        DOM.savedCadernosListContainer.innerHTML = '<p class="text-center text-gray-500 bg-white p-6 rounded-lg shadow-sm">Nenhum caderno ou subpasta aqui. Clique em "Adicionar Caderno" ou use o menu para criar uma subpasta.</p>';
        return;
    }
    
    html += '<div class="bg-white rounded-lg shadow-sm">';

    // 3. Renderiza Subpastas primeiro, cada uma com seus cadernos filhos
    subfolders.forEach(subfolder => {
        // Renderiza a linha da subpasta
        html += `
        <div class="folder-item-container" data-folder-id="${subfolder.id}">
            <div class="folder-item flex justify-between items-center p-3 hover:bg-gray-50" data-folder-id="${subfolder.id}">
                <!-- Left: Icon + Name (clickable to open) -->
                <div class="flex items-center flex-grow cursor-pointer" data-action="open" style="min-width: 0;">
                    <!-- Ícone de expandir -->
                    <i class="fas fa-chevron-right toggle-folder-contents text-gray-400 w-4 text-center mr-2 cursor-pointer transition-transform duration-200"></i>
                    <i class="fas fa-folder text-gray-600 text-lg w-6 text-center mr-3 sm:mr-4"></i>
                    <span class="font-medium text-gray-800 truncate" title="${subfolder.name}">${subfolder.name}</span>
                </div>
                
                <!-- Middle: Question Count -->
                <div class="flex-shrink-0 mx-4">
                    <span class="text-sm text-gray-500 whitespace-nowrap">${state.userCadernos.filter(c => c.folderId === subfolder.id).length} caderno(s)</span>
                </div>

                <!-- Right: Menu -->
                <div class="relative flex-shrink-0">
                    <button class="folder-menu-btn p-2 rounded-full text-gray-500 hover:bg-gray-200" data-folder-id="${subfolder.id}">
                        <i class="fas fa-ellipsis-v pointer-events-none"></i>
                    </button>
                    <!-- Dropdown Panel for Subfolder -->
                    <div id="menu-dropdown-folder-${subfolder.id}" class="caderno-menu-dropdown hidden absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-20 border">
                        <a href="#" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 stats-folder-btn" data-id="${subfolder.id}" data-name="${subfolder.name}"><i class="fas fa-chart-bar w-5 mr-2 text-gray-500"></i>Desempenho</a>
                        <a href="#" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 edit-folder-btn" data-id="${subfolder.id}" data-name="${subfolder.name}"><i class="fas fa-pencil-alt w-5 mr-2 text-gray-500"></i>Renomear</a>
                        <a href="#" class="block px-4 py-2 text-sm text-red-600 hover:bg-gray-100 delete-folder-btn" data-id="${subfolder.id}" data-name="${subfolder.name}"><i class="fas fa-trash-alt w-5 mr-2"></i>Excluir</a>
                    </div>
                </div>
            </div>
        </div>`;

        // Renderiza os cadernos filhos desta subpasta (inicialmente ocultos)
        const notebooksInside = state.userCadernos
            .filter(c => c.folderId === subfolder.id)
            .sort(naturalSort);
        
        notebooksInside.forEach(caderno => {
            html += `<div class="hidden notebook-child-of-${subfolder.id}">`;
            html += getCadernoRowHtml(caderno, true); // true = isSubItem
            html += `</div>`;
        });
    });

    // 4. Renderiza cadernos que estão diretamente nesta pasta (não em subpastas)
    cadernosInThisFolder.forEach(caderno => {
        html += getCadernoRowHtml(caderno, false); // false = not a subItem
    });

    html += '</div>'; // Fecha o wrapper
    DOM.savedCadernosListContainer.innerHTML = html;
}

// Renders the root view of the "Cadernos" tab, showing all folders and unfiled notebooks.
function renderRootCadernosView() {
    DOM.cadernosViewTitle.textContent = 'Meus Cadernos';
    DOM.backToFoldersBtn.classList.add('hidden');
    DOM.addCadernoToFolderBtn.classList.add('hidden');
    DOM.createFolderBtn.classList.remove('hidden');
    DOM.addQuestionsToCadernoBtn.classList.add('hidden');

    // 1. Get Cadernos sem pasta
    const unfiledCadernos = state.userCadernos
        .filter(c => !c.folderId)
        .sort((a, b) => naturalSort(a.name, b.name));

    // 2. Get Pastas Raiz
    const sortedFolders = state.userFolders
        .filter(f => !f.parentId) // Apenas pastas que NÃO têm parentId
        .sort((a, b) => naturalSort(a.name, b.name));

    if (sortedFolders.length === 0 && unfiledCadernos.length === 0) {
        DOM.savedCadernosListContainer.innerHTML = '<p class="text-center text-gray-500 bg-white p-6 rounded-lg shadow-sm">Nenhum caderno ou pasta criada ainda.</p>';
        return;
    }
    
    let html = '';

    // 3. Renderiza pastas raiz, cada uma com seus cadernos filhos
    sortedFolders.forEach(folder => {
        html += `
        <div class="bg-white rounded-lg shadow-sm mb-2 folder-item-container" data-folder-id="${folder.id}">
            <div class="folder-item flex justify-between items-center p-4 hover:bg-gray-50 transition" data-folder-id="${folder.id}">
                <div class="flex items-center cursor-pointer flex-grow" data-action="open" style="min-width: 0;">
                    <!-- Ícone de expandir -->
                    <i class="fas fa-chevron-right toggle-folder-contents text-gray-400 w-4 text-center mr-2 cursor-pointer transition-transform duration-200"></i>
                    <i class="fas fa-folder-open text-yellow-500 text-2xl mr-4"></i>
                    <div>
                        <span class="font-bold text-lg">${folder.name}</span>
                        <p class="text-sm text-gray-500">${state.userCadernos.filter(c => c.folderId === folder.id).length} caderno(s)</p>
                    </div>
                </div>
                <div class="flex items-center space-x-1">
                     <button class="stats-folder-btn text-gray-400 hover:text-blue-600 p-2 rounded-full" data-id="${folder.id}" data-name="${folder.name}"><i class="fas fa-chart-bar pointer-events-none"></i></button>
                     <button class="edit-folder-btn text-gray-400 hover:text-blue-600 p-2 rounded-full" data-id="${folder.id}" data-name="${folder.name}"><i class="fas fa-pencil-alt pointer-events-none"></i></button>
                     <button class="delete-folder-btn text-gray-400 hover:text-red-600 p-2 rounded-full" data-id="${folder.id}" data-name="${folder.name}"><i class="fas fa-trash-alt pointer-events-none"></i></button>
                     <i class="fas fa-chevron-right text-gray-400 ml-2" data-action="open"></i>
                </div>
            </div>
        </div>`;
        
        // Renderiza os cadernos filhos desta pasta (inicialmente ocultos)
        const notebooksInside = state.userCadernos
            .filter(c => c.folderId === folder.id)
            .sort(naturalSort);
        
        notebooksInside.forEach(caderno => {
            html += `<div class="hidden notebook-child-of-${folder.id} bg-white">`; // Adicionado bg-white
            html += getCadernoRowHtml(caderno, true); // true = isSubItem
            html += `</div>`;
        });
    });

    // 4. Renderiza cadernos sem pasta
    if (unfiledCadernos.length > 0) {
        if (sortedFolders.length > 0) { 
            html += '<h3 class="mt-6 mb-2 text-md font-semibold text-gray-600">Cadernos sem Pasta</h3>'; 
        }
        
        html += '<div class="bg-white rounded-lg shadow-sm">';
        unfiledCadernos.forEach(caderno => {
            html += getCadernoRowHtml(caderno, false); // false = not a subItem
        });
        html += '</div>';
    }
    DOM.savedCadernosListContainer.innerHTML = html;
}
// ===== FIM DA MODIFICAÇÃO =====


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
            // ===== INÍCIO DA MODIFICAÇÃO (SOLICITAÇÃO DO USUÁRIO) =====
            // Adicionado ID ao botão de menu, classe 'relative' ao container e o HTML do dropdown
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
                    <div class="flex items-center space-x-3 relative"> <!-- Adicionado 'relative' -->
                        <span class="text-sm text-gray-500">${count} cadernos</span>
                        <button id="folder-info-menu-btn" data-folder-id="${folder.id}" class="text-gray-400 hover:text-gray-600 p-1 rounded-full">
                            <i class="fas fa-ellipsis-h pointer-events-none"></i>
                        </button>
                        <!-- Dropdown Panel -->
                        <div id="folder-info-menu-dropdown-${folder.id}" class="folder-info-menu-dropdown hidden absolute right-0 top-full mt-2 w-48 bg-white rounded-md shadow-lg z-20 border">
                            <a href="#" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 create-subfolder-btn" data-folder-id="${folder.id}">
                                <i class="fas fa-folder-plus w-5 mr-2 text-gray-500"></i>Criar Subpasta
                            </a>
                        </div>
                    </div>
                    <!-- ===== FIM DA MODIFICAÇÃO (SOLICITAÇÃO DO USUÁRIO) ===== -->
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

        renderFolderContentView(); // <-- Esta função é chamada aqui
    } else {
        renderRootCadernosView();
    }
}

// Handles clicks on folder items to open them, edit, delete, or view stats.
export function handleFolderItemClick(event) {
    // ===== INÍCIO DA MODIFICAÇÃO: Permite cliques em .folder-item (subpastas) e .bg-white (pastas raiz) =====
    const folderItem = event.target.closest('.folder-item, .bg-white[data-folder-id]');
    // ===== FIM DA MODIFICAÇÃO =====
    if (!folderItem) return;

    // ===== INÍCIO DA MODIFICAÇÃO: Ignora clique no ícone de expandir =====
    if (event.target.closest('.toggle-folder-contents')) {
        return;
    }
    // ===== FIM DA MODIFICAÇÃO =====

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
        // ===== INÍCIO DA MODIFICAÇÃO: Navega para a pasta pai, se existir =====
        const currentFolder = state.userFolders.find(f => f.id === state.currentFolderId);
        if (currentFolder && currentFolder.parentId) {
            setState('currentFolderId', currentFolder.parentId);
        } else {
            setState('currentFolderId', null); // Vai para a raiz
        }
        // ===== FIM DA MODIFICAÇÃO =====
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
