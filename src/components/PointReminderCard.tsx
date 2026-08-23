import React, { useState, useEffect } from 'react';
import {
  loadPointReminderSettings,
  savePointReminderSettings,
  requestPointNotificationPermission,
  showPointNotification,
} from '../pointReminders';
import { getEffectivePointSchedule, CompanyPointSchedule } from '../pointScheduleService';

interface PointReminderCardProps {
  userId: string;
  onOpenAlerts?: () => void;
}

export const PointReminderCard: React.FC<PointReminderCardProps> = ({ userId, onOpenAlerts }) => {
  const [settings, setSettings] = useState<any | null>(null);
  const [schedule, setSchedule] = useState<CompanyPointSchedule | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setSettings(loadPointReminderSettings(userId));
    getEffectivePointSchedule(userId).then(setSchedule);
  }, [userId]);

  const handleEnable = async () => {
    const granted = await requestPointNotificationPermission();
    if (granted) {
      const newSettings = { ...loadPointReminderSettings(userId), enabled: true };
      savePointReminderSettings(userId, newSettings);
      setSettings(newSettings);
      setMessage('Notificações ativadas com sucesso!');
    } else {
      setMessage('As notificações estão bloqueadas. Ative-as nas configurações do navegador ou do aplicativo e tente novamente.');
    }
  };

  const handleDisable = () => {
    const newSettings = { ...loadPointReminderSettings(userId), enabled: false };
    savePointReminderSettings(userId, newSettings);
    setSettings(newSettings);
    setMessage('Alertas desativados. Nota: Permissões de notificação devem ser removidas nas configurações do seu navegador ou celular.');
  };

  const handleTest = async () => {
    if (settings?.enabled) {
      await showPointNotification(
        'A&R Engenharia — Controle de Ponto',
        'Teste concluído. Os alertas de ponto estão ativos neste celular.',
        `test_${userId}`
      );
      setMessage('Notificação de teste enviada!');
    }
  };

  if (!settings || !schedule) return null;

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
        {schedule.enabled ? 'Alertas ativos neste celular' : 'Alertas desativados'}
      </div>
      <div className="text-xs text-slate-500 mb-4">
        {schedule.useCompanyDefault ? 'Usando horário padrão' : 'Usando horário personalizado'}
      </div>

      <div className="flex flex-wrap gap-2">
        {!settings.enabled && (
          <button onClick={handleEnable} className="bg-orange-600 hover:bg-orange-700 text-white text-sm px-4 py-2 rounded">
            Ativar alertas no celular
          </button>
        )}
        {settings.enabled && (
          <>
            <button onClick={handleTest} className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-4 py-2 rounded">
              Enviar notificação de teste
            </button>
            <button onClick={handleDisable} className="bg-red-900 hover:bg-red-800 text-white text-sm px-4 py-2 rounded">
              Desativar alertas
            </button>
          </>
        )}
      </div>

      {message && <p className="text-xs text-slate-300 mt-4">{message}</p>}
    </div>
  );
};
