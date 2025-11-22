import DOM from './dom-elements.js';

const subscribers = {};

let state = {
    currentUser: null,
    allQuestions: [],
    filteredQuestions: [],
    currentQuestionIndex: 0,
    selectedAnswer: null,
    sessionStats: [],
    performanceChart: null,
    homePerformanceChart: null,
    userFolders: [],
    userCadernos: [],
    currentFolderId: null,
    currentCadernoId: null,
    editingId: null,
    editingType: null,
    isAddingQuestionsMode: { active: false, cadernoId: null },
    createCadernoWithFilteredQuestions: false,
    deletingId: null,
    deletingType: null,
    isNavigatingBackFromAddMode: false,
    isReviewSession: false,
    isUpdatingAnswer: false, // Flag para controlar a re-renderização
    userReviewItems: [],
    reviewStatsByMateria: {},
    historicalSessions: [],
    userAnswers: new Map(),
    userCadernoState: new Map(),
    userReviewItemsMap: new Map(),
    userQuestionHistoryMap: new Map(), // <- ADICIONADO
    filterOptions: {
        materia: [],
        allAssuntos: []
    },
    savedFilters: [],
    selectedMateria: null,
    // ===== INÍCIO DA MODIFICAÇÃO (SOLICITAÇÃO DO USUÁRIO) =====
    // movingCadernoId removido, isMoveModeActive adicionado
    // movingCadernoId: null, // <-- REMOVIDO
    isMoveModeActive: false, // <-- ADICIONADO
    itemToPreselectOnMove: null, // <-- ADICIONADO: Armazena o item a ser pré-selecionado
    // ===== FIM DA MODIFICAÇÃO =====
    unsubscribes: []
};

export function subscribe(key, callback) {
    if (!subscribers[key]) {
        subscribers[key] = [];
    }
    subscribers[key].push(callback);
}

export function notify(key, ...args) {
    if (subscribers[key]) {
        subscribers[key].forEach(callback => callback(...args));
    }
}

export function setState(key, value) {
    if (key in state) {
        state[key] = value;
        notify(key, value);
    } else {
        console.warn(`Tentativa de definir uma chave de estado inexistente: ${key}`);
    }
}

export function getState() {
    return state;
}

export function getActiveContainer() {
    // ===== INÍCIO DA MODIFICAÇÃO (SOLICITAÇÃO DO USUÁRIO) =====
    // Prioriza a sessão de revisão, depois cadernos, depois vade mecum
    if (state.isReviewSession) {
        return DOM.reviewQuestionContainer;
    } else if (state.currentCadernoId) {
    // ===== FIM DA MODIFICAÇÃO =====
        return DOM.savedCadernosListContainer;
    } else {
        return DOM.vadeMecumContentArea;
    }
}

export function addUnsubscribe(unsubscribe) {
    state.unsubscribes.push(unsubscribe);
}

export function clearUnsubscribes() {
    state.unsubscribes.forEach(unsub => unsub());
    state.unsubscribes = [];
}

export function resetStateOnLogout() {
    clearUnsubscribes();
    state = {
        ...state, // keep some parts like charts if needed
        currentUser: null,
        userFolders: [],
        userCadernos: [],
        userReviewItems: [],
        historicalSessions: [],
        userAnswers: new Map(),
        userCadernoState: new Map(),
        userReviewItemsMap: new Map(),
        userQuestionHistoryMap: new Map(), // <- ADICIONADO
        savedFilters: [],
        sessionStats: [],
        // ===== INÍCIO DA MODIFICAÇÃO (SOLICITAÇÃO DO USUÁRIO) =====
        isMoveModeActive: false, // Reseta o modo de mover ao deslogar
        itemToPreselectOnMove: null, // <-- ADICIONADO
        // ===== FIM DA MODIFICAÇÃO =====
        isReviewSession: false, // <-- ADICIONADO: Reseta a sessão de revisão
    };
}


export function clearSessionStats() {
    state.sessionStats = [];
}

export { state };
