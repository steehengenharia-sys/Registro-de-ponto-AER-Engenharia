import React, { useState, useEffect } from 'react';
import { Info, Check, AlertCircle } from 'lucide-react';
import { 
  CompanyPointSchedule, 
  DEFAULT_COMPANY_POINT_SCHEDULE, 
  getCompanyPointSchedule, 
  saveCompanyPointSchedule, 
  getEmployeePointSchedule, 
  saveEmployeePointSchedule, 
  EmployeePointScheduleOverride,
  calculateReminders
} from '../pointScheduleService';
import { TimeInput } from './TimeInput';

const DAYS = [
  { label: 'Seg', val: 1 },
  { label: 'Ter', val: 2 },
  { label: 'Qua', val: 3 },
  { label: 'Qui', val: 4 },
  { label: 'Sex', val: 5 },
  { label: 'Sáb', val: 6 },
  { label: 'Dom', val: 0 },
];

const getWorkDaysLabel = (days: number[]) => {
  if (!days || days.length === 0) return 'nenhum dia selecionado';
  if (days.length === 7) return 'todos os dias';
  
  // Check for common ranges
  const sorted = [...days].sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b));
  if (sorted.length === 6 && sorted[0] === 1 && sorted[5] === 6) return 'segunda a sábado';
  if (sorted.length === 5 && sorted[0] === 1 && sorted[4] === 5) return 'segunda a sexta';

  const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  return sorted.map(d => dayNames[d].toLowerCase()).join(', ');
};

interface UserData {
  id: string;
  name: string;
  role: string;
}

interface PointScheduleSettingsProps {
  users?: UserData[];
  currentUser: UserData;
  isEmployeeView?: boolean;
}

const Switch = ({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) => (
  <div className="flex items-center gap-3">
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`
        relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent 
        transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-slate-900
        ${checked ? 'bg-orange-500' : 'bg-slate-700'}
      `}
    >
      <span
        aria-hidden="true"
        className={`
          pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 
          transition duration-200 ease-in-out
          ${checked ? 'translate-x-5' : 'translate-x-0'}
        `}
      />
    </button>
    <span className={`text-sm font-medium ${checked ? 'text-slate-100' : 'text-slate-400'}`}>
      {label}
    </span>
  </div>
);

const SaveButton = ({ 
  onClick, 
  label, 
  loading, 
  success, 
  error, 
  className = "" 
}: { 
  onClick: () => void; 
  label: string; 
  loading: boolean; 
  success: boolean; 
  error: boolean;
  className?: string;
}) => {
  return (
    <div className="space-y-2">
      <button
        onClick={onClick}
        disabled={loading}
        aria-busy={loading}
        className={`
          flex items-center justify-center gap-2 min-w-[140px] px-4 py-2 rounded text-sm font-medium transition-all
          ${success 
            ? 'bg-green-600 text-white' 
            : loading 
              ? 'bg-orange-600/50 cursor-not-allowed text-white/80' 
              : 'bg-orange-600 hover:bg-orange-500 text-white'}
          ${className}
        `}
      >
        {loading ? (
          <>
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            <span>Salvando...</span>
          </>
        ) : success ? (
          <>
            <Check size={16} />
            <span>Salvo!</span>
          </>
        ) : (
          <span>{label}</span>
        )}
      </button>
      
      <div aria-live="polite">
        {success && (
          <p className="text-xs text-green-400 flex items-center gap-1">
            <Check size={12} /> Configuração salva com sucesso.
          </p>
        )}
        {error && (
          <p className="text-xs text-red-400 flex items-center gap-1">
            <AlertCircle size={12} /> Não foi possível salvar. Tente novamente.
          </p>
        )}
      </div>
    </div>
  );
};

export const PointScheduleSettings: React.FC<PointScheduleSettingsProps> = ({ users, currentUser, isEmployeeView = false }) => {
  const [companySchedule, setCompanySchedule] = useState<CompanyPointSchedule>(DEFAULT_COMPANY_POINT_SCHEDULE);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(isEmployeeView ? currentUser.id : '');
  const [employeeSchedule, setEmployeeSchedule] = useState<EmployeePointScheduleOverride | null>(null);

  // Loading/Success/Error states
  const [isSavingCompany, setIsSavingCompany] = useState(false);
  const [companySuccess, setCompanySuccess] = useState(false);
  const [companyError, setCompanyError] = useState(false);

  const [isSavingEmployee, setIsSavingEmployee] = useState(false);
  const [employeeSuccess, setEmployeeSuccess] = useState(false);
  const [employeeError, setEmployeeError] = useState(false);

  useEffect(() => {
    getCompanyPointSchedule().then(s => setCompanySchedule(s || DEFAULT_COMPANY_POINT_SCHEDULE));
  }, []);

  useEffect(() => {
    const targetUid = isEmployeeView ? currentUser.id : selectedEmployeeId;
    if (targetUid) {
      getEmployeePointSchedule(targetUid).then(s => setEmployeeSchedule(s || { ...DEFAULT_COMPANY_POINT_SCHEDULE, useCompanyDefault: true, employeeUid: targetUid, updatedAt: null, updatedBy: '' }));
    }
  }, [selectedEmployeeId, isEmployeeView, currentUser.id]);

  const saveCompany = async () => {
    if (companySchedule.workDays.length === 0) {
      alert('Selecione pelo menos um dia de trabalho!');
      return;
    }
    
    setIsSavingCompany(true);
    setCompanySuccess(false);
    setCompanyError(false);

    try {
      const reminders = calculateReminders(companySchedule.startTime, companySchedule.endTime);
      await saveCompanyPointSchedule({ ...companySchedule, ...reminders }, currentUser.id);
      setCompanySuccess(true);
      setTimeout(() => setCompanySuccess(false), 2000);
    } catch (err) {
      console.error(err);
      setCompanyError(true);
    } finally {
      setIsSavingCompany(false);
    }
  };

  const saveEmployee = async () => {
    if (employeeSchedule) {
      if (!employeeSchedule.useCompanyDefault && employeeSchedule.workDays.length === 0) {
        alert('Selecione pelo menos um dia para os alertas!');
        return;
      }
      
      setIsSavingEmployee(true);
      setEmployeeSuccess(false);
      setEmployeeError(false);

      try {
        const targetUid = isEmployeeView ? currentUser.id : selectedEmployeeId;
        const reminders = calculateReminders(employeeSchedule.startTime, employeeSchedule.endTime);
        await saveEmployeePointSchedule(targetUid, { ...employeeSchedule, ...reminders }, currentUser.id);
        setEmployeeSuccess(true);
        setTimeout(() => setEmployeeSuccess(false), 2000);
      } catch (err) {
        console.error(err);
        setEmployeeError(true);
      } finally {
        setIsSavingEmployee(false);
      }
    }
  };

  const WorkDaySelector = ({ selectedDays, onChange, readOnly = false }: { selectedDays: number[], onChange: (days: number[]) => void, readOnly?: boolean }) => (
    <div className="flex flex-wrap gap-2">
      {DAYS.map(day => {
        const isSelected = selectedDays.includes(day.val);
        return (
          <button
            key={day.val}
            type="button"
            disabled={readOnly}
            aria-pressed={isSelected}
            onClick={() => {
              if (isSelected) {
                onChange(selectedDays.filter(d => d !== day.val));
              } else {
                onChange([...selectedDays, day.val]);
              }
            }}
            className={`
              flex items-center justify-center px-3 py-2 rounded border text-xs font-medium transition-all
              ${isSelected 
                ? 'bg-orange-500/10 border-orange-500 text-white' 
                : 'bg-slate-800 border-slate-700 text-slate-500 hover:border-slate-600'}
              ${readOnly ? 'cursor-default' : 'cursor-pointer'}
            `}
          >
            {day.label}
          </button>
        );
      })}
    </div>
  );

  const renderCompactFields = (schedule: CompanyPointSchedule, setSchedule: (s: CompanyPointSchedule) => void) => {
    const reminders = calculateReminders(schedule.startTime, schedule.endTime);
    return (
      <div className="space-y-4">
        <Switch 
          checked={schedule.enabled} 
          onChange={v => setSchedule({...schedule, enabled: v})} 
          label={schedule.enabled ? 'Alertas ativos' : 'Alertas desativados'}
        />
        
        <div className="grid grid-cols-2 gap-4">
            <div>
                <label className="text-xs text-slate-400 block mb-1">Entrada</label>
                <TimeInput value={schedule.startTime} onChange={v => setSchedule({...schedule, startTime: v})} />
            </div>
            <div>
                <label className="text-xs text-slate-400 block mb-1">Saída</label>
                <TimeInput value={schedule.endTime} onChange={v => setSchedule({...schedule, endTime: v})} />
            </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs text-slate-400 block">Dias de trabalho</label>
          <WorkDaySelector 
            selectedDays={schedule.workDays} 
            onChange={days => setSchedule({...schedule, workDays: days})} 
          />
        </div>

        <div className="text-xs text-slate-500 bg-slate-800 p-2 rounded">
            Alertas automáticos: {reminders.entryReminder1} e {reminders.entryReminder2} • {reminders.exitReminder1} e {reminders.exitReminder2}
        </div>
      </div>
    );
  };

  const getEmployeeSaveLabel = () => {
    if (isEmployeeView) return "Salvar meus alertas";
    if (employeeSchedule?.useCompanyDefault) return "Aplicar padrão";
    return "Salvar personalizado";
  };

  return (
    <div className="space-y-6">
      {!isEmployeeView && (
        <div className="pb-6 border-b border-slate-700">
            <h3 className="font-bold text-slate-300 mb-4 text-sm">Horário padrão da empresa</h3>
            {renderCompactFields(companySchedule, setCompanySchedule)}
            <div className="mt-4">
              <SaveButton 
                onClick={saveCompany} 
                label="Salvar horário padrão" 
                loading={isSavingCompany} 
                success={companySuccess} 
                error={companyError} 
              />
            </div>
        </div>
      )}

      <div>
        {!isEmployeeView && <h3 className="font-bold text-slate-300 mb-4 text-sm">Horário por funcionário</h3>}
        {!isEmployeeView && (
            <select onChange={(e) => setSelectedEmployeeId(e.target.value)} value={selectedEmployeeId} className="bg-slate-800 text-white p-2 rounded mb-4 w-full text-sm">
              <option value="">Selecione um funcionário</option>
              {users?.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
        )}
        {employeeSchedule && (
            <div className="space-y-4">
                <div className="flex bg-slate-800 p-1 rounded-lg w-full mb-4">
                  <button
                    type="button"
                    onClick={() => setEmployeeSchedule({ ...employeeSchedule, useCompanyDefault: true })}
                    className={`flex-1 py-1.5 px-3 rounded-md text-xs font-medium transition-all ${
                      employeeSchedule.useCompanyDefault
                        ? "bg-orange-500 text-white shadow-sm"
                        : "text-slate-400 hover:text-slate-300"
                    }`}
                  >
                    Padrão da empresa
                  </button>
                  <button
                    type="button"
                    onClick={() => setEmployeeSchedule({ ...employeeSchedule, useCompanyDefault: false })}
                    className={`flex-1 py-1.5 px-3 rounded-md text-xs font-medium transition-all ${
                      !employeeSchedule.useCompanyDefault
                        ? "bg-orange-500 text-white shadow-sm"
                        : "text-slate-400 hover:text-slate-300"
                    }`}
                  >
                    Personalizado
                  </button>
                </div>

                {employeeSchedule.useCompanyDefault ? (
                    <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
                        <Info size={14} className="text-slate-500" />
                        <span>
                          {isEmployeeView 
                            ? "Seus alertas seguirão o horário padrão da empresa." 
                            : "Este funcionário seguirá o horário padrão da empresa."}
                        </span>
                    </div>
                ) : (
                    renderCompactFields(employeeSchedule, s => setEmployeeSchedule({...employeeSchedule, ...s}))
                )}
                
                <div className="mt-4">
                  <SaveButton 
                    onClick={saveEmployee} 
                    label={getEmployeeSaveLabel()} 
                    loading={isSavingEmployee} 
                    success={employeeSuccess} 
                    error={employeeError} 
                    className="w-full md:w-auto"
                  />
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

