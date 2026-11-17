// auth.js - Módulo Centralizado do Revolts (Firebase v10)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "SUA_API_KEY_AQUI", // Coloque sua apiKey real do Firebase
  authDomain: "revolts-b8c77.firebaseapp.com",
  projectId: "revolts-b8c77",
  storageBucket: "revolts-b8c77.appspot.com",
  messagingSenderId: "554456699154",
  appId: "1:554456699154:web:f379970293c67b0fbf23cb"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

let guestId = localStorage.getItem('revolts_guest_id');
if (!guestId) {
  guestId = 'visitante_' + Math.random().toString(36).substring(2, 8);
  localStorage.setItem('revolts_guest_id', guestId);
}

window.currentDocId = guestId;
window.currentUser = null;

const DEFAULT_MISSIONS = [
  { id: 'm1', cat: 'vision', title: 'Rotulagem de Objetos Urbanos', desc: 'Identifique semáforos, faixas e placas em capturas de rua.', xp: 50, done: 2, total: 5, accent: 'var(--g-blue)' },
  { id: 'm2', cat: 'nlp', title: 'Análise de Sentimento PT-BR', desc: 'Classifique expressões regionais e gírias brasileiras.', xp: 40, done: 4, total: 5, accent: 'var(--g-green)' },
  { id: 'm3', cat: 'maps', title: 'Verificação de Acessibilidade', desc: 'Confirme rampas e entradas acessíveis em locais públicos.', xp: 75, done: 1, total: 4, accent: 'var(--g-yellow)' },
  { id: 'm4', cat: 'vision', title: 'Transcrição OCR Manuscrita', desc: 'Valide palavras digitalizadas de documentos históricos.', xp: 60, done: 0, total: 5, accent: 'var(--g-red)' }
];

window.revoltsState = {
  displayName: 'Agente Visitante',
  xp: 120,
  completed: 7,
  streak: 3,
  theme: 'dark',
  missions: DEFAULT_MISSIONS
};

// Observador de Sessão
onAuthStateChanged(auth, async (user) => {
  window.currentUser = user;
  if (user) {
    window.currentDocId = user.uid;
    const name = user.displayName || user.email.split('@')[0];
    updateAuthUI(true, name, user.photoURL);
    await loadUserData(window.currentDocId, name);
  } else {
    window.currentDocId = guestId;
    updateAuthUI(false, 'Visitante', null);
    await loadUserData(window.currentDocId, 'Agente Visitante');
  }
  if (typeof window.onAuthReady === 'function') window.onAuthReady();
});

async function loadUserData(docId, fallbackName) {
  try {
    const docRef = doc(db, "agents", docId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      window.revoltsState = docSnap.data();
      if (!window.revoltsState.displayName) window.revoltsState.displayName = fallbackName;
    } else {
      window.revoltsState.displayName = fallbackName;
      await setDoc(docRef, window.revoltsState);
    }
    if (typeof window.refreshView === 'function') window.refreshView();
  } catch (err) {
    console.error("Erro ao carregar dados:", err);
  }
}

window.saveCloudDB = async function() {
  try {
    const docRef = doc(db, "agents", window.currentDocId);
    await setDoc(docRef, window.revoltsState, { merge: true });
    if (typeof window.refreshView === 'function') window.refreshView();
  } catch (err) {
    console.error("Erro ao salvar:", err);
  }
};

window.loginGoogle = () => signInWithPopup(auth, googleProvider);
window.logoutApp = () => signOut(auth);

window.listenRank = function(callback) {
  onSnapshot(collection(db, "agents"), (snapshot) => {
    const players = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const isMe = docSnap.id === window.currentDocId;
      players.push({
        name: isMe ? `${data.displayName || 'Você'} (Você)` : (data.displayName || `Agente_${docSnap.id.substring(0,5)}`),
        xp: data.xp || 0,
        accent: isMe ? 'var(--g-blue)' : 'var(--g-green)'
      });
    });
    players.sort((a, b) => b.xp - a.xp);
    callback(players);
  });
};

function updateAuthUI(isLoggedIn, name, photoURL) {
  const avatarEl = document.getElementById('headerAvatar');
  const nameEl = document.getElementById('headerUserName');
  if (!avatarEl || !nameEl) return;
  nameEl.textContent = isLoggedIn ? name : 'Entrar';
  if (photoURL) {
    avatarEl.innerHTML = `<img src="${photoURL}" style="width:100%;height:100%;object-fit:cover;" />`;
  } else {
    avatarEl.textContent = name.charAt(0).toUpperCase();
  }
}