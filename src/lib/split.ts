import type { SplitInput, SplitResult } from '../types';

const EPSILON = 1e-9;

function ceilToUnit(value: number, unit: number): number {
  // + 0 で -0 を 0 に正規化する
  return Math.ceil(value / unit - EPSILON) * unit + 0;
}

function floorToUnit(value: number, unit: number): number {
  return Math.floor(value / unit + EPSILON) * unit + 0;
}

/**
 * 割り勘計算の本体。
 * 固定額メンバーの合計を総額から差し引き、残額を倍率メンバーの weight 比で按分する。
 * 丸め差額は remainderPolicy に従って処理する（DESIGN.md §3）。
 */
export function computeSplit(input: SplitInput): SplitResult {
  const { total, members, roundingUnit, remainderPolicy } = input;
  const warnings: string[] = [];
  const payments = new Map<string, number>();

  let fixedSum = 0;
  let weightSum = 0;
  for (const m of members) {
    if (m.mode.type === 'fixed') {
      fixedSum += m.mode.amount;
      payments.set(m.id, m.mode.amount);
    } else {
      weightSum += m.mode.weight;
    }
  }

  let remaining = total - fixedSum;
  if (remaining < 0) {
    warnings.push('固定額の合計が総額を超えています');
    remaining = 0;
  }

  /** 丸める前の理論値。端数が出るかの判定に使う */
  const rawShares: number[] = [];

  for (const m of members) {
    if (m.mode.type !== 'weight') continue;
    if (weightSum <= 0) {
      payments.set(m.id, 0);
      continue;
    }
    const raw = (remaining * m.mode.weight) / weightSum;
    rawShares.push(raw);
    const rounded =
      remainderPolicy.type === 'collectUp'
        ? ceilToUnit(raw, roundingUnit)
        : floorToUnit(raw, roundingUnit);
    payments.set(m.id, rounded);
  }

  if (remainderPolicy.type === 'coverShortfall') {
    const payer = members.find((m) => m.id === remainderPolicy.memberId);
    if (payer) {
      const collected = [...payments.values()].reduce((a, b) => a + b, 0);
      const diff = total - collected;
      payments.set(payer.id, (payments.get(payer.id) ?? 0) + diff);
    } else {
      warnings.push('差額を負担するメンバーが選択されていません');
    }
  }

  const remainingUncovered =
    remainderPolicy.type === 'collectUp' ||
    !members.some((m) => m.id === remainderPolicy.memberId);
  if (weightSum <= 0 && remaining > 0 && remainingUncovered) {
    warnings.push('残額を負担するメンバーがいません');
  }

  for (const m of members) {
    if ((payments.get(m.id) ?? 0) < 0) {
      warnings.push(`${m.name} の支払額がマイナスになっています`);
    }
  }

  // 全員の理論値が丸め単位ちょうどで、かつ理論値の合計が総額と一致すれば端数は出ない。
  // このとき丸め・差額処理はいずれも働かないため、どのモードでも結果は同じになる。
  const isMultipleOfUnit = (v: number) =>
    Math.abs(v / roundingUnit - Math.round(v / roundingUnit)) < EPSILON;
  const theoreticalCollected = fixedSum + (weightSum > 0 ? remaining : 0);
  const isExact = theoreticalCollected === total && rawShares.every(isMultipleOfUnit);

  const collected = [...payments.values()].reduce((a, b) => a + b, 0);
  return {
    payments: members.map((m) => ({ memberId: m.id, amount: payments.get(m.id) ?? 0 })),
    collected,
    surplus: collected - total,
    isExact,
    warnings,
  };
}
