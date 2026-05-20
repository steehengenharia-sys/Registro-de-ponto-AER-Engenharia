import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Clock, 
  User, 
  Users, 
  Calendar, 
  BarChart3, 
  Plus, 
  Trash2, 
  Edit2, 
  Eye, 
  CheckCircle2, 
  AlertCircle,
  LogOut,
  LogIn,
  CheckCircle,
  XCircle,
  MapPin,
  Activity,
  Navigation,
  Crosshair,
  ChevronRight,
  Menu,
  X,
  Smartphone,
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
  Upload,
  Search,
  HardHat,
  Wallet,
  Database
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

import { auth, db, secondaryAuth } from './firebase';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword } from 'firebase/auth';
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc, onSnapshot, query, where, getDoc, orderBy, arrayUnion, writeBatch } from 'firebase/firestore';

// --- Global Utilities ---
export const sanitizePointData = (data: any): any => {
  if (data === null || typeof data !== 'object') return data;
  const sanitized = Array.isArray(data) ? [] : {};
  
  Object.keys(data).forEach(key => {
    const value = data[key];
    if (value !== undefined) {
      if (typeof value === 'object' && value !== null) {
        (sanitized as any)[key] = sanitizePointData(value);
      } else {
        (sanitized as any)[key] = value;
      }
    }
  });
  return sanitized;
};

function exportarBackup(dados: any) {

  console.log("DADOS:", dados);
  if (dados && dados.length > 0) {
    alert(JSON.stringify(dados[0], null, 2));
  }

  const blob = new Blob([JSON.stringify(dados, null, 2)], {
    type: "application/json",
  });

  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `backup-${new Date().toISOString()}.json`;
  link.click();
}

// --- Storage Helper (Now using Firestore) ---

const storage = {
  getUsers: async (userId?: string): Promise<UserData[]> => {
    try {
      if (userId) {
        // Use getDoc for single user instead of query
        const docSnap = await getDoc(doc(db, 'users', userId));
        if (docSnap.exists()) {
          return [{ id: docSnap.id, ...docSnap.data() } as UserData];
        }
        return [];
      } else {
        // Use getDocs for list (only allowed for admins)
        const querySnapshot = await getDocs(collection(db, 'users'));
        const users = querySnapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as object) } as UserData));
        
        return users.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      }
    } catch (e) {
      handleFirestoreError(e, userId ? OperationType.GET : OperationType.LIST, userId ? 'users/'+userId : 'users');
      return [];
    }
  },
  saveUsers: async (users: UserData[]) => {
    const chunks = [];
    for (let i = 0; i < users.length; i += 500) {
      chunks.push(users.slice(i, i + 500));
    }
    for (const chunk of chunks) {
      const batch = writeBatch(db);
      chunk.forEach(user => {
        batch.set(doc(db, 'users', user.id), user);
      });
      try {
        await batch.commit();
      } catch (e) {
        console.error("Batch error in saveUsers:", e);
        for (const user of chunk) {
          try {
            await setDoc(doc(db, 'users', user.id), user);
          } catch (innerE) {
            handleFirestoreError(innerE, OperationType.WRITE, `users/${user.id}`);
          }
        }
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
    const chunks = [];
    for (let i = 0; i < works.length; i += 500) {
      chunks.push(works.slice(i, i + 500));
    }
    for (const chunk of chunks) {
      const batch = writeBatch(db);
      chunk.forEach(work => {
        batch.set(doc(db, 'works', work.id), work);
      });
      try {
        await batch.commit();
      } catch (e) {
        console.error("Batch error in saveWorks:", e);
        for (const work of chunk) {
          try {
            await setDoc(doc(db, 'works', work.id), work);
          } catch (innerE) {
            handleFirestoreError(innerE, OperationType.WRITE, `works/${work.id}`);
          }
        }
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
    // Implementação com writeBatch para eficiência e economia de cota em operações em massa
    // Divide em lotes de 500 (limite do Firestore)
    const chunks = [];
    for (let i = 0; i < points.length; i += 500) {
      chunks.push(points.slice(i, i + 500));
    }

    for (const chunk of chunks) {
      const batch = writeBatch(db);
      chunk.forEach(point => {
        const docRef = doc(db, 'points', String(point.id));
        batch.set(docRef, sanitizePointData(point));
      });
      
      try {
        await batch.commit();
      } catch (e) {
        console.error("Erro ao comitar lote (batch):", e);
        // Fallback para individual se falhar (opcional, mas seguro)
        for (const point of chunk) {
          try {
            await setDoc(doc(db, 'points', String(point.id)), sanitizePointData(point));
          } catch (innerE) {
            handleFirestoreError(innerE, OperationType.WRITE, `points/${point.id}`);
          }
        }
      }
    }
  },
  savePoint: async (point: PointRecord) => {
    try {
      await setDoc(doc(db, 'points', String(point.id)), sanitizePointData(point));
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `points/${point.id}`);
    }
  },
  deletePoint: async (id: string | number) => {
    try {
      const docRef = doc(db, 'points', String(id));
      await deleteDoc(docRef);
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `points/${id}`);
    }
  },
  deletePoints: async (ids: (string | number)[]) => {
    // Implementação com writeBatch para exclusão em massa
    const chunks = [];
    for (let i = 0; i < ids.length; i += 500) {
      chunks.push(ids.slice(i, i + 500));
    }

    for (const chunk of chunks) {
      const batch = writeBatch(db);
      chunk.forEach(id => {
        const docRef = doc(db, 'points', String(id));
        batch.delete(docRef);
      });
      
      try {
        await batch.commit();
      } catch (e) {
        console.error("Erro ao comitar lote de exclusão:", e);
        // Fallback
        for (const id of chunk) {
          try {
            await deleteDoc(doc(db, 'points', String(id)));
          } catch (innerE) {
            handleFirestoreError(innerE, OperationType.DELETE, `points/${id}`);
          }
        }
      }
    }
  },
  clearPoints: async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'points'));
      const ids = querySnapshot.docs.map(doc => doc.id);
      if (ids.length > 0) {
        await storage.deletePoints(ids);
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, 'points');
    }
  },
};

// --- Utility Functions ---

function registroContemObra(p: PointRecord, workIdToFind: string, works: Work[], users: UserData[]) {
  if (!workIdToFind) return true;
  const resumo = calcularResumoRegistro(p, undefined, works, users);
  return resumo.intervalos.some(int => {
     if (String(int.obraId) === String(workIdToFind)) return true;
     const targetWork = works.find(w => String(w.id) === String(workIdToFind));
     if (targetWork && int.obraNome.trim().toLowerCase() === targetWork.name.trim().toLowerCase()) return true;
     return false;
  });
}

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

function calcularPeriodo(inicio: any, fim: any): number {
  const i = typeof inicio === 'string' ? inicio : getHorarioDisplay(inicio);
  const f = typeof fim === 'string' ? fim : getHorarioDisplay(fim);
  
  if (!i || !f || i === '--:--' || f === '--:--' || !i.includes(':') || !f.includes(':')) return 0;
  const [h1, m1] = i.split(':').map(Number);
  const [h2, m2] = f.split(':').map(Number);
  if (isNaN(h1) || isNaN(m1) || isNaN(h2) || isNaN(m2)) return 0;
  
  // Cálculo em minutos (Regra Principal)
  const totalMinutosEntrada = (h1 * 60) + m1;
  const totalMinutosSaida = (h2 * 60) + m2;
  
  let diff = totalMinutosSaida - totalMinutosEntrada;
  
  // Se cruzar meia-noite (saida < entrada)
  if (diff < 0) diff += 24 * 60;
  
  return diff;
}

function formatarMinutos(totalMinutos: number): string {
  // Horas formatadas HH:MM
  const h = Math.floor(totalMinutos / 60);
  const m = totalMinutos % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatCurrency(valor: number): string {
  // Padrão brasileiro: R$ X.XXX,XX
  const valorArredondado = Math.round(valor * 100) / 100;
  return 'R$ ' + valorArredondado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

const MINUTES_PER_DIARIA = 600; // 10h

// --- Centralized Calculation Engine ---

function calcularResumoRegistro(p: PointRecord, valorDiaria?: number, works?: Work[], users?: UserData[]): ResumoRegistro {
  const intervals: IntervaloTrabalho[] = [];
  let totalMinutos = 0;
  
  // Decide base daily rate
  let baseDiaria = valorDiaria;
  if (!baseDiaria) {
    const user = users?.find(u => String(u.id) === String(p.user_id));
    baseDiaria = user?.valor_diaria || 180;
  }
  
  const createInterval = (entrada: PointSegmentRecord | undefined, saida: PointSegmentRecord | undefined, fallbackObraId?: string, fallbackObraName?: string): IntervaloTrabalho | null => {
    const eTime = getHorarioDisplay(entrada);
    const sTime = getHorarioDisplay(saida);
    const mins = calcularPeriodo(eTime, sTime);
    
    if (eTime === '--:--' || mins <= 0) return null;
    
    // Obra resolution hierarchy: 
    // 1. Entry Segment (obraId/obraNome)
    // 2. Exit Segment (obraId/obraNome)
    // 3. Fallback (from record top-level or legacy fields)
    let obraId = entrada?.obraId || saida?.obraId || fallbackObraId || p.work_id || '';
    let obraNome = entrada?.obraNome || saida?.obraNome || fallbackObraName || p.work_name || '-';
    
    // Try to normalize obra from list
    if (works) {
      const searchVal = String(obraId || obraNome).trim().toLowerCase();
      if (searchVal && searchVal !== '-' && searchVal !== 'não informada') {
        const foundWork = works.find(w => 
          String(w.id).trim().toLowerCase() === searchVal || 
          w.name.trim().toLowerCase() === searchVal
        );
        if (foundWork) {
          obraId = foundWork.id;
          obraNome = foundWork.name;
        }
      }
    }
    
    if (!obraNome || obraNome === '-') obraNome = 'Não informada';
    
    // Rule: valorHora = baseDiaria / 10.
    // If status is TRABALHANDO and this is the active segment (no saida), value should be 0.
    let valor = 0;
    if (saida && mins > 0) {
      valor = Math.round(((mins / MINUTES_PER_DIARIA) * baseDiaria!) * 100) / 100;
    }
    
    const observacoes: string[] = [];
    if (entrada?.observacao) observacoes.push(entrada.observacao);
    if (saida?.observacao) observacoes.push(saida.observacao);

    return {
      obraId: String(obraId),
      obraNome,
      entrada: eTime,
      saida: sTime,
      minutos: mins,
      horasFormatadas: formatarMinutos(mins),
      valor,
      observacoes,
      gpsEntrada: entrada?.gps,
      gpsSaida: saida?.gps
    };
  };

  const statusStr = calculateWorkStatus(p);
  let status: ResumoRegistro["status"] = "NAO_INICIADO";
  if (statusStr === WorkStatus.TRABALHANDO) status = "TRABALHANDO";
  else if (statusStr === WorkStatus.ENCERRADO) status = "ENCERRADO";
  else if (statusStr === WorkStatus.PAUSADO) status = "PAUSADO";

  // Interval 1: Morning/Entry 1
  const int1 = createInterval(
    p.entrada1, 
    p.saida1, 
    p.entrada1_obra, // fallback Id/Name
    p.entrada1_obra || p.work_name
  );
  if (int1) {
    intervals.push(int1);
    totalMinutos += int1.minutos;
  }
  
  // Interval 2: Afternoon/Entry 2
  const int2 = createInterval(
    p.entrada2, 
    p.saida2, 
    p.entrada2_obra || p.entrada1_obra, 
    p.entrada2_obra || p.entrada1_obra || p.work_name
  );
  if (int2) {
    intervals.push(int2);
    totalMinutos += int2.minutos;
  }
  
  // Total value is sum of interval values
  const valorTotal = intervals.reduce((acc, curr) => acc + curr.valor, 0);

  return {
    totalMinutos,
    totalHorasFormatadas: formatarMinutos(totalMinutos),
    valorTotal,
    intervalos: intervals,
    status,
    possuiInconsistencia: false 
  };
}

function calculateRecordMetrics(p: Partial<PointRecord>, valorDiaria?: number, users?: UserData[]) {
  const resumo = calcularResumoRegistro(p as PointRecord, valorDiaria, undefined, users);
  return {
    workedMinutes: resumo.totalMinutos,
    workedHours: resumo.totalHorasFormatadas,
    totalValue: resumo.valorTotal,
    diariasEquivalentes: resumo.totalMinutos / MINUTES_PER_DIARIA
  };
}

function extractIntervalsFromPoints(pointsToExtract: PointRecord[], users: UserData[], works: Work[], overrideDiaria?: number, globalDiariaValueStr?: string, mode: 'auto' | 'diaria' | 'manual' = 'auto', filterWorkId?: string) {
  const allIntervals: any[] = [];
  
  const targetWork = filterWorkId ? works.find(w => String(w.id) === String(filterWorkId)) : null;
  const tName = targetWork?.name?.trim().toLowerCase();

  const matchFilter = (id?: string | number, name?: string | null) => {
    if (!filterWorkId) return true;
    if (id && String(id) === String(filterWorkId)) return true;
    if (tName && name && name.trim().toLowerCase() === tName) return true;
    return false;
  };

  pointsToExtract.forEach(p => {
    const user = users.find(u => String(u.id) === String(p.user_id));
    
    let baseDiaria: number;
    if (mode === 'manual' || mode === 'diaria') {
        const parsedGlobal = globalDiariaValueStr ? parseFloat(globalDiariaValueStr) : 180;
        baseDiaria = overrideDiaria || parsedGlobal || 180;
    } else {
        // MODO AUTOMÁTICO: Use user's registered value
        baseDiaria = user?.valor_diaria || 180;
    }

    const userName = p.user_name || user?.name || '---';
    const resumo = calcularResumoRegistro(p, baseDiaria, works, users);
    
    resumo.intervalos.forEach(int => {
       if (matchFilter(int.obraId, int.obraNome)) {
         allIntervals.push({
           origPoint: p,
           date: p.date,
           userId: p.user_id,
           userName,
           workName: int.obraNome,
           workId: int.obraId,
           entrada: int.entrada,
           saida: int.saida,
           workedMinutes: int.minutos,
           workedHoursStr: int.horasFormatadas,
           diarias: int.minutos / MINUTES_PER_DIARIA,
           valorTotal: int.valor,
           baseDiaria: baseDiaria // Keep track of the daily rate used for this interval
         });
       }
    });
  });

  allIntervals.sort((a, b) => a.date.localeCompare(b.date));
  return allIntervals;
}

function generateOfficialReportPDF(
  finalData: any[], 
  totalCostToDisplay: number, 
  filters: any, 
  users: UserData[], 
  works: Work[], 
  calcMode: 'auto' | 'diaria' | 'manual',
  globalDiaria: number
) {
    const doc = new jsPDF('p', 'mm', 'a4');
    const marginLeft = 15;
    const pageWidth = 210;
    let currentY = 18;
    
    const subMinsTotal = finalData.reduce((acc: number, curr: any) => acc + curr.workedMinutes, 0);
    const subHoursTotal = formatarMinutos(subMinsTotal);
    const subDiariasTotal = subMinsTotal / MINUTES_PER_DIARIA;
    const subEmployeesTotal = new Set(finalData.map((p: any) => String(p.userId))).size;
    const calculationModeText = calcMode === 'manual' ? `Manual (Base R$${globalDiaria.toFixed(2)})` : 'Automático por Funcionário';

    const colorBlue: [number, number, number] = [30, 58, 95];
    const colorOrange: [number, number, number] = [234, 88, 12];
    const colorSlate: [number, number, number] = [100, 116, 139];
    const colorLight: [number, number, number] = [241, 245, 249];

    // --- DECORATIVE ELEMENTS (HEADER) ---
    // Top right polygon - Very slim and sharp corner as in reference
    doc.setFillColor(...colorBlue);
    doc.triangle(pageWidth, 0, pageWidth - 35, 0, pageWidth, 8, 'F');
    // Orange accent dot - tiny and tucked in
    doc.setFillColor(...colorOrange);
    doc.circle(pageWidth - 1, 1, 2.5, 'F');
    
    // --- 1. HEADER (LOGO & TITLES) ---
    doc.setFillColor(...colorBlue);
    doc.roundedRect(marginLeft, currentY, 13, 13, 1.5, 1.5, 'F');
    // Accent line in logo
    doc.setFillColor(...colorOrange);
    doc.rect(marginLeft + 2.5, currentY + 10.5, 8, 1, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text('A&R', marginLeft + 6.5, currentY + 8, { align: 'center' });
    
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(14);
    doc.text('A&R ENGENHARIA', marginLeft + 18, currentY + 4);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.text('SISTEMA DE CONTROLE DE PONTO', marginLeft + 18, currentY + 10);

    currentY += 22;
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text('RELATÓRIO GERENCIAL', marginLeft, currentY);
    
    // Orange underline - elegant
    doc.setDrawColor(...colorOrange);
    doc.setLineWidth(1.2);
    doc.line(marginLeft, currentY + 4, marginLeft + 35, currentY + 4);

    // Header Meta - Gerado em (Aligned to the right, compact)
    doc.setFontSize(7.5);
    doc.setTextColor(...colorSlate);
    doc.setFont("helvetica", "normal");
    const now = new Date();
    
    // Modern calendar icon for "Gerado em" - more compact and closer to text
    const metaIconX = pageWidth - marginLeft - 45;
    const metaIconY = currentY - 5;
    doc.setDrawColor(...colorBlue);
    doc.setLineWidth(0.4);
    // Calendar shape
    doc.rect(metaIconX - 2, metaIconY - 2, 4, 4, 'D');
    doc.line(metaIconX - 2, metaIconY - 0.5, metaIconX + 2, metaIconY - 0.5); // header line
    // tiny clock circle inside calendar or next to it
    doc.circle(metaIconX + 1.2, metaIconY + 1.2, 1, 'D');
    
    doc.text(`Gerado em:`, pageWidth - marginLeft, currentY - 7, { align: 'right' });
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(`${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR')}`, pageWidth - marginLeft, currentY - 2, { align: 'right' });

    currentY += 14;

    // --- 2. INFO BAR ---
    const employeeName = filters.userId ? users.find(u => String(u.id) === String(filters.userId))?.name || '---' : 'Todos';
    const periodoStr = `${filters.startDate ? new Date(filters.startDate + 'T00:00:00').toLocaleDateString('pt-BR') : 'Início'} até ${filters.endDate ? new Date(filters.endDate + 'T00:00:00').toLocaleDateString('pt-BR') : 'Fim'}`;
    const selWorkName = filters.workId ? works.find(w => String(w.id) === String(filters.workId))?.name || '---' : 'Todas';

    const totalW = pageWidth - (marginLeft * 2);
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.roundedRect(marginLeft, currentY, totalW, 16, 2, 2, 'FD');

    const colWidths = [totalW * 0.22, totalW * 0.28, totalW * 0.22, totalW * 0.28];
    const labels = ['FUNCIONÁRIO', 'PERÍODO', 'OBRA', 'CÁLCULO'];
    
    let xOffset = marginLeft;
    for(let i=0; i<4; i++) {
        const w = colWidths[i];
        
        // Circular icon container
        doc.setFillColor(...colorBlue);
        doc.circle(xOffset + 8, currentY + 8, 4, 'F');
        doc.setDrawColor(255, 255, 255);
        doc.setLineWidth(0.4);
        const icX = xOffset + 8;
        const icY = currentY + 8;

        if (i === 0) { // User
            doc.circle(icX, icY - 1, 1.2, 'D');
            doc.ellipse(icX, icY + 1.2, 2, 1, 'D');
        } else if (i === 1) { // Calendar
            doc.rect(icX - 1.5, icY - 1.5, 3, 3, 'D');
            doc.line(icX - 1.5, icY - 0.5, icX + 1.5, icY - 0.5);
            doc.line(icX - 0.7, icY - 2, icX - 0.7, icY - 1); // rings
            doc.line(icX + 0.7, icY - 2, icX + 0.7, icY - 1);
        } else if (i === 2) { // Building
            doc.rect(icX - 1.5, icY - 1.5, 1.2, 3.5, 'D');
            doc.rect(icX, icY - 0.5, 1.5, 2.5, 'D');
            doc.line(icX - 1.5, icY - 0.5, icX - 0.3, icY - 0.5);
        } else { // Calculator/Keypad
            doc.rect(icX - 1.5, icY - 1.8, 3, 3.6, 'D');
            doc.rect(icX - 1, icY + 0.6, 0.5, 0.5, 'D'); // buttons
            doc.rect(icX, icY + 0.6, 0.5, 0.5, 'D');
            doc.rect(icX + 1, icY + 0.6, 0.5, 0.5, 'D');
            doc.line(icX - 1, icY - 0.8, icX + 1, icY - 0.8); // screen
        }

        doc.setFontSize(6.5);
        doc.setTextColor(...colorSlate);
        doc.setFont("helvetica", "bold");
        doc.text(labels[i], xOffset + 14, currentY + 6);
        
        doc.setFontSize(8.5);
        doc.setTextColor(15, 23, 42);
        const values = [employeeName.toUpperCase(), periodoStr, selWorkName.toUpperCase(), calculationModeText];
        const val = values[i];
        const splitVal = doc.splitTextToSize(val, w - 16);
        doc.text(splitVal, xOffset + 14, currentY + 10);
        
        if (i === 3) {
            doc.setFontSize(6);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(...colorSlate);
            
            let info = '';
            if (calcMode === 'manual') {
                info = `Valor Fixo: R$ ${globalDiaria.toFixed(2)}`;
            } else {
                // Collect individual rates
                const sampleUsers = Array.from(new Set(finalData.map(d => d.userId))).slice(0, 2);
                const userInfos = sampleUsers.map(uid => {
                    const u = users.find(usr => String(usr.id) === String(uid));
                    return u ? `${u.name.split(' ')[0]}: R$${u.valor_diaria || 180}` : '';
                }).filter(Boolean);
                info = userInfos.length > 0 ? `Ref: ${userInfos.join(', ')}${new Set(finalData.map(d => d.userId)).size > 2 ? '...' : ''}` : 'Individual';
            }
            doc.text(info, xOffset + 14, currentY + 14);
        }

        if (i < 3) {
            doc.setDrawColor(226, 232, 240);
            doc.setLineWidth(0.2);
            doc.line(xOffset + w, currentY + 3, xOffset + w, currentY + 13);
        }
        xOffset += w;
    }

    currentY += 24;

    // --- 3. SUMMARY CARDS ---
    const gridSpacing = 5;
    const cardW = (totalW - (gridSpacing * 3)) / 4;

    const drawCard = (x: number, label: string, val: string, isHours = false, isCost = false) => {
      // Soft modern shadow/border effect
      doc.setFillColor(242, 244, 247);
      doc.roundedRect(x + 0.5, currentY + 0.5, cardW, 24, 2, 2, 'F');
      
      doc.setDrawColor(226, 232, 240);
      doc.setFillColor(255, 255, 255);
      if (isCost) {
        doc.setDrawColor(...colorOrange);
        doc.setLineWidth(0.6);
      } else {
        doc.setLineWidth(0.25);
      }
      doc.roundedRect(x, currentY, cardW, 24, 2, 2, 'FD');

      // Decorative dot for icon position - better centered
      doc.setFillColor(242, 245, 248);
      doc.circle(x + cardW / 2, currentY + 6, 4.5, 'F');
      
      const icX = x + cardW / 2;
      const icY = currentY + 6;
      doc.setDrawColor(...colorBlue);
      doc.setLineWidth(0.4);
      
      if (isHours) {
          doc.circle(icX, icY, 2, 'D'); // clock
          doc.line(icX, icY, icX, icY - 1);
          doc.line(icX, icY, icX + 1, icY);
      } else if (label.includes('DIÁRIAS')) {
          doc.rect(icX - 1.5, icY - 1.5, 3, 3, 'D');
          doc.line(icX - 1.5, icY - 0.4, icX + 1.5, icY - 0.4);
      } else if (label.includes('FUNCIONÁRIOS')) {
          doc.circle(icX - 1.2, icY, 1, 'D'); // multiple users
          doc.circle(icX + 1.2, icY, 1, 'D');
          doc.circle(icX, icY - 1, 1, 'D');
      } else {
          doc.setTextColor(...colorOrange);
          doc.setFontSize(8);
          doc.text('$', icX, icY + 1.2, { align: 'center' });
      }
      
      doc.setFontSize(7.5);
      doc.setTextColor(...colorSlate);
      doc.setFont("helvetica", "bold");
      doc.text(label, x + (cardW / 2), currentY + 13, { align: 'center' });
      
      if (isHours || isCost) {
        doc.setFontSize(15);
        doc.setTextColor(...(isHours ? colorBlue : colorOrange)); 
        doc.setFont("helvetica", "bold");
        doc.text(val, x + (cardW / 2), currentY + 19, { align: 'center' });
        doc.setDrawColor(...(isHours ? colorBlue : colorOrange));
        doc.setLineWidth(0.8);
        doc.line(x + 8, currentY + 21, x + cardW - 8, currentY + 21);
      } else {
        doc.setFontSize(13);
        doc.setTextColor(51, 65, 85);
        doc.setFont("helvetica", "bold");
        doc.text(val, x + (cardW / 2), currentY + 19, { align: 'center' });
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.4);
        doc.line(x + 12, currentY + 21, x + cardW - 12, currentY + 21);
      }
    };

    drawCard(marginLeft, 'TOTAL DE HORAS', subHoursTotal, true);
    drawCard(marginLeft + (cardW + gridSpacing), 'TOTAL DE DIÁRIAS', subDiariasTotal.toFixed(2));
    drawCard(marginLeft + (cardW + gridSpacing) * 2, 'FUNCIONÁRIOS', subEmployeesTotal.toString());
    drawCard(marginLeft + (cardW + gridSpacing) * 3, 'CUSTO TOTAL', formatCurrency(totalCostToDisplay), false, true);

    currentY += 32;

    // --- 4. SUMMARY BY WORK TABLE ---
    const drawSectionHeader = (title: string, y: number, isTable2 = false) => {
        doc.setFillColor(...colorBlue);
        doc.circle(marginLeft + 3, y - 1, 3.5, 'F');
        doc.setDrawColor(255, 255, 255);
        doc.setLineWidth(0.4);
        
        const icX = marginLeft + 3;
        const icY = y - 1;
        if (isTable2) {
            doc.rect(icX - 1.2, icY - 1.2, 2.4, 2.4, 'D'); // list icon
            doc.line(icX - 0.6, icY - 0.6, icX + 0.6, icY - 0.6);
            doc.line(icX - 0.6, icY + 0.6, icX + 0.6, icY + 0.6);
        } else {
            doc.line(icX - 1.5, icY + 1.2, icX - 1.5, icY - 0.5, 'D'); // bars icon
            doc.line(icX, icY + 1.2, icX, icY - 1.2, 'D');
            doc.line(icX + 1.5, icY + 1.2, icX + 1.5, icY + 0.2, 'D');
        }
        
        doc.setFontSize(11);
        doc.setTextColor(...colorBlue);
        doc.setFont("helvetica", "bold");
        doc.text(title, marginLeft + 8, y);
    };

    drawSectionHeader('RESUMO POR OBRA', currentY);
    currentY += 6;

    const workSummaryMap = new Map();
    finalData.forEach(p => {
      const canonical = String(p.workName || 'Extra/Outros').trim().toUpperCase();
      if (!workSummaryMap.has(canonical)) {
        workSummaryMap.set(canonical, { name: p.workName || 'Extra/Outros', workers: new Set(), mins: 0, cost: 0 });
      }
      const w = workSummaryMap.get(canonical);
      w.workers.add(p.userId);
      w.mins += p.workedMinutes;
      w.cost += p.valorTotal;
    });

    const workSummaryRows = Array.from(workSummaryMap.values());

    autoTable(doc, {
      startY: currentY,
      margin: { left: marginLeft, right: marginLeft },
      head: [['OBRA', 'FUNC.', 'HORAS', 'CUSTO TOTAL']],
      body: [
        ...workSummaryRows.map(w => [
          w.name,
          w.workers.size.toString(),
          formatarMinutos(w.mins),
          formatCurrency(w.cost)
        ]),
        ['TOTAL GERAL', subEmployeesTotal.toString(), subHoursTotal, formatCurrency(totalCostToDisplay)]
      ],
      theme: 'grid',
      headStyles: { fillColor: colorBlue, textColor: 255, fontSize: 8, halign: 'center', cellPadding: 1 },
      bodyStyles: { fontSize: 7.5, halign: 'center', valign: 'middle', textColor: [30, 41, 59], cellPadding: 1 },
      alternateRowStyles: { fillColor: [252, 252, 254] },
      columnStyles: { 
        0: { halign: 'center', fontStyle: 'bold', cellWidth: 'auto' }, 
        1: { halign: 'center' }, 
        2: { halign: 'center' }, 
        3: { halign: 'center', fontStyle: 'bold' } 
      },
      didParseCell: (data: any) => {
        if (data.row.index === workSummaryRows.length) {
          data.cell.styles.fillColor = colorBlue;
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.textColor = [255, 255, 255];
        }
      }
    });

    currentY = (doc as any).lastAutoTable.finalY + 10;

    // --- 5. DETALHAMENTO GERAL ---
    drawSectionHeader('DETALHAMENTO GERAL', currentY, true);
    currentY += 6;

    const sortedData = [...finalData].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.userName !== b.userName) return a.userName.localeCompare(b.userName);
      return (a.entrada || '').localeCompare(b.entrada || '');
    });

    autoTable(doc, {
      startY: currentY,
      margin: { left: marginLeft, right: marginLeft },
      head: [['FUNCIONÁRIO', 'DATA', 'OBRA', 'ENTRADA - SAÍDA', 'HORAS', 'VALOR']],
      body: sortedData.map(p => [
        p.userName || '---',
        new Date(p.date + 'T00:00:00').toLocaleDateString('pt-BR'),
        p.workName || '---',
        `${p.entrada || '--:--'} às ${p.saida || '--:--'}`,
        p.workedHoursStr,
        formatCurrency(p.valorTotal)
      ]),
      foot: [['TOTAL GERAL', '', '', '', subHoursTotal, formatCurrency(totalCostToDisplay)]],
      theme: 'striped',
      headStyles: { fillColor: colorBlue, fontSize: 8, halign: 'center', cellPadding: 1.5 },
      bodyStyles: { fontSize: 7.5, halign: 'center', valign: 'middle', cellPadding: 1 },
      footStyles: { fillColor: colorBlue, textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold', halign: 'center', valign: 'middle', cellPadding: 1.5, minCellHeight: 6 },
      columnStyles: { 
        0: { halign: 'center', cellWidth: 35 },
        1: { halign: 'center', cellWidth: 25 },
        2: { halign: 'center' },
        3: { halign: 'center', cellWidth: 40 },
        4: { halign: 'center', cellWidth: 22 },
        5: { halign: 'center', cellWidth: 30 } 
      },
      didParseCell: (data) => {
        if (data.section === 'foot') {
           // Ensure vertical centering in footer
           data.cell.styles.valign = 'middle';
        }
      }
    });

    // FOOTER (MODERN DESIGN)
    const totalPages = (doc.internal as any).getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFillColor(...colorBlue);
        doc.rect(0, 288, pageWidth, 9, 'F');
        doc.setFillColor(...colorOrange);
        doc.rect(0, 287.5, 60, 0.4, 'F');
        
        doc.setFontSize(7.5);
        doc.setTextColor(255, 255, 255);
        doc.text('A&R Engenharia | Sistema de Controle de Ponto', marginLeft, 294);
        
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(pageWidth - marginLeft - 18, 290, 18, 5, 0.8, 0.8, 'F');
        doc.setTextColor(...colorBlue);
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.text(`Página ${i} de ${totalPages}`, pageWidth - marginLeft - 9, 293.5, { align: 'center' });
    }

    doc.save(`Relatorio_Gerencial_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.pdf`);
}

function generateReciboPDF(
  finalData: any[], 
  totalCostToDisplay: number, 
  filters: any, 
  users: UserData[], 
  globalDiaria: number,
  calcMode: 'auto' | 'diaria' | 'manual'
) {
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = 210;
    const marginLeft = 15;
    let currentY = 18;

    const subMinsTotal = finalData.reduce((acc: number, curr: any) => acc + curr.workedMinutes, 0);
    const subHoursTotal = formatarMinutos(subMinsTotal);
    const subDiariasTotal = subMinsTotal / MINUTES_PER_DIARIA;
    const employeeName = filters.userId ? users.find(u => String(u.id) === String(filters.userId))?.name || '---' : 'Todos';
    const periodoStr = `${filters.startDate ? new Date(filters.startDate + 'T00:00:00').toLocaleDateString('pt-BR') : 'Início'} até ${filters.endDate ? new Date(filters.endDate + 'T00:00:00').toLocaleDateString('pt-BR') : 'Fim'}`;

    const colorBlue: [number, number, number] = [30, 58, 95];
    const colorOrange: [number, number, number] = [234, 88, 12];
    const colorSlate: [number, number, number] = [100, 116, 139];

    // --- DECORATIVE ELEMENTS (HEADER) ---
    doc.setFillColor(...colorBlue);
    doc.triangle(pageWidth, 0, pageWidth - 35, 0, pageWidth, 8, 'F');
    doc.setFillColor(...colorOrange);
    doc.circle(pageWidth - 1, 1, 2.5, 'F');
    
    // --- 1. HEADER ---
    doc.setFillColor(...colorBlue);
    doc.roundedRect(marginLeft, currentY, 13, 13, 1.5, 1.5, 'F');
    doc.setFillColor(...colorOrange);
    doc.rect(marginLeft + 2.5, currentY + 10.5, 8, 1, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text('A&R', marginLeft + 6.5, currentY + 8, { align: 'center' });
    
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(14);
    doc.text('A&R ENGENHARIA', marginLeft + 18, currentY + 4);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.text('SISTEMA DE CONTROLE DE PONTO', marginLeft + 18, currentY + 10);

    currentY += 22;
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text('RECIBO INDIVIDUAL', marginLeft, currentY);
    
    doc.setDrawColor(...colorOrange);
    doc.setLineWidth(1.2);
    doc.line(marginLeft, currentY + 4, marginLeft + 35, currentY + 4);

    // Gerado em area
    doc.setFontSize(7.5);
    doc.setTextColor(...colorSlate);
    doc.setFont("helvetica", "normal");
    const now = new Date();
    const metaIconX = pageWidth - marginLeft - 45;
    const metaIconY = currentY - 5;
    doc.setDrawColor(...colorBlue);
    doc.setLineWidth(0.4);
    doc.rect(metaIconX - 2, metaIconY - 2, 4, 4, 'D');
    doc.line(metaIconX - 2, metaIconY - 0.5, metaIconX + 2, metaIconY - 0.5);
    doc.circle(metaIconX + 1.2, metaIconY + 1.2, 1, 'D');
    
    doc.text(`Gerado em:`, pageWidth - marginLeft, currentY - 7, { align: 'right' });
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(`${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR')}`, pageWidth - marginLeft, currentY - 2, { align: 'right' });

    currentY += 14;

    // --- 2. INFO BAR ---
    const totalW = pageWidth - (marginLeft * 2);
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.roundedRect(marginLeft, currentY, totalW, 16, 2, 2, 'FD');

    const colWidths = [totalW * 0.25, totalW * 0.30, totalW * 0.22, totalW * 0.23];
    const labels = ['FUNCIONÁRIO', 'PERÍODO', 'TOTAL DE HORAS', 'TOTAL DE DIÁRIAS'];
    const values = [employeeName.toUpperCase(), periodoStr, subHoursTotal, calcMode === 'manual' ? `FIXO (R$${globalDiaria})` : 'INDIVIDUAL'];
    
    let xOffset = marginLeft;
    for (let i = 0; i < 4; i++) {
        const w = colWidths[i];
        doc.setFillColor(...colorBlue);
        doc.circle(xOffset + 8, currentY + 8, 4, 'F');
        doc.setDrawColor(255, 255, 255);
        doc.setLineWidth(0.4);
        const icX = xOffset + 8;
        const icY = currentY + 8;

        if (i === 0) { doc.circle(icX, icY - 1, 1.2, 'D'); doc.ellipse(icX, icY + 1.2, 2, 1, 'D'); }
        else if (i === 1) { doc.rect(icX - 1.5, icY - 1.5, 3, 3, 'D'); doc.line(icX - 1.5, icY - 0.5, icX + 1.5, icY - 0.5); }
        else if (i === 2) { doc.circle(icX, icY, 2, 'D'); doc.line(icX, icY, icX, icY - 1); doc.line(icX, icY, icX + 1, icY); }
        else { doc.rect(icX - 1.5, icY - 1.5, 3, 3, 'D'); }

        doc.setFontSize(6.5);
        doc.setTextColor(...colorSlate);
        doc.setFont("helvetica", "bold");
        doc.text(i === 3 ? 'MODO CÁLCULO' : labels[i], xOffset + 14, currentY + 6);
        doc.setFontSize(8.5);
        doc.setTextColor(15, 23, 42);
        doc.text(values[i], xOffset + 14, currentY + 10);
        
        if (i === 3) {
            doc.setFontSize(6);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(...colorSlate);
            const info = calcMode === 'manual' ? `Manual: R$ ${globalDiaria.toFixed(2)}` : 'Automático por Funcionário';
            doc.text(info, xOffset + 14, currentY + 14);
        }
        xOffset += w;
    }

    currentY += 24;

    // --- 3. PREMIUM TOTAL CARD ---
    const cardW = (totalW - 10) / 2;
    // Total a Pagar Card
    doc.setFillColor(...colorBlue);
    doc.roundedRect(marginLeft, currentY, cardW + 30, 24, 2, 2, 'F');
    doc.setDrawColor(...colorBlue);
    doc.setLineWidth(0.8);
    doc.roundedRect(marginLeft, currentY, cardW + 30, 24, 2, 2, 'D');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text('TOTAL A PAGAR', marginLeft + 15, currentY + 7);
    
    doc.setTextColor(...colorOrange);
    doc.setFontSize(22);
    doc.text(formatCurrency(totalCostToDisplay), marginLeft + 15, currentY + 18);
    
    // Valor da Diária Card
    const secondCardX = marginLeft + cardW + 40;
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(secondCardX, currentY, cardW - 30, 24, 2, 2, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.roundedRect(secondCardX, currentY, cardW - 30, 24, 2, 2, 'D');
    
    doc.setTextColor(...colorSlate);
    doc.setFontSize(7);
    doc.text(calcMode === 'auto' ? 'CÁLCULO' : 'VALOR DA DIÁRIA', secondCardX + 10, currentY + 7);
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(calcMode === 'auto' ? 10 : 14);
    doc.text(calcMode === 'auto' ? 'Automático (Individual)' : formatCurrency(globalDiaria), secondCardX + 10, currentY + 16);

    currentY += 32;

    // --- 4. TABLES ---
    const drawSectionHeader = (title: string, y: number, isList = false) => {
        doc.setFillColor(...colorBlue);
        doc.circle(marginLeft + 3, y - 1, 3.5, 'F');
        doc.setDrawColor(255, 255, 255);
        doc.setLineWidth(0.4);
        const icX = marginLeft + 3;
        const icY = y - 1;
        if (isList) { doc.rect(icX - 1.2, icY - 1.2, 2.4, 2.4, 'D'); }
        else { doc.line(icX - 1.5, icY + 1.2, icX - 1.5, icY - 0.5); doc.line(icX, icY + 1.2, icX, icY - 1.2); }
        doc.setFontSize(11);
        doc.setTextColor(...colorBlue);
        doc.setFont("helvetica", "bold");
        doc.text(title, marginLeft + 8, y);
    };

    drawSectionHeader('RESUMO POR OBRA', currentY);
    currentY += 6;

    const workSummaryMap = new Map();
    finalData.forEach(p => {
       const canonical = String(p.workName || 'Extra/Outros').trim().toUpperCase();
       if (!workSummaryMap.has(canonical)) workSummaryMap.set(canonical, { name: p.workName || 'Extra/Outros', mins: 0, cost: 0 });
       const w = workSummaryMap.get(canonical);
       w.mins += p.workedMinutes;
       w.cost += p.valorTotal;
    });

    autoTable(doc, {
      startY: currentY,
      margin: { left: marginLeft, right: marginLeft },
      head: [['OBRA', 'HORAS', 'VALOR']],
      body: [
        ...Array.from(workSummaryMap.values()).map(w => [w.name, formatarMinutos(w.mins), formatCurrency(w.cost)]),
        ['TOTAL GERAL', subHoursTotal, formatCurrency(totalCostToDisplay)]
      ],
      theme: 'grid',
      headStyles: { fillColor: colorBlue, textColor: 255, fontSize: 8.5, halign: 'center', cellPadding: 1.5 },
      bodyStyles: { fontSize: 8, halign: 'center', valign: 'middle', textColor: [30, 41, 59], cellPadding: 1 },
      alternateRowStyles: { fillColor: [252, 252, 254] },
      columnStyles: { 0: { halign: 'center', fontStyle: 'bold' }, 1: { halign: 'center' }, 2: { halign: 'center', fontStyle: 'bold' } },
      didParseCell: (data: any) => {
        if (data.row.index === workSummaryMap.size) {
            data.cell.styles.fillColor = colorBlue;
            data.cell.styles.textColor = [255, 255, 255];
        }
      }
    });

    currentY = (doc as any).lastAutoTable.finalY + 10;
    drawSectionHeader('DETALHAMENTO DE HORAS', currentY, true);
    currentY += 6;

    const sortedData = [...finalData].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return (a.entrada || '').localeCompare(b.entrada || '');
    });

    autoTable(doc, {
      startY: currentY + 4,
      margin: { left: marginLeft, right: marginLeft },
      head: [['DATA', 'OBRA', 'ENTRADA - SAÍDA', 'HORAS', 'VALOR']],
      body: sortedData.map(p => [
        new Date(p.date + 'T00:00:00').toLocaleDateString('pt-BR'),
        p.workName || '---',
        `${p.entrada || '--:--'} às ${p.saida || '--:--'}`,
        p.workedHoursStr,
        formatCurrency(p.valorTotal)
      ]),
      theme: 'striped',
      headStyles: { fillColor: colorBlue, fontSize: 8, halign: 'center', cellPadding: 1.2 },
      bodyStyles: { fontSize: 7, halign: 'center', valign: 'middle', cellPadding: 0.8 },
      columnStyles: { 0: { halign: 'center', cellWidth: 24 }, 1: { halign: 'center' }, 2: { halign: 'center', cellWidth: 32 }, 3: { halign: 'center', cellWidth: 18 }, 4: { halign: 'center', fontStyle: 'bold', cellWidth: 24 } }
    });

    currentY = (doc as any).lastAutoTable.finalY + 12;

    // --- 5. SIGNATURE AREA ---
    if (currentY > 230) { doc.addPage(); currentY = 20; }
    
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(marginLeft, currentY, totalW, 40, 2, 2, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(marginLeft, currentY, totalW, 40, 2, 2, 'D');
    
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);
    doc.setFont("helvetica", "normal");
    const declaration = "Declaro que recebi o valor acima discriminado, referente às horas trabalhadas no período especificado.";
    const splitDec = doc.splitTextToSize(declaration, totalW - 20);
    doc.text(splitDec, pageWidth / 2, currentY + 8, { align: 'center' });

    doc.setDrawColor(...colorBlue);
    doc.setLineWidth(0.5);
    doc.line(marginLeft + 20, currentY + 28, marginLeft + totalW - 20, currentY + 28);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text('ASSINATURA DO FUNCIONÁRIO', pageWidth / 2, currentY + 34, { align: 'center' });
    
    doc.text(`DATA: ________ / ________ / ________`, pageWidth / 2 + 60, currentY + 34, { align: 'right' });

    // FOOTER (Multi-page)
    const totalPgs = (doc.internal as any).getNumberOfPages();
    for (let i = 1; i <= totalPgs; i++) {
        doc.setPage(i);
        doc.setFillColor(...colorBlue);
        doc.rect(0, 288, pageWidth, 9, 'F');
        doc.setFillColor(...colorOrange);
        doc.rect(0, 287.5, 60, 0.4, 'F');
        
        doc.setFontSize(7.5);
        doc.setTextColor(255, 255, 255);
        doc.text('A&R Engenharia | Sistema de Controle de Ponto', marginLeft, 294);
        
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(pageWidth - marginLeft - 18, 290, 18, 5, 0.8, 0.8, 'F');
        doc.setTextColor(...colorBlue);
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.text(`Página ${i} de ${totalPgs}`, pageWidth - marginLeft - 9, 293.5, { align: 'center' });
    }
    
    doc.save(`Recibo_${employeeName.replace(/\s/g, '_')}_${new Date().getTime()}.pdf`);
}


function generateFechamentoPDF(
  finalData: any[], 
  totalCostToDisplay: number, 
  filters: any, 
  users: UserData[], 
  works: Work[],
  globalDiaria: number,
  calcMode: 'auto' | 'diaria' | 'manual'
) {
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = 210;
    const marginLeft = 15;
    let currentY = 18;
    
    const colorBlue: [number, number, number] = [30, 58, 95];
    const colorOrange: [number, number, number] = [234, 88, 12];
    const colorSlate: [number, number, number] = [100, 116, 139];
    const colorGreen: [number, number, number] = [22, 163, 74];

    const subMinsTotal = finalData.reduce((acc: number, curr: any) => acc + curr.workedMinutes, 0);
    const subHoursTotal = formatarMinutos(subMinsTotal);
    const subDiariasTotal = subMinsTotal / MINUTES_PER_DIARIA;

    const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    const d = filters.startDate ? new Date(filters.startDate + 'T00:00:00') : new Date();
    const periodText = `${monthNames[d.getMonth()]}/${d.getFullYear()}`;

    // --- DECORATIVE ELEMENTS (HEADER) ---
    doc.setFillColor(...colorBlue);
    doc.triangle(pageWidth, 0, pageWidth - 35, 0, pageWidth, 8, 'F');
    doc.setFillColor(...colorOrange);
    doc.circle(pageWidth - 1, 1, 2.5, 'F');

    // --- 1. HEADER ---
    doc.setFillColor(...colorBlue);
    doc.roundedRect(marginLeft, currentY, 13, 13, 1.5, 1.5, 'F');
    doc.setFillColor(...colorOrange);
    doc.rect(marginLeft + 2.5, currentY + 10.5, 8, 1, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text('A&R', marginLeft + 6.5, currentY + 8, { align: 'center' });
    
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(14);
    doc.text('A&R ENGENHARIA', marginLeft + 18, currentY + 4);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.text('SISTEMA DE CONTROLE DE PONTO', marginLeft + 18, currentY + 10);
    
    currentY += 22;
    doc.setFontSize(20);
    doc.setTextColor(...colorBlue);
    doc.setFont("helvetica", "bold");
    doc.text('FECHAMENTO MENSAL', marginLeft, currentY);
    
    doc.setDrawColor(...colorOrange);
    doc.setLineWidth(1.2);
    doc.line(marginLeft, currentY + 4, marginLeft + 35, currentY + 4);

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(`Período: `, marginLeft + 0, currentY + 12);
    doc.setTextColor(...colorOrange);
    doc.text(periodText, marginLeft + 16, currentY + 12);

    // Gerado em area
    doc.setFontSize(7.5);
    doc.setTextColor(...colorSlate);
    const now = new Date();
    const metaIconX = pageWidth - marginLeft - 45;
    const metaIconY = currentY - 5;
    doc.setDrawColor(...colorBlue);
    doc.setLineWidth(0.4);
    doc.rect(metaIconX - 2, metaIconY - 2, 4, 4, 'D');
    doc.line(metaIconX - 2, metaIconY - 0.5, metaIconX + 2, metaIconY - 0.5);
    doc.circle(metaIconX + 1.2, metaIconY + 1.2, 1, 'D');
    doc.text(`Gerado em:`, pageWidth - marginLeft, currentY - 7, { align: 'right' });
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(`${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR')}`, pageWidth - marginLeft, currentY - 2, { align: 'right' });

    currentY += 18;

    // --- 2. CARDS SUMMARY ---
    const gridSpacing = 5;
    const totalW = pageWidth - (marginLeft * 2);
    const cardW = (totalW - (gridSpacing * 2)) / 3;
    
    const drawSummaryCard = (x: number, label: string, val: string, isOrange = false) => {
      doc.setFillColor(242, 244, 247);
      doc.roundedRect(x + 0.5, currentY + 0.5, cardW, 30, 2, 2, 'F');
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(226, 232, 240);
      if (isOrange) doc.setDrawColor(...colorOrange);
      doc.setLineWidth(isOrange ? 0.6 : 0.25);
      doc.roundedRect(x, currentY, cardW, 30, 2, 2, 'FD');
      
      const icX = x + cardW / 2;
      const icY = currentY + 7;
      doc.setFillColor(242, 245, 248);
      doc.circle(icX, icY, 5, 'F');
      doc.setDrawColor(...colorBlue);
      doc.setLineWidth(0.4);
      if (label.includes('HORAS')) {
          doc.circle(icX, icY, 2, 'D'); doc.line(icX, icY, icX, icY - 1); doc.line(icX, icY, icX + 1, icY);
      } else if (label.includes('DIÁRIAS')) {
          doc.rect(icX - 1.5, icY - 1.5, 3, 3, 'D'); doc.line(icX - 1.5, icY - 0.4, icX + 1.5, icY - 0.4);
      } else {
          doc.setTextColor(...colorOrange);
          doc.setFontSize(8); doc.text('$', icX, icY + 1.2, { align: 'center' });
      }

      doc.setFontSize(8);
      doc.setTextColor(...colorSlate);
      doc.setFont("helvetica", "bold");
      doc.text(label, x + cardW / 2, currentY + 16, { align: 'center' });
      
      doc.setFontSize(isOrange ? 16 : 14);
      doc.setTextColor(isOrange ? colorOrange[0] : 15, isOrange ? colorOrange[1] : 23, isOrange ? colorOrange[2] : 42);
      doc.setFont("helvetica", "bold");
      doc.text(val, x + cardW / 2, currentY + 24, { align: 'center' });
      
      doc.setDrawColor(isOrange ? colorOrange[0] : 226, isOrange ? colorOrange[1] : 232, isOrange ? colorOrange[2] : 240);
      doc.setLineWidth(0.8);
      doc.line(x + 10, currentY + 27, x + cardW - 10, currentY + 27);
    };

    drawSummaryCard(marginLeft, 'TOTAL DE HORAS', subHoursTotal);
    drawSummaryCard(marginLeft + cardW + gridSpacing, 'TOTAL DE DIÁRIAS', subDiariasTotal.toFixed(2));
    drawSummaryCard(marginLeft + (cardW + gridSpacing) * 2, 'TOTAL GERAL', formatCurrency(totalCostToDisplay), true);

    currentY += 42;

    const drawSectionHeader = (title: string, y: number, isWork = false) => {
        doc.setFillColor(...colorBlue);
        doc.circle(marginLeft + 3, y - 1, 3.5, 'F');
        doc.setDrawColor(255, 255, 255);
        doc.setLineWidth(0.4);
        const icX = marginLeft + 3;
        const icY = y - 1;
        if (isWork) { doc.line(icX - 1.5, icY + 1.2, icX - 1.5, icY - 0.5); doc.line(icX, icY + 1.2, icX, icY - 1.2); }
        else { doc.circle(icX, icY - 1, 1); doc.ellipse(icX, icY + 1, 1.8, 0.8); }
        doc.setFontSize(11);
        doc.setTextColor(...colorBlue);
        doc.setFont("helvetica", "bold");
        doc.text(title, marginLeft + 8, y);
    };

    // --- 2. SUMMARY BY EMPLOYEE ---
    drawSectionHeader('RESUMO POR FUNCIONÁRIO', currentY);
    
    const userSummaryMap = new Map();
    finalData.forEach(p => {
       if(!userSummaryMap.has(p.userId)) userSummaryMap.set(p.userId, { name: p.userName || '---', mins: 0, cost: 0 });
       const u = userSummaryMap.get(p.userId);
       u.mins += p.workedMinutes;
       u.cost += p.valorTotal;
    });

    autoTable(doc, {
      startY: currentY + 5,
      margin: { left: marginLeft, right: marginLeft },
      head: [['FUNCIONÁRIO', 'HORAS', 'DIÁRIAS', 'TOTAL']],
      body: Array.from(userSummaryMap.values()).map(u => [u.name, formatarMinutos(u.mins), (u.mins / MINUTES_PER_DIARIA).toFixed(2), formatCurrency(u.cost)]),
      theme: 'grid',
      headStyles: { fillColor: colorBlue, textColor: 255, fontSize: 9, halign: 'center', cellPadding: 1.5 },
      bodyStyles: { fontSize: 8, halign: 'center', valign: 'middle', textColor: [30, 41, 59], cellPadding: 1.5 },
      alternateRowStyles: { fillColor: [252, 252, 254] },
      columnStyles: { 0: { halign: 'center', fontStyle: 'bold' }, 1: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'center', fontStyle: 'bold' } }
    });

    currentY = (doc as any).lastAutoTable.finalY + 10;

    // --- 3. SUMMARY BY WORK ---
    drawSectionHeader('RESUMO POR OBRA', currentY, true);
    
    const workSummaryMap = new Map();
    finalData.forEach(p => {
       const canonical = String(p.workName || 'EXTRA/OUTROS').trim().toUpperCase();
       if (!workSummaryMap.has(canonical)) workSummaryMap.set(canonical, { name: p.workName || 'Extra/Outros', mins: 0, cost: 0 });
       const w = workSummaryMap.get(canonical);
       w.mins += p.workedMinutes;
       w.cost += p.valorTotal;
    });

    autoTable(doc, {
      startY: currentY + 5,
      margin: { left: marginLeft, right: marginLeft },
      head: [['OBRA', 'HORAS', 'TOTAL']],
      body: [
        ...Array.from(workSummaryMap.values()).map(w => [w.name, formatarMinutos(w.mins), formatCurrency(w.cost)]),
        ['TOTAL GERAL', subHoursTotal, formatCurrency(totalCostToDisplay)]
      ],
      theme: 'grid',
      headStyles: { fillColor: [51, 65, 85], fontSize: 9, halign: 'center', cellPadding: 1.5 },
      bodyStyles: { fontSize: 8, halign: 'center', valign: 'middle', textColor: [30, 41, 59], cellPadding: 1.5 },
      alternateRowStyles: { fillColor: [252, 252, 254] },
      columnStyles: { 0: { halign: 'center', fontStyle: 'bold' }, 1: { halign: 'center' }, 2: { halign: 'center', fontStyle: 'bold' } },
      didParseCell: (data) => {
        if (data.row.index === workSummaryMap.size) {
            data.cell.styles.fillColor = colorBlue;
            data.cell.styles.textColor = [255, 255, 255];
        }
      }
    });

    currentY = (doc as any).lastAutoTable.finalY + 15;

    // --- 4. FINANCIAL SUMMARY BLOCK ---
    if(currentY > 220) { doc.addPage(); currentY = 20; }
    
    drawSectionHeader('RESUMO FINANCEIRO', currentY);
    currentY += 8;
    
    const finW = totalW;
    const colW = finW / 3;
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(marginLeft, currentY, finW, 30, 2, 2, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(marginLeft, currentY, finW, 30, 2, 2, 'D');

    const drawFinBlock = (x: number, label: string, val: string, isLast = false) => {
        doc.setFillColor(...colorBlue); doc.circle(x + 10, currentY + 8, 3, 'F'); doc.setDrawColor(255); doc.setLineWidth(0.3);
        if (label.includes('DIÁRIA BASE')) doc.rect(x + 9, currentY + 7, 2, 2, 'D');
        else if (label.includes('TOTAL DE DIÁRIAS')) doc.rect(x + 8.5, currentY + 6.5, 3, 3, 'D');
        else { doc.setTextColor(...colorOrange); doc.setFontSize(6); doc.text('$', x + 10, currentY + 10.5); }
        
        doc.setFontSize(7.5); doc.setTextColor(...colorSlate); doc.setFont("helvetica", "bold");
        doc.text(label, x + 16, currentY + 9);
        doc.setFontSize(11); doc.setTextColor(isLast ? colorOrange[0] : 15, isLast ? colorOrange[1] : 23, isLast ? colorOrange[2] : 42);
        doc.text(val, x + 16, currentY + 20);
        
        if (!isLast) { doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.2); doc.line(x + colW, currentY + 5, x + colW, currentY + 25); }
    };
    
    drawFinBlock(marginLeft, calcMode === 'auto' ? 'CÁLCULO' : 'MODO DE CÁLCULO', calcMode === 'auto' ? 'Automático por Func.' : `Manual (Base R$${globalDiaria.toFixed(2)})`);
    drawFinBlock(marginLeft + colW, 'TOTAL DE DIÁRIAS', subDiariasTotal.toFixed(2));
    drawFinBlock(marginLeft + colW * 2, 'TOTAL GERAL A PAGAR', formatCurrency(totalCostToDisplay), true);

    // FOOTER
    const totalPg = (doc.internal as any).getNumberOfPages();
    for (let i = 1; i <= totalPg; i++) {
        doc.setPage(i);
        doc.setFillColor(...colorBlue);
        doc.rect(0, 288, pageWidth, 9, 'F');
        doc.setFillColor(...colorOrange);
        doc.rect(0, 287.5, 60, 0.4, 'F');
        doc.setFontSize(7.5); doc.setTextColor(255, 255, 255);
        doc.text(`A&R Engenharia | Fechamento Mensal`, marginLeft, 294);
        doc.setFillColor(255, 255, 255); doc.roundedRect(pageWidth - marginLeft - 18, 290, 18, 5, 0.8, 0.8, 'F');
        doc.setTextColor(...colorBlue); doc.setFontSize(7); doc.setFont("helvetica", "bold");
        doc.text(`Página ${i} de ${totalPg}`, pageWidth - marginLeft - 9, 293.5, { align: 'center' });
    }

    doc.save(`Fechamento_${periodText.replace('/', '_')}.pdf`);
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
  NAO_INICIADO = 'NAO_INICIADO',
  TRABALHANDO_1 = 'TRABALHANDO_1',
  PAUSADO = 'PAUSADO',
  TRABALHANDO_2 = 'TRABALHANDO_2',
  TRABALHANDO = 'TRABALHANDO',
  ENCERRADO = 'ENCERRADO'
}

interface PointSegmentRecord {
  horario: string;
  obraId: string;
  obraNome: string;
  observacao: string;
  gps: {
    lat: number;
    lng: number;
    acc: number;
    address: string;
    dist?: number;
    status?: string;
    suspeito?: number;
  };
}

interface GPSData {
  lat: number;
  lng: number;
  acc: number;
  address: string;
  dist?: number;
  status?: string;
  suspeito?: number;
}

interface IntervaloTrabalho {
  obraId: string;
  obraNome: string;
  entrada: string;
  saida: string;
  minutos: number;
  horasFormatadas: string;
  valor: number;
  observacoes: string[];
  gpsEntrada?: GPSData;
  gpsSaida?: GPSData;
}

interface ResumoRegistro {
  totalMinutos: number;
  totalHorasFormatadas: string;
  valorTotal: number;
  intervalos: IntervaloTrabalho[];
  status: "TRABALHANDO" | "ENCERRADO" | "NAO_INICIADO" | "PAUSADO";
  possuiInconsistencia: boolean;
}

interface PointRecord {
  id: string;
  user_id: string;
  funcionario_id?: string;
  user_name?: string;
  date: string;
  status: WorkStatus;
  
  entrada1?: PointSegmentRecord;
  saida1?: PointSegmentRecord;
  entrada2?: PointSegmentRecord;
  saida2?: PointSegmentRecord;

  // Novos campos para observações independentes
  obs_entrada1?: string;
  obs_saida1?: string;
  obs_entrada2?: string;
  obs_saida2?: string;

  // Legacy flat fields
  entrada1_lat?: number;
  entrada1_lng?: number;
  entrada1_acc?: number;
  entrada1_dist?: number;
  entrada1_gps_suspeito?: number;
  entrada1_gps_status?: string;
  entrada1_obra?: string;

  saida1_lat?: number;
  saida1_lng?: number;
  saida1_acc?: number;
  saida1_dist?: number;
  saida1_gps_suspeito?: number;
  saida1_gps_status?: string;

  entrada2_lat?: number;
  entrada2_lng?: number;
  entrada2_acc?: number;
  entrada2_dist?: number;
  entrada2_gps_suspeito?: number;
  entrada2_gps_status?: string;
  entrada2_obra?: string;

  saida2_lat?: number;
  saida2_lng?: number;
  saida2_acc?: number;
  saida2_dist?: number;
  saida2_gps_suspeito?: number;
  saida2_gps_status?: string;

  work_name?: string;
  work_id?: string;
  editado_manual?: number;
  encerrado?: number;

  obs: string;
  observations?: { etapa: string; texto: string; timestamp: number }[];
  total_hours: string;
  last_timestamp?: number;
}

// --- Data Adaptation ---

export const getHorarioDisplay = (val: any): string => {
  if (!val) return '--:--';
  if (typeof val === 'string') return val || '--:--';
  if (typeof val === 'object') {
     if (typeof val.horario === 'string') return val.horario || '--:--';
     if (val.horario) return String(val.horario);
  }
  return '--:--';
};

export const getObraDisplay = (val: any, legacyFallback?: any): string => {
  if (!val) {
    return (typeof legacyFallback === 'string') ? legacyFallback : 'Não informada';
  }
  
  if (typeof val === 'object') {
    if (typeof val.obraNome === 'string') return val.obraNome;
  }
  
  return (typeof val === 'string') ? val : ((typeof legacyFallback === 'string') ? legacyFallback : 'Não informada');
};

export const getObservacaoDisplay = (val: any, legacyFallback?: string): string => {
  if (!val) return legacyFallback || '';
  if (typeof val === 'object') {
    if (typeof val.observacao === 'string') return val.observacao || legacyFallback || '';
    if (val.observacao) return String(val.observacao);
  }
  if (typeof val === 'string') return val || legacyFallback || '';
  return legacyFallback || '';
};

export const ensurePointSegment = (val: any, obraId?: string, obraNome?: string, obs?: string): PointSegmentRecord => {
  if (val && typeof val === 'object' && val.horario !== undefined) {
    return {
      horario: getHorarioDisplay(val),
      obraId: val.obraId || obraId || '',
      obraNome: val.obraNome || obraNome || 'Não informada',
      observacao: obs !== undefined ? obs : (val.observacao || ''),
      gps: val.gps || { lat: 0, lng: 0, acc: 0, address: '' }
    };
  }
  
  return {
    horario: getHorarioDisplay(val),
    obraId: obraId || '',
    obraNome: obraNome || 'Não informada',
    observacao: obs || '',
    gps: { lat: 0, lng: 0, acc: 0, address: '' }
  };
};

const adaptLegacyPoint = (data: any): PointRecord => {
  if (!data) return data;

  const newP: PointRecord = {
    ...data,
    status: data.status || WorkStatus.NAO_INICIADO,
  };

  // Convert all segments to the official object structure
  newP.entrada1 = ensurePointSegment(data.entrada1, data.work_id, data.entrada1_obra || data.work_name, data.obs_entrada1);
  newP.saida1 = ensurePointSegment(data.saida1, '', '', data.obs_saida1);
  newP.entrada2 = ensurePointSegment(data.entrada2, '', data.entrada2_obra || data.entrada1_obra || data.work_name, data.obs_entrada2);
  newP.saida2 = ensurePointSegment(data.saida2, '', '', data.obs_saida2);

  // Sync legacy fields if they exist to the new objects if objects were empty but legacy fields had data
  if (newP.entrada1.horario === '--:--' && data.entrada1 && typeof data.entrada1 === 'string') {
    newP.entrada1.horario = data.entrada1;
  }
  
  // Ensure GPS data is migrated if missing from segments
  if (newP.entrada1.gps.lat === 0 && data.entrada1_lat) {
     newP.entrada1.gps = { 
       lat: data.entrada1_lat, 
       lng: data.entrada1_lng || 0, 
       acc: data.entrada1_acc || 0, 
       address: data.entrada1_address || '',
       dist: data.entrada1_dist,
       status: data.entrada1_gps_status,
       suspeito: data.entrada1_gps_suspeito
     };
  }
  if (newP.saida1.gps.lat === 0 && data.saida1_lat) {
     newP.saida1.gps = { lat: data.saida1_lat, lng: data.saida1_lng || 0, acc: data.saida1_acc || 0, address: data.saida1_address || '', dist: data.saida1_dist, status: data.saida1_gps_status, suspeito: data.saida1_gps_suspeito };
  }
  if (newP.entrada2.gps.lat === 0 && data.entrada2_lat) {
     newP.entrada2.gps = { lat: data.entrada2_lat, lng: data.entrada2_lng || 0, acc: data.entrada2_acc || 0, address: data.entrada2_address || '', dist: data.entrada2_dist, status: data.entrada2_gps_status, suspeito: data.entrada2_gps_suspeito };
  }
  if (newP.saida2.gps.lat === 0 && data.saida2_lat) {
     newP.saida2.gps = { lat: data.saida2_lat, lng: data.saida2_lng || 0, acc: data.saida2_acc || 0, address: data.saida2_address || '', dist: data.saida2_dist, status: data.saida2_gps_status, suspeito: data.saida2_gps_suspeito };
  }

  return newP;
};

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
  const totalMinutes = h * 60 + m;
  // No sistema híbrido, retorna o proporcional exato de diárias
  return totalMinutes / MINUTES_PER_DIARIA;
};

const calculateCostForUser = (totalHoursStr: string, valorDiaria: number) => {
  if (!totalHoursStr || !totalHoursStr.includes(':')) return 0;
  const [h, m] = totalHoursStr.split(':').map(Number);
  const totalMinutes = h * 60 + m;
  const valorDiariaEfetivo = valorDiaria || 180;
  return totalMinutes * (valorDiariaEfetivo / MINUTES_PER_DIARIA);
};
/**
 * NOTE: The "WebSocket closed without opened" error seen in the console is a known 
 * issue with Vite's HMR in this environment and does not affect the application's functionality.
 */

const calculateWorkStatus = (p: PointRecord | null): WorkStatus => {
  if (!p) return WorkStatus.NAO_INICIADO;
  if (p.encerrado) return WorkStatus.ENCERRADO;
  if (p.status) return p.status as WorkStatus;

  // Fallback
  if (p.saida2 && getHorarioDisplay(p.saida2) !== '--:--') return WorkStatus.ENCERRADO;
  if (p.entrada2 && getHorarioDisplay(p.entrada2) !== '--:--') return WorkStatus.TRABALHANDO;
  if (p.saida1 && getHorarioDisplay(p.saida1) !== '--:--') return WorkStatus.PAUSADO;
  if (p.entrada1 && getHorarioDisplay(p.entrada1) !== '--:--') return WorkStatus.TRABALHANDO;
  
  return WorkStatus.NAO_INICIADO;
};

const getPointStatus = (p: PointRecord | null) => {
  const status = calculateWorkStatus(p);
  if (status === WorkStatus.ENCERRADO) return { label: 'Encerrado', since: getHorarioDisplay(p?.saida2) !== '--:--' ? getHorarioDisplay(p?.saida2) : getHorarioDisplay(p?.saida1), color: 'text-slate-400', bg: 'bg-slate-800', border: 'border-slate-700' };
  if (status === WorkStatus.PAUSADO) return { label: 'Pausado', since: getHorarioDisplay(p?.saida1), color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/20' };
  if (status === WorkStatus.TRABALHANDO || status === WorkStatus.TRABALHANDO_1 || status === WorkStatus.TRABALHANDO_2) {
    const since = (getHorarioDisplay(p?.entrada2) !== '--:--' && getHorarioDisplay(p?.saida1) !== '--:--') ? getHorarioDisplay(p?.entrada2) : getHorarioDisplay(p?.entrada1);
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
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

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
      
      const unsubscribePoints = onSnapshot(q, (snapshot) => {
        const pData = snapshot.docs.map(doc => {
          const data = doc.data() as any;
          const status = data.status || calculateWorkStatus(adaptLegacyPoint({ ...data, id: doc.id }));
          
          return adaptLegacyPoint({ ...data, id: doc.id, status });
        });
        
        // Recalculate total_hours for presentation only
        const recalculated = pData.map(p => {
          const metrics = calculateRecordMetrics(p);
          if (metrics.workedHours !== p.total_hours) {
            return { ...p, total_hours: metrics.workedHours };
          }
          return p;
        });

        // Use a simple JSON check to avoid unnecessary state updates if data is identical
        setPoints(current => {
          if (JSON.stringify(current) === JSON.stringify(recalculated)) return current;
          return recalculated;
        });
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
    localStorage.setItem('ar_current_view', view);
  }, [view]);

  const handleLogout = async () => {
    await signOut(auth);
    setUser(null);
  };

  const instalarApp = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
      return;
    }

    alert(
      "Para instalar:\n\n" +
      "1. Clique nos 3 pontinhos do navegador\n" +
      "2. Toque em 'Adicionar à tela inicial'\n" +
      "3. Confirme a instalação"
    );
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">Carregando...</div>;

  if (!user) return <LoginPage deferredPrompt={deferredPrompt} setDeferredPrompt={setDeferredPrompt} />;

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
            <div className="space-y-3">
              <Button 
                variant="secondary" 
                className="w-full text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/5" 
                onClick={instalarApp}
              >
                <Smartphone size={18} /> Instalar App
              </Button>
              <Button variant="secondary" className="w-full" onClick={handleLogout}>
                <LogOut size={18} /> Sair
              </Button>
            </div>
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

function LoginPage({ deferredPrompt, setDeferredPrompt }: { deferredPrompt: any, setDeferredPrompt: (v: any) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const instalarApp = async () => {
    // ANDROID (funciona automático)
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
      return;
    }

    // FALLBACK (quando não dá instalar direto)
    alert(
      "Para instalar:\n\n" +
      "1. Clique nos 3 pontinhos do navegador\n" +
      "2. Toque em 'Adicionar à tela inicial'\n" +
      "3. Confirme a instalação"
    );
  };

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
      if (e.code !== 'auth/invalid-credential' && e.code !== 'auth/wrong-password' && e.code !== 'auth/user-not-found') {
        console.error("Erro de autenticação:", e.message || e);
      }
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
          if (e.code === 'auth/network-request-failed') {
            setError('Erro de conexão. Verifique se o domínio está autorizado no console do Firebase e se não há bloqueadores de anúncios ativos.');
          } else {
            setError('Erro ao realizar login. Verifique suas credenciais.');
          }
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#050510] flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-[#ff4e00] rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-orange-900/40">
            <Clock className="text-white" size={36} />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-wide mb-1">A&R ENGENHARIA</h1>
          <p className="text-slate-500 font-medium uppercase tracking-[0.3em] text-[10px]">Sistema de Controle de Ponto</p>
        </div>

        <div className="bg-[#0a0a1a] border border-slate-800/50 rounded-[24px] p-8 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Usuário</label>
              <input 
                type="text"
                value={username} 
                onChange={e => setUsername(e.target.value)} 
                placeholder="Digite seu usuário"
                required
                className="w-full bg-[#0d0d26] border border-slate-800 rounded-xl px-4 py-3.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#ff4e00]/50 transition-all placeholder:text-slate-600"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Senha</label>
              <input 
                type="password"
                value={password} 
                onChange={e => setPassword(e.target.value)} 
                placeholder="••••••••"
                required
                className="w-full bg-[#0d0d26] border border-slate-800 rounded-xl px-4 py-3.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#ff4e00]/50 transition-all placeholder:text-slate-600"
              />
            </div>
            
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-4 rounded-xl text-sm flex items-center gap-3">
                <AlertCircle size={18} />
                {error}
              </div>
            )}

            <button 
              type="submit" 
              disabled={loading}
              className="w-full py-4 text-base font-bold bg-[#ff4e00] hover:bg-[#ff5e10] text-white rounded-xl shadow-lg shadow-orange-900/20 transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? 'Acessando...' : 'Acessar Sistema'}
            </button>
          </form>

          <button
            onClick={instalarApp}
            className="w-full mt-6 py-3 text-[14px] font-semibold bg-transparent text-[#00c853] border border-[#00c853]/40 rounded-xl flex items-center justify-center gap-2 opacity-90 hover:opacity-100 hover:bg-[#00c853]/5 transition-all"
          >
            <Smartphone size={18} />
            Instalar aplicativo
          </button>
        </div>
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

      // First gather top-level present users and total alerts
      todayPoints.forEach((p: any) => {
        presentUsers.add(String(p.user_id));
      });

      // Extract intervals to split work times accurately
      const intervals = extractIntervalsFromPoints(todayPoints, users, works);

      intervals.forEach(inv => {
        const userIdStr = String(inv.userId);
        const minutes = inv.workedMinutes;
        
        totalMinutes += minutes;

        // Group minutes by user
        if (!userMinutesMap.has(userIdStr)) {
            userMinutesMap.set(userIdStr, 0);
        }
        userMinutesMap.set(userIdStr, userMinutesMap.get(userIdStr) + minutes);

        const workName = inv.workName || 'Não informada';
        if (!workMap.has(workName)) {
          workMap.set(workName, { name: workName, employees: new Set(), minutes: 0, cost: 0, userMinutes: new Map() });
        }
        
        const work = workMap.get(workName);
        work.employees.add(userIdStr);
        work.minutes += minutes;
        work.cost += inv.valorTotal;

        // Track minutes per user in this work for cost distribution
        if (!work.userMinutes.has(userIdStr)) {
            work.userMinutes.set(userIdStr, 0);
        }
        work.userMinutes.set(userIdStr, work.userMinutes.get(userIdStr) + minutes);
      });

      // Update totalCost
      totalCost = Array.from(workMap.values()).reduce((acc, curr) => acc + curr.cost, 0);

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
                            {getObraDisplay(p.entrada2) !== 'Não informada' ? getObraDisplay(p.entrada2) : getObraDisplay(p.entrada1, p.work_name || '---')}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-slate-300 text-center">{getHorarioDisplay(p.entrada1)}</td>
                      <td className="px-6 py-4 text-sm font-bold text-slate-300 text-center">{getHorarioDisplay(p.saida2) !== '--:--' ? getHorarioDisplay(p.saida2) : getHorarioDisplay(p.saida1)}</td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-sm font-black text-white">
                          {p.total_hours}
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
                            {getObraDisplay(p.entrada2) !== 'Não informada' ? getObraDisplay(p.entrada2) : getObraDisplay(p.entrada1, p.work_name || '---')}
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
                        <p className="text-sm font-bold text-white">{getHorarioDisplay(p.entrada1)}</p>
                      </div>
                      <div className="w-4 border-t border-slate-600"></div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Saída</p>
                        <p className="text-sm font-bold text-white">{getHorarioDisplay(p.saida2) !== '--:--' ? getHorarioDisplay(p.saida2) : getHorarioDisplay(p.saida1)}</p>
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
      
      // Also delete their points correctly (in bulk)
      const userPoints = await storage.getPoints(deleteConfirmation.id);
      if (userPoints.length > 0) {
        await storage.deletePoints(userPoints.map(p => p.id));
      }
  
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
              <div className="text-right flex flex-col items-end gap-1">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">H. Trab:</span>
                  <span className="px-2.5 py-1 bg-slate-900 rounded-lg text-sm font-black text-white border border-slate-700">
                    {p.total_hours}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <PointHistoryItem label="Entrada 1" time={getHorarioDisplay(p.entrada1)} obra={getObraDisplay(p.entrada1, p.work_name)} />
              <PointHistoryItem label="Saída 1" time={getHorarioDisplay(p.saida1)} obra={getObraDisplay(p.saida1)} />
              <PointHistoryItem label="Entrada 2" time={getHorarioDisplay(p.entrada2)} obra={getObraDisplay(p.entrada2, getObraDisplay(p.entrada1, p.work_name))} />
              <PointHistoryItem label="Saída 2" time={getHorarioDisplay(p.saida2)} obra={getObraDisplay(p.saida2)} />
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
  const [loading, setLoading] = useState(false);
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
  const [manualFormData, setManualFormData] = useState<any>({ 
    user_id: '', 
    date: '', 
    entrada1: '', 
    saida1: '', 
    entrada2: '', 
    saida2: '', 
    entrada1_obra: '', 
    entrada2_obra: '', 
    obs: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [backupDates, setBackupDates] = useState({ startDate: '', endDate: '' });
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
  const [importFilters, setImportFilters] = useState({ startDate: '', endDate: '' });

  useEffect(() => {
    const saved = localStorage.getItem("lastBackup");
    if (saved) {
      setLastBackup(saved);
    }
  }, []);

  const updateLastBackup = () => {
    const now = new Date().toISOString();
    localStorage.setItem("lastBackup", now);
    setLastBackup(now);
  };

  const handleBackupByPeriod = () => {
    if (!backupDates.startDate || !backupDates.endDate) {
      alert("Por favor, selecione o período completo.");
      return;
    }

    const start = new Date(backupDates.startDate);
    const end = new Date(backupDates.endDate);
    // Ajustar fim para o final do dia
    end.setHours(23, 59, 59, 999);

    const filtrados = points.filter(item => {
      const dataStr = item.date;
      if (!dataStr) return false;
      const data = new Date(dataStr);
      return data >= start && data <= end;
    });

    if (filtrados.length === 0) {
      alert("Nenhum registro encontrado no período selecionado.");
      return;
    }

    exportarBackup(filtrados);
    updateLastBackup();
    setIsBackupModalOpen(false);
  };

  const handleClearAll = async () => {
    try {
      setLoading(true);
      await storage.clearPoints();
      setShowConfirmDelete(false);
      alert("Dados apagados com sucesso!");
      onRefresh();
    } catch (error) {
      console.error(error);
      alert("Erro ao apagar!");
    } finally {
      setLoading(false);
    }
  };




  const handleImportFile = async () => {
    if (!pendingImportFile) return;
    setIsSubmitting(true);

    try {
      if (typeof window === "undefined" || !pendingImportFile) return;
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
      const pointsToSave: PointRecord[] = [];

      for (const name in groupedData) {
        const userObj = users.find(u => (u.name || '').toLowerCase() === String(name).toLowerCase() || (u.username || '').toLowerCase() === String(name).toLowerCase());
        
        for (const dateStr in groupedData[name]) {
          for (const work in groupedData[name][dateStr]) {
            const times = groupedData[name][dateStr][work];

            let point = allPoints.find(p => 
              (userObj ? String(p.user_id) === String(userObj.id) : p.user_name === name) && 
              p.date === dateStr
            );

            if (!point) {
              point = {
                id: crypto.randomUUID(),
                user_id: userObj ? String(userObj.id) : '0',
                funcionario_id: userObj ? String(userObj.id) : '0',
                user_name: name,
                date: dateStr,
                entrada1_lat: 0, entrada1_lng: 0, entrada1_acc: 0,
                saida1_lat: 0, saida1_lng: 0, saida1_acc: 0,
                entrada2_lat: 0, entrada2_lng: 0, entrada2_acc: 0,
                saida2_lat: 0, saida2_lng: 0, saida2_acc: 0,
                obs: `Importado da planilha - Obra: ${work}`,
                total_hours: '00:00',
                status: WorkStatus.NAO_INICIADO,
                editado_manual: 1
              };
            }

            let changed = false;

            if (times[0] && (!point.entrada1 || getHorarioDisplay(point.entrada1) === '--:--')) { point.entrada1 = { horario: times[0], obraId: '', obraNome: work, observacao: '', gps: { lat:0, lng:0, acc:0, address:'' } }; changed = true; }
            if (times[1] && (!point.saida1 || getHorarioDisplay(point.saida1) === '--:--')) { point.saida1 = { horario: times[1], obraId: '', obraNome: work, observacao: '', gps: { lat:0, lng:0, acc:0, address:'' } }; changed = true; }
            if (times[2] && (!point.entrada2 || getHorarioDisplay(point.entrada2) === '--:--')) { point.entrada2 = { horario: times[2], obraId: '', obraNome: work, observacao: '', gps: { lat:0, lng:0, acc:0, address:'' } }; changed = true; }
            if (times[3] && (!point.saida2 || getHorarioDisplay(point.saida2) === '--:--')) { point.saida2 = { horario: times[3], obraId: '', obraNome: work, observacao: '', gps: { lat:0, lng:0, acc:0, address:'' } }; changed = true; }

            if (changed) {
              point.total_hours = calculateRecordMetrics(point).workedHours;
              point.status = calculateWorkStatus(point);
              pointsToSave.push(point);
              updatedCount++;
            }
          }
        }
      }

      if (pointsToSave.length > 0) {
        await storage.savePoints(pointsToSave);
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
      const userObj = users.find(u => String(u.id) === String(manualFormData.user_id));
      
      const newPoint: PointRecord = {
        id: crypto.randomUUID(),
        user_id: String(manualFormData.user_id),
        funcionario_id: String(manualFormData.user_id),
        user_name: userObj?.name || '---',
        date: manualFormData.date,
        entrada1: ensurePointSegment(manualFormData.entrada1, '', manualFormData.entrada1_obra),
        saida1: ensurePointSegment(manualFormData.saida1, '', manualFormData.entrada1_obra),
        entrada2: ensurePointSegment(manualFormData.entrada2, '', manualFormData.entrada2_obra),
        saida2: ensurePointSegment(manualFormData.saida2, '', manualFormData.entrada2_obra),
        entrada1_obra: manualFormData.entrada1_obra,
        entrada2_obra: manualFormData.entrada2_obra,
        obs: manualFormData.obs,
        editado_manual: 1,
        total_hours: '00:00',
        status: manualFormData.manual_status || WorkStatus.ENCERRADO,
        last_timestamp: Date.now()
      } as PointRecord;

      const metrics = calculateRecordMetrics(newPoint, userObj?.valor_diaria || 0, users);
      newPoint.total_hours = metrics.workedHours;

      await storage.savePoint(newPoint);

      setIsManualModalOpen(false);
      setManualFormData({ user_id: '', date: '', entrada1: '', saida1: '', entrada2: '', saida2: '', entrada1_obra: '', entrada2_obra: '', obs: '' });
      await onRefresh();
    } catch (err) {
      console.error("Error saving manual point:", err);
      alert("Erro ao salvar registro manual.");
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

  const [selecionados, setSelecionados] = useState<(string | number)[]>([]);

  function selecionarTodos(marcar: boolean) {
    if (marcar) {
      setSelecionados(filteredPoints.map((p) => p.id));
    } else {
      setSelecionados([]);
    }
  }

  function toggleSelecionado(id: string | number) {
    setSelecionados((prev) =>
      prev.includes(id)
        ? prev.filter((i) => i !== id)
        : [...prev, id]
    );
  }

  const validUsers = users.filter(u => u.role !== 'admin_master');
  const validUserIds = new Set(validUsers.map(u => String(u.id)));

  const filteredPoints = points.filter(p => {
    if (!validUserIds.has(String(p.user_id))) return false;
    if (filters.userId && String(p.user_id) !== String(filters.userId)) return false;
    if (filters.workId && !registroContemObra(p, filters.workId, works, users)) return false;
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

  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);

  const excluirSelecionados = async () => {
    if (selecionados.length === 0) return;
    setIsSubmitting(true);
    try {
      await storage.deletePoints(selecionados);
      setSelecionados([]);
      setIsBulkDeleteModalOpen(false);
      await onRefresh();
      alert(`${selecionados.length} registros excluídos com sucesso.`);
    } catch (error) {
      console.error("Error in bulk delete:", error);
      alert("Erro ao excluir alguns registros.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditPoint = (p: PointRecord) => {
    const data: any = { ...p };
    // Flatten GPS nested data into root properties for UI binding in edit modal
    if (p.entrada1?.gps) {
      data.entrada1_lat = p.entrada1.gps.lat || p.entrada1_lat || 0;
      data.entrada1_lng = p.entrada1.gps.lng || p.entrada1_lng || 0;
    }
    if (p.saida1?.gps) {
      data.saida1_lat = p.saida1.gps.lat || p.saida1_lat || 0;
      data.saida1_lng = p.saida1.gps.lng || p.saida1_lng || 0;
    }
    if (p.entrada2?.gps) {
      data.entrada2_lat = p.entrada2.gps.lat || p.entrada2_lat || 0;
      data.entrada2_lng = p.entrada2.gps.lng || p.entrada2_lng || 0;
    }
    if (p.saida2?.gps) {
      data.saida2_lat = p.saida2.gps.lat || p.saida2_lat || 0;
      data.saida2_lng = p.saida2.gps.lng || p.saida2_lng || 0;
    }

    // Flatten observations from nested segments into root properties for edit modal binding
    data.obs_entrada1 = getObservacaoDisplay(p.entrada1, p.obs_entrada1);
    data.obs_saida1 = getObservacaoDisplay(p.saida1, p.obs_saida1);
    data.obs_entrada2 = getObservacaoDisplay(p.entrada2, p.obs_entrada2);
    data.obs_saida2 = getObservacaoDisplay(p.saida2, p.obs_saida2);

    // Flatten obra fields as well to avoid crosstalk in the edit modal
    data.entrada1_obra = getObraDisplay(p.entrada1, p.entrada1_obra);
    data.entrada2_obra = getObraDisplay(p.entrada2, p.entrada2_obra);

    console.log("Carregando obs para edição (ADM):", {
      e1: data.obs_entrada1,
      s1: data.obs_saida1,
      e2: data.obs_entrada2,
      s2: data.obs_saida2,
      obra1: data.entrada1_obra,
      obra2: data.entrada2_obra
    });

    setEditFormData(data);
    setIsEditModalOpen(true);
  };

  const showWarning = (p: PointRecord) => {
    const warnings: string[] = [];
    
    // Check both root obs fields and nested segment observations
    const obsE1 = getObservacaoDisplay(p.entrada1, p.obs_entrada1);
    const obsS1 = getObservacaoDisplay(p.saida1, p.obs_saida1);
    const obsE2 = getObservacaoDisplay(p.entrada2, p.obs_entrada2);
    const obsS2 = getObservacaoDisplay(p.saida2, p.obs_saida2);

    if (obsE1) warnings.push(`🟢 Entrada 1: ${obsE1}`);
    if (obsS1) warnings.push(`🟠 Saída 1: ${obsS1}`);
    if (obsE2) warnings.push(`🔵 Entrada 2: ${obsE2}`);
    if (obsS2) warnings.push(`🔴 Saída 2: ${obsS2}`);

    if (warnings.length === 0 && (p.obs || (p.observations && p.observations.length > 0))) {
      if (p.obs) warnings.push(`Obs Geral: ${p.obs}`);
      if (p.observations) {
        p.observations.forEach(o => {
          const emoji = o.etapa === 'entrada1' ? '🟢' : o.etapa === 'saida1' ? '🟠' : o.etapa === 'entrada2' ? '🔵' : '🔴';
          warnings.push(`${emoji} ${o.etapa.toUpperCase()}: ${o.texto}`);
        });
      }
    }

    if (p.editado_manual) warnings.push('📝 Registro editado manualmente.');
    
    if (p.entrada1?.gps?.status === 'fraco' || p.saida1?.gps?.status === 'fraco' || p.entrada2?.gps?.status === 'fraco' || p.saida2?.gps?.status === 'fraco') {
      warnings.push('⚠ GPS com baixa precisão detectado.');
    }

    setWarningContent(Array.from(new Set(warnings))); // Deduplicate
    setIsWarningModalOpen(true);
  };

  const showLocation = (p: PointRecord) => {
    const locations: any[] = [];
    
    const extract = (seg: PointSegmentRecord | undefined, label: string, legacyLat?: any, legacyLng?: any, legacyAcc?: any, legacyDist?: any) => {
      if ((seg && seg.gps && seg.gps.lat) || (legacyLat && legacyLng)) {
        locations.push({
          name: label,
          lat: seg?.gps?.lat || legacyLat,
          lng: seg?.gps?.lng || legacyLng,
          acc: seg?.gps?.acc || legacyAcc || 0,
          dist: seg?.gps?.dist ?? legacyDist,
          address: seg?.gps?.address || '',
          horario: seg?.horario || '--:--'
        });
      }
    };

    extract(p.entrada1, 'Entrada 1', p.entrada1_lat, p.entrada1_lng, p.entrada1_acc, p.entrada1_dist);
    extract(p.saida1, 'Saída 1', p.saida1_lat, p.saida1_lng, p.saida1_acc, p.saida1_dist);
    extract(p.entrada2, 'Entrada 2', p.entrada2_lat, p.entrada2_lng, p.entrada2_acc, p.entrada2_dist);
    extract(p.saida2, 'Saída 2', p.saida2_lat, p.saida2_lng, p.saida2_acc, p.saida2_dist);

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
      const userObj = users.find(u => String(u.id) === String(editFormData.user_id));

      const mergeGPS = (originalSeg: any, currentSeg: any, lat: any, lng: any) => {
        // Use GPS from currentSeg if it's an object, otherwise try originalSeg
        const baseGps = (currentSeg && typeof currentSeg === 'object' && currentSeg.gps) 
          ? currentSeg.gps 
          : (originalSeg && typeof originalSeg === 'object' && originalSeg.gps) 
            ? originalSeg.gps 
            : {};

        return {
          ...baseGps,
          lat: (lat !== undefined && lat !== '') ? Number(lat) : (baseGps.lat || 0),
          lng: (lng !== undefined && lng !== '') ? Number(lng) : (baseGps.lng || 0)
        };
      };

      // We need to keep a reference to original objects before ensurePointSegment possibly simplifies them
      const oldEntrada1 = editFormData.entrada1;
      const oldSaida1 = editFormData.saida1;
      const oldEntrada2 = editFormData.entrada2;
      const oldSaida2 = editFormData.saida2;

      // Re-standardize all segments before saving while preserving GPS
      const finalized: PointRecord = {
        ...editFormData,
        entrada1: ensurePointSegment(editFormData.entrada1, '', editFormData.entrada1_obra, editFormData.obs_entrada1),
        saida1: ensurePointSegment(editFormData.saida1, '', '', editFormData.obs_saida1),
        entrada2: ensurePointSegment(editFormData.entrada2, '', editFormData.entrada2_obra, editFormData.obs_entrada2),
        saida2: ensurePointSegment(editFormData.saida2, '', '', editFormData.obs_saida2),
        editado_manual: 1
      };

      // Apply coordinates back from the flattened fields, preserving metadata from original segments
      if (finalized.entrada1) finalized.entrada1.gps = mergeGPS(oldEntrada1, finalized.entrada1, editFormData.entrada1_lat, editFormData.entrada1_lng);
      if (finalized.saida1) finalized.saida1.gps = mergeGPS(oldSaida1, finalized.saida1, editFormData.saida1_lat, editFormData.saida1_lng);
      if (finalized.entrada2) finalized.entrada2.gps = mergeGPS(oldEntrada2, finalized.entrada2, editFormData.entrada2_lat, editFormData.entrada2_lng);
      if (finalized.saida2) finalized.saida2.gps = mergeGPS(oldSaida2, finalized.saida2, editFormData.saida2_lat, editFormData.saida2_lng);

      const metrics = calculateRecordMetrics(finalized, userObj?.valor_diaria || 0);
      finalized.total_hours = metrics.workedHours;
      
      console.log("Enviando para Firestore (Admin Edit):", finalized);
      await setDoc(doc(db, "points", finalized.id), sanitizePointData(finalized));
      
      setIsEditModalOpen(false);
      onRefresh();
    } catch (error) {
      console.error("Erro ao salvar:", error);
      alert("Erro ao salvar");
    } finally {
      setIsSubmitting(false);
    }
  };

  const calculateTotals = (pointsToCalculate: PointRecord[], overrideDiaria?: number) => {
    const intervals = extractIntervalsFromPoints(pointsToCalculate, users, works, overrideDiaria, diariaValue, 'auto', filters.workId);
    
    let totalWorkedMinutes = 0;
    let totalDiariasEq = 0;
    let valorTotal = 0;
    
    intervals.forEach(inv => {
      totalWorkedMinutes += inv.workedMinutes;
      totalDiariasEq += inv.diarias;
      valorTotal += inv.valorTotal;
    });

    const valorDiariaNum = overrideDiaria || parseFloat(diariaValue) || 180;

    return { 
      totalHoursStr: formatarMinutos(totalWorkedMinutes), 
      totalHoursDecimal: totalWorkedMinutes / 60,
      totalDiariasEq, 
      valorDiariaNum, 
      valorTotal 
    };
  };

  const generatePDF = () => {
    const intervals = extractIntervalsFromPoints(filteredPoints, users, works, undefined, diariaValue, 'auto', filters.workId);
    const total = intervals.reduce((acc, curr) => acc + curr.valorTotal, 0);
    const diaria = parseFloat(diariaValue) || 180;
    generateOfficialReportPDF(intervals, total, filters, users, works, 'auto', diaria);
  };

  const generateExcel = () => {
    const intervals = extractIntervalsFromPoints(filteredPoints, users, works, undefined, diariaValue, 'auto', filters.workId);
    const { totalHoursStr, totalHoursDecimal } = calculateTotals(filteredPoints);

    const data = intervals.map(inv => {
      return {
        'Data': new Date(inv.date + 'T00:00:00').toLocaleDateString('pt-BR'),
        'Funcionário': inv.userName,
        'Obra': inv.workName,
        'Entrada - Saída': `${inv.entrada} às ${inv.saida}`,
        'Horas (HH:MM)': inv.workedHoursStr,
        'Valor (R$)': inv.valorTotal.toFixed(2)
      };
    });

    // Totais
    data.push({
      'Data': 'TOTAIS GERAIS',
      'Funcionário': '',
      'Obra': '',
      'Entrada - Saída': '',
      'Horas (HH:MM)': totalHoursStr,
      'Valor (R$)': intervals.reduce((acc, curr) => acc + curr.valorTotal, 0).toFixed(2)
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ponto');
    XLSX.writeFile(wb, `Relatorio_Ponto_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.xlsx`);
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

          <Button onClick={() => setIsBackupModalOpen(true)} variant="secondary" className="bg-slate-800 hover:bg-slate-700 w-full-mobile">
            <Database size={18} className="text-purple-500" /> Backup/Restaurar
          </Button>

          <Button onClick={() => { exportarBackup(points); updateLastBackup(); }} variant="secondary" className="bg-slate-800 hover:bg-slate-700 w-full-mobile">
            <Download size={18} className="text-blue-500" /> Exportar Backup JSON
          </Button>

          <input
            type="file"
            accept="application/json"
            id="inputImportBackup"
            style={{ display: "none" }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;

              try {
                setLoading(true);

                const text = await file.text();
                const dados = JSON.parse(text);

                if (!Array.isArray(dados)) {
                  alert("Arquivo inválido!");
                  return;
                }

                console.log("IMPORTANDO:", dados);

                await storage.savePoints(dados);

                alert("Backup restaurado com sucesso!");
                onRefresh();

              } catch (error) {
                console.error(error);
                alert("Erro ao importar backup!");
              } finally {
                setLoading(false);
              }
            }}
          />

          <label
            htmlFor="inputImportBackup"
            className="bg-slate-800 hover:bg-slate-700 w-full-mobile flex items-center gap-2 cursor-pointer justify-center px-4 py-2 rounded-lg transition"
          >
            <Upload size={18} className="text-green-500" />
            Importar Backup JSON
          </label>

            <Button onClick={() => setIsManualModalOpen(true)} variant="primary" className="bg-orange-600 hover:bg-orange-700 w-full-mobile">
            <Plus size={18} /> Inserir Registro Manual
          </Button>
          <div className="flex flex-col gap-2 mobile-export-grid items-end">
            <div className="flex gap-3 w-full">
              <Button onClick={() => generatePDF()} variant="secondary" className="bg-slate-800 hover:bg-slate-700 flex-1 text-xs">
                <FileText size={16} className="text-orange-500" /> PDF Simples
              </Button>
              <Button onClick={() => generateExcel()} variant="secondary" className="bg-slate-800 hover:bg-slate-700 flex-1 text-xs">
                <FileSpreadsheet size={16} className="text-emerald-500" /> Excel Simples
              </Button>
            </div>
            <p className="text-[10px] text-slate-500 max-w-xs text-right mt-1">Para relatório oficial personalizável, utilize a aba <strong>RELATÓRIOS</strong>.</p>
          </div>
        </div>
      </div>

      <Card className="p-6">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-2">
            <Filter className="text-orange-500" size={20} />
            <h3 className="text-lg font-bold">Filtros de Registros</h3>
          </div>
          <button
            onClick={() => setShowConfirmDelete(true)}
            className="text-sm bg-slate-700 hover:bg-red-600 px-3 py-1 rounded-lg flex items-center gap-2 transition"
          >
            <Trash2 size={14} /> Limpar Dados
          </button>
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
        {selecionados.length > 0 && (
          <div className="bg-orange-600/10 border-b border-orange-600/20 p-4 flex items-center justify-between sticky top-0 z-10 backdrop-blur-md">
            <p className="text-sm font-bold text-orange-500">
              {selecionados.length} {selecionados.length === 1 ? 'registro selecionado' : 'registros selecionados'}
            </p>
            <div className="flex gap-2">
              <Button 
                variant="secondary" 
                onClick={() => setSelecionados([])}
                className="bg-slate-800 hover:bg-slate-700 py-1.5 text-xs"
              >
                Limpar Seleção
              </Button>
              <Button 
                onClick={() => setIsBulkDeleteModalOpen(true)}
                className="bg-red-600 hover:bg-red-700 text-white border-none py-1.5 text-xs"
              >
                <Trash2 size={14} /> Excluir Selecionados
              </Button>
            </div>
          </div>
        )}
        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse mobile-cards-table">
            <thead>
              <tr className="bg-slate-800/50 text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">
                <th className="px-6 py-5">
                  <input 
                    type="checkbox" 
                    className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-orange-600 focus:ring-orange-600/50"
                    checked={filteredPoints.length > 0 && selecionados.length === filteredPoints.length}
                    onChange={(e) => selecionarTodos(e.target.checked)}
                  />
                </th>
                <th className="px-6 py-5">Funcionário</th>
                <th className="px-6 py-5">Status</th>
                <th className="px-6 py-5">Data</th>
                <th className="px-6 py-5">Entrada 1</th>
                <th className="px-6 py-5">Saída 1</th>
                <th className="px-6 py-5">Entrada 2</th>
                <th className="px-6 py-5">Saída 2</th>
                <th className="px-6 py-5">H. Trab.</th>
                <th className="px-6 py-5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredPoints.map(p => (
                <tr key={p.id} className={`hover:bg-slate-800/30 transition-colors group ${selecionados.includes(p.id) ? 'bg-orange-500/5' : ''}`}>
                  <td className="px-6 py-4">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-orange-600 focus:ring-orange-600/50"
                      checked={selecionados.includes(p.id)}
                      onChange={() => toggleSelecionado(p.id)}
                    />
                  </td>
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
                    <p className="text-sm font-bold text-emerald-500">{getHorarioDisplay(p.entrada1)}</p>
                    {getHorarioDisplay(p.entrada1) !== '--:--' && <p className="text-[9px] text-slate-500 font-bold uppercase truncate max-w-[100px]">{getObraDisplay(p.entrada1, p.work_name)}</p>}
                  </td>
                  <td className="px-6 py-4 text-sm font-bold text-orange-500">{getHorarioDisplay(p.saida1)}</td>
                  <td className="px-6 py-4">
                    <p className="text-sm font-bold text-emerald-500">{getHorarioDisplay(p.entrada2)}</p>
                    {getHorarioDisplay(p.entrada2) !== '--:--' && <p className="text-[9px] text-slate-500 font-bold uppercase truncate max-w-[100px]">{getObraDisplay(p.entrada2, p.work_name)}</p>}
                  </td>
                  <td className="px-6 py-4 text-sm font-bold text-orange-500">{getHorarioDisplay(p.saida2)}</td>
                  <td className="px-6 py-4">
                    <span className="px-2.5 py-1 bg-slate-800 rounded-lg text-xs font-black text-white border border-slate-700">
                      {calcularResumoRegistro(p, undefined, works, users).totalHorasFormatadas}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end items-center gap-2 transition-opacity">
                      <div className="text-right mr-2">
                        <p className="text-[10px] font-bold text-emerald-500">R$ {calcularResumoRegistro(p, undefined, works, users).valorTotal.toFixed(2).replace('.', ',')}</p>
                      </div>
                      {((p.observations && p.observations.length > 0) || p.obs || p.obs_entrada1 || p.obs_saida1 || p.obs_entrada2 || p.obs_saida2 || p.entrada1?.observacao || p.saida1?.observacao || p.entrada2?.observacao || p.saida2?.observacao || p.editado_manual || p.entrada1_gps_suspeito || p.saida1_gps_suspeito || p.entrada2_gps_suspeito || p.saida2_gps_suspeito || p.entrada1_gps_status === 'fraco' || p.saida1_gps_status === 'fraco' || p.entrada2_gps_status === 'fraco' || p.saida2_gps_status === 'fraco') ? (
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
            <div key={p.id} className={`p-4 space-y-4 transition-colors ${selecionados.includes(p.id) ? 'bg-orange-500/5' : ''}`}>
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-orange-600 focus:ring-orange-600/50"
                      checked={selecionados.includes(p.id)}
                      onChange={() => toggleSelecionado(p.id)}
                    />
                    <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center text-orange-500 font-bold text-sm border border-slate-700">
                      {p.user_name?.charAt(0)}
                    </div>
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
                  <p className="text-sm font-bold text-emerald-500">{getHorarioDisplay(p.entrada1)}</p>
                  {getHorarioDisplay(p.entrada1) !== '--:--' && <p className="text-[9px] text-slate-500 font-bold uppercase truncate">{getObraDisplay(p.entrada1, p.work_name)}</p>}
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Saída 1</p>
                  <p className="text-sm font-bold text-orange-500">{getHorarioDisplay(p.saida1)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Entrada 2</p>
                  <p className="text-sm font-bold text-emerald-500">{getHorarioDisplay(p.entrada2)}</p>
                  {getHorarioDisplay(p.entrada2) !== '--:--' && <p className="text-[9px] text-slate-500 font-bold uppercase truncate">{getObraDisplay(p.entrada2, p.work_name)}</p>}
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Saída 2</p>
                  <p className="text-sm font-bold text-orange-500">{getHorarioDisplay(p.saida2)}</p>
                </div>
              </div>

              <div className="flex justify-between items-center bg-slate-900/50 p-3 rounded-xl border border-slate-800 overflow-x-auto gap-4">
                  <div className="space-y-1 min-w-fit">
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">H. Trab.</p>
                    <p className="text-xs font-black text-white">{calcularResumoRegistro(p, undefined, works, users).totalHorasFormatadas}</p>
                  </div>
                  <div className="space-y-1 min-w-fit">
                    <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest text-right">Valor Total</p>
                    <p className="text-xs font-black text-emerald-500 text-right">R$ {calcularResumoRegistro(p, undefined, works, users).valorTotal.toFixed(2).replace('.', ',')}</p>
                  </div>
              </div>

              <div className="flex justify-end items-center pt-2">
                  {((p.observations && p.observations.length > 0) || p.obs || p.editado_manual || p.entrada1_gps_suspeito || p.saida1_gps_suspeito || p.entrada2_gps_suspeito || p.saida2_gps_suspeito || p.entrada1_gps_status === 'fraco' || p.saida1_gps_status === 'fraco' || p.entrada2_gps_status === 'fraco' || p.saida2_gps_status === 'fraco') ? (
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
            ))}
          </div>
        </div>

      <Modal isOpen={isBulkDeleteModalOpen} onClose={() => setIsBulkDeleteModalOpen(false)} title="Confirmar Exclusão em Massa">
        <div className="space-y-6">
          <div className="flex items-center gap-4 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl">
            <AlertCircle className="text-red-500 shrink-0" size={24} />
            <p className="text-sm text-slate-300">Tem certeza que deseja excluir <strong>{selecionados.length}</strong> registros selecionados? Esta ação não pode ser desfeita.</p>
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" onClick={() => setIsBulkDeleteModalOpen(false)} className="flex-1">Cancelar</Button>
            <Button onClick={excluirSelecionados} loading={isSubmitting} className="flex-1 bg-red-600 hover:bg-red-700 text-white border-none">Excluir Todos</Button>
          </div>
        </div>
      </Modal>

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
          <div className="space-y-4 py-4">
            {locationData.map((loc, index) => {
              const dStatus = getDistanceStatus(loc.dist);
              const isInside = dStatus?.isInside;
              const isEntry = loc.name.toLowerCase().includes('entrada');
              
              return (
                <div 
                  key={index} 
                  className="p-4 bg-slate-900/40 rounded-2xl border border-slate-800/50 space-y-4"
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-xl ${isEntry ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                      {isEntry ? <LogIn size={20} /> : <LogOut size={20} />}
                    </div>
                    <p className="text-lg font-bold text-white">{loc.name}</p>
                  </div>

                  <div className="space-y-3 px-1">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2 text-slate-400">
                        <Crosshair size={16} />
                        <span className="text-sm">Precisão do GPS</span>
                      </div>
                      <span className="text-sm font-medium text-slate-200">{Math.round(loc.acc)} m</span>
                    </div>

                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2 text-slate-400">
                        <MapPin size={16} />
                        <span className="text-sm">Distância da obra</span>
                      </div>
                      <span className={`text-sm font-black ${isInside ? 'text-emerald-500' : 'text-red-500'}`}>
                        {dStatus?.formattedDist || '---'}
                      </span>
                    </div>
                  </div>

                  <div className={`flex items-center gap-2 p-3 rounded-xl border ${
                    isInside 
                      ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-500' 
                      : 'bg-red-500/5 border-red-500/20 text-red-500'
                  }`}>
                    {isInside ? <CheckCircle size={18} /> : <XCircle size={18} />}
                    <span className="text-sm font-bold uppercase tracking-tight">{dStatus?.label}</span>
                  </div>

                  <Button 
                    onClick={() => window.open(`https://maps.google.com/?q=${loc.lat},${loc.lng}`, '_blank')} 
                    className="w-full py-3 flex items-center justify-center gap-2 bg-linear-to-r from-orange-600 to-orange-500 border-none shadow-lg shadow-orange-600/10 text-xs font-bold uppercase tracking-widest"
                    variant="primary"
                  >
                    <MapPin size={16} />
                    Ver Mapa
                  </Button>
                </div>
              );
            })}

            <div className="pt-2">
              <Button 
                variant="secondary" 
                onClick={() => setIsLocationModalOpen(false)} 
                className="w-full py-4 bg-slate-800/50 border-slate-800 hover:bg-slate-800 uppercase font-black tracking-[0.2em] text-[10px]"
              >
                Fechar Localizações
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Editar Registro de Ponto">
        {editFormData && (
          <form onSubmit={saveEditPoint} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input label="Entrada 1" value={getHorarioDisplay(editFormData.entrada1)} onChange={e => setEditFormData({ ...editFormData, entrada1: e.target.value })} placeholder="00:00" />
              <Input label="Saída 1" value={getHorarioDisplay(editFormData.saida1)} onChange={e => setEditFormData({ ...editFormData, saida1: e.target.value })} placeholder="00:00" />
              <Input label="Obs E1" value={editFormData.obs_entrada1 || ''} onChange={e => setEditFormData({ ...editFormData, obs_entrada1: e.target.value })} placeholder="Obs Entrada 1" />
              <Input label="Obs S1" value={editFormData.obs_saida1 || ''} onChange={e => setEditFormData({ ...editFormData, obs_saida1: e.target.value })} placeholder="Obs Saída 1" />
              
              <Input label="Entrada 2" value={getHorarioDisplay(editFormData.entrada2)} onChange={e => setEditFormData({ ...editFormData, entrada2: e.target.value })} placeholder="00:00" />
              <Input label="Saída 2" value={getHorarioDisplay(editFormData.saida2)} onChange={e => setEditFormData({ ...editFormData, saida2: e.target.value })} placeholder="00:00" />
              <Input label="Obs E2" value={editFormData.obs_entrada2 || ''} onChange={e => setEditFormData({ ...editFormData, obs_entrada2: e.target.value })} placeholder="Obs Entrada 2" />
              <Input label="Obs S2" value={editFormData.obs_saida2 || ''} onChange={e => setEditFormData({ ...editFormData, obs_saida2: e.target.value })} placeholder="Obs Saída 2" />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-slate-800 rounded-2xl border border-slate-700 flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Trabalhadas:</span>
                  <span className="text-lg font-black text-white">
                    {editFormData.total_hours}
                  </span>
                </div>
                <div className="flex justify-between items-center border-t border-slate-700 pt-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cálculo (+1h):</span>
                  <span className="text-lg font-black text-orange-500">
                    {editFormData.calculation_hours || editFormData.total_hours}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input label="Obra Período 1" value={editFormData.entrada1_obra || ''} onChange={e => setEditFormData({ ...editFormData, entrada1_obra: e.target.value })} />
              <Input label="Obra Período 2" value={editFormData.entrada2_obra || ''} onChange={e => setEditFormData({ ...editFormData, entrada2_obra: e.target.value })} />
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
          <div className="grid grid-cols-2 gap-4">
            <Input label="Data" type="date" value={manualFormData.date} onChange={e => setManualFormData({ ...manualFormData, date: e.target.value })} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Entrada 1" value={manualFormData.entrada1} onChange={e => setManualFormData({ ...manualFormData, entrada1: e.target.value })} placeholder="00:00" />
            <Input label="Saída 1" value={manualFormData.saida1} onChange={e => setManualFormData({ ...manualFormData, saida1: e.target.value })} placeholder="00:00" />
            <Input label="Entrada 2" value={manualFormData.entrada2} onChange={e => setManualFormData({ ...manualFormData, entrada2: e.target.value })} placeholder="00:00" />
            <Input label="Saída 2" value={manualFormData.saida2} onChange={e => setManualFormData({ ...manualFormData, saida2: e.target.value })} placeholder="00:00" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Obra Período 1" value={manualFormData.entrada1_obra} onChange={e => setManualFormData({ ...manualFormData, entrada1_obra: e.target.value })} />
            <Input label="Obra Período 2" value={manualFormData.entrada2_obra} onChange={e => setManualFormData({ ...manualFormData, entrada2_obra: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Status Manual</label>
            <select 
              value={manualFormData.manual_status || ''} 
              onChange={e => setManualFormData({ ...manualFormData, manual_status: e.target.value as any })}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-100"
            >
              <option value="">Automático</option>
              <option value={WorkStatus.TRABALHANDO}>Trabalhando</option>
              <option value={WorkStatus.PAUSADO}>Pausado</option>
              <option value={WorkStatus.ENCERRADO}>Encerrado</option>
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
          <Button type="submit" className="w-full py-4" loading={isSubmitting}>Salvar Registro</Button>
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

      <Modal isOpen={isBackupModalOpen} onClose={() => setIsBackupModalOpen(false)} title="Gerar Backup por Período">
        <div className="space-y-4">
          {lastBackup ? (
            <p className="text-sm text-gray-400 mb-3">
              Último backup: {new Date(lastBackup).toLocaleString("pt-BR")}
            </p>
          ) : (
            <p className="text-sm text-gray-500 mb-3">
              Nenhum backup realizado ainda
            </p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Data Início</label>
              <input 
                type="date" 
                value={backupDates.startDate} 
                onChange={e => setBackupDates({ ...backupDates, startDate: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Data Fim</label>
              <input 
                type="date" 
                value={backupDates.endDate} 
                onChange={e => setBackupDates({ ...backupDates, endDate: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
            <Button type="button" variant="secondary" onClick={() => setIsBackupModalOpen(false)}>Cancelar</Button>
            <Button type="button" onClick={handleBackupByPeriod} variant="primary" className="bg-orange-600 hover:bg-orange-700">
              Gerar Backup
            </Button>
          </div>
        </div>
      </Modal>





      {loading && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-900 px-6 py-4 rounded-xl shadow-lg">
            <p className="text-white">Importando dados...</p>
          </div>
        </div>
      )}

      {showConfirmDelete && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
          <div className="bg-slate-800 p-6 rounded-xl w-[350px] text-center shadow-2xl border border-slate-700">
            <h2 className="text-lg font-bold mb-3 text-white">
              Confirmar exclusão
            </h2>
            <p className="text-gray-300 mb-5">
              Tem certeza que deseja apagar TODOS os dados?
              Essa ação não pode ser desfeita.
            </p>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => setShowConfirmDelete(false)}
                className="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-lg text-white transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleClearAll}
                className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg text-white transition"
              >
                Sim, apagar tudo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getDistanceStatus(dist: number) {
  if (dist === undefined || dist === null) return null;
  const isInside = dist <= 300;
  const label = isInside ? 'Dentro da obra' : 'Fora da obra';
  const color = isInside ? 'text-emerald-500' : 'text-red-500';
  const formattedDist = dist >= 1000 ? `${(dist / 1000).toFixed(1)}km` : `${Math.round(dist)}m`;
  return { label, color, formattedDist, isInside };
}

function PointDetail({ label, time }: { label: string, time: any }) {
  const gps = time?.gps;
  const distStatus = gps?.dist !== undefined ? getDistanceStatus(gps.dist) : null;
  
  return (
    <div className="p-4 bg-slate-900 rounded-2xl border border-slate-700">
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{label}</p>
      <p className="text-xl font-black text-white mb-2">{getHorarioDisplay(time)}</p>
      {gps && (
        <div className="text-[10px] text-slate-400">
          <p className="line-clamp-2 mb-1">{gps.address || 'Localização não disponível'}</p>
          {gps.lat && gps.lng && (
            <button 
              onClick={() => window.open(`https://maps.google.com/?q=${gps.lat},${gps.lng}`, '_blank')}
              className="text-orange-500 hover:underline mt-1 block font-bold"
            >
              Abrir no Maps
            </button>
          )}
          {distStatus && (
            <div className="mt-2 flex items-center gap-2">
               <span className={`font-black ${distStatus.color} uppercase tracking-tight`}>
                 {distStatus.label}
               </span>
               <span className="text-slate-500">•</span>
               <span className="text-slate-300 font-bold">{distStatus.formattedDist}</span>
            </div>
          )}
        </div>
      )}
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

  // Export Modal states
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportType, setExportType] = useState<'pdf' | 'excel'>('pdf');
  const [calcMode, setCalcMode] = useState<'auto' | 'diaria' | 'manual'>('auto');
  const [globalDiariaValue, setGlobalDiariaValue] = useState<string>('180');
  const [pdfDocType, setPdfDocType] = useState<'gerencial' | 'recibo' | 'fechamento'>('gerencial');

  const generateReport = () => {
    const validUsers = users.filter(u => u.role !== 'admin_master');
    const validUserIds = new Set(validUsers.map(u => String(u.id)));

    const filtered = points.filter(p => {
      if (!validUserIds.has(String(p.user_id))) return false;
      if (filters.userId && String(p.user_id) !== String(filters.userId)) return false;
      if (filters.workId && !registroContemObra(p, filters.workId, works, users)) return false;
      if (filters.startDate && p.date < filters.startDate) return false;
      if (filters.endDate && p.date > filters.endDate) return false;
      return true;
    });

    const intervals = extractIntervalsFromPoints(filtered, users, works, undefined, globalDiariaValue, calcMode, filters.workId);

    setReportData(intervals);

    const totalHours = formatarMinutos(intervals.reduce((acc, curr) => acc + curr.workedMinutes, 0));
    const totalDiarias = Math.round(intervals.reduce((acc, curr) => acc + curr.diarias, 0) * 100) / 100;
    const totalCost = intervals.reduce((acc, curr) => acc + curr.valorTotal, 0);
    const uniqueEmployees = new Set(intervals.map(p => String(p.userId))).size;

    setSummary({
      totalHours,
      totalDiarias,
      totalCost,
      totalEmployees: uniqueEmployees
    });

    const workMap = new Map();
    intervals.forEach(inv => {
      const canonicalName = inv.workName.trim().toUpperCase();
      if (!workMap.has(canonicalName)) {
        workMap.set(canonicalName, {
          name: inv.workName.trim(), // keep the original capitalization for the first seen
          employees: new Set(),
          minutesList: [] as number[],
          diarias: 0,
          cost: 0
        });
      }
      const w = workMap.get(canonicalName);
      w.employees.add(inv.userId);
      w.minutesList.push(inv.workedMinutes);
      w.diarias += inv.diarias;
      w.cost += inv.valorTotal;
    });

    setWorkSummary(Array.from(workMap.values()).map(w => ({
      ...w,
      hours: formatarMinutos(w.minutesList.reduce((acc: number, curr: number) => acc + curr, 0)),
      diarias: Math.round(w.diarias * 100) / 100,
      employeeCount: w.employees.size
    })));
  };

  useEffect(() => {
    generateReport();
  }, [points, users, works, calcMode, globalDiariaValue]);

  const handleOfficialExport = () => {
    setIsExportModalOpen(false);
    
    // Recalculate local versions to use the modal's settings
    const validUsers = users.filter((u: any) => u.role !== 'admin_master');
    const validUserIds = new Set(validUsers.map((u: any) => String(u.id)));

    const filtered = points.filter((p: any) => {
      if (!validUserIds.has(String(p.user_id))) return false;
      if (filters.userId && String(p.user_id) !== String(filters.userId)) return false;
      if (filters.workId && !registroContemObra(p as PointRecord, filters.workId, works, users)) return false;
      if (filters.startDate && p.date < filters.startDate) return false;
      if (filters.endDate && p.date > filters.endDate) return false;
      return true;
    });

    const userDefinedDiaria = parseFloat(globalDiariaValue) || undefined;
    const intervalsLocal = extractIntervalsFromPoints(filtered, users, works, userDefinedDiaria, globalDiariaValue, calcMode, filters.workId);
    
    // Always use the sum of intervals for the total cost
    const totalC = intervalsLocal.reduce((acc: number, curr: any) => acc + curr.valorTotal, 0);

    if (exportType === 'pdf') {
       exportPDF(intervalsLocal, totalC);
    } else {
       exportExcel(intervalsLocal, totalC);
    }
  };

  const exportPDF = (intervalsLocal?: any[], totalCostOverride?: number) => {
    const finalData = intervalsLocal || reportData;
    const totalCostToDisplay = totalCostOverride !== undefined ? totalCostOverride : summary.totalCost;
    const diaria = parseFloat(globalDiariaValue) || 180;
    
    if (pdfDocType === 'recibo') {
      generateReciboPDF(finalData, totalCostToDisplay, filters, users, diaria, calcMode);
    } else if (pdfDocType === 'fechamento') {
      generateFechamentoPDF(finalData, totalCostToDisplay, filters, users, works, diaria, calcMode);
    } else {
      generateOfficialReportPDF(finalData, totalCostToDisplay, filters, users, works, calcMode, diaria);
    }
  };

  const exportExcel = (intervalsLocal?: any[], totalCostOverride?: number) => {
    const finalData = intervalsLocal || reportData;
    
    const mainData = finalData.map((p: any) => ({
      'Funcionário': p.userName,
      'Obra': p.workName,
      'Data': new Date(p.date + 'T00:00:00').toLocaleDateString('pt-BR'),
      'Entrada - Saída': `${p.entrada || '--:--'} às ${p.saida || '--:--'}`,
      'H. Trabalhadas': p.workedHoursStr,
      'Valor Total (R$)': p.valorTotal.toFixed(2)
    }));

    const wMap: Record<string, { name: string, workers: Set<string>, mins: number, cost: number }> = {};
    finalData.forEach(p => {
      const canon = String(p.workName || 'EXTRA/OUTROS').trim().toUpperCase();
      if (!wMap[canon]) wMap[canon] = { name: p.workName || 'Extra/Outros', workers: new Set(), mins: 0, cost: 0 };
      wMap[canon].workers.add(p.userId);
      wMap[canon].mins += p.workedMinutes;
      wMap[canon].cost += p.valorTotal;
    });

    const summaryData = Object.values(wMap).map(w => ({
      'Obra': w.name.toUpperCase(),
      'Funcionários': w.workers.size,
      'Total Horas': formatarMinutos(w.mins),
      'Custo Total (R$)': w.cost.toFixed(2)
    }));

    const subMins = finalData.reduce((acc: number, curr: any) => acc + curr.workedMinutes, 0);
    const subHours = formatarMinutos(subMins);
    const subDiarias = finalData.reduce((acc: number, curr: any) => acc + curr.diarias, 0);
    const subEmployees = new Set(finalData.map((p: any) => String(p.userId))).size;
    const totalCostToDisplay = totalCostOverride !== undefined ? totalCostOverride : summary.totalCost;

    const totalsData = [{
      'Total Horas': subHours,
      'Total Funcionários': subEmployees,
      'Total Diárias': subDiarias.toFixed(2),
      'Custo Total (R$)': totalCostToDisplay.toFixed(2)
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
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Cálculo de Diária</label>
            <div className="flex gap-4 items-center h-10">
              <label className="flex items-center gap-2 text-white text-sm cursor-pointer">
                <input 
                  type="radio" 
                  checked={calcMode === 'auto'} 
                  onChange={() => setCalcMode('auto')}
                  className="w-4 h-4 accent-blue-500"
                />
                Automático
              </label>
              <label className="flex items-center gap-2 text-white text-sm cursor-pointer">
                <input 
                  type="radio" 
                  checked={calcMode === 'manual'} 
                  onChange={() => setCalcMode('manual')}
                  className="w-4 h-4 accent-blue-500"
                />
                Personalizado
              </label>
            </div>
          </div>
          {calcMode === 'manual' && (
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Valor Diária (R$)</label>
              <input 
                type="number" 
                value={globalDiariaValue} 
                onChange={e => setGlobalDiariaValue(e.target.value)}
                className="w-full max-w-full box-border bg-slate-900 border border-slate-700 rounded-xl px-2 py-1.5 text-sm text-white"
              />
            </div>
          )}
        </div>
        <div className="flex justify-between items-center mt-6">
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => { setExportType('excel'); setIsExportModalOpen(true); }}>
              <FileSpreadsheet size={18} /> Excel
            </Button>
            <Button variant="secondary" onClick={() => { setExportType('pdf'); setIsExportModalOpen(true); }}>
              <FileText size={18} /> PDF
            </Button>
          </div>
          <Button onClick={generateReport}>
            Aplicar Filtros
          </Button>
        </div>
      </Card>

      <Modal isOpen={isExportModalOpen} onClose={() => setIsExportModalOpen(false)} title={`Exportar Relatório (${exportType === 'pdf' ? 'PDF' : 'Excel'})`}>
        <div className="p-4 space-y-8 flex flex-col items-center max-w-sm mx-auto">
          <div className="w-full space-y-6">
      {exportType === 'pdf' && (
        <div className="space-y-2.5">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] ml-1">Tipo de Documento</label>
          <select 
            value={pdfDocType} 
            onChange={e => setPdfDocType(e.target.value as any)}
            className="w-full bg-slate-900 border border-slate-700 rounded-2xl px-5 py-4 text-slate-100 font-bold text-base focus:ring-2 focus:ring-blue-500/20 transition-all cursor-pointer hover:border-slate-600 outline-none"
          >
            <option value="gerencial">Relatório Gerencial</option>
            <option value="recibo">Recibo Individual</option>
            <option value="fechamento">Fechamento Mensal</option>
          </select>
        </div>
      )}
    </div>

          <div className="w-full pt-2">
            <Button onClick={handleOfficialExport} className="w-full py-4 text-base font-black uppercase tracking-widest shadow-xl shadow-blue-900/10 active:scale-[0.98] transition-all bg-blue-600 hover:bg-blue-500">
               {exportType === 'pdf' ? 'Gerar PDF Oficial' : 'Exportar Excel'}
            </Button>
          </div>
        </div>
      </Modal>

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
          <p className="text-xl md:text-2xl font-black text-white">{summary.totalDiarias.toFixed(2)}</p>
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
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">H. Trab.</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {reportData.map((p, idx) => (
                <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-white">{p.userName}</td>
                  <td className="px-6 py-4 text-sm text-slate-400 uppercase">{p.workName}</td>
                  <td className="px-6 py-4 text-sm text-slate-400">{new Date(p.date + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                  <td className="px-6 py-4">
                    <span className="px-2.5 py-1 bg-slate-800 rounded-lg text-xs font-black text-white border border-slate-700">
                      {p.workedHoursStr}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm font-bold text-emerald-500 text-right">{formatCurrency(p.valorTotal)}</td>
                </tr>
              ))}
              {reportData.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500 italic">Nenhum registro encontrado para os filtros selecionados.</td>
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
                  <p className="text-base font-bold text-white">{p.userName}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{new Date(p.date + 'T00:00:00').toLocaleDateString('pt-BR')}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-emerald-500">{formatCurrency(p.valorTotal)}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-sm text-slate-300 bg-slate-800/30 p-2 rounded-lg border border-slate-800/50">
                <MapPin size={14} className="text-orange-500 shrink-0" />
                <span className="truncate uppercase">{p.workName}</span>
              </div>

              <div className="flex justify-between items-end">
                <div className="text-right flex gap-3">
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Trab.</p>
                    <p className="text-xs font-black text-white">{p.workedHoursStr}</p>
                  </div>
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
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Custo Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {workSummary.map((w, idx) => (
                <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-6 py-4 text-sm font-bold text-white uppercase">{w.name}</td>
                  <td className="px-6 py-4 text-sm text-slate-400 text-center">{w.employeeCount}</td>
                  <td className="px-6 py-4 text-sm text-slate-400 text-center">{w.hours}</td>
                  <td className="px-6 py-4 text-sm font-bold text-emerald-500 text-right">{formatCurrency(w.cost)}</td>
                </tr>
              ))}
              {workSummary.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-500 italic">Nenhum dado de obra disponível.</td>
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
                  <p className="text-base font-bold text-white uppercase">{w.name}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-emerald-500">{formatCurrency(w.cost)}</p>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Custo Total</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-800/30 p-2 rounded-lg border border-slate-800/50 text-center">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Func.</p>
                  <p className="text-sm font-bold text-white">{w.employeeCount}</p>
                </div>
                <div className="bg-slate-800/30 p-2 rounded-lg border border-slate-800/50 text-center">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Horas</p>
                  <p className="text-sm font-bold text-orange-500">{w.hours}</p>
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
  const [isRegistering, setIsRegistering] = useState(false);
  const [obs, setObs] = useState('');
  const [status, setStatus] = useState<'idle' | 'locating' | 'refining' | 'saving'>('idle');
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [isPauseModalOpen, setIsPauseModalOpen] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [lastRegisteredTime, setLastRegisteredTime] = useState('');
  const [tempPos, setTempPos] = useState<any>(null);

  const loadTodayPoint = useCallback(async () => {
    if (!user) return;
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const docId = `${user.id}_${today}`;
    
    try {
      const pointSnap = await getDoc(doc(db, 'points', docId));
      if (pointSnap.exists()) {
        const todayPoint = adaptLegacyPoint({ id: pointSnap.id, ...pointSnap.data() });
        setPoint(todayPoint);
        if (todayPoint?.entrada1?.obraId) {
          setSelectedWorkId(String(todayPoint.entrada1.obraId));
        } else if (todayPoint?.work_id) {
          setSelectedWorkId(String(todayPoint.work_id));
        }
      } else {
        setPoint(null);
      }
    } catch (error) {
      console.error("Error loading today's point:", error);
    }
  }, [user]);

  useEffect(() => { 
    loadTodayPoint(); 
  }, [loadTodayPoint]);

  const registerPoint = async (type: 'entrada1' | 'saida1' | 'entrada2' | 'saida2', customPos?: any, extraData?: any) => {
    if (isRegistering) {
        console.log("Registro já em andamento, ignorando.");
        return; 
    }
    
    // Check for obra only on entries
    if ((type === 'entrada1' || type === 'entrada2') && !selectedWorkId) {
      alert('Selecione uma obra antes de registrar.');
      return;
    }
    
    // Prevent double-clicking within a short timeframe
    if (point?.last_timestamp && (Date.now() - point.last_timestamp < 5000)) {
       alert('Aguarde alguns segundos para registrar novamente.');
       return;
    }
    
    setIsRegistering(true);
    setStatus('locating');
    
    console.log("Iniciando registro:", type, "Usuário:", user?.id, "Extra:", extraData);
    
    try {
      // 1. Get Location
      let pos: GeolocationPosition | null = null;
      try {
          pos = customPos || await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { 
                enableHighAccuracy: true, 
                timeout: 10000, 
                maximumAge: 0 
            });
          });
          console.log("GPS capturado:", pos);
      } catch (e) {
          console.error("Erro GPS (não capturado):", e);
      }

      // 2. Fetch point data
      const agora = new Date();
      const horaLocal = agora.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
      const dataLocal = agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
      const docId = `${user.id}_${dataLocal}`;
      const pointRef = doc(db, 'points', docId);

      const pointSnap = await getDoc(pointRef);
      let pointData: PointRecord = pointSnap.exists() 
        ? adaptLegacyPoint({ id: pointSnap.id, ...pointSnap.data() })
        : {
            id: docId,
            user_id: String(user.id),
            funcionario_id: String(user.id),
            user_name: user.name,
            date: dataLocal,
            total_hours: '00:00',
            status: WorkStatus.NAO_INICIADO
        } as PointRecord;

      // 3. Process Segment
      let address = "Localização não obtida";
      if (pos) {
        try {
          const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`);
          const d = await r.json();
          address = d.display_name || "Endereço não disponível";
        } catch (e) { }
      }

      let effectiveWorkId = selectedWorkId;
      let effectiveWorkNome = works.find(w => String(w.id) === String(selectedWorkId))?.name || 'Não informada';

      // Fallbacks if not provided at register time
      if (!effectiveWorkId) {
          if ((type === 'entrada2' || type === 'saida1') && pointData.entrada1) {
              effectiveWorkId = pointData.entrada1.obraId;
              effectiveWorkNome = pointData.entrada1.obraNome;
          } else if (type === 'saida2' && pointData.entrada2) {
              effectiveWorkId = pointData.entrada2.obraId;
              effectiveWorkNome = pointData.entrada2.obraNome;
          }
      }
      
      console.log("Comentário a ser salvo:", type, obs.trim());

      const segment: PointSegmentRecord = {
        horario: horaLocal,
        obraId: String(effectiveWorkId || ''),
        obraNome: effectiveWorkNome,
        observacao: obs.trim(),
        gps: {
          lat: pos?.coords.latitude || 0,
          lng: pos?.coords.longitude || 0,
          acc: pos?.coords.accuracy || 0,
          address: address
        }
      };

      if (pos && effectiveWorkId) {
        const workObj = works.find(w => String(w.id) === String(effectiveWorkId));
        if (workObj?.lat && workObj?.lng) {
          const dist = calculateDistance(pos.coords.latitude, pos.coords.longitude, workObj.lat, workObj.lng);
          segment.gps.dist = dist;
          segment.gps.status = pos.coords.accuracy > 300 ? 'fraco' : 'preciso';
          if (workObj.radius && dist > workObj.radius) segment.gps.suspeito = 1;
        }
      }

      // Update segment
      if (type === 'entrada1') {
        pointData.entrada1 = segment;
        pointData.obs_entrada1 = obs.trim();
        pointData.work_id = segment.obraId;
        pointData.work_name = segment.obraNome;
      } else if (type === 'saida1') {
        pointData.saida1 = segment;
        pointData.obs_saida1 = obs.trim();
      } else if (type === 'entrada2') {
        pointData.entrada2 = segment;
        pointData.obs_entrada2 = obs.trim();
      } else if (type === 'saida2') {
        pointData.saida2 = segment;
        pointData.obs_saida2 = obs.trim();
        pointData.encerrado = 1;
      }
      
      pointData.last_timestamp = Date.now();
      
      // Atomic status update based on type and extraData
      if (type === 'entrada1') {
          pointData.status = WorkStatus.TRABALHANDO;
          pointData.encerrado = 0;
      } else if (type === 'saida1') {
          const isClosing = extraData?.choice === 'encerrar';
          pointData.status = isClosing ? WorkStatus.ENCERRADO : WorkStatus.PAUSADO;
          pointData.encerrado = isClosing ? 1 : 0;
      } else if (type === 'entrada2') {
          pointData.status = WorkStatus.TRABALHANDO;
          pointData.encerrado = 0;
      } else if (type === 'saida2') {
          pointData.status = WorkStatus.ENCERRADO;
          pointData.encerrado = 1;
      }

      console.log("Saving point data with observation:", {
        type,
        obs: obs.trim(),
        pointId: pointData.id
      });

      // Update Firebase
      await setDoc(pointRef, sanitizePointData(pointData), { merge: true });
      
      console.log("Point successfully saved to Firestore");

      // Cleanup UI
      setObs('');
      setLastRegisteredTime(horaLocal);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
      
      await loadTodayPoint();
      onRefresh();
      
    } catch (err) {
      console.error("Erro ao registrar ponto:", err);
      alert("Erro ao registrar. Tente novamente.");
    } finally {
      setStatus('idle');
      setIsRegistering(false);
    }
  };

  const registrarEntrada1 = async () => {
    if (!selectedWorkId) { alert('Selecione uma obra.'); return; }
    await registerPoint('entrada1');
  };

  const registrarSaida1 = () => { setIsPauseModalOpen(true); };

  const continuarJornada = async () => {
    setIsPauseModalOpen(false);
    await registerPoint('saida1', null, { choice: 'continuar' });
  };

  const encerrarJornada = async () => {
    setIsPauseModalOpen(false);
    await registerPoint('saida1', null, { choice: 'encerrar' });
  };

  const registrarEntrada2 = async () => {
    // If not selected now, try to use earlier obra if possible, but keep it simple
    await registerPoint('entrada2');
  };

  const registrarSaida2 = async () => {
    await registerPoint('saida2');
  };

  const currentStatus = calculateWorkStatus(point);

  const nextAction = point?.encerrado ? null : 
    (getHorarioDisplay(point?.entrada1) === '--:--') ? 'entrada1' : 
    (getHorarioDisplay(point?.saida1) === '--:--') ? 'saida1' : 
    (getHorarioDisplay(point?.entrada2) === '--:--') ? 'entrada2' : 
    (getHorarioDisplay(point?.saida2) === '--:--') ? 'saida2' : null;

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
                <span className="text-[10px] font-bold uppercase tracking-widest mt-1 animate-pulse">Aguardando registro</span>
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            </div>

            {(nextAction === 'saida1' || nextAction === 'saida2') && point?.work_name && (
              <div className="flex items-center justify-center gap-2 py-2 px-4 bg-slate-900 rounded-xl border border-slate-800">
                <MapIcon size={16} className="text-orange-500" />
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Obra: {nextAction === 'saida1' ? (point.entrada1?.obraNome || 'Não informada') : (point.entrada2?.obraNome || 'Não informada')}</span>
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
              onClick={() => {
                if (nextAction === 'entrada1') registrarEntrada1();
                else if (nextAction === 'saida1') registrarSaida1();
                else if (nextAction === 'entrada2') registrarEntrada2();
                else if (nextAction === 'saida2') registrarSaida2();
              }}
              className="w-full py-6 text-xl rounded-2xl shadow-2xl"
              disabled={isRegistering}
            >
              {isRegistering ? (
                <div className="flex flex-col items-center">
                  <span className="text-sm font-bold uppercase tracking-widest mb-1">
                    Registrando...
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
        <PointMiniCard 
          label="Entrada 1" 
          time={getHorarioDisplay(point?.entrada1)} 
          active={getHorarioDisplay(point?.entrada1) !== '--:--' || nextAction === 'entrada1'} 
          isNext={nextAction === 'entrada1'}
          obra={getObraDisplay(point?.entrada1, point?.work_name)} 
        />
        <PointMiniCard 
          label="Saída 1" 
          time={getHorarioDisplay(point?.saida1)} 
          active={getHorarioDisplay(point?.saida1) !== '--:--' || nextAction === 'saida1'} 
          isNext={nextAction === 'saida1'}
          obra={getObraDisplay(point?.saida1)} 
        />
        <PointMiniCard 
          label="Entrada 2" 
          time={getHorarioDisplay(point?.entrada2)} 
          active={getHorarioDisplay(point?.entrada2) !== '--:--' || nextAction === 'entrada2'} 
          isNext={nextAction === 'entrada2'}
          obra={getObraDisplay(point?.entrada2)} 
        />
        <PointMiniCard 
          label="Saída 2" 
          time={getHorarioDisplay(point?.saida2)} 
          active={getHorarioDisplay(point?.saida2) !== '--:--' || nextAction === 'saida2'} 
          isNext={nextAction === 'saida2'}
          obra={getObraDisplay(point?.saida2)} 
        />
      </div>

      {point && (
        <Card className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h4 className="font-bold text-slate-400 uppercase tracking-widest text-xs">Resumo do Dia</h4>
            <span className="text-orange-500 font-black">{point.total_hours}</span>
          </div>
          <div className="flex items-start gap-3 text-xs text-slate-500">
            <Info size={14} className="mt-0.5 shrink-0" />
            <p>Horários registrados conforme sua jornada.</p>
          </div>
        </Card>
      )}

      <Modal isOpen={isPauseModalOpen} onClose={() => setIsPauseModalOpen(false)} title="Jornada pausada">
        <div className="space-y-6">
          <p className="text-slate-300">Deseja encerrar a jornada ou continuar depois?</p>
          <div className="grid grid-cols-1 gap-3">
             <Button onClick={continuarJornada} variant="primary" className="w-full py-4 text-sm font-bold uppercase tracking-widest">
              Continuar Jornada
            </Button>
            <Button onClick={encerrarJornada} variant="secondary" className="w-full py-4">
              Encerrar Jornada
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function PointMiniCard({ label, time, active, isNext, obra }: { label: string, time?: string, active: boolean, isNext?: boolean, obra?: string }) {
  return (
    <div className={`
      p-4 rounded-2xl border transition-all text-center relative overflow-hidden
      ${active ? 'bg-slate-800 border-orange-600/50 shadow-lg' : 'bg-slate-900 border-slate-800 opacity-40'}
      ${isNext ? 'ring-2 ring-orange-500 ring-offset-2 ring-offset-slate-900' : ''}
    `}>
      {isNext && <div className="absolute top-0 left-0 w-full h-1 bg-orange-500" />}
      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-lg font-black ${active ? 'text-white' : 'text-slate-700'}`}>{time || '--:--'}</p>
      {active && obra && <p className="text-[9px] font-bold text-orange-500 uppercase mt-1 truncate">{obra}</p>}
    </div>
  );
}
