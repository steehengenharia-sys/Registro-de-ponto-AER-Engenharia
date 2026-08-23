import React, { useState, useEffect } from 'react';
import { showPointNotification } from '../pointReminders';
import { getEffectivePointSchedule, CompanyPointSchedule } from '../pointScheduleService';
import { registerPushDevice, unregisterPushDevice } from '../pushNotificationService';

const DEVICE_ACTIVE_KEY = 'point_push_active';

interface PointReminderCardProps {
  userId: string;
  onOpenAlerts?: () => void;
}

export const PointReminderCard: React.FC<PointReminderCardProps> = ({ userId, onOpenAlerts }) => {
  const [schedule, setSchedule] = useState<CompanyPointSchedule | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPushActive, setIsPushActive] = useState<boolean>(() => localStorage.getItem(DEVICE_ACTIVE_KEY) === 'true');
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    getEffectivePointSchedule(userId).then(setSchedule);
  }, [userId]);

  const handleEnable = async () => {
    setLoading(true);
    setMessage('Ativando...');
    try {
      await registerPushDevice(userId);
      localStorage.setItem(DEVICE_ACTIVE_KEY, 'true');
      setIsPushActive(true);
      setMessage('Notificações ativadas com sucesso!');
    } catch (error: any) {
      setMessage(error.message || 'Erro ao ativar notificações.');
    } finally {
      setLoading(false);
    }
  };

  const handleDisable = async () => {
    setLoading(true);
    setMessage('Desativando...');
    try {
      await unregisterPushDevice(userId);
      localStorage.setItem(DEVICE_ACTIVE_KEY, 'false');
      setIsPushActive(false);
      setMessage('Alertas desativados neste celular.');
    } catch (error: any) {
      setMessage('Não foi possível desativar os alertas. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    if (isPushActive) {
      try {
        await showPointNotification(
          'A&R Engenharia — Controle de Ponto',
          'Notificação de teste',
          `test_${userId}`
        );
        setMessage('Notificação local de teste exibida. O envio automático será conectado na próxima etapa.');
      } catch (error: any) {
        setMessage('Erro ao enviar notificação de teste.');
      }
    }
  };

  if (!schedule) return null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 mt-6">
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-lg font-bold text-slate-100">Lembretes de ponto</h3>
        {onOpenAlerts && (
          <button onClick={onOpenAlerts} className="text-orange-500 hover:text-orange-400 text-sm font-bold border border-orange-500/30 px-3 py-1 rounded">Meus alertas</button>
        )}
      </div>
      <p className="text-slate-400 text-sm mb-1">Seu horário: {schedule.startTime} às {schedule.endTime}</p>
      <p className="text-slate-400 text-sm mb-4">Seus alertas: {schedule.entryReminder1}, {schedule.entryReminder2}, {schedule.exitReminder1} e {schedule.exitReminder2}</p>
      
      <div className={`text-sm font-bold mb-4`}>
        {isPushActive ? 'Alertas ativos neste celular' : 'Alertas ainda não ativados neste celular'}
      </div>
      <div className="text-xs text-slate-500 mb-4">
        {schedule.useCompanyDefault ? 'Usando horário padrão' : 'Usando horário personalizado'}
      </div>

      <div className="flex flex-wrap gap-2">
        {!isPushActive && (
          <button onClick={handleEnable} disabled={loading} className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-sm px-4 py-2 rounded">
            Ativar alertas no celular
          </button>
        )}
        {isPushActive && (
          <>
            <button onClick={handleTest} disabled={loading} className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white text-sm px-4 py-2 rounded">
              Enviar notificação de teste
            </button>
            <button onClick={handleDisable} disabled={loading} className="bg-red-900 hover:bg-red-800 disabled:opacity-50 text-white text-sm px-4 py-2 rounded">
              Desativar alertas
            </button>
          </>
        )}
      </div>

      {message && <p className="text-xs text-slate-300 mt-4">{message}</p>}
    </div>
  );
};
