interface NumberInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  placeholder?: string;
}

export default function NumberInput({ label, value, onChange, min, max, placeholder }: NumberInputProps) {
  return (
    <label className="flex items-center gap-1.5 text-muted text-[0.85rem] cursor-pointer">
      {label}
      <input
        type="number"
        value={value}
        onChange={e => onChange(parseInt(e.target.value) || 0)}
        min={min}
        max={max}
        placeholder={placeholder}
        className="w-[70px] bg-bg border border-border text-text px-2 py-1 rounded text-[0.85rem]"
      />
    </label>
  );
}
