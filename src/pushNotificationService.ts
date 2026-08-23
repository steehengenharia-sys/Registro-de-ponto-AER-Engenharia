import { getMessaging, getToken, deleteToken, isSupported } from 'firebase/messaging';
import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { firebaseApp, db } from './firebase';

const DEVICE_ID_KEY = 'point_device_id';
const COLLECTION = 'pointNotificationDevices';

function getOrCreateDeviceId(): string {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15);
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

export async function isPushSupported(): Promise<boolean> {
  const supported = await isSupported();
  return supported && 'serviceWorker' in navigator && 'PushManager' in window;
}

export function isIOSPWA(): boolean {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
  // If it's iOS, it needs to be standalone
  if (isIOS) {
    return (window.navigator as any).standalone === true;
  }
  return true; // Other platforms don't have this strict requirement
}

export async function registerPushDevice(userId: string): Promise<boolean> {
  if (!import.meta.env.VITE_FIREBASE_VAPID_KEY) {
    throw new Error('Configuração de Push pendente. A chave pública VAPID ainda não foi configurada.');
  }

  const supported = await isPushSupported();
  if (!supported) {
    throw new Error('Notificações push não são suportadas neste navegador.');
  }

  if (!isIOSPWA()) {
    throw new Error('Para receber alertas no iPhone/iPad, você deve usar a opção "Compartilhar" → "Adicionar à Tela de Início" e abrir o app por lá.');
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    const messaging = getMessaging(firebaseApp);
    const permission = await Notification.requestPermission();

    if (permission !== 'granted') {
      throw new Error('Permissão de notificação negada pelo usuário.');
    }

    const currentToken = await getToken(messaging, {
      vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: registration
    });

    if (currentToken) {
      const deviceId = getOrCreateDeviceId();
      const docId = `${userId}_${deviceId}`;
      
      await setDoc(doc(db, COLLECTION, docId), {
        userId,
        deviceId,
        fcmToken: currentToken,
        active: true,
        permission: "granted",
        platform: navigator.platform,
        userAgent: navigator.userAgent,
        updatedAt: serverTimestamp(),
        lastSeenAt: serverTimestamp(),
      }, { merge: true });

      return true;
    } else {
      throw new Error('Nenhum token de registro disponível. Falha na configuração.');
    }
  } catch (error) {
    console.error('An error occurred while retrieving token. ', error);
    throw error;
  }
}

export async function unregisterPushDevice(userId: string): Promise<void> {
  const supported = await isPushSupported();
  if (!supported) return;
  
  try {
    let registration = await navigator.serviceWorker.getRegistration('/');
    if (!registration) {
      registration = await navigator.serviceWorker.register('/sw.js');
    }
    await navigator.serviceWorker.ready;

    const messaging = getMessaging(firebaseApp);
    
    try {
      await getToken(messaging, {
        vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
        serviceWorkerRegistration: registration
      });
      await deleteToken(messaging);
    } catch (tokenError) {
      console.warn('Token could not be retrieved or deleted (might already be unregistered).', tokenError);
    }

    const deviceId = getOrCreateDeviceId();
    const docId = `${userId}_${deviceId}`;

    await updateDoc(doc(db, COLLECTION, docId), {
      active: false,
      permission: Notification.permission,
      updatedAt: serverTimestamp(),
      lastSeenAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error unregistering push device:', error);
    throw error;
  }
}
