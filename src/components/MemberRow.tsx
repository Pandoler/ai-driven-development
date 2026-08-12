import { NumberField } from './NumberField';
import { ROLE_PRESETS, presetByKey } from '../lib/presets';
import type { Member } from '../types';

interface Props {
  member: Member;
  placeholder: string;
  canRemove: boolean;
  onUpdate: (member: Member) => void;
  onRemove: () => void;
}

/** 役割セレクトの値: プリセット key / 'custom'（カスタム倍率） / 'fixed'（金額指定） */
function selectValue(member: Member): string {
  if (member.mode.type === 'fixed') return 'fixed';
  return member.rolePreset ?? 'custom';
}

export function MemberRow({ member, placeholder, canRemove, onUpdate, onRemove }: Props) {
  const handleRoleChange = (value: string) => {
    if (value === 'fixed') {
      onUpdate({ ...member, mode: { type: 'fixed', amount: 0 }, rolePreset: undefined });
    } else if (value === 'custom') {
      const weight = member.mode.type === 'weight' ? member.mode.weight : 1;
      onUpdate({ ...member, mode: { type: 'weight', weight }, rolePreset: undefined });
    } else {
      const preset = presetByKey(value);
      onUpdate({
        ...member,
        mode: { type: 'weight', weight: preset?.weight ?? 1 },
        rolePreset: value,
      });
    }
  };

  return (
    <div className="member-row">
      <input
        className="member-name"
        type="text"
        value={member.name}
        placeholder={placeholder}
        onChange={(e) => onUpdate({ ...member, name: e.target.value })}
      />
      <select
        className="member-role"
        value={selectValue(member)}
        onChange={(e) => handleRoleChange(e.target.value)}
      >
        {ROLE_PRESETS.map((p) => (
          <option key={p.key} value={p.key}>
            {p.label} ({p.weight}x)
          </option>
        ))}
        <option value="custom">カスタム倍率</option>
        <option value="fixed">金額指定</option>
      </select>
      {member.mode.type === 'weight' ? (
        <div className="member-value">
          <NumberField
            value={member.mode.weight}
            step={0.1}
            aria-label={`${placeholder} の倍率`}
            onChange={(weight) =>
              // 倍率を手動で変えたらプリセット表示は解除してカスタム扱いにする
              onUpdate({ ...member, mode: { type: 'weight', weight }, rolePreset: undefined })
            }
          />
          <span className="unit">倍</span>
        </div>
      ) : (
        <div className="member-value">
          <NumberField
            value={member.mode.amount}
            integer
            blankWhenZero
            step={100}
            placeholder="0"
            aria-label={`${placeholder} の金額`}
            onChange={(amount) => onUpdate({ ...member, mode: { type: 'fixed', amount } })}
          />
          <span className="unit">円</span>
        </div>
      )}
      <button
        type="button"
        className="btn-remove"
        onClick={onRemove}
        disabled={!canRemove}
        aria-label="メンバーを削除"
      >
        ×
      </button>
    </div>
  );
}
