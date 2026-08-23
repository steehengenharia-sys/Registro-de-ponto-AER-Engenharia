import { dispatchReminders } from './_lib/pointReminderDispatcher';

export default {
  async fetch(request: Request) {
    if (request.method !== 'GET') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const missingVars = [];
    if (!process.env.CRON_SECRET) missingVars.push('CRON_SECRET');
    if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) missingVars.push('FIREBASE_SERVICE_ACCOUNT_JSON');
    if (!process.env.FIREBASE_FIRESTORE_DATABASE_ID) missingVars.push('FIREBASE_FIRESTORE_DATABASE_ID');
    if (!process.env.PUBLIC_APP_URL) missingVars.push('PUBLIC_APP_URL');

    if (missingVars.length > 0) {
      return new Response(JSON.stringify({ error: 'Missing Server Variables', missingVars }), { 
        status: 503, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return new Response('Unauthorized', { status: 401 });
    }

    const url = new URL(request.url);
    const isTest = url.searchParams.get('test') === '1';

    try {
      const result = await dispatchReminders(isTest);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error: any) {
      console.error('Error dispatching reminders:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};
