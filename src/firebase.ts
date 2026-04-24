import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  initializeAuth, 
  browserLocalPersistence, 
  browserPopupRedirectResolver, 
  browserSessionPersistence,
  indexedDBLocalPersistence
} from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// Configuração robusta de Firestore
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
}, firebaseConfig.firestoreDatabaseId);

// Inicialização robusta do Auth para evitar erros de rede em certas condições de browser/iframe
export const auth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence],
  popupRedirectResolver: browserPopupRedirectResolver,
});

// Secondary app for creating users without signing out the current user
const secondaryApp = initializeApp(firebaseConfig, "Secondary");
export const secondaryAuth = getAuth(secondaryApp);
