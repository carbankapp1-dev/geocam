// ============================================================
// CONFIGURAÇÃO DO FIREBASE — projeto de TESTE (com código de acesso)
// Preencha com as credenciais do NOVO projeto Firebase (ver README.md,
// Passo 1). NÃO use as credenciais do projeto principal aqui.
// ============================================================

const firebaseConfig = {
  apiKey: "SUBSTITUA_AQUI",
  authDomain: "SUBSTITUA_AQUI.firebaseapp.com",
  projectId: "SUBSTITUA_AQUI",
  messagingSenderId: "SUBSTITUA_AQUI",
  appId: "SUBSTITUA_AQUI"
};

// URL pública onde este site de teste vai ficar hospedado
// (ex: um repositório novo no GitHub Pages, ou uma subpasta /teste)
const VERIFY_BASE_URL = "https://SEU-USUARIO.github.io/SEU-REPOSITORIO-TESTE/verify.html";

// Chave do OpenCage Geocoder.
const OPENCAGE_API_KEY = "6a31f09acc5d42cfb073514d739e6cb5";

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// Tamanho máximo (em caracteres base64) que a foto pode ter para
// caber com folga no limite de 1 MB por documento do Firestore
const MAX_FOTO_BASE64_LEN = 700000;

// Login anônimo — necessário para as regras de segurança do Firestore
// exigirem "request.auth != null" sem precisar de tela de login para o usuário
function ensureAuth() {
  return new Promise((resolve, reject) => {
    auth.onAuthStateChanged((user) => {
      if (user) {
        resolve(user);
      } else {
        auth.signInAnonymously().catch(reject);
      }
    });
  });
}
