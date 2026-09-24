import type { BodyInput, DraftPlan } from '../lib/review';

interface Props {
  draft: DraftPlan;
  onChange: (next: DraftPlan) => void;
}

export function BodyEditor({ draft, onChange }: Props) {
  const bodies = draft.bodies;

  function update(i: number, patch: Partial<BodyInput>) {
    const nextBodies = bodies.map((b, idx) =>
      idx === i ? { ...b, ...patch } : b,
    );
    onChange({ ...draft, bodies: nextBodies });
  }

  function add() {
    if (bodies.length >= 6) return;
    onChange({
      ...draft,
      bodies: [...bodies, { name: '', ra: '0', dec: '0' }],
    });
  }

  function remove(i: number) {
    if (bodies.length <= 1) return;
    onChange({ ...draft, bodies: bodies.filter((_, idx) => idx !== i) });
  }

  return (
    <div className="editor">
      <table className="grid">
        <thead>
          <tr>
            <th className="col-idx">#</th>
            <th>天体名称</th>
            <th>赤经 RA（度）</th>
            <th>赤纬 Dec（度）</th>
            <th className="col-act" aria-label="操作" />
          </tr>
        </thead>
        <tbody>
          {bodies.map((b, i) => (
            <tr key={i}>
              <td className="col-idx">{i + 1}</td>
              <td>
                <input
                  type="text"
                  value={b.name}
                  placeholder="如 Sun / Moon"
                  aria-label={`天体 ${i + 1} 名称`}
                  onChange={(e) => update(i, { name: e.target.value })}
                />
              </td>
              <td>
                <input
                  type="number"
                  min="0"
                  max="360"
                  step="any"
                  value={b.ra}
                  aria-label={`天体 ${i + 1} 赤经`}
                  onChange={(e) => update(i, { ra: e.target.value })}
                />
              </td>
              <td>
                <input
                  type="number"
                  min="-90"
                  max="90"
                  step="any"
                  value={b.dec}
                  aria-label={`天体 ${i + 1} 赤纬`}
                  onChange={(e) => update(i, { dec: e.target.value })}
                />
              </td>
              <td className="col-act">
                <button
                  type="button"
                  className="small-btn danger"
                  disabled={bodies.length <= 1}
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
          disabled={bodies.length >= 6}
          onClick={add}
        >
          + 增加禁入天体
        </button>
        <span className="count">{bodies.length} / 6</span>
      </div>
    </div>
  );
}
