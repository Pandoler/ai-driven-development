/** メンバーの支払い方法 */
export type PaymentMode =
  | { type: 'weight'; weight: number } // 倍率按分（均等割りは全員 weight=1）
  | { type: 'fixed'; amount: number }; // 金額直接指定

export interface Member {
  id: string;
  name: string;
  mode: PaymentMode;
  /** 表示用。プリセット選択時に weight へ推奨倍率が入る */
  rolePreset?: string;
}

export type RoundingUnit = 1 | 10 | 100 | 500;

/** 丸め差額の処理方法 */
export type RemainderPolicy =
  | { type: 'absorb'; memberId: string } // 指定メンバーが差額を吸収
  | { type: 'collectUp' }; // 全員切り上げ、余りを表示

export interface SplitInput {
  total: number;
  members: Member[];
  roundingUnit: RoundingUnit;
  remainderPolicy: RemainderPolicy;
}

export interface SplitResult {
  payments: { memberId: string; amount: number }[];
  /** 集金合計 */
  collected: number;
  /** 集金合計 − 総額（collectUp 時の余り。absorb 時は 0 になる） */
  surplus: number;
  warnings: string[];
}
