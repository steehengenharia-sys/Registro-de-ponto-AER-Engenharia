import { getAdminDb, getAdminMessaging } from './firebaseAdmin';

// Represents schedule saved in Firestore
interface PointSchedule {
  enabled: boolean;
  timezone: string;
  workDays: number[];
  startTime: string;
  endTime: string;
  entryReminder1: string;
  entryReminder2: string;
  exitReminder1: string;
  exitReminder2: string;
  useCompanyDefault?: boolean;
}

// Represents device document
interface PointDevice {
  id: string; // Document ID
  userId: string;
  deviceId: string;
  fcmToken: string;
  active: boolean;
}

function getSaoPauloNow() {
  const now = new Date();
  
  const dateString = now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const timeString = now.toLocaleTimeString('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
  
  const weekdayStr = now.toLocaleDateString('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short' });
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayOfWeek = days.indexOf(weekdayStr);
  
  return { dateString, timeString, dayOfWeek };
}

// Proper midnight calculation: 
function addMinutes(timeStr: string, minutesToAdd: number): string {
  const [h, m] = timeStr.split(':').map(Number);
  let totalMinutes = h * 60 + m + minutesToAdd;
  // Wrap around 24 hours (1440 minutes)
  totalMinutes = ((totalMinutes % 1440) + 1440) % 1440;
  const newH = Math.floor(totalMinutes / 60);
  const newM = totalMinutes % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

// Instead of blindly trusting DB calculation, recalculate properly across midnight
function getEffectiveReminderTimes(schedule: PointSchedule) {
  return [
    { key: 'entryReminder1', time: addMinutes(schedule.startTime, -10), title: 'Lembrete de entrada', body: 'Não esqueça de registrar sua entrada.' },
    { key: 'entryReminder2', time: addMinutes(schedule.startTime, 10), title: 'Confira seu ponto', body: 'Confira se você registrou sua entrada.' },
    { key: 'exitReminder1', time: addMinutes(schedule.endTime, -10), title: 'Lembrete de saída', body: 'Não esqueça de registrar sua saída.' },
    { key: 'exitReminder2', time: addMinutes(schedule.endTime, 10), title: 'Confira seu ponto', body: 'Confira se você registrou sua saída.' },
  ];
}

export async function dispatchReminders(isTest: boolean) {
  const db = getAdminDb();
  const messaging = getAdminMessaging();
  const { dateString, timeString, dayOfWeek } = getSaoPauloNow();

  let activeDevicesCount = 0;
  let remindersDue = 0;
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  // 1. Get all active devices
  const devicesSnap = await db.collection('pointNotificationDevices').where('active', '==', true).get();
  activeDevicesCount = devicesSnap.size;

  if (activeDevicesCount === 0) {
    return { ok: true, mode: isTest ? 'test' : 'live', timestamp: `${dateString} ${timeString}`, activeDevices: 0, remindersDue: 0, sent: 0, skipped: 0, failed: 0 };
  }

  const devices: PointDevice[] = devicesSnap.docs.map(d => ({
    id: d.id,
    userId: d.data().userId,
    deviceId: d.data().deviceId,
    fcmToken: d.data().fcmToken,
    active: d.data().active
  }));

  // 2 & 3. Load schedules
  const companyDoc = await db.collection('pointReminderSchedules').doc('companyDefault').get();
  const companySchedule = companyDoc.data() as PointSchedule;

  const employeeSchedulesMap = new Map<string, PointSchedule>();
  
  // To optimize, fetch only employee schedules for users we have devices for
  const uniqueUserIds = [...new Set(devices.map(d => d.userId))];
  
  // We process in batches of 10 to avoid 'in' query limits, or just do individual get()s if not too many
  for (const uid of uniqueUserIds) {
    const docSnap = await db.collection('pointReminderSchedules').doc(uid).get();
    if (docSnap.exists) {
      employeeSchedulesMap.set(uid, docSnap.data() as PointSchedule);
    }
  }

  // 4. Determine effective schedule and process
  const publicAppUrl = process.env.PUBLIC_APP_URL || 'https://example.com';
  
  for (const device of devices) {
    const employeeSchedule = employeeSchedulesMap.get(device.userId);
    let effectiveSchedule = companySchedule;
    
    if (employeeSchedule && employeeSchedule.useCompanyDefault === false) {
      effectiveSchedule = employeeSchedule;
    }

    if (!effectiveSchedule) continue; // Safety check

    if (isTest) {
      // Test Mode
      remindersDue++;
      try {
        await messaging.send({
          token: device.fcmToken,
          notification: {
            title: 'Teste do envio automático',
            body: 'O servidor de alertas está funcionando.'
          },
          webpush: {
            notification: {
              icon: '/icon-192.png',
              badge: '/icon-192.png',
            },
            fcmOptions: {
              link: publicAppUrl
            }
          }
        });
        sent++;
      } catch (err: any) {
        failed++;
        if (err.code === 'messaging/registration-token-not-registered' || err.code === 'messaging/invalid-registration-token') {
          await db.collection('pointNotificationDevices').doc(device.id).update({ active: false });
        }
      }
      continue;
    }

    // 5-7. Normal Schedule Logic
    if (!effectiveSchedule.enabled) continue;
    if (!effectiveSchedule.workDays.includes(dayOfWeek)) continue;

    const reminderTimes = getEffectiveReminderTimes(effectiveSchedule);
    
    // Find matching reminder for current time
    const matchingReminder = reminderTimes.find(r => r.time === timeString);
    if (!matchingReminder) continue;

    remindersDue++;

    // Duplicate Check
    const deliveryId = `${device.userId}_${device.id}_${dateString}_${matchingReminder.key}`;
    const deliveryRef = db.collection('pointReminderDeliveries').doc(deliveryId);
    
    const deliveryDoc = await deliveryRef.get();
    if (deliveryDoc.exists) {
      skipped++;
      continue;
    }

    try {
      await messaging.send({
        token: device.fcmToken,
        notification: {
          title: matchingReminder.title,
          body: matchingReminder.body
        },
        webpush: {
          notification: {
            icon: '/icon-192.png',
            badge: '/icon-192.png',
          },
          fcmOptions: {
            link: publicAppUrl
          }
        }
      });
      
      // Save delivery record
      await deliveryRef.set({
        deliveredAt: new Date().toISOString(),
        userId: device.userId,
        deviceId: device.id,
        date: dateString,
        reminderKey: matchingReminder.key
      });
      
      sent++;
    } catch (err: any) {
      failed++;
      console.error(`Error sending to device ${device.id}:`, err);
      if (err.code === 'messaging/registration-token-not-registered' || err.code === 'messaging/invalid-registration-token') {
        await db.collection('pointNotificationDevices').doc(device.id).update({ active: false });
      }
    }
  }

  return {
    ok: true,
    mode: isTest ? 'test' : 'live',
    timestamp: `${dateString} ${timeString}`,
    activeDevices: activeDevicesCount,
    remindersDue,
    sent,
    skipped,
    failed
  };
}
