import React from 'react';

interface TimeInputProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export const TimeInput: React.FC<TimeInputProps> = ({ value, onChange, className }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/[^0-9]/g, '');
    if (val.length > 4) val = val.substring(0, 4);
    
    let formatted = val;
    if (val.length > 2) {
      formatted = `${val.substring(0, 2)}:${val.substring(2)}`;
    }
    
    const [h, m] = formatted.split(':');
    if (h && parseInt(h) > 23) return;
    if (m && parseInt(m) > 59) return;
    
    onChange(formatted);
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      placeholder="HH:mm"
      value={value}
      onChange={handleChange}
      className={`bg-slate-800 text-white p-2 rounded w-20 text-center ${className}`}
      maxLength={5}
    />
  );
};
