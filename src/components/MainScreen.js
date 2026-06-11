import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  SafeAreaView, StatusBar, Dimensions, Animated, Alert, Modal,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Accelerometer, Gyroscope } from 'expo-sensors';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { useSession } from '../hooks/useSession';
import { PRESETS } from '../engine/fsm';
import { GOLDEN, SW } from '../theme/colors';

const { width } = Dimensions.get('window');

export default function MainScreen() {
  const [theme,     setTheme]     = useState('golden');
  const [bikeType,  setBikeType]  = useState('electric');
  const [customCfg, setCustomCfg] = useState(null);
  const [showCal,   setShowCal]   = useState(false);
  const T = theme === 'sw' ? SW : GOLDEN;

  const {
    running, jumps, gForce, speedMph, gpsStatus,
    liveAirtime, lastJump, sampleHz,
    start, stop, clearSession,
  } = useSession(bikeType, customCfg);

  const flashAnim   = useRef(new Animated.Value(0)).current;
  const prevJumps   = useRef(0);

  useEffect(() => {
    if (jumps.length > prevJumps.current) {
      prevJumps.current = jumps.length;
      Animated.sequence([
        Animated.timing(flashAnim, { toValue: 1, duration: 60,  useNativeDriver: true }),
        Animated.timing(flashAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [jumps.length]);

  useEffect(() => {
    AsyncStorage.getItem('braaplabs-cal').then(raw => {
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved[bikeType]) setCustomCfg(saved[bikeType]);
    });
  }, [bikeType]);

  const activeCfg  = customCfg ?? PRESETS[bikeType];
  const bestJump   = jumps.length ? jumps.reduce((a, b) => a.airtimeMs > b.airtimeMs ? a : b) : null;
  const airDisplay = liveAirtime ?? (lastJump ? lastJump.airtimeMs / 1000 : null);

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: T.bg }]}>
      <StatusBar barStyle="light-content" backgroundColor={T.bg} />

      <Animated.View pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: '#e84820', opacity: flashAnim, zIndex: 999 }]} />

      <ScrollView contentContainerStyle={[s.content, { backgroundColor: T.bg }]}
        showsVerticalScrollIndicator={false}>

        {/* ── HEADER ── */}
        <View style={[s.card, { flexDirection: 'row', justifyContent: 'space-between',
          alignItems: 'center', backgroundColor: T.bg2, borderColor: T.border2 }]}>
          <Text style={[s.logo, { color: T.chromeHi }]}>
            BRAAP <Text style={{ color: T.ice }}>LABS</Text>
          </Text>
          <TouchableOpacity onPress={() => setTheme(t => t === 'golden' ? 'sw' : 'golden')}
            style={[s.themeBtn, { backgroundColor: T.bg3, borderColor: T.border2 }]}>
            <Text style={{ color: T.chrome, fontSize: 10, fontFamily: 'monospace', letterSpacing: 1 }}>
              {theme === 'golden' ? '☀ SW MODE' : '★ GOLDEN'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── STATUS ── */}
        <View style={[s.card, { flexDirection: 'row', justifyContent: 'space-between',
          alignItems: 'center', backgroundColor: T.bg2, borderColor: T.border2 }]}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {['ACCEL', 'GYRO', running ? 'LIVE' : 'IDLE', gpsStatus === 'locked' ? 'GPS●' : 'GPS'].map(lbl => (
              <View key={lbl} style={[s.badge, {
                borderColor: (lbl === 'LIVE' || lbl === 'GPS●') ? T.green : T.border2 }]}>
                <Text style={{ color: (lbl === 'LIVE' || lbl === 'GPS●') ? T.green : T.chromeDim,
                  fontSize: 8, fontFamily: 'monospace', letterSpacing: 1 }}>{lbl}</Text>
              </View>
            ))}
          </View>
          {bestJump && (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 11 }}>🏆</Text>
              <Text style={{ color: T.chromeDim, fontSize: 8, fontFamily: 'monospace' }}> AIR </Text>
              <Text style={{ color: T.chromeHi, fontSize: 11, fontFamily: 'monospace' }}>
                {(bestJump.airtimeMs / 1000).toFixed(3)}s
              </Text>
              <Text style={{ color: T.chromeDim, fontSize: 8, fontFamily: 'monospace' }}> · DST </Text>
              <Text style={{ color: T.chromeHi, fontSize: 11, fontFamily: 'monospace' }}>
                {bestJump.distanceFt ?? '--'}↔
              </Text>
            </View>
          )}
        </View>

        {/* ── GAUGES ── */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {/* G-Force */}
          <View style={[s.card, { flex: 1, alignItems: 'center', backgroundColor: T.bg2, borderColor: T.border2 }]}>
            <Text style={[s.smallLabel, { color: T.chromeDim }]}>G-FORCE</Text>
            <Text style={[s.bigNum, {
              color: gForce > 3 ? T.red : gForce > 1.8 ? T.ice : T.green,
              textShadowColor: T.ice, textShadowRadius: 8 }]}>{gForce.toFixed(2)}</Text>
            <Text style={{ color: T.chromeDim, fontSize: 11, fontFamily: 'monospace' }}>G</Text>
            <View style={[s.barTrack, { backgroundColor: T.border, marginTop: 6 }]}>
              <View style={[s.barFill, {
                width: `${Math.min(100, (gForce / 5) * 100)}%`,
                backgroundColor: gForce > 3 ? T.red : gForce > 1.8 ? T.ice : T.green }]} />
            </View>
          </View>
          {/* Speed */}
          <View style={[s.card, { flex: 1, alignItems: 'center', backgroundColor: T.bg2, borderColor: T.border2 }]}>
            <Text style={[s.smallLabel, { color: T.chromeDim }]}>SPEED</Text>
            <Text style={[s.bigNum, { color: running ? T.ice : T.border2 }]}>
              {speedMph !== null ? Math.round(speedMph) : '--'}
            </Text>
            <Text style={{ color: T.chromeDim, fontSize: 11, fontFamily: 'monospace' }}>mph</Text>
            <Text style={[s.smallLabel, { color: gpsStatus === 'locked' ? T.green : T.border2, marginTop: 4 }]}>
              {gpsStatus === 'locked' ? 'GPS LIVE' : gpsStatus === 'acquiring' ? 'GPS…' : 'NO GPS'}
            </Text>
          </View>
        </View>

        {/* ── NIXIE ROW ── */}
        <View style={[s.card, { flexDirection: 'row', padding: 0, overflow: 'hidden',
          backgroundColor: T.bg2, borderColor: T.border2 }]}>
          <View style={{ flex: 1, padding: 14 }}>
            <Text style={[s.smallLabel, { color: T.chromeDim }]}>AIRTIME</Text>
            <Text style={{ fontSize: 38, fontFamily: 'monospace', color: T.ice, lineHeight: 42 }}>
              {airDisplay !== null ? airDisplay.toFixed(3) : '0.000'}
              <Text style={{ fontSize: 12, color: T.iceDim }}>s</Text>
            </Text>
            <Text style={[s.smallLabel, { color: T.chromeDim, marginTop: 4 }]}>
              {liveAirtime !== null ? 'IN FLIGHT' : `SESSION — ${jumps.length} JUMPS`}
            </Text>
          </View>
          <View style={{ width: 1, backgroundColor: T.border2, marginVertical: 10 }} />
          <View style={{ flex: 1, padding: 14 }}>
            <Text style={[s.smallLabel, { color: T.chromeDim }]}>JUMP DISTANCE</Text>
            <Text style={{ fontSize: 38, fontFamily: 'monospace', color: T.green, lineHeight: 42 }}>
              {lastJump?.distanceFt ?? '--'}
              <Text style={{ fontSize: 12, color: T.chromeDim }}>rel</Text>
            </Text>
            <Text style={[s.smallLabel, { color: T.chromeDim, marginTop: 4 }]}>
              {liveAirtime !== null ? 'IN FLIGHT' : lastJump ? 'RELATIVE' : '~ EST'}
            </Text>
          </View>
        </View>

        {/* ── BIKE TOGGLE ── */}
        <View style={[s.card, { flexDirection: 'row', gap: 8, backgroundColor: T.bg2, borderColor: T.border2 }]}>
          {['electric', 'gas'].map(type => {
            const active = bikeType === type;
            return (
              <TouchableOpacity key={type} disabled={running}
                onPress={() => { setBikeType(type); setCustomCfg(null); }}
                style={[s.bikeBtn, {
                  backgroundColor: active ? T.bg3 : T.bg,
                  borderColor: active ? T.chrome : T.border,
                  opacity: running ? 0.5 : 1,
                }]}>
                <Text style={{ fontSize: 16 }}>{type === 'electric' ? '⚡' : '🔥'}</Text>
                <Text style={{
                  color: active ? T.chromeHi : T.chromeDim, fontSize: 12,
                  fontFamily: 'monospace', letterSpacing: 2,
                  textShadowColor: active ? T.ice : 'transparent',
                  textShadowRadius: active ? 8 : 0,
                }}>{type.toUpperCase()}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={[s.smallLabel, { color: T.chromeDim, textAlign: 'center' }]}>
          {customCfg ? '⚙ CALIBRATED' : bikeType === 'electric' ? '⚡' : '🔥'}
          {` · ff:${activeCfg.ff}G · land:${activeCfg.land}G · min:${activeCfg.minMs}ms`}
        </Text>

        {/* ── CONTROLS ── */}
        <View style={[s.card, { backgroundColor: T.bg2, borderColor: T.border2 }]}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <CBtn label="SENSORS ON" color={T.green}  active={running} disabled={running}  onPress={start}  T={T} />
            <CBtn label="STOP"       color={T.red}    active={running} disabled={!running} onPress={stop}   T={T} />
            <CBtn label="CLEAR LOG"  color={T.chromeDim} active={false} disabled={false}
              onPress={() => Alert.alert('Clear Log', 'Clear all data?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Clear', style: 'destructive', onPress: clearSession },
              ])} T={T} />
            <CBtn label="EXPORT" color={T.chromeHi} active={jumps.length > 0} disabled={!jumps.length}
              onPress={() => Alert.alert('Export', `${jumps.length} jumps recorded.\nBest: ${bestJump ? (bestJump.airtimeMs/1000).toFixed(3)+'s' : '—'}`)} T={T} />
          </View>
        </View>

        {/* ── JUMP LOG ── */}
        <View style={[s.card, { padding: 0, overflow: 'hidden', backgroundColor: T.bg2, borderColor: T.border2 }]}>
          <View style={[s.logHeader, { borderBottomColor: T.border }]}>
            <Text style={[s.smallLabel, { color: T.chromeDim }]}>JUMP RECORD</Text>
            <Text style={[s.smallLabel, { color: T.border2 }]}>{jumps.length} JUMPS</Text>
          </View>
          {jumps.length === 0 ? (
            <Text style={{ color: T.border2, textAlign: 'center', padding: 24,
              fontSize: 10, fontFamily: 'monospace', letterSpacing: 1 }}>
              AWAITING FIRST JUMP
            </Text>
          ) : jumps.map((j, i) => {
            const prev  = jumps[i + 1];
            const isBest = bestJump && j.id === bestJump.id && jumps.length > 1;
            const dAir  = prev ? ((j.airtimeMs - prev.airtimeMs) / prev.airtimeMs * 100).toFixed(0) : null;
            return (
              <View key={j.id} style={[s.logRow, {
                borderBottomColor: T.border,
                backgroundColor: isBest ? T.bg3 : 'transparent' }]}>
                <View style={{ width: 44 }}>
                  <Text style={{ color: T.border2, fontSize: 10, fontFamily: 'monospace' }}>#{j.id}</Text>
                  {isBest && <Text style={{ color: T.chrome, fontSize: 8, fontFamily: 'monospace' }}>★BEST</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: T.ice,   fontSize: 13, fontFamily: 'monospace' }}>{(j.airtimeMs/1000).toFixed(3)}s</Text>
                  <Text style={{ color: T.border2, fontSize: 8, fontFamily: 'monospace' }}>AIRTIME</Text>
                  {dAir && <Text style={{ color: dAir > 0 ? T.green : T.red, fontSize: 9, fontFamily: 'monospace' }}>
                    {dAir > 0 ? '▲' : '▼'}{Math.abs(dAir)}%</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: T.green, fontSize: 13, fontFamily: 'monospace' }}>{j.distanceFt ?? '--'}↔</Text>
                  <Text style={{ color: T.border2, fontSize: 8, fontFamily: 'monospace' }}>RELATIVE</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: T.red,   fontSize: 13, fontFamily: 'monospace' }}>{j.impactG.toFixed(1)}G</Text>
                  <Text style={{ color: T.border2, fontSize: 8, fontFamily: 'monospace' }}>IMPACT</Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* ── CALIBRATE ── */}
        <TouchableOpacity onPress={() => setShowCal(true)}
          style={[s.calTrigger, { borderColor: T.border2 }]}>
          <Text style={{ color: T.chromeDim, fontSize: 10, fontFamily: 'monospace', letterSpacing: 2 }}>
            ⚙ CALIBRATE THRESHOLDS
          </Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── CALIBRATION MODAL ── */}
      <CalModal visible={showCal} bikeType={bikeType} T={T}
        onSave={async (sel) => {
          if (!sel.length) return;
          const ff   = Math.min(0.95, parseFloat((sel.map(e=>e.minFilt??0.3).reduce((a,b)=>a+b,0)/sel.length*1.3).toFixed(2)));
          const land = Math.max(1.2,  parseFloat((Math.min(...sel.map(e=>e.impactG))*0.85).toFixed(2)));
          const minMs= Math.max(80,   Math.round(Math.min(...sel.map(e=>e.airtimeMs))*0.75));
          const newCfg = { ff, land, minMs, minSpeedMph: 5, arcFactor: PRESETS[bikeType].arcFactor };
          const raw  = await AsyncStorage.getItem('braaplabs-cal') || '{}';
          const saved = JSON.parse(raw);
          saved[bikeType] = newCfg;
          await AsyncStorage.setItem('braaplabs-cal', JSON.stringify(saved));
          setCustomCfg(newCfg);
          setShowCal(false);
          Alert.alert('✓ Calibrated', `ff:${ff}G · land:${land}G · min:${minMs}ms`);
        }}
        onCancel={() => setShowCal(false)} />
    </SafeAreaView>
  );
}

// ── Cockpit Button ─────────────────────────────
function CBtn({ label, color, active, disabled, onPress, T }) {
  const sc = useRef(new Animated.Value(1)).current;
  const press = () => {
    Animated.sequence([
      Animated.timing(sc, { toValue: 0.95, duration: 70,  useNativeDriver: true }),
      Animated.timing(sc, { toValue: 1,    duration: 100, useNativeDriver: true }),
    ]).start();
    onPress?.();
  };
  const btnWidth = (width - 24 - 8 - 24) / 2;
  return (
    <TouchableOpacity onPress={press} disabled={disabled}
      style={[{ width: btnWidth }, disabled && !active && { opacity: 0.3 }]}>
      <Animated.View style={{
        transform: [{ scale: sc }],
        backgroundColor: T.bg2, borderRadius: 3, borderWidth: 1,
        borderColor: T.border2, position: 'relative',
        shadowColor: active ? color : 'transparent',
        shadowRadius: active ? 10 : 0, shadowOpacity: active ? 0.5 : 0,
        elevation: active ? 6 : 1,
      }}>
        <View style={{
          position: 'absolute', top: 5, right: 6,
          width: 6, height: 6, borderRadius: 3,
          backgroundColor: active ? color : '#1a1408',
          shadowColor: active ? color : 'transparent',
          shadowRadius: active ? 6 : 0, shadowOpacity: 0.9,
        }} />
        <View style={{ margin: 3, marginTop: 14, padding: 12,
          borderRadius: 2, backgroundColor: T.bg }}>
          <Text style={{
            fontSize: 10, fontFamily: 'monospace', letterSpacing: 2,
            textAlign: 'center', color: active ? color : T.border2,
            textShadowColor: active ? color : 'transparent',
            textShadowRadius: active ? 8 : 0,
          }}>{label}</Text>
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
}

// ── Calibration Modal ──────────────────────────
function CalModal({ visible, bikeType, T, onSave, onCancel }) {
  const [step,     setStep]     = useState('idle');
  const [events,   setEvents]   = useState([]);
  const [selected, setSelected] = useState({});

  useEffect(() => {
    if (!visible) { setStep('idle'); setEvents([]); setSelected({}); }
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)',
        justifyContent: 'center', padding: 20 }}>
        <View style={{ backgroundColor: T.bg2, borderRadius: 6,
          borderWidth: 2, borderColor: T.border2, padding: 24, gap: 12 }}>

          <Text style={{ fontSize: 14, fontFamily: 'monospace', letterSpacing: 3,
            textAlign: 'center', color: T.chromeHi }}>⚙ CALIBRATION</Text>

          {step === 'idle' && (
            <>
              <Text style={{ fontSize: 10, fontFamily: 'monospace', lineHeight: 18,
                color: T.chromeDim, textAlign: 'center' }}>
                Ride your jumps normally. The app records everything including false positives.
                When done tap STOP and select the real jumps.
              </Text>
              <TouchableOpacity onPress={() => { setEvents([]); setSelected({}); setStep('ready'); }}
                style={[s.calBtn, { borderColor: T.border2 }]}>
                <Text style={{ color: T.chromeHi, fontSize: 11, fontFamily: 'monospace', letterSpacing: 2 }}>
                  START RECORDING
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onCancel} style={[s.calBtn, { borderColor: T.border }]}>
                <Text style={{ color: T.chromeDim, fontSize: 11, fontFamily: 'monospace', letterSpacing: 2 }}>
                  CANCEL
                </Text>
              </TouchableOpacity>
            </>
          )}

          {step === 'ready' && (
            <>
              <Text style={{ fontSize: 56, fontFamily: 'monospace',
                textAlign: 'center', color: T.ice }}>{events.length}</Text>
              <Text style={{ fontSize: 9, fontFamily: 'monospace', letterSpacing: 2,
                textAlign: 'center', color: T.chromeDim }}>EVENTS CAPTURED</Text>
              <TouchableOpacity onPress={() => setStep('review')}
                style={[s.calBtn, { borderColor: T.border2 }]}>
                <Text style={{ color: T.chromeHi, fontSize: 11, fontFamily: 'monospace', letterSpacing: 2 }}>
                  STOP RECORDING
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onCancel} style={[s.calBtn, { borderColor: T.border }]}>
                <Text style={{ color: T.chromeDim, fontSize: 11, fontFamily: 'monospace', letterSpacing: 2 }}>
                  CANCEL
                </Text>
              </TouchableOpacity>
            </>
          )}

          {step === 'review' && (
            <>
              <Text style={{ fontSize: 10, fontFamily: 'monospace', color: T.chromeDim, textAlign: 'center' }}>
                Uncheck false positives:
              </Text>
              <ScrollView style={{ maxHeight: 200, borderWidth: 1, borderColor: T.border, borderRadius: 3 }}>
                {events.length === 0 && (
                  <Text style={{ color: T.border2, padding: 16, textAlign: 'center',
                    fontSize: 10, fontFamily: 'monospace' }}>NO EVENTS — try again</Text>
                )}
                {events.map(e => {
                  const sel = selected[e.id] !== false;
                  return (
                    <TouchableOpacity key={e.id}
                      onPress={() => setSelected(s => ({ ...s, [e.id]: !sel }))}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 12,
                        padding: 12, borderBottomWidth: 1, borderBottomColor: T.border,
                        backgroundColor: sel ? T.bg3 : 'transparent' }}>
                      <View style={{ width: 20, height: 20, borderRadius: 2, borderWidth: 1,
                        borderColor: sel ? T.chromeHi : T.border2,
                        backgroundColor: sel ? T.chromeHi : T.bg,
                        alignItems: 'center', justifyContent: 'center' }}>
                        {sel && <Text style={{ fontSize: 12, color: '#000', fontWeight: 'bold' }}>✓</Text>}
                      </View>
                      <View>
                        <Text style={{ color: T.chromeHi, fontSize: 12, fontFamily: 'monospace' }}>
                          {(e.airtimeMs/1000).toFixed(3)}s
                        </Text>
                        <Text style={{ color: T.chromeDim, fontSize: 9, fontFamily: 'monospace' }}>
                          {e.impactG.toFixed(1)}G impact
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <TouchableOpacity onPress={() => onSave(events.filter(e => selected[e.id] !== false))}
                style={[s.calBtn, { borderColor: T.border2 }]}>
                <Text style={{ color: T.chromeHi, fontSize: 11, fontFamily: 'monospace', letterSpacing: 2 }}>
                  SAVE CALIBRATION
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onCancel} style={[s.calBtn, { borderColor: T.border }]}>
                <Text style={{ color: T.chromeDim, fontSize: 11, fontFamily: 'monospace', letterSpacing: 2 }}>
                  CANCEL
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  safe:       { flex: 1 },
  content:    { padding: 12, gap: 10 },
  card:       { borderRadius: 6, borderWidth: 1, padding: 12 },
  logo:       { fontSize: 22, fontWeight: '700', letterSpacing: 4, fontFamily: 'monospace' },
  themeBtn:   { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, borderWidth: 1 },
  badge:      { borderWidth: 1, borderRadius: 3, paddingHorizontal: 6, paddingVertical: 2 },
  smallLabel: { fontSize: 9, fontFamily: 'monospace', letterSpacing: 2 },
  bigNum:     { fontSize: 40, fontFamily: 'monospace', textShadowOffset: { width: 0, height: 0 } },
  barTrack:   { width: '100%', height: 4, borderRadius: 2, overflow: 'hidden' },
  barFill:    { height: '100%', borderRadius: 2 },
  bikeBtn:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                gap: 8, paddingVertical: 14, borderRadius: 3, borderWidth: 1 },
  logHeader:  { flexDirection: 'row', justifyContent: 'space-between',
                padding: 10, paddingHorizontal: 14, borderBottomWidth: 1 },
  logRow:     { flexDirection: 'row', padding: 10, paddingHorizontal: 14,
                borderBottomWidth: 1, alignItems: 'center', gap: 6 },
  calTrigger: { padding: 14, borderRadius: 3, borderWidth: 1, alignItems: 'center' },
  calBtn:     { padding: 14, borderRadius: 3, borderWidth: 1, alignItems: 'center' },
});
