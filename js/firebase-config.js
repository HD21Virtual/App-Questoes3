import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { firebaseConfig } from './config.js';

/**
 * @file js/firebase-config.js
 * @description Centraliza a configuração e inicialização do Firebase.
 * Exporta as instâncias `auth` e `db` para serem usadas em toda a aplicação.
 */

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);

// Exporta as instâncias dos serviços do Firebase
export const auth = getAuth(app);
export const db = getFirestore(app);
