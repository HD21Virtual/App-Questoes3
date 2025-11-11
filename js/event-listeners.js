import DOM from './dom-elements.js';
// --- CORREÇÃO: Importar setState e clearSessionStats ---
import { state, setState, clearSessionStats } from './state.js';
// ===== INÍCIO DA MODIFICAÇÃO (SOLICITAÇÃO DO USUÁRIO) =====
// Importações de "Mover" (modal) removidas
import { 
    closeSaveModal, closeCadernoModal, closeNameModal, handleConfirmation, 
    openSaveModal, openCadernoModal, openNameModal, openLoadModal, closeLoadModal, 
    handleLoadModalEvents, updateSavedFiltersList, closeConfirmationModal, 
    closeStatsModal, openAuthModal, closeAuthModal, openSubfolderModal, 
    closeSubfolderModal
} from './ui/modal.js';
// ===== FIM DA MODIFICAÇÃO =====
// CORREÇÃO: Salvar o progresso ao sair da página
// --- MODIFICAÇÃO: Importar resetAllUserData e updateStatsAssuntoFilter ---
// ===== INÍCIO DA MODIFICAÇÃO: Caminho corrigido de '../services/firestore.js' para './services/firestore.js' =====
import { createCaderno, createOrUpdateName, saveFilter, saveSessionStats } from './services/firestore.js';
// ===== FIM DA MODIFICAÇÃO =====
// CORREÇÃO APLICADA ---
// O caminho foi alterado de "../features/stats.js" para "./features/stats.js"
// ===== INÍCIO DA MODIFICAÇÃO =====
// MODIFICAÇÃO: updateStatsAssuntoFilter removido, pois a lógica agora está em stats.js
import { updateStatsPageUI, renderEstatisticasView, handleStatsFilter } from "./features/stats.js";
// ===== FIM DA MODIFICAÇÃO =====
// CORREÇÃO: Importar handleGoogleAuth para corrigir o login com Google
import { handleAuth, handleGoogleAuth } from './services/auth.js';
// ===== INÍCIO DA MODIFICAÇÃO (SOLICITAÇÃO DO USUÁRIO) =====
// Importar novas funções do modo "Mover"
import { 
    handleAddQuestionsToCaderno, handleCadernoItemClick, handleFolderItemClick, 
    handleBackToFolders, cancelAddQuestions, removeQuestionFromCaderno, 
    addFilteredQuestionsToCaderno, toggleMoveMode, cancelMoveMode, 
    handleMoveFooterFolderSelect, confirmMoveSelectedItems 
} from './features/caderno.js';
// ===== FIM DA MODIFICAÇÃO =====
import { handleAssuntoListClick, handleMateriaListClick, handleBackToMaterias } from './features/materias.js';
// ===== INÍCIO DA MODIFICAÇÃO (SOLICITAÇÃO DO USUÁRIO) =====
import { handleStartReview, handleSrsFeedback, renderReviewView } from './features/srs.js'; // Importar renderReviewView
// ===== FIM DA MODIFICAÇÃO =====
import { navigateQuestion, handleOptionSelect, checkAnswer, handleDiscardOption } from './features/question-viewer.js';
// ===== INÍCIO DA MODIFICAÇÃO: Importar setupCustomSelect =====
import { applyFilters, clearAllFilters, removeFilter, setupCustomSelect } from './features/filter.js';
// ===== FIM DA MODIFICAÇÃO =====
import { navigateToView } from './ui/navigation.js';
import { updateSelectedFiltersDisplay } from './ui/ui-helpers.js';
// ===== INÍCIO DA MODIFICAÇÃO: Importar funções de redimensionamento de gráficos =====
import { resizeHomeCharts, resizeStatsCharts } from './ui/charts.js';
// ===== FIM DA MODIFICAÇÃO =====

// Handlers
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

    // A função createOrUpdateName foi modificada em firestore.js para aceitar parentId
    // Mas aqui (edição/criação de pasta raiz), o parentId é null, o que está correto.
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

// --- NOVA FUNÇÃO ---
// Lida com a seleção de checkboxes na tabela de estatísticas
function handleStatsTableSelection(event) {
    const target = event.target;
    if (!target.matches('input[type="checkbox"]')) return;

    const tableContainer = DOM.statsDesempenhoMateriaContainer;
    if (!tableContainer) return;

    const allCheckboxes = tableContainer.querySelectorAll('.row-checkbox');
    const selectAllCheckbox = tableContainer.querySelector('#select-all-stats-checkbox');

    // Lógica de Selecionar/Desselecionar Todos
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

        // Lógica de hierarquia (selecionar/desselecionar filhos)
        const childRows = tableContainer.querySelectorAll(`tr[data-parent-id="${rowId}"]`);
        childRows.forEach(child => {
            const childCheckbox = child.querySelector('.row-checkbox');
            childCheckbox.checked = isChecked;
            child.classList.toggle('selected-row', isChecked);
            childCheckbox.indeterminate = false; // Garante que filhos não fiquem indeterminados

            // Lógica para netos (nível 3)
            const grandChildRows = tableContainer.querySelectorAll(`tr[data-parent-id="${child.dataset.id}"]`);
            grandChildRows.forEach(gc => {
                const gcCheckbox = gc.querySelector('.row-checkbox');
                gcCheckbox.checked = isChecked;
                gc.classList.toggle('selected-row', isChecked);
                
                // ===== INÍCIO DA MODIFICAÇÃO: Lógica para bisnetos (nível 4) =====
                const greatGrandChildRows = tableContainer.querySelectorAll(`tr[data-parent-id="${gc.dataset.id}"]`);
                greatGrandChildRows.forEach(ggc => {
                    const ggcCheckbox = ggc.querySelector('.row-checkbox');
                    ggcCheckbox.checked = isChecked;
                    ggc.classList.toggle('selected-row', isChecked);
                });
                // ===== FIM DA MODIFICAÇÃO =====
            });
        });

        // Lógica de estado dos pais (indeterminate)
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
            // Adiciona/remove a classe de seleção no pai com base no estado
            parentRow.classList.toggle('selected-row', parentCheckbox.checked || parentCheckbox.indeterminate);
            
            parentId = parentRow.dataset.parentId; // Sobe na hierarquia
        }

        // Atualiza o "Selecionar Todos"
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

    // Calcular Totais
    let totalResolvidas = 0;
    let totalAcertos = 0;
    let totalErros = 0;

    const selectedRows = tableContainer.querySelectorAll('tr.selected-row');
    selectedRows.forEach(row => {
        // Só soma se a linha não for pai de outras linhas selecionadas
        // (para evitar contagem dupla)
        const rowId = row.dataset.id;
        const isParentOfSelected = tableContainer.querySelector(`tr.selected-row[data-parent-id="${rowId}"]`);
        
        if (!isParentOfSelected) {
            totalResolvidas += parseInt(row.dataset.total || 0, 10);
            totalAcertos += parseInt(row.dataset.correct || 0, 10);
            totalErros += parseInt(row.dataset.incorrect || 0, 10);
        }
    });

    // Atualizar rodapé
    if (DOM.statsFooterResolvidas) DOM.statsFooterResolvidas.textContent = totalResolvidas;
    if (DOM.statsFooterAcertos) DOM.statsFooterAcertos.textContent = totalAcertos;
    if (DOM.statsFooterErros) DOM.statsFooterErros.textContent = totalErros;
}

// --- MODIFICAÇÃO: Nova função para seleção da tabela de revisão ---
/**
 * Lida com a seleção de checkboxes (hierárquica) na tabela de revisão.
 * @param {HTMLInputElement} checkbox - O checkbox que foi clicado.
 */
function handleReviewTableSelection(checkbox) {
    const row = checkbox.closest('tr');
    const rowId = row.dataset.id;
    const isChecked = checkbox.checked;

    // 1. Atualiza todos os filhos (recursivamente)
    const updateChildren = (parentId, checked) => {
        const children = document.querySelectorAll(`tr[data-parent-id="${parentId}"]`);
        children.forEach(child => {
            const cb = child.querySelector('.review-checkbox:not(:disabled)');
            if (cb) {
                cb.checked = checked;
                cb.indeterminate = false;
            }
            updateChildren(child.dataset.id, checked); // Chama recursivamente
        });
    };
    updateChildren(rowId, isChecked);


    // 2. Atualiza todos os pais (iterativamente)
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

    // 3. Atualiza o "Selecionar Todos" (#select-all-review-materias)
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

    // 4. Atualiza o botão de iniciar revisão
    const anyChecked = DOM.reviewTableContainer.querySelector('.review-checkbox:checked');
    DOM.startSelectedReviewBtn.disabled = !anyChecked;
}
// --- FIM DA MODIFICAÇÃO ---


export function setupAllEventListeners() {
    // Listener para o botão hamburger do menu mobile (REMOVIDO)
    // if (DOM.hamburgerBtn) { ... }

    // NOVO: Listener para o botão de toggle da sidebar
    if (DOM.sidebarToggleBtn) {
        DOM.sidebarToggleBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            
            if (window.innerWidth < 768) {
                // Lógica mobile: usa overlay
                document.body.classList.toggle('sidebar-open-mobile');
            } else {
                // Lógica desktop: empurra o conteúdo
                document.body.classList.toggle('sidebar-collapsed');
            }
        });
    }

    // ===== INÍCIO DA MODIFICAÇÃO: Listener para o fim da transição da sidebar =====
    if (DOM.mainContentWrapper) {
        DOM.mainContentWrapper.addEventListener('transitionend', () => {
            // Verifica se a aba "Início" está visível
            if (DOM.inicioView && !DOM.inicioView.classList.contains('hidden')) {
                resizeHomeCharts();
            }
            
            // Verifica se a aba "Estatísticas" está visível
            if (DOM.estatisticasView && !DOM.estatisticasView.classList.contains('hidden')) {
               resizeStatsCharts();
            }
        });
    }
    // ===== FIM DA MODIFICAÇÃO =====


    document.addEventListener('click', async (event) => {
        const target = event.target;
        const targetId = target.id;
        
        // --- Lógica de fechar menus (clique fora) ---
        
        // NOVO: Fecha a sidebar mobile se clicar fora dela (no overlay)
        if (document.body.classList.contains('sidebar-open-mobile') && !target.closest('#sidebar-nav') && !target.closest('#sidebar-toggle-btn')) {
            document.body.classList.remove('sidebar-open-mobile');
        }

        // Esconde os menus de caderno se o clique for fora
        // ===== INÍCIO DA MODIFICAÇÃO: Também esconde .folder-menu-btn =====
        if (!target.closest('.caderno-menu-dropdown') && !target.closest('.caderno-menu-btn') && !target.closest('.folder-menu-btn')) {
            document.querySelectorAll('.caderno-menu-dropdown').forEach(d => {
        // ===== FIM DA MODIFICAÇÃO =====
                d.classList.add('hidden');
            });
        }
        
        // ===== INÍCIO DA MODIFICAÇÃO (SOLICITAÇÃO DO USUÁRIO) =====
        // Esconde o novo menu de info da pasta se o clique for fora
        if (!target.closest('.folder-info-menu-dropdown') && !target.closest('#folder-info-menu-btn')) {
            document.querySelectorAll('.folder-info-menu-dropdown').forEach(d => {
                d.classList.add('hidden');
            });
        }
        // ===== FIM DA MODIFICAÇÃO =====

        // Esconde o menu mobile (LÓGICA ANTIGA REMOVIDA)
        // if (!target.closest('#mobile-menu') && !target.closest('#hamburger-btn')) { ... }
        
        // Fecha os seletores customizados se o clique for fora deles
        if (!target.closest('.custom-select-container')) {
            document.querySelectorAll('.custom-select-panel').forEach(panel => {
                panel.classList.add('hidden');
            });
        }
        
        // --- NOVO: Fecha o seletor de período ---
        if (DOM.statsPeriodoPanel && !target.closest('#stats-periodo-button') && !target.closest('#stats-periodo-panel')) {
            DOM.statsPeriodoPanel.classList.add('hidden');
            if (DOM.statsPeriodoCustomRange) DOM.statsPeriodoCustomRange.classList.add('hidden');
        }

        // ===== INÍCIO DA MODIFICAÇÃO: Clique fora do rodapé de mover =====
        // Não fecha o modal de mover, pois ele não é um modal
        // O cancelamento é feito pelo botão "Cancelar"
        // ===== FIM DA MODIFICAÇÃO =====
        
        
        // --- Cadeia Principal de Ações (IF-ELSE IF) ---
        
        // --- Lidar com o menu dropdown do caderno (MAIS ESPEFÍFICO) ---
        if (target.closest('.caderno-menu-btn')) {
            // event.stopPropagation(); // Removido
            const button = target.closest('.caderno-menu-btn');
            const cadernoId = button.dataset.cadernoId;
            const dropdown = document.getElementById(`menu-dropdown-${cadernoId}`);
            
            if (dropdown) {
                // Esconde todos os outros dropdowns abertos
                document.querySelectorAll('.caderno-menu-dropdown, .folder-info-menu-dropdown').forEach(d => {
                    if (d.id !== dropdown.id) {
                        d.classList.add('hidden');
                    }
                });
                // Alterna o dropdown atual
                dropdown.classList.toggle('hidden');
            }
        }
        
        // ===== INÍCIO DA MODIFICAÇÃO: Adiciona handler para o menu da subpasta =====
        else if (target.closest('.folder-menu-btn')) {
            const button = target.closest('.folder-menu-btn');
            const folderId = button.dataset.folderId;
            const dropdown = document.getElementById(`menu-dropdown-folder-${folderId}`);
            
            if (dropdown) {
                // Esconde todos os outros dropdowns abertos
                document.querySelectorAll('.caderno-menu-dropdown, .folder-info-menu-dropdown').forEach(d => {
                    if (d.id !== dropdown.id) {
                        d.classList.add('hidden');
                    }
                });
                // Alterna o dropdown atual
                dropdown.classList.toggle('hidden');
            }
        }
        // ===== FIM DA MODIFICAÇÃO =====

        // --- Auth ---
        // MODIFICADO: Remove -mobile, aponta para os botões nos novos locais
        else if (target.closest('#show-login-modal-btn') || target.closest('#login-from-empty') || target.closest('#show-login-modal-btn-sidebar')) {
            openAuthModal();
        } else if (targetId === 'login-btn') {
            await handleAuth('login');
        } else if (targetId === 'register-btn') {
            await handleAuth('register');
        } else if (targetId === 'google-login-btn') {
            await handleGoogleAuth();
        } else if (target.closest('#logout-btn') || target.closest('#logout-btn-sidebar')) { // MODIFICADO
            await handleAuth('logout');
        }

        // --- Modals ---
        else if (target.closest('#close-auth-modal')) closeAuthModal();
        else if (target.closest('#save-filter-btn')) openSaveModal();
        else if (target.closest('#close-save-modal') || target.closest('#cancel-save-btn')) closeSaveModal();
        else if (target.closest('#confirm-save-btn')) await handleSaveFilter();
        
        else if (target.closest('#saved-filters-list-btn')) openLoadModal();
        else if (target.closest('#close-load-modal')) closeLoadModal();
        else if (target.closest('#saved-filters-list-container')) handleLoadModalEvents(event);

        else if (target.closest('#create-caderno-btn')) openCadernoModal(true);
        else if (target.closest('#add-caderno-to-folder-btn')) openCadernoModal(false, state.currentFolderId);
        else if (target.closest('#close-caderno-modal') || target.closest('#cancel-caderno-btn')) closeCadernoModal();
        else if (target.closest('#confirm-caderno-btn')) await handleCadernoConfirm();
        
        else if (target.closest('#create-folder-btn')) openNameModal('folder');
        else if (target.closest('#close-name-modal') || target.closest('#cancel-name-btn')) closeNameModal();
        else if (target.closest('#confirm-name-btn')) await handleNameConfirm();
        
        else if (target.closest('#cancel-confirmation-btn')) closeConfirmationModal();
        else if (target.closest('#confirm-delete-btn')) await handleConfirmation();
        
        else if (target.closest('#close-stats-modal')) closeStatsModal();

        // ===== INÍCIO DA MODIFICAÇÃO: Listeners do Modo "Mover" =====
        // else if (target.closest('#toggle-move-mode-btn')) { // REMOVIDO
        //     toggleMoveMode();
        // }
        // NOVO: Listener para o botão "Mover" no dropdown do caderno
        else if (target.closest('.toggle-move-mode-btn-from-dropdown')) {
            // ===== INÍCIO DA MODIFICAÇÃO (SOLICITAÇÃO DO USUÁRIO) =====
            const button = target.closest('.toggle-move-mode-btn-from-dropdown');
            const cadernoId = button.dataset.cadernoId;
            
            // Define o item a ser pré-selecionado
            setState('itemToPreselectOnMove', { id: cadernoId, type: 'caderno' });
            
            // Ativa o modo de mover (que lerá o estado acima)
            toggleMoveMode(); 
            // ===== FIM DA MODIFICAÇÃO =====
            
            // Esconde o dropdown
            const dropdown = target.closest('.caderno-menu-dropdown');
            if (dropdown) dropdown.classList.add('hidden');
        }
        else if (target.closest('#cancel-move-selected-btn')) {
            cancelMoveMode();
        }
        else if (target.closest('#confirm-move-selected-btn')) {
            await confirmMoveSelectedItems();
        }
        // O listener para 'move-caderno-btn' (o antigo) foi REMOVIDO.
        // ===== FIM DA MODIFICAÇÃO =====


        // --- Questions ---
        else if (target.closest('#prev-question-btn')) await navigateQuestion('prev');
        else if (target.closest('#next-question-btn')) await navigateQuestion('next');
        else if (target.closest('.option-item') && !target.closest('.discard-btn')) handleOptionSelect(event);
        else if (target.closest('#submit-btn')) await checkAnswer();
        else if (target.closest('.discard-btn')) handleDiscardOption(event);
        else if (target.closest('.srs-feedback-btn')) await handleSrsFeedback(target.closest('.srs-feedback-btn').dataset.feedback);
        else if (target.closest('.remove-question-btn')) removeQuestionFromCaderno(target.closest('.remove-question-btn').dataset.questionId);

        // --- Cadernos / Folders ---
        // ===== INÍCIO DA MODIFICAÇÃO: Lógica de delegação movida para cima =====
        else if (target.closest('.edit-folder-btn')) {
            const btn = target.closest('.edit-folder-btn');
            openNameModal('folder', btn.dataset.id, btn.dataset.name);
        }
        else if (target.closest('.delete-folder-btn')) {
            const btn = target.closest('.delete-folder-btn');
            const folderId = btn.dataset.id;
            const folderName = btn.dataset.name || state.userFolders.find(f => f.id === folderId)?.name || 'esta pasta';
            
            setState('deletingId', folderId);
            setState('deletingType', 'folder');
            if(DOM.confirmationModalTitle) DOM.confirmationModalTitle.textContent = `Excluir Pasta`;
            // ===== INÍCIO DA MODIFICAÇÃO: Mensagem de confirmação atualizada =====
            if(DOM.confirmationModalText) DOM.confirmationModalText.innerHTML = `Deseja excluir a pasta <strong>"${folderName}"</strong>? <br><br> <span class="font-bold text-red-600">Todos os cadernos e subpastas dentro dela também serão excluídos.</span>`;
            // ===== FIM DA MODIFICAÇÃO =====
            if(DOM.confirmationModal) DOM.confirmationModal.classList.remove('hidden');
        }
        else if (target.closest('.edit-caderno-btn')) {
            const btn = target.closest('.edit-caderno-btn');
            openNameModal('caderno', btn.dataset.id, btn.dataset.name);
        }
        else if (target.closest('.delete-caderno-btn')) {
            const btn = target.closest('.delete-caderno-btn');
            const cadernoId = btn.dataset.id;
            const cadernoName = btn.dataset.name || state.userCadernos.find(c => c.id === cadernoId)?.name || 'este caderno';

            setState('deletingId', cadernoId);
            setState('deletingType', 'caderno');
            if(DOM.confirmationModalTitle) DOM.confirmationModalTitle.textContent = `Excluir Caderno`;
            if(DOM.confirmationModalText) DOM.confirmationModalText.innerHTML = `Deseja excluir o caderno <strong>"${cadernoName}"</strong>?`;
            if(DOM.confirmationModal) DOM.confirmationModal.classList.remove('hidden');
        }
        // ===== FIM DA MODIFICAÇÃO =====
        
        // ===== INÍCIO DA MODIFICAÇÃO (SOLICITAÇÃO DO USUÁRIO) =====
        // Lógica para o novo menu de info da pasta
        else if (target.closest('#folder-info-menu-btn')) {
            const button = target.closest('#folder-info-menu-btn');
            const folderId = button.dataset.folderId;
            const dropdown = document.getElementById(`folder-info-menu-dropdown-${folderId}`);
            if (dropdown) {
                // Esconde outros dropdowns
                document.querySelectorAll('.caderno-menu-dropdown, .folder-info-menu-dropdown').forEach(d => {
                    if (d.id !== dropdown.id) d.classList.add('hidden');
                });
                dropdown.classList.toggle('hidden');
            }
        }
        else if (target.closest('.create-subfolder-btn')) {
            event.preventDefault();
            
            // MODIFICADO: Abre o novo modal de subpasta em vez do modal genérico
            openSubfolderModal(); 
            
            // Esconde o dropdown
            const dropdown = target.closest('.folder-info-menu-dropdown');
            if (dropdown) dropdown.classList.add('hidden');
        }
        
        // NOVO: Listeners para o modal de subpasta
        else if (target.closest('#cancel-subfolder-btn')) {
            closeSubfolderModal();
        }
        // ===== INÍCIO DA MODIFICAÇÃO: Lógica de criação de subpasta =====
        else if (target.closest('#confirm-subfolder-btn')) {
            const name = DOM.subfolderNameInput.value.trim();
            
            if (name && state.currentUser && state.currentFolderId) {
                try {
                    // Chama a função de criação, passando 'folder', o nome, null (novo id) e o parentId
                    await createOrUpdateName('folder', name, null, state.currentFolderId);
                    closeSubfolderModal();
                } catch (error) {
                    console.error("Erro ao criar subpasta:", error);
                    // TODO: Mostrar um modal de erro para o usuário
                    closeSubfolderModal();
                }
            } else {
                closeSubfolderModal();
            }
        }
        // ===== FIM DA MODIFICAÇÃO =====

        // ===== INÍCIO DA MODIFICAÇÃO: Listener para expandir/recolher pastas (SOLICITAÇÃO DO USUÁRIO) =====
        else if (target.closest('.toggle-folder-contents')) {
            const toggleSpan = target.closest('.toggle-folder-contents');
            const folderId = toggleSpan.dataset.folderId; // Pega o ID do span
            
            if (folderId) {
                // Verifica o estado atual baseado no texto
                const isCurrentlyExpanded = toggleSpan.textContent === toggleSpan.dataset.textCollapse;
                const isExpanded = !isCurrentlyExpanded; // O novo estado

                // Atualiza o texto
                toggleSpan.textContent = isExpanded ? toggleSpan.dataset.textCollapse : toggleSpan.dataset.textExpand;
                
                // Encontra todos os cadernos filhos e alterna a visibilidade
                document.querySelectorAll(`.notebook-child-of-${folderId}`).forEach(row => {
                    row.classList.toggle('hidden', !isExpanded);
                });
            }
        }
        // ===== FIM DA MODIFICAÇÃO =====

        else if (target.closest('#saved-cadernos-list-container')) {
            handleCadernoItemClick(event);
            handleFolderItemClick(event);
        }
        else if (target.closest('#back-to-folders-btn')) handleBackToFolders();
        else if (target.closest('#add-questions-to-caderno-btn')) await handleAddQuestionsToCaderno();
        else if (target.closest('#cancel-add-questions-btn')) await cancelAddQuestions();


        // --- Materias / Assuntos ---
        else if (target.closest('#materias-list-container')) handleMateriaListClick(event);
        else if (target.closest('#assuntos-list-container')) await handleAssuntoListClick(event);
        else if (target.closest('#back-to-materias-btn')) handleBackToMaterias();
        
        // --- Revisão ---
        else if (target.closest('#start-selected-review-btn')) await handleStartReview();
        // ===== INÍCIO DA MODIFICAÇÃO (SOLICITAÇÃO DO USUÁRIO) =====
        // NOVO: Listener para o botão de sair da revisão
        else if (target.closest('#exit-review-mode-btn')) {
            setState('isReviewSession', false);
            if(DOM.reviewQuestionContainer) DOM.reviewQuestionContainer.classList.add('hidden');
            if(DOM.reviewTableContainer) DOM.reviewTableContainer.classList.remove('hidden');
            if(DOM.startSelectedReviewBtn) DOM.startSelectedReviewBtn.classList.remove('hidden');
            
            // Limpa a sessão e atualiza a tabela
            clearSessionStats();
            setState('filteredQuestions', []);
            setState('currentQuestionIndex', 0);
            renderReviewView(); // Atualiza a tabela de revisão
        }
        // ===== FIM DA MODIFICAÇÃO =====
        // --- MODIFICAÇÃO: Listener para expandir/recolher na tabela de revisão ---
        else if (target.closest('.toggle-review-row')) {
            const row = target.closest('tr');
            const rowId = row.dataset.id;
            const isExpanded = target.classList.toggle('rotate-90');
            
            document.querySelectorAll(`tr[data-parent-id="${rowId}"]`).forEach(childRow => {
                childRow.classList.toggle('hidden', !isExpanded);
                
                // Se estamos recolhendo (isExpanded = false), recolhe todos os descendentes também
                if (!isExpanded) {
                    const childIcon = childRow.querySelector('.toggle-review-row');
                    if (childIcon && childIcon.classList.contains('rotate-90')) {
                        childIcon.classList.remove('rotate-90');
                        const grandChildRows = document.querySelectorAll(`tr[data-parent-id="${childRow.dataset.id}"]`);
                        grandChildRows.forEach(gc => {
                            gc.classList.add('hidden');
                            // Continua recursivamente
                             const gcIcon = gc.querySelector('.toggle-review-row');
                             if (gcIcon && gcIcon.classList.contains('rotate-90')) {
                                gcIcon.classList.remove('rotate-90');
                                const ggcRows = document.querySelectorAll(`tr[data-parent-id="${gc.dataset.id}"]`);
                                ggcRows.forEach(ggc => ggc.classList.add('hidden'));
                             }
                        });
                    }
                }
            });
        }
        // --- FIM DA MODIFICAÇÃO ---

        // --- Filters ---
        else if (target.closest('#filter-btn')) {
            if (state.isAddingQuestionsMode.active) {
                await addFilteredQuestionsToCaderno();
            } else {
                await applyFilters();
            }
        }
        else if (target.closest('#clear-filters-btn')) clearAllFilters();
        else if (target.closest('.remove-filter-btn')) {
            const btn = target.closest('.remove-filter-btn');
            removeFilter(btn.dataset.filterType, btn.dataset.filterValue);
        }
        else if (target.closest('.filter-btn-toggle')) {
            const group = target.closest('.filter-btn-group');
            if (group) {
                const currentActive = group.querySelector('.active-filter');
                if (currentActive) currentActive.classList.remove('active-filter');
                target.classList.add('active-filter');
                updateSelectedFiltersDisplay();
            }
        }
         else if (target.closest('#toggle-filters-btn')) {
            DOM.filterCard.classList.toggle('hidden');
            const isHidden = DOM.filterCard.classList.contains('hidden');
            const btn = target.closest('#toggle-filters-btn');
            btn.innerHTML = isHidden
                ? `<i class="fas fa-eye mr-2"></i> Mostrar Filtros`
                : `<i class="fas fa-eye-slash mr-2"></i> Ocultar Filtros`;
        }
        
        // --- Navigation ---
        else if (target.closest('.nav-link')) {
            event.preventDefault();
            // ===== INÍCIO DA MODIFICAÇÃO: Adicionado await =====
            await navigateToView(target.closest('.nav-link').dataset.view);
            // ===== FIM DA MODIFICAÇÃO =====
        }

        // --- MODIFICAÇÃO: Filtro de Período de Estatísticas ---
        else if (target.closest('#stats-periodo-button')) {
            event.preventDefault();
            DOM.statsPeriodoPanel.classList.toggle('hidden');
        }
        else if (target.closest('.period-option-item')) {
            const selectedOption = target.closest('.period-option-item');
            const value = selectedOption.dataset.value;
            let text = selectedOption.textContent; // Texto padrão
            let startDate, endDate; // Para armazenar as datas

            // --- LÓGICA DE CÁLCULO DE DATA ---
            const today = new Date();
            today.setHours(0, 0, 0, 0); // Normaliza para o início do dia

            // Formata uma data para DD/MM/YYYY
            const formatDate = (date) => {
                const d = date.getDate().toString().padStart(2, '0');
                const m = (date.getMonth() + 1).toString().padStart(2, '0');
                const y = date.getFullYear();
                return `${d}/${m}/${y}`;
            };

            // Formata uma data para YYYY-MM-DD (para os inputs 'date')
            const formatDateForInput = (date) => {
                const d = date.getDate().toString().padStart(2, '0');
                const m = (date.getMonth() + 1).toString().padStart(2, '0');
                const y = date.getFullYear();
                return `${y}-${m}-${d}`;
            }

            switch (value) {
                case 'hoje':
                    startDate = new Date(today);
                    endDate = new Date(today);
                    text = formatDate(today);
                    break;
                case 'ontem':
                    const yesterday = new Date(today);
                    yesterday.setDate(today.getDate() - 1);
                    startDate = new Date(yesterday);
                    endDate = new Date(yesterday);
                    text = formatDate(yesterday);
                    break;
                case 'ultimos-7-dias':
                    const sevenDaysAgo = new Date(today);
                    sevenDaysAgo.setDate(today.getDate() - 6); // -6 para incluir hoje (total 7 dias)
                    startDate = new Date(sevenDaysAgo);
                    endDate = new Date(today);
                    text = `${formatDate(sevenDaysAgo)} - ${formatDate(today)}`;
                    break;
                case 'ultimos-15-dias':
                    const fifteenDaysAgo = new Date(today);
                    fifteenDaysAgo.setDate(today.getDate() - 14);
                    startDate = new Date(fifteenDaysAgo);
                    endDate = new Date(today);
                    text = `${formatDate(fifteenDaysAgo)} - ${formatDate(today)}`;
                    break;
                case 'este-mes':
                    const firstDayMonth = new Date(today.getFullYear(), today.getMonth(), 1);
                    startDate = new Date(firstDayMonth);
                    endDate = new Date(today); // Até o dia de hoje
                    text = `${formatDate(firstDayMonth)} - ${formatDate(today)}`;
                    break;
                case 'mes-passado':
                    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                    const firstDayLastMonth = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1);
                    const lastDayLastMonth = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0); // Dia 0 do mês atual é o último do mês passado
                    startDate = new Date(firstDayLastMonth);
                    endDate = new Date(lastDayLastMonth);
                    text = `${formatDate(firstDayLastMonth)} - ${formatDate(lastDayLastMonth)}`;
                    break;
                case 'ultimos-6-meses':
                    const sixMonthsAgo = new Date(today);
                    sixMonthsAgo.setMonth(today.getMonth() - 6);
                    startDate = new Date(sixMonthsAgo);
                    endDate = new Date(today);
                    text = `${formatDate(sixMonthsAgo)} - ${formatDate(today)}`;
                    break;
                case 'ultimo-ano':
                     const oneYearAgo = new Date(today);
                     oneYearAgo.setFullYear(today.getFullYear() - 1);
                     startDate = new Date(oneYearAgo);
                     endDate = new Date(today);
                     text = `${formatDate(oneYearAgo)} - ${formatDate(today)}`;
                    break;
                case 'tudo':
                    text = 'Tudo'; // Mantém o texto original
                    startDate = null;
                    endDate = null;
                    break;
            }
            // --- FIM DA LÓGICA DE DATA ---

            // Remove a classe ativa de todos
            DOM.statsPeriodoOptions.querySelectorAll('.period-option-item').forEach(opt => opt.classList.remove('active'));
            
            if (value === 'personalizado') {
                // Mostra o range customizado, mas não fecha o painel ainda
                DOM.statsPeriodoCustomRange.classList.remove('hidden');
                selectedOption.classList.add('active'); // Mantém "Personalizado" ativo

                // Pré-preenche o date picker com o último range válido ou com hoje
                const lastStart = DOM.statsPeriodoButton.dataset.startDate;
                const lastEnd = DOM.statsPeriodoButton.dataset.endDate;
                DOM.statsPeriodoStart.value = lastStart || formatDateForInput(today);
                DOM.statsPeriodoEnd.value = lastEnd || formatDateForInput(today);

            } else {
                // Opção normal: atualiza o valor e fecha
                DOM.statsPeriodoValue.textContent = text;
                DOM.statsPeriodoButton.dataset.value = value;
                
                // Armazena as datas no botão para o filtro usar (formato YYYY-MM-DD)
                DOM.statsPeriodoButton.dataset.startDate = startDate ? formatDateForInput(startDate) : '';
                DOM.statsPeriodoButton.dataset.endDate = endDate ? formatDateForInput(endDate) : '';

                selectedOption.classList.add('active');
                DOM.statsPeriodoPanel.classList.add('hidden');
                DOM.statsPeriodoCustomRange.classList.add('hidden');
                
                // ===== INÍCIO DA MODIFICAÇÃO (SOLICITAÇÃO DO USUÁRIO): Chamada removida =====
                // Removido: await handleStatsFilter(); (Agora só filtra ao clicar em "Filtrar")
                // ===== FIM DA MODIFICAÇÃO =====
            }
        }
        else if (target.closest('#stats-periodo-custom-apply')) {
            event.preventDefault();
            const start = DOM.statsPeriodoStart.value; // Formato YYYY-MM-DD
            const end = DOM.statsPeriodoEnd.value; // Formato YYYY-MM-DD
            
            if (start && end) {
                // Validação simples de data
                const startDate = new Date(start + 'T00:00:00'); // Adiciona T00:00:00 para evitar problemas de fuso
                const endDate = new Date(end + 'T00:00:00');

                if (startDate > endDate) {
                    console.warn("A data de início não pode ser maior que a data de fim.");
                    // Poderia mostrar um erro para o usuário aqui
                    return; 
                }

                // Formata a data para dd/mm/aaaa
                const formattedStart = start.split('-').reverse().join('/');
                const formattedEnd = end.split('-').reverse().join('/');
                const text = `${formattedStart} - ${formattedEnd}`;
                
                DOM.statsPeriodoValue.textContent = text;
                DOM.statsPeriodoButton.dataset.value = 'personalizado';
                DOM.statsPeriodoButton.dataset.startDate = start; // Salva como YYYY-MM-DD
                DOM.statsPeriodoButton.dataset.endDate = end; // Salva como YYYY-MM-DD
                
                DOM.statsPeriodoPanel.classList.add('hidden');
                DOM.statsPeriodoCustomRange.classList.add('hidden');
                
                // ===== INÍCIO DA MODIFICAÇÃO (SOLICITAÇÃO DO USUÁRIO): Chamada removida =====
                // Removido: await handleStatsFilter(); (Agora só filtra ao clicar em "Filtrar")
                // ===== FIM DA MODIFICAÇÃO =====
            } else {
                console.warn("Selecione data de início e fim.");
            }
        }
        // --- FIM DA MODIFICAÇÃO ---
        
        // --- Stats Tabs ---
        else if (target.closest('#stats-tabs-container .tab-button')) {
            const tabButton = target.closest('#stats-tabs-container .tab-button');
            const tabName = tabButton.dataset.tab;

            if (!tabButton.classList.contains('active')) {
                // Remove a classe ativa de todos os botões e conteúdos
                DOM.statsTabsContainer.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
                document.querySelectorAll('#stats-tabs-content-container .stats-tab-content').forEach(content => content.classList.add('hidden'));

                // Adiciona a classe ativa ao botão clicado e ao conteúdo correspondente
                tabButton.classList.add('active');
                const activeContent = document.getElementById(`${tabName}-tab`);
                if (activeContent) {
                    activeContent.classList.remove('hidden');
                }
            }
        }
        // --- Stats Tree Table Toggle ---
        else if (target.closest('.tree-table .toggle-icon:not(.no-children)')) {
            const row = target.closest('.tree-table-row');
            if (row) {
                const rowId = row.dataset.id;
                const level = parseInt(row.dataset.level);
                const icon = row.querySelector('.toggle-icon');
                
                icon.classList.toggle('rotate-90');
                const isExpanded = icon.classList.contains('rotate-90');

                // Encontra todos os filhos diretos
                const childRows = document.querySelectorAll(`.tree-table-row[data-parent-id="${rowId}"]`);
                
                childRows.forEach(child => {
                    child.classList.toggle('hidden-row', !isExpanded);

                    // Se estivermos fechando (isExpanded = false), precisamos fechar todos os descendentes também
                    if (!isExpanded) {
                        const childIcon = child.querySelector('.toggle-icon');
                        if(childIcon && childIcon.classList.contains('rotate-90')) {
                             childIcon.classList.remove('rotate-90');
                             const grandChildRows = document.querySelectorAll(`.tree-table-row[data-parent-id="${child.dataset.id}"]`);
                             grandChildRows.forEach(gc => {
                                gc.classList.add('hidden-row');
                                // Continua recursivamente
                                const gcIcon = gc.querySelector('.toggle-icon');
                                if(gcIcon && gcIcon.classList.contains('rotate-90')) {
                                    gcIcon.classList.remove('rotate-90');
                                    const ggcRows = document.querySelectorAll(`.tree-table-row[data-parent-id="${gc.dataset.id}"]`);
                                    ggcRows.forEach(ggc => ggc.classList.add('hidden-row'));
                                }
                             });
                        }
                    }
                });
            }
        }
        // --- NOVO LISTENER PARA RESETAR PROGRESSO ---
        else if (target.closest('#reset-all-progress-btn')) {
            if (!state.currentUser) return; // Proteção
            setState('deletingId', null);
            setState('deletingType', 'all-progress');
            if (DOM.confirmationModalTitle) DOM.confirmationModalTitle.textContent = 'Resetar Progresso';
            // ===== INÍCIO DA MODIFICAÇÃO (SOLICITAÇÃO DO USUÁRIO) =====
            // Texto do modal atualizado para refletir a nova ação.
            if (DOM.confirmationModalText) DOM.confirmationModalText.innerHTML = `Tem certeza que deseja apagar o seu progresso? Isso irá apagar <strong>SOMENTE</strong> suas estatísticas, resoluções de questões e agendamentos de revisão. <br><br>Seus filtros, pastas e cadernos serão mantidos. <br><span class="font-bold text-red-600">Esta ação não pode ser desfeita.</span>`;
            // ===== FIM DA MODIFICAÇÃO =====
            if (DOM.confirmationModal) DOM.confirmationModal.classList.remove('hidden');
        }
        // ===== INÍCIO DA MODIFICAÇÃO =====
        else if (target.id === 'stats-filter-btn') {
            // Chama a função de filtragem
            await handleStatsFilter();
        }
        // ===== FIM DA MODIFICAÇÃO =====
    });

    // Input/Change listeners
    if (DOM.searchSavedFiltersInput) {
        DOM.searchSavedFiltersInput.addEventListener('input', updateSavedFiltersList);
    }
    
    // --- MODIFICAÇÃO: Removido listener antigo da tabela de revisão ---
    // A nova lógica será adicionada abaixo

    // --- MODIFICAÇÃO: Substituído 'visibilitychange' por 'pagehide' ---
    // 'pagehide' é mais confiável para salvar dados antes de sair
    // e não dispara ao trocar de aba do navegador.
    window.addEventListener('pagehide', (event) => {
        // Salva a sessão ANTES do usuário sair da página
        // Não usamos 'await' e NÃO limpamos o sessionStats.
        // A sessão será limpa na próxima vez que o usuário
        // aplicar um filtro ou fizer logout.
        if (state.currentUser && state.sessionStats.length > 0) {
            saveSessionStats();
        }
    });

    // --- NOVO LISTENER ---
    // Adiciona o listener de 'change' para a tabela de estatísticas
    // Usamos 'document' para garantir que funcione mesmo se a tabela for re-renderizada
    document.addEventListener('change', (event) => {
        const target = event.target;

        // ===== INÍCIO DA MODIFICAÇÃO =====
        // REMOVIDO: Bloco 'if (target.id === 'stats-materia-filter')'
        // A nova lógica de filtro customizado (setupCustomSelect)
        // cuidará disso através do callback.
        // ===== FIM DA MODIFICAÇÃO =====

        // Tabela de Estatísticas
        if (target.closest('#stats-desempenho-materia-container')) {
            handleStatsTableSelection(event);
        }
        
        // --- MODIFICAÇÃO: Nova lógica para seleção na tabela de revisão ---
        else if (target.closest('#review-table-container')) {
            if (target.matches('.review-checkbox')) {
                handleReviewTableSelection(target);
            } else if (target.matches('#select-all-review-materias')) {
                const isChecked = target.checked;
                DOM.reviewTableContainer.querySelectorAll('.review-checkbox:not(:disabled)').forEach(cb => {
                    cb.checked = isChecked;
                    cb.indeterminate = false;
                });
                // Garante que o estado 'indeterminate' seja limpo
                const selectAllCheckbox = DOM.reviewTableContainer.querySelector('#select-all-review-materias');
                if (selectAllCheckbox && isChecked) {
                    selectAllCheckbox.indeterminate = false;
                }
                
                // ===== INÍCIO DA MODIFICAÇÃO (SOLICITAÇÃO DO USUÁRIO) =====
                // Atualiza o botão de iniciar revisão
                const anyChecked = DOM.reviewTableContainer.querySelector('.review-checkbox:checked');
                if(DOM.startSelectedReviewBtn) DOM.startSelectedReviewBtn.disabled = !anyChecked;
                // ===== FIM DA MODIFICAÇÃO =====
            }
        }
        // --- FIM DA MODIFICAÇÃO ---
        
        // ===== INÍCIO DA MODIFICAÇÃO =====
        // Botões de rádio da aba Evolução
        else if (target.matches('input[name="evolucao-filter"]')) {
            // Chama a função de filtragem principal, que vai ler o valor deste rádio
            handleStatsFilter();
        }
        // ===== FIM DA MODIFICAÇÃO =====

        // ===== INÍCIO DA MODIFICAÇÃO: Listener para o select de Mover =====
        if (target.id === 'move-footer-folder-select') {
            handleMoveFooterFolderSelect();
        }
        // ===== FIM DA MODIFICAÇÃO =====
    });
}
