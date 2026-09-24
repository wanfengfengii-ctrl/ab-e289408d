/**
 * 球面几何与单位向量换算。
 *
 * 角度输入以「度」为单位：赤经 RA ∈ [0, 360)（360 与 0 等价，归一化处理），
 * 赤纬 Dec ∈ [-90, 90]。换算在两极附近仍然稳定：x、y 中 cos(dec) 的公因子
 * 会在点积 / slerp 中消去，极轴方向上 sin(dec) = ±1 直接决定 z 分量。
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function norm(a: Vec3): number {
  return Math.hypot(a.x, a.y, a.z);
}

/** 将任意赤经（含 360°、负数）归一化到 [0, 360)。 */
export function wrapRA(deg: number): number {
  const m = deg % 360;
  return m < 0 ? m + 360 : m;
}

/** 赤道坐标（角度）→ 单位向量。 */
export function toUnitVector(raDeg: number, decDeg: number): Vec3 {
  const ra = wrapRA(raDeg) * DEG;
  const dec = decDeg * DEG;
  const cd = Math.cos(dec);
  return {
    x: cd * Math.cos(ra),
    y: cd * Math.sin(ra),
    z: Math.sin(dec),
  };
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

/**
 * 两单位向量夹角（度）。
 * 用 atan2(|a×b|, a·b) 而非 acos(dot)：角距接近 0 时 acos 会把点积
 * 末位误差按平方根放大，叉积直接保留分量差，小角距仍准确。
 */
export function angleBetween(a: Vec3, b: Vec3): number {
  const c = Math.min(1, Math.max(-1, dot(a, b)));
  const s = Math.min(1, Math.max(0, norm(cross(a, b))));
  return Math.atan2(s, c) * RAD;
}

/**
 * 单位大圆弧上的点：从 a 朝 b 走，f ∈ [0, 1] 为整段弧长的比例。
 * 仅在 a、b 不相同也不正反相对时调用。系数不除以 sin θ——输出会重新
 * 归一化，省去除法还能让近反向段（sin θ 很小）保持稳定。
 */
export function slerp(a: Vec3, b: Vec3, angleRad: number, f: number): Vec3 {
  const k1 = Math.sin((1 - f) * angleRad);
  const k2 = Math.sin(f * angleRad);
  const p = {
    x: k1 * a.x + k2 * b.x,
    y: k1 * a.y + k2 * b.y,
    z: k1 * a.z + k2 * b.z,
  };
  const n = Math.hypot(p.x, p.y, p.z);
  return { x: p.x / n, y: p.y / n, z: p.z / n };
}
