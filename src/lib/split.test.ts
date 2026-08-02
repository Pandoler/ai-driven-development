import { describe, expect, it } from 'vitest';
import { computeSplit } from './split';
import type { Member, RemainderPolicy, RoundingUnit } from '../types';

function weightMember(id: string, weight: number, name = id): Member {
  return { id, name, mode: { type: 'weight', weight } };
}

function fixedMember(id: string, amount: number, name = id): Member {
  return { id, name, mode: { type: 'fixed', amount } };
}

function split(
  total: number,
  members: Member[],
  roundingUnit: RoundingUnit = 1,
  remainderPolicy: RemainderPolicy = { type: 'absorb', memberId: members[0]?.id ?? '' },
) {
  return computeSplit({ total, members, roundingUnit, remainderPolicy });
}

function amounts(result: ReturnType<typeof computeSplit>): number[] {
  return result.payments.map((p) => p.amount);
}

describe('均等割り', () => {
  it('割り切れる場合は全員同額', () => {
    const r = split(30000, [weightMember('a', 1), weightMember('b', 1), weightMember('c', 1)]);
    expect(amounts(r)).toEqual([10000, 10000, 10000]);
    expect(r.collected).toBe(30000);
    expect(r.surplus).toBe(0);
    expect(r.warnings).toEqual([]);
  });

  it('メンバー1人なら全額', () => {
    const r = split(5000, [weightMember('a', 1)]);
    expect(amounts(r)).toEqual([5000]);
  });

  it('総額0なら全員0円', () => {
    const r = split(0, [weightMember('a', 1), weightMember('b', 1)]);
    expect(amounts(r)).toEqual([0, 0]);
    expect(r.warnings).toEqual([]);
  });
});

describe('傾斜割り', () => {
  it('倍率比で按分される', () => {
    const r = split(30000, [
      weightMember('boss', 1.5),
      weightMember('peer', 1),
      weightMember('junior', 0.5),
    ]);
    expect(amounts(r)).toEqual([15000, 10000, 5000]);
  });

  it('倍率0のメンバーは0円', () => {
    const r = split(20000, [weightMember('a', 1), weightMember('kanji', 0)], 1, {
      type: 'absorb',
      memberId: 'a',
    });
    expect(amounts(r)).toEqual([20000, 0]);
  });
});

describe('固定額との組み合わせ', () => {
  it('固定額を差し引いた残額を按分する', () => {
    const r = split(30000, [
      fixedMember('boss', 10000),
      weightMember('a', 1),
      weightMember('b', 1),
    ]);
    expect(amounts(r)).toEqual([10000, 10000, 10000]);
  });

  it('固定額 + 傾斜の混在', () => {
    const r = split(25000, [
      fixedMember('boss', 10000),
      weightMember('senior', 1.5),
      weightMember('junior', 0.5),
    ]);
    expect(amounts(r)).toEqual([10000, 11250, 3750]);
  });

  it('固定額が総額を超えると警告し、倍率メンバーは0円', () => {
    const r = split(30000, [fixedMember('boss', 40000), weightMember('a', 1)], 1, {
      type: 'collectUp',
    });
    expect(amounts(r)).toEqual([40000, 0]);
    expect(r.surplus).toBe(10000);
    expect(r.warnings).toContain('固定額の合計が総額を超えています');
  });
});

describe('丸め: absorb（指定メンバーが差額を吸収）', () => {
  it('100円単位で丸め、差額を吸収者に寄せる', () => {
    const r = split(
      10000,
      [weightMember('kanji', 1), weightMember('b', 1), weightMember('c', 1)],
      100,
      { type: 'absorb', memberId: 'kanji' },
    );
    // raw 3333.33 → 3300 に丸め、差額 400 を kanji が吸収
    expect(amounts(r)).toEqual([3400, 3300, 3300]);
    expect(r.collected).toBe(10000);
    expect(r.surplus).toBe(0);
  });

  it('500円単位でも集金合計は総額と一致する', () => {
    const r = split(
      10000,
      [weightMember('a', 1), weightMember('b', 1), weightMember('c', 1)],
      500,
      { type: 'absorb', memberId: 'a' },
    );
    expect(r.collected).toBe(10000);
    expect(amounts(r)[1]).toBe(3500);
    expect(amounts(r)[2]).toBe(3500);
    expect(amounts(r)[0]).toBe(3000);
  });

  it('吸収者の支払額がマイナスになると警告する', () => {
    const r = split(400, [weightMember('a', 1), weightMember('kanji', 0)], 500, {
      type: 'absorb',
      memberId: 'kanji',
    });
    // a は 400 → 500 に丸まり、kanji が -100 を吸収
    expect(amounts(r)).toEqual([500, -100]);
    expect(r.collected).toBe(400);
    expect(r.warnings).toContain('kanji の支払額がマイナスになっています');
  });

  it('吸収者が指定されていないと警告する', () => {
    const r = split(10000, [weightMember('a', 1), weightMember('b', 1)], 100, {
      type: 'absorb',
      memberId: 'missing',
    });
    expect(r.warnings).toContain('差額を負担するメンバーが選択されていません');
  });
});

describe('丸め: coverShortfall（全員切り捨て、不足分を指定メンバーが負担）', () => {
  it('全員切り捨てで、不足分を負担者に上乗せする', () => {
    const r = split(
      11000,
      [weightMember('kanji', 1), weightMember('b', 1), weightMember('c', 1)],
      100,
      { type: 'coverShortfall', memberId: 'kanji' },
    );
    // raw 3666.67 → 3600 に切り捨て、不足 200 を kanji が負担（3600 + 200 = 3800）
    expect(amounts(r)).toEqual([3800, 3600, 3600]);
    expect(r.collected).toBe(11000);
    expect(r.surplus).toBe(0);
    expect(r.warnings).toEqual([]);
  });

  it('absorb（四捨五入）と異なり、負担者以外の支払額が増えない', () => {
    const members = [weightMember('kanji', 1), weightMember('b', 1), weightMember('c', 1)];
    const cover = split(11000, members, 100, { type: 'coverShortfall', memberId: 'kanji' });
    const absorb = split(11000, members, 100, { type: 'absorb', memberId: 'kanji' });
    // absorb は四捨五入で b, c が 3700 に上がるが、coverShortfall は 3600 のまま
    expect(amounts(absorb)).toEqual([3600, 3700, 3700]);
    expect(amounts(cover)).toEqual([3800, 3600, 3600]);
  });

  it('割り切れる場合は負担の上乗せなし', () => {
    const r = split(30000, [weightMember('a', 1), weightMember('b', 1), weightMember('c', 1)], 100, {
      type: 'coverShortfall',
      memberId: 'a',
    });
    expect(amounts(r)).toEqual([10000, 10000, 10000]);
    expect(r.surplus).toBe(0);
  });

  it('傾斜 + 固定額との組み合わせでも集金合計が総額と一致する', () => {
    const r = split(
      25000,
      [fixedMember('boss', 10000), weightMember('kanji', 1), weightMember('junior', 0.5)],
      500,
      { type: 'coverShortfall', memberId: 'kanji' },
    );
    // 残 15000 を 1 : 0.5 で按分 → raw 10000 / 5000、切り捨てでそのまま、不足 0
    expect(amounts(r)).toEqual([10000, 10000, 5000]);
    expect(r.collected).toBe(25000);
  });

  it('負担者が指定されていないと警告する', () => {
    const r = split(10000, [weightMember('a', 1), weightMember('b', 1)], 100, {
      type: 'coverShortfall',
      memberId: 'missing',
    });
    expect(r.warnings).toContain('差額を負担するメンバーが選択されていません');
  });
});

describe('丸め: collectUp（切り上げて余りを表示）', () => {
  it('全員切り上げ、余りを surplus として返す', () => {
    const r = split(
      10000,
      [weightMember('a', 1), weightMember('b', 1), weightMember('c', 1)],
      100,
      { type: 'collectUp' },
    );
    expect(amounts(r)).toEqual([3400, 3400, 3400]);
    expect(r.collected).toBe(10200);
    expect(r.surplus).toBe(200);
  });

  it('割り切れる金額は切り上げで増えない（浮動小数点誤差の防止）', () => {
    const r = split(
      6000,
      [weightMember('a', 1.2), weightMember('b', 1.2), weightMember('c', 1.2)],
      100,
      { type: 'collectUp' },
    );
    expect(amounts(r)).toEqual([2000, 2000, 2000]);
    expect(r.surplus).toBe(0);
  });
});

describe('エッジケース', () => {
  it('全員倍率0で残額があると警告する', () => {
    const r = split(10000, [weightMember('a', 0), weightMember('b', 0)], 100, {
      type: 'collectUp',
    });
    expect(amounts(r)).toEqual([0, 0]);
    expect(r.warnings).toContain('残額を負担するメンバーがいません');
  });

  it('全員倍率0でも absorb なら吸収者が全額負担する', () => {
    const r = split(10000, [weightMember('kanji', 0), weightMember('b', 0)], 100, {
      type: 'absorb',
      memberId: 'kanji',
    });
    expect(amounts(r)).toEqual([10000, 0]);
    expect(r.warnings).toEqual([]);
  });

  it('全員固定額で合計が一致すれば警告なし', () => {
    const r = split(15000, [fixedMember('a', 10000), fixedMember('b', 5000)], 1, {
      type: 'collectUp',
    });
    expect(amounts(r)).toEqual([10000, 5000]);
    expect(r.surplus).toBe(0);
    expect(r.warnings).toEqual([]);
  });
});
