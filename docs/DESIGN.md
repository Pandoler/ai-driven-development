# 割り勘アプリ 設計書

## 1. アーキテクチャ

- **React 18 + Vite + TypeScript** の SPA（静的サイト）
- 状態管理は React の `useState` / `useReducer` のみ（外部ライブラリ不要の規模）
- 計算ロジックは **UI から分離した純粋関数** として実装し、単体テストを書く（Vitest）

```
src/
├── main.tsx              # エントリポイント
├── App.tsx               # 画面全体のレイアウトと状態保持
├── components/
│   ├── TotalInput.tsx    # 合計金額入力
│   ├── MemberList.tsx    # メンバー一覧
│   ├── MemberRow.tsx     # メンバー1行（名前・役割・倍率/固定額）
│   ├── RoundingOptions.tsx # 丸め単位・差額処理の選択
│   └── ResultView.tsx    # 結果表示・テキストコピー
├── lib/
│   ├── split.ts          # 割り勘計算ロジック（純粋関数）
│   ├── split.test.ts     # 計算ロジックの単体テスト
│   └── presets.ts        # 役割プリセット定義
└── types.ts              # 型定義
```

## 2. データモデル

```typescript
/** メンバーの支払い方法 */
type PaymentMode =
  | { type: 'weight'; weight: number }   // 倍率按分（均等割りは全員 weight=1）
  | { type: 'fixed'; amount: number };   // 金額直接指定

interface Member {
  id: string;
  name: string;
  mode: PaymentMode;
  rolePreset?: RoleKey; // 表示用。選択すると weight に推奨倍率が入る
}

type RoundingUnit = 1 | 10 | 100 | 500;

/** 丸め差額の処理方法 */
type RemainderPolicy =
  | { type: 'absorb'; memberId: string } // 指定メンバーが差額を吸収
  | { type: 'collectUp' };               // 全員切り上げ、余りを表示

interface SplitInput {
  total: number;
  members: Member[];
  roundingUnit: RoundingUnit;
  remainderPolicy: RemainderPolicy;
}

interface SplitResult {
  payments: { memberId: string; amount: number }[];
  collected: number;   // 集金合計
  surplus: number;     // 集金合計 − 総額（collectUp 時の余り、absorb 時は 0）
  warnings: string[];  // 固定額超過などの注意
}
```

### 役割プリセット（`presets.ts`）

```typescript
const ROLE_PRESETS = [
  { key: 'boss',    label: '上司・目上',  weight: 1.5 },
  { key: 'senior',  label: '先輩',        weight: 1.2 },
  { key: 'peer',    label: '同僚',        weight: 1.0 },
  { key: 'junior',  label: '後輩',        weight: 0.8 },
  { key: 'student', label: '学生・新人',  weight: 0.5 },
  { key: 'kanji',   label: '幹事（無料）', weight: 0 },
] as const;
```

## 3. 計算アルゴリズム（`split.ts`）

```
1. 固定額メンバーの合計 fixedSum を求める
2. 残額 remaining = total − fixedSum
3. 倍率メンバーの weight 合計 weightSum を求める
4. 各倍率メンバーの理論値 raw = remaining × (weight / weightSum)
5. 丸め:
   - absorb 方式: raw を丸め単位で四捨五入 → 合計と総額の差を吸収メンバーに加減算
   - collectUp 方式: raw を丸め単位で切り上げ → 集金合計 − 総額を surplus として表示
6. 検証・警告:
   - fixedSum > total → 「固定額が総額を超えています」（残額 0、倍率メンバーは 0 円）
   - weightSum = 0 かつ remaining > 0 → 「残額を負担するメンバーがいません」
   - 吸収メンバーの支払額が負になる場合 → 警告表示（計算はそのまま提示）
```

- 金額は**整数円**で扱う（浮動小数点の誤差を最終結果に持ち込まない。丸め前の按分のみ実数計算し、丸め時に整数化）
- 丸め処理は「各人を丸めてから差額を 1 か所に寄せる」方式のため、**必ず集金合計が検算可能**

## 4. UI 設計（スマホファースト・1 画面）

```
┌─────────────────────────┐
│ 💰 合計金額 [  30,000 ] 円      │
├─────────────────────────┤
│ 👥 メンバー          [＋追加]   │
│ ┌─────────────────────┐ │
│ │ 田中  [上司▼] 倍率 1.5      │ │
│ │ 佐藤  [同僚▼] 倍率 1.0      │ │
│ │ 鈴木  [固定▼] 金額 5,000 円  │ │
│ └─────────────────────┘ │
├─────────────────────────┤
│ ⚙ 丸め [100円▼]  差額 [幹事が吸収▼] │
├─────────────────────────┤
│ 📋 結果                        │
│  田中: 15,000 円 (1.5x)         │
│  佐藤: 10,000 円 (1.0x)         │
│  鈴木:  5,000 円 (固定)         │
│  合計: 30,000 円 / 総額ピッタリ  │
│           [結果をコピー]        │
└─────────────────────────┘
```

- 入力のたびに結果をリアルタイム再計算（「計算」ボタンなし）
- メンバー行の役割セレクトは「プリセット or 固定額 or カスタム倍率」を切り替えるドロップダウン
- 「結果をコピー」は LINE 貼り付けを想定したプレーンテキストを生成

## 5. テスト方針

- `split.ts` に対する Vitest 単体テストを必須とする
  - 均等割り／傾斜割り／固定額混在／丸め各単位／absorb・collectUp 両方式
  - エッジケース: 固定額超過、weightSum=0、メンバー 1 人、総額 0、吸収者が負額
- UI は手動確認を基本とし、必要になったらコンポーネントテストを追加

## 6. デプロイ

- `vite build` の成果物を GitHub Pages に配置（`base` パス設定に注意）
- CI は任意（GitHub Actions で build + test を回す場合は後続タスクで追加）
