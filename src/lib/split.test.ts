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
  remainderPolicy: RemainderPolicy = { type: 'coverShortfall', memberId: members[0]?.id ?? '' },
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
      type: 'coverShortfall',
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

  it('負担者以外の支払額は理論値を超えない（お釣りが出ない）', () => {
    const ms = [weightMember('kanji', 1), weightMember('b', 1), weightMember('c', 1)];
    for (const total of [10000, 11000, 12345, 30300, 33333]) {
      const r = split(total, ms, 100, { type: 'coverShortfall', memberId: 'kanji' });
      const theoretical = total / 3;
      for (const p of r.payments.filter((p) => p.memberId !== 'kanji')) {
        expect(p.amount).toBeLessThanOrEqual(theoretical);
      }
      // 切り捨てた分は負担者が引き受けるので、集金合計は必ず総額ちょうど
      expect(r.collected).toBe(total);
      expect(r.surplus).toBe(0);
    }
  });

  it('100円単位でも500円単位でも集金合計は総額と一致する', () => {
    const ms = [weightMember('kanji', 1), weightMember('b', 1), weightMember('c', 1)];
    // raw 3333.33 → 100円単位なら 3300、不足 100 を負担者が上乗せ
    const r100 = split(10000, ms, 100, { type: 'coverShortfall', memberId: 'kanji' });
    expect(amounts(r100)).toEqual([3400, 3300, 3300]);
    expect(r100.collected).toBe(10000);
    // 500円単位なら 3000、不足 1000 を負担者が上乗せ
    const r500 = split(10000, ms, 500, { type: 'coverShortfall', memberId: 'kanji' });
    expect(amounts(r500)).toEqual([4000, 3000, 3000]);
    expect(r500.collected).toBe(10000);
  });

  it('固定額が総額を超える場合は負担者がマイナスになり警告する', () => {
    const r = split(30000, [fixedMember('boss', 40000), weightMember('kanji', 1)], 100, {
      type: 'coverShortfall',
      memberId: 'kanji',
    });
    expect(amounts(r)).toEqual([40000, -10000]);
    expect(r.warnings).toContain('kanji の支払額がマイナスになっています');
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

describe('2 つのモードの違い', () => {
  it('collectUp は全員切り上げで余りが出るが、coverShortfall は負担者が引き受けて総額ちょうどになる', () => {
    const ms = [weightMember('kanji', 1), weightMember('b', 1), weightMember('c', 1)];
    const up = split(11000, ms, 100, { type: 'collectUp' });
    const cover = split(11000, ms, 100, { type: 'coverShortfall', memberId: 'kanji' });
    // raw 3666.67 → 切り上げは 3700 ずつ集めて 100 円余る
    expect(amounts(up)).toEqual([3700, 3700, 3700]);
    expect(up.surplus).toBe(100);
    // 切り捨ては 3600 ずつ、不足 200 を負担者が上乗せ
    expect(amounts(cover)).toEqual([3800, 3600, 3600]);
    expect(cover.surplus).toBe(0);
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

  it('全員倍率0でも coverShortfall なら負担者が全額を引き受ける', () => {
    const r = split(10000, [weightMember('kanji', 0), weightMember('b', 0)], 100, {
      type: 'coverShortfall',
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
