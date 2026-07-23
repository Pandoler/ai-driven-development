interface Props {
  total: number;
  onChange: (total: number) => void;
}

export function TotalInput({ total, onChange }: Props) {
  return (
    <div className="total-input">
      <label htmlFor="total">合計金額</label>
      <div className="total-input-field">
        <input
          id="total"
          type="number"
          inputMode="numeric"
          min={0}
          step={100}
          value={total === 0 ? '' : total}
          placeholder="0"
          onChange={(e) => onChange(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
        />
        <span className="unit">円</span>
      </div>
    </div>
  );
}
