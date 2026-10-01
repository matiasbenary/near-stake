export function AmountInput({
  amount,
  setAmount,
  maxAmount,
  unit,
  busy,
  ariaLabel,
  overMax = false,
  disabled = false,
}: {
  amount: string;
  setAmount: (amount: string) => void;
  maxAmount: string;
  unit: string;
  busy: boolean;
  ariaLabel: string;
  overMax?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className={`amount${overMax ? ' over' : ''}`}>
      <input
        type="number"
        min="0"
        placeholder="0.0"
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        aria-label={ariaLabel}
      />
      <button className="max" disabled={busy || disabled} onClick={() => setAmount(maxAmount)}>
        MAX
      </button>
      <span className="unit">{unit}</span>
    </div>
  );
}
