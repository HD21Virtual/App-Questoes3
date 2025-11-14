import { state, setState, getActiveContainer, subscribe } from '../state.js';
import { handleSrsFeedback, formatInterval } from './srs.js';
import { updateStatsPageUI } from './stats.js';
import { saveUserAnswer, updateQuestionHistory, saveCadernoState } from '../services/firestore.js';
import { removeQuestionFromCaderno } from './caderno-actions.js';
import DOM from '../dom-elements.js';

export async function navigateQuestion(direction) {
    if (direction === 'prev' && state.currentQuestionIndex > 0) {
        setState('currentQuestionIndex', state.currentQuestionIndex - 1);
    } else if (direction === 'next' && state.currentQuestionIndex < state.filteredQuestions.length - 1) {
        setState('currentQuestionIndex', state.currentQuestionIndex + 1);
    }

    if (state.currentCadernoId) {
        await saveCadernoState(state.currentCadernoId, state.currentQuestionIndex);
    }
}

export function handleOptionSelect(event) {
    const target = event.target.closest('.option-item');
    if (!target || target.classList.contains('discarded') || target.classList.contains('is-answered')) {
        return;
    }
    const activeContainer = getActiveContainer();
    activeContainer.querySelectorAll('.option-item').forEach(item => item.classList.remove('selected'));
    target.classList.add('selected');
    setState('selectedAnswer', target.getAttribute('data-option'));
    const submitBtn = activeContainer.querySelector('#submit-btn');
    if (submitBtn) submitBtn.disabled = false;
}


export async function checkAnswer() {
    const question = state.filteredQuestions[state.currentQuestionIndex];
    if (!state.selectedAnswer) return;
    const isCorrect = state.selectedAnswer === question.correctAnswer;

    const isFreshAnswer = true;
    renderAnsweredQuestion(isCorrect, state.selectedAnswer, isFreshAnswer);

    if (!state.sessionStats.some(s => s.questionId === question.id)) {
        state.sessionStats.push({
            questionId: question.id, isCorrect: isCorrect, materia: question.materia,
            assunto: question.assunto, userAnswer: state.selectedAnswer
        });
    }

    updateStatsPageUI();
}

export function handleDiscardOption(event) {
    event.stopPropagation();
    const targetItem = event.currentTarget.closest('.option-item');
    if (targetItem && !targetItem.closest('.is-answered')) {
        targetItem.classList.toggle('discarded');
        if (targetItem.classList.contains('selected')) {
            targetItem.classList.remove('selected');
            setState('selectedAnswer', null);
            const activeContainer = getActiveContainer();
            const submitBtn = activeContainer.querySelector('#submit-btn');
            if(submitBtn) submitBtn.disabled = true;
        }
    }
}

function renderUnansweredQuestion() {
    const activeContainer = getActiveContainer();
    const questionsContainer = activeContainer.querySelector('#questions-container');
    if(!questionsContainer) return;

    const question = state.filteredQuestions[state.currentQuestionIndex];
    const options = Array.isArray(question.options) ? question.options : [];

    const optionsHtml = options.map((option, index) => {
        let letterContent = '';
        if (question.tipo === 'Multipla Escolha' || question.tipo === 'C/E') {
            const letter = question.tipo === 'C/E' ? option.charAt(0) : String.fromCharCode(65 + index);
            letterContent = `<span class="option-letter text-gray-700 font-medium">${letter}</span>`;
        }

        const scissorIconSVG = `
            <svg class="h-5 w-5 text-blue-600 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
               <path stroke-linecap="round" stroke-linejoin="round" d="M3.5 6.5a2 2 0 114 0 2 2 0 01-4 0zM3.5 17.5a2 2 0 114 0 2 2 0 01-4 0z"></path>
               <path stroke-linecap="round" stroke-linejoin="round" d="M6 8.5L18 15.5"></path>
               <path stroke-linecap="round" stroke-linejoin="round" d="M6 15.5L18 8.5"></path>
            </svg>`;

        return `
            <div data-option="${option}" class="option-item group flex items-center p-2 rounded-lg cursor-pointer transition duration-200">
               <div class="action-icon-container w-8 h-8 flex-shrink-0 flex items-center justify-center mr-1">
                    <div class="discard-btn opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-200 hover:bg-blue-100 rounded-full p-1.5">
                        ${scissorIconSVG}
                    </div>
                </div>
               <div class="option-circle flex-shrink-0 w-8 h-8 border-2 border-gray-300 rounded-full flex items-center justify-center mr-4 transition-all duration-200">
                   ${letterContent}
               </div>
               <span class="option-text text-gray-800">${option}</span>
            </div>
        `;
    }).join('');

    questionsContainer.innerHTML = `
        <p class="text-gray-800 text-lg mb-6 leading-relaxed">${question.text}</p>
        <div id="options-container" class="space-y-2">
            ${optionsHtml}
        </div>
        <div id="card-footer" class="mt-6 flex items-center">
             </div>
        <div id="commentary-container" class="hidden mt-6"></div>
    `;

    questionsContainer.querySelectorAll('.discard-btn').forEach(btn => {
        btn.addEventListener('click', handleDiscardOption);
    });
}

export function renderAnsweredQuestion(isCorrect, userAnswer, isFreshAnswer = false) {
    const activeContainer = getActiveContainer();
    if (!activeContainer) return;

    const question = state.filteredQuestions[state.currentQuestionIndex];

    activeContainer.querySelectorAll('.option-item').forEach(item => {
        item.classList.add('is-answered');
        item.style.cursor = 'default';
        const option = item.dataset.option;

        item.classList.remove('correct-answer', 'incorrect-answer', 'selected');
        const iconContainer = item.querySelector('.action-icon-container');
        if(iconContainer) {
            const discardBtn = iconContainer.querySelector('.discard-btn');
            if (discardBtn) discardBtn.remove();
        }

        if (option === question.correctAnswer) {
            item.classList.add('correct-answer');
            if(iconContainer) {
                iconContainer.innerHTML = `<i class="fas fa-check text-green-500 text-xl"></i>`;
            }
        }

        if (option === userAnswer && !isCorrect) {
            item.classList.add('incorrect-answer');
            if(iconContainer) {
                iconContainer.innerHTML = `<i class="fas fa-times text-red-500 text-xl"></i>`;
            }
        }
        item.classList.remove('hover:border-blue-300');
    });

    const footer = activeContainer.querySelector('#card-footer');
    if (footer) {
        footer.innerHTML = '';
        const resultClass = isCorrect ? 'text-green-600' : 'text-red-600';
        const resultText = isCorrect ? 'Correta!' : 'Incorreta!';

        const feedbackDiv = document.createElement('div');
        feedbackDiv.className = 'flex items-center space-x-4 w-full';
        feedbackDiv.innerHTML = `<span class="font-bold text-lg ${resultClass}">${resultText}</span>`;

        if (isFreshAnswer) {
            const reviewItem = state.userReviewItemsMap.get(question.id) || {};
            const { interval: lastInterval = 0, easeFactor = 2.5, repetitions = 0 } = reviewItem;

            let nextIntervalHard, nextIntervalGood, nextIntervalEasy;

            if (repetitions === 0) {
                nextIntervalGood = 1;
            } else if (repetitions === 1) {
                nextIntervalGood = 6;
            } else {
                nextIntervalGood = Math.ceil(lastInterval * easeFactor);
            }

            nextIntervalHard = Math.ceil(Math.max(lastInterval, 1) * 1.2);
            nextIntervalEasy = Math.ceil(nextIntervalGood * 1.3);

            nextIntervalHard = Math.max(1, nextIntervalHard);
            nextIntervalGood = Math.max(1, nextIntervalGood);
            nextIntervalEasy = Math.max(1, nextIntervalEasy);

            if(nextIntervalGood <= nextIntervalHard) {
                nextIntervalGood = nextIntervalHard + 1;
            }
            if(nextIntervalEasy <= nextIntervalGood) {
                nextIntervalEasy = nextIntervalGood + 1;
            }

            const srsButtonsHTML = `
                <div class="mt-4 grid grid-cols-4 gap-2 w-full text-center text-sm">
                    <button class="srs-feedback-btn srs-btn-again" data-feedback="again">Errei<br><span class="font-normal">(1d)</span></button>
                    <button class="srs-feedback-btn srs-btn-hard" data-feedback="hard">Difícil<br><span class="font-normal">(${formatInterval(nextIntervalHard)})</span></button>
                    <button class="srs-feedback-btn srs-btn-good" data-feedback="good">Bom<br><span class="font-normal">(${formatInterval(nextIntervalGood)})</span></button>
                    <button class="srs-feedback-btn srs-btn-easy" data-feedback="easy">Fácil<br><span class="font-normal">(${formatInterval(nextIntervalEasy)})</span></button>
                </div>
            `;
            footer.innerHTML = `<div class="w-full">${feedbackDiv.innerHTML} ${srsButtonsHTML}</div>`;
        } else {
             feedbackDiv.innerHTML += `<button class="view-resolution-btn text-sm text-blue-600 hover:underline">Ver resolução</button>`;
             footer.appendChild(feedbackDiv);
        }
    }

    const viewResolutionBtn = activeContainer.querySelector('.view-resolution-btn');
    const commentaryContainer = activeContainer.querySelector('#commentary-container');

    if (viewResolutionBtn && commentaryContainer) {
        viewResolutionBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const isHidden = commentaryContainer.classList.contains('hidden');
            if (isHidden) {
                const commentaryText = question.explanation || 'Nenhum comentário disponível para esta questão.';
                const boxColorClass = isCorrect ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800';
                commentaryContainer.innerHTML = `
                    <div class="p-4 rounded-lg ${boxColorClass}">
                        <p class="leading-relaxed">
                            <strong class="font-bold">Gabarito: ${question.correctAnswer}</strong>
                            <br>
                            ${commentaryText}
                        </p>
                    </div>
                `;
                commentaryContainer.classList.remove('hidden');
                viewResolutionBtn.textContent = 'Ocultar resolução';
            } else {
                commentaryContainer.classList.add('hidden');
                commentaryContainer.innerHTML = '';
                viewResolutionBtn.textContent = 'Ver resolução';
            }
        });
    }
}

export async function displayQuestion() {
    const activeContainer = getActiveContainer();
    if (!activeContainer) return;

    const questionsContainer = activeContainer.querySelector('#questions-container');
    const questionInfoContainer = activeContainer.querySelector('#question-info-container');
    const questionToolbar = activeContainer.querySelector('#question-toolbar');
    const questionCounterTop = activeContainer.querySelector('#question-counter-top');
    const navigationControls = activeContainer.querySelector('#navigation-controls');

    if (!questionsContainer || !questionInfoContainer || !questionToolbar || !questionCounterTop || !navigationControls) return;

    questionsContainer.innerHTML = '';
    questionInfoContainer.classList.add('hidden');
    questionToolbar.classList.add('hidden');
    questionCounterTop.classList.add('hidden');
    navigationControls.classList.add('hidden');
    setState('selectedAnswer', null);

    if (!state.currentUser) {
        questionsContainer.innerHTML = `<div class="text-center p-8"><h3 class="text-xl font-bold">Bem-vindo!</h3><p class="text-gray-600 mt-2">Por favor, <button id="login-from-empty" class="text-blue-600 underline">faça login</button> para começar a resolver questões.</p></div>`;
        return;
    }

    if (state.filteredQuestions.length === 0) {
        questionsContainer.innerHTML = `<div class="text-center p-8 bg-gray-50 rounded-lg">
            <h3 class="text-xl font-bold text-gray-700">Nenhuma questão encontrada</h3>
            <p class="text-gray-500 mt-2">Tente ajustar seus filtros ou clique em "Limpar filtro" para ver todas as questões.</p>
        </div>`;
        return;
    }

    const question = state.filteredQuestions[state.currentQuestionIndex];
    const userAnswerData = state.userAnswers.get(question.id);

    questionCounterTop.innerHTML = `Questão ${state.currentQuestionIndex + 1} de ${state.filteredQuestions.length}`;

    let hierarchyHtml = `
        <div class="flex space-x-1">
          <span class="text-gray-700">Matéria:</span><a href="#" class="text-blue-600 hover:underline">${question.materia}</a>
        </div>
    `;

    const parts = [];
    if (question.assunto) {
        parts.push(`<a href="#" class="text-blue-600 hover:underline">${question.assunto}</a>`);
    }
    if (question.subAssunto) {
        parts.push(`<a href="#" class="text-blue-600 hover:underline">${question.subAssunto}</a>`);
    }
    if (question.subSubAssunto) {
        parts.push(`<a href="#" class="text-blue-600 hover:underline">${question.subSubAssunto}</a>`);
    }

    if (parts.length > 0) {
         hierarchyHtml += `
            <div class="flex items-start space-x-1">
              <span class="text-gray-700 flex-shrink-0">Assunto:</span>
              <span class="leading-relaxed"> ${parts.join('<span class="text-gray-500 mx-1">&gt;</span>')} </span>
            </div>
        `;
    }

    questionInfoContainer.innerHTML = hierarchyHtml;

    let toolbarHTML = `
        <button class="toolbar-btn flex items-center hover:text-blue-600 transition-colors" title="Gabarito Comentado"><i class="fas fa-graduation-cap mr-2"></i><span class="toolbar-text">Gabarito Comentado</span></button>
        <button class="toolbar-btn flex items-center hover:text-blue-600 transition-colors" title="Comentários"><i class="fas fa-comment-dots mr-2"></i><span class="toolbar-text">Comentários</span></button>
        <button class="toolbar-btn flex items-center hover:text-blue-600 transition-colors" title="Criar Anotações"><i class="fas fa-edit mr-2"></i><span class="toolbar-text">Criar Anotações</span></button>
        <button class="toolbar-btn flex items-center hover:text-blue-600 transition-colors" title="Cadernos"><i class="fas fa-book mr-2"></i><span class="toolbar-text">Cadernos</span></button>
        <button class="toolbar-btn flex items-center hover:text-blue-600 transition-colors" title="Desempenho"><i class="fas fa-chart-bar mr-2"></i><span class="toolbar-text">Desempenho</span></button>
        <button class="toolbar-btn flex items-center hover:text-blue-600 transition-colors" title="Notificar Erro"><i class="fas fa-flag mr-2"></i><span class="toolbar-text">Notificar Erro</span></button>
    `;

    if(state.currentCadernoId) {
        toolbarHTML += `
            <button class="remove-question-btn toolbar-btn text-red-500 hover:text-red-700 transition-colors text-sm flex items-center" data-question-id="${question.id}" title="Remover do caderno">
                <i class="fas fa-trash-alt mr-2"></i><span class="toolbar-text">Remover</span>
            </button>
        `;
    }
    questionToolbar.innerHTML = toolbarHTML;
    questionToolbar.className = 'flex items-center flex-wrap gap-x-4 gap-y-2 text-gray-600';


    questionCounterTop.classList.remove('hidden');
    questionInfoContainer.classList.remove('hidden');
    questionToolbar.classList.remove('hidden');
    navigationControls.classList.remove('hidden');

    renderUnansweredQuestion();

    const footer = activeContainer.querySelector('#card-footer');

    if (userAnswerData && state.currentCadernoId && !state.isReviewSession) {
        renderAnsweredQuestion(userAnswerData.isCorrect, userAnswerData.userAnswer, false);
    } else if (footer) {
        footer.innerHTML = `<button id="submit-btn" class="bg-blue-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-blue-700 transition-colors duration-300 disabled:bg-blue-400 disabled:cursor-not-allowed" disabled>Resolver</button>`;
    }

    await updateNavigation();
}


async function updateNavigation() {
    const activeContainer = getActiveContainer();
    if (!activeContainer) return;

    const prevBtn = activeContainer.querySelector('#prev-question-btn');
    const nextBtn = activeContainer.querySelector('#next-question-btn');

    if (prevBtn && nextBtn) {
        prevBtn.disabled = state.currentQuestionIndex === 0;
        nextBtn.disabled = state.currentQuestionIndex >= state.filteredQuestions.length - 1;
    }
}


export function renderQuestionListForAdding(questions, existingQuestionIds) {
    const questionsContainer = getActiveContainer().querySelector('#questions-container');
    if(!questionsContainer) return;

    if (questions.length === 0) {
        questionsContainer.innerHTML = `<p class="text-center text-gray-500 p-4">Nenhuma questão encontrada com estes filtros.</p>`;
        return;
    }

    questionsContainer.innerHTML = questions.map(q => {
        const alreadyIn = existingQuestionIds.includes(q.id);
        return `
            <div class="p-4 border-b border-gray-200 ${alreadyIn ? 'already-in-caderno' : ''}">
                <p class="text-gray-800">${q.text}</p>
                ${alreadyIn ? '<span class="text-sm font-medium text-blue-600 mt-2 block">Esta questão já está no caderno.</span>' : ''}
            </div>
        `;
    }).join('');
}

export function setupQuestionViewerEventListeners() {
    DOM.vadeMecumView.addEventListener('click', async (event) => {
        const target = event.target;

        if (target.closest('#prev-question-btn')) {
            await navigateQuestion('prev');
        } else if (target.closest('#next-question-btn')) {
            await navigateQuestion('next');
        } else if (target.closest('.option-item') && !target.closest('.discard-btn')) {
            handleOptionSelect(event);
        } else if (target.closest('#submit-btn')) {
            await checkAnswer();
        } else if (target.closest('.discard-btn')) {
            handleDiscardOption(event);
        } else if (target.closest('.srs-feedback-btn')) {
            await handleSrsFeedback(target.closest('.srs-feedback-btn').dataset.feedback);
        } else if (target.closest('.remove-question-btn')) {
            removeQuestionFromCaderno(target.closest('.remove-question-btn').dataset.questionId);
        }
    });
}

subscribe('filteredQuestions', displayQuestion);
subscribe('currentQuestionIndex', displayQuestion);
