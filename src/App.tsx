import { useState } from 'react';
import type { DraftPlan, ReviewOutcome } from './lib/review';
import { reviewPlan } from './lib/review';
import { KeyframeEditor } from './components/KeyframeEditor';
import { BodyEditor } from './components/BodyEditor';
import { ResultPanel } from './components/ResultPanel';

const initialDraft: DraftPlan = {
  keyframes: [
    { time: '0', ra: '0', dec: '0' },
    { time: '60', ra: '0', dec: '40' },
    { time: '120', ra: '0', dec: '80' },
  ],
  exclusionAngle: '15',
  bodies: [
    { name: 'Sun', ra: '180', dec: '0' },
    { name: 'Moon', ra: '90', dec: '-30' },
  ],
};

export function App() {
  const [draft, setDraft] = useState<DraftPlan>(initialDraft);
  // result 仅在点击「提交审核」后生成；对草稿的任何修改都会立即撤下旧结论。
  const [result, setResult] = useState<ReviewOutcome | null>(null);

  function mutate(next: DraftPlan) {
    setDraft(next);
    setResult(null);
  }

  function handleReview() {
    setResult(reviewPlan(draft));
  }

  return (
    <div className="page">
      <header className="app-header">
        <h1>星敏感器标定转向 · 禁入区审核</h1>
        <p className="subtitle">
          对每条相邻关键帧之间的最短大圆弧做连续几何校核，解析求解视轴相对
          太阳 / 月球等禁入天体的真实最小角距——不是端点比较，也不是离散取样。
        </p>
      </header>

      <main className="layout">
        <section className="card">
          <h2>① 关键帧指向（2–8 个，时刻严格递增）</h2>
          <KeyframeEditor draft={draft} onChange={mutate} />
        </section>

        <section className="card">
          <h2>② 统一禁入角</h2>
          <label className="exclusion-row">
            视轴与任何禁入天体的角距不得小于
            <input
              type="number"
              min="0"
              step="any"
              value={draft.exclusionAngle}
              onChange={(e) =>
                mutate({ ...draft, exclusionAngle: e.target.value })
              }
              aria-label="统一禁入角（度）"
            />
            °（正数）
          </label>
        </section>

        <section className="card">
          <h2>③ 禁入天体（1–6 个，名称唯一）</h2>
          <BodyEditor draft={draft} onChange={mutate} />
        </section>

        <section className="card action-card">
          <button type="button" className="review-btn" onClick={handleReview}>
            提交审核
          </button>
          {result === null && (
            <span className="hint">
              尚未审核（或草稿在上次审核后已被修改，旧结论已撤下）。
            </span>
          )}
        </section>

        {result !== null && <ResultPanel result={result} />}
      </main>

      <footer className="app-footer">
        纯前端应用：全部计算在浏览器本地完成。赤经 [0°,360°]（360° 与 0°
        等价）、赤纬 [-90°,90°]，时刻单位为秒。
      </footer>
    </div>
  );
}
