import DOM from '../dom-elements.js';
import { state, setState } from '../state.js';
// --- MODIFICAÇÃO: Importar resetAllUserData ---
import { deleteItem, deleteFilter, getHistoricalCountsForQuestions, resetAllUserData } from '../services/firestore.js';
import { renderItemPerformanceChart } from './charts.js';

export function openAuthModal() {
    if(DOM.authModal) DOM.authModal.classList.remove('hidden');
}

export function closeAuthModal() {
    if(DOM.authModal) DOM.authModal.classList.add('hidden');
}

export function openSaveModal() {
    if (!state.currentUser) { 
        showInfoModal("Acesso Negado", "Por favor, faça login para salvar filtros."); 
        return; 
    }
    if (DOM.saveModal) DOM.saveModal.classList.remove('hidden');
}

export function closeSaveModal() {
    if (DOM.saveModal) DOM.saveModal.classList.add('hidden');
}

export function openLoadModal() {
    if (!state.currentUser) { 
        showInfoModal("Acesso Negado", "Por favor, faça login para ver seus filtros."); 
        return; 
    }
    if (DOM.searchSavedFiltersInput) DOM.searchSavedFiltersInput.value = ''; 
    updateSavedFiltersList();
    if (DOM.loadModal) DOM.loadModal.classList.remove('hidden');
}

export function closeLoadModal() {
    if (DOM.loadModal) DOM.loadModal.classList.add('hidden');
}

export function openCadernoModal(isCreatingWithFilter, folderId = null) {
    if (!state.currentUser) { 
        showInfoModal("Acesso Negado", "Por favor, faça login para criar cadernos."); 
        return; 
    }
    setState('createCadernoWithFilteredQuestions', isCreatingWithFilter);
    if (DOM.cadernoNameInput) DOM.cadernoNameInput.value = '';
    if (DOM.folderSelect) {
        // Limpa opções anteriores, mas mantém o placeholder
        DOM.folderSelect.innerHTML = '<option value="">Salvar em (opcional)</option>';
        
        // Popula com as pastas do usuário
        state.userFolders.forEach(folder => {
            const option = document.createElement('option');
            option.value = folder.id;
            option.textContent = folder.name;
            DOM.folderSelect.appendChild(option);
        });

        DOM.folderSelect.value = folderId || '';
        DOM.folderSelect.disabled = !!folderId;
    }
    if (DOM.cadernoModal) DOM.cadernoModal.classList.remove('hidden');
}

export function closeCadernoModal() {
    if (DOM.cadernoModal) DOM.cadernoModal.classList.add('hidden');
    if (DOM.folderSelect) DOM.folderSelect.disabled = false;
    setState('createCadernoWithFilteredQuestions', false);
}

export function openNameModal(type, id = null, name = '') {
    setState('editingType', type);
    setState('editingId', id);
    if(DOM.nameInput) DOM.nameInput.value = name;
    if(DOM.nameModalTitle) DOM.nameModalTitle.textContent = id ? `Editar ${type === 'folder' ? 'Pasta' : 'Caderno'}` : `Criar Nova ${type === 'folder' ? 'Pasta' : 'Caderno'}`;
    if(DOM.nameModal) DOM.nameModal.classList.remove('hidden');
}

export function closeNameModal() {
    if (DOM.nameModal) DOM.nameModal.classList.add('hidden');
    setState('editingId', null);
    setState('editingType', null);
}

export function closeConfirmationModal() {
    if (DOM.confirmationModal) DOM.confirmationModal.classList.add('hidden');
    setState('deletingId', null);
    setState('deletingType', null);
}

export function closeStatsModal() {
    if(DOM.statsModal) DOM.statsModal.classList.add('hidden');
}


export async function handleConfirmation() {
    if (!state.currentUser || !state.deletingType) return;

    if (state.deletingType === 'all-progress') {
        // ===== INÍCIO DA MODIFICAÇÃO (SOLICITAÇÃO DO USUÁRIO) =====
        // A função resetAllUserData foi modificada em firestore.js
        // para apagar apenas os dados de progresso.
        await resetAllUserData();
        // ===== FIM DA MODIFICAÇÃO =====
    } else {
        await deleteItem(state.deletingType, state.deletingId);
    }
    
    closeConfirmationModal();
}

export function updateSavedFiltersList() {
    if (!DOM.savedFiltersListContainer) return;
    
    const searchTerm = DOM.searchSavedFiltersInput ? DOM.searchSavedFiltersInput.value.toLowerCase() : '';
    const filtered = state.savedFilters.filter(f => f.name.toLowerCase().includes(searchTerm));

    if (filtered.length === 0) {
        DOM.savedFiltersListContainer.innerHTML = `<p class="text-center text-gray-500">Nenhum filtro encontrado.</p>`;
    } else {
        DOM.savedFiltersListContainer.innerHTML = filtered.map(f => `
            <div class="flex justify-between items-center p-2 rounded-lg hover:bg-gray-100">
                <button class="load-filter-btn text-left" data-id="${f.id}">${f.name}</button>
                <button class="delete-filter-btn text-red-500 hover:text-red-700" data-id="${f.id}">
                    <i class="fas fa-trash-alt pointer-events-none"></i>
                </button>
            </div>
        `).join('');
    }
}

export async function handleLoadModalEvents(event) {
    const target = event.target;
    if (!state.currentUser) return;

    if (target.closest('.load-filter-btn')) {
        const filterId = target.closest('.load-filter-btn').dataset.id;
        // Logic to load filter
        closeLoadModal();

    } else if (target.closest('.delete-filter-btn')) {
        const filterId = target.closest('.delete-filter-btn').dataset.id;
        await deleteFilter(filterId);
    }
}

export async function showItemStatsModal(itemId, itemType, itemName) {
    if (!state.currentUser) return;
    
    if (DOM.statsModalTitle) DOM.statsModalTitle.textContent = `Estatísticas de "${itemName}"`;
    if (DOM.statsModalContent) DOM.statsModalContent.innerHTML = `<div class="text-center p-8"><i class="fas fa-spinner fa-spin text-2xl text-gray-500"></i><p class="mt-2">Carregando dados...</p></div>`;
    if (DOM.statsModal) DOM.statsModal.classList.remove('hidden');

    let questionIds = [];
    if (itemType === 'caderno') {
        const caderno = state.userCadernos.find(c => c.id === itemId);
        if (caderno) questionIds = caderno.questionIds || [];
    } else if (itemType === 'folder') {
        state.userCadernos.forEach(c => {
            if (c.folderId === itemId && c.questionIds) {
                questionIds.push(...c.questionIds);
            }
        });
        questionIds = [...new Set(questionIds)];
    }

    if (questionIds.length === 0) {
        if(DOM.statsModalContent) DOM.statsModalContent.innerHTML = `<div class="text-center p-8"><p>Nenhuma questão encontrada para gerar estatísticas.</p></div>`;
        return;
    }
    
    const { correct, incorrect, resolved } = await getHistoricalCountsForQuestions(questionIds);
    const totalAttempts = correct + incorrect;
    const accuracy = totalAttempts > 0 ? (correct / totalAttempts * 100) : 0;

    if(DOM.statsModalContent) DOM.statsModalContent.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
            <div class="bg-gray-100 p-4 rounded-lg">
                <h4 class="text-sm font-medium text-gray-500">Questões Respondidas</h4>
                <p class="mt-1 text-2xl font-semibold text-gray-900">${resolved} / ${questionIds.length}</p>
            </div>
            <div class="bg-gray-100 p-4 rounded-lg">
                <h4 class="text-sm font-medium text-gray-500">Aproveitamento</h4>
                <p class="mt-1 text-2xl font-semibold ${accuracy >= 60 ? 'text-green-600' : 'text-red-600'}">${accuracy.toFixed(0)}%</p>
            </div>
             <div class="bg-gray-100 p-4 rounded-lg">
                <h4 class="text-sm font-medium text-gray-500">Total de Respostas</h4>
                <p class="mt-1 text-2xl font-semibold text-gray-900">${totalAttempts}</p>
            </div>
        </div>
        <div class="relative mx-auto mt-6" style="max-width: 300px;">
            <canvas id="itemPerformanceChart"></canvas>
        </div>
    `;

    renderItemPerformanceChart(correct, incorrect);
}

function showInfoModal(title, message) {
    // Logic to show an info-only confirmation modal
}
