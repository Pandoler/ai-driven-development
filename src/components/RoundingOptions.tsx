import type { Member, RemainderPolicy, RoundingUnit } from '../types';

const UNITS: RoundingUnit[] = [1, 10, 100, 500];

interface Props {
  roundingUnit: RoundingUnit;
  policy: RemainderPolicy;
  members: Member[];
  onUnitChange: (unit: RoundingUnit) => void;
  onPolicyChange: (policy: RemainderPolicy) => void;
}

export function RoundingOptions({ roundingUnit, policy, members, onUnitChange, onPolicyChange }: Props) {
  return (
    <div className="rounding-options">
      <h2>⚙️ 端数の設定</h2>
      <div className="option-row">
        <label htmlFor="rounding-unit">丸め単位</label>
        <select
          id="rounding-unit"
          value={roundingUnit}
          onChange={(e) => onUnitChange(Number(e.target.value) as RoundingUnit)}
        >
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {u === 1 ? '1円（丸めなし）' : `${u}円単位`}
            </option>
          ))}
        </select>
      </div>
      <div className="option-row">
        <label htmlFor="remainder-policy">差額の処理</label>
        <select
          id="remainder-policy"
          value={policy.type}
          onChange={(e) =>
            onPolicyChange(
              e.target.value === 'collectUp'
                ? { type: 'collectUp' }
                : { type: 'absorb', memberId: members[0]?.id ?? '' },
            )
          }
        >
          <option value="collectUp">切り上げて集める（余りを表示）</option>
          <option value="absorb">指定メンバーが差額を吸収</option>
        </select>
      </div>
      {policy.type === 'absorb' && (
        <div className="option-row">
          <label htmlFor="absorber">吸収するメンバー</label>
          <select
            id="absorber"
            value={policy.memberId}
            onChange={(e) => onPolicyChange({ type: 'absorb', memberId: e.target.value })}
          >
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
