import { Timestamp, updateDoc, doc, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { db } from '../firebase-config.js';
import { state, setState } from '../state.js';
import DOM from '../dom-elements.js';
import { navigateToView } from '../ui/navigation.js';
import { displayQuestion } from './question-viewer.js';
import { showItemStatsModal } from '../ui/modal.js';
import { addQuestionIdsToCaderno as addQuestionIdsToFirestore } from '../services/firestore.js';
import { renderQuestionSolver } from "../ui/question-solver-ui.js";

function naturalSort(a, b) {
    const strA = String(a || '');
    const strB = String(b || '');
    return strA.localeCompare(strB, undefined, { numeric: true, sensitivity: 'base' });
}

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

    renderQuestionSolver(DOM.savedCadernosListContainer);

    setState('filteredQuestions', state.allQuestions.filter(q => caderno.questionIds.includes(q.id)));
    const savedState = state.userCadernoState.get(state.currentCadernoId);
    const newIndex = (savedState && savedState.lastQuestionIndex < state.filteredQuestions.length) ? savedState.lastQuestionIndex : 0;
    setState('currentQuestionIndex', newIndex);

    setState('sessionStats', []);
    await displayQuestion();
}

function getCadernoRowHtml(caderno, isSubItem = false) {
    const indentation = isSubItem ? 'pl-10' : '';
    const isMoveMode = state.isMoveModeActive;

    const isPreselected = state.itemToPreselectOnMove &&
                          state.itemToPreselectOnMove.type === 'caderno' &&
                          state.itemToPreselectOnMove.id === caderno.id;

    return `
    <div class="caderno-item flex justify-between items-center p-3 hover:bg-gray-50 ${indentation}" data-caderno-id="${caderno.id}">
        <div class="flex items-center flex-grow" style="min-width: 0;">
            <div class="checkbox-container ${isMoveMode ? 'flex' : 'hidden'} items-center pr-3">
                <input type="checkbox" class="move-item-checkbox rounded" data-id="${caderno.id}" data-type="caderno" ${isPreselected ? 'checked' : ''}>
            </div>
            <div class="flex items-center flex-grow cursor-pointer" data-action="open" style="min-width: 0;">
                <i class="far fa-file-alt text-blue-500 text-lg w-6 text-center mr-3 sm:mr-4"></i>
                <span class="font-medium text-gray-800 truncate" title="${caderno.name}">${caderno.name}</span>
            </div>
        </div>

        <div class="flex-shrink-0 mx-4 ${isMoveMode ? 'hidden' : 'flex'}">
            <span class="text-sm text-gray-500 whitespace-nowrap">${caderno.questionIds ? caderno.questionIds.length : 0} questões</span>
        </div>

        <div class="relative flex-shrink-0 ${isMoveMode ? 'hidden' : 'flex'}">
            <button class="caderno-menu-btn p-2 rounded-full text-gray-500 hover:bg-gray-200" data-caderno-id="${caderno.id}">
                <i class="fas fa-ellipsis-v pointer-events-none"></i>
            </button>
            <div id="menu-dropdown-${caderno.id}" class="caderno-menu-dropdown hidden absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-20 border">
                <a href="#" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 stats-caderno-btn" data-id="${caderno.id}" data-name="${caderno.name}"><i class="fas fa-chart-bar w-5 mr-2 text-gray-500"></i>Desempenho</a>
                <a href="#" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 edit-caderno-btn" data-id="${caderno.id}" data-name="${caderno.name}"><i class="fas fa-pencil-alt w-5 mr-2 text-gray-500"></i>Renomear</a>
                <a href="#" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 toggle-move-mode-btn-from-dropdown" data-caderno-id="${caderno.id}"><i class="fas fa-share w-5 mr-2 text-gray-500"></i>Mover</a>
                <a href="#" class="block px-4 py-2 text-sm text-red-600 hover:bg-gray-100 delete-caderno-btn" data-id="${caderno.id}" data-name="${caderno.name}"><i class="fas fa-trash-alt w-5 mr-2"></i>Excluir</a>
            </div>
        </div>
    </div>`;
}

function renderFolderContentView() {
    const folder = state.userFolders.find(f => f.id === state.currentFolderId);
    if (!folder) {
        setState('currentFolderId', null);
        renderFoldersAndCadernos();
        return;
    }
    const isMoveMode = state.isMoveModeActive;

    DOM.backToFoldersBtn.classList.remove('hidden');
    DOM.addCadernoToFolderBtn.classList.remove('hidden');
    DOM.createFolderBtn.classList.add('hidden');
    DOM.addQuestionsToCadernoBtn.classList.add('hidden');

    const subfolders = state.userFolders
        .filter(f => f.parentId === state.currentFolderId)
        .map(f => ({ ...f, type: 'folder' }));

    const cadernosInThisFolder = state.userCadernos
        .filter(c => c.folderId === state.currentFolderId)
        .map(c => ({ ...c, type: 'caderno' }));

    const combinedItems = [...subfolders, ...cadernosInThisFolder]
        .sort((a, b) => naturalSort(a.name, b.name));

    let html = '';

    if (combinedItems.length === 0) {
        DOM.savedCadernosListContainer.innerHTML = '<p class="text-center text-gray-500 bg-white p-6 rounded-lg shadow-sm">Nenhum caderno ou subpasta aqui. Clique em "Adicionar Caderno" ou use o menu para criar uma subpasta.</p>';
        return;
    }

    html += '<div class="bg-white rounded-lg shadow-sm">';

    combinedItems.forEach(item => {
        if (item.type === 'folder') {
            const subfolder = item;
            const isPreselected = state.itemToPreselectOnMove &&
                                  state.itemToPreselectOnMove.type === 'folder' &&
                                  state.itemToPreselectOnMove.id === subfolder.id;

            html += `
            <div class="folder-item-container" data-folder-id="${subfolder.id}">
                <div class="folder-item flex justify-between items-center p-3 hover:bg-gray-50" data-folder-id="${subfolder.id}">
                    <div class="flex items-center flex-grow" style="min-width: 0;">
                        <div class="checkbox-container ${isMoveMode ? 'flex' : 'hidden'} items-center pr-3">
                            <input type="checkbox" class="move-item-checkbox rounded" data-id="${subfolder.id}" data-type="folder" ${isPreselected ? 'checked' : ''}>
                        </div>

                        <div class="flex items-center flex-grow" style="min-width: 0;">
                            <i class="fas fa-folder text-gray-600 text-lg w-6 text-center mr-3 sm:mr-4"></i>
                            <span class="font-medium text-gray-800 truncate" title="${subfolder.name}">${subfolder.name}</span>
                            <span class="toggle-folder-contents text-blue-600 hover:underline text-sm ml-2 cursor-pointer whitespace-nowrap ${isMoveMode ? 'hidden' : ''}"
                                  data-folder-id="${subfolder.id}"
                                  data-text-expand="(Expandir)"
                                  data-text-collapse="(Recolher)">
                                (Expandir)
                            </span>
                        </div>
                    </div>

                    <div class="flex-shrink-0 mx-4 ${isMoveMode ? 'hidden' : 'flex'}">
                        <span class="text-sm text-gray-500 whitespace-nowrap">${state.userCadernos.filter(c => c.folderId === subfolder.id).length} caderno(s)</span>
                    </div>

                    <div class="relative flex-shrink-0 ${isMoveMode ? 'hidden' : 'flex'}">
                        <button class="folder-menu-btn p-2 rounded-full text-gray-500 hover:bg-gray-200" data-folder-id="${subfolder.id}">
                            <i class="fas fa-ellipsis-v pointer-events-none"></i>
                        </button>
                        <div id="menu-dropdown-folder-${subfolder.id}" class="caderno-menu-dropdown hidden absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-20 border">
                            <a href="#" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 stats-folder-btn" data-id="${subfolder.id}" data-name="${subfolder.name}"><i class="fas fa-chart-bar w-5 mr-2 text-gray-500"></i>Desempenho</a>
                            <a href="#" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 edit-folder-btn" data-id="${subfolder.id}" data-name="${subfolder.name}"><i class="fas fa-pencil-alt w-5 mr-2 text-gray-500"></i>Renomear</a>
                            <a href="#" class="block px-4 py-2 text-sm text-red-600 hover:bg-gray-100 delete-folder-btn" data-id="${subfolder.id}" data-name="${subfolder.name}"><i class="fas fa-trash-alt w-5 mr-2"></i>Excluir</a>
                        </div>
                    </div>
                </div>
            </div>`;

            const notebooksInside = state.userCadernos
                .filter(c => c.folderId === subfolder.id)
                .sort(naturalSort);

            notebooksInside.forEach(caderno => {
                html += `<div class="hidden notebook-child-of-${subfolder.id}">`;
                html += getCadernoRowHtml(caderno, true);
                html += `</div>`;
            });

        } else if (item.type === 'caderno') {
            const caderno = item;
            html += getCadernoRowHtml(caderno, false);
        }
    });

    html += '</div>';
    DOM.savedCadernosListContainer.innerHTML = html;
}

function renderRootCadernosView() {
    const isMoveMode = state.isMoveModeActive;

    DOM.cadernosViewTitle.textContent = 'Meus Cadernos';
    DOM.backToFoldersBtn.classList.add('hidden');
    DOM.addCadernoToFolderBtn.classList.add('hidden');
    DOM.addQuestionsToCadernoBtn.classList.add('hidden');

    DOM.createFolderBtn.classList.toggle('hidden', isMoveMode);

    const unfiledCadernos = state.userCadernos
        .filter(c => !c.folderId)
        .sort((a, b) => naturalSort(a.name, b.name));

    const sortedFolders = state.userFolders
        .filter(f => !f.parentId)
        .sort((a, b) => naturalSort(a.name, b.name));

    if (sortedFolders.length === 0 && unfiledCadernos.length === 0) {
        DOM.savedCadernosListContainer.innerHTML = '<p class="text-center text-gray-500 bg-white p-6 rounded-lg shadow-sm">Nenhum caderno ou pasta criada ainda.</p>';
        return;
    }

    let html = '';

    sortedFolders.forEach(folder => {
        const isPreselected = state.itemToPreselectOnMove &&
                              state.itemToPreselectOnMove.type === 'folder' &&
                              state.itemToPreselectOnMove.id === folder.id;

        html += `
        <div class="bg-white rounded-lg shadow-sm mb-2 folder-item-container" data-folder-id="${folder.id}">
            <div class="folder-item flex justify-between items-center p-4 hover:bg-gray-50 transition" data-folder-id="${folder.id}">
                <div class="checkbox-container ${isMoveMode ? 'flex' : 'hidden'} items-center pr-3">
                    <input type="checkbox" class="move-item-checkbox rounded" data-id="${folder.id}" data-type="folder" ${isPreselected ? 'checked' : ''}>
                </div>
                <div class="flex items-center ${isMoveMode ? '' : 'cursor-pointer'} flex-grow" ${isMoveMode ? '' : 'data-action="open"'} style="min-width: 0;">
                    <span class="w-4 mr-2 ${isMoveMode ? 'hidden' : ''}"></span>
                    <i class="fas fa-folder-open text-yellow-500 text-2xl mr-4"></i>
                    <div>
                        <span class="font-bold text-lg">${folder.name}</span>
                        <p class="text-sm text-gray-500 ${isMoveMode ? 'hidden' : ''}">${state.userCadernos.filter(c => c.folderId === folder.id).length} caderno(s)</p>
                    </div>
                </div>
                <div class="flex items-center space-x-1 ${isMoveMode ? 'hidden' : 'flex'}">
                     <button class="stats-folder-btn text-gray-400 hover:text-blue-600 p-2 rounded-full" data-id="${folder.id}" data-name="${folder.name}"><i class="fas fa-chart-bar pointer-events-none"></i></button>
                     <button class="edit-folder-btn text-gray-400 hover:text-blue-600 p-2 rounded-full" data-id="${folder.id}" data-name="${folder.name}"><i class="fas fa-pencil-alt pointer-events-none"></i></button>
                     <button class="delete-folder-btn text-gray-400 hover:text-red-600 p-2 rounded-full" data-id="${folder.id}" data-name="${folder.name}"><i class="fas fa-trash-alt pointer-events-none"></i></button>
                     <i class="fas fa-chevron-right text-gray-400 ml-2" data-action="open"></i>
                </div>
            </div>
        </div>`;
    });

    if (unfiledCadernos.length > 0) {
        if (sortedFolders.length > 0) {
            html += '<h3 class="mt-6 mb-2 text-md font-semibold text-gray-600">Cadernos sem Pasta</h3>';
        }

        html += '<div class="bg-white rounded-lg shadow-sm">';
        unfiledCadernos.forEach(caderno => {
            html += getCadernoRowHtml(caderno, false);
        });
        html += '</div>';
    }
    DOM.savedCadernosListContainer.innerHTML = html;
}

export async function renderFoldersAndCadernos() {
    const existingCard = document.getElementById('folder-info-card');
    if (existingCard) {
        existingCard.remove();
    }

    DOM.savedCadernosListContainer.innerHTML = '';

    if (state.currentCadernoId) {
        await renderCadernoContentView();
    } else if (state.currentFolderId) {
        const folder = state.userFolders.find(f => f.id === state.currentFolderId);
        if (folder) {
            const count = state.userCadernos.filter(c => c.folderId === folder.id).length;
            const cardHtml = `
            <div class="bg-white rounded-lg shadow-sm p-4 mb-4 border-b border-gray-200">
                <div class="flex justify-between items-center">
                    <div class="flex items-center">
                        <i class="fas fa-folder text-yellow-500 text-xl mr-3"></i>
                        <div>
                            <h3 class="text-lg font-semibold text-blue-600">${folder.name}</h3>
                            <div class="text-sm">
                                <button class="text-blue-600 hover:underline font-medium p-0 edit-folder-btn" data-id="${folder.id}" data-name="${folder.name}">Renomear</button>
                                <span class="text-gray-300 mx-1">•</span>
                                <button class="text-red-500 hover:underline font-medium p-0 delete-folder-btn" data-id="${folder.id}" data-name="${folder.name}">Excluir</button>
                            </div>
                        </div>
                    </div>
                    <div class="flex items-center space-x-3 relative">
                        <span class="text-sm text-gray-500">${count} cadernos</span>
                        <button id="folder-info-menu-btn" data-folder-id="${folder.id}" class="text-gray-400 hover:text-gray-600 p-1 rounded-full">
                            <i class="fas fa-ellipsis-h pointer-events-none"></i>
                        </button>
                        <div id="folder-info-menu-dropdown-${folder.id}" class="folder-info-menu-dropdown hidden absolute right-0 top-full mt-2 w-48 bg-white rounded-md shadow-lg z-20 border">
                            <a href="#" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 create-subfolder-btn" data-folder-id="${folder.id}">
                                <i class="fas fa-folder-plus w-5 mr-2 text-gray-500"></i>Criar Subpasta
                            </a>
                        </div>
                    </div>
                </div>
            </div>
            `;
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = cardHtml.trim();
            const cardElement = tempDiv.firstChild;
            cardElement.id = 'folder-info-card';

            DOM.savedCadernosListContainer.before(cardElement);
        }

        renderFolderContentView();
    } else {
        renderRootCadernosView();
    }

    if (state.isMoveModeActive) {
        DOM.cadernosMoveFooter.classList.remove('hidden');
        populateMoveFooterDropdowns();
    } else {
        DOM.cadernosMoveFooter.classList.add('hidden');
    }

    if (state.itemToPreselectOnMove) {
        setState('itemToPreselectOnMove', null);
    }
}

export function handleFolderItemClick(event) {
    if (state.isMoveModeActive && !event.target.closest('.move-item-checkbox')) {
        return;
    }

    const folderItem = event.target.closest('.folder-item, .bg-white[data-folder-id]');
    if (!folderItem) return;

    if (event.target.closest('.toggle-folder-contents')) {
        return;
    }

    const folderId = folderItem.dataset.folderId;
    const folder = state.userFolders.find(f => f.id === folderId);
    if (!folder) return;

    if (event.target.closest('[data-action="open"]')) {
        setState('currentFolderId', folderId);
        renderFoldersAndCadernos();
        return;
    }

    if (event.target.closest('.stats-folder-btn')) {
        showItemStatsModal(folderId, 'folder', folder.name);
        return;
    }
}

export function handleCadernoItemClick(event) {
    if (state.isMoveModeActive && !event.target.closest('.move-item-checkbox')) {
        return;
    }

    const cadernoItem = event.target.closest('.caderno-item');
    if (!cadernoItem) return;

    const dropdown = cadernoItem.querySelector('.caderno-menu-dropdown');
    if (dropdown && !dropdown.classList.contains('hidden') && !event.target.closest('[data-action="open"]')) {
         dropdown.classList.add('hidden');
    }

    const cadernoId = cadernoItem.dataset.cadernoId;
    const caderno = state.userCadernos.find(c => c.id === cadernoId);
    if(!caderno) return;

    if (event.target.closest('[data-action="open"]')) {
        setState('currentCadernoId', cadernoId);
        renderFoldersAndCadernos();
        return;
    }

    if (event.target.closest('.stats-caderno-btn')) {
        showItemStatsModal(cadernoId, 'caderno', caderno.name);
        return;
    }
}

export function handleBackToFolders() {
    if (state.currentCadernoId) {
        const caderno = state.userCadernos.find(c => c.id === state.currentCadernoId);
        setState('currentCadernoId', null);
        if(caderno && caderno.folderId) {
            setState('currentFolderId', caderno.folderId);
        } else {
            setState('currentFolderId', null);
        }
    } else if (state.currentFolderId) {
        const currentFolder = state.userFolders.find(f => f.id === state.currentFolderId);
        if (currentFolder && currentFolder.parentId) {
            setState('currentFolderId', currentFolder.parentId);
        } else {
            setState('currentFolderId', null);
        }
    }
    if (state.isMoveModeActive) {
        cancelMoveMode();
    } else {
        renderFoldersAndCadernos();
    }
}

export async function handleAddQuestionsToCaderno() {
    const caderno = state.userCadernos.find(c => c.id === state.currentCadernoId);
    if (!caderno) return;

    setState('isAddingQuestionsMode', { active: true, cadernoId: state.currentCadernoId });
    DOM.addQuestionsBanner.classList.remove('hidden');
    DOM.addQuestionsBannerText.textContent = `Selecione questões para adicionar ao caderno "${caderno.name}".`;
    await navigateToView('vade-mecum-view', false);
}

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

export async function cancelAddQuestions() {
    exitAddMode();
    await navigateToView('cadernos-view');
}

export async function addFilteredQuestionsToCaderno() {
    if (!state.isAddingQuestionsMode.active || !state.currentUser) return;

    const { cadernoId } = state.isAddingQuestionsMode;
    const caderno = state.userCadernos.find(c => c.id === cadernoId);
    if (!caderno) return;

    const existingIds = new Set(caderno.questionIds || []);

    const newQuestionIds = state.filteredQuestions
        .map(q => q.id)
        .filter(id => !existingIds.has(id));

    if (newQuestionIds.length > 0) {
        await addQuestionIdsToFirestore(cadernoId, newQuestionIds);
    }

    exitAddMode();
    setState('isNavigatingBackFromAddMode', true);
    setState('currentCadernoId', cadernoId);
    await navigateToView('cadernos-view');
}

export function toggleMoveMode() {
    const newMoveState = !state.isMoveModeActive;
    setState('isMoveModeActive', newMoveState);

    if (newMoveState === false) {
        setState('itemToPreselectOnMove', null);
    }

    renderFoldersAndCadernos();
}

export function cancelMoveMode() {
    setState('isMoveModeActive', false);
    setState('itemToPreselectOnMove', null);
    renderFoldersAndCadernos();
}

export function populateMoveFooterDropdowns() {
    if (DOM.moveFooterFolderSelect) {
        DOM.moveFooterFolderSelect.innerHTML = '';

        const rootFolders = state.userFolders
            .filter(f => !f.parentId)
            .sort((a, b) => naturalSort(a.name, b.name));

        rootFolders.forEach(folder => {
            const option = document.createElement('option');
            option.value = folder.id;
            option.textContent = folder.name;
            DOM.moveFooterFolderSelect.appendChild(option);
        });

        if (state.currentFolderId) {
            const currentFolder = state.userFolders.find(f => f.id === state.currentFolderId);

            if (currentFolder) {
                if (currentFolder.parentId) {
                    DOM.moveFooterFolderSelect.value = currentFolder.parentId;
                    handleMoveFooterFolderSelect();
                    DOM.moveFooterSubfolderSelect.value = state.currentFolderId;
                } else {
                    DOM.moveFooterFolderSelect.value = state.currentFolderId;
                    handleMoveFooterFolderSelect();
                }
            }
        } else {
            if (DOM.moveFooterSubfolderSelect) {
                DOM.moveFooterSubfolderSelect.innerHTML = '<option value="">--</option>';
                DOM.moveFooterSubfolderSelect.disabled = true;
            }
        }

    } else {
        if (DOM.moveFooterSubfolderSelect) {
            DOM.moveFooterSubfolderSelect.innerHTML = '<option value="">--</option>';
            DOM.moveFooterSubfolderSelect.disabled = true;
        }
    }
}

export function handleMoveFooterFolderSelect() {
    const selectedFolderId = DOM.moveFooterFolderSelect.value;

    if (DOM.moveFooterSubfolderSelect) {
        DOM.moveFooterSubfolderSelect.innerHTML = '<option value="">--</option>';

        if (selectedFolderId) {
            const subfolders = state.userFolders
                .filter(f => f.parentId === selectedFolderId)
                .sort((a, b) => naturalSort(a.name, b.name));

            subfolders.forEach(subfolder => {
                const option = document.createElement('option');
                option.value = subfolder.id;
                option.textContent = subfolder.name;
                DOM.moveFooterSubfolderSelect.appendChild(option);
            });

            DOM.moveFooterSubfolderSelect.disabled = false;
        } else {
            DOM.moveFooterSubfolderSelect.disabled = true;
        }
    }
}

export async function confirmMoveSelectedItems() {
    if (!state.currentUser) return;

    const subfolderId = DOM.moveFooterSubfolderSelect.value;
    const folderId = DOM.moveFooterFolderSelect.value;

    const targetFolderId = subfolderId || folderId || null;

    const selectedItems = DOM.savedCadernosListContainer.querySelectorAll('.move-item-checkbox:checked');

    if (selectedItems.length === 0) {
        cancelMoveMode();
        return;
    }

    const batch = writeBatch(db);

    selectedItems.forEach(item => {
        const { id, type } = item.dataset;
        if (!id || !type) return;

        if (type === 'folder' && id === targetFolderId) {
            return;
        }

        const collectionPath = type === 'folder' ? 'folders' : 'cadernos';
        const docRef = doc(db, 'users', state.currentUser.uid, collectionPath, id);

        const fieldToUpdate = type === 'folder' ? 'parentId' : 'folderId';

        batch.update(docRef, {
            [fieldToUpdate]: targetFolderId
        });
    });

    try {
        await batch.commit();
    } catch (error) {
        console.error("Erro ao mover itens:", error);
    }

    cancelMoveMode();
}
