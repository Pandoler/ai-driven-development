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

describe('isExact（端数が出ないかの判定）', () => {
  const three = () => [weightMember('a', 1), weightMember('b', 1), weightMember('c', 1)];

  it('割り切れる場合は true', () => {
    expect(split(30000, three(), 100, { type: 'collectUp' }).isExact).toBe(true);
  });

  it('端数が出る場合は false', () => {
    expect(split(10000, three(), 100, { type: 'collectUp' }).isExact).toBe(false);
  });

  it('丸め単位を変えると判定も変わる', () => {
    const ms = three();
    // 1人 3400 円。100円単位なら割り切れるが、500円単位だと端数が出る
    expect(split(10200, ms, 100, { type: 'collectUp' }).isExact).toBe(true);
    expect(split(10200, ms, 500, { type: 'collectUp' }).isExact).toBe(false);
  });

  it('選んだモードに関係なく同じ判定になる', () => {
    const ms = three();
    for (const p of [
      { type: 'collectUp' } as const,
      { type: 'absorb', memberId: 'a' } as const,
      { type: 'coverShortfall', memberId: 'a' } as const,
    ]) {
      expect(split(30000, ms, 100, p).isExact).toBe(true);
      expect(split(10000, ms, 100, p).isExact).toBe(false);
    }
  });

  it('isExact が true のとき、どのモードでも支払額は同じ', () => {
    const ms = three();
    const amountsOf = (p: RemainderPolicy) => amounts(split(30000, ms, 100, p));
    expect(split(30000, ms, 100, { type: 'collectUp' }).isExact).toBe(true);
    expect(amountsOf({ type: 'collectUp' })).toEqual(amountsOf({ type: 'absorb', memberId: 'a' }));
    expect(amountsOf({ type: 'collectUp' })).toEqual(
      amountsOf({ type: 'coverShortfall', memberId: 'a' }),
    );
  });

  it('傾斜割りでも、全員の理論値が丸め単位ちょうどなら true', () => {
    const ms = [weightMember('a', 1.5), weightMember('b', 1), weightMember('c', 0.5)];
    // 30000 を 1.5:1:0.5 で按分 → 15000 / 10000 / 5000
    expect(split(30000, ms, 100, { type: 'collectUp' }).isExact).toBe(true);
  });

  it('傾斜割りで一部の理論値に端数が出れば false', () => {
    const ms = [weightMember('a', 2), weightMember('b', 1)];
    // 10000 を 2:1 で按分 → 6666.67 / 3333.33
    expect(split(10000, ms, 100, { type: 'collectUp' }).isExact).toBe(false);
  });

  it('固定額を差し引いた残りが割り切れれば true', () => {
    const ms = [fixedMember('boss', 10000), weightMember('a', 1), weightMember('b', 1)];
    expect(split(30000, ms, 100, { type: 'collectUp' }).isExact).toBe(true);
  });

  it('固定額が総額を超える場合は false（モードによって結果が変わるため）', () => {
    const ms = [fixedMember('boss', 40000), weightMember('a', 1)];
    expect(split(30000, ms, 100, { type: 'collectUp' }).isExact).toBe(false);
  });

  it('全員固定額で合計が総額と一致すれば true', () => {
    const ms = [fixedMember('a', 10000), fixedMember('b', 5000)];
    expect(split(15000, ms, 100, { type: 'collectUp' }).isExact).toBe(true);
  });

  it('負担者がいないのに残額がある場合は false', () => {
    const ms = [weightMember('a', 0), weightMember('b', 0)];
    expect(split(10000, ms, 100, { type: 'collectUp' }).isExact).toBe(false);
  });

  it('総額 0 は端数なし扱い', () => {
    expect(split(0, three(), 100, { type: 'collectUp' }).isExact).toBe(true);
  });
});

describe('absorb と coverShortfall の違い', () => {
  it('理論値が切り上げ方向に丸まるとき、両モードの結果は異なる', () => {
    const ms = [weightMember('kanji', 1), weightMember('b', 1), weightMember('c', 1)];
    // raw 3666.67 → 四捨五入は 3700、切り捨ては 3600 と分かれる
    const absorb = split(11000, ms, 100, { type: 'absorb', memberId: 'kanji' });
    const cover = split(11000, ms, 100, { type: 'coverShortfall', memberId: 'kanji' });
    expect(amounts(absorb)).toEqual([3600, 3700, 3700]);
    expect(amounts(cover)).toEqual([3800, 3600, 3600]);
    expect(absorb.isExact).toBe(false);
  });

  it('理論値が切り下げ方向に丸まるときは、両モードの結果が一致する（仕様どおり）', () => {
    const ms = [weightMember('kanji', 1), weightMember('b', 1), weightMember('c', 1)];
    // raw 3433.33 → 四捨五入も切り捨ても 3400 になるため、負担者の額も揃う
    const absorb = split(10300, ms, 100, { type: 'absorb', memberId: 'kanji' });
    const cover = split(10300, ms, 100, { type: 'coverShortfall', memberId: 'kanji' });
    expect(amounts(absorb)).toEqual(amounts(cover));
    expect(amounts(cover)).toEqual([3500, 3400, 3400]);
    // 端数自体は出ているので、モード選択は引き続き有効
    expect(cover.isExact).toBe(false);
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
