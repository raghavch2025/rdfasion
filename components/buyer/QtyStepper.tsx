"use client";

export function QtyStepper({
  value,
  onChange,
  disabled,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        disabled={disabled || value <= 0}
        aria-label={`${label} −`}
        className="h-11 w-11 rounded-lg border border-line text-2xl leading-none font-bold disabled:opacity-40"
      >
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={999}
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => onChange(Number.parseInt(e.target.value || "0", 10) || 0)}
        onFocus={(e) => e.target.select()}
        className="h-11 w-14 rounded-lg border border-line text-center text-lg font-bold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        disabled={disabled}
        aria-label={`${label} +`}
        className="h-11 w-11 rounded-lg border border-ink bg-ink text-2xl leading-none font-bold text-white disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}
