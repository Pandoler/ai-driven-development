import { useState } from 'react';

interface Props {
  value: number;
  onChange: (value: number) => void;
  /** 小数を許さず整数に丸める（金額欄向け） */
  integer?: boolean;
  /** 値が 0 のとき空欄にしてプレースホルダを見せる（金額欄向け） */
  blankWhenZero?: boolean;
  step?: number;
  placeholder?: string;
  id?: string;
  className?: string;
  'aria-label'?: string;
}

/**
 * 数値入力欄。
 * 入力中（フォーカス中）は打った文字列をそのまま保持し、値を 0 に正規化して
 * 表示に押し戻さない。これがないと全消し時に "0" が残り、次の入力が
 * "02" のように 0 の後ろへ入ってしまう。
 * 空欄のまま確定した場合は 0 として扱う。
 */
export function NumberField({
  value,
  onChange,
  integer = false,
  blankWhenZero = false,
  step,
  placeholder,
  id,
  className,
  'aria-label': ariaLabel,
}: Props) {
  // 入力中の生の文字列。null なら確定値を表示する
  const [draft, setDraft] = useState<string | null>(null);

  const committed = blankWhenZero && value === 0 ? '' : String(value);

  const handleChange = (raw: string) => {
    setDraft(raw);
    if (raw === '') {
      onChange(0);
      return;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.max(0, parsed);
    onChange(integer ? Math.floor(clamped) : clamped);
  };

  return (
    <input
      id={id}
      className={className}
      type="number"
      inputMode={integer ? 'numeric' : 'decimal'}
      min={0}
      step={step}
      placeholder={placeholder}
      aria-label={ariaLabel}
      value={draft ?? committed}
      onChange={(e) => handleChange(e.target.value)}
      onBlur={() => setDraft(null)}
    />
  );
}
