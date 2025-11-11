import { Timestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { state, setState, getActiveContainer } from '../state.js';
import DOM from '../dom-elements.js';
import { navigateToView } from '../ui/navigation.js';
// --- CORREÇÃO: Importar a função displayQuestion ---
import { renderAnsweredQuestion, displayQuestion } from './question-viewer.js';
import { updateStatsPanel, updateStatsPageUI } from './stats.js';
// ===== INÍCIO DA MODIFICAÇÃO =====
import { setSrsReviewItem, saveUserAnswer, updateQuestionHistory, logPerformanceEntry } from '../services/firestore.js';
// ===== FIM DA MODIFICAÇÃO =====

// --- IMPLEMENTAÇÃO DO ALGORITMO SM-2 (AJUSTADO) ---

const MIN_EASE_FACTOR = 1.3;
const INITIAL_EASE_FACTOR = 2.5;

/**
 * Ordena strings alfanumericamente (ex: "2.10" vem depois de "2.9").
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function naturalSort(a, b) {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Calcula os próximos parâmetros do SRS com base no algoritmo SM-2.
 * @param {object} reviewItem - O item de revisão atual da questão.
 * @param {number} quality - A qualidade da resposta (0: Errei, 1: Difícil, 2: Bom, 3: Fácil).
 * @returns {object} Novo item de revisão com { easeFactor, interval, repetitions, nextReviewDate }.
 */
function calculateSm2(reviewItem, quality) {
    let { easeFactor = INITIAL_EASE_FACTOR, interval = 0, repetitions = 0 } = reviewItem || {};

    // 1. Lida com respostas incorretas (qualidade 0)
    if (quality === 0) {
        repetitions = 0; // Reseta o progresso
        interval = 1;    // Agenda para o próximo dia (Errei 1d)
        easeFactor = Math.max(MIN_EASE_FACTOR, easeFactor - 0.20); // Penaliza o 'ease'
    } else {
        // 2. Lida com respostas corretas (qualidade 1, 2, 3)
        repetitions += 1;

        // --- INÍCIO DA CORREÇÃO (Lógica de Intervalo) ---
        // A lógica foi ajustada para refletir os intervalos esperados na primeira revisão:
        // Difícil (1) = 2 dias, Bom (2) = 3 dias, Fácil (3) = 4 dias.
        // As revisões seguintes (rep 2+) seguem um padrão SM-2 modificado.

        if (repetitions === 1) {
            // Primeira revisão (Repetição 1)
            if (quality === 1) { // 'Difícil'
                interval = 2; // Agendado para 2 dias
            } else if (quality === 2) { // 'Bom'
                interval = 3; // Agendado para 3 dias
            } else if (quality === 3) { // 'Fácil'
                interval = 4; // Agendado para 4 dias
            } else {
                interval = 1; // Fallback
            }
        } else if (repetitions === 2) {
            // Segunda revisão (Repetição 2)
            // Usamos um intervalo fixo padrão do SM-2
            interval = 6; 
        } else {
            // Terceira revisão e subsequentes (Repetição 3+)
            // Usa o easeFactor para calcular o próximo intervalo
            interval = Math.ceil(interval * easeFactor);

            // Aplicamos modificadores de bônus/penalidade
            if (quality === 1) { // 'Difícil'
                // Penaliza levemente o intervalo se achar difícil (mas não reseta)
                interval = Math.ceil(interval * 0.9);
            } else if (quality === 3) { // 'Fácil'
                // Aplica um bônus de 30% sobre o intervalo recém-calculado.
                interval = Math.ceil(interval * 1.3);
            }
            // 'Bom' (quality 2) não modifica o intervalo, usa o easeFactor puro.
        }
        // --- FIM DA CORREÇÃO ---
    }

    // 3. Atualiza o Fator de Facilidade (apenas para respostas corretas)
    if (quality > 0) {
        if (quality === 1) { // 'Difícil'
            easeFactor = Math.max(MIN_EASE_FACTOR, easeFactor - 0.15);
        } else if (quality === 3) { // 'Fácil'
            easeFactor += 0.15;
        }
        // 'Bom' (quality 2) não altera o easeFactor
    }
    
    // Garante que o intervalo mínimo seja 1.
    interval = Math.max(1, interval);

    const date = new Date();
    date.setDate(date.getDate() + interval);
    const nextReviewDate = Timestamp.fromDate(date);

    return { easeFactor, interval, repetitions, nextReviewDate };
}


/**
 * Formata um intervalo em dias para uma string legível (ex: "3d", "2m", "1a").
 * @param {number} intervalInDays - O intervalo em dias.
 * @returns {string} O intervalo formatado.
 */
export function formatInterval(intervalInDays) {
    if (intervalInDays < 1) return "<1d";
    if (intervalInDays < 30) return `${Math.round(intervalInDays)}d`;
    if (intervalInDays < 365) return `${Math.round(intervalInDays / 30)}m`;
    return `${(intervalInDays / 365).toFixed(1)}a`;
}


export async function handleSrsFeedback(feedback) {
    setState('isUpdatingAnswer', true); // BUG FIX: Set flag to prevent snapshot re-render

    const question = state.filteredQuestions[state.currentQuestionIndex];
    const isCorrect = state.selectedAnswer === question.correctAnswer;
    
    // Mapeia o feedback do botão para a qualidade numérica
    const qualityMap = { 'again': 0, 'hard': 1, 'good': 2, 'easy': 3 };
    let quality = qualityMap[feedback];
    
    // Se a resposta estiver incorreta, a qualidade é sempre 0 (Errei), não importa o botão clicado
    if (!isCorrect) {
        quality = 0;
    }

    if (!state.sessionStats.some(s => s.questionId === question.id)) {
        state.sessionStats.push({
            questionId: question.id, isCorrect: isCorrect, materia: question.materia,
            assunto: question.assunto, userAnswer: state.selectedAnswer
        });
    }

    if (state.currentUser) {
        const currentReviewItem = state.userReviewItemsMap.get(question.id);
        const newReviewData = calculateSm2(currentReviewItem, quality);
        
        const reviewDataToSave = { 
            ...newReviewData,
            questionId: question.id,
            lastReviewed: Timestamp.now()
        };

        await setSrsReviewItem(question.id, reviewDataToSave);
        state.userReviewItemsMap.set(question.id, reviewDataToSave);

        await saveUserAnswer(question.id, state.selectedAnswer, isCorrect);
        
        // ===== INÍCIO DA MODIFICAÇÃO =====
        // Atualiza tanto o histórico vitalício QUANTO o log diário
        await updateQuestionHistory(question.id, isCorrect);
        await logPerformanceEntry(question, isCorrect);
        // ===== FIM DA MODIFICAÇÃO =====
    }

    renderAnsweredQuestion(isCorrect, state.selectedAnswer, false);
    // updateStatsPanel(); // Painel de estatísticas da aba foi removido.
    updateStatsPageUI();
    
    // **CORREÇÃO:** Força a atualização da estrutura de dados da tela de revisão em tempo real.
    renderReviewView();

    setState('isUpdatingAnswer', false); // BUG FIX: Unset flag after updates
}


export function renderReviewView() {
    if (!state.currentUser) {
        DOM.reviewTableContainer.innerHTML = `<p class="text-center text-gray-500 p-8">Por favor, faça login para ver suas revisões.</p>`;
        return;
    }

    if (state.userReviewItemsMap.size === 0) {
        DOM.reviewTableContainer.innerHTML = `<p class="text-center text-gray-500 p-8">Você ainda não tem nenhuma questão para revisar. Resolva questões para começar.</p>`;
        return;
    }

    // --- MODIFICAÇÃO: Popula questionIdToDetails com 4 níveis ---
    const questionIdToDetails = new Map();
    state.allQuestions.forEach(q => {
        if (q.materia && q.assunto) { // Apenas questões válidas
            questionIdToDetails.set(q.id, {
                materia: q.materia,
                assunto: q.assunto,
                subAssunto: q.subAssunto || null,
                subSubAssunto: q.subSubAssunto || null
            });
        }
    });
    // --- FIM DA MODIFICAÇÃO ---


    // --- MODIFICAÇÃO: Construção da hierarquia de 4 níveis ---
    const hierarchy = new Map();
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    // Helper para criar um nó de estatísticas
    const createStatsNode = () => ({
        total: 0, errei: 0, dificil: 0, bom: 0, facil: 0, aRevisar: 0,
        questionIdsARevisar: [],
        children: new Map() // Usar Map para sub-níveis
    });

    // Helper para incrementar as estatísticas de um nó
    const incrementStats = (node, item) => {
        node.total++;
        const { repetitions = 0, easeFactor = INITIAL_EASE_FACTOR } = item;
        
        if (repetitions === 0) {
            node.errei++;
        } else if (easeFactor < 2.4) {
            node.dificil++;
        } else if (easeFactor < 2.6) {
            node.bom++;
        } else {
            node.facil++;
        }

        if (item.nextReviewDate) {
            const reviewDate = item.nextReviewDate.toDate();
            reviewDate.setHours(0, 0, 0, 0);
            if (reviewDate <= now) {
                node.aRevisar++;
                node.questionIdsARevisar.push(item.questionId);
            }
        }
    };

    state.userReviewItemsMap.forEach(item => {
        const details = questionIdToDetails.get(item.questionId);
        if (!details) return; // Pula se a questão não for encontrada

        const { materia, assunto, subAssunto, subSubAssunto } = details;

        // Nível 1: Matéria
        if (!hierarchy.has(materia)) {
            hierarchy.set(materia, createStatsNode());
        }
        const materiaNode = hierarchy.get(materia);
        incrementStats(materiaNode, item);

        // Nível 2: Assunto
        if (!materiaNode.children.has(assunto)) {
            materiaNode.children.set(assunto, createStatsNode());
        }
        const assuntoNode = materiaNode.children.get(assunto);
        incrementStats(assuntoNode, item);

        // Nível 3: SubAssunto (só adiciona se existir)
        if (subAssunto) {
            if (!assuntoNode.children.has(subAssunto)) {
                assuntoNode.children.set(subAssunto, createStatsNode());
            }
            const subAssuntoNode = assuntoNode.children.get(subAssunto);
            incrementStats(subAssuntoNode, item);

            // Nível 4: SubSubAssunto (só adiciona se existir)
            if (subSubAssunto) {
                // --- CORREÇÃO ---
                // O erro estava aqui. Deveria checar/criar no `subAssuntoNode.children`
                if (!subAssuntoNode.children.has(subSubAssunto)) {
                    subAssuntoNode.children.set(subSubAssunto, createStatsNode());
                }
                // E aqui, deveria pegar o nó recém-criado/existente a partir do `subAssuntoNode`
                const subSubAssuntoNode = subAssuntoNode.children.get(subSubAssunto);
                // --- FIM DA CORREÇÃO ---
                incrementStats(subSubAssuntoNode, item);
            }
        }
    });
    
    setState('reviewStatsByMateria', hierarchy); // Salva a nova hierarquia
    // --- FIM DA MODIFICAÇÃO ---

    
    if (hierarchy.size === 0) {
        DOM.reviewTableContainer.innerHTML = `<p class="text-center text-gray-500 p-8">Nenhuma matéria com questões para revisar.</p>`;
        return;
    }

    let tableHtml = `
        <table class="min-w-full divide-y divide-gray-200 text-sm">
            <thead class="bg-gray-50">
                <tr>
                    <!-- MODIFICAÇÃO: Adicionado div.pl-4 para alinhar checkbox -->
                    <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <div class="pl-4">
                            <input type="checkbox" id="select-all-review-materias" class="rounded">
                        </div>
                    </th>
                    <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-black-500 tracking-wider">Matérias e Assuntos</th>
                    <th scope="col" class="px-4 py-3 text-center text-xs font-medium text-black-500 tracking-wider">Total</th>
                    <th scope="col" class="px-4 py-3 text-center text-xs font-medium text-black-500 tracking-wider" title="Questões marcadas como 'Errei'">Errei</th>
                    <th scope="col" class="px-4 py-3 text-center text-xs font-medium text-black-500 tracking-wider" title="Questões marcadas como 'Difícil'">Difícil</th>
                    <th scope="col" class="px-4 py-3 text-center text-xs font-medium text-black-500 tracking-wider" title="Questões marcadas como 'Bom'">Bom</th>
                    <th scope="col" class="px-4 py-3 text-center text-xs font-medium text-black-500 tracking-wider" title="Questões marcadas como 'Fácil'">Fácil</th>
                    <th scope="col" class="px-4 py-3 text-center text-xs font-medium text-black-500 tracking-wider">A revisar</th>
                    <th scope="col" class="px-4 py-3 text-center text-xs font-medium text-black-500 tracking-wider">Concluído</th>
                </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">`;

    // --- MODIFICAÇÃO: Função recursiva para renderizar linhas ---
    const renderRow = (node, name, level, parentId = '', pathData = {}) => {
        const { total, errei, dificil, bom, facil, aRevisar } = node;
        const isDisabled = aRevisar === 0;
        const concluidoPercent = total > 0 ? Math.round(((total - aRevisar) / total) * 100) : 100;
        const progressColor = concluidoPercent >= 80 ? 'bg-green-500' : concluidoPercent >= 50 ? 'bg-yellow-500' : 'bg-red-500';
        const hasChildren = node.children.size > 0;
        const isHidden = level > 1 ? 'hidden' : '';
        const rowTypeClass = ['materia-row', 'assunto-row', 'subassunto-row', 'subsubassunto-row'][level - 1];
        const indentClass = `pl-${(level - 1) * 4}`; // pl-0, pl-4, pl-8, pl-12
        const rowId = parentId ? `${parentId}__${name.replace(/[^a-zA-Z0-9]/g, '-')}` : `row__${name.replace(/[^a-zA-Z0-9]/g, '-')}`;
        
        // Passa os dados do caminho (materia, assunto, etc.) para o checkbox
        const dataAttributes = Object.entries(pathData).map(([key, value]) => `data-${key}="${value}"`).join(' ');

        let html = `
            <tr class="${rowTypeClass} ${isHidden} ${isDisabled ? 'bg-gray-50 text-gray-400' : 'hover:bg-gray-50'}" data-id="${rowId}" data-parent-id="${parentId}" data-level="${level}">
                <td class="px-4 py-4 whitespace-nowrap">
                    <!-- Checkbox alinhado (pl-4) e com data attributes -->
                    <div class="flex items-center pl-4">
                        <input type="checkbox" class="review-checkbox rounded" ${dataAttributes} ${isDisabled ? 'disabled' : ''} data-level="${level}">
                    </div>
                </td>
                <td class="px-4 py-4 whitespace-nowrap font-medium ${isDisabled ? '' : 'text-gray-900'}">
                    <!-- Nome com indentação (baseada no nível) -->
                    <div class="flex items-center ${indentClass}">
                        ${hasChildren
                            ? `<i class="fas fa-chevron-right toggle-review-row transition-transform duration-200 mr-2 text-gray-400 cursor-pointer"></i>`
                            : `<span class="w-6 mr-2"></span>`
                        }
                        <span>${name}</span>
                    </div>
                </td>
                <td class="px-4 py-4 whitespace-nowrap text-center">${total}</td>
                <td class="px-4 py-4 whitespace-nowrap text-center text-red-500 font-medium">${errei}</td>
                <td class="px-4 py-4 whitespace-nowrap text-center text-yellow-500 font-medium">${dificil}</td>
                <td class="px-4 py-4 whitespace-nowrap text-center text-green-500 font-medium">${bom}</td>
                <td class="px-4 py-4 whitespace-nowrap text-center text-blue-500 font-medium">${facil}</td>
                <td class="px-4 py-4 whitespace-nowrap text-center font-bold ${isDisabled ? '' : 'text-blue-600'}">${aRevisar}</td>
                <td class="px-4 py-4 whitespace-nowrap">
                    <div class="flex items-center justify-center">
                        <span class="text-xs font-medium text-gray-700 w-8">${concluidoPercent}%</span>
                        <div class="w-24 bg-gray-200 rounded-full h-2.5 ml-2"><div class="${progressColor} h-2.5 rounded-full" style="width: ${concluidoPercent}%"></div></div>
                    </div>
                </td>
            </tr>
        `;

        if (hasChildren) {
            const sortedChildren = Array.from(node.children.keys()).sort(naturalSort);
            for (const childName of sortedChildren) {
                const childNode = node.children.get(childName);
                
                // Constrói o path de dados para o filho
                let childPathData = { ...pathData };
                if (level === 1) childPathData.assunto = childName;
                else if (level === 2) childPathData.subassunto = childName;
                else if (level === 3) childPathData.subsubassunto = childName;
                
                html += renderRow(childNode, childName, level + 1, rowId, childPathData);
            }
        }
        return html;
    };
    // --- FIM DA FUNÇÃO RECURSIVA ---

    const sortedMaterias = Array.from(hierarchy.keys()).sort(naturalSort);
    sortedMaterias.forEach(materiaName => {
        const materiaNode = hierarchy.get(materiaName);
        tableHtml += renderRow(materiaNode, materiaName, 1, '', { materia: materiaName });
    });

    tableHtml += `</tbody></table>`;
    DOM.reviewTableContainer.innerHTML = tableHtml;
}


export async function handleStartReview() {
    if (!state.currentUser) return;
    
    // --- MODIFICAÇÃO: Seleciona pela classe genérica e busca nós na hierarquia ---
    const selectedCheckboxes = DOM.reviewTableContainer.querySelectorAll('.review-checkbox:checked');
    if (selectedCheckboxes.length === 0) return;

    const questionsToReviewIds = new Set();
    const hierarchy = state.reviewStatsByMateria; // Pega a hierarquia salva no estado

    selectedCheckboxes.forEach(cb => {
        const { materia, assunto, subassunto, subsubassunto } = cb.dataset;

        let node;
        try {
            // Navega na hierarquia (Map) para encontrar o nó selecionado
            node = hierarchy.get(materia);
            if (assunto) node = node.children.get(assunto);
            if (subassunto) node = node.children.get(subassunto);
            if (subsubassunto) node = node.children.get(subsubassunto);
        } catch (e) {
            console.warn("Nó não encontrado na hierarquia de revisão:", cb.dataset);
            node = null;
        }

        // Adiciona os IDs de revisão do nó (e de todos os seus filhos, implicitamente)
        // A lógica de seleção de checkbox (em event-listeners) garante que se um pai é checado, os filhos também são.
        // Aqui só precisamos coletar os IDs do nó específico.
        // CORREÇÃO: A lógica de seleção (em event-listeners) *não* checa os filhos.
        // A *coleta* aqui deve ser recursiva.

        if (node) {
            // Função recursiva para coletar IDs
            const collectIds = (currentNode) => {
                if (currentNode.questionIdsARevisar) {
                    currentNode.questionIdsARevisar.forEach(id => questionsToReviewIds.add(id));
                }
                if (currentNode.children.size > 0) {
                    currentNode.children.forEach(childNode => collectIds(childNode));
                }
            };
            collectIds(node);
        }
    });
    // --- FIM DA MODIFICAÇÃO ---

    const uniqueQuestionIds = Array.from(questionsToReviewIds);

    if (uniqueQuestionIds.length > 0) {
        setState('isReviewSession', true);
        setState('filteredQuestions', state.allQuestions.filter(q => uniqueQuestionIds.includes(q.id)));
        setState('sessionStats', []);
        setState('currentQuestionIndex', 0);

        // ===== INÍCIO DA MODIFICAÇÃO (SOLICITAÇÃO DO USUÁRIO) =====
        // await navigateToView('vade-mecum-view', false); // REMOVIDO
        
        // Em vez de navegar, apenas oculta a tabela e mostra o container de questões
        if(DOM.reviewTableContainer) DOM.reviewTableContainer.classList.add('hidden');
        if(DOM.startSelectedReviewBtn) DOM.startSelectedReviewBtn.classList.add('hidden');
        if(DOM.reviewQuestionContainer) DOM.reviewQuestionContainer.classList.remove('hidden');
        
        // DOM.vadeMecumTitle.textContent = "Sessão de Revisão"; // REMOVIDO
        // DOM.toggleFiltersBtn.classList.add('hidden'); // REMOVIDO
        // DOM.filterCard.classList.add('hidden'); // REMOVIDO
        // DOM.selectedFiltersContainer.innerHTML = `<span class="text-gray-500">Revisando ${uniqueQuestionIds.length} questões.</span>`; // REMOVIDO

        await displayQuestion();
        // updateStatsPanel(); // Painel de estatísticas da aba foi removido.
        // ===== FIM DA MODIFICAÇÃO =====
    }
}
