import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Clock, 
  User, 
  MapPin, 
  LogOut, 
  Users, 
  Calendar, 
  BarChart3, 
  Plus, 
  Trash2, 
  Edit2, 
  Eye, 
  CheckCircle2, 
  AlertCircle,
  ChevronRight,
  Menu,
  X,
  Phone,
  Briefcase,
  Map as MapIcon,
  Info,
  FileText,
  FileSpreadsheet,
  UserCheck,
  Building2,
  Filter,
  Download,
  Search,
  HardHat,
  Wallet,
  Database
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import localforage from 'localforage';
import { auth, db, secondaryAuth } from './firebase';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword } from 'firebase/auth';
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc, onSnapshot, query, where, getDoc, orderBy } from 'firebase/firestore';

// --- Backup Manager (Local IndexedDB) ---
localforage.config({
  name: 'ControlePontoDB',
  storeName: 'backups'
});

export const backupManager = {
  saveDailySnapshot: async (points: PointRecord[]) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const key = `snapshot_${today}`;
      const existing = await localforage.getItem(key);
      if (!existing) {
        await localforage.setItem(key, {
          timestamp: new Date().toISOString(),
          data: points
        });
        console.log(`Backup diário criado: ${key}`);
      }
    } catch (e) {
      console.error('Erro ao salvar backup diário:', e);
    }
  },
  saveHistory: async (point: PointRecord, action: 'CREATE' | 'UPDATE' | 'DELETE') => {
    try {
      const key = `history_${point.id}`;
      let history: any[] = await localforage.getItem(key) || [];
      history.push({
        action,
        timestamp: new Date().toISOString(),
        data: { ...point }
      });
      // Keep only last 10 versions
      if (history.length > 10) history = history.slice(-10);
      await localforage.setItem(key, history);
    } catch (e) {
      console.error('Erro ao salvar histórico do ponto:', e);
    }
  },
  getSnapshots: async () => {
    try {
      const keys = await localforage.keys();
      const snapshotKeys = keys.filter(k => k.startsWith('snapshot_')).sort().reverse();
      const snapshots = [];
      for (const key of snapshotKeys) {
        const data: any = await localforage.getItem(key);
        snapshots.push({ key, timestamp: data.timestamp, count: data.data.length });
      }
      return snapshots;
    } catch (e) {
      console.error('Erro ao buscar snapshots:', e);
      return [];
    }
  },
  restoreSnapshot: async (key: string): Promise<PointRecord[]> => {
    try {
      const snapshot: any = await localforage.getItem(key);
      return snapshot ? snapshot.data : [];
    } catch (e) {
      console.error('Erro ao restaurar snapshot:', e);
      return [];
    }
  }
};

// --- Storage Helper (Now using Firestore) ---

const storage = {
  getUsers: async (userId?: string): Promise<UserData[]> => {
    try {
      let q = collection(db, 'users') as any;
      if (userId) {
        q = query(collection(db, 'users'), where('id', '==', userId));
      }
      const querySnapshot = await getDocs(q);
      const users = querySnapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as object) } as UserData));
      
      return users.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, 'users');
      return [];
    }
  },
  saveUsers: async (users: UserData[]) => {
    for (const user of users) {
      try {
        await setDoc(doc(db, 'users', user.id), user);
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, `users/${user.id}`);
      }
    }
  },
  saveUser: async (user: UserData) => {
    try {
      await setDoc(doc(db, 'users', user.id), user);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `users/${user.id}`);
    }
  },
  deleteUser: async (id: string) => {
    try {
      await deleteDoc(doc(db, 'users', id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `users/${id}`);
    }
  },
  
  getWorks: async (): Promise<Work[]> => {
    try {
      const querySnapshot = await getDocs(collection(db, 'works'));
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Work)).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, 'works');
      return [];
    }
  },
  saveWorks: async (works: Work[]) => {
    for (const work of works) {
      try {
        await setDoc(doc(db, 'works', work.id), work);
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, `works/${work.id}`);
      }
    }
  },
  saveWork: async (work: Work) => {
    try {
      await setDoc(doc(db, 'works', work.id), work);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `works/${work.id}`);
    }
  },
  deleteWork: async (id: string) => {
    try {
      await deleteDoc(doc(db, 'works', id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `works/${id}`);
    }
  },
  
  getPoints: async (userId?: string): Promise<PointRecord[]> => {
    try {
      let q = collection(db, 'points') as any;
      if (userId) {
        q = query(collection(db, 'points'), where('user_id', '==', userId));
      }
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as object) } as PointRecord)).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, 'points');
      return [];
    }
  },
  savePoints: async (points: PointRecord[]) => {
    // Optimized to use batch or just individual calls if needed, 
    // but for now let's keep it simple and just add a savePoint for single updates
    for (const point of points) {
      try {
        await backupManager.saveHistory(point, 'UPDATE');
        await setDoc(doc(db, 'points', String(point.id)), point);
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, `points/${point.id}`);
      }
    }
  },
  savePoint: async (point: PointRecord) => {
    try {
      await backupManager.saveHistory(point, 'UPDATE');
      await setDoc(doc(db, 'points', String(point.id)), point);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `points/${point.id}`);
    }
  },
  deletePoint: async (id: string | number) => {
    try {
      const docRef = doc(db, 'points', String(id));
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        await backupManager.saveHistory({ id, ...(docSnap.data() as object) } as PointRecord, 'DELETE');
      }
      await deleteDoc(docRef);
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `points/${id}`);
    }
  },
};

// --- Utility Functions ---

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; // metres
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // in metres
}

function calcularPeriodo(inicio: string, fim: string): number {
  if (!inicio || !fim || !inicio.includes(':') || !fim.includes(':')) return 0;
  const [h1, m1] = inicio.split(':').map(Number);
  const [h2, m2] = fim.split(':').map(Number);
  if (isNaN(h1) || isNaN(m1) || isNaN(h2) || isNaN(m2)) return 0;
  let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (diff < 0) diff += 24 * 60;
  return diff;
}

function formatarMinutos(totalMinutos: number): string {
  const h = Math.floor(totalMinutos / 60);
  const m = totalMinutos % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function calcularHoras(entrada1: string, saida1: string, entrada2: string, saida2: string): string {
  const p1 = calcularPeriodo(entrada1, saida1);
  const p2 = calcularPeriodo(entrada2, saida2);
  return formatarMinutos(p1 + p2);
}

function somarHoras(listaDeHoras: string[]): string {
  let totalMinutos = 0;
  listaDeHoras.forEach(h => {
    if (!h || !h.includes(':')) return;
    const [hrs, mins] = h.split(':').map(Number);
    if (isNaN(hrs) || isNaN(mins)) return;
    totalMinutos += (hrs * 60 + mins);
  });
  return formatarMinutos(totalMinutos);
}

function calcularHorasRecord(p: Partial<PointRecord>): string {
  return calcularHoras(p.entrada1 || '', p.saida1 || '', p.entrada2 || '', p.saida2 || '');
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}


type Role = 'admin_master' | 'admin' | 'funcionario';

interface UserData {
  id: string;
  username: string;
  name: string;
  role: Role;
  role_name: string;
  phone: string;
  valor_diaria?: number;
  senha?: string; // For local authentication
}

interface Work {
  id: string;
  name: string;
  city: string;
  address: string;
  lat?: number;
  lng?: number;
  radius?: number;
}

enum WorkStatus {
  NAO_INICIADO = 'nao_iniciado',
  TRABALHANDO = 'trabalhando',
  PAUSADO = 'pausado',
  ENCERRADO = 'encerrado'
}

interface PointRecord {
  id: string | number;
  user_id: string;
  funcionario_id?: string;
  user_name?: string;
  work_id?: string;
  work_name?: string;
  entrada1_obra?: string;
  entrada2_obra?: string;
  date: string;
  entrada1: string; saida1: string; entrada2: string; saida2: string;
  entrada1_lat: number; entrada1_lng: number; entrada1_acc: number; entrada1_address: string;
  saida1_lat: number; saida1_lng: number; saida1_acc: number; saida1_address: string;
  entrada2_lat: number; entrada2_lng: number; entrada2_acc: number; entrada2_address: string;
  saida2_lat: number; saida2_lng: number; saida2_acc: number; saida2_address: string;
  entrada1_dist?: number; entrada1_gps_status?: string;
  saida1_dist?: number; saida1_gps_status?: string;
  entrada2_dist?: number; entrada2_gps_status?: string;
  saida2_dist?: number; saida2_gps_status?: string;
  entrada1_gps_suspeito?: number;
  saida1_gps_suspeito?: number;
  entrada2_gps_suspeito?: number;
  saida2_gps_suspeito?: number;
  obs: string;
  total_hours: string;
  editado_manual?: number;
  encerrado?: number;
  last_timestamp?: number;
  status: WorkStatus;
}

// --- Status Management Functions ---
const setStatus = (p: PointRecord, newStatus: WorkStatus) => {
  if (p.status === WorkStatus.ENCERRADO) return; // Não pode mudar mais
  p.status = newStatus;
  if (newStatus === WorkStatus.ENCERRADO) p.encerrado = 1;
};

const pausar = (p: PointRecord) => setStatus(p, WorkStatus.PAUSADO);
const continuar = (p: PointRecord) => setStatus(p, WorkStatus.TRABALHANDO);
const encerrar = (p: PointRecord) => setStatus(p, WorkStatus.ENCERRADO);

// --- Helpers ---

const calculateDiariasForUser = (totalHoursStr: string) => {
  if (!totalHoursStr || !totalHoursStr.includes(':')) return 0;
  const [h, m] = totalHoursStr.split(':').map(Number);
  const totalHours = h + m / 60;
  const diariasInteiras = Math.floor(totalHours / 10);
  const horasRestantes = totalHours % 10;
  
  let ajuste = 0;
  if (horasRestantes >= 4 && horasRestantes < 7) {
    ajuste = 0.5;
  } else if (horasRestantes >= 7) {
    ajuste = 1;
  }
  
  return diariasInteiras + ajuste;
};

const calculateCostForUser = (totalHoursStr: string, valorDiaria: number) => {
  return calculateDiariasForUser(totalHoursStr) * valorDiaria;
};
/**
 * NOTE: The "WebSocket closed without opened" error seen in the console is a known 
 * issue with Vite's HMR in this environment and does not affect the application's functionality.
 */

const calculateWorkStatus = (p: PointRecord | null): WorkStatus => {
  if (!p || !p.entrada1) return WorkStatus.NAO_INICIADO;
  
  if (p.encerrado) return WorkStatus.ENCERRADO;
  if (p.saida2) return WorkStatus.ENCERRADO;
  if (p.entrada2) return WorkStatus.TRABALHANDO;
  if (p.saida1) {
    if (p.status === WorkStatus.PAUSADO) return WorkStatus.PAUSADO;
    return WorkStatus.ENCERRADO;
  }
  if (p.entrada1) return WorkStatus.TRABALHANDO;
  
  return WorkStatus.NAO_INICIADO;
};

const getPointStatus = (p: PointRecord | null) => {
  const status = calculateWorkStatus(p);
  if (status === WorkStatus.ENCERRADO) return { label: 'Encerrado', since: p?.saida2 || p?.saida1 || '--:--', color: 'text-slate-400', bg: 'bg-slate-800', border: 'border-slate-700' };
  if (status === WorkStatus.PAUSADO) return { label: 'Pausado', since: p?.saida1 || '--:--', color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/20' };
  if (status === WorkStatus.TRABALHANDO) {
    const since = (p?.entrada2 && p?.saida1) ? p.entrada2 : (p?.entrada1 || '--:--');
    return { label: 'Trabalhando', since, color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' };
  }
  return { label: 'Não iniciado', since: '--:--', color: 'text-slate-500', bg: 'bg-slate-500/10', border: 'border-slate-500/20' };
};

// --- Components ---

const Card = ({ children, className = "", ...props }: { children: React.ReactNode, className?: string, [key: string]: any }) => (
  <div {...props} className={`bg-slate-800/50 border border-slate-700 rounded-2xl p-6 shadow-xl backdrop-blur-sm ${className}`}>
    {children}
  </div>
);

const Button = ({ 
  children, 
  onClick, 
  variant = 'primary', 
  className = "", 
  disabled = false,
  loading = false,
  type = "button"
}: { 
  children: React.ReactNode, 
  onClick?: () => void, 
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost',
  className?: string,
  disabled?: boolean,
  loading?: boolean,
  type?: "button" | "submit"
}) => {
  const variants = {
    primary: "bg-orange-600 hover:bg-orange-700 text-white shadow-orange-900/20",
    secondary: "bg-slate-700 hover:bg-slate-600 text-white border border-slate-600",
    danger: "bg-red-600 hover:bg-red-700 text-white",
    ghost: "bg-transparent hover:bg-slate-700 text-slate-300"
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`px-4 py-2 rounded-xl font-medium transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 ${variants[variant]} ${className}`}
    >
      {loading ? (
        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      ) : null}
      {children}
    </button>
  );
};

const Input = ({ 
  label, 
  type = "text", 
  value, 
  onChange, 
  placeholder,
  required = false,
  disabled = false
}: { 
  label: string, 
  type?: string, 
  value: string, 
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void,
  placeholder?: string,
  required?: boolean,
  disabled?: boolean
}) => (
  <div className="space-y-1.5">
    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</label>
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      required={required}
      disabled={disabled}
      className={`w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-600/50 transition-all placeholder:text-slate-600 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    />
  </div>
);

const Modal = ({ isOpen, onClose, title, children }: { isOpen: boolean, onClose: () => void, title: string, children: React.ReactNode }) => (
  <AnimatePresence>
    {isOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
        />
        <motion.div 
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          className="relative bg-slate-800 border border-slate-700 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden"
        >
          <div className="p-6 border-bottom border-slate-700 flex justify-between items-center">
            <h3 className="text-xl font-bold text-white">{title}</h3>
            <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-full transition-colors">
              <X size={20} className="text-slate-400" />
            </button>
          </div>
          <div className="p-6 max-h-[80vh] overflow-y-auto">
            {children}
          </div>
        </motion.div>
      </div>
    )}
  </AnimatePresence>
);

// --- Main App ---

type ViewType = 'dashboard' | 'users' | 'points' | 'works' | 'employee' | 'history' | 'reports';

export default function App() {
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewType>(() => {
    const savedView = localStorage.getItem('ar_current_view');
    return (savedView as ViewType) || 'dashboard';
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [points, setPoints] = useState<PointRecord[]>([]);
  const [users, setUsers] = useState<UserData[]>([]);
  const [works, setWorks] = useState<Work[]>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // User is signed in. Fetch user data from Firestore.
        try {
          const userRef = doc(db, 'users', firebaseUser.uid);
          const userDoc = await getDoc(userRef);
          
          if (userDoc.exists()) {
            setUser({ id: userDoc.id, ...userDoc.data() } as UserData);
          } else {
            // Create default user profile if it doesn't exist
            const isDefaultAdmin = firebaseUser.email === 'steeh.engenharia@gmail.com';
            const newUser: UserData = {
              id: firebaseUser.uid,
              username: firebaseUser.email?.split('@')[0] || 'usuario',
              name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Usuário',
              role: isDefaultAdmin ? 'admin_master' : 'funcionario',
              role_name: isDefaultAdmin ? 'Engenheiro Chefe' : 'Funcionário',
              phone: '',
            };
            await setDoc(userRef, {
              username: newUser.username,
              name: newUser.name,
              role: newUser.role,
              role_name: newUser.role_name,
              phone: newUser.phone,
            });
            setUser(newUser);
          }
        } catch (error) {
          console.error("Error fetching/creating user data:", error);
          setUser(null);
        }
      } else {
        // User is signed out.
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const refreshData = useCallback(async () => {
    if (!user) return;
    
    const isFuncionario = user.role === 'funcionario';
    
    const uData = await storage.getUsers(isFuncionario ? user.id : undefined);

    if (!isFuncionario) {
      setUsers(uData);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      if (user.role === 'funcionario') setView('employee');
      else setView('dashboard');
      refreshData();
      
      // Real-time listener for works
      const unsubscribeWorks = onSnapshot(collection(db, 'works'), (snapshot) => {
        const wData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Work)).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setWorks(wData);
      }, (error) => {
        console.error("Error listening to works:", error);
      });

      // Real-time listener for points
      let q = query(collection(db, 'points'), orderBy('date', 'desc'));
      if (user.role === 'funcionario') {
        q = query(collection(db, 'points'), where('user_id', '==', user.id), orderBy('date', 'desc'));
      }
      
      const unsubscribePoints = onSnapshot(q, async (snapshot) => {
        const pData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PointRecord));
        
        // Recalculate total_hours for all points to ensure consistency
        const updatedPoints: PointRecord[] = [];
        const recalculated = pData.map(p => {
          const newTotal = calcularHorasRecord(p);
          // Use string comparison for changes
          if (newTotal !== p.total_hours) {
            const updatedPoint = { ...p, total_hours: newTotal };
            updatedPoints.push(updatedPoint);
            return updatedPoint;
          }
          return p;
        });
        
        if (updatedPoints.length > 0) {
          // Update points in Firestore if calculation changed
          for (const p of updatedPoints) {
            await storage.savePoint(p);
          }
        }
        
        setPoints(recalculated);
      }, (error) => {
        console.error("Error listening to points:", error);
      });
      
      return () => {
        unsubscribeWorks();
        unsubscribePoints();
      };
    }
  }, [user, refreshData]);

  useEffect(() => {
    if (points.length > 0) {
      backupManager.saveDailySnapshot(points);
    }
  }, [points]);

  useEffect(() => {
    localStorage.setItem('ar_current_view', view);
  }, [view]);

  const handleLogout = async () => {
    await signOut(auth);
    setUser(null);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">Carregando...</div>;

  if (!user) return <LoginPage />;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex font-sans">
      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 w-[260px] lg:w-72 bg-slate-900 border-r border-slate-800 transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="h-[100dvh] lg:h-full flex flex-col">
          <div className="p-6 lg:p-8 flex-1 overflow-y-auto">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 bg-orange-600 rounded-xl flex items-center justify-center shadow-lg shadow-orange-900/20 shrink-0">
                <Clock className="text-white" size={24} />
              </div>
              <div className="overflow-hidden">
                <h1 className="text-base lg:text-lg font-bold tracking-tight truncate">A&R Engenharia</h1>
                <p className="text-[9px] lg:text-[10px] text-orange-500 font-bold uppercase tracking-widest truncate">Controle de Ponto</p>
              </div>
            </div>

            <nav className="space-y-2">
              {user.role !== 'funcionario' ? (
                <>
                  <SidebarItem active={view === 'dashboard'} icon={<BarChart3 size={20} />} label="Dashboard" onClick={() => { setView('dashboard'); setIsSidebarOpen(false); }} />
                  <SidebarItem active={view === 'users'} icon={<Users size={20} />} label="Funcionários" onClick={() => { setView('users'); setIsSidebarOpen(false); }} />
                  {(user.role === 'admin_master' || user.role === 'admin') && (
                    <SidebarItem active={view === 'works'} icon={<MapIcon size={20} />} label="Obras" onClick={() => { setView('works'); setIsSidebarOpen(false); }} />
                  )}
                  <SidebarItem active={view === 'points'} icon={<Calendar size={20} />} label="Registros" onClick={() => { setView('points'); setIsSidebarOpen(false); }} />
                  <SidebarItem active={view === 'reports'} icon={<FileText size={20} />} label="Relatórios" onClick={() => { setView('reports'); setIsSidebarOpen(false); }} />
                  {user.role === 'admin' && (
                    <>
                      <div className="pt-4 pb-2 px-4">
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Área do Funcionário</p>
                      </div>
                      <SidebarItem active={view === 'employee'} icon={<Clock size={20} />} label="Meu Ponto" onClick={() => { setView('employee'); setIsSidebarOpen(false); }} />
                      <SidebarItem active={view === 'history'} icon={<Calendar size={20} />} label="Meu Histórico" onClick={() => { setView('history'); setIsSidebarOpen(false); }} />
                    </>
                  )}
                </>
              ) : (
                <>
                  <SidebarItem active={view === 'employee'} icon={<Clock size={20} />} label="Meu Ponto" onClick={() => { setView('employee'); setIsSidebarOpen(false); }} />
                  <SidebarItem active={view === 'history'} icon={<Calendar size={20} />} label="Meu Histórico" onClick={() => { setView('history'); setIsSidebarOpen(false); }} />
                </>
              )}
            </nav>
          </div>

          <div className="mt-auto p-6 lg:p-8 border-t border-slate-800 shrink-0">
            <div className="flex items-center gap-3 lg:gap-4 mb-6">
              <div className="w-10 h-10 lg:w-12 lg:h-12 bg-slate-800 rounded-xl lg:rounded-2xl flex items-center justify-center border border-slate-700 shrink-0">
                <User className="text-orange-500" size={20} />
              </div>
              <div className="overflow-hidden">
                <p className="font-bold text-sm truncate">{user.name}</p>
                <p className="text-xs text-slate-500 truncate">{user.role_name}</p>
              </div>
            </div>
            <Button variant="secondary" className="w-full" onClick={handleLogout}>
              <LogOut size={18} /> Sair
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative pb-20 lg:pb-0">
        <header className="h-16 md:h-20 border-b border-slate-800 bg-slate-950/50 backdrop-blur-md flex items-center justify-between px-4 md:px-8 lg:px-12">
          <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2 hover:bg-slate-800 rounded-xl transition-colors">
            <Menu size={24} />
          </button>
          <div className="flex-1 flex justify-center lg:justify-start">
            <h2 className="text-lg md:text-xl font-bold text-white">
              {view === 'dashboard' && 'Visão Geral'}
              {view === 'users' && 'Gestão de Funcionários'}
              {view === 'works' && 'Gestão de Obras'}
              {view === 'points' && 'Histórico de Pontos'}
              {view === 'reports' && 'Relatórios Gerenciais'}
              {view === 'employee' && 'Registro de Ponto'}
              {view === 'history' && 'Meu Histórico'}
            </h2>
          </div>
          <div className="flex items-center gap-4">
             <div className="text-right hidden sm:block">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{new Date().toLocaleDateString('pt-BR', { weekday: 'long' })}</p>
                <p className="text-sm font-bold text-white">{new Date().toLocaleDateString('pt-BR')}</p>
             </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 lg:p-12">
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {view === 'dashboard' && <DashboardView points={points} users={users} works={works} onRefresh={refreshData} />}
              {view === 'users' && <UsersView user={user!} users={users} onRefresh={refreshData} />}
              {view === 'works' && (user.role === 'admin_master' || user.role === 'admin') && <WorksView user={user!} works={works} onRefresh={refreshData} />}
              {view === 'points' && <PointsView user={user!} points={points} users={users} works={works} onRefresh={refreshData} />}
              {view === 'reports' && <ReportsView points={points} users={users} works={works} />}
              {view === 'employee' && user.role !== 'admin_master' && <EmployeeView user={user!} works={works} onRefresh={refreshData} />}
              {view === 'history' && user.role !== 'admin_master' && <HistoryView user={user!} points={points} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden"
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function SidebarItem({ active, icon, label, onClick }: { active: boolean, icon: React.ReactNode, label: string, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`
        w-full flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all
        ${active ? 'bg-orange-600 text-white shadow-lg shadow-orange-900/20' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}
      `}
    >
      {icon}
      <span className="font-semibold">{label}</span>
      {active && <ChevronRight size={16} className="ml-auto" />}
    </button>
  );
}

// --- Views ---

function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Por favor, preencha o usuário e a senha.');
      return;
    }
    setLoading(true);
    setError('');
    
    try {
      // Firebase Auth expects email. If username is not an email, append a default domain.
      const email = username.includes('@') ? username : `${username}@areng.com`;
      await signInWithEmailAndPassword(auth, email, password);
      // No need to manually call onLogin here, onAuthStateChanged in App will handle it.
    } catch (e: any) {
      console.error("Erro de autenticação:", e.message || e);
      switch (e.code) {
        case 'auth/invalid-credential':
        case 'auth/user-not-found':
        case 'auth/wrong-password':
          setError('Usuário ou senha inválidos.');
          break;
        case 'auth/invalid-email':
          setError('E-mail inválido.');
          break;
        case 'auth/user-disabled':
          setError('Usuário desativado.');
          break;
        default:
          setError('Erro ao realizar login. Verifique suas credenciais.');
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-orange-900/20 via-slate-950 to-slate-950">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-10">
          <div className="w-20 h-20 bg-orange-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-orange-900/40 rotate-3">
            <Clock className="text-white" size={40} />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight mb-2">A&R ENGENHARIA</h1>
          <p className="text-slate-500 font-medium uppercase tracking-[0.2em] text-xs">Sistema de Controle de Ponto</p>
        </div>

        <Card className="p-10">
          <form onSubmit={handleSubmit} className="space-y-6">
            <Input 
              label="Usuário" 
              value={username} 
              onChange={e => setUsername(e.target.value)} 
              placeholder="Digite seu usuário"
              required
            />
            <Input 
              label="Senha" 
              type="password" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              placeholder="••••••••"
              required
            />
            
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-4 rounded-xl text-sm flex items-center gap-3">
                <AlertCircle size={18} />
                {error}
              </div>
            )}

            <Button type="submit" className="w-full py-4 text-lg" disabled={loading}>
              {loading ? 'Entrando...' : 'Acessar Sistema'}
            </Button>
          </form>
        </Card>
      </motion.div>
    </div>
  );
}

function DashboardView({ points, users, works, onRefresh }: { points: PointRecord[], users: UserData[], works: Work[], onRefresh: () => void }) {
  const [recentPoints, setRecentPoints] = useState<PointRecord[]>([]);
  const [dashboardData, setDashboardData] = useState({
    totalHours: '00:00',
    employeesPresent: 0,
    dailyCost: 0,
    activeWorks: [] as any[],
    totalRegistered: 0,
    employeesAbsent: 0,
    alerts: [] as string[]
  });

  useEffect(() => {
    const calculate = () => {
      const validUsers = users.filter((u: any) => u.role !== "admin_master");
      const validUserIds = new Set(validUsers.map((u: any) => String(u.id)));

      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
      const todayPoints = points.filter((p: any) => p.date === today && validUserIds.has(String(p.user_id)));
      setRecentPoints(todayPoints);

      // Calculations
      let totalMinutes = 0;
      const presentUsers = new Set<string>();
      let totalCost = 0;
      const workMap = new Map();
      const userMinutesMap = new Map();

      todayPoints.forEach((p: any) => {
        const minutes = calcularPeriodo(p.entrada1, p.saida1) + calcularPeriodo(p.entrada2, p.saida2);
        totalMinutes += minutes;
        presentUsers.add(String(p.user_id));
        
        // Group minutes by user
        const userIdStr = String(p.user_id);
        if (!userMinutesMap.has(userIdStr)) {
            userMinutesMap.set(userIdStr, 0);
        }
        userMinutesMap.set(userIdStr, userMinutesMap.get(userIdStr) + minutes);

        // Prioritize entrada2_obra or entrada1_obra over work_name
        const workName = p.entrada2_obra || p.entrada1_obra || p.work_name || 'Não informada';
        if (!workMap.has(workName)) {
          workMap.set(workName, { name: workName, employees: new Set(), minutes: 0, cost: 0, userMinutes: new Map() });
        }
        const work = workMap.get(workName);
        work.employees.add(userIdStr);
        work.minutes += minutes;
        
        // Track minutes per user in this work for cost distribution
        if (!work.userMinutes.has(userIdStr)) {
            work.userMinutes.set(userIdStr, 0);
        }
        work.userMinutes.set(userIdStr, work.userMinutes.get(userIdStr) + minutes);
      });

      // Calculate cost per user and distribute to works
      userMinutesMap.forEach((totalMinutesToday, userId) => {
        try {
          const user = validUsers.find((u: any) => String(u.id) === String(userId));
          if (user && user.valor_diaria) {
            const totalHoursTodayStr = formatarMinutos(totalMinutesToday);
            const userTotalCostToday = calculateCostForUser(totalHoursTodayStr, user.valor_diaria);
            totalCost += userTotalCostToday;
            
            // Distribute to works
            workMap.forEach((work) => {
                if (work.userMinutes.has(userId)) {
                    const userMinutesInWork = work.userMinutes.get(userId);
                    const proportion = totalMinutesToday > 0 ? userMinutesInWork / totalMinutesToday : 0;
                    work.cost += userTotalCostToday * proportion;
                }
            });
          }
        } catch (e) {
          console.error("Erro ao calcular custo no dashboard:", e);
        }
      });

      const activeWorks = Array.from(workMap.values())
        .map(w => ({ name: w.name, employees: w.employees.size, hours: formatarMinutos(w.minutes), cost: w.cost }))
        .sort((a, b) => b.cost - a.cost);

      // New logic for Presence and Alerts - Consider valid users only
      const totalRegistered = validUsers.length;
      
      const employeesPresent = presentUsers.size;
      const employeesAbsent = Math.max(0, totalRegistered - employeesPresent);

      const alerts: string[] = [];
      
      // 1. No entry
      if (employeesAbsent > 0) {
        alerts.push(`⚠ ${employeesAbsent} funcionário${employeesAbsent > 1 ? 's' : ''} sem entrada registrada`);
      }

      // 2. No exit (entrada1 without saida1 OR entrada2 without saida2)
      todayPoints.forEach(p => {
        const hasE1NoS1 = p.entrada1 && !p.saida1;
        const hasE2NoS2 = p.entrada2 && !p.saida2;
        if (hasE1NoS1 || hasE2NoS2) {
          alerts.push(`⚠ ${p.user_name || 'Funcionário'} ainda não bateu ponto de saída`);
        }
      });

      // 3. GPS Alerts
      todayPoints.forEach(p => {
        const work = works.find(w => w.id === p.work_id);
        const radius = work?.radius || 200;
        const hasGpsAlert = (p.entrada1_dist !== undefined && p.entrada1_dist !== null && p.entrada1_dist > radius) || 
                            (p.saida1_dist !== undefined && p.saida1_dist !== null && p.saida1_dist > radius) || 
                            (p.entrada2_dist !== undefined && p.entrada2_dist !== null && p.entrada2_dist > radius) || 
                            (p.saida2_dist !== undefined && p.saida2_dist !== null && p.saida2_dist > radius);
        if (hasGpsAlert) {
          alerts.push(`⚠ ${p.user_name || 'Funcionário'} bateu ponto fora da área da obra`);
        }
        
        if (p.entrada1_gps_suspeito || p.saida1_gps_suspeito || p.entrada2_gps_suspeito || p.saida2_gps_suspeito) {
          alerts.push(`⚠ GPS SUSPEITO: ${p.user_name || 'Funcionário'} teve movimentação maior que 3km em menos de 2 minutos.`);
        }
        
        if (p.entrada1_gps_status === 'fraco' || p.saida1_gps_status === 'fraco' || p.entrada2_gps_status === 'fraco' || p.saida2_gps_status === 'fraco') {
          alerts.push(`⚠ Precisão GPS fraca: ${p.user_name || 'Funcionário'} registrou ponto com precisão maior que 300m.`);
        }
      });

      // 4. Incomplete hours (< 10h)
      let incompleteCount = 0;
      userMinutesMap.forEach((minutes) => {
        if (minutes < 10 * 60) {
          incompleteCount++;
        }
      });
      if (incompleteCount > 0) {
        alerts.push(`⚠ ${incompleteCount} funcionário${incompleteCount > 1 ? 's' : ''} com menos de 10h trabalhadas`);
      }

      setDashboardData({
        totalHours: formatarMinutos(totalMinutes),
        employeesPresent,
        dailyCost: totalCost,
        activeWorks,
        totalRegistered,
        employeesAbsent,
        alerts
      });
    };
    calculate();
  }, [points, users, works]);

  return (
    <div className="space-y-6">
      {/* 1. ALERTAS DO DIA (FULL WIDTH) */}
      {dashboardData.alerts.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 w-full flex items-center gap-3">
          <AlertCircle size={20} className="text-amber-500 shrink-0" />
          <div className="flex flex-col gap-1">
            {dashboardData.alerts.map((alert, i) => (
              <p key={i} className="text-sm font-medium text-amber-500">
                {alert}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* 2. VISÃO GERAL (INDICADORES) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
        <Card className="p-3 md:p-8 flex flex-col items-center justify-center h-24 md:h-40 shadow-lg border-slate-700/50">
          <p className="text-xl md:text-4xl font-black text-white tracking-tight">{dashboardData.totalHours}</p>
          <p className="text-[8px] md:text-[11px] font-bold text-slate-500 uppercase tracking-widest mt-1 md:mt-2 text-center">Total de Horas Hoje</p>
        </Card>
        
        <Card className="p-3 md:p-8 flex flex-col items-center justify-center h-24 md:h-40 shadow-lg border-slate-700/50">
          <div className="text-orange-500 mb-1 md:mb-3">
            <Users className="w-6 h-6 md:w-8 md:h-8" />
          </div>
          <p className="text-[8px] md:text-[11px] font-bold text-orange-500/80 uppercase tracking-widest text-center">Funcionários Presentes</p>
          <p className="hidden md:block text-2xl md:text-4xl font-black text-white tracking-tight mt-2">{dashboardData.employeesPresent}</p>
        </Card>

        <Card className="p-3 md:p-8 flex flex-col items-center justify-center h-24 md:h-40 shadow-lg border-slate-700/50">
          <p className="text-xl md:text-4xl font-black text-emerald-500 tracking-tight">R${dashboardData.dailyCost.toLocaleString('pt-BR', { minimumDigits: 0, maximumFractionDigits: 0 })}</p>
          <p className="text-[8px] md:text-[11px] font-bold text-slate-500 uppercase tracking-widest mt-1 md:mt-2 text-center">Custo do Dia</p>
        </Card>

        <Card className="p-3 md:p-8 flex flex-col items-center justify-center h-24 md:h-40 shadow-lg border-slate-700/50">
          <div className="text-amber-500 mb-1 md:mb-3">
            <HardHat className="w-6 h-6 md:w-8 md:h-8" />
          </div>
          <p className="text-[8px] md:text-[11px] font-bold text-amber-500/80 uppercase tracking-widest text-center">Obras Ativas</p>
          <p className="hidden md:block text-2xl md:text-4xl font-black text-white tracking-tight mt-2">{dashboardData.activeWorks.length}</p>
        </Card>
      </div>

        {/* 3. OBRAS ATIVAS HOJE */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-slate-400 px-1 uppercase tracking-widest">Obras Ativas Hoje</h3>
          <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            {dashboardData.activeWorks.map((work, i) => (
              <Card key={i} className="p-4 md:p-6 flex flex-col justify-between border-slate-700/50 shadow-md">
                <div className="mb-3 md:mb-4">
                  <h4 className="font-bold text-white text-sm md:text-lg leading-tight line-clamp-2">{work.name}</h4>
                  <p className="text-[10px] md:text-sm text-slate-500 mt-1">{work.employees} func.</p>
                </div>
                
                <div className="pt-3 md:pt-4 border-t border-slate-800/50 flex justify-between items-end">
                  <div>
                    <p className="text-sm md:text-base font-black text-white">{work.hours}</p>
                    <p className="text-[8px] md:text-[10px] font-bold text-slate-500 uppercase tracking-widest">hoje</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm md:text-base font-black text-emerald-500">R${work.cost.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
                    <p className="text-[8px] md:text-[10px] font-bold text-slate-500 uppercase tracking-widest">custo</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* 4. REGISTROS DE HOJE */}
        <Card className="p-0 overflow-hidden">
          <div className="p-5 border-b border-slate-700">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Atividade da Equipe Hoje</h3>
          </div>
          
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-800/30 text-slate-500 text-[10px] font-black uppercase tracking-widest">
                  <th className="px-6 py-4 text-center w-12">#</th>
                  <th className="px-6 py-4 text-left">Funcionário</th>
                  <th className="px-6 py-4 text-left">Obra</th>
                  <th className="px-6 py-4 text-center">Entrada</th>
                  <th className="px-6 py-4 text-center">Saída</th>
                  <th className="px-6 py-4 text-right">Horas</th>
                  <th className="px-6 py-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {recentPoints.length > 0 ? recentPoints.map((p, index) => {
                  const statusInfo = getPointStatus(p);
                  const statusLabel = statusInfo.label;
                  const statusColor = `${statusInfo.color} ${statusInfo.bg} ${statusInfo.border}`;
                  
                  return (
                    <tr key={p.id} className="hover:bg-slate-800/40 transition-colors group">
                      <td className="px-6 py-4 text-center text-[10px] font-black text-slate-600 group-hover:text-slate-400">
                        {index + 1}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 bg-slate-800 rounded flex items-center justify-center text-slate-400 font-bold text-[10px] border border-slate-700">
                            {p.user_name?.charAt(0)}
                          </div>
                          <span className="text-sm font-bold text-slate-200">{p.user_name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-slate-400">
                          <Building2 size={12} className="text-slate-600" />
                          <span className="text-xs font-medium">
                            {p.entrada2_obra || p.entrada1_obra || p.work_name || '---'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-slate-300 text-center">{p.entrada1 || '--:--'}</td>
                      <td className="px-6 py-4 text-sm font-bold text-slate-300 text-center">{p.saida2 || p.saida1 || '--:--'}</td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-sm font-black text-white">
                          {p.total_hours} h
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex justify-center">
                          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded border ${statusColor}`}>
                            <span className="text-[10px] font-black uppercase tracking-wider">
                              {statusLabel}
                            </span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-slate-500 italic text-sm">
                      Nenhum registro de atividade para hoje.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden flex flex-col divide-y divide-slate-800">
            {recentPoints.length > 0 ? recentPoints.map((p, index) => {
              const statusInfo = getPointStatus(p);
              const statusLabel = statusInfo.label;
              const statusColor = `${statusInfo.color} ${statusInfo.bg} ${statusInfo.border}`;

              return (
                <div key={p.id} className="p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center text-orange-500 font-bold text-sm border border-slate-700">
                        {p.user_name?.charAt(0)}
                      </div>
                      <div>
                        <p className="text-base font-bold text-white leading-tight">{p.user_name}</p>
                        <div className="flex items-center gap-1.5 text-slate-400 mt-0.5">
                          <Building2 size={12} className="text-slate-500" />
                          <span className="text-xs font-medium truncate max-w-[150px]">
                            {p.entrada2_obra || p.entrada1_obra || p.work_name || '---'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className={`flex items-center gap-1 px-2 py-1 rounded border ${statusColor}`}>
                      <span className="text-[9px] font-black uppercase tracking-wider">
                        {statusLabel}
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center bg-slate-800/30 p-3 rounded-xl border border-slate-800/50">
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Entrada</p>
                        <p className="text-sm font-bold text-white">{p.entrada1 || '--:--'}</p>
                      </div>
                      <div className="w-4 border-t border-slate-600"></div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Saída</p>
                        <p className="text-sm font-bold text-white">{p.saida2 || p.saida1 || '--:--'}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Horas</p>
                      <p className="text-sm font-black text-orange-500">{p.total_hours}h</p>
                    </div>
                  </div>
                </div>
              );
            }) : (
              <div className="p-8 text-center text-slate-500 italic text-sm">
                Nenhum registro de atividade para hoje.
              </div>
            )}
          </div>
        </Card>
    </div>
  );
}

function UsersView({ user, users, onRefresh }: { user: UserData, users: UserData[], onRefresh: () => void }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [formData, setFormData] = useState({ 
    usuario: '', 
    senha: '', 
    nome: '', 
    nivel: 'funcionario' as Role, 
    cargo: '', 
    telefone: '', 
    valor_diaria: '' as string | number 
  });
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ id: string, show: boolean } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const isSubmittingRef = useRef(false);
  const isDeletingRef = useRef(false);

  const deleteFuncionario = (id: string | number) => {
    if (String(id) === String(user.id)) {
      alert("Você não pode excluir o usuário atualmente logado.");
      return;
    }
    const targetUser = users.find(u => String(u.id) === String(id));
    if (targetUser?.role === 'admin_master') {
      alert("O Administrador Master não pode ser excluído.");
      return;
    }
    setDeleteConfirmation({ id: String(id), show: true });
  };

  const confirmDelete = async () => {
    if (!deleteConfirmation || isDeletingRef.current) return;
    
    isDeletingRef.current = true;
    setIsDeleting(true);
    try {
      await storage.deleteUser(deleteConfirmation.id);
      
      // Also delete their points
      const allPoints = await storage.getPoints();
      const filteredPoints = allPoints.filter(p => String(p.user_id) !== String(deleteConfirmation.id));
      await storage.savePoints(filteredPoints);
  
      await onRefresh();
      setDeleteConfirmation(null);
    } catch (error) {
      console.error("Error deleting user:", error);
      alert("Erro ao excluir usuário.");
    } finally {
      isDeletingRef.current = false;
      setIsDeleting(false);
    }
  };

  const salvarFuncionario = async () => {
    if (isSubmittingRef.current) return;

    if (!formData.nome || !formData.usuario || (!editingUser && !formData.senha)) {
      alert("Por favor, preencha os campos obrigatórios (Nome, Usuário e Senha).");
      return;
    }

    if (user.role === 'admin' && formData.nivel === 'admin_master') {
      alert("Você não tem permissão para criar ou editar o Administrador Master.");
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    try {
      const allUsers = await storage.getUsers();
      
      // Rule: Only one admin_master allowed
      if (formData.nivel === 'admin_master') {
        const existingAdminMaster = allUsers.find(u => u.role === 'admin_master');
        if (existingAdminMaster && (!editingUser || String(editingUser.id) !== String(existingAdminMaster.id))) {
          alert("Já existe um Administrador Master no sistema. Só é permitido um.");
          return;
        }
      }
  
      if (editingUser) {
        if (user.role === 'admin' && editingUser.role === 'admin_master') {
          alert("Você não tem permissão para editar o Administrador Master.");
          return;
        }
        const index = allUsers.findIndex(u => String(u.id) === String(editingUser.id));
        if (index !== -1) {
          allUsers[index].username = formData.usuario || "";
          allUsers[index].name = formData.nome || "";
          allUsers[index].role = (formData.nivel as Role) || "funcionario";
          allUsers[index].role_name = formData.cargo || "";
          allUsers[index].phone = formData.telefone || "";
          allUsers[index].valor_diaria = formData.valor_diaria ? Number(formData.valor_diaria) : 0;
          
          if (formData.senha) allUsers[index].senha = formData.senha;
          
          await storage.saveUser(allUsers[index]);
        }
      } else {
        // Check if username exists
        if (allUsers.some(u => u.username === formData.usuario)) {
          alert("Este nome de usuário já está em uso.");
          return;
        }
        
        try {
          const email = formData.usuario.includes('@') ? formData.usuario : `${formData.usuario}@areng.com`;
          const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, formData.senha);
          
          const newUser: UserData = {
            id: userCredential.user.uid,
            username: formData.usuario || "",
            senha: formData.senha || "",
            name: formData.nome || "",
            role: (formData.nivel as Role) || "funcionario",
            role_name: formData.cargo || "",
            phone: formData.telefone || "",
            valor_diaria: formData.valor_diaria ? Number(formData.valor_diaria) : 0
          };
          
          await storage.saveUser(newUser);
          await secondaryAuth.signOut();
        } catch (error: any) {
          console.error("Erro ao criar usuário no Firebase Auth:", error);
          if (error.code === 'auth/email-already-in-use') {
            alert("Este nome de usuário já está em uso no sistema de autenticação.");
          } else if (error.code === 'auth/weak-password') {
            alert("A senha deve ter pelo menos 6 caracteres.");
          } else {
            alert("Erro ao criar usuário: " + error.message);
          }
          return;
        }
      }
  
      alert(editingUser ? "Funcionário atualizado" : "Funcionário cadastrado com sucesso");
      setIsModalOpen(false);
      await onRefresh();
      setFormData({ usuario: '', senha: '', nome: '', nivel: 'funcionario', cargo: '', telefone: '', valor_diaria: '' });
      setEditingUser(null);
    } catch (error) {
      console.error("Error saving user:", error);
      alert("Erro ao salvar usuário. Verifique os campos.");
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    salvarFuncionario();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold text-slate-400">Lista de Colaboradores</h3>
        <Button onClick={() => { setEditingUser(null); setFormData({ usuario: '', senha: '', nome: '', nivel: 'funcionario', cargo: '', telefone: '', valor_diaria: '' }); setIsModalOpen(true); }}>
          <Plus size={18} /> Novo Funcionário
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6">
        {users.map(u => (
          <Card key={u.id} className="group hover:border-orange-600/50 transition-colors p-4 md:p-6 flex flex-col">
            <div className="flex flex-col md:flex-row justify-between items-start mb-4 md:mb-6 gap-3 md:gap-0">
              <div className="w-10 h-10 md:w-12 md:h-12 bg-slate-900 rounded-xl md:rounded-2xl flex items-center justify-center border border-slate-700 group-hover:bg-orange-600 group-hover:border-orange-500 transition-all shrink-0">
                <User className="text-orange-500 group-hover:text-white w-5 h-5 md:w-6 md:h-6" />
              </div>
              <div className="flex gap-1.5 md:gap-2 self-end md:self-auto">
                {u.role !== 'admin_master' && (user.role === 'admin' || user.role === 'admin_master') && (
                  <>
                    <button onClick={() => { 
                      setEditingUser(u); 
                      setFormData({ 
                        nome: u.name,
                        cargo: u.role_name || '',
                        telefone: u.phone || '',
                        valor_diaria: u.valor_diaria || '',
                        usuario: u.username,
                        senha: '',
                        nivel: u.role
                      }); 
                      setIsModalOpen(true); 
                    }} className="p-1.5 md:p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-all"><Edit2 className="w-4 h-4" /></button>
                    <button onClick={() => deleteFuncionario(u.id)} className="p-1.5 md:p-2 hover:bg-red-500/20 rounded-lg text-slate-400 hover:text-red-500 transition-all"><Trash2 className="w-4 h-4" /></button>
                  </>
                )}
                {u.role === 'admin_master' && user.role === 'admin_master' && (
                  <button onClick={() => { 
                    setEditingUser(u); 
                    setFormData({ 
                      nome: u.name,
                      cargo: u.role_name || '',
                      telefone: u.phone || '',
                      valor_diaria: u.valor_diaria || '',
                      usuario: u.username,
                      senha: '',
                      nivel: u.role
                    }); 
                    setIsModalOpen(true); 
                  }} className="p-1.5 md:p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-all"><Edit2 className="w-4 h-4" /></button>
                )}
              </div>
            </div>
            <h4 className="text-sm md:text-lg font-bold text-white mb-1 line-clamp-2 md:truncate">{u.name}</h4>
            <p className="text-[10px] md:text-xs font-bold text-orange-500 uppercase tracking-widest mb-3 md:mb-4 truncate">{u.role_name}</p>
            
            <div className="space-y-2 md:space-y-3 pt-3 md:pt-4 border-t border-slate-700 mt-auto">
              <div className="flex items-center gap-2 md:gap-3 text-slate-400">
                <Briefcase className="text-slate-600 shrink-0 w-3 h-3 md:w-4 md:h-4" />
                <span className="text-[10px] md:text-sm truncate">{u.role === 'admin_master' ? 'Admin Master' : u.role === 'admin' ? 'Administrador' : 'Funcionário'}</span>
              </div>
              <div className="flex items-center gap-2 md:gap-3 text-slate-400">
                <Phone className="text-slate-600 shrink-0 w-3 h-3 md:w-4 md:h-4" />
                <span className="text-[10px] md:text-sm truncate">{u.phone}</span>
              </div>
              {u.valor_diaria && (
                <div className="flex items-center gap-2 md:gap-3 text-slate-400">
                  <span className="font-bold text-emerald-500 text-[10px] md:text-sm">R$ {u.valor_diaria.toFixed(2)}</span>
                  <span className="text-[8px] md:text-xs uppercase tracking-widest">/ Diária</span>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>

      <Modal isOpen={!!deleteConfirmation?.show} onClose={() => setDeleteConfirmation(null)} title="Confirmar Exclusão">
        <div className="space-y-4">
          <p className="text-white">Tem certeza que deseja excluir este funcionário?</p>
          <div className="flex gap-4 pt-4">
            <Button onClick={() => setDeleteConfirmation(null)} variant="secondary" className="w-full" disabled={isDeleting}>Cancelar</Button>
            <Button onClick={confirmDelete} className="w-full bg-red-600 hover:bg-red-700" loading={isDeleting}>Excluir Funcionário</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingUser ? "Editar Funcionário" : "Novo Funcionário"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="Nome Completo" value={formData.nome} onChange={e => setFormData({ ...formData, nome: e.target.value })} required disabled={isSubmitting} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Cargo" value={formData.cargo} onChange={e => setFormData({ ...formData, cargo: e.target.value })} required disabled={isSubmitting} />
            <Input label="Valor da Diária (R$)" type="number" value={formData.valor_diaria.toString()} onChange={e => setFormData({ ...formData, valor_diaria: e.target.value })} disabled={isSubmitting} />
          </div>
          <Input label="Telefone" value={formData.telefone} onChange={e => setFormData({ ...formData, telefone: e.target.value })} required disabled={isSubmitting} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Usuário" value={formData.usuario} onChange={e => setFormData({ ...formData, usuario: e.target.value })} required disabled={isSubmitting} />
            <Input label="Senha" type="password" value={formData.senha} onChange={e => setFormData({ ...formData, senha: e.target.value })} required={!editingUser} disabled={isSubmitting} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Nível de Acesso</label>
            <select 
              value={formData.nivel} 
              onChange={e => setFormData({ ...formData, nivel: e.target.value as Role })}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-600/50 transition-all"
              disabled={isSubmitting}
            >
              <option value="funcionario">Funcionário</option>
              {(user.role === 'admin_master' || user.role === 'admin') && (
                <option value="admin">Administrador</option>
              )}
              {user.role === 'admin_master' && (!users.some(u => u.role === 'admin_master') || (editingUser && editingUser.role === 'admin_master')) && (
                <option value="admin_master">Admin Master</option>
              )}
            </select>
          </div>
          <div className="pt-4">
            <Button type="submit" className="w-full py-3" loading={isSubmitting}>{editingUser ? 'Salvar Alterações' : 'Cadastrar Funcionário'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function WorksView({ user, works, onRefresh }: { user: UserData, works: Work[], onRefresh: () => void }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWork, setEditingWork] = useState<Work | null>(null);
  const [formData, setFormData] = useState({ name: '', city: '', address: '', lat: '', lng: '', radius: '' });
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ id: string, show: boolean, hasLinkedPoints: boolean } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const isSubmittingRef = useRef(false);
  const isDeletingRef = useRef(false);

  const deleteObra = async (id: string) => {
    if (user.role !== 'admin' && user.role !== 'admin_master') {
      alert('Você não tem permissão para excluir obras.');
      return;
    }

    const allPoints = await storage.getPoints();
    const hasLinkedPoints = allPoints.some((p: any) => String(p.work_id) === String(id));

    setDeleteConfirmation({ id, show: true, hasLinkedPoints });
  };

  const confirmDelete = async () => {
    if (!deleteConfirmation || isDeletingRef.current) return;
    
    isDeletingRef.current = true;
    setIsDeleting(true);
    try {
      await storage.deleteWork(deleteConfirmation.id);
      await onRefresh();
      setDeleteConfirmation(null);
    } catch (error) {
      console.error("Error deleting work:", error);
      alert("Erro ao excluir obra.");
    } finally {
      isDeletingRef.current = false;
      setIsDeleting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingRef.current) return;
    
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    try {
      let workToSave: Work;
      
      if (editingWork) {
        workToSave = {
          ...editingWork,
          name: formData.name || "",
          city: formData.city || "",
          address: formData.address || "",
          lat: formData.lat ? Number(formData.lat) : 0,
          lng: formData.lng ? Number(formData.lng) : 0,
          radius: formData.radius ? Number(formData.radius) : 0
        };
      } else {
        workToSave = {
          id: crypto.randomUUID(),
          name: formData.name || "",
          city: formData.city || "",
          address: formData.address || "",
          lat: formData.lat ? Number(formData.lat) : 0,
          lng: formData.lng ? Number(formData.lng) : 0,
          radius: formData.radius ? Number(formData.radius) : 0
        };
      }

      await storage.saveWork(workToSave);
      setIsModalOpen(false);
      await onRefresh();
      setFormData({ name: '', city: '', address: '', lat: '', lng: '', radius: '' });
      setEditingWork(null);
    } catch (error) {
      console.error("Error saving work:", error);
      alert("Erro ao salvar obra. Verifique os campos.");
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold text-slate-400">Lista de Obras</h3>
        <Button onClick={() => { setEditingWork(null); setFormData({ name: '', city: '', address: '', lat: '', lng: '', radius: '' }); setIsModalOpen(true); }}>
          <Plus size={18} /> Nova Obra
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6">
        {works.map(w => (
          <Card key={w.id} className="group hover:border-orange-600/50 transition-colors p-4 md:p-6 flex flex-col">
            <div className="flex flex-col md:flex-row justify-between items-start mb-4 md:mb-6 gap-3 md:gap-0">
              <div className="w-10 h-10 md:w-12 md:h-12 bg-slate-900 rounded-xl md:rounded-2xl flex items-center justify-center border border-slate-700 group-hover:bg-orange-600 group-hover:border-orange-500 transition-all shrink-0">
                <MapIcon className="text-orange-500 group-hover:text-white w-5 h-5 md:w-6 md:h-6" />
              </div>
              <div className="flex gap-1.5 md:gap-2 self-end md:self-auto">
                <button onClick={() => { setEditingWork(w); setFormData({ name: w.name, city: w.city, address: w.address, lat: w.lat?.toString() || '', lng: w.lng?.toString() || '', radius: w.radius?.toString() || '' }); setIsModalOpen(true); }} className="p-1.5 md:p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-all"><Edit2 className="w-4 h-4" /></button>
                <button onClick={() => deleteObra(w.id)} className="p-1.5 md:p-2 hover:bg-red-500/20 rounded-lg text-slate-400 hover:text-red-500 transition-all"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
            <h4 className="text-sm md:text-lg font-bold text-white mb-1 line-clamp-2 md:truncate">{w.name}</h4>
            <p className="text-[10px] md:text-xs font-bold text-orange-500 uppercase tracking-widest mb-3 md:mb-4 truncate">{w.city}</p>
            
            <div className="space-y-2 md:space-y-3 pt-3 md:pt-4 border-t border-slate-700 mt-auto">
              <div className="flex items-start gap-2 md:gap-3 text-slate-400">
                <MapPin className="text-slate-600 mt-0.5 shrink-0 w-3 h-3 md:w-4 md:h-4" />
                <span className="line-clamp-2 text-[10px] md:text-sm leading-tight">{w.address}</span>
              </div>
              {w.radius && (
                <div className="flex items-center gap-2 md:gap-3 text-slate-400">
                  <Info className="text-slate-600 w-3 h-3 md:w-4 md:h-4" />
                  <span className="text-[10px] md:text-sm">Raio: {w.radius}m</span>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>

      <Modal isOpen={!!deleteConfirmation?.show} onClose={() => setDeleteConfirmation(null)} title="Confirmar Exclusão">
        <div className="space-y-4">
          <p className="text-white">Tem certeza que deseja excluir esta obra?</p>
          {deleteConfirmation?.hasLinkedPoints && (
            <p className="text-red-500 font-bold">Esta obra possui registros vinculados. Excluir mesmo assim?</p>
          )}
          <div className="flex gap-4 pt-4">
            <Button onClick={() => setDeleteConfirmation(null)} variant="secondary" className="w-full" disabled={isDeleting}>Cancelar</Button>
            <Button onClick={confirmDelete} className="w-full bg-red-600 hover:bg-red-700" loading={isDeleting}>Excluir Obra</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingWork ? "Editar Obra" : "Nova Obra"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="Nome da Obra" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required disabled={isSubmitting} />
          <Input label="Cidade" value={formData.city} onChange={e => setFormData({ ...formData, city: e.target.value })} required disabled={isSubmitting} />
          <Input label="Endereço" value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} required disabled={isSubmitting} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Latitude" value={formData.lat} onChange={e => setFormData({ ...formData, lat: e.target.value })} required disabled={isSubmitting} />
            <Input label="Longitude" value={formData.lng} onChange={e => setFormData({ ...formData, lng: e.target.value })} required disabled={isSubmitting} />
          </div>
          <Input label="Raio Permitido (metros)" type="number" value={formData.radius} onChange={e => setFormData({ ...formData, radius: e.target.value })} required disabled={isSubmitting} />
          <div className="pt-4">
            <Button type="submit" className="w-full py-3" loading={isSubmitting}>{editingWork ? 'Salvar Alterações' : 'Cadastrar Obra'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function HistoryView({ user, points }: { user: UserData, points: PointRecord[] }) {
  const userPoints = points.filter(p => p.funcionario_id === user.id || p.user_id === user.id);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6">
        {userPoints.map(p => (
          <Card key={p.id} className="p-6">
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-6">
              <div>
                <h4 className="text-lg font-bold text-white">{new Date(p.date + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</h4>
                <div className="flex items-center gap-2 mt-1">
                  <MapIcon size={14} className="text-orange-500" />
                  <span className="text-xs font-bold text-orange-500 uppercase tracking-widest">Obra: {p.work_name || 'Não informada'}</span>
                </div>
              </div>
              <div className="text-right flex items-center gap-3">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Total:</span>
                <span className="px-3 py-1 bg-slate-900 rounded-lg text-sm font-black text-white border border-slate-700">
                  {p.total_hours}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <PointHistoryItem label="Entrada 1" time={p.entrada1} obra={p.entrada1_obra || p.work_name} />
              <PointHistoryItem label="Saída 1" time={p.saida1} />
              <PointHistoryItem label="Entrada 2" time={p.entrada2} obra={p.entrada2_obra || p.entrada1_obra || p.work_name} />
              <PointHistoryItem label="Saída 2" time={p.saida2} />
            </div>
          </Card>
        ))}

        {userPoints.length === 0 && (
          <div className="text-center py-20 bg-slate-900/50 rounded-3xl border border-dashed border-slate-800">
            <Calendar className="mx-auto mb-4 opacity-20" size={48} />
            <p className="text-slate-500">Nenhum registro encontrado no seu histórico.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function PointHistoryItem({ label, time, obra }: { label: string, time: string, obra?: string }) {
  return (
    <div className="p-3 bg-slate-900/50 rounded-xl border border-slate-800/50 text-center">
      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-sm font-bold ${time ? 'text-white' : 'text-slate-700'}`}>{time || '--:--'}</p>
      {obra && <p className="text-[9px] font-bold text-orange-500 uppercase mt-1 truncate">{obra}</p>}
    </div>
  );
}

function PointsView({ user, points, users, works, onRefresh }: { user: UserData, points: PointRecord[], users: UserData[], works: Work[], onRefresh: () => void }) {
  const [filters, setFilters] = useState({
    userId: '',
    workId: '',
    startDate: '',
    endDate: ''
  });
  const [selectedPoint, setSelectedPoint] = useState<PointRecord | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [editFormData, setEditFormData] = useState<any>(null);
  const [manualFormData, setManualFormData] = useState<any>({ user_id: '', date: '', entrada1: '', saida1: '', entrada2: '', saida2: '', entrada1_obra: '', entrada2_obra: '', obs: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSystemRestoreModalOpen, setIsSystemRestoreModalOpen] = useState(false);
  const [systemSnapshots, setSystemSnapshots] = useState<{key: string, timestamp: string, count: number}[]>([]);

  const handleSystemRestoreOpen = async () => {
    const snapshots = await backupManager.getSnapshots();
    setSystemSnapshots(snapshots);
    setIsSystemRestoreModalOpen(true);
  };

  const processSystemRestore = async (key: string) => {
    if (!confirm('Tem certeza que deseja restaurar este backup? Os dados atuais serão mesclados com os do backup.')) return;
    setIsSubmitting(true);
    try {
      const backupPoints = await backupManager.restoreSnapshot(key);
      if (backupPoints.length === 0) {
        alert('Backup vazio ou inválido.');
        return;
      }

      const currentPoints = await storage.getPoints();
      let updatedCount = 0;

      for (const bp of backupPoints) {
        let cp = currentPoints.find(p => p.id === bp.id || (p.user_id === bp.user_id && p.date === bp.date));
        let isNew = false;

        if (!cp) {
          cp = { ...bp, id: crypto.randomUUID() };
          isNew = true;
        }

        let changed = false;
        if (bp.entrada1 && !cp.entrada1) { cp.entrada1 = bp.entrada1; changed = true; }
        if (bp.saida1 && !cp.saida1) { cp.saida1 = bp.saida1; changed = true; }
        if (bp.entrada2 && !cp.entrada2) { cp.entrada2 = bp.entrada2; changed = true; }
        if (bp.saida2 && !cp.saida2) { cp.saida2 = bp.saida2; changed = true; }

        if (changed) {
          cp.total_hours = calcularHorasRecord(cp);
          cp.status = calculateWorkStatus(cp);
          if (isNew) {
            currentPoints.push(cp);
          }
          updatedCount++;
        }
      }

      if (updatedCount > 0) {
        await storage.savePoints(currentPoints);
        await onRefresh();
        alert(`Restauração do sistema concluída! ${updatedCount} registros foram atualizados ou criados.`);
      } else {
        alert("Nenhum dado novo para restaurar do backup.");
      }
      setIsSystemRestoreModalOpen(false);
    } catch (e) {
      console.error('Erro ao restaurar do sistema:', e);
      alert('Erro ao restaurar backup.');
    } finally {
      setIsSubmitting(false);
    }
  };




    
    setIsSubmitting(true);

    try {
      const data = await pendingImportFile.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

      if (json.length === 0) {
        alert("Planilha vazia.");
        setIsSubmitting(false);
        return;
      }

      const rows = json.slice(1);
      console.log(`Lendo ${rows.length} linhas.`);

      const groupedData: Record<string, Record<string, Record<string, string[]>>> = {};
      let processedCount = 0;

      rows.forEach((row: any[]) => {
        let dateStr = '', timeStr = '', typeStr = '', name = 'Sem Nome', work = 'Sem Obra';

        // Analyze each cell
        row.forEach((cell) => {
          const val = String(cell).trim();
          if (!val) return;

          // 1. Detect Date/Time
          const matchDateTime = val.match(/(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
          if (matchDateTime) {
            dateStr = `${matchDateTime[3]}-${matchDateTime[2]}-${matchDateTime[1]}`;
            if (matchDateTime[4]) timeStr = `${matchDateTime[4]}:${matchDateTime[5]}`;
          } else if (/\d{2}:\d{2}/.test(val)) {
            timeStr = val;
          }

          // 2. Detect Type
          if (/entrada|saida/i.test(val)) typeStr = val;

          // 3. Detect Name (check against known users)
          const userMatch = users.find(u => (u.name || '').toLowerCase() === val.toLowerCase() || (u.username || '').toLowerCase() === val.toLowerCase());
          if (userMatch) name = userMatch.name || val;

          // 4. Detect Work (check against known works)
          const workMatch = works.find(w => (w.name || '').toLowerCase() === val.toLowerCase());
          if (workMatch) work = workMatch.name || val;
        });

        if (dateStr && timeStr) {
          if (importFilters.startDate && dateStr < importFilters.startDate) return;
          if (importFilters.endDate && dateStr > importFilters.endDate) return;

          if (!groupedData[name]) groupedData[name] = {};
          if (!groupedData[name][dateStr]) groupedData[name][dateStr] = {};
          if (!groupedData[name][dateStr][work]) groupedData[name][dateStr][work] = [];
          
          // Map type to index
          let timeIdx = 0;
          if (/extra/i.test(typeStr)) {
            timeIdx = /saida/i.test(typeStr) ? 3 : 2;
          } else {
            timeIdx = /saida/i.test(typeStr) ? 1 : 0;
          }
          
          groupedData[name][dateStr][work][timeIdx] = timeStr;
          processedCount++;
        }
      });

      console.log(`Registros processados: ${processedCount}`);
      
      if (processedCount === 0) {
        alert("Nenhum dado válido encontrado na planilha.");
        setIsSubmitting(false);
        return;
      }

      const allPoints = await storage.getPoints();
      let updatedCount = 0;

      for (const name in groupedData) {
        const userObj = users.find(u => (u.name || '').toLowerCase() === String(name).toLowerCase() || (u.username || '').toLowerCase() === String(name).toLowerCase());
        
        for (const dateStr in groupedData[name]) {
          for (const work in groupedData[name][dateStr]) {
            const times = groupedData[name][dateStr][work];

            let point = allPoints.find(p => 
              (userObj ? String(p.user_id) === String(userObj.id) : p.user_name === name) && 
              p.date === dateStr
            );
            let isNew = false;

            if (!point) {
              point = {
                id: crypto.randomUUID(),
                user_id: userObj ? String(userObj.id) : '0',
                funcionario_id: userObj ? String(userObj.id) : '0',
                user_name: name,
                date: dateStr,
                entrada1: '--:--', saida1: '--:--', entrada2: '--:--', saida2: '--:--',
                entrada1_lat: 0, entrada1_lng: 0, entrada1_acc: 0, entrada1_address: '',
                saida1_lat: 0, saida1_lng: 0, saida1_acc: 0, saida1_address: '',
                entrada2_lat: 0, entrada2_lng: 0, entrada2_acc: 0, entrada2_address: '',
                saida2_lat: 0, saida2_lng: 0, saida2_acc: 0, saida2_address: '',
                obs: `Importado da planilha - Obra: ${work}`,
                total_hours: '00:00',
                status: WorkStatus.NAO_INICIADO,
                editado_manual: 1
              };
              isNew = true;
            }

            let changed = false;

            if (times[0] && (!point.entrada1 || point.entrada1 === '--:--')) { point.entrada1 = times[0]; changed = true; }
            if (times[1] && (!point.saida1 || point.saida1 === '--:--')) { point.saida1 = times[1]; changed = true; }
            if (times[2] && (!point.entrada2 || point.entrada2 === '--:--')) { point.entrada2 = times[2]; changed = true; }
            if (times[3] && (!point.saida2 || point.saida2 === '--:--')) { point.saida2 = times[3]; changed = true; }

            if (changed) {
              point.total_hours = calcularHorasRecord(point);
              point.status = calculateWorkStatus(point);
              if (isNew) {
                allPoints.push(point);
              }
              updatedCount++;
            }
          }
        }
      }

      if (updatedCount > 0) {
        await storage.savePoints(allPoints);
        await onRefresh();
        alert("Dados atualizados com sucesso");
      } else {
        alert("Nenhum dado novo para importar.");
      }

      setIsImportModalOpen(false);
      setPendingImportFile(null);

    } catch (error) {
      console.error("Erro ao importar planilha:", error);
      alert("Erro ao processar a planilha. Verifique o formato.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const saveManualPoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const allPoints = await storage.getPoints();
      const userObj = users.find(u => String(u.id) === String(manualFormData.user_id));
      
      const newPoint: PointRecord = {
        id: crypto.randomUUID(),
        user_id: String(manualFormData.user_id),
        funcionario_id: String(manualFormData.user_id),
        user_name: userObj?.name || '---',
        date: manualFormData.date,
        entrada1: manualFormData.entrada1,
        saida1: manualFormData.saida1,
        entrada2: manualFormData.entrada2,
        saida2: manualFormData.saida2,
        entrada1_obra: manualFormData.entrada1_obra,
        entrada2_obra: manualFormData.entrada2_obra,
        obs: manualFormData.obs,
        editado_manual: 1,
        total_hours: '00:00',
        status: manualFormData.manual_status || WorkStatus.NAO_INICIADO,
        entrada1_lat: 0, entrada1_lng: 0, entrada1_acc: 0, entrada1_address: '',
        saida1_lat: 0, saida1_lng: 0, saida1_acc: 0, saida1_address: '',
        entrada2_lat: 0, entrada2_lng: 0, entrada2_acc: 0, entrada2_address: '',
        saida2_lat: 0, saida2_lng: 0, saida2_acc: 0, saida2_address: '',
      };

      newPoint.total_hours = calcularHorasRecord(newPoint);
      allPoints.push(newPoint);
      await storage.savePoints(allPoints);

      setIsManualModalOpen(false);
      setManualFormData({ user_id: '', date: '', entrada1: '', saida1: '', entrada2: '', saida2: '', entrada1_obra: '', entrada2_obra: '', obs: '' });
      await onRefresh();
    } finally {
      setIsSubmitting(false);
    }
  };
  const [isWarningModalOpen, setIsWarningModalOpen] = useState(false);
  const [warningContent, setWarningContent] = useState<string[]>([]);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportType, setExportType] = useState<'pdf' | 'excel'>('pdf');
  const [diariaValue, setDiariaValue] = useState<string>('180');

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [pointToDelete, setPointToDelete] = useState<number | null>(null);

  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [locationData, setLocationData] = useState<{ name: string, lat: number, lng: number, acc: number, dist: number | null, status: string, suspeito?: number, gps_status?: string }[] | null>(null);

  const validUsers = users.filter(u => u.role !== 'admin_master');
  const validUserIds = new Set(validUsers.map(u => String(u.id)));

  const filteredPoints = points.filter(p => {
    if (!validUserIds.has(String(p.user_id))) return false;
    if (filters.userId && String(p.user_id) !== String(filters.userId)) return false;
    if (filters.workId && String(p.work_id) !== String(filters.workId)) return false;
    if (filters.startDate && p.date < filters.startDate) return false;
    if (filters.endDate && p.date > filters.endDate) return false;
    return true;
  });

  const confirmDelete = (id: string | number) => {
    setPointToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const executeDelete = async () => {
    if (!pointToDelete) return;
    try {
      await storage.deletePoint(pointToDelete);
      setIsDeleteModalOpen(false);
      setPointToDelete(null);
      await onRefresh();
    } catch (error) {
      console.error("Error deleting point:", error);
      alert("Erro ao excluir registro.");
    }
  };

  const handleEditPoint = (p: PointRecord) => {
    setEditFormData({ ...p });
    setIsEditModalOpen(true);
  };

  const showWarning = (p: PointRecord) => {
    const warnings = [];
    if (p.obs) warnings.push(`Observação: ${p.obs}`);
    if (p.editado_manual) warnings.push('Este registro foi editado manualmente por um administrador.');
    
    if (p.entrada1_gps_suspeito || p.saida1_gps_suspeito || p.entrada2_gps_suspeito || p.saida2_gps_suspeito) {
      warnings.push('⚠ GPS SUSPEITO: Movimentação maior que 3km em menos de 2 minutos detectada.');
    }
    
    if (p.entrada1_gps_status === 'fraco' || p.saida1_gps_status === 'fraco' || p.entrada2_gps_status === 'fraco' || p.saida2_gps_status === 'fraco') {
      warnings.push('⚠ Precisão GPS fraca: A precisão do GPS foi maior que 300 metros em um dos registros.');
    }

    setWarningContent(warnings);
    setIsWarningModalOpen(true);
  };

  const showLocation = (p: PointRecord) => {
    const workE1 = works.find(w => w.name === p.entrada1_obra) || works.find(w => w.id === p.work_id);
    const workE2 = works.find(w => w.name === p.entrada2_obra) || workE1;
    
    const radiusE1 = workE1?.radius || 200;
    const radiusE2 = workE2?.radius || 200;

    const locations = [];
    if (p.entrada1_lat && p.entrada1_lng) {
      const dist = p.entrada1_dist ?? null;
      const status = dist !== null ? (dist <= radiusE1 ? "Dentro da obra" : "Fora da obra") : "Desconhecido";
      locations.push({ name: 'Entrada 1', lat: p.entrada1_lat, lng: p.entrada1_lng, acc: p.entrada1_acc || 0, dist, status, suspeito: p.entrada1_gps_suspeito, gps_status: p.entrada1_gps_status });
    }
    if (p.saida1_lat && p.saida1_lng) {
      const dist = p.saida1_dist ?? null;
      const status = dist !== null ? (dist <= radiusE1 ? "Dentro da obra" : "Fora da obra") : "Desconhecido";
      locations.push({ name: 'Saída 1', lat: p.saida1_lat, lng: p.saida1_lng, acc: p.saida1_acc || 0, dist, status, suspeito: p.saida1_gps_suspeito, gps_status: p.saida1_gps_status });
    }
    if (p.entrada2_lat && p.entrada2_lng) {
      const dist = p.entrada2_dist ?? null;
      const status = dist !== null ? (dist <= radiusE2 ? "Dentro da obra" : "Fora da obra") : "Desconhecido";
      locations.push({ name: 'Entrada 2', lat: p.entrada2_lat, lng: p.entrada2_lng, acc: p.entrada2_acc || 0, dist, status, suspeito: p.entrada2_gps_suspeito, gps_status: p.entrada2_gps_status });
    }
    if (p.saida2_lat && p.saida2_lng) {
      const dist = p.saida2_dist ?? null;
      const status = dist !== null ? (dist <= radiusE2 ? "Dentro da obra" : "Fora da obra") : "Desconhecido";
      locations.push({ name: 'Saída 2', lat: p.saida2_lat, lng: p.saida2_lng, acc: p.saida2_acc || 0, dist, status, suspeito: p.saida2_gps_suspeito, gps_status: p.saida2_gps_status });
    }

    if (locations.length > 0) {
      setLocationData(locations);
      setIsLocationModalOpen(true);
    } else {
      alert("Nenhuma localização registrada para este ponto.");
    }
  };

  const saveEditPoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const allPoints = await storage.getPoints();
      const index = allPoints.findIndex(p => String(p.id) === String(editFormData.id));
      if (index !== -1) {
        const updated = { ...editFormData, editado_manual: 1 };
        updated.total_hours = calcularHorasRecord(updated);
        allPoints[index] = updated;
        await storage.savePoints(allPoints);
        setIsEditModalOpen(false);
        onRefresh();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const calculateTotals = (pointsToCalculate: PointRecord[]) => {
    const totalHours = somarHoras(pointsToCalculate.map(p => p.total_hours));
    
    // Group minutes by user
    const userMinutes = pointsToCalculate.reduce((acc: any, p: PointRecord) => {
        const uid = String(p.user_id);
        const minutes = calcularPeriodo(p.entrada1, p.saida1) + calcularPeriodo(p.entrada2, p.saida2);
        acc[uid] = (acc[uid] || 0) + minutes;
        return acc;
    }, {});

    let totalDiarias = 0;
    let valorTotal = 0;

    Object.keys(userMinutes).forEach(userId => {
        try {
          const minutes = userMinutes[userId];
          const hoursStr = formatarMinutos(minutes);
          const user = users.find(u => String(u.id) === String(userId));
          const valorDiaria = user?.valor_diaria || 0;
          
          totalDiarias += calculateDiariasForUser(hoursStr);
          valorTotal += calculateCostForUser(hoursStr, valorDiaria);
        } catch (e) {
          console.error("Erro ao calcular totais no relatório:", e);
        }
    });

    const valorDiariaNum = parseFloat(diariaValue) || 0;

    return { totalHours, totalDiarias, valorDiariaNum, valorTotal };
  };

  const generatePDF = () => {
    const doc = new jsPDF();
    const { totalHours, totalDiarias, valorDiariaNum, valorTotal } = calculateTotals(filteredPoints);

    doc.setFontSize(18);
    doc.text('A&R Engenharia - Relatório de Ponto', 14, 15);
    doc.setFontSize(10);
    doc.text(`Período: ${filters.startDate ? new Date(filters.startDate + 'T00:00:00').toLocaleDateString('pt-BR') : 'Início'} até ${filters.endDate ? new Date(filters.endDate + 'T00:00:00').toLocaleDateString('pt-BR') : 'Fim'}`, 14, 22);
    
    const employeeName = filters.userId ? users.find(u => String(u.id) === String(filters.userId))?.name : 'Todos';
    const workName = filters.workId ? works.find(w => String(w.id) === String(filters.workId))?.name : 'Todas';
    doc.text(`Funcionário: ${employeeName} | Obra: ${workName}`, 14, 27);

    const tableData = filteredPoints.map(p => [
      p.user_name || '-',
      new Date(p.date + 'T00:00:00').toLocaleDateString('pt-BR'),
      p.entrada1 || '--:--',
      p.saida1 || '--:--',
      p.entrada2 || '--:--',
      p.saida2 || '--:--',
      `${p.total_hours || '00:00'}`
    ]);

    autoTable(doc, {
      startY: 30,
      head: [['Funcionário', 'Data', 'Entrada 1', 'Saída 1', 'Entrada 2', 'Saída 2', 'Horas Trabalhadas']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42] }, // slate-900
    });

    const finalY = (doc as any).lastAutoTable.finalY || 30;
    
    doc.setFontSize(12);
    doc.text(`Total de horas trabalhadas: ${totalHours}`, 14, finalY + 10);
    doc.text(`Total de diárias: ${totalDiarias}`, 14, finalY + 18);
    doc.text(`Valor da diária: R$ ${valorDiariaNum.toFixed(2)}`, 14, finalY + 26);
    doc.text(`Valor total: R$ ${valorTotal.toFixed(2)}`, 14, finalY + 34);

    doc.save('relatorio_ponto.pdf');
    setIsExportModalOpen(false);
  };

  const generateExcel = () => {
    const { totalHours, totalDiarias, valorDiariaNum, valorTotal } = calculateTotals(filteredPoints);

    const data = filteredPoints.map(p => ({
      'Funcionário': p.user_name || '-',
      'Data': new Date(p.date + 'T00:00:00').toLocaleDateString('pt-BR'),
      'Entrada 1': p.entrada1 || '--:--',
      'Saída 1': p.saida1 || '--:--',
      'Entrada 2': p.entrada2 || '--:--',
      'Saída 2': p.saida2 || '--:--',
      'Turnos': p.entrada2 ? 2 : 1,
      'Obras': (p.entrada2 && p.entrada2_obra && p.entrada2_obra !== p.entrada1_obra) ? `T1: ${p.entrada1_obra || '---'} / T2: ${p.entrada2_obra}` : (p.entrada1_obra || p.entrada2_obra || p.work_name || '---'),
      'Horas Trabalhadas': p.total_hours || '00:00'
    }));

    // Add empty row
    data.push({
      'Funcionário': '',
      'Data': '',
      'Entrada 1': '',
      'Saída 1': '',
      'Entrada 2': '',
      'Saída 2': '',
      'Turnos': '' as any,
      'Obras': '',
      'Horas Trabalhadas': '' as any
    });

    // Add totals
    data.push({
      'Funcionário': 'Total de horas trabalhadas',
      'Data': '',
      'Entrada 1': '',
      'Saída 1': '',
      'Entrada 2': '',
      'Saída 2': '',
      'Turnos': '' as any,
      'Obras': '',
      'Horas Trabalhadas': totalHours as any
    });
    data.push({
      'Funcionário': 'Total de diárias calculadas',
      'Data': '',
      'Entrada 1': '',
      'Saída 1': '',
      'Entrada 2': '',
      'Saída 2': '',
      'Turnos': '' as any,
      'Obras': '',
      'Horas Trabalhadas': totalDiarias as any
    });
    data.push({
      'Funcionário': 'Valor da diária',
      'Data': '',
      'Entrada 1': '',
      'Saída 1': '',
      'Entrada 2': '',
      'Saída 2': '',
      'Turnos': '' as any,
      'Obras': '',
      'Horas Trabalhadas': valorDiariaNum as any
    });
    data.push({
      'Funcionário': 'Valor total a pagar',
      'Data': '',
      'Entrada 1': '',
      'Saída 1': '',
      'Entrada 2': '',
      'Saída 2': '',
      'Turnos': '' as any,
      'Obras': '',
      'Horas Trabalhadas': valorTotal as any
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Registros');
    XLSX.writeFile(wb, 'relatorio_ponto.xlsx');
    setIsExportModalOpen(false);
  };

  const handleExport = (e: React.FormEvent) => {
    e.preventDefault();
    if (exportType === 'pdf') {
      generatePDF();
    } else {
      generateExcel();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mobile-header-stack">
        <h3 className="text-lg font-bold text-slate-400">Histórico de Pontos</h3>
        <div className="flex gap-3 mobile-actions-stack">

          <Button onClick={handleSystemRestoreOpen} variant="secondary" className="bg-slate-800 hover:bg-slate-700 w-full-mobile">
            <Database size={18} className="text-purple-500" /> Backup/Restaurar
          </Button>

          <Button onClick={() => setIsManualModalOpen(true)} variant="primary" className="bg-orange-600 hover:bg-orange-700 w-full-mobile">
            <Plus size={18} /> Inserir Registro Manual
          </Button>
          <div className="flex gap-3 mobile-export-grid">
            <Button onClick={() => { setExportType('pdf'); setIsExportModalOpen(true); }} variant="secondary" className="bg-slate-800 hover:bg-slate-700 flex-1">
              <FileText size={18} className="text-orange-500" /> Gerar PDF
            </Button>
            <Button onClick={() => { setExportType('excel'); setIsExportModalOpen(true); }} variant="secondary" className="bg-slate-800 hover:bg-slate-700 flex-1">
              <FileSpreadsheet size={18} className="text-emerald-500" /> Exportar Excel
            </Button>
          </div>
        </div>
      </div>

      <Card className="p-6">
        <div className="flex items-center gap-2 mb-6">
          <Filter className="text-orange-500" size={20} />
          <h3 className="text-lg font-bold">Filtros de Registros</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Funcionário</label>
            <select 
              value={filters.userId} 
              onChange={e => setFilters({ ...filters, userId: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm"
            >
              <option value="">Todos</option>
              {validUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Obra</label>
            <select 
              value={filters.workId} 
              onChange={e => setFilters({ ...filters, workId: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm"
            >
              <option value="">Todas</option>
              {works.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Data Início</label>
            <input 
              type="date" 
              value={filters.startDate} 
              onChange={e => setFilters({ ...filters, startDate: e.target.value })}
              className="w-full max-w-full box-border bg-slate-900 border border-slate-700 rounded-xl px-2 py-1.5 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Data Fim</label>
            <input 
              type="date" 
              value={filters.endDate} 
              onChange={e => setFilters({ ...filters, endDate: e.target.value })}
              className="w-full max-w-full box-border bg-slate-900 border border-slate-700 rounded-xl px-2 py-1.5 text-sm"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="secondary" onClick={() => setFilters({ userId: '', workId: '', startDate: '', endDate: '' })}>
            Limpar Filtros
          </Button>
        </div>
      </Card>

      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl mobile-table-container">
        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse mobile-cards-table">
            <thead>
              <tr className="bg-slate-800/50 text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">
                <th className="px-6 py-5">Funcionário</th>
                <th className="px-6 py-5">Status</th>
                <th className="px-6 py-5">Data</th>
                <th className="px-6 py-5">Entrada 1</th>
                <th className="px-6 py-5">Saída 1</th>
                <th className="px-6 py-5">Entrada 2</th>
                <th className="px-6 py-5">Saída 2</th>
                <th className="px-6 py-5">Horas Trabalhadas</th>
                <th className="px-6 py-5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredPoints.map(p => (
                <tr key={p.id} className="hover:bg-slate-800/30 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-slate-800 rounded-lg flex items-center justify-center text-orange-500 font-bold text-xs border border-slate-700">
                        {p.user_name?.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white">{p.user_name}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {(() => {
                      const status = getPointStatus(p);
                      return (
                        <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-tighter whitespace-nowrap ${status.bg} ${status.color}`}>
                          {status.label}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-slate-300">{new Date(p.date + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                  <td className="px-6 py-4">
                    <p className="text-sm font-bold text-emerald-500">{p.entrada1 || '--:--'}</p>
                    {p.entrada1 && <p className="text-[9px] text-slate-500 font-bold uppercase truncate max-w-[100px]">{p.entrada1_obra || p.work_name}</p>}
                  </td>
                  <td className="px-6 py-4 text-sm font-bold text-orange-500">{p.saida1 || '--:--'}</td>
                  <td className="px-6 py-4">
                    <p className="text-sm font-bold text-emerald-500">{p.entrada2 || '--:--'}</p>
                    {p.entrada2 && <p className="text-[9px] text-slate-500 font-bold uppercase truncate max-w-[100px]">{p.entrada2_obra || p.work_name}</p>}
                  </td>
                  <td className="px-6 py-4 text-sm font-bold text-orange-500">{p.saida2 || '--:--'}</td>
                  <td className="px-6 py-4">
                    <span className="px-2.5 py-1 bg-slate-800 rounded-lg text-xs font-black text-white border border-slate-700">
                      {p.total_hours}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end items-center gap-2 transition-opacity">
                      {(p.obs || p.editado_manual || p.entrada1_gps_suspeito || p.saida1_gps_suspeito || p.entrada2_gps_suspeito || p.saida2_gps_suspeito || p.entrada1_gps_status === 'fraco' || p.saida1_gps_status === 'fraco' || p.entrada2_gps_status === 'fraco' || p.saida2_gps_status === 'fraco') ? (
                        <button 
                          onClick={() => showWarning(p)} 
                          className={`p-2 rounded-lg transition-all ${
                            (p.entrada1_gps_suspeito || p.saida1_gps_suspeito || p.entrada2_gps_suspeito || p.saida2_gps_suspeito) 
                              ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30' 
                              : 'bg-amber-500/20 text-amber-500 hover:bg-amber-500/30'
                          }`}
                          title="Ver avisos/observações"
                        >
                          <AlertCircle size={16} />
                        </button>
                      ) : (
                        <div className="p-2 text-slate-600 cursor-not-allowed" title="Sem avisos">
                          <AlertCircle size={16} />
                        </div>
                      )}

                      {(user.role === 'admin_master' || user.role === 'admin') && (
                        <>
                          <button onClick={() => handleEditPoint(p)} className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-all" title="Editar registro"><Edit2 size={16} /></button>
                          <button onClick={() => confirmDelete(p.id)} className="p-2 hover:bg-red-500/20 rounded-lg text-slate-400 hover:text-red-500 transition-all" title="Excluir registro"><Trash2 size={16} /></button>
                        </>
                      )}
                      <button onClick={() => showLocation(p)} className="p-2 hover:bg-blue-500/20 rounded-lg text-slate-400 hover:text-blue-500 transition-all" title="Ver Localização"><MapPin size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden flex flex-col divide-y divide-slate-800">
          {filteredPoints.map(p => (
            <div key={p.id} className="p-4 space-y-4">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center text-orange-500 font-bold text-sm border border-slate-700">
                    {p.user_name?.charAt(0)}
                  </div>
                  <div>
                    <p className="text-base font-bold text-white leading-tight">{p.user_name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{new Date(p.date + 'T00:00:00').toLocaleDateString('pt-BR')}</p>
                  </div>
                </div>
                {(() => {
                  const status = getPointStatus(p);
                  return (
                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-tighter whitespace-nowrap ${status.bg} ${status.color}`}>
                      {status.label}
                    </span>
                  );
                })()}
              </div>

              <div className="grid grid-cols-2 gap-3 bg-slate-800/30 p-3 rounded-xl border border-slate-800/50">
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Entrada 1</p>
                  <p className="text-sm font-bold text-emerald-500">{p.entrada1 || '--:--'}</p>
                  {p.entrada1 && <p className="text-[9px] text-slate-500 font-bold uppercase truncate">{p.entrada1_obra || p.work_name}</p>}
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Saída 1</p>
                  <p className="text-sm font-bold text-orange-500">{p.saida1 || '--:--'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Entrada 2</p>
                  <p className="text-sm font-bold text-emerald-500">{p.entrada2 || '--:--'}</p>
                  {p.entrada2 && <p className="text-[9px] text-slate-500 font-bold uppercase truncate">{p.entrada2_obra || p.work_name}</p>}
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Saída 2</p>
                  <p className="text-sm font-bold text-orange-500">{p.saida2 || '--:--'}</p>
                </div>
              </div>

              <div className="flex justify-between items-center pt-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total:</span>
                  <span className="px-2.5 py-1 bg-slate-800 rounded-lg text-xs font-black text-white border border-slate-700">
                    {p.total_hours}
                  </span>
                </div>
                
                <div className="flex justify-end items-center gap-1">
                  {(p.obs || p.editado_manual || p.entrada1_gps_suspeito || p.saida1_gps_suspeito || p.entrada2_gps_suspeito || p.saida2_gps_suspeito || p.entrada1_gps_status === 'fraco' || p.saida1_gps_status === 'fraco' || p.entrada2_gps_status === 'fraco' || p.saida2_gps_status === 'fraco') ? (
                    <button 
                      onClick={() => showWarning(p)} 
                      className={`p-2 rounded-lg transition-all ${
                        (p.entrada1_gps_suspeito || p.saida1_gps_suspeito || p.entrada2_gps_suspeito || p.saida2_gps_suspeito) 
                          ? 'bg-red-500/20 text-red-500' 
                          : 'bg-amber-500/20 text-amber-500'
                      }`}
                    >
                      <AlertCircle size={16} />
                    </button>
                  ) : null}

                  {(user.role === 'admin_master' || user.role === 'admin') && (
                    <>
                      <button onClick={() => handleEditPoint(p)} className="p-2 bg-slate-800 rounded-lg text-slate-400"><Edit2 size={16} /></button>
                      <button onClick={() => confirmDelete(p.id)} className="p-2 bg-red-500/10 rounded-lg text-red-500"><Trash2 size={16} /></button>
                    </>
                  )}
                  <button onClick={() => showLocation(p)} className="p-2 bg-blue-500/10 rounded-lg text-blue-500"><MapPin size={16} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Modal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} title="Confirmar Exclusão">
        <div className="space-y-6">
          <div className="flex items-center gap-4 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl">
            <AlertCircle className="text-red-500 shrink-0" size={24} />
            <p className="text-sm text-slate-300">Tem certeza que deseja excluir este registro?</p>
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" onClick={() => setIsDeleteModalOpen(false)} className="flex-1">Cancelar</Button>
            <Button onClick={executeDelete} className="flex-1 bg-red-600 hover:bg-red-700 text-white border-none">Excluir</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isWarningModalOpen} onClose={() => setIsWarningModalOpen(false)} title="Avisos e Observações">
        <div className="space-y-4">
          {warningContent.length > 0 ? (
            warningContent.map((w, i) => (
              <div key={i} className="flex items-start gap-3 p-4 bg-slate-800 rounded-2xl border border-slate-700">
                <Info className="text-orange-500 shrink-0 mt-0.5" size={18} />
                <p className="text-sm text-slate-300 leading-relaxed">{w}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-500 italic text-center py-4">Nenhum aviso para este registro.</p>
          )}
          <div className="pt-2">
            <Button onClick={() => setIsWarningModalOpen(false)} className="w-full">Fechar</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isLocationModalOpen} onClose={() => setIsLocationModalOpen(false)} title="Localizações do Registro">
        {locationData && (
          <div className="space-y-4">
            {locationData.map((loc, index) => (
              <div key={index} className="bg-slate-800 p-4 rounded-2xl border border-slate-700 space-y-3">
                <div className="flex justify-between items-center border-b border-slate-700 pb-2">
                  <span className="text-white font-bold">{loc.name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-sm">Precisão do GPS</span>
                  <span className="text-white font-mono text-sm">{loc.acc.toFixed(1)}m</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-sm">Distância da obra</span>
                  <span className="text-white font-mono text-sm">{loc.dist !== null ? `${loc.dist.toFixed(1)}m` : 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-sm">Status</span>
                  <span className={`font-bold text-sm ${loc.status === 'Dentro da obra' ? 'text-emerald-500' : loc.status === 'Fora da obra' ? 'text-orange-500' : 'text-slate-400'}`}>
                    {loc.status}
                  </span>
                </div>
                {loc.gps_status === 'fraco' && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 text-sm">Precisão</span>
                    <span className="font-bold text-sm text-red-500">Fraca (&gt; 300m)</span>
                  </div>
                )}
                {loc.suspeito === 1 && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 text-sm">Alerta</span>
                    <span className="font-bold text-sm text-red-500">GPS SUSPEITO</span>
                  </div>
                )}
                <Button 
                  onClick={() => window.open(`https://maps.google.com/?q=${loc.lat},${loc.lng}`, '_blank')} 
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white border-none flex items-center justify-center gap-2 mt-2"
                >
                  <MapPin size={16} />
                  Abrir no Google Maps
                </Button>
              </div>
            ))}
            <div className="pt-2">
              <Button variant="secondary" onClick={() => setIsLocationModalOpen(false)} className="w-full">Fechar</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Editar Registro de Ponto">
        {editFormData && (
          <form onSubmit={saveEditPoint} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input label="Data" type="date" value={editFormData.date || ''} onChange={e => setEditFormData({ ...editFormData, date: e.target.value })} />
              <div />
              <Input label="Entrada 1" value={editFormData.entrada1 || ''} onChange={e => setEditFormData({ ...editFormData, entrada1: e.target.value })} placeholder="00:00" />
              <Input label="Saída 1" value={editFormData.saida1 || ''} onChange={e => setEditFormData({ ...editFormData, saida1: e.target.value })} placeholder="00:00" />
              <Input label="Entrada 2" value={editFormData.entrada2 || ''} onChange={e => setEditFormData({ ...editFormData, entrada2: e.target.value })} placeholder="00:00" />
              <Input label="Saída 2" value={editFormData.saida2 || ''} onChange={e => setEditFormData({ ...editFormData, saida2: e.target.value })} placeholder="00:00" />
            </div>
            
            <div className="p-4 bg-slate-800 rounded-2xl border border-slate-700 flex justify-between items-center">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total Calculado:</span>
              <span className="text-lg font-black text-orange-500">
                {calcularHorasRecord(editFormData)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input label="Obra Turno 1" value={editFormData.entrada1_obra || ''} onChange={e => setEditFormData({ ...editFormData, entrada1_obra: e.target.value })} />
              <Input label="Obra Turno 2" value={editFormData.entrada2_obra || ''} onChange={e => setEditFormData({ ...editFormData, entrada2_obra: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Status da Jornada</label>
              <select 
                value={editFormData.status || WorkStatus.TRABALHANDO} 
                onChange={e => setEditFormData({ ...editFormData, status: e.target.value as WorkStatus })}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-600/50 transition-all"
              >
                <option value={WorkStatus.TRABALHANDO}>Trabalhando</option>
                <option value={WorkStatus.PAUSADO}>Pausado</option>
                <option value={WorkStatus.ENCERRADO}>Encerrado</option>
              </select>
            </div>

            <div className="p-4 bg-slate-800/50 rounded-2xl border border-slate-700 space-y-4">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Coordenadas GPS (Opcional)</p>
              <div className="grid grid-cols-2 gap-4">
                <Input label="Lat E1" value={editFormData.entrada1_lat || ''} onChange={e => setEditFormData({ ...editFormData, entrada1_lat: e.target.value })} placeholder="Latitude" />
                <Input label="Lng E1" value={editFormData.entrada1_lng || ''} onChange={e => setEditFormData({ ...editFormData, entrada1_lng: e.target.value })} placeholder="Longitude" />
                <Input label="Lat S1" value={editFormData.saida1_lat || ''} onChange={e => setEditFormData({ ...editFormData, saida1_lat: e.target.value })} placeholder="Latitude" />
                <Input label="Lng S1" value={editFormData.saida1_lng || ''} onChange={e => setEditFormData({ ...editFormData, saida1_lng: e.target.value })} placeholder="Longitude" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input label="Lat E2" value={editFormData.entrada2_lat || ''} onChange={e => setEditFormData({ ...editFormData, entrada2_lat: e.target.value })} placeholder="Latitude" />
                <Input label="Lng E2" value={editFormData.entrada2_lng || ''} onChange={e => setEditFormData({ ...editFormData, entrada2_lng: e.target.value })} placeholder="Longitude" />
                <Input label="Lat S2" value={editFormData.saida2_lat || ''} onChange={e => setEditFormData({ ...editFormData, saida2_lat: e.target.value })} placeholder="Latitude" />
                <Input label="Lng S2" value={editFormData.saida2_lng || ''} onChange={e => setEditFormData({ ...editFormData, saida2_lng: e.target.value })} placeholder="Longitude" />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Observação</label>
              <textarea
                value={editFormData.obs || ''}
                onChange={e => setEditFormData({ ...editFormData, obs: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-600/50 transition-all h-24 resize-none"
              />
            </div>
            <div className="pt-4">
              <Button type="submit" className="w-full py-3" loading={isSubmitting}>Salvar Alterações</Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal isOpen={isManualModalOpen} onClose={() => setIsManualModalOpen(false)} title="Inserir Registro Manual">
        <form onSubmit={saveManualPoint} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Funcionário</label>
            <select 
              value={manualFormData.user_id} 
              onChange={e => setManualFormData({ ...manualFormData, user_id: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-100"
              required
            >
              <option value="">Selecione um funcionário...</option>
              {users.filter(u => u.role !== 'admin_master').map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
          <Input label="Data" type="date" value={manualFormData.date} onChange={e => setManualFormData({ ...manualFormData, date: e.target.value })} required />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Entrada 1" value={manualFormData.entrada1} onChange={e => setManualFormData({ ...manualFormData, entrada1: e.target.value })} placeholder="00:00" />
            <Input label="Saída 1" value={manualFormData.saida1} onChange={e => setManualFormData({ ...manualFormData, saida1: e.target.value })} placeholder="00:00" />
            <Input label="Entrada 2" value={manualFormData.entrada2} onChange={e => setManualFormData({ ...manualFormData, entrada2: e.target.value })} placeholder="00:00" />
            <Input label="Saída 2" value={manualFormData.saida2} onChange={e => setManualFormData({ ...manualFormData, saida2: e.target.value })} placeholder="00:00" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Obra Turno 1" value={manualFormData.entrada1_obra} onChange={e => setManualFormData({ ...manualFormData, entrada1_obra: e.target.value })} />
            <Input label="Obra Turno 2" value={manualFormData.entrada2_obra} onChange={e => setManualFormData({ ...manualFormData, entrada2_obra: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Status Manual</label>
            <select 
              value={manualFormData.manual_status || ''} 
              onChange={e => setManualFormData({ ...manualFormData, manual_status: e.target.value as any })}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-100"
            >
              <option value="">Automático</option>
              <option value="TRABALHANDO">Trabalhando</option>
              <option value="PAUSADO">Pausado</option>
              <option value="ENCERRADO">Encerrado</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Observação</label>
            <textarea
              value={manualFormData.obs}
              onChange={e => setManualFormData({ ...manualFormData, obs: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-sm text-slate-100 resize-none h-24"
            />
          </div>
          <Button type="submit" className="w-full py-4">Salvar Registro</Button>
        </form>
      </Modal>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Detalhes do Registro">
        {selectedPoint && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <PointDetail label="Entrada 1" time={selectedPoint.entrada1} />
              <PointDetail label="Saída 1" time={selectedPoint.saida1} />
              <PointDetail label="Entrada 2" time={selectedPoint.entrada2} />
              <PointDetail label="Saída 2" time={selectedPoint.saida2} />
            </div>
            
            <div className="p-4 bg-slate-900 rounded-2xl border border-slate-700">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Observações</p>
              <p className="text-sm text-slate-300 italic">"{selectedPoint.obs || 'Nenhuma observação registrada.'}"</p>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={isSystemRestoreModalOpen} onClose={() => setIsSystemRestoreModalOpen(false)} title="Restaurar do Sistema">
        <div className="space-y-4">
          <p className="text-sm text-slate-400">
            Selecione um backup diário para restaurar. Os dados do backup serão mesclados com os dados atuais (apenas campos vazios serão preenchidos).
          </p>
          <div className="max-h-60 overflow-y-auto space-y-2 pr-2">
            {systemSnapshots.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">Nenhum backup encontrado.</p>
            ) : (
              systemSnapshots.map(snap => (
                <div key={snap.key} className="flex items-center justify-between p-3 bg-slate-800 rounded-lg border border-slate-700">
                  <div>
                    <p className="font-medium text-slate-200">{new Date(snap.timestamp).toLocaleDateString('pt-BR')} às {new Date(snap.timestamp).toLocaleTimeString('pt-BR')}</p>
                    <p className="text-xs text-slate-400">{snap.count} registros salvos</p>
                  </div>
                  <Button variant="secondary" onClick={() => processSystemRestore(snap.key)} disabled={isSubmitting} className="text-xs py-1 px-3">
                    Restaurar
                  </Button>
                </div>
              ))
            )}
          </div>
          <div className="flex justify-end pt-4 border-t border-slate-800">
            <Button type="button" variant="secondary" onClick={() => setIsSystemRestoreModalOpen(false)}>Fechar</Button>
          </div>
        </div>
      </Modal>



      <Modal isOpen={isExportModalOpen} onClose={() => setIsExportModalOpen(false)} title={`Exportar ${exportType === 'pdf' ? 'PDF' : 'Excel'}`}>
        <form onSubmit={handleExport} className="space-y-4">
          <p className="text-sm text-slate-400">
            Configure o valor da diária para calcular o valor total a pagar no relatório.
          </p>
          <Input 
            label="Valor da Diária (R$)" 
            type="number" 
            value={diariaValue} 
            onChange={e => setDiariaValue(e.target.value)} 
            required 
          />
          <div className="pt-4">
            <Button type="submit" className="w-full py-3">
              {exportType === 'pdf' ? 'Gerar PDF' : 'Exportar Excel'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function PointDetail({ label, time }: { label: string, time: string }) {
  return (
    <div className="p-4 bg-slate-900 rounded-2xl border border-slate-700">
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{label}</p>
      <p className="text-xl font-black text-white mb-2">{time || '--:--'}</p>
    </div>
  );
}

function ReportsView({ points, users, works }: { points: PointRecord[], users: UserData[], works: Work[] }) {
  const [filters, setFilters] = useState({
    userId: '',
    workId: '',
    startDate: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });
  
  const [reportData, setReportData] = useState<any[]>([]);
  const [summary, setSummary] = useState({
    totalHours: '00:00',
    totalEmployees: 0,
    totalDiarias: 0,
    totalCost: 0
  });
  const [workSummary, setWorkSummary] = useState<any[]>([]);

  const generateReport = () => {
    const validUsers = users.filter(u => u.role !== 'admin_master');
    const validUserIds = new Set(validUsers.map(u => String(u.id)));

    const filtered = points.filter(p => {
      if (!validUserIds.has(String(p.user_id))) return false;
      if (filters.userId && String(p.user_id) !== String(filters.userId)) return false;
      if (filters.workId && String(p.work_id) !== String(filters.workId)) return false;
      if (filters.startDate && p.date < filters.startDate) return false;
      if (filters.endDate && p.date > filters.endDate) return false;
      return true;
    });

    const processed = filtered.map(p => {
      const user = users.find(u => String(u.id) === String(p.user_id));
      const valorDiaria = user?.valor_diaria || 0;
      const hours = p.total_hours || '00:00';
      const diarias = calculateDiariasForUser(hours);
      const cost = diarias * valorDiaria;
      
      return {
        ...p,
        calculatedHours: hours,
        diarias,
        cost,
        valorDiaria,
        workName: p.entrada2_obra || p.entrada1_obra || p.work_name || 'Não informada'
      };
    }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    setReportData(processed);

    const totalHours = somarHoras(processed.map(p => p.calculatedHours));
    const totalDiarias = processed.reduce((acc, curr) => acc + curr.diarias, 0);
    const totalCost = processed.reduce((acc, curr) => acc + curr.cost, 0);
    const uniqueEmployees = new Set(processed.map(p => String(p.user_id))).size;

    setSummary({
      totalHours,
      totalDiarias,
      totalCost,
      totalEmployees: uniqueEmployees
    });

    const workMap = new Map();
    processed.forEach(p => {
      if (!workMap.has(p.workName)) {
        workMap.set(p.workName, {
          name: p.workName,
          employees: new Set(),
          hoursList: [] as string[],
          diarias: 0,
          cost: 0
        });
      }
      const w = workMap.get(p.workName);
      w.employees.add(p.user_id);
      w.hoursList.push(p.calculatedHours);
      w.diarias += p.diarias;
      w.cost += p.cost;
    });

    setWorkSummary(Array.from(workMap.values()).map(w => ({
      ...w,
      hours: somarHoras(w.hoursList),
      employeeCount: w.employees.size
    })));
  };

  useEffect(() => {
    generateReport();
  }, [points, users, works]);

  const exportPDF = () => {
    const doc = new jsPDF('l', 'mm', 'a4');
    
    doc.setFontSize(16);
    doc.text('Relatório de Mão de Obra e Ponto', 14, 15);
    doc.setFontSize(10);
    doc.text(`Período: ${filters.startDate ? new Date(filters.startDate + 'T00:00:00').toLocaleDateString('pt-BR') : 'Início'} até ${filters.endDate ? new Date(filters.endDate + 'T00:00:00').toLocaleDateString('pt-BR') : 'Fim'}`, 14, 22);
    
    const employeeName = filters.userId ? users.find(u => String(u.id) === String(filters.userId))?.name : 'Todos';
    const workName = filters.workId ? works.find(w => String(w.id) === String(filters.workId))?.name : 'Todas';
    doc.text(`Funcionário: ${employeeName} | Obra: ${workName}`, 14, 27);

    autoTable(doc, {
      startY: 35,
      head: [['Funcionário', 'Obra', 'Data', 'Entrada', 'Saída', 'Horas', 'Diária', 'Valor']],
      body: reportData.map(p => [
        p.user_name,
        p.workName,
        new Date(p.date + 'T00:00:00').toLocaleDateString('pt-BR'),
        p.entrada1 || '--:--',
        p.saida2 || p.saida1 || '--:--',
        p.calculatedHours,
        p.diarias.toString(),
        `R$ ${p.cost.toFixed(2)}`
      ]),
      theme: 'grid',
      headStyles: { fillColor: [234, 88, 12], textColor: 255 },
      styles: { fontSize: 7 }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(12);
    doc.text('Resumo por Obra', 14, finalY);
    
    autoTable(doc, {
      startY: finalY + 5,
      head: [['Obra', 'Funcionários', 'Total Horas', 'Total Diárias', 'Custo Total']],
      body: workSummary.map(w => [
        w.name,
        w.employeeCount.toString(),
        w.hours,
        w.diarias.toString(),
        `R$ ${w.cost.toFixed(2)}`
      ]),
      theme: 'grid',
      headStyles: { fillColor: [51, 65, 85], textColor: 255 },
      styles: { fontSize: 8 }
    });

    const finalY2 = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(11);
    doc.text(`TOTAIS GERAIS:`, 14, finalY2);
    doc.text(`Horas: ${summary.totalHours} | Diárias: ${summary.totalDiarias} | Custo: R$ ${summary.totalCost.toFixed(2)}`, 14, finalY2 + 6);

    doc.save(`Relatorio_Completo_${new Date().toLocaleDateString()}.pdf`);
  };

  const exportExcel = () => {
    const mainData = reportData.map(p => ({
      'Funcionário': p.user_name,
      'Obra': p.workName,
      'Data': new Date(p.date + 'T00:00:00').toLocaleDateString('pt-BR'),
      'Entrada': p.entrada1 || '--:--',
      'Saída': p.saida2 || p.saida1 || '--:--',
      'Horas': p.calculatedHours,
      'Diária': p.diarias,
      'Valor (R$)': p.cost.toFixed(2)
    }));

    const summaryData = workSummary.map(w => ({
      'Obra': w.name,
      'Funcionários': w.employeeCount,
      'Total Horas': w.hours,
      'Total Diárias': w.diarias,
      'Custo Total (R$)': w.cost.toFixed(2)
    }));

    const totalsData = [{
      'Total Horas': summary.totalHours,
      'Total Funcionários': summary.totalEmployees,
      'Total Diárias': summary.totalDiarias,
      'Custo Total (R$)': summary.totalCost.toFixed(2)
    }];

    const wb = XLSX.utils.book_new();
    
    const wsMain = XLSX.utils.json_to_sheet(mainData);
    XLSX.utils.book_append_sheet(wb, wsMain, "Registros Detalhados");
    
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, "Resumo por Obra");
    
    const wsTotals = XLSX.utils.json_to_sheet(totalsData);
    XLSX.utils.book_append_sheet(wb, wsTotals, "Totais Gerais");

    XLSX.writeFile(wb, `Relatorio_Completo_${new Date().toLocaleDateString()}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-6">
          <Filter className="text-orange-500" size={20} />
          <h3 className="text-lg font-bold">Filtros do Relatório</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Funcionário</label>
            <select 
              value={filters.userId} 
              onChange={e => setFilters({ ...filters, userId: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white"
            >
              <option value="">Todos</option>
              {users.filter(u => u.role !== 'admin_master').map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Obra</label>
            <select 
              value={filters.workId} 
              onChange={e => setFilters({ ...filters, workId: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white"
            >
              <option value="">Todas</option>
              {works.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Data Início</label>
            <input 
              type="date" 
              value={filters.startDate} 
              onChange={e => setFilters({ ...filters, startDate: e.target.value })}
              className="w-full max-w-full box-border bg-slate-900 border border-slate-700 rounded-xl px-2 py-1.5 text-sm text-white"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Data Fim</label>
            <input 
              type="date" 
              value={filters.endDate} 
              onChange={e => setFilters({ ...filters, endDate: e.target.value })}
              className="w-full max-w-full box-border bg-slate-900 border border-slate-700 rounded-xl px-2 py-1.5 text-sm text-white"
            />
          </div>
        </div>
        <div className="flex justify-between items-center mt-6">
          <div className="flex gap-3">
            <Button variant="secondary" onClick={exportExcel}>
              <FileSpreadsheet size={18} /> Excel
            </Button>
            <Button variant="secondary" onClick={exportPDF}>
              <FileText size={18} /> PDF
            </Button>
          </div>
          <Button onClick={generateReport}>
            Aplicar Filtros
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
        <Card className="p-4 md:p-6 border-l-4 border-l-orange-600">
          <p className="text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Total de Horas</p>
          <p className="text-xl md:text-2xl font-black text-white">{summary.totalHours}</p>
        </Card>
        <Card className="p-4 md:p-6 border-l-4 border-l-blue-600">
          <p className="text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Funcionários</p>
          <p className="text-xl md:text-2xl font-black text-white">{summary.totalEmployees}</p>
        </Card>
        <Card className="p-4 md:p-6 border-l-4 border-l-emerald-600">
          <p className="text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Total de Diárias</p>
          <p className="text-xl md:text-2xl font-black text-white">{summary.totalDiarias}</p>
        </Card>
        <Card className="p-4 md:p-6 border-l-4 border-l-purple-600">
          <p className="text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Custo Total</p>
          <p className="text-xl md:text-2xl font-black text-white">R$ {summary.totalCost.toFixed(2)}</p>
        </Card>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="p-6 border-b border-slate-700 flex justify-between items-center">
          <h3 className="text-lg font-bold">Registros de Ponto</h3>
          <span className="text-xs text-slate-500">{reportData.length} registros encontrados</span>
        </div>
        
        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900/50">
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Funcionário</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Obra</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Data</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Entrada</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Saída</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Horas</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Diária</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {reportData.map((p, idx) => (
                <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-white">{p.user_name}</td>
                  <td className="px-6 py-4 text-sm text-slate-400">{p.workName}</td>
                  <td className="px-6 py-4 text-sm text-slate-400">{new Date(p.date + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                  <td className="px-6 py-4 text-sm text-slate-400">{p.entrada1 || '--:--'}</td>
                  <td className="px-6 py-4 text-sm text-slate-400">{p.saida2 || p.saida1 || '--:--'}</td>
                  <td className="px-6 py-4 text-sm font-bold text-orange-500">{p.calculatedHours}</td>
                  <td className="px-6 py-4 text-sm text-slate-400">{p.diarias}</td>
                  <td className="px-6 py-4 text-sm font-bold text-emerald-500">R$ {p.cost.toFixed(2)}</td>
                </tr>
              ))}
              {reportData.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-500 italic">Nenhum registro encontrado para os filtros selecionados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden flex flex-col divide-y divide-slate-800">
          {reportData.map((p, idx) => (
            <div key={idx} className="p-4 space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-base font-bold text-white">{p.user_name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{new Date(p.date + 'T00:00:00').toLocaleDateString('pt-BR')}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-emerald-500">R$ {p.cost.toFixed(2)}</p>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Diária: {p.diarias}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-sm text-slate-300 bg-slate-800/30 p-2 rounded-lg border border-slate-800/50">
                <MapPin size={14} className="text-orange-500 shrink-0" />
                <span className="truncate">{p.workName}</span>
              </div>

              <div className="flex justify-between items-center bg-slate-800/30 p-3 rounded-xl border border-slate-800/50">
                <div className="flex items-center gap-3">
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Entrada</p>
                    <p className="text-sm font-bold text-white">{p.entrada1 || '--:--'}</p>
                  </div>
                  <div className="w-4 border-t border-slate-600"></div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Saída</p>
                    <p className="text-sm font-bold text-white">{p.saida2 || p.saida1 || '--:--'}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Horas</p>
                  <p className="text-sm font-bold text-orange-500">{p.calculatedHours}</p>
                </div>
              </div>
            </div>
          ))}
          {reportData.length === 0 && (
            <div className="p-8 text-center text-slate-500 italic">
              Nenhum registro encontrado para os filtros selecionados.
            </div>
          )}
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="p-6 border-b border-slate-700">
          <h3 className="text-lg font-bold">Resumo por Obra</h3>
        </div>
        
        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900/50">
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Nome da Obra</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Funcionários</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Total Horas</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Total Diárias</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Custo Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {workSummary.map((w, idx) => (
                <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-6 py-4 text-sm font-bold text-white">{w.name}</td>
                  <td className="px-6 py-4 text-sm text-slate-400 text-center">{w.employeeCount}</td>
                  <td className="px-6 py-4 text-sm text-slate-400 text-center">{w.hours}</td>
                  <td className="px-6 py-4 text-sm text-slate-400 text-center">{w.diarias}</td>
                  <td className="px-6 py-4 text-sm font-bold text-emerald-500 text-right">R$ {w.cost.toFixed(2)}</td>
                </tr>
              ))}
              {workSummary.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500 italic">Nenhum dado de obra disponível.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden flex flex-col divide-y divide-slate-800">
          {workSummary.map((w, idx) => (
            <div key={idx} className="p-4 space-y-3">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  <HardHat size={16} className="text-orange-500 shrink-0" />
                  <p className="text-base font-bold text-white">{w.name}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-emerald-500">R$ {w.cost.toFixed(2)}</p>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Custo Total</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="bg-slate-800/30 p-2 rounded-lg border border-slate-800/50 text-center">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Func.</p>
                  <p className="text-sm font-bold text-white">{w.employeeCount}</p>
                </div>
                <div className="bg-slate-800/30 p-2 rounded-lg border border-slate-800/50 text-center">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Horas</p>
                  <p className="text-sm font-bold text-orange-500">{w.hours}</p>
                </div>
                <div className="bg-slate-800/30 p-2 rounded-lg border border-slate-800/50 text-center">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Diárias</p>
                  <p className="text-sm font-bold text-white">{w.diarias}</p>
                </div>
              </div>
            </div>
          ))}
          {workSummary.length === 0 && (
            <div className="p-8 text-center text-slate-500 italic">
              Nenhum dado de obra disponível.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function EmployeeView({ user, works, onRefresh }: { user: UserData, works: Work[], onRefresh: () => void }) {
  const [point, setPoint] = useState<PointRecord | null>(null);
  const [selectedWorkId, setSelectedWorkId] = useState<string | ''>('');
  const [loading, setLoading] = useState(false);
  const [obs, setObs] = useState('');
  const [status, setStatus] = useState<'idle' | 'locating' | 'refining' | 'saving'>('idle');
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [isPauseModalOpen, setIsPauseModalOpen] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [lastRegisteredTime, setLastRegisteredTime] = useState('');
  const [tempPos, setTempPos] = useState<any>(null);

  const loadTodayPoint = useCallback(async () => {
    const data = await storage.getPoints(user.id);
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); // YYYY-MM-DD
    const todayPoint = data.find((p: any) => (String(p.funcionario_id) === String(user.id) || String(p.user_id) === String(user.id)) && p.date === today);
    setPoint(todayPoint || null);
    if (todayPoint?.work_id) {
      setSelectedWorkId(String(todayPoint.work_id));
    }
  }, [user.id]);

  useEffect(() => { 
    loadTodayPoint(); 
  }, [loadTodayPoint]);

  const registerPoint = async (type: 'entrada1' | 'saida1' | 'entrada2' | 'saida2', customPos?: any) => {
    console.log("Registrando ponto para:", user);
    console.log("Obra selecionada ID:", selectedWorkId);

    if (!user) {
      alert("Usuário não encontrado. Faça login novamente.");
      return;
    }
    if ((type === 'entrada1' || type === 'entrada2') && !selectedWorkId) {
      alert('Selecione a obra antes de registrar o ponto.');
      return;
    }

    // Proteção contra registros duplicados (30 segundos)
    if (point?.last_timestamp && (Date.now() - point.last_timestamp < 30000)) {
      alert('Aguarde pelo menos 30 segundos entre os registros para evitar duplicidade.');
      return;
    }

    // Validação de sequência lógica
    if (type === 'saida1' && !point?.entrada1) {
      alert('Você precisa registrar a entrada antes da saída.');
      return;
    }
    if (type === 'entrada2' && !point?.saida1) {
      alert('Você precisa registrar a primeira saída antes da segunda entrada.');
      return;
    }
    if (type === 'saida2' && !point?.entrada2) {
      alert('Você precisa registrar a segunda entrada antes da segunda saída.');
      return;
    }

    setLoading(true);
    setStatus('locating');
    setShowSuccess(false);
    
    try {
      const selectedWork = works.find(w => String(w.id) === String(selectedWorkId));
      const agora = new Date();
      const horaLocal = agora.toLocaleTimeString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit'
      });
      const dataLocal = agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); // YYYY-MM-DD

      let pos: GeolocationPosition | null = null;
      if (customPos) {
        pos = customPos;
      } else {
        try {
          pos = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
              (position) => resolve(position),
              (error) => reject(error),
              {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
              }
            );
          });
        } catch (err) {
          console.error("Erro ao obter localização", err);
        }
      }

      let address = "Localização não obtida";
      
      if (pos) {
         try {
            const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`);
            const geoData = await geoRes.json();
            address = geoData.display_name || "Endereço não disponível";
         } catch (e) {
            console.error("Geocoding error", e);
            address = "Endereço não disponível";
         }
      }

      setStatus('saving');

      // Local Registration Logic
      const allPoints = await storage.getPoints(user.id);
      let point = allPoints.find(p => (String(p.funcionario_id) === String(user.id) || String(p.user_id) === String(user.id)) && p.date === dataLocal);
      
      if (!point) {
        point = {
          id: crypto.randomUUID(),
          user_id: user.id,
          funcionario_id: user.id,
          user_name: user.name,
          date: dataLocal,
          entrada1: '', saida1: '', entrada2: '', saida2: '',
          entrada1_lat: 0, entrada1_lng: 0, entrada1_acc: 0, entrada1_address: '',
          saida1_lat: 0, saida1_lng: 0, saida1_acc: 0, saida1_address: '',
          entrada2_lat: 0, entrada2_lng: 0, entrada2_acc: 0, entrada2_address: '',
          saida2_lat: 0, saida2_lng: 0, saida2_acc: 0, saida2_address: '',
          obs: '',
          total_hours: '00:00',
          status: WorkStatus.TRABALHANDO
        };
        allPoints.push(point);
      }

      // Update fields
      const lat = pos ? pos.coords.latitude : 0;
      const lng = pos ? pos.coords.longitude : 0;
      const acc = pos ? pos.coords.accuracy : 0;
      // const timestampLocalizacao = pos ? pos.timestamp : Date.now();

      if (type === 'entrada1') {
        point.entrada1 = horaLocal;
        point.entrada1_lat = lat; point.entrada1_lng = lng; point.entrada1_acc = acc; point.entrada1_address = address;
        point.work_id = String(selectedWorkId);
        point.work_name = selectedWork?.name;
        point.entrada1_obra = selectedWork?.name;
        continuar(point);
      } else if (type === 'saida1') {
        point.saida1 = horaLocal;
        point.saida1_lat = lat; point.saida1_lng = lng; point.saida1_acc = acc; point.saida1_address = address;
        pausar(point);
      } else if (type === 'entrada2') {
        point.entrada2 = horaLocal;
        point.entrada2_lat = lat; point.entrada2_lng = lng; point.entrada2_acc = acc; point.entrada2_address = address;
        point.entrada2_obra = selectedWork?.name;
        continuar(point);
      } else if (type === 'saida2') {
        point.saida2 = horaLocal;
        point.saida2_lat = lat; point.saida2_lng = lng; point.saida2_acc = acc; point.saida2_address = address;
        encerrar(point);
      }

      point.last_timestamp = Date.now();

      if (obs) point.obs = obs;

      // GPS Status
      let gpsStatus = 'ok';
      if (acc > 300) gpsStatus = 'fraco';
      if (!pos) gpsStatus = 'não obtido';
      
      if (type === 'entrada1') point.entrada1_gps_status = gpsStatus;
      else if (type === 'saida1') point.saida1_gps_status = gpsStatus;
      else if (type === 'entrada2') point.entrada2_gps_status = gpsStatus;
      else if (type === 'saida2') point.saida2_gps_status = gpsStatus;

      // Distance from work
      const currentWork = works.find(w => String(w.id) === (type === 'entrada1' || type === 'entrada2' ? String(selectedWorkId) : String(point?.work_id)));
      if (pos && currentWork && currentWork.lat && currentWork.lng) {
        const dist = calculateDistance(lat, lng, currentWork.lat, currentWork.lng);
        if (type === 'entrada1') point.entrada1_dist = dist;
        else if (type === 'saida1') point.saida1_dist = dist;
        else if (type === 'entrada2') point.entrada2_dist = dist;
        else if (type === 'saida2') point.saida2_dist = dist;
      }

      // GPS Suspeito
      let prevLat = null, prevLng = null, prevTime = null;
      if (type === 'saida1' && point.entrada1_lat && point.entrada1_lng) {
        prevLat = point.entrada1_lat; prevLng = point.entrada1_lng; prevTime = Date.now() - 60000; // Mock time diff for now or use real timestamps if stored
      }
      // Replicating the 3km/2min logic would require storing timestamps for each point.
      // For now, let's keep it simple or add timestamps to PointRecord.
      
      point.total_hours = calcularHorasRecord(point);
      
      await storage.savePoints(allPoints);

      setLastRegisteredTime(horaLocal);
      setShowSuccess(true);
      loadTodayPoint();
      onRefresh();
      setObs('');

      if (type === 'saida1') {
        setIsPauseModalOpen(true);
      }
    } catch (err) {
      console.error("Erro fatal ao registrar ponto:", err);
      alert('Erro ao registrar ponto.');
    } finally {
      setLoading(false);
      setStatus('idle');
    }
  };

  const handleFinishDay = async () => {
    setIsPauseModalOpen(false);
    setLoading(true);
    
    const allPoints = await storage.getPoints(user.id);
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const index = allPoints.findIndex(p => (p.funcionario_id === user.id || p.user_id === user.id) && p.date === today);
    
    if (index !== -1) {
      encerrar(allPoints[index]);
      await storage.savePoints(allPoints);
      loadTodayPoint();
      onRefresh();
    }
    setLoading(false);
  };

  const nextAction = point?.encerrado ? null : !point?.entrada1 ? 'entrada1' : !point?.saida1 ? 'saida1' : !point?.entrada2 ? 'entrada2' : !point?.saida2 ? 'saida2' : null;
  const actionLabels = { entrada1: 'Entrada 1', saida1: 'Saída 1', entrada2: 'Entrada 2', saida2: 'Saída 2' };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <Card className="text-center py-12 px-8">
        <div className="mb-8">
          <div className="w-24 h-24 bg-slate-900 rounded-full flex items-center justify-center mx-auto border-4 border-slate-800 shadow-2xl relative">
             <Clock className="text-orange-500" size={40} />
             {loading && (
               <motion.div 
                 animate={{ rotate: 360 }}
                 transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                 className="absolute inset-0 border-t-4 border-orange-600 rounded-full"
               />
             )}
          </div>
          <h3 className="text-4xl font-black text-white mt-6 mb-2">
            {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </h3>
          <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>

        {(() => {
          const status = getPointStatus(point);
          return (
            <div className={`mb-8 p-4 rounded-2xl border ${status.bg} ${status.color} ${status.border} inline-flex flex-col items-center gap-1`}>
              <span className="text-[10px] font-black uppercase tracking-[0.2em]">Status Atual</span>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${status.label !== 'Encerrado' ? 'animate-pulse' : ''} ${status.label === 'Pausado' ? 'bg-orange-500' : status.label === 'Encerrado' ? 'bg-slate-500' : 'bg-emerald-500'}`} />
                <span className="text-sm font-black">{status.label}</span>
              </div>
              {status.label === 'Pausado' && (
                <span className="text-[10px] font-bold uppercase tracking-widest mt-1 animate-pulse">Aguardando próximo turno</span>
              )}
              {point?.work_name && (
                <span className="text-[10px] font-bold opacity-70 uppercase tracking-widest mt-1">Obra: {point.work_name}</span>
              )}
              <span className="text-[10px] font-bold opacity-70 uppercase tracking-widest">{status.label === 'Encerrado' ? 'Último registro:' : 'Desde:'} {status.since}</span>
            </div>
          );
        })()}

        {!nextAction && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 p-6 rounded-3xl mb-6">
            <CheckCircle2 className="text-emerald-500 mx-auto mb-2" size={32} />
            <h4 className="text-lg font-bold text-white mb-1">Jornada Concluída</h4>
            <p className="text-slate-400 text-xs">Jornada já encerrada hoje. Novos registros disponíveis amanhã.</p>
          </div>
        )}

        {nextAction && (
          <div className="space-y-6">
            {(nextAction === 'entrada1' || nextAction === 'entrada2') && (
              <div className="space-y-1.5 text-left">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Selecionar Obra</label>
                <select 
                  value={selectedWorkId} 
                  onChange={e => setSelectedWorkId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-600/50 transition-all"
                >
                  <option value="">Selecione uma obra...</option>
                  {works.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
            )}

            {(nextAction === 'saida1' || nextAction === 'saida2') && point?.work_name && (
              <div className="flex items-center justify-center gap-2 py-2 px-4 bg-slate-900 rounded-xl border border-slate-800">
                <MapIcon size={16} className="text-orange-500" />
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Obra: {nextAction === 'saida1' ? (point.entrada1_obra || point.work_name) : (point.entrada2_obra || point.work_name)}</span>
              </div>
            )}

            {showSuccess && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 p-4 rounded-xl text-sm font-bold"
              >
                Ponto registrado com sucesso às {lastRegisteredTime}.
              </motion.div>
            )}

            <div className="space-y-2">
               <textarea
                value={obs}
                onChange={e => setObs(e.target.value)}
                placeholder="Observações (opcional)..."
                className="w-full bg-slate-900 border border-slate-700 rounded-2xl p-4 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-600/50 transition-all resize-none h-24"
              />
            </div>
            
            <Button 
              onClick={() => registerPoint(nextAction as any)} 
              className="w-full py-6 text-xl rounded-2xl shadow-2xl"
              disabled={loading}
            >
              {loading ? (
                <div className="flex flex-col items-center">
                  <span className="text-sm font-bold uppercase tracking-widest mb-1">
                    Preparando registro...
                  </span>
                </div>
              ) : (
                <>Registrar {actionLabels[nextAction as keyof typeof actionLabels]}</>
              )}
            </Button>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <PointMiniCard label="Entrada 1" time={point?.entrada1} active={!!point?.entrada1} obra={point?.entrada1_obra || point?.work_name} />
        <PointMiniCard label="Saída 1" time={point?.saida1} active={!!point?.saida1} />
        <PointMiniCard label="Entrada 2" time={point?.entrada2} active={!!point?.entrada2} obra={point?.entrada2_obra || point?.entrada1_obra || point?.work_name} />
        <PointMiniCard label="Saída 2" time={point?.saida2} active={!!point?.saida2} />
      </div>

      {point && (
        <Card className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h4 className="font-bold text-slate-400 uppercase tracking-widest text-xs">Resumo do Dia</h4>
            <span className="text-orange-500 font-black">{point.total_hours}h trabalhadas</span>
          </div>
          <div className="flex items-start gap-3 text-xs text-slate-500">
            <Info size={14} className="mt-0.5 shrink-0" />
            <p>Horários registrados conforme sua jornada.</p>
          </div>
        </Card>
      )}

      <Modal isOpen={isPauseModalOpen} onClose={() => setIsPauseModalOpen(false)} title="Encerrar jornada?">
        <div className="space-y-6">
          <p className="text-slate-300">Deseja encerrar a jornada ou iniciar um novo turno?</p>
          <div className="grid grid-cols-1 gap-3">
            <Button onClick={() => setIsPauseModalOpen(false)} variant="primary" className="w-full py-4">
              Continuar jornada
            </Button>
            <Button onClick={handleFinishDay} variant="secondary" className="w-full py-4">
              Encerrar jornada
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function PointMiniCard({ label, time, active, obra }: { label: string, time?: string, active: boolean, obra?: string }) {
  return (
    <div className={`
      p-4 rounded-2xl border transition-all text-center
      ${active ? 'bg-slate-800 border-orange-600/50 shadow-lg' : 'bg-slate-900 border-slate-800 opacity-40'}
    `}>
      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-lg font-black ${active ? 'text-white' : 'text-slate-700'}`}>{time || '--:--'}</p>
      {active && obra && <p className="text-[9px] font-bold text-orange-500 uppercase mt-1 truncate">{obra}</p>}
    </div>
  );
}
