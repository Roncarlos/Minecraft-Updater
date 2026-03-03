interface FilterInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}

export default function FilterInput({ value, onChange, placeholder }: FilterInputProps) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      className="w-full bg-surface border border-border text-text px-2.5 py-1.5 rounded text-[0.8rem] font-[inherit] focus:outline-none focus:border-info mb-2"
    />
  );
}
