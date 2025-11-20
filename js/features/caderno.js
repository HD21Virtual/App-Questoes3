import { Timestamp, updateDoc, doc, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { db } from '../firebase-config.js'; // Importar db
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
    // ===== INÍCIO DA MODIFICAÇÃO (SOLICITAÇÃO DO USUÁRIO) =====
    // DOM.toggleMoveModeBtn.classList.add('hidden'); // Esconde o botão "Mover" // REMOVIDO
    // ===== FIM DA MODIFICAÇÃO =====

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
    // ===== INÍCIO DA MODIFICAÇÃO (SOLICITAÇÃO DO USUÁRIO) =====
    const isMoveMode = state.isMoveModeActive;
    
    // **NOVO**: Verifica se este item deve ser pré-selecionado
    const isPreselected = state.itemToPreselectOnMove && 
                          state.itemToPreselectOnMove.type === 'caderno' && 
                          state.itemToPreselectOnMove.id === caderno.id;
    // ===== FIM DA MODIFICAÇÃO =====

    return `
    <div class="caderno-item flex justify-between items-center p-3 hover:bg-gray-50 ${indentation}" data-caderno-id="${caderno.id}">
        <!-- Left: Checkbox (Move Mode) + Icon + Name -->
        <div class="flex items-center flex-grow" style="min-width: 0;">
            <!-- Checkbox (visível apenas no modo Mover) -->
            <div class="checkbox-container ${isMoveMode ? 'flex' : 'hidden'} items-center pr-3">
                <!-- ===== INÍCIO DA MODIFICAÇÃO (SOLICITAÇÃO DO USUÁRIO) ===== -->
                <input type="checkbox" class="move-item-checkbox rounded" data-id="${caderno.id}" data-type="caderno" ${isPreselected ? 'checked' : ''}>
                <!-- ===== FIM DA MODIFICAÇÃO ===== -->
            </div>
            <!-- Ícone + Nome (clicável para abrir) -->
            <div class="flex items-center flex-grow cursor-pointer" data-action="open" style="min-width: 0;">
                <i class="far fa-file-alt text-blue-500 text-lg w-6 text-center mr-3 sm:mr-4"></i>
                <span class="font-medium text-gray-800 truncate" title="${caderno.name}">${caderno.name}</span>
            </div>
        </div>
        
        <!-- Middle: Question Count (escondido no modo mover) -->
        <div class="flex-shrink-0 mx-4 ${isMoveMode ? 'hidden' : 'flex'}">
            <span class="text-sm text-gray-500 whitespace-nowrap">${caderno.questionIds ? caderno.questionIds.length : 0} questões</span>
        </div>

        <!-- Right: Menu (escondido no modo mover) -->
        <div class="relative flex-shrink-0 ${isMoveMode ? 'hidden' : 'flex'}">
            <button class="caderno-menu-btn p-2 rounded-full text-gray-500 hover:bg-gray-200" data-caderno-id="${caderno.id}">
                <i class="fas fa-ellipsis-v pointer-events-none"></i>
            </button>
            <!-- Dropdown Panel -->
            <div id="menu-dropdown-${caderno.id}" class="caderno-menu-dropdown hidden absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-20 border">
                <a href="#" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 stats-caderno-btn" data-id="${caderno.id}" data-name="${caderno.name}"><i class="fas fa-chart-bar w-5 mr-2 text-gray-500"></i>Desempenho</a>
                <a href="#" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 edit-caderno-btn" data-id="${caderno.id}" data-name="${caderno.name}"><i class="fas fa-pencil-alt w-5 mr-2 text-gray-500"></i>Renomear</a>
                <!-- ===== INÍCIO DA MODIFICAÇÃO (SOLICITAÇÃO DO USUÁRIO) ===== -->
                <a href="#" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 toggle-move-mode-btn-from-dropdown" data-caderno-id="${caderno.id}"><i class="fas fa-share w-5 mr-2 text-gray-500"></i>Mover</a>
                <!-- ===== FIM DA MODIFICAÇÃO ===== -->
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

    // ===== INÍCIO DA MODIFICAÇÃO (SOLICITAÇÃO DO USUÁRIO) =====
    const isMoveMode = state.isMoveModeActive;
    
    // **NOVO**: Verifica se este item deve ser pré-selecionado
    const isPreselected = state.itemToPreselectOnMove && 
                          state.itemToPreselectOnMove.type === 'folder' && 
                          state.itemToPreselectOnMove.id === folder.id;
    // ===== FIM DA MODIFICAÇÃO =====

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
        <!-- Left: Checkbox (Move Mode) + Icon + Name -->
        <div class="flex items-center flex-grow" style="min-width: 0;">
            <!-- Checkbox (visível apenas no modo Mover) -->
            <div class="checkbox-container ${isMoveMode ? 'flex' : 'hidden'} items-center pr-3">
                <!-- ===== INÍCIO DA MODIFICAÇÃO (SOLICITAÇÃO DO USUÁRIO) ===== -->
                <input type="checkbox" class="move-item-checkbox rounded" data-id="${folder.id}" data-type="folder" ${isPreselected ? 'checked' : ''}>
                <!-- ===== FIM DA MODIFICAÇÃO ===== -->
            </div>
            <!-- Ícone + Nome (clicável para abrir) -->
            <div class="flex items-center flex-grow cursor-pointer" data-action="open" style="min-width: 0;">
                <i class="fas ${iconClass} ${iconSize} w-6 text-center mr-3 sm:mr-4"></i>
                <span class="font-medium text-gray-800 truncate" title="${folder.name}">${folder.name}</span>
            </div>
        </div>
        
        <!-- Middle: Content Count (escondido no modo mover) -->
        <div class="flex-shrink-0 mx-4 ${isMoveMode ? 'hidden' : 'flex'}">
            <span class="text-sm text-gray-500 whitespace-nowrap">${countText}</span>
        </div>

        <!-- Right: Menu (escondido no modo mover) -->
        <div class="relative flex-shrink-0 ${isMoveMode ? 'hidden' : 'flex'}">
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
    // ===== INÍCIO DA MODIFICAÇÃO (SOLICITAÇÃO DO USUÁRIO) =====
    const isMoveMode = state.isMoveModeActive;

    // Esconde/Mostra botões com base no modo de mover
    DOM.backToFoldersBtn.classList.remove('hidden');
    // MODIFICAÇÃO: Botão "Adicionar Caderno" agora fica visível
    DOM.addCadernoToFolderBtn.classList.remove('hidden');
    // DOM.createFolderBtn.classList.toggle('hidden', isMoveMode); // MODIFICADO ABAIXO
    DOM.createFolderBtn.classList.add('hidden'); // Sempre escondido dentro da pasta
    DOM.addQuestionsToCadernoBtn.classList.add('hidden');
    // DOM.toggleMoveModeBtn.classList.toggle('hidden', isMoveMode); // REMOVIDO
    // DOM.toggleMoveModeBtn.classList.remove('hidden'); // REMOVIDO
    // ===== FIM DA MODIFICAÇÃO =====

    // ===== INÍCIO DA MODIFICAÇÃO: Ordenação alfanumérica de subpastas e cadernos =====
    // 1. Get Subfolders e mapeia
    const subfolders = state.userFolders
        .filter(f => f.parentId === state.currentFolderId)
        .map(f => ({ ...f, type: 'folder' })); // Adiciona o tipo

    // 2. Get Cadernos nesta pasta e mapeia
    const cadernosInThisFolder = state.userCadernos
        .filter(c => c.folderId === state.currentFolderId)
        .map(c => ({ ...c, type: 'caderno' })); // Adiciona o tipo
    
    // 3. Combina e ordena alfanumericamente pelo nome
    const combinedItems = [...subfolders, ...cadernosInThisFolder]
        .sort((a, b) => naturalSort(a.name, b.name));
    // ===== FIM DA MODIFICAÇÃO =====

    let html = '';

    if (combinedItems.length === 0) {
        DOM.savedCadernosListContainer.innerHTML = '<p class="text-center text-gray-500 bg-white p-6 rounded-lg shadow-sm">Nenhum caderno ou subpasta aqui. Clique em "Adicionar Caderno" ou use o menu para criar uma subpasta.</p>';
        return;
    }
    
    html += '<div class="bg-white rounded-lg shadow-sm">';

    // ===== INÍCIO DA MODIFICAÇÃO: Renderiza a lista combinada e ordenada =====
    combinedItems.forEach(item => {
        if (item.type === 'folder') {
            // --- Início da lógica de renderização da subpasta (copiada de antes) ---
            const subfolder = item;
            // **NOVO**: Verifica se este item deve ser pré-selecionado
            const isPreselected = state.itemToPreselectOnMove && 
                                  state.itemToPreselectOnMove.type === 'folder' && 
                                  state.itemToPreselectOnMove.id === subfolder.id;

            html += `
            <div class="folder-item-container" data-folder-id="${subfolder.id}">
                <div class="folder-item flex justify-between items-center p-3 hover:bg-gray-50" data-folder-id="${subfolder.id}">
                    <!-- Left: Checkbox (Move Mode) + Icon + Name -->
                    <div class="flex items-center flex-grow" style="min-width: 0;">
                        <!-- Checkbox (visível apenas no modo Mover) -->
                        <div class="checkbox-container ${isMoveMode ? 'flex' : 'hidden'} items-center pr-3">
                            <input type="checkbox" class="move-item-checkbox rounded" data-id="${subfolder.id}" data-type="folder" ${isPreselected ? 'checked' : ''}>
                        </div>
                        
                        <div class="flex items-center flex-grow" style="min-width: 0;">
                            <i class="fas fa-folder text-gray-600 text-lg w-6 text-center mr-3 sm:mr-4"></i>
                            <span class="font-medium text-gray-800 truncate" title="${subfolder.name}">${subfolder.name}</span>
                            <!-- ADICIONADO: Texto de expandir/recolher (escondido no modo mover) -->
                            <span class="toggle-folder-contents text-blue-600 hover:underline text-sm ml-2 cursor-pointer whitespace-nowrap ${isMoveMode ? 'hidden' : ''}" 
                                  data-folder-id="${subfolder.id}"
                                  data-text-expand="(Expandir)"
                                  data-text-collapse="(Recolher)">
                                (Expandir)
                            </span>
                        </div>
                    </div>
                    
                    <!-- Middle: Question Count (escondido no modo mover) -->
                    <div class="flex-shrink-0 mx-4 ${isMoveMode ? 'hidden' : 'flex'}">
                        <span class="text-sm text-gray-500 whitespace-nowrap">${state.userCadernos.filter(c => c.folderId === subfolder.id).length} caderno(s)</span>
                    </div>

                    <!-- Right: Menu (escondido no modo mover) -->
                    <div class="relative flex-shrink-0 ${isMoveMode ? 'hidden' : 'flex'}">
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
            // --- Fim da lógica de renderização da subpasta ---

        } else if (item.type === 'caderno') {
            // --- Início da lógica de renderização do caderno (copiada de antes) ---
            const caderno = item;
            html += getCadernoRowHtml(caderno, false); // false = not a subItem
            // --- Fim da lógica de renderização do caderno ---
        }
    });
    // ===== FIM DA MODIFICAÇÃO =====

    html += '</div>'; // Fecha o wrapper
    DOM.savedCadernosListContainer.innerHTML = html;
}

// Renders the root view of the "Cadernos" tab, showing all folders and unfiled notebooks.
function renderRootCadernosView() {
    // ===== INÍCIO DA MODIFICAÇÃO (SOLICITAÇÃO DO USUÁRIO) =====
    const isMoveMode = state.isMoveModeActive;
    
    // Esconde/Mostra botões com base no modo de mover
    DOM.cadernosViewTitle.textContent = 'Meus Cadernos';
    DOM.backToFoldersBtn.classList.add('hidden');
    DOM.addCadernoToFolderBtn.classList.add('hidden');
    DOM.addQuestionsToCadernoBtn.classList.add('hidden');
    
    DOM.createFolderBtn.classList.toggle('hidden', isMoveMode);
    // DOM.toggleMoveModeBtn.classList.toggle('hidden', isMoveMode); // REMOVIDO
    // DOM.toggleMoveModeBtn.classList.remove('hidden'); // REMOVIDO
    // ===== FIM DA MODIFICAÇÃO =====

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
        // ===== INÍCIO DA MODIFICAÇÃO (SOLICITAÇÃO DO USUÁRIO) =====
        // **NOVO**: Verifica se este item deve ser pré-selecionado
        const isPreselected = state.itemToPreselectOnMove && 
                              state.itemToPreselectOnMove.type === 'folder' && 
                              state.itemToPreselectOnMove.id === folder.id;
        // ===== FIM DA MODIFICAÇÃO =====
        
        html += `
        <div class="bg-white rounded-lg shadow-sm mb-2 folder-item-container" data-folder-id="${folder.id}">
            <div class="folder-item flex justify-between items-center p-4 hover:bg-gray-50 transition" data-folder-id="${folder.id}">
                <!-- Checkbox (visível apenas no modo Mover) -->
                <div class="checkbox-container ${isMoveMode ? 'flex' : 'hidden'} items-center pr-3">
                    <!-- ===== INÍCIO DA MODIFICAÇÃO (SOLICITAÇÃO DO USUÁRIO) ===== -->
                    <input type="checkbox" class="move-item-checkbox rounded" data-id="${folder.id}" data-type="folder" ${isPreselected ? 'checked' : ''}>
                    <!-- ===== FIM DA MODIFICAÇÃO ===== -->
                </div>
                <!-- Ícone + Nome (clicável se não estiver no modo mover) -->
                <div class="flex items-center ${isMoveMode ? '' : 'cursor-pointer'} flex-grow" ${isMoveMode ? '' : 'data-action="open"'} style="min-width: 0;">
                    <span class="w-4 mr-2 ${isMoveMode ? 'hidden' : ''}"></span> <!-- Placeholder for alignment -->
                    <i class="fas fa-folder-open text-yellow-500 text-2xl mr-4"></i>
                    <div>
                        <span class="font-bold text-lg">${folder.name}</span>
                        <p class="text-sm text-gray-500 ${isMoveMode ? 'hidden' : ''}">${state.userCadernos.filter(c => c.folderId === folder.id).length} caderno(s)</p>
                    </div>
                </div>
                <!-- Menus (escondidos no modo mover) -->
                <div class="flex items-center space-x-1 ${isMoveMode ? 'hidden' : 'flex'}">
                     <button class="stats-folder-btn text-gray-400 hover:text-blue-600 p-2 rounded-full" data-id="${folder.id}" data-name="${folder.name}"><i class="fas fa-chart-bar pointer-events-none"></i></button>
                     <button class="edit-folder-btn text-gray-400 hover:text-blue-600 p-2 rounded-full" data-id="${folder.id}" data-name="${folder.name}"><i class="fas fa-pencil-alt pointer-events-none"></i></button>
                     <button class="delete-folder-btn text-gray-400 hover:text-red-600 p-2 rounded-full" data-id="${folder.id}" data-name="${folder.name}"><i class="fas fa-trash-alt pointer-events-none"></i></button>
                     <i class="fas fa-chevron-right text-gray-400 ml-2" data-action="open"></i>
                </div>
            </div>
        </div>`;
        
        // Bloco que renderizava os cadernos filhos foi REMOVIDO
        // ===== FIM DA MODIFICAÇÃO =====
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
            // MODIFICAÇÃO: Removida a classe 'hidden' condicional (state.isMoveModeActive)
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

    // ===== INÍCIO DA MODIFICAÇÃO (SOLICITAÇÃO DO USUÁRIO) =====
    // Mostra/Esconde o rodapé de "Mover"
    if (state.isMoveModeActive) {
        DOM.cadernosMoveFooter.classList.remove('hidden');
        populateMoveFooterDropdowns(); // Popula os dropdowns
    } else {
        DOM.cadernosMoveFooter.classList.add('hidden');
    }
    // ===== FIM DA MODIFICAÇÃO =====

    // ===== INÍCIO DA MODIFICAÇÃO (SOLICITAÇÃO DO USUÁRIO) =====
    // NOVO: Limpa o estado de pré-seleção após a renderização
    // para que ele não persista em re-renderizações futuras.
    if (state.itemToPreselectOnMove) {
        setState('itemToPreselectOnMove', null);
    }
    // ===== FIM DA MODIFICAÇÃO =====
}

// Handles clicks on folder items to open them, edit, delete, or view stats.
export function handleFolderItemClick(event) {
    // ===== INÍCIO DA MODIFICAÇÃO (SOLICITAÇÃO DO USUÁRIO) =====
    // Se estiver no modo de mover, ignora cliques de "abrir"
    if (state.isMoveModeActive && !event.target.closest('.move-item-checkbox')) {
        return; 
    }
    // ===== FIM DA MODIFICAÇÃO =====

    // ===== INÍCIO DA MODIFICAÇÃO: Permite cliques em .folder-item (subpastas) e .bg-white (pastas raiz) =====
    const folderItem = event.target.closest('.folder-item, .bg-white[data-folder-id]');
    // ===== FIM DA MODIFICAÇÃO =====
    if (!folderItem) return;

    // ===== INÍCIO DA MODIFICAÇÃO (SOLICITAÇÃO DO USUÁRIO) =====
    // Ignora clique no ícone de expandir (seja na raiz ou subpasta)
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
    // ===== INÍCIO DA MODIFICAÇÃO (SOLICITAÇÃO DO USUÁRIO) =====
    // Se estiver no modo de mover, ignora cliques de "abrir"
    if (state.isMoveModeActive && !event.target.closest('.move-item-checkbox')) {
        return;
    }
    // ===== FIM DA MODIFICAÇÃO =====

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
    // ===== INÍCIO DA MODIFICAÇÃO (SOLICITAÇÃO DO USUÁRIO) =====
    // Garante que o modo "Mover" seja desativado ao navegar para trás
    if (state.isMoveModeActive) {
        cancelMoveMode(); // Cancela o modo e re-renderiza
    } else {
        renderFoldersAndCadernos(); // Re-renderiza normalmente
    }
    // ===== FIM DA MODIFICAÇÃO =====
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
    
    // ===== INÍCIO DA CORREÇÃO =====
    // Havia um erro de digitação: .ind virou .filter
    const newQuestionIds = state.filteredQuestions
        .map(q => q.id)
        .filter(id => !existingIds.has(id));
    // ===== FIM DA CORREÇÃO =====

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


// ===== INÍCIO DA MODIFICAÇÃO (SOLICITAÇÃO DO USUÁRIO) =====
// NOVAS FUNÇÕES PARA O MODO "MOVER"

/**
 * Entra ou sai do modo de mover itens.
 */
export function toggleMoveMode() {
    // ===== INÍCIO DA MODIFICAÇÃO (SOLICITAÇÃO DO USUÁRIO) =====
    const newMoveState = !state.isMoveModeActive;
    setState('isMoveModeActive', newMoveState);
    
    // Se estiver DESATIVANDO o modo, limpa a pré-seleção
    if (newMoveState === false) { 
        setState('itemToPreselectOnMove', null);
    }
    
    renderFoldersAndCadernos();
    // ===== FIM DA MODIFICAÇÃO =====
}

/**
 * Cancela o modo "Mover" e re-renderiza a lista.
 */
export function cancelMoveMode() {
    setState('isMoveModeActive', false);
    // ===== INÍCIO DA MODIFICAÇÃO (SOLICITAÇÃO DO USUÁRIO) =====
    setState('itemToPreselectOnMove', null); // Limpa a pré-seleção
    // ===== FIM DA MODIFICAÇÃO =====
    renderFoldersAndCadernos(); // Re-renderiza para esconder checkboxes e o rodapé
}

/**
 * Popula os dropdowns de pasta e subpasta no rodapé "Mover".
 */
export function populateMoveFooterDropdowns() {
    // 1. Popula o select de Pastas Raiz
    if (DOM.moveFooterFolderSelect) {
        // ===== INÍCIO DA MODIFICAÇÃO (SOLICITAÇÃO DO USUÁRIO) =====
        // DOM.moveFooterFolderSelect.innerHTML = '<option value="">-- Raiz --</option>'; // Opção para mover para a raiz
        DOM.moveFooterFolderSelect.innerHTML = ''; // Remove a opção "-- Raiz --"
        // ===== FIM DA MODIFICAÇÃO =====
        
        // Filtra apenas pastas raiz (sem parentId) e ordena
        const rootFolders = state.userFolders
            .filter(f => !f.parentId)
            .sort((a, b) => naturalSort(a.name, b.name));

        rootFolders.forEach(folder => {
            const option = document.createElement('option');
            option.value = folder.id;
            option.textContent = folder.name;
            DOM.moveFooterFolderSelect.appendChild(option);
        });

        // ===== INÍCIO DA MODIFICAÇÃO (SOLICITAÇÃO DO USUÁRIO) =====
        // Pré-seleciona a pasta atual (ou a pasta pai, se estiver em uma subpasta)
        if (state.currentFolderId) {
            const currentFolder = state.userFolders.find(f => f.id === state.currentFolderId);
            
            if (currentFolder) {
                if (currentFolder.parentId) {
                    // Está em uma subpasta: seleciona a pasta-pai
                    DOM.moveFooterFolderSelect.value = currentFolder.parentId;
                    // Popula o dropdown de subpastas
                    handleMoveFooterFolderSelect(); 
                    // Seleciona a subpasta atual
                    DOM.moveFooterSubfolderSelect.value = state.currentFolderId;
                } else {
                    // Está em uma pasta-raiz: seleciona ela mesma
                    DOM.moveFooterFolderSelect.value = state.currentFolderId;
                    // Popula o dropdown de subpastas (que ficará com "--" selecionado)
                    handleMoveFooterFolderSelect();
                }
            }
        } else {
            // Se não estiver em nenhuma pasta (na raiz), reseta o select de subpastas
            if (DOM.moveFooterSubfolderSelect) {
                DOM.moveFooterSubfolderSelect.innerHTML = '<option value="">--</option>';
                DOM.moveFooterSubfolderSelect.disabled = true;
            }
        }
        // ===== FIM DA MODIFICAÇÃO =====

    } else {
        // Se o select de pasta não existe, garante que o de subpasta também seja resetado
        if (DOM.moveFooterSubfolderSelect) {
            DOM.moveFooterSubfolderSelect.innerHTML = '<option value="">--</option>';
            DOM.moveFooterSubfolderSelect.disabled = true;
        }
    }
}

/**
 * Popula o dropdown de subpastas com base na pasta raiz selecionada no rodapé.
 */
export function handleMoveFooterFolderSelect() {
    const selectedFolderId = DOM.moveFooterFolderSelect.value;
    
    if (DOM.moveFooterSubfolderSelect) {
        // ===== INÍCIO DA MODIFICAÇÃO (SOLICITAÇÃO DO USUÁRIO) =====
        // O valor padrão deve ser "" (vazio), que corresponde à opção "--"
        // Isso significa que o destino é a própria pasta-raiz selecionada, não uma subpasta.
        DOM.moveFooterSubfolderSelect.innerHTML = '<option value="">--</option>'; // "--" significa mover PARA a pasta raiz selecionada
        // ===== FIM DA MODIFICAÇÃO =====

        if (selectedFolderId) {
            // Se uma pasta raiz foi selecionada, busca as subpastas dela
            const subfolders = state.userFolders
                .filter(f => f.parentId === selectedFolderId)
                .sort((a, b) => naturalSort(a.name, b.name));
            
            subfolders.forEach(subfolder => {
                const option = document.createElement('option');
                option.value = subfolder.id;
                option.textContent = subfolder.name;
                DOM.moveFooterSubfolderSelect.appendChild(option);
            });
            
            DOM.moveFooterSubfolderSelect.disabled = false; // Habilita o select
        } else {
            // Se "Raiz" foi selecionada, o select de subpastas fica desabilitado
            DOM.moveFooterSubfolderSelect.disabled = true;
        }
    }
}

/**
 * Executa a lógica de mover os itens selecionados (cadernos/pastas) no Firestore.
 */
export async function confirmMoveSelectedItems() {
    if (!state.currentUser) return;

    const subfolderId = DOM.moveFooterSubfolderSelect.value;
    const folderId = DOM.moveFooterFolderSelect.value;

    // A pasta de destino é a subpasta (se selecionada) ou a pasta raiz (se selecionada).
    // ===== INÍCIO DA MODIFICAÇÃO (SOLICITAÇÃO DO USUÁRIO) =====
    // Se folderId for "" (o que não deve acontecer se a lista não estiver vazia)
    // ou subfolderId for selecionado, ele assume.
    // Se o usuário não selecionar nada e a lista tiver pastas, a 1ª pasta será o destino.
    // A opção de mover para a raiz (null) foi removida.
    const targetFolderId = subfolderId || folderId || null;
    // ===== FIM DA MODIFICAÇÃO =====

    // Coleta os itens selecionados
    const selectedItems = DOM.savedCadernosListContainer.querySelectorAll('.move-item-checkbox:checked');
    
    if (selectedItems.length === 0) {
        console.warn("Nenhum item selecionado para mover.");
        cancelMoveMode();
        return;
    }

    const batch = writeBatch(db);

    selectedItems.forEach(item => {
        const { id, type } = item.dataset;
        if (!id || !type) return;

        // Não permite mover uma pasta para dentro dela mesma (caso simples)
        if (type === 'folder' && id === targetFolderId) {
            console.warn(`Não é possível mover a pasta ${id} para dentro dela mesma.`);
            return;
        }
        // TODO: Adicionar verificação para não mover pasta-pai para pasta-filha (mais complexo)

        const collectionPath = type === 'folder' ? 'folders' : 'cadernos';
        const docRef = doc(db, 'users', state.currentUser.uid, collectionPath, id);
        
        // Pastas (folders) usam 'parentId', Cadernos (cadernos) usam 'folderId'
        const fieldToUpdate = type === 'folder' ? 'parentId' : 'folderId';
        
        batch.update(docRef, {
            [fieldToUpdate]: targetFolderId
        });
    });

    try {
        await batch.commit();
        console.log(`${selectedItems.length} itens movidos para a pasta ${targetFolderId}`);
    } catch (error) {
        console.error("Erro ao mover itens:", error);
        // TODO: Mostrar um modal de erro para o usuário
    }

    cancelMoveMode(); // Sai do modo de mover e re-renderiza
}
// ===== FIM DA MODIFICAÇÃO =====
