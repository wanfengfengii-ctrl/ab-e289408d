/**
 * 标定转向计划审核引擎。
 *
 * 审核内容：
 *  1. 录入校验：2–8 个严格递增时刻的关键帧、正的统一禁入角、1–6 个唯一禁入天体，
 *     赤经 / 赤纬越界、重名、时刻非递增、相邻指向相同或正反相对（无唯一最短大圆）
 *     均拒绝。
 *  2. 逐段分析：对每条相邻关键帧之间的最短大圆弧，解析地求出与每个天体方向的
 *     真实最小角距（闭式解 + 端点比较），而非端点比较或离散取样。
 */

import {
  angleBetween,
  dot,
  slerp,
  toUnitVector,
  Vec3,
  DEG,
  RAD,
} from './geometry';

export interface KeyframeInput {
  time: string; // 时刻（秒），字符串形式录入
  ra: string; // 赤经（度）
  dec: string; // 赤纬（度）
}

export interface BodyInput {
  name: string;
  ra: string;
  dec: string;
}

export interface DraftPlan {
  keyframes: KeyframeInput[];
  exclusionAngle: string; // 统一禁入角（度）
  bodies: BodyInput[];
}

export type IssueCode =
  | 'KEYFRAME_COUNT'
  | 'BODY_COUNT'
  | 'EXCLUSION_ANGLE'
  | 'TIME'
  | 'TIME_ORDER'
  | 'RA'
  | 'DEC'
  | 'POINTING_DUPLICATE'
  | 'POINTING_ANTIPODAL'
  | 'BODY_NAME'
  | 'BODY_DUPLICATE_NAME';

export interface Issue {
  code: IssueCode;
  /** 关键帧序号（从 1 起）；与关键帧无关的问题为 null。 */
  keyframeIndex: number | null;
  /** 相邻段的首端点序号（从 1 起）；非段问题为 null。 */
  segmentIndex: number | null;
  /** 天体序号（从 1 起）；非天体问题为 null。 */
  bodyIndex: number | null;
  message: string;
}

export interface SegmentResult {
  segmentIndex: number; // 从 1 起
  fromKf: number; // 从 1 起
  toKf: number;
  tStart: number;
  tEnd: number;
  /** 本段对所有天体的最小角距（度）。 */
  minAngle: number;
  /** 达到最小角距的计划时刻（秒）。 */
  minTime: number;
  /** 达到最小角距的天体输入序号（从 1 起）。 */
  bodyIndex: number;
  bodyName: string;
  /** 短弧长度（度），便于操作员核对轨迹。 */
  arcLengthDeg: number;
  pass: boolean;
}

export interface Violation {
  time: number; // 首个越界见证的计划时刻（排序主依据）
  segmentIndex: number;
  bodyIndex: number;
  bodyName: string;
  angle: number; // 见证点角距（度），恰在禁入角边界上
  /** 该段相对该天体达到的真实最小角距（度），供操作员评估余量。 */
  minAngle: number;
  minTime: number;
  tStart: number;
  tEnd: number;
  tWitness: number; // 见证点弧参数（0..1）
  tStar: number; // 最近点弧参数（0..1）
}

export interface ReviewResult {
  ok: true;
  exclusionAngle: number;
  segments: SegmentResult[];
  executable: boolean;
  firstViolation: Violation | null;
}

export type ReviewOutcome =
  | { ok: false; issues: Issue[] }
  | ReviewResult;

const EPS = 1e-12;

function parseNumber(raw: string): number {
  const s = raw.trim();
  if (s === '') return NaN;
  return Number(s);
}

/** 审核整份草稿；输入不合法时返回全部可定位问题，不给出任何结论。 */
export function reviewPlan(draft: DraftPlan): ReviewOutcome {
  const issues: Issue[] = [];

  // ---- 禁入角 ----
  const exclusion = parseNumber(draft.exclusionAngle);
  if (!Number.isFinite(exclusion) || exclusion <= 0) {
    issues.push({
      code: 'EXCLUSION_ANGLE',
      keyframeIndex: null,
      segmentIndex: null,
      bodyIndex: null,
      message: '统一禁入角必须是正数（度）。',
    });
  } else if (exclusion > 180) {
    issues.push({
      code: 'EXCLUSION_ANGLE',
      keyframeIndex: null,
      segmentIndex: null,
      bodyIndex: null,
      message: '统一禁入角不能超过 180°。',
    });
  }

  // ---- 关键帧 ----
  const kfCount = draft.keyframes.length;
  if (kfCount < 2 || kfCount > 8) {
    issues.push({
      code: 'KEYFRAME_COUNT',
      keyframeIndex: null,
      segmentIndex: null,
      bodyIndex: null,
      message: `关键帧数量必须在 2 至 8 个之间，当前 ${kfCount} 个。`,
    });
  }

  const times: number[] = new Array(kfCount);
  const vectors: Vec3[] = new Array(kfCount);

  draft.keyframes.forEach((kf, i) => {
    const oneBased = i + 1;
    const t = parseNumber(kf.time);
    const ra = parseNumber(kf.ra);
    const dec = parseNumber(kf.dec);

    if (!Number.isFinite(t) || t < 0) {
      issues.push({
        code: 'TIME',
        keyframeIndex: oneBased,
        segmentIndex: null,
        bodyIndex: null,
        message: `关键帧 ${oneBased} 的时刻必须是非负有限数值。`,
      });
    } else {
      times[i] = t;
    }

    if (!Number.isFinite(ra) || ra < 0 || ra > 360) {
      issues.push({
        code: 'RA',
        keyframeIndex: oneBased,
        segmentIndex: null,
        bodyIndex: null,
        message: `关键帧 ${oneBased} 的赤经必须在 [0°, 360°] 内（360° 与 0° 等价）。`,
      });
    }

    if (!Number.isFinite(dec) || dec < -90 || dec > 90) {
      issues.push({
        code: 'DEC',
        keyframeIndex: oneBased,
        segmentIndex: null,
        bodyIndex: null,
        message: `关键帧 ${oneBased} 的赤纬必须在 [-90°, 90°] 内。`,
      });
    }

    if (
      Number.isFinite(ra) &&
      ra >= 0 &&
      ra <= 360 &&
      Number.isFinite(dec) &&
      dec >= -90 &&
      dec <= 90
    ) {
      vectors[i] = toUnitVector(ra, dec);
    }
  });

  // 严格递增时刻
  if (issues.every((x) => x.code !== 'TIME' && x.code !== 'KEYFRAME_COUNT')) {
    for (let i = 1; i < kfCount; i++) {
      if (!(times[i] > times[i - 1])) {
        issues.push({
          code: 'TIME_ORDER',
          keyframeIndex: i + 1,
          segmentIndex: i,
          bodyIndex: null,
          message: `关键帧 ${i + 1} 的时刻必须严格大于关键帧 ${i}。`,
        });
      }
    }
  }

  // 相邻指向：相同 / 正反相对
  if (issues.every((x) => x.code !== 'RA' && x.code !== 'DEC' && x.code !== 'KEYFRAME_COUNT')) {
    for (let i = 1; i < kfCount; i++) {
      const d = dot(vectors[i - 1], vectors[i]);
      if (d >= 1 - 1e-9) {
        issues.push({
          code: 'POINTING_DUPLICATE',
          keyframeIndex: null,
          segmentIndex: i,
          bodyIndex: null,
          message: `第 ${i} 段相邻关键帧指向相同，没有转向轨迹。`,
        });
      } else if (d <= -1 + 1e-9) {
        issues.push({
          code: 'POINTING_ANTIPODAL',
          keyframeIndex: null,
          segmentIndex: i,
          bodyIndex: null,
          message: `第 ${i} 段相邻关键帧指向恰好相反，存在无数条等长大圆弧，最短路径不唯一。`,
        });
      }
    }
  }

  // ---- 禁入天体 ----
  const bodyCount = draft.bodies.length;
  if (bodyCount < 1 || bodyCount > 6) {
    issues.push({
      code: 'BODY_COUNT',
      keyframeIndex: null,
      segmentIndex: null,
      bodyIndex: null,
      message: `禁入天体数量必须在 1 至 6 个之间，当前 ${bodyCount} 个。`,
    });
  }

  const seenNames = new Set<string>();
  const bodyVecs: Vec3[] = new Array(bodyCount);
  const bodyNames: string[] = new Array(bodyCount);

  draft.bodies.forEach((body, j) => {
    const oneBased = j + 1;
    const name = body.name.trim();
    const ra = parseNumber(body.ra);
    const dec = parseNumber(body.dec);

    if (name === '') {
      issues.push({
        code: 'BODY_NAME',
        keyframeIndex: null,
        segmentIndex: null,
        bodyIndex: oneBased,
        message: `天体 ${oneBased} 必须填写名称。`,
      });
    } else if (seenNames.has(name)) {
      issues.push({
        code: 'BODY_DUPLICATE_NAME',
        keyframeIndex: null,
        segmentIndex: null,
        bodyIndex: oneBased,
        message: `天体名称「${name}」重复，名称必须唯一。`,
      });
    } else {
      seenNames.add(name);
    }
    bodyNames[j] = name;

    if (!Number.isFinite(ra) || ra < 0 || ra > 360) {
      issues.push({
        code: 'RA',
        keyframeIndex: null,
        segmentIndex: null,
        bodyIndex: oneBased,
        message: `天体「${name || oneBased}」的赤经必须在 [0°, 360°] 内。`,
      });
    }
    if (!Number.isFinite(dec) || dec < -90 || dec > 90) {
      issues.push({
        code: 'DEC',
        keyframeIndex: null,
        segmentIndex: null,
        bodyIndex: oneBased,
        message: `天体「${name || oneBased}」的赤纬必须在 [-90°, 90°] 内。`,
      });
    }
    if (
      Number.isFinite(ra) &&
      ra >= 0 &&
      ra <= 360 &&
      Number.isFinite(dec) &&
      dec >= -90 &&
      dec <= 90
    ) {
      bodyVecs[j] = toUnitVector(ra, dec);
    }
  });

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  // ---- 逐段沿短弧求真实最小角距 ----
  const segments: SegmentResult[] = [];
  const violations: Violation[] = [];

  for (let i = 1; i < kfCount; i++) {
    const a = vectors[i - 1];
    const b = vectors[i];
    const cosTheta = Math.min(1, Math.max(-1, dot(a, b)));
    const theta = Math.acos(cosTheta); // 短弧圆心角 (0, π)
    const tStart = times[i - 1];
    const tEnd = times[i];

    let segMin = Infinity;
    let segFStar = 0;
    let segBody = -1;

    for (let j = 0; j < bodyCount; j++) {
      const { minAngle, fStar } = minAngleOnShortArc(a, b, theta, bodyVecs[j]);
      if (minAngle < segMin - EPS) {
        segMin = minAngle;
        segFStar = fStar;
        segBody = j;
      }
      // 同一天体不会出现并列；段内并列时保留输入顺序靠前的天体（不更新即可）。

      if (minAngle < exclusion - 1e-9) {
        // 真实最小角距已越界，求轨迹首次进入禁入锥的见证点（解析边界方程）。
        const entry = firstEntryOnShortArc(a, b, theta, bodyVecs[j], exclusion * DEG);
        const fWitness = entry ?? fStar;
        violations.push({
          time: tStart + fWitness * (tEnd - tStart),
          segmentIndex: i,
          bodyIndex: j + 1,
          bodyName: bodyNames[j],
          angle: entry === null ? minAngle : exclusion,
          minAngle,
          minTime: tStart + fStar * (tEnd - tStart),
          tStart,
          tEnd,
          tWitness: fWitness,
          tStar: fStar,
        });
      }
    }

    segments.push({
      segmentIndex: i,
      fromKf: i,
      toKf: i + 1,
      tStart,
      tEnd,
      minAngle: segMin,
      minTime: tStart + segFStar * (tEnd - tStart),
      bodyIndex: segBody + 1,
      bodyName: bodyNames[segBody],
      arcLengthDeg: theta * RAD,
      pass: segMin >= exclusion - 1e-9,
    });
  }

  // 首个越界见证：时间优先，其次段输入顺序，再次天体输入顺序。
  violations.sort((v1, v2) => {
    if (Math.abs(v1.time - v2.time) > EPS) return v1.time - v2.time;
    if (v1.segmentIndex !== v2.segmentIndex)
      return v1.segmentIndex - v2.segmentIndex;
    return v1.bodyIndex - v2.bodyIndex;
  });
  const firstViolation = violations[0] ?? null;

  return {
    ok: true,
    exclusionAngle: exclusion,
    segments,
    executable: firstViolation === null,
    firstViolation,
  };
}

/**
 * 求禁入天体方向 u 与短弧 p(f) = (sin((1-f)θ) a + sin(f θ) b) / sin θ
 * 之间的真实最小角距，f ∈ [0,1]。
 *
 * 点积是弧参数的连续函数 D(f) = α cos(fθ) + β sin(fθ)，最近点要么出现在
 * 弧内驻点（D 取最大值，即角距最小），要么出现在端点；解析比较三者，
 * 不做任何离散取样。
 */
export function minAngleOnShortArc(
  a: Vec3,
  b: Vec3,
  thetaRad: number,
  u: Vec3,
): { minAngle: number; fStar: number } {
  const ua = dot(u, a);
  const ub = dot(u, b);
  const s = Math.sin(thetaRad);
  const c = Math.cos(thetaRad);

  // D(f) = α cos(fθ) + β sin(fθ)
  const alpha = ua;
  const beta = (ub - ua * c) / s;

  // 候选：两个端点
  let bestDot = Math.max(ua, ub);
  let fStar = ua >= ub ? 0 : 1;

  // 驻点 f0 = atan2(β, α) / θ；D 在该点取极大值 √(α²+β²)
  const amp2 = alpha * alpha + beta * beta;
  if (amp2 <= 1 + 1e-12) {
    const f0 = Math.atan2(beta, alpha) / thetaRad;
    if (f0 >= -EPS && f0 <= 1 + EPS) {
      const fc = Math.min(1, Math.max(0, f0));
      const dInterior = Math.sqrt(Math.max(0, Math.min(1, amp2)));
      if (dInterior > bestDot + EPS) {
        bestDot = dInterior;
        fStar = fc;
      }
    }
  }

  // 在胜出的候选点处直接取角距：端点用原向量，弧内点用 slerp，
  // 再由 atan2(|×|,·) 计算，保证天体几乎在弧上时小角距仍然准确。
  const closest =
    fStar === 0 ? a : fStar === 1 ? b : slerp(a, b, thetaRad, fStar);
  const minAngle = angleBetween(closest, u);
  return { minAngle, fStar };
}

/**
 * 已知短弧会侵入禁入锥（与 u 的最小角距 < exclusionRad），求轨迹沿时间方向
 * 「首次」到达角距 = exclusionRad 边界的弧参数 f ∈ [0,1]。
 *
 * 边界方程（φ = fθ）：
 *   α cos φ + β sin φ = cos ρ
 * 写成 R cos(φ - δ) = cos ρ，R = √(α²+β²)，δ = atan2(β, α)。
 * φ 在 [0, θ] 内单调递增，取最小的合格解；若起点已在锥内则 f = 0。
 * 解不出边界（理论上不会，因为已确认侵入）时返回 null，回退到最近点。
 */
export function firstEntryOnShortArc(
  a: Vec3,
  b: Vec3,
  thetaRad: number,
  u: Vec3,
  exclusionRad: number,
): number | null {
  const ua = dot(u, a);
  if (ua >= Math.cos(exclusionRad) - 1e-10) {
    return 0; // 段起点已在禁入锥内/边界上
  }

  const ub = dot(u, b);
  const s = Math.sin(thetaRad);
  const c = Math.cos(thetaRad);
  const alpha = ua;
  const beta = (ub - ua * c) / s;

  const R = Math.hypot(alpha, beta);
  const target = Math.cos(exclusionRad);
  if (R < target - 1e-10) return null; // 整条弧都在锥内深处且不触边界——数值异常

  const delta = Math.atan2(beta, alpha);
  const gamma = Math.acos(Math.min(1, Math.max(-1, target / R)));

  const candidates = [delta - gamma, delta + gamma];
  let best: number | null = null;
  for (const phi of candidates) {
    const f = phi / thetaRad;
    if (f >= -EPS && f <= 1 + EPS) {
      const fc = Math.min(1, Math.max(0, f));
      if (best === null || fc < best) best = fc;
    }
  }
  return best;
}

/** 供结果页 / 调试使用：按弧参数取短弧上的单位指向。 */
export function pointOnSegment(
  a: Vec3,
  b: Vec3,
  thetaRad: number,
  f: number,
): Vec3 {
  return slerp(a, b, thetaRad, f);
}

export { toUnitVector, angleBetween, DEG };
