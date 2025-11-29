import { Timestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { state, setState, getActiveContainer } from '../state.js';
import DOM from '../dom-elements.js';
import { navigateToView } from '../ui/navigation.js';
import { renderAnsweredQuestion, displayQuestion } from './question-viewer.js';
import { updateStatsPanel, updateStatsPageUI } from './stats.js';
import { setSrsReviewItem, saveUserAnswer, updateQuestionHistory, logPerformanceEntry } from '../services/firestore.js';

// ===== IMPLEMENTAÇÃO DO ALGORITMO FSRS v4 (Anki Moderno) =====

// Parâmetros padrão do FSRS v4 (Pesos otimizados padrão)
const FSRS_PARAMS = {
    request_retention: 0.9, // Retenção desejada (90%)
    maximum_interval: 36500, // Máximo de 100 anos
    w: [
        0.4, 0.6, 2.4, 5.8, // initial stability for grades 1-4 (Again, Hard, Good, Easy)
        4.93, 0.94, 0.86, 0.01, // difficulty/stability dynamics
        1.49, 0.14, 0.94, // retention/stability dynamics
        2.18, 0.05, 0.34, 1.26, // stability update on failure
        0.29, 2.61 // stability update on success
    ]
};

/**
 * Aplica "Fuzz" (pequena variação aleatória) para evitar aglomerar revisões no mesmo dia.
 * Igual ao Anki.
 */
function applyFuzz(interval) {
    if (interval < 3) return interval;
    const fuzzFactor = 0.05; // 5% de variação
    const minIv = Math.max(2, Math.round(interval * (1 - fuzzFactor)));
    const maxIv = Math.round(interval * (1 + fuzzFactor));
    return Math.floor(Math.random() * (maxIv - minIv + 1)) + minIv;
}

/**
 * Calcula os novos parâmetros usando FSRS.
 * @param {object} reviewItem - Item atual (pode ter dados SM-2 antigos ou FSRS).
 * @param {number} grade - Nota: 1 (Errei), 2 (Difícil), 3 (Bom), 4 (Fácil). NOTA: Convertido do app (0-3) para FSRS (1-4).
 */
function calculateFsrs(reviewItem, grade) {
    let { 
        stability, 
        difficulty, 
        lastReviewed, 
        interval = 0, 
        repetitions = 0 
    } = reviewItem || {};

    const now = Timestamp.now();
    let elapsedDays = 0;

    // --- 1. Migração / Inicialização ---
    if (!stability || !difficulty) {
        // Se não tem dados FSRS, tentamos converter do SM-2 ou iniciar do zero
        if (interval > 0) {
            // Conversão aproximada de SM-2 para FSRS
            stability = interval;
            difficulty = 11 - (reviewItem.easeFactor || 2.5) * 1.5; // Heurística aproximada
            if (difficulty < 1) difficulty = 1;
            if (difficulty > 10) difficulty = 10;
        } else {
            // Novo cartão
            stability = 0;
            difficulty = 0;
        }
    }

    if (lastReviewed) {
        const diffTime = Math.abs(now.toDate() - lastReviewed.toDate());
        elapsedDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    // --- 2. Lógica FSRS ---
    
    // Se é a primeira vez (stability 0)
    if (stability === 0) {
        // w[0]..w[3] são as estabilidades iniciais para as notas 1..4
        stability = FSRS_PARAMS.w[grade - 1]; 
        difficulty = FSRS_PARAMS.w[4] - (grade - 3) * FSRS_PARAMS.w[5]; // D0
        
        // Garante limites de D
        difficulty = Math.max(1, Math.min(10, difficulty));
        
        repetitions = 1;
    } else {
        // Revisão subsequente
        repetitions += 1;
        
        // Retrievability (Retenção Atual)
        const retrievability = Math.pow(1 + 19/81 * elapsedDays / stability, -1);

        // Atualiza Dificuldade (D)
        const nextDifficulty = difficulty - FSRS_PARAMS.w[6] * (grade - 3);
        const meanReversion = FSRS_PARAMS.w[7] * (FSRS_PARAMS.w[4] - difficulty); // Reverte para a média
        difficulty = nextDifficulty + meanReversion;
        difficulty = Math.max(1, Math.min(10, difficulty)); // Clamp D (1-10)

        // Atualiza Estabilidade (S)
        if (grade === 1) { // Errei (Again)
            // Fórmula de esquecimento
            stability = FSRS_PARAMS.w[11] * Math.pow(difficulty, -FSRS_PARAMS.w[12]) * (Math.pow(stability + 1, FSRS_PARAMS.w[13]) - 1) * Math.exp(FSRS_PARAMS.w[14] * (1 - retrievability));
        } else { // Sucesso (Hard, Good, Easy)
            // Fórmula de sucesso
            const hardPenalty = (grade === 2) ? FSRS_PARAMS.w[15] : 1;
            const easyBonus = (grade === 4) ? FSRS_PARAMS.w[16] : 1;
            
            stability = stability * (1 + Math.exp(FSRS_PARAMS.w[8]) * (11 - difficulty) * Math.pow(stability, -FSRS_PARAMS.w[9]) * (Math.exp(FSRS_PARAMS.w[10] * (1 - retrievability)) - 1) *
                        hardPenalty * easyBonus);
        }
    }

    // --- 3. Calcular Próximo Intervalo ---
    // Intervalo = S * 9 * (1/R - 1) -> Para R=0.9 (90%), Intervalo = Stability
    // Usando a fórmula geral: I = S * ( (1/R_request)^(1/decay) - 1 ) / factor?
    // No FSRS padrão com request_retention 0.9, o próximo intervalo é aproximadamente igual à estabilidade.
    
    let nextInterval = Math.round(stability);
    
    // Se "Errei", o intervalo é forçado para curto (re-aprendizagem)
    if (grade === 1) {
        nextInterval = 1;
        repetitions = 0; // Reseta contagem de repetições em streak (opcional, estilo Anki)
    }

    // Aplica limites e Fuzz
    nextInterval = Math.max(1, Math.min(FSRS_PARAMS.maximum_interval, nextInterval));
    if (nextInterval > 4) {
        nextInterval = applyFuzz(nextInterval);
    }

    // Calcula data
    const date = new Date();
    date.setDate(date.getDate() + nextInterval);
    const nextReviewDate = Timestamp.fromDate(date);

    return { 
        stability, 
        difficulty, 
        interval: nextInterval, 
        repetitions, 
        nextReviewDate,
        easeFactor: 0 // Campo legado zerado para indicar uso do FSRS
    };
}


/**
 * Ordena strings alfanumericamente.
 */
function naturalSort(a, b) {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Formata um intervalo em dias para uma string legível.
 */
export function formatInterval(intervalInDays) {
    if (intervalInDays < 1) return "<1d";
    if (intervalInDays < 30) return `${Math.round(intervalInDays)}d`;
    if (intervalInDays < 365) return `${Math.round(intervalInDays / 30)}m`;
    return `${(intervalInDays / 365).toFixed(1)}a`;
}


export async function handleSrsFeedback(feedback) {
    setState('isUpdatingAnswer', true); 

    const question = state.filteredQuestions[state.currentQuestionIndex];
    const isCorrect = state.selectedAnswer === question.correctAnswer;
    
    // Mapeamento: App (0-3) -> FSRS (1-4)
    // App: 0=Again(Errei), 1=Hard, 2=Good, 3=Easy
    // FSRS: 1=Again, 2=Hard, 3=Good, 4=Easy
    const feedbackToGrade = { 'again': 1, 'hard': 2, 'good': 3, 'easy': 4 };
    let grade = feedbackToGrade[feedback];

    // Se a resposta estiver incorreta, forçamos 'Again' (1)
    if (!isCorrect) {
        grade = 1;
    }

    if (!state.sessionStats.some(s => s.questionId === question.id)) {
        state.sessionStats.push({
            questionId: question.id, isCorrect: isCorrect, materia: question.materia,
            assunto: question.assunto, userAnswer: state.selectedAnswer
        });
    }

    if (state.currentUser) {
        const currentReviewItem = state.userReviewItemsMap.get(question.id);
        
        // CALCULA O NOVO ESTADO USANDO FSRS
        const newReviewData = calculateFsrs(currentReviewItem, grade);
        
        const reviewDataToSave = { 
            ...newReviewData,
            questionId: question.id,
            lastReviewed: Timestamp.now()
        };

        await setSrsReviewItem(question.id, reviewDataToSave);
        state.userReviewItemsMap.set(question.id, reviewDataToSave);

        await saveUserAnswer(question.id, state.selectedAnswer, isCorrect);
        
        await updateQuestionHistory(question.id, isCorrect);
        await logPerformanceEntry(question, isCorrect);
    }

    renderAnsweredQuestion(isCorrect, state.selectedAnswer, false);
    updateStatsPageUI();
    renderReviewView();

    setState('isUpdatingAnswer', false); 
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

    const questionIdToDetails = new Map();
    state.allQuestions.forEach(q => {
        if (q.materia && q.assunto) { 
            questionIdToDetails.set(q.id, {
                materia: q.materia,
                assunto: q.assunto,
                subAssunto: q.subAssunto || null,
                subSubAssunto: q.subSubAssunto || null
            });
        }
    });

    const hierarchy = new Map();
    const now = new Date();
    now.setHours(23, 59, 59, 999); // Fim do dia para incluir tudo de hoje

    // Helper para criar um nó de estatísticas
    const createStatsNode = () => ({
        total: 0, errei: 0, dificil: 0, bom: 0, facil: 0, aRevisar: 0,
        questionIdsARevisar: [],
        children: new Map() 
    });

    // Helper para incrementar estatísticas (Adaptado para FSRS)
    const incrementStats = (node, item) => {
        node.total++;
        // No FSRS, usamos a Estabilidade (stability) ou Intervalo para categorizar visualmente
        const stability = item.stability || item.interval || 0;
        const repetitions = item.repetitions || 0;

        // Categorização visual baseada na maturidade do cartão
        if (repetitions === 0) node.errei++; // Novos/Reaprendendo
        else if (stability < 3) node.dificil++; // Baixa estabilidade
        else if (stability < 21) node.bom++; // Média estabilidade
        else node.facil++; // Alta estabilidade

        if (item.nextReviewDate) {
            const reviewDate = item.nextReviewDate.toDate();
            // Compara datas sem hora
            const reviewDateOnly = new Date(reviewDate.setHours(0,0,0,0));
            const todayOnly = new Date(new Date().setHours(0,0,0,0));
            
            if (reviewDateOnly <= todayOnly) {
                node.aRevisar++;
                node.questionIdsARevisar.push(item.questionId);
            }
        }
    };

    state.userReviewItemsMap.forEach(item => {
        const details = questionIdToDetails.get(item.questionId);
        if (!details) return; 

        const { materia, assunto, subAssunto, subSubAssunto } = details;

        // Nível 1: Matéria
        if (!hierarchy.has(materia)) hierarchy.set(materia, createStatsNode());
        const materiaNode = hierarchy.get(materia);
        incrementStats(materiaNode, item);

        // Nível 2: Assunto
        if (!materiaNode.children.has(assunto)) materiaNode.children.set(assunto, createStatsNode());
        const assuntoNode = materiaNode.children.get(assunto);
        incrementStats(assuntoNode, item);

        // Nível 3: SubAssunto 
        if (subAssunto) {
            if (!assuntoNode.children.has(subAssunto)) assuntoNode.children.set(subAssunto, createStatsNode());
            const subAssuntoNode = assuntoNode.children.get(subAssunto);
            incrementStats(subAssuntoNode, item);

            // Nível 4: SubSubAssunto 
            if (subSubAssunto) {
                if (!subAssuntoNode.children.has(subSubAssunto)) subAssuntoNode.children.set(subSubAssunto, createStatsNode());
                const subSubAssuntoNode = subAssuntoNode.children.get(subSubAssunto);
                incrementStats(subSubAssuntoNode, item);
            }
        }
    });
    
    setState('reviewStatsByMateria', hierarchy); 

    if (hierarchy.size === 0) {
        DOM.reviewTableContainer.innerHTML = `<p class="text-center text-gray-500 p-8">Nenhuma matéria com questões para revisar.</p>`;
        return;
    }

    let tableHtml = `
        <table class="min-w-full divide-y divide-gray-200 text-sm">
            <thead class="bg-gray-50">
                <tr>
                    <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <div class="pl-4">
                            <input type="checkbox" id="select-all-review-materias" class="rounded">
                        </div>
                    </th>
                    <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-black-500 tracking-wider">Matérias e Assuntos</th>
                    <th scope="col" class="px-4 py-3 text-center text-xs font-medium text-black-500 tracking-wider">Total</th>
                    <th scope="col" class="px-4 py-3 text-center text-xs font-medium text-black-500 tracking-wider" title="Novos / Aprendendo">Novos</th>
                    <th scope="col" class="px-4 py-3 text-center text-xs font-medium text-black-500 tracking-wider" title="Curto Prazo">Curto</th>
                    <th scope="col" class="px-4 py-3 text-center text-xs font-medium text-black-500 tracking-wider" title="Médio Prazo">Médio</th>
                    <th scope="col" class="px-4 py-3 text-center text-xs font-medium text-black-500 tracking-wider" title="Longo Prazo">Longo</th>
                    <th scope="col" class="px-4 py-3 text-center text-xs font-medium text-black-500 tracking-wider">A revisar</th>
                    <th scope="col" class="px-4 py-3 text-center text-xs font-medium text-black-500 tracking-wider">Concluído</th>
                </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">`;

    // Função recursiva para renderizar linhas
    const renderRow = (node, name, level, parentId = '', pathData = {}) => {
        const { total, errei, dificil, bom, facil, aRevisar } = node;
        const isDisabled = aRevisar === 0;
        const concluidoPercent = total > 0 ? Math.round(((total - aRevisar) / total) * 100) : 100;
        const progressColor = concluidoPercent >= 80 ? 'bg-green-500' : concluidoPercent >= 50 ? 'bg-yellow-500' : 'bg-red-500';
        const hasChildren = node.children.size > 0;
        const isHidden = level > 1 ? 'hidden' : '';
        const rowTypeClass = ['materia-row', 'assunto-row', 'subassunto-row', 'subsubassunto-row'][level - 1];
        const indentClass = `pl-${(level - 1) * 4}`; 
        const rowId = parentId ? `${parentId}__${name.replace(/[^a-zA-Z0-9]/g, '-')}` : `row__${name.replace(/[^a-zA-Z0-9]/g, '-')}`;
        
        const dataAttributes = Object.entries(pathData).map(([key, value]) => `data-${key}="${value}"`).join(' ');

        let html = `
            <tr class="${rowTypeClass} ${isHidden} ${isDisabled ? 'bg-gray-50 text-gray-400' : 'hover:bg-gray-50'}" data-id="${rowId}" data-parent-id="${parentId}" data-level="${level}">
                <td class="px-4 py-4 whitespace-nowrap">
                    <div class="flex items-center pl-4">
                        <input type="checkbox" class="review-checkbox rounded" ${dataAttributes} ${isDisabled ? 'disabled' : ''} data-level="${level}">
                    </div>
                </td>
                <td class="px-4 py-4 whitespace-nowrap font-medium ${isDisabled ? '' : 'text-gray-900'}">
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
                let childPathData = { ...pathData };
                if (level === 1) childPathData.assunto = childName;
                else if (level === 2) childPathData.subassunto = childName;
                else if (level === 3) childPathData.subsubassunto = childName;
                
                html += renderRow(childNode, childName, level + 1, rowId, childPathData);
            }
        }
        return html;
    };

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
    
    const selectedCheckboxes = DOM.reviewTableContainer.querySelectorAll('.review-checkbox:checked');
    if (selectedCheckboxes.length === 0) return;

    const questionsToReviewIds = new Set();
    const hierarchy = state.reviewStatsByMateria; 

    selectedCheckboxes.forEach(cb => {
        const { materia, assunto, subassunto, subsubassunto } = cb.dataset;

        let node;
        try {
            node = hierarchy.get(materia);
            if (assunto) node = node.children.get(assunto);
            if (subassunto) node = node.children.get(subassunto);
            if (subsubassunto) node = node.children.get(subsubassunto);
        } catch (e) {
            console.warn("Nó não encontrado na hierarquia de revisão:", cb.dataset);
            node = null;
        }

        if (node) {
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

    const uniqueQuestionIds = Array.from(questionsToReviewIds);

    if (uniqueQuestionIds.length > 0) {
        setState('isReviewSession', true);
        setState('filteredQuestions', state.allQuestions.filter(q => uniqueQuestionIds.includes(q.id)));
        setState('sessionStats', []);
        setState('currentQuestionIndex', 0);

        if(DOM.reviewTableContainer) DOM.reviewTableContainer.classList.add('hidden');
        if(DOM.startSelectedReviewBtn) DOM.startSelectedReviewBtn.classList.add('hidden');
        if(DOM.reviewQuestionContainer) DOM.reviewQuestionContainer.classList.remove('hidden');
        
        await displayQuestion();
    }
}
