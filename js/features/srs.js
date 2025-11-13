import { Timestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { state, setState } from '../state.js';
import DOM from '../dom-elements.js';
import { displayQuestion, renderAnsweredQuestion } from './question-viewer.js';
import { updateStatsPageUI } from './stats.js';
import { setSrsReviewItem, saveUserAnswer, updateQuestionHistory, logPerformanceEntry } from '../services/firestore.js';
import { renderQuestionSolver } from "../ui/question-solver-ui.js";

const MIN_EASE_FACTOR = 1.3;
const INITIAL_EASE_FACTOR = 2.5;

function naturalSort(a, b) {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function calculateSm2(reviewItem, quality) {
    let { easeFactor = INITIAL_EASE_FACTOR, interval = 0, repetitions = 0 } = reviewItem || {};

    if (quality === 0) {
        repetitions = 0;
        interval = 1;
        easeFactor = Math.max(MIN_EASE_FACTOR, easeFactor - 0.20);
    } else {
        repetitions += 1;
        if (repetitions === 1) {
            if (quality === 1) { interval = 2; }
            else if (quality === 2) { interval = 3; }
            else if (quality === 3) { interval = 4; }
            else { interval = 1; }
        } else if (repetitions === 2) {
            interval = 6;
        } else {
            interval = Math.ceil(interval * easeFactor);
            if (quality === 1) { interval = Math.ceil(interval * 0.9); }
            else if (quality === 3) { interval = Math.ceil(interval * 1.3); }
        }
    }

    if (quality > 0) {
        if (quality === 1) { easeFactor = Math.max(MIN_EASE_FACTOR, easeFactor - 0.15); }
        else if (quality === 3) { easeFactor += 0.15; }
    }

    interval = Math.max(1, interval);

    const date = new Date();
    date.setDate(date.getDate() + interval);
    const nextReviewDate = Timestamp.fromDate(date);

    return { easeFactor, interval, repetitions, nextReviewDate };
}

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

    const qualityMap = { 'again': 0, 'hard': 1, 'good': 2, 'easy': 3 };
    let quality = qualityMap[feedback];

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
    now.setHours(0, 0, 0, 0);

    const createStatsNode = () => ({
        total: 0, errei: 0, dificil: 0, bom: 0, facil: 0, aRevisar: 0,
        questionIdsARevisar: [],
        children: new Map()
    });

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
        if (!details) return;

        const { materia, assunto, subAssunto, subSubAssunto } = details;

        if (!hierarchy.has(materia)) {
            hierarchy.set(materia, createStatsNode());
        }
        const materiaNode = hierarchy.get(materia);
        incrementStats(materiaNode, item);

        if (!materiaNode.children.has(assunto)) {
            materiaNode.children.set(assunto, createStatsNode());
        }
        const assuntoNode = materiaNode.children.get(assunto);
        incrementStats(assuntoNode, item);

        if (subAssunto) {
            if (!assuntoNode.children.has(subAssunto)) {
                assuntoNode.children.set(subAssunto, createStatsNode());
            }
            const subAssuntoNode = assuntoNode.children.get(subAssunto);
            incrementStats(subAssuntoNode, item);

            if (subSubAssunto) {
                if (!subAssuntoNode.children.has(subSubAssunto)) {
                    subAssuntoNode.children.set(subSubAssunto, createStatsNode());
                }
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
                    <th scope="col" class="px-4 py-3 text-center text-xs font-medium text-black-500 tracking-wider" title="Questões marcadas como 'Errei'">Errei</th>
                    <th scope="col" class="px-4 py-3 text-center text-xs font-medium text-black-500 tracking-wider" title="Questões marcadas como 'Difícil'">Difícil</th>
                    <th scope="col" class="px-4 py-3 text-center text-xs font-medium text-black-500 tracking-wider" title="Questões marcadas como 'Bom'">Bom</th>
                    <th scope="col" class="px-4 py-3 text-center text-xs font-medium text-black-500 tracking-wider" title="Questões marcadas como 'Fácil'">Fácil</th>
                    <th scope="col" class="px-4 py-3 text-center text-xs font-medium text-black-500 tracking-wider">A revisar</th>
                    <th scope="col" class="px-4 py-3 text-center text-xs font-medium text-black-500 tracking-wider">Concluído</th>
                </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">`;

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
        if(DOM.reviewQuestionContainer) {
            DOM.reviewQuestionContainer.classList.remove('hidden');
            renderQuestionSolver(DOM.reviewQuestionContainer);
        }

        await displayQuestion();
    }
}
