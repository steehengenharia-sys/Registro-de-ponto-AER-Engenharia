import { db } from './firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

export interface CompanyPointSchedule {
  enabled: boolean;
  timezone: string;
  workDays: number[]; // 0: Sun, 1: Mon, ...
  startTime: string;
  endTime: string;
  entryReminder1: string;
  entryReminder2: string;
  exitReminder1: string;
  exitReminder2: string;
  useCompanyDefault?: boolean;
}

export interface EmployeePointScheduleOverride extends CompanyPointSchedule {
  useCompanyDefault: boolean;
  employeeUid: string;
  updatedAt: any;
  updatedBy: string;
}

export const DEFAULT_COMPANY_POINT_SCHEDULE: CompanyPointSchedule = {
  enabled: true,
  timezone: 'America/Sao_Paulo',
  workDays: [1, 2, 3, 4, 5, 6],
  startTime: '07:00',
  endTime: '17:00',
  entryReminder1: '06:50',
  entryReminder2: '07:10',
  exitReminder1: '16:50',
  exitReminder2: '17:10',
};

const SCHEDULE_COLLECTION = 'pointReminderSchedules';
const COMPANY_DEFAULT_DOC = 'companyDefault';

export async function getCompanyPointSchedule(): Promise<CompanyPointSchedule> {
  const docRef = doc(db, SCHEDULE_COLLECTION, COMPANY_DEFAULT_DOC);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return docSnap.data() as CompanyPointSchedule;
  }
  return DEFAULT_COMPANY_POINT_SCHEDULE;
}

export async function saveCompanyPointSchedule(schedule: CompanyPointSchedule, updatedBy: string): Promise<void> {
  const docRef = doc(db, SCHEDULE_COLLECTION, COMPANY_DEFAULT_DOC);
  await setDoc(docRef, {
    ...schedule,
    updatedAt: serverTimestamp(),
    updatedBy,
  });
}

export async function getEmployeePointSchedule(userId: string): Promise<EmployeePointScheduleOverride | null> {
  const docRef = doc(db, SCHEDULE_COLLECTION, userId);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return docSnap.data() as EmployeePointScheduleOverride;
  }
  return null;
}

export async function saveEmployeePointSchedule(userId: string, schedule: EmployeePointScheduleOverride, updatedBy: string): Promise<void> {
  const docRef = doc(db, SCHEDULE_COLLECTION, userId);
  await setDoc(docRef, {
    ...schedule,
    employeeUid: userId,
    updatedAt: serverTimestamp(),
    updatedBy,
  });
}

export async function getEffectivePointSchedule(userId: string): Promise<CompanyPointSchedule> {
  const [companySchedule, employeeSchedule] = await Promise.all([
    getCompanyPointSchedule(),
    getEmployeePointSchedule(userId)
  ]);

  if (employeeSchedule && !employeeSchedule.useCompanyDefault) {
    return { ...employeeSchedule, useCompanyDefault: false };
  }
  
  return { ...companySchedule, useCompanyDefault: true };
}

export function calculateReminders(startTime: string, endTime: string) {
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);
  
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  const format = (mins: number) => {
    const h = Math.floor(mins / 60) % 24;
    const m = mins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  return {
    entryReminder1: format(startMinutes - 10),
    entryReminder2: format(startMinutes + 10),
    exitReminder1: format(endMinutes - 10),
    exitReminder2: format(endMinutes + 10),
  };
}
