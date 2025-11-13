import { state } from '../state.js';
import { removeQuestionIdFromCaderno as removeQuestionIdFromFirestore } from '../services/firestore.js';

export async function removeQuestionFromCaderno(questionId) {
    if (!state.currentCadernoId || !state.currentUser) return;
    await removeQuestionIdFromFirestore(state.currentCadernoId, questionId);
}
