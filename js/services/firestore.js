import { collection, getDocs, query, orderBy, onSnapshot, getDoc, doc, updateDoc, arrayRemove, setDoc, addDoc, serverTimestamp, where, writeBatch, deleteDoc, arrayUnion, increment, Timestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { db } from '../firebase-config.js';
// --- MODIFICAÇÃO: Removido 'clearSessionStats' da importação ---
import { state, setState, addUnsubscribe } from '../state.js';
import { renderReviewView } from '../features/srs.js';
import { displayQuestion } from "../features/question-viewer.js";
import { updateSavedFiltersList } from "../ui/modal.js";
import DOM from "../dom-elements.js";

/**
 * Ordena strings alfanumericamente (ex: "2.10" vemDepois de "2.9").
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function naturalSort(a, b) {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

export async function fetchAllQuestions() {
    try {
        const querySnapshot = await getDocs(collection(db, "questions"));
        const questions = [];

        // --- MODIFICAÇÃO: Hierarquia de 4 níveis ---
        // Estrutura: Map<Materia, Map<Assunto, Map<SubAssunto, Set<SubSubAssunto>>>>
        const hierarchy = new Map();

        querySnapshot.forEach((doc) => {
            const question = { id: doc.id, ...doc.data() };
            questions.push(question);

            // --- MODIFICAÇÃO: Adicionado subSubAssunto ---
            const { materia, assunto, subAssunto, subSubAssunto } = question;

            if (materia && assunto) {
                // Nível 1: Matéria
                if (!hierarchy.has(materia)) {
                    hierarchy.set(materia, new Map());
                }
                const assuntosMap = hierarchy.get(materia);

                // Nível 2: Assunto
                if (!assuntosMap.has(assunto)) {
                    assuntosMap.set(assunto, new Map());
                }

                // Se não houver subAssunto, não há mais nada a adicionar na hierarquia.
                if (!subAssunto) {
                    return; // <- MUDANÇA: Para de processar
                }

                // Nível 3: SubAssunto (sabemos que subAssunto existe)
                const subAssuntosMap = assuntosMap.get(assunto);
                if (!subAssuntosMap.has(subAssunto)) {
                    subAssuntosMap.set(subAssunto, new Set());
                }

                // Se não houver subSubAssunto, não há mais nada a adicionar.
                if (!subSubAssunto) {
                    return; // <- MUDANÇA: Para de processar
                }

                // Nível 4: SubSubAssunto (sabemos que subSubAssunto existe)
                subAssuntosMap.get(subAssunto).add(subSubAssunto);
            }
        });

        setState('allQuestions', questions);

        // --- MODIFICAÇÃO: Construir filterOptions com 4 níveis ---
        const newFilterOptions = { materia: [] };

        const sortedMaterias = Array.from(hierarchy.keys()).sort();

        for (const materiaName of sortedMaterias) {
            const materiaData = { name: materiaName, assuntos: [] }; // Nível 1
            const assuntosMap = hierarchy.get(materiaName);
            const sortedAssuntos = Array.from(assuntosMap.keys()).sort(naturalSort); // <- MUDANÇA: Ordenação natural

            for (const assuntoName of sortedAssuntos) {
                const subAssuntosMap = assuntosMap.get(assuntoName);
                const sortedSubAssuntos = Array.from(subAssuntosMap.keys()).sort(naturalSort); // <- MUDANÇA: Ordenação natural

                const assuntoData = { name: assuntoName, subAssuntos: [] }; // Nível 2

                for (const subAssuntoName of sortedSubAssuntos) {
                    const subSubAssuntosSet = subAssuntosMap.get(subAssuntoName);
                    const sortedSubSubAssuntos = Array.from(subSubAssuntosSet).sort(naturalSort); // <- MUDANÇA: Ordenação natural

                    // Nível 3 (objeto) e Nível 4 (array de strings)
                    assuntoData.subAssuntos.push({
                        name: subAssuntoName,
                        subSubAssuntos: sortedSubSubAssuntos
                    });
                }
                materiaData.assuntos.push(assuntoData);
            }
            newFilterOptions.materia.push(materiaData);
        }
        // --- FIM DA MODIFICAÇÃO ---

        setState('filterOptions', newFilterOptions);

    } catch (error) {
        console.error("Erro ao buscar questões: ", error);
    }
}

export function setupAllListeners(userId) {
    // Queries must be declared before they are used in onSnapshot
    const cadernosQuery = query(collection(db, 'users', userId, 'cadernos'), orderBy('name'));
    const foldersQuery = query(collection(db, 'users', userId, 'folders'), orderBy('name'));
    const filtrosQuery = query(collection(db, 'users', userId, 'filtros'));
    const sessionsQuery = query(collection(db, 'users', userId, 'sessions'), orderBy('createdAt', 'desc'));
    const reviewQuery = query(collection(db, 'users', userId, 'reviewItems'));
    const answersQuery = query(collection(db, 'users', userId, 'userQuestionState'));
    const stateQuery = query(collection(db, 'users', userId, 'cadernoState'));
    // ADICIONADO: Query para o histórico total de questões
    const historyQuery = query(collection(db, 'users', userId, 'questionHistory'));

    const unsubCadernos = onSnapshot(cadernosQuery, (snapshot) => {
        const userCadernos = [];
        snapshot.forEach(doc => userCadernos.push({ id: doc.id, ...doc.data() }));
        setState('userCadernos', userCadernos);
    });
    addUnsubscribe(unsubCadernos);

    const unsubFolders = onSnapshot(foldersQuery, (snapshot) => {
        const userFolders = [];
        snapshot.forEach(doc => userFolders.push({ id: doc.id, ...doc.data() }));
        setState('userFolders', userFolders);
    });
    addUnsubscribe(unsubFolders);

    const unsubFiltros = onSnapshot(filtrosQuery, (snapshot) => {
        const savedFilters = [];
        snapshot.forEach(doc => savedFilters.push({ id: doc.id, ...doc.data() }));
        setState('savedFilters', savedFilters);
        updateSavedFiltersList();
    });
    addUnsubscribe(unsubFiltros);

    const unsubSessions = onSnapshot(sessionsQuery, (snapshot) => {
        const historicalSessions = [];
        snapshot.forEach(doc => historicalSessions.push(doc.data()));
        setState('historicalSessions', historicalSessions);
    });
    addUnsubscribe(unsubSessions);

    const unsubReviewItems = onSnapshot(reviewQuery, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === "added" || change.type === "modified") {
                state.userReviewItemsMap.set(change.doc.id, { id: change.doc.id, ...change.doc.data() });
            }
            if (change.type === "removed") {
                state.userReviewItemsMap.delete(change.doc.id);
            }
        });
        if (DOM.revisaoView && !DOM.revisaoView.classList.contains('hidden')) {
            renderReviewView();
        }
    });
    addUnsubscribe(unsubReviewItems);

    const unsubAnswers = onSnapshot(answersQuery, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            const docData = change.doc.data();
            if (change.type === "added" || change.type === "modified") {
                state.userAnswers.set(change.doc.id, { userAnswer: docData.userAnswer, isCorrect: docData.isCorrect });
            }
            if (change.type === "removed") {
                state.userAnswers.delete(change.doc.id);
            }
        });

        // BUG FIX: Suppress re-render if an answer update is already in progress.
        if (state.isUpdatingAnswer) {
            return;
        }

        if (state.currentCadernoId || (state.vadeMecumView && !state.vadeMecumView.classList.contains('hidden'))) {
            displayQuestion();
        }
    });
    addUnsubscribe(unsubAnswers);

    const unsubCadernoState = onSnapshot(stateQuery, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === "added" || change.type === "modified") {
                state.userCadernoState.set(change.doc.id, change.doc.data());
            }
            if (change.type === "removed") {
                state.userCadernoState.delete(change.doc.id);
            }
        });
    });
    addUnsubscribe(unsubCadernoState);

    // ADICIONADO: Listener for questionHistory
    const unsubHistory = onSnapshot(historyQuery, (snapshot) => {
        const newMap = new Map(state.userQuestionHistoryMap);
        snapshot.docChanges().forEach((change) => {
            if (change.type === "added" || change.type === "modified") {
                newMap.set(change.doc.id, { id: change.doc.id, ...change.doc.data() });
            }
            if (change.type === "removed") {
                newMap.delete(change.doc.id);
            }
        });
        setState('userQuestionHistoryMap', newMap);
    });
    addUnsubscribe(unsubHistory);
}

export async function removeQuestionIdFromCaderno(cadernoId, questionId) {
    if (!state.currentUser) return;
    const cadernoRef = doc(db, 'users', state.currentUser.uid, 'cadernos', cadernoId);
    await updateDoc(cadernoRef, {
        questionIds: arrayRemove(questionId)
    });
}

export async function saveUserAnswer(questionId, userAnswer, isCorrect) {
    if (!state.currentUser) return;
    const answerRef = doc(db, 'users', state.currentUser.uid, 'userQuestionState', questionId);
    try {
        await setDoc(answerRef, { userAnswer, isCorrect });
    } catch (error) {
        console.error("Error saving user answer:", error);
    }
}

/**
 * Atualiza o histórico vitalício de uma questão.
 * @param {string} questionId
 * @param {boolean} isCorrect
 */
export async function updateQuestionHistory(questionId, isCorrect) {
    if (!state.currentUser) return;
    const historyRef = doc(db, 'users', state.currentUser.uid, 'questionHistory', questionId);
    const fieldToUpdate = isCorrect ? 'correct' : 'incorrect';

    try {
        await setDoc(historyRef, {
            [fieldToUpdate]: increment(1),
            total: increment(1)
        }, { merge: true });
    } catch (error) {
        console.error("Error updating question history:", error);
    }
}

// ===== INÍCIO DA NOVA FUNÇÃO =====
/**
 * Registra uma entrada de desempenho individual no log diário.
 * @param {object} question - O objeto completo da questão.
 * @param {boolean} isCorrect - Se a resposta foi correta.
 */
export async function logPerformanceEntry(question, isCorrect) {
    if (!state.currentUser || !question) return;

    const logEntry = {
        createdAt: serverTimestamp(),
        questionId: question.id,
        isCorrect: isCorrect,
        materia: question.materia || null,
        assunto: question.assunto || null,
        subAssunto: question.subAssunto || null,
        subSubAssunto: question.subSubAssunto || null
    };

    try {
        const logCollection = collection(db, 'users', state.currentUser.uid, 'performanceLog');
        await addDoc(logCollection, logEntry);
    } catch (error) {
        console.error("Error logging performance entry:", error);
    }
}
// ===== FIM DA NOVA FUNÇÃO =====


export async function setSrsReviewItem(questionId, reviewData) {
    if (!state.currentUser) return;
    const reviewRef = doc(db, 'users', state.currentUser.uid, 'reviewItems', questionId);
    await setDoc(reviewRef, reviewData, { merge: true });
}

export async function createCaderno(name, questionIds, folderId) {
    const caderno = {
        name,
        questionIds,
        folderId: folderId || null,
        createdAt: serverTimestamp()
    };
    const cadernosCollection = collection(db, 'users', state.currentUser.uid, 'cadernos');
    await addDoc(cadernosCollection, caderno);
}

// ===== INÍCIO DA MODIFICAÇÃO: Aceita parentId para subpastas =====
export async function createOrUpdateName(type, name, id = null, parentId = null) {
// ===== FIM DA MODIFICAÇÃO =====
    if (id) {
        // --- Lógica de Edição (Renomear) ---
        const collectionPath = type === 'folder' ? 'folders' : 'cadernos';
        const itemRef = doc(db, 'users', state.currentUser.uid, collectionPath, id);
        // Atualiza apenas o nome, preservando outros campos (como parentId)
        await updateDoc(itemRef, { name: name });
    } else {
        // --- Lógica de Criação (Novo Item) ---
        if (type === 'folder') {
            // ===== INÍCIO DA MODIFICAÇÃO: Adiciona parentId ao criar pasta =====
            const folderData = {
                name: name,
                createdAt: serverTimestamp(),
                parentId: parentId || null // Define parentId (null para pastas raiz)
            };
            // ===== FIM DA MODIFICAÇÃO =====
            const foldersCollection = collection(db, 'users', state.currentUser.uid, 'folders');
            await addDoc(foldersCollection, folderData);
        }
    }
}


export async function saveSessionStats() {
    if (!state.currentUser || state.sessionStats.length === 0) return;

    // --- MODIFICAÇÃO: A função agora lê o state.sessionStats mas NÃO o limpa. ---

    const total = state.sessionStats.length;
    const correct = state.sessionStats.filter(s => s.isCorrect).length;
    const incorrect = total - correct;
    const accuracy = total > 0 ? (correct / total * 100) : 0;

    const statsByMateria = state.sessionStats.reduce((acc, stat) => {
        if (!acc[stat.materia]) acc[stat.materia] = { correct: 0, total: 0 };
        acc[stat.materia].total++;
        if (stat.isCorrect) acc[stat.materia].correct++;
        return acc;
    }, {});

    const sessionData = {
        createdAt: serverTimestamp(),
        totalQuestions: total,
        correctCount: correct,
        incorrectCount: incorrect,
        accuracy: accuracy,
        details: statsByMateria
    };

    try {
        const sessionsCollection = collection(db, 'users', state.currentUser.uid, 'sessions');
        await addDoc(sessionsCollection, sessionData);
    } catch (error) {
        console.error("Erro ao salvar a sessão:", error);
    }
}

export async function getWeeklySolvedQuestionsData() {
    const weeklyCounts = Array(7).fill(0);
    if (!state.currentUser) return weeklyCounts;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    try {
        const sessionsCollection = collection(db, 'users', state.currentUser.uid, 'sessions');
        const q = query(sessionsCollection, where("createdAt", ">=", sevenDaysAgo));

        const querySnapshot = await getDocs(q);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        querySnapshot.forEach(doc => {
            const session = doc.data();
            if (!session.createdAt) return;

            const sessionDate = session.createdAt.toDate();
            sessionDate.setHours(0, 0, 0, 0);

            const timeDiff = today.getTime() - sessionDate.getTime();
            const dayDiff = Math.floor(timeDiff / (1000 * 3600 * 24));

            const index = 6 - dayDiff;

            if (index >= 0 && index < 7) {
                weeklyCounts[index] += session.totalQuestions || 0;
            }
        });
    } catch (error) {
        console.error("Erro ao buscar dados de atividades da semana:", error);
    }

    return weeklyCounts;
}

export async function getHistoricalCountsForQuestions(questionIds) {
    if (!state.currentUser || questionIds.length === 0) {
        return { correct: 0, incorrect: 0, resolved: 0 };
    }

    let totalCorrect = 0;
    let totalIncorrect = 0;
    let questionsWithHistory = 0;

    const historyPromises = questionIds.map(id => getDoc(doc(db, 'users', state.currentUser.uid, 'questionHistory', id)));
    const historySnapshots = await Promise.all(historyPromises);

    historySnapshots.forEach(snap => {
        if (snap.exists()) {
            const data = snap.data();
            const correct = data.correct || 0;
            const incorrect = data.incorrect || 0;
            if (correct > 0 || incorrect > 0) {
                questionsWithHistory++;
            }
            totalCorrect += correct;
            totalIncorrect += incorrect;
        }
    });

    return { correct: totalCorrect, incorrect: totalIncorrect, resolved: questionsWithHistory };
}

// ===== INÍCIO DA NOVA FUNÇÃO =====
/**
 * Busca entradas do log de desempenho dentro de um intervalo de datas.
 * @param {Date} startDate - Data de início.
 * @param {Date} endDate - Data de fim.
 * @returns {Array} - Um array com os documentos do log.
 */
export async function fetchPerformanceLog(startDate, endDate) {
    if (!state.currentUser || !startDate || !endDate) return [];

    const logCollection = collection(db, 'users', state.currentUser.uid, 'performanceLog');

    // Converte as datas para Timestamps do Firestore para a consulta
    const startTimestamp = Timestamp.fromDate(startDate);
    const endTimestamp = Timestamp.fromDate(endDate);

    const q = query(logCollection,
        where("createdAt", ">=", startTimestamp),
        where("createdAt", "<=", endTimestamp)
    );

    try {
        const querySnapshot = await getDocs(q);
        const logEntries = [];
        querySnapshot.forEach(doc => {
            logEntries.push({ id: doc.id, ...doc.data() });
        });
        return logEntries;
    } catch (error) {
        console.error("Erro ao buscar log de desempenho:", error);
        return [];
    }
}
// ===== FIM DA NOVA FUNÇÃO =====


export async function deleteFilter(filterId) {
    if (!state.currentUser) return;
    await deleteDoc(doc(db, 'users', state.currentUser.uid, 'filtros', filterId));
}

export async function saveFilter(filterData) {
    if (!state.currentUser) return;
    const filtrosCollection = collection(db, 'users', state.currentUser.uid, 'filtros');
    await addDoc(filtrosCollection, filterData);
}

export async function saveCadernoState(cadernoId, questionIndex) {
    if (!state.currentUser || !cadernoId) return;
    const stateRef = doc(db, 'users', state.currentUser.uid, 'cadernoState', cadernoId);
    try {
        await setDoc(stateRef, { lastQuestionIndex: questionIndex });
    } catch (error) {
        console.error("Error saving caderno state:", error);
    }
}

export async function deleteItem(type, id) {
    if (!state.currentUser) return;

    if (type === 'folder') {
        const cadernosToDelete = state.userCadernos.filter(c => c.folderId === id);
        const batch = writeBatch(db);
        cadernosToDelete.forEach(caderno => {
            const cadernoRef = doc(db, 'users', state.currentUser.uid, 'cadernos', caderno.id);
            batch.delete(cadernoRef);
        });

        // ===== INÍCIO DA MODIFICAÇÃO: Excluir subpastas recursivamente =====
        // Precisamos encontrar todas as subpastas desta pasta e excluí-las também
        const allFolders = state.userFolders;
        const foldersToDeleteIds = new Set([id]);
        let changed = true;

        // Encontra todas as subpastas descendentes
        while (changed) {
            changed = false;
            allFolders.forEach(folder => {
                if (folder.parentId && foldersToDeleteIds.has(folder.parentId) && !foldersToDeleteIds.has(folder.id)) {
                    foldersToDeleteIds.add(folder.id);
                    changed = true;
                }
            });
        }

        // Exclui todos os cadernos dentro de todas as pastas a serem excluídas
        const allCadernosToDelete = state.userCadernos.filter(c => foldersToDeleteIds.has(c.folderId));
        allCadernosToDelete.forEach(caderno => {
            // Garante que não estamos adicionando ao batch duas vezes
            if (!cadernosToDelete.find(c => c.id === caderno.id)) {
                 const cadernoRef = doc(db, 'users', state.currentUser.uid, 'cadernos', caderno.id);
                 batch.delete(cadernoRef);
            }
        });

        // Exclui todas as pastas (raiz e subpastas)
        foldersToDeleteIds.forEach(folderId => {
            const folderRef = doc(db, 'users', state.currentUser.uid, 'folders', folderId);
            batch.delete(folderRef);
        });
        // ===== FIM DA MODIFICAÇÃO =====

        await batch.commit();

    } else if (type === 'caderno') {
        const cadernoRef = doc(db, 'users', state.currentUser.uid, 'cadernos', id);
        await deleteDoc(cadernoRef);
    }
}

export async function addQuestionIdsToCaderno(cadernoId, questionIds) {
    if (!state.currentUser || !questionIds || questionIds.length === 0) return;
    const cadernoRef = doc(db, 'users', state.currentUser.uid, 'cadernos', cadernoId);
    try {
        await updateDoc(cadernoRef, {
            questionIds: arrayUnion(...questionIds)
        });
    } catch (error) {
        console.error("Erro ao adicionar questões ao caderno:", error);
    }
}

// --- NOVA FUNÇÃO PARA RESETAR O PROGRESSO ---
/**
 * Apaga todas as subcoleções de dados de um usuário.
 * @param {string} userId - O ID do usuário.
 */
// ===== INÍCIO DA MODIFICAÇÃO: deleteUserCollection agora usa batches de 500 e lança erro =====
async function deleteUserCollection(userId, collectionName) {
    if (!userId) return;

    const collectionRef = collection(db, 'users', userId, collectionName);
    const q = query(collectionRef); // Sem limit, pega tudo

    try {
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            console.log(`Coleção ${collectionName} já está vazia.`);
            return; // Sucesso, nada a fazer
        }

        const docs = snapshot.docs;
        const batchSize = 500; // Limite do Firestore para writes em batch
        const batches = [];

        // Divide os documentos em lotes de 500
        for (let i = 0; i < docs.length; i += batchSize) {
            const batch = writeBatch(db);
            const end = Math.min(i + batchSize, docs.length);
            for (let j = i; j < end; j++) {
                batch.delete(docs[j].ref);
            }
            batches.push(batch.commit()); // Adiciona a promessa do commit ao array
        }

        await Promise.all(batches); // Executa todos os batches em paralelo
        console.log(`Coleção ${collectionName} resetada (${docs.length} documentos).`);

    } catch (error) {
        console.error(`Erro ao resetar a coleção ${collectionName}:`, error);
        // Lança o erro para que resetAllUserData possa pegá-lo
        throw error;
    }
}
// ===== FIM DA MODIFICAÇÃO =====

/**
 * Reseta todos os dados do usuário logado.
 */
export async function resetAllUserData() {
    if (!state.currentUser) return;
    const userId = state.currentUser.uid;

    // ===== INÍCIO DA MODIFICAÇÃO (SOLICITAÇÃO DO USUÁRIO) =====
    // A lista foi reduzida para apagar apenas os dados de progresso.
    // 'filtros', 'cadernos', e 'folders' foram removidos desta lista.
    const collectionsToDelete = [
        'sessions',          // Estatísticas de sessão
        'reviewItems',       // Agendamentos de revisão (SRS)
        'userQuestionState', // Respostas salvas (qual alternativa marcou)
        'questionHistory',   // Histórico vitalício (acertos/erros por questão)
        'cadernoState',      // Posição salva em cada caderno
        'performanceLog'     // Log de desempenho para gráfico de evolução
    ];
    // ===== FIM DA MODIFICAÇÃO =====

    // Cria um array de promessas para deletar todas as coleções em paralelo
    const deletePromises = collectionsToDelete.map(collectionName =>
        deleteUserCollection(userId, collectionName)
    );

    try {
        await Promise.all(deletePromises);
        console.log("Progresso do usuário resetado com sucesso.");
        // O listener onAuthStateChanged em auth.js vai recarregar o estado vazio
        // (pois as coleções estarão vazias), então não precisamos forçar um reset aqui.
        // Apenas para garantir, podemos limpar os mapas locais.
        // state.userFolders e state.userCadernos NÃO são resetados.
        setState('userReviewItems', []);
        setState('historicalSessions', []);
        setState('userAnswers', new Map());
        setState('userCadernoState', new Map());
        setState('userReviewItemsMap', new Map());
        setState('userQuestionHistoryMap', new Map());
        // state.savedFilters NÃO é resetado.
        setState('sessionStats', []);
    } catch (error) {
        console.error("Erro geral ao resetar o progresso do usuário:", error);
    }
}
// --- FIM DA NOVA FUNÇÃO ---
