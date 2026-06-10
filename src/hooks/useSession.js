import { useState, useEffect, useRef, useCallback } from 'react';
import { Accelerometer, Gyroscope } from 'expo-sensors';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { FSM, SP, STATE, PRESETS, haversineDistFt } from '../engine/fsm';

export function useSession(bikeType, customCfg) {
  const cfg        = customCfg ?? PRESETS[bikeType];
  const fsmRef     = useRef(null);
  const gpsRef     = useRef({ speed: null, coords: null, lastKnownSpeed: null });
  const accelSub   = useRef(null);
  const gyroSub    = useRef(null);
  const locSub     = useRef(null);
  const filtMagRef = useRef(1.0);
  const gyroMagRef = useRef(0);
  const takeoffRef = useRef(null);

  const [running,      setRunning]      = useState(false);
  const [jumps,        setJumps]        = useState([]);
  const [currentState, setCurrentState] = useState(STATE.GROUND);
  const [gForce,       setGForce]       = useState(1.0);
  const [speedMph,     setSpeedMph]     = useState(null);
  const [gpsStatus,    setGpsStatus]    = useState('idle'); // idle|acquiring|locked|denied
  const [liveAirtime,  setLiveAirtime]  = useState(null);  // seconds, while airborne
  const [lastJump,     setLastJump]     = useState(null);
  const [sampleHz,     setSampleHz]     = useState(0);

  const hzCountRef  = useRef(0);
  const hzTimerRef  = useRef(null);
  const airborneSince = useRef(null);
  const airtimerRef   = useRef(null);

  // ── Calibration state ──
  const [calMode,    setCalMode]    = useState(false);
  const [calEvents,  setCalEvents]  = useState([]);
  const calEventsRef = useRef([]);

  // ── Calculate distance ──────────────────────
  const calcDistance = useCallback((jump) => {
    const t       = takeoffRef.current;
    const landing = gpsRef.current;
    const speedMph = t?.speed ?? gpsRef.current.lastKnownSpeed;

    if (t?.coords && landing.coords) {
      const hav = haversineDistFt(
        t.coords.lat, t.coords.lon,
        landing.coords.lat, landing.coords.lon
      );
      if (hav > 40 && hav < (speedMph ?? 25) * 1.46667 * (jump.airtimeMs/1000) * 2.5) {
        return { distanceFt: Math.round(hav), distLabel: 'GPS DIST' };
      }
    }
    if (speedMph !== null) {
      const ft = Math.round(speedMph * 1.46667 * (jump.airtimeMs/1000) * cfg.arcFactor);
      return { distanceFt: ft, distLabel: 'EST DIST' };
    }
    const ft = Math.round(25 * 1.46667 * (jump.airtimeMs/1000) * cfg.arcFactor);
    return { distanceFt: ft, distLabel: '~ EST' };
  }, [cfg]);

  // ── FSM callbacks ───────────────────────────
  const onState = useCallback((s, prev) => {
    setCurrentState(s);
    if (s === STATE.AIR) {
      const snap = {
        speed:  gpsRef.current.speed ?? gpsRef.current.lastKnownSpeed,
        coords: gpsRef.current.coords ? { ...gpsRef.current.coords } : null,
      };
      takeoffRef.current = snap;
      airborneSince.current = Date.now();
      airtimerRef.current = setInterval(() => {
        setLiveAirtime(((Date.now() - airborneSince.current) / 1000));
      }, 50);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (s === STATE.LAND) {
      clearInterval(airtimerRef.current);
      airtimerRef.current = null;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }
    if (s === STATE.GROUND && prev === STATE.AIR) {
      // Auto-cancelled — reset
      clearInterval(airtimerRef.current);
      setLiveAirtime(null);
    }
  }, []);

  const onJump = useCallback((jump) => {
    setLiveAirtime(null);
    const { distanceFt, distLabel } = calcDistance(jump);
    const full = { ...jump, distanceFt, distLabel,
                   takeoffSpeedMph: takeoffRef.current?.speed ?? null };

    setLastJump(full);
    setJumps(prev => [full, ...prev]);

    if (calMode) {
      calEventsRef.current = [...calEventsRef.current, full];
      setCalEvents([...calEventsRef.current]);
    }
  }, [calcDistance, calMode]);

  // ── Start session ───────────────────────────
  const start = useCallback(async () => {
    const fsm = new FSM(
      { ...cfg },
      onJump,
      onState
    );
    fsmRef.current = fsm;
    filtMagRef.current = 1.0;

    // GPS
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setGpsStatus('denied');
    } else {
      setGpsStatus('acquiring');
      locSub.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 500, distanceInterval: 0 },
        pos => {
          const spd = pos.coords.speed != null && pos.coords.speed >= 0
            ? pos.coords.speed * 2.23694 : 0;
          gpsRef.current.speed  = spd;
          gpsRef.current.coords = { lat: pos.coords.latitude, lon: pos.coords.longitude };
          if (spd > 1) gpsRef.current.lastKnownSpeed = spd;
          setSpeedMph(spd);
          setGpsStatus('locked');
        }
      );
    }

    // Accelerometer — 100Hz
    Accelerometer.setUpdateInterval(10);
    accelSub.current = Accelerometer.addListener(({ x, y, z }) => {
      const rawMag = SP.toG(SP.mag(x * 9.81, y * 9.81, z * 9.81));
      filtMagRef.current = SP.lpf(rawMag, filtMagRef.current, 0.25);
      setGForce(filtMagRef.current);
      hzCountRef.current++;

      const spd = gpsRef.current.speed ?? gpsRef.current.lastKnownSpeed;
      fsmRef.current?.update(
        filtMagRef.current, rawMag, gyroMagRef.current,
        Date.now(), spd
      );
    });

    // Gyroscope — 100Hz
    Gyroscope.setUpdateInterval(10);
    gyroSub.current = Gyroscope.addListener(({ x, y, z }) => {
      gyroMagRef.current = SP.mag(x, y, z) * (180 / Math.PI);
    });

    // Hz counter
    hzTimerRef.current = setInterval(() => {
      setSampleHz(hzCountRef.current);
      hzCountRef.current = 0;
    }, 1000);

    setRunning(true);
  }, [cfg, onJump, onState]);

  // ── Stop session ────────────────────────────
  const stop = useCallback(() => {
    accelSub.current?.remove();
    gyroSub.current?.remove();
    locSub.current?.remove();
    clearInterval(hzTimerRef.current);
    clearInterval(airtimerRef.current);
    accelSub.current = null;
    gyroSub.current  = null;
    locSub.current   = null;
    gpsRef.current   = { speed: null, coords: null, lastKnownSpeed: null };
    setRunning(false);
    setGpsStatus('idle');
    setSpeedMph(null);
    setLiveAirtime(null);
  }, []);

  const clearSession = useCallback(() => {
    setJumps([]);
    setLastJump(null);
    setLiveAirtime(null);
    if (fsmRef.current) fsmRef.current._count = 0;
  }, []);

  // Cleanup on unmount
  useEffect(() => () => stop(), []);

  // ── Calibration ─────────────────────────────
  const startCalibration = useCallback(async (calCfg) => {
    calEventsRef.current = [];
    setCalEvents([]);
    setCalMode(true);
    // Start with permissive thresholds
    await start({ ...calCfg });
  }, [start]);

  const stopCalibration = useCallback(() => {
    stop();
    setCalMode(false);
    return [...calEventsRef.current];
  }, [stop]);

  return {
    // State
    running, jumps, currentState, gForce, speedMph, gpsStatus,
    liveAirtime, lastJump, sampleHz,
    // Actions
    start, stop, clearSession,
    // Calibration
    calMode, calEvents, startCalibration, stopCalibration,
  };
}
