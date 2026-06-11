import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  SafeAreaView, StatusBar, Dimensions, Animated, Alert,
} from 'react-native';
// expo-keep-awake removed for SDK 54 compat
import * as FileSystem from 'expo-file-system';
// expo-sharing removed for SDK 54 compat — export shows alert instead
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSession } from '../hooks/useSession';
import { PRESETS } from '../engine/fsm';
import { GOLDEN, SW } from '../theme/colors';
import GaugeG from './GaugeG';
import SpeedDisplay from './SpeedDisplay';
import NixieRow from './NixieRow';
import Waveform from './Waveform';
import JumpLog from './JumpLog';
import CalibrationModal from './CalibrationModal';

const { width } = Dimensions.get('window');

export default function MainScreen() {
  const [theme,    setTheme]    = useState('golden');
  const [bikeType, setBikeType] = useState('electric');
  const [customCfg, setCustomCfg] = useState(null);
  const [showCal,   setShowCal]  = useState(false);
  const T = theme === 'sw' ? SW : GOLDEN;

  const {
    running, jumps, currentState, gForce, speedMph, gpsStatus,
    liveAirtime, lastJump, sampleHz,
    start, stop, clearSession,
    calMode, calEvents, startCalibration, stopCalibration,
  } = useSession(bikeType, customCfg);

  const flashAnim = useRef(new Animated.Value(0)).current;

  // KeepAwake removed for SDK 54 compat

  // Flash on landing
  const prevJumpsLen = useRef(0);
  useEffect(() => {
    if (jumps.length > prevJumpsLen.current) {
      prevJumpsLen.current = jumps.length;
      Animated.sequence([
        Animated.timing(flashAnim, { toValue: 1, duration: 60,  useNativeDriver: true }),
        Animated.timing(flashAnim, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start();
    }
  }, [jumps.length]);

  // Load calibration from storage
  useEffect(() => {
    AsyncStorage.getItem('braaplabs-cal').then(raw => {
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved[bikeType]) setCustomCfg(saved[bikeType]);
    });
  }, [bikeType]);

  const handleBikeType = (type) => {
    if (running) return;
    setBikeType(type);
    setCustomCfg(null); // will reload from storage
  };

  const handleExport = async () => {
    if (!jumps.length) { Alert.alert('No jumps to export'); return; }
    const payload = {
      exportedAt: new Date().toISOString(),
      bikeType,
      settings: customCfg ?? PRESETS[bikeType],
      sessionSummary: {
        totalJumps:   jumps.length,
        bestAirtime:  Math.max(...jumps.map(j => j.airtimeMs)) / 1000,
        avgAirtime:   (jumps.reduce((a,j) => a+j.airtimeMs,0)/jumps.length/1000).toFixed(3),
        avgImpact:    (jumps.reduce((a,j) => a+j.impactG,0)/jumps.length).toFixed(2),
      },
      jumps: [...jumps].reverse().map(j => ({
        id: j.id, airtimeSec: (j.airtimeMs/1000).toFixed(3),
        airtimeMs: j.airtimeMs, impactG: j.impactG,
        takeoffSpeedMph: j.takeoffSpeedMph, relativeDistance: j.distanceFt,
        peakRotationDps: j.peakW,
      })),
    };
    const filename = `braaplabs-${Date.now()}.json`;
    const uri = FileSystem.documentDirectory + filename;
    await FileSystem.writeAsStringAsync(uri, JSON.stringify(payload, null, 2));
    Alert.alert('Exported', `Saved ${jumps.length} jumps to:\n${filename}`);
  };

  const handleSaveCalibration = async (selected) => {
    if (!selected.length) return;
    const impacts   = selected.map(e => e.impactG);
    const freefalls = selected.map(e => e.minFiltMag ?? 0.3);
    const airtimes  = selected.map(e => e.airtimeMs);
    const newCfg = {
      ff:           Math.min(0.95, parseFloat((freefalls.reduce((a,b)=>a+b,0)/freefalls.length * 1.3).toFixed(2))),
      land:         Math.max(1.2,  parseFloat((Math.min(...impacts) * 0.85).toFixed(2))),
      minMs:        Math.max(80,   Math.round(Math.min(...airtimes) * 0.75)),
      minSpeedMph:  5,
      arcFactor:    PRESETS[bikeType].arcFactor,
    };
    const raw  = await AsyncStorage.getItem('braaplabs-cal') || '{}';
    const saved = JSON.parse(raw);
    saved[bikeType] = newCfg;
    await AsyncStorage.setItem('braaplabs-cal', JSON.stringify(saved));
    setCustomCfg(newCfg);
    setShowCal(false);
    Alert.alert('✓ Calibrated', `ff:${newCfg.ff}G · land:${newCfg.land}G · min:${newCfg.minMs}ms`);
  };

  const isCalibrated = !!customCfg;
  const activeCfg    = customCfg ?? PRESETS[bikeType];

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: T.bg }]}>
      <StatusBar barStyle="light-content" backgroundColor={T.bg}/>

      {/* Landing flash overlay */}
      <Animated.View pointerEvents="none" style={[
        StyleSheet.absoluteFill,
        { backgroundColor: '#e84820', opacity: flashAnim, zIndex: 999 }
      ]}/>

      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* ── HEADER ── */}
        <View style={[s.header, { backgroundColor: T.bg2, borderColor: T.border2 }]}>
          <Text style={[s.logo, { color: T.chromeHi }]}>BRAAP <Text style={{ color: T.ice }}>LABS</Text></Text>
          <TouchableOpacity onPress={() => setTheme(t => t==='golden'?'sw':'golden')}
            style={[s.themeBtn, { backgroundColor: T.bg3, borderColor: T.border2 }]}>
            <Text style={{ color: T.chrome, fontSize: 10, fontFamily: 'monospace', letterSpacing: 1 }}>
              {theme === 'golden' ? '☀ SW MODE' : '🌙 GOLDEN'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── STATUS BAR ── */}
        <View style={[s.statusBar, { backgroundColor: T.bg2, borderColor: T.border2 }]}>
          <View style={s.badges}>
            {['ACCEL','GYRO', running ? 'LIVE' : 'IDLE', gpsStatus === 'locked' ? 'GPS ●' : 'GPS'].map(label => (
              <View key={label} style={[s.badge, {
                borderColor: (label==='LIVE'||label==='GPS ●') ? T.green : T.border2,
                backgroundColor: (label==='LIVE'||label==='GPS ●') ? T.bg3 : 'transparent',
              }]}>
                <Text style={[s.badgeText, {
                  color: (label==='LIVE'||label==='GPS ●') ? T.green : T.chromeDim
                }]}>{label}</Text>
              </View>
            ))}
          </View>
          {/* Best stats */}
          {jumps.length > 0 && (() => {
            const best = jumps.reduce((a,b) => a.airtimeMs > b.airtimeMs ? a : b);
            const bestD = jumps.reduce((a,b) => (a.distanceFt||0)>(b.distanceFt||0)?a:b);
            return (
              <View style={s.bestRow}>
                <Text style={[s.bestIcon, { color: T.chrome }]}>🏆</Text>
                <Text style={[s.bestLabel, { color: T.chromeDim }]}>AIR </Text>
                <Text style={[s.bestVal, { color: T.chromeHi }]}>{(best.airtimeMs/1000).toFixed(3)}s</Text>
                <Text style={[s.bestLabel, { color: T.chromeDim }]}> · DST </Text>
                <Text style={[s.bestVal, { color: T.chromeHi }]}>{bestD.distanceFt ?? '--'}↔</Text>
              </View>
            );
          })()}
        </View>

        {/* ── GAUGES ── */}
        <View style={s.gaugeRow}>
          <GaugeG value={gForce} theme={T}/>
          <SpeedDisplay value={speedMph} status={gpsStatus} theme={T} running={running}/>
        </View>

        {/* ── NIXIE ROW ── */}
        <NixieRow
          airtime={liveAirtime ?? (lastJump ? lastJump.airtimeMs/1000 : null)}
          distance={lastJump?.distanceFt ?? null}
          jumpCount={jumps.length}
          inFlight={liveAirtime !== null}
          theme={T}
        />

        {/* ── WAVEFORM ── */}
        <Waveform
          sampleHz={sampleHz}
          ffThreshold={activeCfg.ff}
          landThreshold={activeCfg.land}
          jumps={jumps}
          theme={T}
        />

        {/* ── BIKE TOGGLE ── */}
        <View style={[s.bikePanel, { backgroundColor: T.bg2, borderColor: T.border2 }]}>
          {['electric','gas'].map(type => {
            const active = bikeType === type;
            return (
              <TouchableOpacity key={type} disabled={running}
                onPress={() => handleBikeType(type)}
                style={[s.bikeBtn, {
                  backgroundColor: active ? T.bg3 : T.bg,
                  borderColor: active ? T.chrome : T.border,
                  opacity: running ? 0.5 : 1,
                }]}>
                <Text style={s.bikeIcon}>{type === 'electric' ? '⚡' : '🔥'}</Text>
                <Text style={[s.bikeBtnText, {
                  color: active ? T.chromeHi : T.chromeDim,
                  textShadowColor: active ? T.ice : 'transparent',
                  textShadowRadius: active ? 8 : 0,
                }]}>{type.toUpperCase()}</Text>
                {active && isCalibrated && (
                  <Text style={[s.calBadge, { color: T.green }]}>● CAL</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={[s.presetInfo, { color: T.chromeDim }]}>
          {isCalibrated ? '⚙ CALIBRATED' : (bikeType === 'electric' ? '⚡' : '🔥')}
          {` · ff:${activeCfg.ff}G · land:${activeCfg.land}G · min:${activeCfg.minMs}ms`}
        </Text>

        {/* ── CONTROLS ── */}
        <View style={[s.controlPanel, { backgroundColor: T.bg2, borderColor: T.border2 }]}>
          <View style={s.controlGrid}>
            <CockpitBtn label="SENSORS ON" color={T.green} active={running && !calMode}
              disabled={running} onPress={start} theme={T}/>
            <CockpitBtn label="SIMULATE"   color={T.ice}   active={false}
              disabled={running} onPress={() => Alert.alert('Simulation', 'Use real sensors on device')} theme={T}/>
            <CockpitBtn label="STOP"       color={T.red}   active={running}
              disabled={!running} onPress={stop} theme={T}/>
            <CockpitBtn label="CLEAR LOG"  color={T.chromeDim} active={false}
              disabled={false}
              onPress={() => Alert.alert('Clear Log', 'Clear all jump data?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Clear', style: 'destructive', onPress: clearSession },
              ])} theme={T}/>
          </View>
          <CockpitBtn label="EXPORT SESSION DATA" color={T.chromeHi}
            active={jumps.length > 0} disabled={!jumps.length}
            onPress={handleExport} theme={T} wide/>
        </View>

        {/* ── JUMP LOG ── */}
        <JumpLog jumps={jumps} theme={T}/>

        {/* ── CALIBRATE ── */}
        <TouchableOpacity onPress={() => setShowCal(true)}
          style={[s.calBtn, { borderColor: T.border2 }]}>
          <Text style={[s.calBtnText, { color: T.chromeDim }]}>⚙ CALIBRATE THRESHOLDS</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }}/>
      </ScrollView>

      {/* ── CALIBRATION MODAL ── */}
      <CalibrationModal
        visible={showCal}
        bikeType={bikeType}
        theme={T}
        onSave={handleSaveCalibration}
        onCancel={() => setShowCal(false)}
      />
    </SafeAreaView>
  );
}

// ── Cockpit button component ─────────────────
function CockpitBtn({ label, color, active, disabled, onPress, theme: T, wide }) {
  const scale = useRef(new Animated.Value(1)).current;
  const press = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.96, duration: 70, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1,    duration: 100, useNativeDriver: true }),
    ]).start();
    onPress?.();
  };
  return (
    <TouchableOpacity onPress={press} disabled={disabled}
      style={[s.btn, wide && s.btnWide, { opacity: disabled && !active ? 0.35 : 1 }]}>
      <Animated.View style={[s.btnOuter, { transform: [{ scale }],
        backgroundColor: T.bg2, borderColor: T.border2,
        shadowColor: active ? color : 'transparent',
        shadowRadius: active ? 8 : 0, shadowOpacity: active ? 0.5 : 0,
        elevation: active ? 4 : 1,
      }]}>
        {/* Indicator lamp */}
        <View style={[s.lamp, {
          backgroundColor: active ? color : '#1a1408',
          shadowColor: active ? color : 'transparent',
          shadowRadius: active ? 6 : 0, shadowOpacity: active ? 0.9 : 0,
        }]}/>
        {/* Label */}
        <View style={[s.btnInner, { backgroundColor: T.bg }]}>
          <Text style={[s.btnLabel, {
            color: active ? color : T.border2,
            textShadowColor: active ? color : 'transparent',
            textShadowRadius: active ? 6 : 0,
          }]}>{label}</Text>
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  safe:        { flex: 1 },
  scroll:      { flex: 1 },
  content:     { padding: 12, gap: 10 },

  // Header
  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                 padding: 14, borderRadius: 6, borderWidth: 1 },
  logo:        { fontSize: 22, fontWeight: '700', letterSpacing: 4, fontFamily: 'monospace' },
  themeBtn:    { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, borderWidth: 1 },

  // Status
  statusBar:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                 padding: 10, borderRadius: 6, borderWidth: 1 },
  badges:      { flexDirection: 'row', gap: 6 },
  badge:       { borderWidth: 1, borderRadius: 3, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText:   { fontSize: 8, fontFamily: 'monospace', letterSpacing: 1 },
  bestRow:     { flexDirection: 'row', alignItems: 'center' },
  bestIcon:    { fontSize: 12, marginRight: 4 },
  bestLabel:   { fontSize: 8,  fontFamily: 'monospace', letterSpacing: 1 },
  bestVal:     { fontSize: 11, fontFamily: 'monospace' },

  // Gauges
  gaugeRow:    { flexDirection: 'row', gap: 10 },

  // Bike toggle
  bikePanel:   { flexDirection: 'row', gap: 8, padding: 8,
                 borderRadius: 4, borderWidth: 2 },
  bikeBtn:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                 gap: 8, paddingVertical: 14, borderRadius: 3, borderWidth: 1 },
  bikeIcon:    { fontSize: 16 },
  bikeBtnText: { fontSize: 12, fontFamily: 'monospace', letterSpacing: 2 },
  calBadge:    { fontSize: 8, fontFamily: 'monospace', marginLeft: 4 },
  presetInfo:  { fontSize: 9, fontFamily: 'monospace', letterSpacing: 1, textAlign: 'center' },

  // Controls
  controlPanel:{ padding: 12, gap: 8, borderRadius: 4, borderWidth: 2 },
  controlGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  btn:         { width: (width - 24 - 8 - 24) / 2 },
  btnWide:     { width: '100%' },
  btnOuter:    { borderRadius: 3, borderWidth: 1, position: 'relative',
                 shadowOffset: { width: 0, height: 0 } },
  lamp:        { position: 'absolute', top: 5, right: 6, width: 6, height: 6,
                 borderRadius: 3, zIndex: 2,
                 shadowOffset: { width: 0, height: 0 } },
  btnInner:    { margin: 3, marginTop: 14, padding: 12, borderRadius: 2 },
  btnLabel:    { fontSize: 11, fontFamily: 'monospace', letterSpacing: 2,
                 textAlign: 'center', textShadowOffset: { width: 0, height: 0 } },

  // Calibrate
  calBtn:      { padding: 14, borderRadius: 3, borderWidth: 1, alignItems: 'center', marginTop: 4 },
  calBtnText:  { fontSize: 10, fontFamily: 'monospace', letterSpacing: 2 },
});
