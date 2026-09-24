import type { DraftPlan, KeyframeInput } from '../lib/review';

interface Props {
  draft: DraftPlan;
  onChange: (next: DraftPlan) => void;
}

export function KeyframeEditor({ draft, onChange }: Props) {
  const keyframes = draft.keyframes;

  function update(i: number, patch: Partial<KeyframeInput>) {
    const nextKeyframes = keyframes.map((kf, idx) =>
      idx === i ? { ...kf, ...patch } : kf,
    );
    onChange({ ...draft, keyframes: nextKeyframes });
  }

  function add() {
    if (keyframes.length >= 8) return;
    const last = keyframes[keyframes.length - 1];
    const t = last.time.trim() === '' ? '' : String(Number(last.time) + 60);
    onChange({
      ...draft,
      keyframes: [...keyframes, { time: t, ra: last?.ra ?? '0', dec: last?.dec ?? '0' }],
    });
  }

  function remove(i: number) {
    if (keyframes.length <= 2) return;
    onChange({
      ...draft,
      keyframes: keyframes.filter((_, idx) => idx !== i),
    });
  }

  return (
    <div className="editor">
      <table className="grid">
        <thead>
          <tr>
            <th className="col-idx">#</th>
            <th>时刻 t（秒）</th>
            <th>赤经 RA（度）</th>
            <th>赤纬 Dec（度）</th>
            <th className="col-act" aria-label="操作" />
          </tr>
        </thead>
        <tbody>
          {keyframes.map((kf, i) => (
            <tr key={i}>
              <td className="col-idx">{i + 1}</td>
              <td>
                <input
                  type="number"
                  step="any"
                  value={kf.time}
                  aria-label={`关键帧 ${i + 1} 时刻`}
                  onChange={(e) => update(i, { time: e.target.value })}
                />
              </td>
              <td>
                <input
                  type="number"
                  min="0"
                  max="360"
                  step="any"
                  value={kf.ra}
                  aria-label={`关键帧 ${i + 1} 赤经`}
                  onChange={(e) => update(i, { ra: e.target.value })}
                />
              </td>
              <td>
                <input
                  type="number"
                  min="-90"
                  max="90"
                  step="any"
                  value={kf.dec}
                  aria-label={`关键帧 ${i + 1} 赤纬`}
                  onChange={(e) => update(i, { dec: e.target.value })}
                />
              </td>
              <td className="col-act">
                <button
                  type="button"
                  className="small-btn danger"
                  disabled={keyframes.length <= 2}
                  onClick={() => remove(i)}
                >
                  删除
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row-actions">
        <button
          type="button"
          className="small-btn"
          disabled={keyframes.length >= 8}
          onClick={add}
        >
          + 增加关键帧
        </button>
        <span className="count">{keyframes.length} / 8</span>
      </div>
    </div>
  );
}
