import DOM from './dom-elements.js';

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
    unsubscribes: []
};

export function setState(key, value) {
    if (key in state) {
        state[key] = value;
    } else {
        console.warn(`Tentativa de definir uma chave de estado inexistente: ${key}`);
    }
}

export function getState() {
    return state;
}

export function getActiveContainer() {
    return state.currentCadernoId ? DOM.savedCadernosListContainer : DOM.vadeMecumContentArea;
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
    };
}


export function clearSessionStats() {
    state.sessionStats = [];
}

export { state };
