// ── Signal Processing ──────────────────────────
export const SP = {
  mag:  (x, y, z) => Math.sqrt(x*x + y*y + z*z),
  toG:  (m)       => m / 9.81,
  lpf:  (v, prev, a) => prev + a * (v - prev),
};

// ── FSM States ─────────────────────────────────
export const STATE = { GROUND: 0, AIR: 1, LAND: 2 };

export class FSM {
  constructor(cfg, onJump, onState) {
    this.cfg     = { ...cfg };
    this.onJump  = onJump;
    this.onState = onState;
    this._s      = STATE.GROUND;
    this._t0     = null;
    this._peakG  = 0;
    this._peakW  = 0;
    this._minFiltMag = 999;
    this._fsSamples  = 0;
    this._filtGyro   = 0;
    this._count      = 0;
  }

  update(mag, rawMag, gyro, ts, speedMph) {
    this._filtGyro = SP.lpf(gyro, this._filtGyro, 0.2);

    switch (this._s) {
      case STATE.GROUND: {
        const minSpd = this.cfg.minSpeedMph || 5;
        const moving = speedMph !== null && speedMph >= minSpd;
        if (mag < this.cfg.ff && moving) {
          if (++this._fsSamples >= 4) {
            this._to(STATE.AIR, ts);
            this._t0 = ts; this._peakG = 0; this._peakW = 0; this._minFiltMag = 999;
          }
        } else {
          this._fsSamples = 0;
        }
        break;
      }
      case STATE.AIR: {
        if (gyro > this._peakW)              this._peakW = gyro;
        if (rawMag > this._peakG)            this._peakG = rawMag;
        if (mag < this._minFiltMag)          this._minFiltMag = mag;
        if (ts - this._t0 > 3000) {
          // Auto-cancel false positive
          this._t0 = null;
          this._to(STATE.GROUND, ts);
          this._fsSamples = 0;
          break;
        }
        if (rawMag > this.cfg.land) {
          this._to(STATE.LAND, ts);
          this._doLand(mag, ts);
        }
        break;
      }
      case STATE.LAND: {
        if (rawMag < 1.5) this._to(STATE.GROUND, ts);
        break;
      }
    }
    return this._s;
  }

  _to(s, ts) {
    const prev = this._s;
    this._s = s;
    if (prev !== s) this.onState(s, prev);
  }

  _doLand(filtG, ts) {
    const ms = ts - this._t0;
    if (ms < this.cfg.minMs) return;
    this._count++;
    const impactG = Math.min(8.0, parseFloat(filtG.toFixed(2)));
    this.onJump({
      id:          this._count,
      timestamp:   new Date(),
      airtimeMs:   Math.round(ms),
      impactG,
      peakW:       Math.round(this._peakW),
      minFiltMag:  this._minFiltMag,
    });
    this._t0 = null;
  }
}

// ── Default presets ────────────────────────────
export const PRESETS = {
  electric: { ff: 0.80, land: 1.5, minMs: 150, minSpeedMph: 5, arcFactor: 0.65 },
  gas:      { ff: 0.25, land: 2.0, minMs: 250, minSpeedMph: 5, arcFactor: 0.85 },
};

// ── Haversine distance (feet) ──────────────────
export function haversineDistFt(lat1, lon1, lat2, lon2) {
  const R    = 20902231;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a    = Math.sin(dLat/2)**2
             + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
