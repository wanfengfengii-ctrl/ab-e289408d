import { describe, it, expect } from 'vitest';
import {
  toUnitVector,
  angleBetween,
  wrapRA,
  slerp,
  type Vec3,
} from './geometry';
import {
  reviewPlan,
  minAngleOnShortArc,
  firstEntryOnShortArc,
  DraftPlan,
} from './review';

const DEG = Math.PI / 180;

function approx(x: number, y: number, tol = 1e-7) {
  return Math.abs(x - y) <= tol;
}

function kf(time: number, ra: number, dec: number) {
  return { time: String(time), ra: String(ra), dec: String(dec) };
}
function body(name: string, ra: number, dec: number) {
  return { name, ra: String(ra), dec: String(dec) };
}

function draft(
  keyframes: ReturnType<typeof kf>[],
  bodies: ReturnType<typeof body>[],
  exclusionAngle = 20,
): DraftPlan {
  return {
    keyframes,
    exclusionAngle: String(exclusionAngle),
    bodies,
  };
}

describe('geometry', () => {
  it('赤经环绕与基本换算', () => {
    expect(wrapRA(360)).toBe(0);
    expect(wrapRA(-90)).toBe(270);
    expect(wrapRA(725)).toBe(5);

    const v = toUnitVector(0, 0);
    expect(approx(v.x, 1)).toBe(true);
    expect(approx(v.y, 0)).toBe(true);
    expect(approx(v.z, 0)).toBe(true);

    const v2 = toUnitVector(360, 0);
    expect(approx(angleBetween(v, v2), 0)).toBe(true);
  });

  it('两极附近指向稳定', () => {
    const north = toUnitVector(45, 90);
    expect(approx(north.x, 0, 1e-12)).toBe(true);
    expect(approx(north.y, 0, 1e-12)).toBe(true);
    expect(approx(north.z, 1, 1e-12)).toBe(true);

    const south = toUnitVector(200, -90);
    expect(approx(south.z, -1, 1e-12)).toBe(true);
    expect(approx(angleBetween(north, south), 180)).toBe(true);
  });

  it('slerp 沿短弧插值且保持单位长度', () => {
    const a = toUnitVector(0, 0);
    const b = toUnitVector(90, 0);
    const theta = 90 * DEG;
    const m = slerp(a, b, theta, 0.5);
    expect(approx(angleBetween(m, toUnitVector(45, 0)), 0, 1e-9)).toBe(true);
    expect(approx(Math.hypot(m.x, m.y, m.z), 1, 1e-12)).toBe(true);
  });
});

describe('minAngleOnShortArc', () => {
  it('弧内最近点为解析极值，而非端点（天体在弧中部）', () => {
    const a = toUnitVector(0, 0);
    const b = toUnitVector(90, 0);
    const theta = 90 * DEG;
    const u = toUnitVector(45, 0);
    const r = minAngleOnShortArc(a, b, theta, u);
    expect(approx(r.minAngle, 0, 1e-8)).toBe(true);
    expect(approx(r.fStar, 0.5, 1e-8)).toBe(true);
  });

  it('赤经跨越 0° 的短弧正确取最近点', () => {
    const a = toUnitVector(350, 0);
    const b = toUnitVector(10, 0);
    const theta = angleBetween(a, b) * DEG;
    const u = toUnitVector(0, 0);
    const r = minAngleOnShortArc(a, b, theta, u);
    expect(approx(r.minAngle, 0, 1e-8)).toBe(true);
    expect(approx(r.fStar, 0.5, 1e-6)).toBe(true);
  });

  it('北极附近短弧：中点贴近天极', () => {
    // (0°,89°) → (180°,89°) 最短弧跨越北极，长约 2°
    const a = toUnitVector(0, 89);
    const b = toUnitVector(180, 89);
    const theta = Math.acos(Math.min(1, Math.max(-1, a.x * b.x + a.y * b.y + a.z * b.z)));
    expect(approx(theta / DEG, 2, 1e-6)).toBe(true);
    const u = toUnitVector(90, 90);
    const r = minAngleOnShortArc(a, b, theta, u);
    expect(r.minAngle).toBeLessThan(1 + 1e-6); // 最近点几乎擦过北极
    expect(approx(r.fStar, 0.5, 1e-6)).toBe(true);
  });

  it('最近点落在端点时正确返回', () => {
    const a = toUnitVector(0, 0);
    const b = toUnitVector(90, 0);
    const theta = 90 * DEG;
    const u = toUnitVector(350, 0); // 位于起点外侧
    const r = minAngleOnShortArc(a, b, theta, u);
    expect(approx(r.fStar, 0, 1e-9)).toBe(true);
    expect(approx(r.minAngle, 10, 1e-8)).toBe(true);
  });

  it('驻点在弧外时不误判为弧内最近', () => {
    const a = toUnitVector(0, 30);
    const b = toUnitVector(0, 60);
    const theta = 30 * DEG;
    const u = toUnitVector(180, 45); // 最近驻点在「另一方向」，短弧上最近应为端点
    const r = minAngleOnShortArc(a, b, theta, u);
    const endMin = Math.min(angleBetween(u, a), angleBetween(u, b));
    expect(approx(r.minAngle, endMin, 1e-9)).toBe(true);
    expect(r.fStar === 0 || r.fStar === 1).toBe(true);
  });
});

describe('reviewPlan 输入拒绝', () => {
  it('关键帧数量越界', () => {
    const one = draft([kf(0, 0, 0)], [body('Sun', 100, 0)]);
    const r1 = reviewPlan(one);
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.issues.some((i) => i.code === 'KEYFRAME_COUNT')).toBe(true);

    const many = draft(
      Array.from({ length: 9 }, (_, i) => kf(i, i * 10, 0)),
      [body('Sun', 100, 0)],
    );
    const r2 = reviewPlan(many);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.issues.some((i) => i.code === 'KEYFRAME_COUNT')).toBe(true);
  });

  it('天体数量越界', () => {
    const r = reviewPlan(draft([kf(0, 0, 0), kf(1, 30, 0)], []));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.some((i) => i.code === 'BODY_COUNT')).toBe(true);
  });

  it('禁入角必须为正', () => {
    for (const bad of ['0', '-5', 'abc', '']) {
      const r = reviewPlan({
        ...draft([kf(0, 0, 0), kf(1, 30, 0)], [body('Sun', 100, 0)]),
        exclusionAngle: bad,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.issues.some((i) => i.code === 'EXCLUSION_ANGLE')).toBe(true);
    }
  });

  it('赤经赤纬越界', () => {
    const r = reviewPlan(
      draft([kf(0, 361, 0), kf(1, 0, 91)], [body('Sun', -1, -91)]),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues.filter((i) => i.code === 'RA').length).toBe(2);
      expect(r.issues.filter((i) => i.code === 'DEC').length).toBe(2);
    }
  });

  it('时刻非严格递增', () => {
    const r = reviewPlan(
      draft([kf(0, 0, 0), kf(1, 30, 0), kf(1, 60, 0)], [body('Sun', 200, 0)]),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const issue = r.issues.find((i) => i.code === 'TIME_ORDER');
      expect(issue?.keyframeIndex).toBe(3);
      expect(issue?.segmentIndex).toBe(2);
    }
  });

  it('相邻指向相同（赤经 0°/360° 等价表示）', () => {
    const r = reviewPlan(
      draft([kf(0, 0, 20), kf(1, 360, 20)], [body('Sun', 200, 0)]),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.some((i) => i.code === 'POINTING_DUPLICATE')).toBe(true);
  });

  it('相邻指向相同（坐标完全一致）', () => {
    const r = reviewPlan(
      draft([kf(0, 10, 20), kf(1, 10, 20)], [body('Sun', 200, 0)]),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.some((i) => i.code === 'POINTING_DUPLICATE')).toBe(true);
  });

  it('相邻指向正反相对（最短路径不唯一）', () => {
    const r = reviewPlan(
      draft([kf(0, 0, 0), kf(1, 180, 0)], [body('Sun', 90, 0)]),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.some((i) => i.code === 'POINTING_ANTIPODAL')).toBe(true);
  });

  it('天体重名被拒绝（忽略首尾空白）', () => {
    const r = reviewPlan(
      draft(
        [kf(0, 0, 0), kf(1, 30, 0)],
        [body('Sun', 100, 0), body(' Sun ', 200, 0)],
      ),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues.some((i) => i.code === 'BODY_DUPLICATE_NAME')).toBe(true);
    }
  });

  it('空名称被拒绝', () => {
    const r = reviewPlan(
      draft([kf(0, 0, 0), kf(1, 30, 0)], [body('  ', 100, 0)]),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.some((i) => i.code === 'BODY_NAME')).toBe(true);
  });
});

describe('reviewPlan 审核结论', () => {
  it('全程远离天体时判定可执行并逐段给出最小角距与时刻', () => {
    const r = reviewPlan(
      draft(
        [kf(0, 0, 0), kf(10, 30, 0), kf(20, 60, 0)],
        [body('Sun', 200, 0)],
        10,
      ),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.executable).toBe(true);
      expect(r.firstViolation).toBeNull();
      expect(r.segments.length).toBe(2);
      // 第一段 0°→30° 沿赤道远离 RA=200°，最近点为起点（角距 160°）
      expect(approx(r.segments[0].minAngle, 160, 1e-8)).toBe(true);
      expect(approx(r.segments[0].minTime, 0, 1e-9)).toBe(true);
      expect(r.segments[0].bodyName).toBe('Sun');
    }
  });

  it('弧中部擦过天体时判定违规，并给首次入场见证时刻（解析而非取样）', () => {
    // 赤道上 0°→90°，天体在 45°；禁入角 30°。
    // 沿赤道入场点 = 45° - 30° = 15°，即 f = 1/6，t = 0 + (60-0)/6 = 10。
    const r = reviewPlan(
      draft(
        [kf(0, 0, 0), kf(60, 90, 0)],
        [body('Sun', 45, 0)],
        30,
      ),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.executable).toBe(false);
      expect(r.segments[0].minAngle).toBeLessThan(1e-6);
      expect(approx(r.segments[0].minTime, 30, 1e-6)).toBe(true);
      const v = r.firstViolation!;
      expect(v).not.toBeNull();
      expect(approx(v.time, 10, 1e-6)).toBe(true);
      expect(approx(v.angle, 30, 1e-7)).toBe(true); // 见证点恰在边界
      expect(v.bodyName).toBe('Sun');
      expect(v.segmentIndex).toBe(1);
    }
  });

  it('首个越界见证按时间排序（后段更早侵入也能正确挑出）', () => {
    // 两段：第一段中点 45° 离 Sun(45°) 为 0；但先构造第二段更早的入场时刻
    const r = reviewPlan(
      draft(
        [kf(100, 0, 0), kf(200, 90, 0), kf(300, 180, 0)],
        [body('Sun', 45, 0), body('Moon', 135, 0)],
        30,
      ),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.executable).toBe(false);
      // 第一段入场 t = 100 + 100/6 ≈ 116.67；第二段入场 t = 200 + 100/6 ≈ 216.67
      const v = r.firstViolation!;
      expect(approx(v.time, 100 + 100 / 6, 1e-6)).toBe(true);
      expect(v.segmentIndex).toBe(1);
      expect(v.bodyIndex).toBe(1);
    }
  });

  it('同一时刻多天体违规时按天体输入顺序打破并列', () => {
    const r = reviewPlan(
      draft(
        [kf(0, 0, 0), kf(60, 90, 0)],
        [body('Moon', 45, 0), body('Sun', 45, 0)],
        30,
      ),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      const v = r.firstViolation!;
      // 两个天体同位置、入场时刻相同（t = 10）；应报输入顺序在前的 Moon
      expect(approx(v.time, 10, 1e-6)).toBe(true);
      expect(v.bodyName).toBe('Moon');
      expect(v.bodyIndex).toBe(1);
    }
  });

  it('起点已在禁入锥内时见证点为段起点', () => {
    const r = reviewPlan(
      draft([kf(5, 0, 0), kf(15, 30, 0)], [body('Sun', 5, 0)], 20),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.executable).toBe(false);
      expect(approx(r.firstViolation!.time, 5, 1e-9)).toBe(true);
      expect(r.firstViolation!.tWitness).toBe(0);
    }
  });
});

describe('解析解与密集取样的随机对照', () => {
  // 简单可复现的伪随机
  let seed = 20260924;
  function rand() {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  }
  function randVec(): Vec3 {
    // 均匀分布在球面上
    const z = 2 * rand() - 1;
    const lam = 2 * Math.PI * rand();
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    return { x: r * Math.cos(lam), y: r * Math.sin(lam), z };
  }

  function randomPair(): { a: Vec3; b: Vec3; theta: number } {
    const a = randVec();
    let b = randVec();
    let cosT = dot3(a, b);
    let guard = 0;
    // 避开相同 / 正反相对
    while (Math.abs(cosT) > 0.9999 && guard++ < 20) {
      b = randVec();
      cosT = dot3(a, b);
    }
    return { a, b, theta: Math.acos(Math.min(1, Math.max(-1, cosT))) };
  }
  function dot3(p: Vec3, q: Vec3) {
    return p.x * q.x + p.y * q.y + p.z * q.z;
  }

  it('随机短弧上的任意内点作为天体：解析最小角距为 0 且还原弧参数', () => {
    for (let trial = 0; trial < 200; trial++) {
      const { a, b, theta } = randomPair();
      const f0 = 0.05 + rand() * 0.9;
      const u = slerp(a, b, theta, f0);

      const r = minAngleOnShortArc(a, b, theta, u);
      expect(r.minAngle).toBeLessThan(1e-7);
      expect(Math.abs(r.fStar - f0)).toBeLessThan(1e-7);

      // u 恰在弧上：边界点与最近点的弧长差恰为禁入角 ρ
      const rho = 5 * DEG + rand() * 40 * DEG;
      if (rho < theta && f0 - rho / theta >= 0) {
        const fEntry = firstEntryOnShortArc(a, b, theta, u, rho);
        expect(Math.abs(fEntry! - (f0 - rho / theta))).toBeLessThan(1e-8);
      }
    }
  });

  it('随机天体方向：解析最小角距与 20000 点密集取样结果吻合', () => {
    for (let trial = 0; trial < 300; trial++) {
      const { a, b, theta } = randomPair();
      const u = randVec();
      const analytic = minAngleOnShortArc(a, b, theta, u);

      let sampled = Infinity;
      for (let k = 0; k <= 20000; k++) {
        const p = slerp(a, b, theta, k / 20000);
        const d = angleBetween(p, u);
        if (d < sampled) sampled = d;
      }
      // 取样只是弧点的有限子集，其最小值只会 ≥ 解析真值
      expect(analytic.minAngle).toBeLessThanOrEqual(sampled + 1e-6);
      expect(Math.abs(analytic.minAngle - sampled)).toBeLessThan(1e-3);
    }
  });
});

describe('firstEntryOnShortArc', () => {  it('赤道弧对正中天体的入场参数', () => {
    const a = toUnitVector(0, 0);
    const b = toUnitVector(90, 0);
    const f = firstEntryOnShortArc(a, b, 90 * DEG, toUnitVector(45, 0), 30 * DEG);
    expect(approx(f!, (45 - 30) / 90, 1e-9)).toBe(true);
  });

  it('起点在锥外但弧不侵入时不应被调用；弧全程在锥内返回 0', () => {
    const a = toUnitVector(44, 0); // 距 45° 仅 1°
    const b = toUnitVector(46, 0);
    const f = firstEntryOnShortArc(a, b, 2 * DEG, toUnitVector(45, 0), 30 * DEG);
    expect(f).toBe(0);
  });
});
