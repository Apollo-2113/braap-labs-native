import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  SafeAreaView, StatusBar, Dimensions, Animated, Alert, Modal,
} from 'react-native';
import Svg, {
  Path, G, Circle, Line, Text as SvgText, Defs,
  LinearGradient as SvgLinearGradient, Stop, Rect,
} from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSession } from '../hooks/useSession';
import { PRESETS } from '../engine/fsm';

const { width: W } = Dimensions.get('window');

// ── Theme ─────────────────────────────────────
const GOLDEN = {
  bg: '#0a0900', bg2: '#141008', bg3: '#1c160a',
  border: '#2e2408', border2: '#504010',
  chrome: '#c8960a', chromeDim: '#7a5808', chromeHi: '#f0c840',
  white: '#f0e0a0', whiteDim: '#907830',
  red: '#e84820', ice: '#f0a800', iceDim: '#805800',
  green: '#a8c820', needle: '#f0a800',
  btnCollar: '#241c08', btnCollarHi: 'rgba(240,200,80,0.25)',
  panelBg: '#0c0a04',
};
const SW = {
  bg: '#000a0f', bg2: '#001520', bg3: '#001d2a',
  border: '#003048', border2: '#005070',
  chrome: '#00b4d8', chromeDim: '#005a78', chromeHi: '#90e0ef',
  white: '#caf0f8', whiteDim: '#4a90a0',
  red: '#ff3030', ice: '#00d4ff', iceDim: '#005888',
  green: '#00ff88', needle: '#00d4ff',
  btnCollar: '#001520', btnCollarHi: 'rgba(0,180,240,0.2)',
  panelBg: '#040e18',
};

// ── Simulator ─────────────────────────────────
function useSim(onFrame) {
  const ref = useRef(null);
  const phase = useRef('ride');
  const phaseT = useRef(0);
  const nextPhase = useRef(1000);

  const start = () => {
    phase.current = 'ride'; phaseT.current = 0; nextPhase.current = 1000 + Math.random() * 600;
    ref.current = setInterval(() => {
      phaseT.current += 16;
      let ax = 0, ay = 0, az = 9.81, gx = 0;
      const p = phase.current;
      if (p === 'ride') {
        ax = (Math.random()-.5)*4; ay = (Math.random()-.5)*2; az = 9.81+(Math.random()-.5)*2;
        if (phaseT.current > nextPhase.current) { phase.current='air'; phaseT.current=0; nextPhase.current=350+Math.random()*550; }
      } else if (p === 'air') {
        ax=(Math.random()-.5)*.4; ay=(Math.random()-.5)*.4; az=1.1+(Math.random()-.5)*.25; gx=Math.random()*3;
        if (phaseT.current > nextPhase.current) { phase.current='impact'; phaseT.current=0; }
      } else if (p === 'impact') {
        const r = Math.max(0, 1-phaseT.current/80);
        az = (35+Math.random()*25)*r + 9.81*(1-r);
        if (phaseT.current > 100) { phase.current='settle'; phaseT.current=0; nextPhase.current=400+Math.random()*300; }
      } else {
        ax=(Math.random()-.5)*3; ay=(Math.random()-.5)*2; az=9.81+(Math.random()-.5)*2;
        if (phaseT.current > nextPhase.current) { phase.current='ride'; phaseT.current=0; nextPhase.current=800+Math.random()*700; }
      }
      onFrame({ ax, ay, az, gx: gx*60, ts: Date.now(), speed: 32 + Math.random()*10 });
    }, 16);
  };
  const stop = () => { clearInterval(ref.current); ref.current = null; };
  useEffect(() => () => stop(), []);
  return { start, stop, running: !!ref.current };
}

// ── Main Screen ────────────────────────────────
export default function MainScreen() {
  const [themeKey, setThemeKey] = useState('golden');
  const [bikeType, setBikeType] = useState('electric');
  const [customCfg, setCustomCfg] = useState(null);
  const [showCal, setShowCal] = useState(false);
  const T = themeKey === 'sw' ? SW : GOLDEN;

  const {
    running, jumps, gForce, speedMph, gpsStatus,
    liveAirtime, lastJump, sampleHz,
    start, stop, clearSession,
  } = useSession(bikeType, customCfg);

  // Simulator state
  const [simRunning, setSimRunning] = useState(false);
  const [simGForce, setSimGForce] = useState(1.0);
  const [simSpeed, setSimSpeed] = useState(null);
  const [simJumps, setSimJumps] = useState([]);
  const [simAir, setSimAir] = useState(null);
  const [simLastJump, setSimLastJump] = useState(null);
  const filtRef = useRef(1.0);
  const gyroRef = useRef(0);
  const fsmRef = useRef(null);
  const airRef = useRef(null);

  const flashAnim = useRef(new Animated.Value(0)).current;
  const prevLen = useRef(0);

  const activeRunning = running || simRunning;
  const activeJumps = running ? jumps : simJumps;
  const activeGForce = running ? gForce : simGForce;
  const activeSpeed = running ? speedMph : simSpeed;
  const activeAir = running ? liveAirtime : simAir;
  const activeLastJump = running ? lastJump : simLastJump;
  const activeGpsStatus = running ? gpsStatus : (simRunning ? 'locked' : 'idle');

  useEffect(() => {
    if (activeJumps.length > prevLen.current) {
      prevLen.current = activeJumps.length;
      Animated.sequence([
        Animated.timing(flashAnim, { toValue: 1, duration: 60, useNativeDriver: true }),
        Animated.timing(flashAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]).start();
    }
  }, [activeJumps.length]);

  useEffect(() => {
    AsyncStorage.getItem('braaplabs-cal').then(raw => {
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved[bikeType]) setCustomCfg(saved[bikeType]);
    });
  }, [bikeType]);

  // Simulator logic
  const SP = { mag: (x,y,z) => Math.sqrt(x*x+y*y+z*z), toG: m => m/9.81, lpf: (v,p,a) => p+a*(v-p) };
  const simFSMRef = useRef(null);
  const simTimerRef = useRef(null);
  const simPhase = useRef('ride');
  const simPhaseT = useRef(0);
  const simNextT = useRef(1000);
  const simT0 = useRef(null);
  const simPeakG = useRef(0);
  const simMinFilt = useRef(999);
  const simCount = useRef(0);
  const simFiltRef = useRef(1.0);
  const simAirTimerRef = useRef(null);

  const startSim = () => {
    simPhase.current = 'ride'; simPhaseT.current = 0; simNextT.current = 1000+Math.random()*600;
    simT0.current = null; simPeakG.current = 0; simMinFilt.current = 999; simCount.current = 0;
    simFiltRef.current = 1.0;
    setSimRunning(true); setSimJumps([]); setSimLastJump(null); setSimAir(null);
    prevLen.current = 0;

    simTimerRef.current = setInterval(() => {
      simPhaseT.current += 16;
      let ax=0, ay=0, az=9.81, gx=0;
      const p = simPhase.current;
      if (p==='ride') {
        ax=(Math.random()-.5)*4; ay=(Math.random()-.5)*2; az=9.81+(Math.random()-.5)*2;
        if(simPhaseT.current>simNextT.current){simPhase.current='air';simPhaseT.current=0;simNextT.current=350+Math.random()*550;}
      } else if (p==='air') {
        ax=(Math.random()-.5)*.4; az=1.1+(Math.random()-.5)*.25; gx=Math.random()*3;
        if(simPhaseT.current>simNextT.current){simPhase.current='impact';simPhaseT.current=0;}
      } else if (p==='impact') {
        const r=Math.max(0,1-simPhaseT.current/80); az=(35+Math.random()*25)*r+9.81*(1-r);
        if(simPhaseT.current>100){simPhase.current='settle';simPhaseT.current=0;simNextT.current=400+Math.random()*300;}
      } else {
        ax=(Math.random()-.5)*3; az=9.81+(Math.random()-.5)*2;
        if(simPhaseT.current>simNextT.current){simPhase.current='ride';simPhaseT.current=0;simNextT.current=800+Math.random()*700;}
      }
      const raw = SP.toG(SP.mag(ax*9.81, ay*9.81, az));
      simFiltRef.current = SP.lpf(raw, simFiltRef.current, 0.25);
      const filt = simFiltRef.current;
      const spd = 32 + Math.random()*10;
      setSimGForce(filt);
      setSimSpeed(spd);
      const cfg = customCfg ?? PRESETS[bikeType];

      // FSM
      if (p==='ride' && simT0.current===null) {
        // ready
      }
      if (filt < cfg.ff && simT0.current===null) {
        simT0.current = Date.now();
        simPeakG.current = 0; simMinFilt.current = 999;
        clearInterval(simAirTimerRef.current);
        simAirTimerRef.current = setInterval(() => {
          if(simT0.current) setSimAir((Date.now()-simT0.current)/1000);
        }, 50);
      }
      if (simT0.current !== null) {
        if(raw > simPeakG.current) simPeakG.current = raw;
        if(filt < simMinFilt.current) simMinFilt.current = filt;
        if (raw > cfg.land) {
          clearInterval(simAirTimerRef.current);
          setSimAir(null);
          const ms = Date.now() - simT0.current;
          if (ms >= cfg.minMs) {
            simCount.current++;
            const dist = Math.round(spd * 1.46667 * (ms/1000) * cfg.arcFactor);
            const jump = { id: simCount.current, airtimeMs: Math.round(ms),
              impactG: Math.min(8, parseFloat(filt.toFixed(2))),
              distanceFt: dist, minFilt: simMinFilt.current };
            setSimLastJump(jump);
            setSimJumps(prev => [jump, ...prev]);
          }
          simT0.current = null;
        }
        if (Date.now() - simT0.current > 3000) {
          clearInterval(simAirTimerRef.current); setSimAir(null); simT0.current = null;
        }
      }
    }, 16);
  };

  const stopSim = () => {
    clearInterval(simTimerRef.current); clearInterval(simAirTimerRef.current);
    simTimerRef.current = null; simT0.current = null;
    setSimRunning(false); setSimAir(null);
  };

  const handleStop = () => { if (running) stop(); if (simRunning) stopSim(); };
  const handleClear = () => {
    clearSession(); setSimJumps([]); setSimLastJump(null); setSimAir(null);
    simCount.current = 0; prevLen.current = 0;
  };

  const activeCfg = customCfg ?? PRESETS[bikeType];
  const bestJump = activeJumps.length ? activeJumps.reduce((a,b) => a.airtimeMs>b.airtimeMs?a:b) : null;
  const airDisplay = activeAir ?? (activeLastJump ? activeLastJump.airtimeMs/1000 : null);

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: T.bg }]}>
      <StatusBar barStyle="light-content" backgroundColor={T.bg} />
      <Animated.View pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: '#e84820', opacity: flashAnim, zIndex: 999 }]} />

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── HEADER ── */}
        <View style={[s.panel, { flexDirection:'row', justifyContent:'space-between', alignItems:'center',
          backgroundColor: T.bg2, borderColor: T.border2 }]}>
          <Text style={[s.logo, { color: T.chromeHi }]}>
            BRAAP <Text style={{ color: T.ice }}>LABS</Text>
          </Text>
          <TouchableOpacity onPress={() => setThemeKey(k => k==='golden'?'sw':'golden')}
            style={[s.themeBtn, { backgroundColor: T.bg3, borderColor: T.border2 }]}>
            <Text style={{ color: T.chrome, fontSize: 10, fontFamily:'monospace', letterSpacing: 1.5 }}>
              {themeKey === 'golden' ? '✦ SW MODE' : '☀ GOLDEN'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── STATUS BAR ── */}
        <View style={[s.panel, { flexDirection:'row', justifyContent:'space-between', alignItems:'center',
          backgroundColor: T.bg2, borderColor: T.border2 }]}>
          <View style={{ flexDirection:'row', gap: 5 }}>
            {[
              { lbl:'ACCEL', on: activeRunning },
              { lbl:'GYRO',  on: activeRunning },
              { lbl: activeRunning ? 'LIVE' : 'IDLE', on: activeRunning },
              { lbl: activeGpsStatus==='locked'?'GPS ●':'GPS', on: activeGpsStatus==='locked' },
            ].map(({ lbl, on }) => (
              <View key={lbl} style={[s.badge, { borderColor: on ? T.green : T.border }]}>
                <Text style={{ color: on ? T.green : T.chromeDim, fontSize: 8, fontFamily:'monospace', letterSpacing: 0.8 }}>{lbl}</Text>
              </View>
            ))}
          </View>
          {bestJump && (
            <View style={{ flexDirection:'row', alignItems:'center', gap: 3 }}>
              <Text style={{ fontSize: 11 }}>🏆</Text>
              <Text style={{ color: T.chromeDim, fontSize: 8, fontFamily:'monospace' }}> AIR </Text>
              <Text style={{ color: T.chromeHi, fontSize: 11, fontFamily:'monospace' }}>{(bestJump.airtimeMs/1000).toFixed(3)}s</Text>
              <Text style={{ color: T.chromeDim, fontSize: 8, fontFamily:'monospace' }}> · DST </Text>
              <Text style={{ color: T.chromeHi, fontSize: 11, fontFamily:'monospace' }}>{bestJump.distanceFt??'--'}↔</Text>
            </View>
          )}
        </View>

        {/* ── GAUGE ROW ── */}
        <View style={{ flexDirection:'row', gap: 10 }}>
          <GaugePanel T={T} value={activeGForce} />
          <SpeedPanel T={T} value={activeSpeed} status={activeGpsStatus} simRunning={simRunning} />
        </View>

        {/* ── NIXIE ROW ── */}
        <NixieRow T={T} airtime={airDisplay} distance={activeLastJump?.distanceFt??null}
          jumpCount={activeJumps.length} inFlight={activeAir!==null} />

        {/* ── BIKE TOGGLE ── */}
        <BikeToggle T={T} bikeType={bikeType} disabled={activeRunning}
          onSelect={type => { if(!activeRunning){ setBikeType(type); setCustomCfg(null); } }}
          calibrated={!!customCfg} activeCfg={activeCfg} />

        {/* ── CONTROLS ── */}
        <ControlPanel T={T}
          running={running} simRunning={simRunning}
          hasJumps={activeJumps.length > 0}
          onSensors={start}
          onSim={startSim}
          onStop={handleStop}
          onClear={() => Alert.alert('Clear Log','Clear all jump data?',[
            {text:'Cancel',style:'cancel'},
            {text:'Clear',style:'destructive',onPress:handleClear},
          ])}
          onExport={() => {
            if (!activeJumps.length) return;
            Alert.alert('Session Data',
              `${activeJumps.length} jumps\nBest: ${bestJump?(bestJump.airtimeMs/1000).toFixed(3)+'s':'—'}\n\nConnect Mac to export JSON file.`);
          }} />

        {/* ── JUMP LOG ── */}
        <JumpLog T={T} jumps={activeJumps} bestJump={bestJump} />

        {/* ── CALIBRATE ── */}
        <TouchableOpacity onPress={() => setShowCal(true)}
          style={[s.calTrigger, { borderColor: T.border2, backgroundColor: T.bg2 }]}>
          <View style={[s.calTriggerInner, { backgroundColor: T.panelBg }]}>
            <Text style={{ color: T.chromeDim, fontSize: 10, fontFamily:'monospace', letterSpacing: 2 }}>
              ⚙ CALIBRATE THRESHOLDS
            </Text>
          </View>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      <CalibrationModal visible={showCal} T={T} bikeType={bikeType}
        onSave={async (sel) => {
          if (!sel.length) return;
          const ff   = Math.min(0.95, parseFloat((sel.map(e=>e.minFilt??0.3).reduce((a,b)=>a+b,0)/sel.length*1.3).toFixed(2)));
          const land = Math.max(1.2,  parseFloat((Math.min(...sel.map(e=>e.impactG))*0.85).toFixed(2)));
          const minMs= Math.max(80,   Math.round(Math.min(...sel.map(e=>e.airtimeMs))*0.75));
          const newCfg = { ff, land, minMs, minSpeedMph:5, arcFactor: PRESETS[bikeType].arcFactor };
          const raw = await AsyncStorage.getItem('braaplabs-cal') || '{}';
          const saved = JSON.parse(raw); saved[bikeType] = newCfg;
          await AsyncStorage.setItem('braaplabs-cal', JSON.stringify(saved));
          setCustomCfg(newCfg); setShowCal(false);
          Alert.alert('✓ Calibrated', `ff:${ff}G · land:${land}G · min:${minMs}ms`);
        }}
        onCancel={() => setShowCal(false)} />
    </SafeAreaView>
  );
}

// ── G-Force Gauge ──────────────────────────────
function GaugePanel({ T, value = 1.0 }) {
  const clamped = Math.min(5, Math.max(0, value));
  const angle = (clamped / 5) * 180 - 90;
  const r = 62, cx = 80, cy = 82;
  const toXY = (deg) => {
    const rad = (deg - 90) * Math.PI / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };
  const nStart = toXY(angle);
  const needleColor = value > 3 ? T.red : value > 1.8 ? T.ice : T.green;

  return (
    <View style={[s.gaugeBox, { backgroundColor: T.bg2, borderColor: T.border2, flex: 1 }]}>
      <CornerAccents T={T} />
      <View style={[s.gaugeLabelBox, { backgroundColor: T.bg3, borderColor: T.border }]}>
        <Text style={{ color: T.chromeDim, fontSize: 9, fontFamily:'monospace', letterSpacing: 2 }}>G-FORCE</Text>
      </View>
      <Svg viewBox="0 0 160 96" width={148} height={88}>
        <Defs>
          <SvgLinearGradient id="dialBg" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#1c1600" />
            <Stop offset="1" stopColor="#060400" />
          </SvgLinearGradient>
        </Defs>
        <Path d="M 14 82 A 66 66 0 0 1 146 82" fill="url(#dialBg)" stroke={T.border2} strokeWidth="1.5"/>
        {/* Color arc zones */}
        <Path d="M 14 82 A 66 66 0 0 1 38 32" fill="none" stroke="#a8c820" strokeWidth="5" strokeLinecap="butt" opacity="0.9"/>
        <Path d="M 38 32 A 66 66 0 0 1 122 32" fill="none" stroke="#f0a800" strokeWidth="5" strokeLinecap="butt" opacity="0.9"/>
        <Path d="M 122 32 A 66 66 0 0 1 146 82" fill="none" stroke="#e84820" strokeWidth="5" strokeLinecap="butt" opacity="0.9"/>
        {/* Tick marks */}
        {[-90,-54,-18,18,54,90].map(a => {
          const inner = { x: cx + 52*Math.cos((a-90)*Math.PI/180), y: cy + 52*Math.sin((a-90)*Math.PI/180) };
          const outer = { x: cx + 64*Math.cos((a-90)*Math.PI/180), y: cy + 64*Math.sin((a-90)*Math.PI/180) };
          return <Line key={a} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y}
            stroke={T.chrome} strokeWidth="1.5" />;
        })}
        {/* Needle */}
        <G>
          <Path d={`M ${cx} ${cy} L ${cx-1.5} ${cy-4} L ${nStart.x} ${nStart.y} L ${cx+1.5} ${cy-4} Z`}
            fill={needleColor} opacity="0.9"/>
          <Circle cx={cx} cy={cy} r="7" fill={T.bg} stroke={T.chrome} strokeWidth="1.5"/>
          <Circle cx={cx} cy={cy} r="3" fill={needleColor}/>
        </G>
        {/* Readout box */}
        <Rect x="52" y="68" width="56" height="16" fill={T.bg} stroke={T.border2} strokeWidth="0.8" rx="2"/>
        <SvgText x={cx} y="80" textAnchor="middle" fontSize="9" fill={T.chromeHi}
          fontFamily="monospace">{value.toFixed(2)}G</SvgText>
      </Svg>
    </View>
  );
}

// ── Speed Panel ────────────────────────────────
function SpeedPanel({ T, value, status, simRunning }) {
  const mph = value !== null ? Math.round(value) : null;
  const pct = value ? Math.min(100, (value/80)*100) : 0;
  const barColor = pct > 62 ? T.red : pct > 31 ? T.ice : T.green;
  const isLive = status === 'locked' || simRunning;
  return (
    <View style={[s.gaugeBox, { backgroundColor: T.bg2, borderColor: T.border2, flex: 1 }]}>
      <CornerAccents T={T} />
      <View style={[s.gaugeLabelBox, { backgroundColor: T.bg3, borderColor: T.border }]}>
        <Text style={{ color: T.chromeDim, fontSize: 9, fontFamily:'monospace', letterSpacing: 2 }}>SPEED</Text>
      </View>
      <View style={{ flex: 1, alignItems:'center', justifyContent:'center', paddingTop: 4 }}>
        <View style={{ flexDirection:'row', alignItems:'flex-end', gap: 3 }}>
          <Text style={{ fontSize: 52, fontFamily:'monospace', lineHeight: 56,
            color: mph !== null ? T.ice : T.border2,
            textShadowColor: isLive ? T.ice : 'transparent', textShadowRadius: 10 }}>
            {mph !== null ? mph : '--'}
          </Text>
          <Text style={{ color: T.chromeDim, fontSize: 13, fontFamily:'monospace', paddingBottom: 8 }}>mph</Text>
        </View>
        {/* Speed bar */}
        <View style={{ width:'100%', height: 5, backgroundColor: T.border, borderRadius: 3, overflow:'hidden', marginTop: 4 }}>
          <View style={{ width:`${pct}%`, height:'100%', backgroundColor: barColor, borderRadius: 3 }}/>
        </View>
        {/* Scale */}
        <View style={{ flexDirection:'row', justifyContent:'space-between', width:'100%', marginTop: 2 }}>
          {[0,20,40,60,80].map(n => (
            <Text key={n} style={{ color: T.border2, fontSize: 7, fontFamily:'monospace' }}>{n}</Text>
          ))}
        </View>
        <Text style={{ color: isLive ? T.green : T.border2, fontSize: 9, fontFamily:'monospace', letterSpacing: 1, marginTop: 4 }}>
          {simRunning ? 'SIM' : status==='locked'?'GPS LIVE':status==='acquiring'?'GPS…':'GPS LIVE'}
        </Text>
      </View>
    </View>
  );
}

// ── Nixie Row ──────────────────────────────────
function NixieRow({ T, airtime, distance, jumpCount, inFlight }) {
  return (
    <View style={[s.nixieRow, { backgroundColor: T.bg2, borderColor: T.border2 }]}>
      <View style={s.nixiePanel}>
        <Text style={[s.nixieLabel, { color: T.chromeDim }]}>AIRTIME</Text>
        <Text style={[s.nixieVal, {
          color: T.ice,
          textShadowColor: T.ice, textShadowRadius: 12,
        }]}>
          {airtime !== null ? airtime.toFixed(3) : '0.000'}
          <Text style={{ fontSize: 16, color: T.iceDim, textShadowRadius: 0 }}>s</Text>
        </Text>
        <Text style={[s.nixieSub, { color: T.chromeDim }]}>
          {inFlight ? 'IN FLIGHT' : `SESSION — ${jumpCount} JUMP${jumpCount!==1?'S':''}`}
        </Text>
      </View>
      <View style={{ width:1, backgroundColor: T.border2, marginVertical: 10 }}/>
      <View style={s.nixiePanel}>
        <Text style={[s.nixieLabel, { color: T.chromeDim }]}>JUMP DISTANCE</Text>
        <Text style={[s.nixieVal, {
          color: '#f0e0a0',
          textShadowColor: '#f0e0a0', textShadowRadius: 10,
        }]}>
          {distance !== null ? distance : '--'}
          <Text style={{ fontSize: 14, color: T.chromeDim, textShadowRadius: 0 }}>rel</Text>
        </Text>
        <Text style={[s.nixieSub, { color: T.chromeDim }]}>
          {inFlight ? 'IN FLIGHT' : distance ? 'RELATIVE' : '~ EST'}
        </Text>
      </View>
    </View>
  );
}

// ── Bike Toggle ────────────────────────────────
function BikeToggle({ T, bikeType, disabled, onSelect, calibrated, activeCfg }) {
  return (
    <View>
      <View style={[s.bikePanel, { backgroundColor: T.bg2, borderColor: T.border2 }]}>
        {['electric','gas'].map(type => {
          const active = bikeType === type;
          return (
            <TouchableOpacity key={type} onPress={() => onSelect(type)}
              disabled={disabled} style={{ flex: 1, opacity: disabled ? 0.5 : 1 }}>
              <CockpitBtnInner
                T={T}
                active={active}
                pressed={active}
                lampColor={type==='electric' ? '#a8e040' : '#ffe060'}
                lampGlow={type==='electric' ? 'rgba(128,240,0,0.9)' : 'rgba(240,180,0,0.9)'}
                label={type.toUpperCase()}
                icon={type==='electric' ? '⚡' : '🔥'}
              />
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={{ color: T.chromeDim, fontSize: 9, fontFamily:'monospace',
        letterSpacing: 1, textAlign:'center', marginTop: 4 }}>
        {calibrated ? '⚙ CALIBRATED' : bikeType==='electric'?'⚡':'🔥'}
        {` · ff:${activeCfg.ff}G · land:${activeCfg.land}G · min:${activeCfg.minMs}ms`}
      </Text>
    </View>
  );
}

// ── Control Panel ──────────────────────────────
function ControlPanel({ T, running, simRunning, hasJumps, onSensors, onSim, onStop, onClear, onExport }) {
  const active = running || simRunning;
  return (
    <View style={[s.controlPanel, { backgroundColor: '#0c0a04', borderColor: '#2e2408' }]}>
      {/* Panel rivets */}
      <View style={[s.rivet, { top:6, left:6, backgroundColor: T.chromeHi }]}/>
      <View style={[s.rivet, { top:6, right:6, backgroundColor: T.chromeHi }]}/>
      <View style={s.btnGrid}>
        <CockpitBtn T={T} label="SENSORS ON" lampColor={T.green}
          lampGlow="rgba(128,240,0,0.9)" labelActive="#c8f060"
          active={running} disabled={active} onPress={onSensors} />
        <CockpitBtn T={T} label="SIMULATE" lampColor="#ffe080"
          lampGlow="rgba(240,180,0,0.9)" labelActive="#ffe080"
          active={simRunning} disabled={active} onPress={onSim} />
        <CockpitBtn T={T} label="STOP" lampColor={T.red}
          lampGlow="rgba(240,40,0,0.9)" labelActive="#ff8060"
          active={active} disabled={!active} onPress={onStop} />
        <CockpitBtn T={T} label="CLEAR LOG" lampColor={T.chromeHi}
          lampGlow="rgba(240,180,0,0.9)" labelActive="#f0c840"
          active={false} disabled={false} onPress={onClear} flash />
      </View>
      {/* Export — full width */}
      <View style={{ marginTop: 8 }}>
        <CockpitBtn T={T} label="EXPORT SESSION DATA" lampColor="#c0e8ff"
          lampGlow="rgba(80,160,240,0.9)" labelActive="#c0e8ff"
          active={hasJumps} disabled={!hasJumps} onPress={onExport} wide />
      </View>
    </View>
  );
}

// ── Cockpit Button ─────────────────────────────
function CockpitBtn({ T, label, lampColor, lampGlow, labelActive, active, disabled, onPress, wide, flash }) {
  const scale = useRef(new Animated.Value(1)).current;
  const pressDepth = useRef(new Animated.Value(0)).current;
  const [flashing, setFlashing] = useState(false);

  const handlePress = () => {
    Animated.parallel([
      Animated.sequence([
        Animated.timing(scale,      { toValue: 0.96, duration: 70,  useNativeDriver: true }),
        Animated.timing(scale,      { toValue: 1,    duration: 120, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.timing(pressDepth, { toValue: 1, duration: 70,  useNativeDriver: true }),
        Animated.timing(pressDepth, { toValue: 0, duration: 120, useNativeDriver: true }),
      ]),
    ]).start();
    if (flash) { setFlashing(true); setTimeout(() => setFlashing(false), 400); }
    onPress?.();
  };

  const isLit = active || flashing;
  const btnWidth = wide ? '100%' : (W - 24 - 8 - 24) / 2;

  return (
    <TouchableOpacity onPress={handlePress} disabled={disabled && !flash}
      style={[{ width: btnWidth }, disabled && !isLit && { opacity: 0.35 }]}>
      <Animated.View style={[s.btnOuter, {
        transform: [{ scale }, { translateY: pressDepth.interpolate({ inputRange:[0,1], outputRange:[0,3] }) }],
        backgroundColor: T.btnCollar,
        shadowColor: isLit ? lampColor : 'transparent',
        shadowRadius: isLit ? 8 : 0, shadowOpacity: isLit ? 0.4 : 0,
        elevation: isLit ? 4 : 1,
      }]}>
        {/* Bakelite nub */}
        <View style={[s.btnNub, { backgroundColor: '#0c0a02', borderColor: 'rgba(0,0,0,0.6)' }]}/>
        {/* Indicator lamp */}
        <View style={[s.btnLamp, {
          backgroundColor: isLit ? lampColor : '#0a0800',
          shadowColor: isLit ? lampGlow : 'transparent',
          shadowRadius: isLit ? 8 : 0, shadowOpacity: isLit ? 1 : 0,
        }]}/>
        {/* Label plate */}
        <Animated.View style={[s.btnInner, {
          backgroundColor: T.panelBg,
          paddingTop: pressDepth.interpolate({ inputRange:[0,1], outputRange:[12,15] }),
          paddingBottom: pressDepth.interpolate({ inputRange:[0,1], outputRange:[10,7] }),
        }]}>
          <Text style={{
            fontSize: 11, fontFamily:'monospace', letterSpacing: 2,
            textAlign:'center',
            color: isLit ? labelActive : '#2a2010',
            textShadowColor: isLit ? lampColor : 'transparent',
            textShadowRadius: isLit ? 6 : 0,
          }}>{label}</Text>
        </Animated.View>
      </Animated.View>
    </TouchableOpacity>
  );
}

// For bike toggle (pressed = selected state)
function CockpitBtnInner({ T, active, lampColor, lampGlow, label, icon }) {
  return (
    <View style={[s.btnOuter, {
      backgroundColor: T.btnCollar,
      transform: [{ translateY: active ? 3 : 0 }],
      shadowColor: active ? lampColor : 'transparent',
      shadowRadius: active ? 8 : 0, shadowOpacity: active ? 0.4 : 0,
    }]}>
      <View style={[s.btnNub, { backgroundColor: '#0c0a02' }]}/>
      <View style={[s.btnLamp, {
        backgroundColor: active ? lampColor : '#0a0800',
        shadowColor: active ? lampGlow : 'transparent',
        shadowRadius: active ? 8 : 0, shadowOpacity: active ? 1 : 0,
      }]}/>
      <View style={[s.btnInner, {
        backgroundColor: T.panelBg,
        flexDirection:'row', gap: 6,
      }]}>
        <Text style={{ fontSize: 14 }}>{icon}</Text>
        <Text style={{
          fontSize: 11, fontFamily:'monospace', letterSpacing: 2,
          color: active ? lampColor : '#2a2010',
          textShadowColor: active ? lampGlow : 'transparent',
          textShadowRadius: active ? 6 : 0,
        }}>{label}</Text>
      </View>
    </View>
  );
}

// ── Jump Log ───────────────────────────────────
function JumpLog({ T, jumps, bestJump }) {
  return (
    <View style={[s.logBox, { backgroundColor: T.bg2, borderColor: T.border2 }]}>
      <View style={[s.logHeader, { borderBottomColor: T.border }]}>
        <Text style={{ color: T.chromeDim, fontSize: 9, fontFamily:'monospace', letterSpacing: 2 }}>JUMP RECORD</Text>
        <Text style={{ color: T.border2,   fontSize: 9, fontFamily:'monospace' }}>{jumps.length} JUMPS</Text>
      </View>
      {!jumps.length && (
        <Text style={{ color: T.border2, textAlign:'center', padding: 24,
          fontSize: 10, fontFamily:'monospace', letterSpacing: 1 }}>
          AWAITING FIRST JUMP
        </Text>
      )}
      {jumps.map((j, i) => {
        const prev  = jumps[i+1];
        const isBest = bestJump && j.id===bestJump.id && jumps.length>1;
        const dAir  = prev ? ((j.airtimeMs-prev.airtimeMs)/prev.airtimeMs*100).toFixed(0) : null;
        return (
          <View key={j.id} style={[s.logRow, {
            borderBottomColor: T.border,
            backgroundColor: isBest ? T.bg3 : 'transparent' }]}>
            <View style={{ width: 48, gap: 2 }}>
              {isBest && <Text style={{ color: T.chrome, fontSize: 8, fontFamily:'monospace' }}>★</Text>}
              <Text style={{ color: T.border2, fontSize: 10, fontFamily:'monospace' }}>#{j.id}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: T.ice,    fontSize: 13, fontFamily:'monospace' }}>{(j.airtimeMs/1000).toFixed(3)}s</Text>
              <Text style={{ color: T.border2, fontSize: 8,  fontFamily:'monospace', letterSpacing: 1 }}>AIRTIME</Text>
              {dAir && <Text style={{ color: dAir>0?T.green:T.red, fontSize: 9, fontFamily:'monospace' }}>{dAir>0?'▲':'▼'}{Math.abs(dAir)}%</Text>}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#f0e0a0', fontSize: 13, fontFamily:'monospace' }}>{j.distanceFt??'--'}↔</Text>
              <Text style={{ color: T.border2, fontSize: 8,  fontFamily:'monospace', letterSpacing: 1 }}>RELATIVE</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: T.red,    fontSize: 13, fontFamily:'monospace' }}>{j.impactG.toFixed(1)}G</Text>
              <Text style={{ color: T.border2, fontSize: 8,  fontFamily:'monospace', letterSpacing: 1 }}>IMPACT</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ── Corner Accents (matching web app) ──────────
function CornerAccents({ T }) {
  const c = T.chromeDim;
  const w = 14, t = 1.5;
  return (
    <>
      {/* TL */}
      <View style={[s.corner, { top:6,left:6, borderTopWidth:t, borderLeftWidth:t, borderColor:c }]}/>
      {/* TR */}
      <View style={[s.corner, { top:6,right:6, borderTopWidth:t, borderRightWidth:t, borderColor:c }]}/>
    </>
  );
}

// ── Calibration Modal ──────────────────────────
function CalibrationModal({ visible, T, bikeType, onSave, onCancel }) {
  const [step,     setStep]     = useState('idle');
  const [events,   setEvents]   = useState([]);
  const [selected, setSelected] = useState({});

  useEffect(() => { if (!visible) { setStep('idle'); setEvents([]); setSelected({}); } }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={s.calOverlay}>
        <View style={[s.calPanel, { backgroundColor: T.bg2, borderColor: T.border2 }]}>
          <Text style={[s.calTitle, { color: T.chromeHi }]}>⚙ CALIBRATION MODE</Text>

          {step==='idle' && (<>
            <Text style={[s.calDesc, { color: T.chromeDim }]}>
              Ride your jumps normally. App records everything — including false positives.{'\n\n'}
              When done tap STOP and select which events were real jumps.
            </Text>
            <CalBtn T={T} label="START RECORDING" onPress={() => { setEvents([]); setSelected({}); setStep('recording'); }} primary />
            <CalBtn T={T} label="CANCEL" onPress={onCancel} />
          </>)}

          {step==='recording' && (<>
            <Text style={{ fontSize: 64, fontFamily:'monospace', textAlign:'center', color: T.ice, lineHeight: 72 }}>
              {events.length}
            </Text>
            <Text style={[s.calDesc, { color: T.chromeDim }]}>EVENTS CAPTURED{'\n'}● RECORDING</Text>
            <CalBtn T={T} label="STOP RECORDING" onPress={() => setStep('review')} primary />
            <CalBtn T={T} label="CANCEL" onPress={onCancel} />
          </>)}

          {step==='review' && (<>
            <Text style={[s.calDesc, { color: T.chromeDim }]}>Check which events were actual jumps. Uncheck false positives.</Text>
            <ScrollView style={[s.calList, { borderColor: T.border }]}>
              {!events.length && <Text style={{ color:T.border2, padding:16, textAlign:'center', fontSize:10, fontFamily:'monospace' }}>NO EVENTS DETECTED</Text>}
              {events.map(e => {
                const sel = selected[e.id] !== false;
                return (
                  <TouchableOpacity key={e.id} onPress={() => setSelected(s => ({...s,[e.id]:!sel}))}
                    style={[s.calRow, { borderBottomColor:T.border, backgroundColor:sel?T.bg3:'transparent' }]}>
                    <View style={[s.calCheck, { borderColor:sel?T.chromeHi:T.border2, backgroundColor:sel?T.chromeHi:T.bg }]}>
                      {sel && <Text style={{ fontSize:12, color:'#000', fontWeight:'bold' }}>✓</Text>}
                    </View>
                    <View style={{ flex:1 }}>
                      <Text style={{ color:T.chromeHi, fontSize:12, fontFamily:'monospace' }}>{(e.airtimeMs/1000).toFixed(3)}s</Text>
                      <Text style={{ color:T.chromeDim, fontSize:9, fontFamily:'monospace' }}>{e.impactG.toFixed(1)}G · {e.distanceFt?e.distanceFt+'ft':''}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <CalBtn T={T} label="SAVE CALIBRATION" onPress={() => onSave(events.filter(e=>selected[e.id]!==false))} primary />
            <CalBtn T={T} label="CANCEL" onPress={onCancel} />
          </>)}
        </View>
      </View>
    </Modal>
  );
}

function CalBtn({ T, label, onPress, primary }) {
  return (
    <TouchableOpacity onPress={onPress}
      style={[s.calBtn, { borderColor: primary ? T.border2 : T.border,
        backgroundColor: primary ? T.bg3 : 'transparent' }]}>
      <Text style={{ color: primary ? T.chromeHi : T.chromeDim,
        fontSize:11, fontFamily:'monospace', letterSpacing:2 }}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Styles ─────────────────────────────────────
const s = StyleSheet.create({
  safe:         { flex: 1 },
  scroll:       { padding: 12, gap: 10 },
  panel:        { borderRadius: 6, borderWidth: 1, padding: 12 },
  logo:         { fontSize: 22, fontWeight:'700', letterSpacing: 4, fontFamily:'monospace' },
  themeBtn:     { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, borderWidth: 1 },
  badge:        { borderWidth: 1, borderRadius: 3, paddingHorizontal: 5, paddingVertical: 2 },

  // Gauges
  gaugeBox:     { borderRadius: 6, borderWidth: 1, padding: 10, alignItems:'center', position:'relative', minHeight: 140 },
  gaugeLabelBox:{ borderRadius: 2, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 2, marginBottom: 4 },
  corner:       { position:'absolute', width: 14, height: 14, borderRadius: 0, opacity: 0.7 },

  // Nixie
  nixieRow:     { flexDirection:'row', borderRadius: 6, borderWidth: 1, overflow:'hidden' },
  nixiePanel:   { flex: 1, padding: 14 },
  nixieLabel:   { fontSize: 8, fontFamily:'monospace', letterSpacing: 2, marginBottom: 4 },
  nixieVal:     { fontSize: 44, fontFamily:'monospace', lineHeight: 48,
                  textShadowOffset: { width: 0, height: 0 } },
  nixieSub:     { fontSize: 9, fontFamily:'monospace', letterSpacing: 1, marginTop: 4 },

  // Bike toggle
  bikePanel:    { flexDirection:'row', gap: 8, padding: 8, borderRadius: 4, borderWidth: 2 },

  // Control panel
  controlPanel: { padding: 14, borderRadius: 4, borderWidth: 2, position:'relative', gap: 0 },
  btnGrid:      { flexDirection:'row', flexWrap:'wrap', gap: 8 },
  rivet:        { position:'absolute', width: 8, height: 8, borderRadius: 4,
                  opacity: 0.8 },

  // Cockpit button
  btnOuter:     { borderRadius: 3, borderWidth: 1,
                  borderTopColor: 'rgba(240,200,80,0.20)',
                  borderLeftColor: 'rgba(240,200,80,0.10)',
                  borderRightColor: 'rgba(0,0,0,0.5)',
                  borderBottomColor: 'rgba(0,0,0,0.7)',
                  position:'relative',
                  shadowOffset: { width: 0, height: 4 },
                  shadowColor: '#060400', shadowOpacity: 1, shadowRadius: 0,
                  elevation: 4,
                },
  btnNub:       { position:'absolute', top: -1, alignSelf:'center',
                  width:'50%', height: 8, borderRadius: 2,
                  zIndex: 2, borderWidth: 1 },
  btnLamp:      { position:'absolute', top: 5, right: 6,
                  width: 6, height: 6, borderRadius: 3, zIndex: 3,
                  shadowOffset: { width: 0, height: 0 } },
  btnInner:     { margin: 3, marginTop: 14, paddingHorizontal: 8,
                  borderRadius: 2, alignItems:'center', justifyContent:'center' },

  // Jump log
  logBox:       { borderRadius: 6, borderWidth: 1, overflow:'hidden' },
  logHeader:    { flexDirection:'row', justifyContent:'space-between',
                  padding: 10, paddingHorizontal: 14, borderBottomWidth: 1 },
  logRow:       { flexDirection:'row', padding: 10, paddingHorizontal: 14,
                  borderBottomWidth: 1, alignItems:'center', gap: 6 },

  // Calibrate trigger
  calTrigger:   { borderRadius: 3, borderWidth: 1, overflow:'hidden', marginTop: 2 },
  calTriggerInner: { padding: 14, alignItems:'center' },

  // Modal
  calOverlay:   { flex:1, backgroundColor:'rgba(0,0,0,0.85)', justifyContent:'center', padding:20 },
  calPanel:     { borderRadius:6, borderWidth:2, padding:24, gap:10 },
  calTitle:     { fontSize:14, fontFamily:'monospace', letterSpacing:3, textAlign:'center' },
  calDesc:      { fontSize:10, fontFamily:'monospace', lineHeight:18, letterSpacing:1, textAlign:'center' },
  calList:      { maxHeight:200, borderWidth:1, borderRadius:3 },
  calRow:       { flexDirection:'row', alignItems:'center', gap:12, padding:12, borderBottomWidth:1 },
  calCheck:     { width:20, height:20, borderRadius:2, borderWidth:1, alignItems:'center', justifyContent:'center' },
  calBtn:       { padding:14, borderRadius:3, borderWidth:1, alignItems:'center' },
});
