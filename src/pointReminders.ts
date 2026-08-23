export interface PointReminderSettings {
  shiftStart: string;
  shiftEnd: string;
  entryReminders: string[];
  exitReminders: string[];
  enabled: boolean;
}

export const DEFAULT_POINT_REMINDER_SETTINGS: PointReminderSettings = {
  shiftStart: '07:00',
  shiftEnd: '17:00',
  entryReminders: ['06:50', '07:10'],
  exitReminders: ['16:50', '17:10'],
  enabled: false,
};

export function loadPointReminderSettings(userId: string): PointReminderSettings {
  const stored = localStorage.getItem(`reminder_settings_${userId}`);
  return stored ? JSON.parse(stored) : DEFAULT_POINT_REMINDER_SETTINGS;
}

export function savePointReminderSettings(userId: string, settings: PointReminderSettings): void {
  localStorage.setItem(`reminder_settings_${userId}`, JSON.stringify(settings));
}

// Logic for Sao Paulo timezone
function getSaoPauloTime(date: Date): { day: number; hour: number; minute: number } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    weekday: 'long',
  });
  
  const parts = formatter.formatToParts(date);
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
  const weekday = parts.find(p => p.type === 'weekday')?.value;
  
  // 0: Sun, 1: Mon, ..., 6: Sat
  const weekdayMap: Record<string, number> = {
    'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3,
    'Thursday': 4, 'Friday': 5, 'Saturday': 6
  };
  
  return { day: weekdayMap[weekday || ''] ?? -1, hour, minute };
}

export function getDuePointReminder(
  now: Date,
  settings: PointReminderSettings,
  hasEntry: boolean,
  journeyClosed: boolean
): { key: string; title: string; body: string } | null {
  const { day, hour, minute } = getSaoPauloTime(now);

  // No reminders on Sunday
  if (day === 0) return null;

  const currentTimeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;

  // Entry reminders
  if (!hasEntry) {
    if (settings.entryReminders.includes(currentTimeStr)) {
      return { key: `entry_${currentTimeStr}`, title: 'Ponto', body: 'Lembrete: registre sua entrada.' };
    }
  }

  // Exit reminders
  if (!journeyClosed) {
    if (settings.exitReminders.includes(currentTimeStr)) {
      return { key: `exit_${currentTimeStr}`, title: 'Ponto', body: 'Lembrete: registre sua saída.' };
    }
  }

  return null;
}

export function wasReminderSent(userId: string, reminderKey: string, date: string): boolean {
  return localStorage.getItem(`reminder_sent_${userId}_${reminderKey}_${date}`) !== null;
}

export function markReminderAsSent(userId: string, reminderKey: string, date: string): void {
  localStorage.setItem(`reminder_sent_${userId}_${reminderKey}_${date}`, 'true');
}

export async function requestPointNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  const permission = await Notification.requestPermission();
  return permission === 'granted';
}

export async function showPointNotification(title: string, body: string, tag: string): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.ready;
  registration.showNotification(title, {
    body,
    tag,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
  });
}
