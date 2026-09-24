import type { ReviewOutcome } from '../lib/review';

interface Props {
  result: ReviewOutcome;
}

function fmt(x: number, digits = 4): string {
  if (!Number.isFinite(x)) return '—';
  return x.toFixed(digits).replace(/\.?0+$/, '');
}

export function ResultPanel({ result }: Props) {
  if (!result.ok) {
    return (
      <section className="card result-card">
        <h2>④ 审核结论</h2>
        <div className="verdict reject">
          <strong>不予放行：</strong>
          输入未通过校验，共 {result.issues.length} 项问题，修正后需重新提交审核。
        </div>
        <ul className="issue-list">
          {result.issues.map((iss, i) => (
            <li key={i} className="issue-item">
              <span className="issue-loc">
                {iss.segmentIndex !== null && `第 ${iss.segmentIndex} 段 · `}
                {iss.keyframeIndex !== null && `关键帧 ${iss.keyframeIndex} · `}
                {iss.bodyIndex !== null && `天体 ${iss.bodyIndex} · `}
              </span>
              {iss.message}
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section className="card result-card">
      <h2>④ 审核结论</h2>
      {result.executable ? (
        <div className="verdict pass">
          <strong>✓ 可执行</strong>
          <span>
            全部 {result.segments.length} 段最短大圆弧对所有禁入天体的真实最小角距均不小于
            禁入角 {fmt(result.exclusionAngle)}°，计划可以放行。
          </span>
        </div>
      ) : (
        <div className="verdict fail">
          <strong>✗ 不可执行</strong>
          <span>存在扫过禁入天体的转向段，计划不得放行。</span>
        </div>
      )}

      <h3 className="table-title">逐段最小角距（沿短弧连续求得）</h3>
      <div className="table-wrap">
        <table className="grid result-grid">
          <thead>
            <tr>
              <th>段</th>
              <th>关键帧</th>
              <th>时间区间（秒）</th>
              <th>短弧长度</th>
              <th>最小角距</th>
              <th>达到时刻（秒）</th>
              <th>对应天体</th>
              <th>结论</th>
            </tr>
          </thead>
          <tbody>
            {result.segments.map((seg) => (
              <tr key={seg.segmentIndex} className={seg.pass ? '' : 'row-fail'}>
                <td>{seg.segmentIndex}</td>
                <td>
                  {seg.fromKf} → {seg.toKf}
                </td>
                <td>
                  {fmt(seg.tStart)} ~ {fmt(seg.tEnd)}
                </td>
                <td>{fmt(seg.arcLengthDeg)}°</td>
                <td className="num">{fmt(seg.minAngle, 6)}°</td>
                <td className="num">{fmt(seg.minTime, 6)}</td>
                <td>
                  #{seg.bodyIndex} {seg.bodyName}
                </td>
                <td>{seg.pass ? '合格' : '越界'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {result.firstViolation && (
        <div className="witness">
          <h3>首个越界见证</h3>
          {(() => {
            const v = result.firstViolation!;
            return (
              <table className="kv">
                <tbody>
                  <tr>
                    <th>计划时刻</th>
                    <td>
                      t = <strong>{fmt(v.time, 6)}</strong> 秒
                      <span className="muted">
                        （第 {v.segmentIndex} 段，{fmt(v.tStart)} ~ {fmt(v.tEnd)} 秒，
                        弧参数 f = {fmt(v.tWitness, 6)}）
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <th>禁入天体</th>
                    <td>
                      #{v.bodyIndex} {v.bodyName}
                    </td>
                  </tr>
                  <tr>
                    <th>见证点角距</th>
                    <td>
                      {fmt(v.angle, 6)}°（禁入边界 ={' '}
                      {fmt(result.exclusionAngle)}°）
                    </td>
                  </tr>
                  <tr>
                    <th>该段最近点</th>
                    <td>
                      t = {fmt(v.minTime, 6)} 秒时角距仅 {fmt(v.minAngle, 6)}°
                    </td>
                  </tr>
                </tbody>
              </table>
            );
          })()}
          <p className="muted small">
            见证排序规则：先按计划时刻，时刻相同按段输入顺序，再相同按天体输入顺序。
          </p>
        </div>
      )}
    </section>
  );
}
