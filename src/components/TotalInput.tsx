import { NumberField } from './NumberField';

interface Props {
  total: number;
  onChange: (total: number) => void;
}

export function TotalInput({ total, onChange }: Props) {
  return (
    <div className="total-input">
      <label htmlFor="total">合計金額</label>
      <div className="total-input-field">
        <NumberField
          id="total"
          value={total}
          integer
          blankWhenZero
          step={100}
          placeholder="0"
          onChange={onChange}
        />
        <span className="unit">円</span>
      </div>
    </div>
  );
}
