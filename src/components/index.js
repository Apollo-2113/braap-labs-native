import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity,
         Modal, FlatList, Dimensions, Animated } from 'react-native';
import Svg, { Path, Line, Rect, Text as SvgText } from 'react-native-svg';

const W = Dimensions.get('window').width;

// ── Speed Display ─────────────────────────────
export function SpeedDisplay({ value, status, theme, running }) {
  const mph   = value !== null ? Math.round(value) : null;
  const pct   = value !== null ? Math.min(100, (value / 80) * 100) : 0;
  const color = value >= 50 ? theme.red : value >= 25 ? theme.chromeHi : theme.ice;

  return (
    <View style={[sd.housing, { backgroundColor: theme.bg2, borderColor: theme.border2 }]}>
      <Text style={[sd.label, { color: theme.chromeDim }]}>SPEED</Text>
      <View style={sd.row}>
        <Text style={[sd.num, { color: running ? color : theme.border2 }]}>
          {mph !== null ? mph : '--'}
        </Text>
        <Text style={[sd.unit, { color: theme.chromeDim }]}>mph</Text>
      </View>
      <View style={[sd.track, { backgroundColor: theme.border }]}>
        <View style={[sd.fill, { width: `${pct}%`,
          backgroundColor: pct > 62 ? theme.red : pct > 31 ? theme.ice : theme.green }]}/>
      </View>
      <Text style={[sd.status, { color: status==='locked' ? theme.green : theme.border2 }]}>
        {status === 'locked' ? 'GPS LIVE' : status === 'acquiring' ? 'GPS…' :
         status === 'denied' ? 'GPS ✗' : running ? 'NO GPS' : 'STOPPED'}
      </Text>
    </View>
  );
}
const sd = StyleSheet.create({
  housing: { flex: 1, padding: 10, borderRadius: 6, borderWidth: 1, alignItems: 'center' },
  label:   { fontSize: 9, fontFamily: 'monospace', letterSpacing: 2, color: '#7a5808' },
  row:     { flexDirection: 'row', alignItems: 'flex-end', gap: 4, marginVertical: 6 },
  num:     { fontSize: 48, fontFamily: 'monospace', lineHeight: 52 },
  unit:    { fontSize: 13, fontFamily: 'monospace', paddingBottom: 8 },
  track:   { width: '100%', height: 5, borderRadius: 3, overflow: 'hidden' },
  fill:    { height: '100%', borderRadius: 3 },
  status:  { fontSize: 9, fontFamily: 'monospace', letterSpacing: 1, marginTop: 4 },
});

// ── Nixie Row ─────────────────────────────────
export function NixieRow({ airtime, distance, jumpCount, inFlight, theme }) {
  return (
    <View style={[nx.row, { backgroundColor: theme.bg2, borderColor: theme.border2 }]}>
      <View style={nx.panel}>
        <Text style={[nx.lbl, { color: theme.chromeDim }]}>AIRTIME</Text>
        <Text style={[nx.val, { color: theme.ice }]}>
          {airtime !== null ? airtime.toFixed(3) : '0.000'}
          <Text style={[nx.unit, { color: theme.iceDim }]}>s</Text>
        </Text>
        <Text style={[nx.sub, { color: theme.chromeDim }]}>
          {jumpCount > 0 ? `SESSION — ${jumpCount} JUMP${jumpCount!==1?'S':''}` : '0 JUMPS'}
        </Text>
      </View>
      <View style={[nx.divider, { backgroundColor: theme.border2 }]}/>
      <View style={nx.panel}>
        <Text style={[nx.lbl, { color: theme.chromeDim }]}>JUMP DISTANCE</Text>
        <Text style={[nx.val, { color: theme.green }]}>
          {distance !== null ? distance : '--'}
          <Text style={[nx.unit, { color: theme.chromeDim }]}>rel</Text>
        </Text>
        <Text style={[nx.sub, { color: theme.chromeDim }]}>
          {inFlight ? 'IN FLIGHT' : distance !== null ? 'RELATIVE' : 'GPS NEEDED'}
        </Text>
      </View>
    </View>
  );
}
const nx = StyleSheet.create({
  row:     { flexDirection: 'row', borderRadius: 6, borderWidth: 1, overflow: 'hidden' },
  panel:   { flex: 1, padding: 14 },
  divider: { width: 1, marginVertical: 10 },
  lbl:     { fontSize: 8, fontFamily: 'monospace', letterSpacing: 2, marginBottom: 4 },
  val:     { fontSize: 38, fontFamily: 'monospace', lineHeight: 42 },
  unit:    { fontSize: 12 },
  sub:     { fontSize: 9, fontFamily: 'monospace', letterSpacing: 1, marginTop: 4 },
});

// ── Waveform ──────────────────────────────────
export function Waveform({ sampleHz, ffThreshold, landThreshold, jumps, theme }) {
  // Simplified waveform — shows threshold lines and jump count
  // Full canvas-based waveform would need expo-gl or react-native-canvas
  return (
    <View style={[wv.housing, { backgroundColor: theme.bg2, borderColor: theme.border2 }]}>
      <View style={[wv.header, { borderBottomColor: theme.border }]}>
        <Text style={[wv.title, { color: theme.chromeDim }]}>ACCEL. MAGNITUDE — FILTERED</Text>
        <Text style={[wv.hz, { color: theme.chromeDim }]}>{sampleHz} Hz</Text>
      </View>
      <View style={wv.canvas}>
        {/* Threshold lines */}
        <View style={[wv.threshLine, {
          bottom: `${(ffThreshold / 4) * 100}%`,
          borderColor: theme.green + '60',
        }]}>
          <Text style={[wv.threshLabel, { color: theme.green + '99' }]}>{ffThreshold}G</Text>
        </View>
        <View style={[wv.threshLine, {
          bottom: `${(landThreshold / 4) * 100}%`,
          borderColor: theme.red + '60',
        }]}>
          <Text style={[wv.threshLabel, { color: theme.red + '99' }]}>{landThreshold}G</Text>
        </View>
        {/* Jump markers */}
        {jumps.slice(0,6).map((j,i) => (
          <View key={j.id} style={[wv.jumpMarker, { right: i * 40 + 10 }]}>
            <Text style={[wv.jumpLabel, { color: theme.chromeHi }]}>#{j.id}</Text>
          </View>
        ))}
        <Text style={[wv.hint, { color: theme.border2 }]}>LIVE WAVEFORM</Text>
      </View>
    </View>
  );
}
const wv = StyleSheet.create({
  housing:     { borderRadius: 6, borderWidth: 1, overflow: 'hidden' },
  header:      { flexDirection: 'row', justifyContent: 'space-between',
                 padding: 8, paddingHorizontal: 12, borderBottomWidth: 1 },
  title:       { fontSize: 9, fontFamily: 'monospace', letterSpacing: 1 },
  hz:          { fontSize: 9, fontFamily: 'monospace' },
  canvas:      { height: 120, position: 'relative', justifyContent: 'center', alignItems: 'center' },
  threshLine:  { position: 'absolute', left: 0, right: 0, borderTopWidth: 1, borderStyle: 'dashed' },
  threshLabel: { fontSize: 8, fontFamily: 'monospace', position: 'absolute', left: 4, top: -10 },
  jumpMarker:  { position: 'absolute', top: 8, width: 1, height: '80%',
                 backgroundColor: 'rgba(240,200,64,0.4)', alignItems: 'center' },
  jumpLabel:   { fontSize: 8, fontFamily: 'monospace', position: 'absolute', top: -12 },
  hint:        { fontSize: 10, fontFamily: 'monospace', letterSpacing: 1 },
});

// ── Jump Log ──────────────────────────────────
export function JumpLog({ jumps, theme }) {
  if (!jumps.length) return (
    <View style={[jl.housing, { backgroundColor: theme.bg2, borderColor: theme.border2 }]}>
      <View style={[jl.header, { borderBottomColor: theme.border }]}>
        <Text style={[jl.title, { color: theme.chromeDim }]}>JUMP RECORD</Text>
        <Text style={[jl.count, { color: theme.border2 }]}>0 JUMPS</Text>
      </View>
      <Text style={[jl.empty, { color: theme.border2 }]}>AWAITING FIRST JUMP</Text>
    </View>
  );

  const bestMs = Math.max(...jumps.map(j => j.airtimeMs));

  return (
    <View style={[jl.housing, { backgroundColor: theme.bg2, borderColor: theme.border2 }]}>
      <View style={[jl.header, { borderBottomColor: theme.border }]}>
        <Text style={[jl.title, { color: theme.chromeDim }]}>JUMP RECORD</Text>
        <Text style={[jl.count, { color: theme.border2 }]}>{jumps.length} JUMPS</Text>
      </View>
      {jumps.map((jump, i) => {
        const prev  = jumps[i + 1];
        const isBest = jump.airtimeMs === bestMs && jumps.length > 1;
        const deltaAir = prev ? ((jump.airtimeMs - prev.airtimeMs) / prev.airtimeMs * 100).toFixed(0) : null;
        return (
          <View key={jump.id} style={[jl.row, { borderBottomColor: theme.border,
            backgroundColor: isBest ? theme.bg3 : 'transparent' }]}>
            <View style={jl.numCol}>
              <Text style={[jl.num, { color: theme.border2 }]}>#{jump.id}</Text>
              {isBest && <Text style={[jl.best, { color: theme.chrome }]}>★ BEST</Text>}
            </View>
            <View style={jl.stat}>
              <Text style={[jl.val, { color: theme.ice }]}>{(jump.airtimeMs/1000).toFixed(3)}s</Text>
              <Text style={[jl.lbl, { color: theme.border2 }]}>AIRTIME</Text>
              {deltaAir && <Text style={[jl.delta, {
                color: deltaAir > 0 ? theme.green : theme.red }]}>
                {deltaAir > 0 ? '▲' : '▼'}{Math.abs(deltaAir)}%</Text>}
            </View>
            <View style={jl.stat}>
              <Text style={[jl.val, { color: theme.green }]}>{jump.distanceFt ?? '--'}↔</Text>
              <Text style={[jl.lbl, { color: theme.border2 }]}>RELATIVE</Text>
            </View>
            <View style={jl.stat}>
              <Text style={[jl.val, { color: theme.red }]}>{jump.impactG.toFixed(1)}G</Text>
              <Text style={[jl.lbl, { color: theme.border2 }]}>IMPACT</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}
const jl = StyleSheet.create({
  housing:  { borderRadius: 6, borderWidth: 1, overflow: 'hidden' },
  header:   { flexDirection: 'row', justifyContent: 'space-between',
              padding: 10, paddingHorizontal: 14, borderBottomWidth: 1 },
  title:    { fontSize: 9, fontFamily: 'monospace', letterSpacing: 2 },
  count:    { fontSize: 9, fontFamily: 'monospace' },
  empty:    { textAlign: 'center', padding: 24, fontSize: 10, fontFamily: 'monospace', letterSpacing: 1 },
  row:      { flexDirection: 'row', padding: 10, paddingHorizontal: 14,
              borderBottomWidth: 1, alignItems: 'center', gap: 6 },
  numCol:   { width: 48, alignItems: 'flex-start', gap: 2 },
  num:      { fontSize: 10, fontFamily: 'monospace' },
  best:     { fontSize: 8,  fontFamily: 'monospace' },
  stat:     { flex: 1 },
  val:      { fontSize: 13, fontFamily: 'monospace' },
  lbl:      { fontSize: 8,  fontFamily: 'monospace', letterSpacing: 1 },
  delta:    { fontSize: 9,  fontFamily: 'monospace' },
});

// ── Calibration Modal ─────────────────────────
export function CalibrationModal({ visible, bikeType, theme, onSave, onCancel }) {
  const [step,     setStep]     = React.useState('idle'); // idle|recording|review|result
  const [events,   setEvents]   = React.useState([]);
  const [selected, setSelected] = React.useState({});
  const [result,   setResult]   = React.useState(null);

  React.useEffect(() => {
    if (!visible) { setStep('idle'); setEvents([]); setSelected({}); setResult(null); }
  }, [visible]);

  const startRec = () => { setStep('recording'); setEvents([]); };
  const stopRec  = () => { setStep('review'); };
  const toggle   = (id) => setSelected(s => ({ ...s, [id]: !s[id] }));

  const save = () => {
    const sel = events.filter(e => selected[e.id] !== false);
    if (!sel.length) return;
    onSave(sel);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={cm.overlay}>
        <View style={[cm.panel, { backgroundColor: theme.bg2, borderColor: theme.border2 }]}>

          {step === 'idle' && (
            <>
              <Text style={[cm.title, { color: theme.chromeHi }]}>⚙ CALIBRATION MODE</Text>
              <Text style={[cm.desc, { color: theme.chromeDim }]}>
                Ride your jumps normally. The app will record everything — including false positives.
                {'\n\n'}When done, tap STOP and select which events were real jumps.
              </Text>
              <TouchableOpacity style={[cm.btn, cm.btnPrimary, { borderColor: theme.border2 }]}
                onPress={startRec}>
                <Text style={[cm.btnTxt, { color: theme.chromeHi }]}>START RECORDING</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[cm.btn, { borderColor: theme.border }]} onPress={onCancel}>
                <Text style={[cm.btnTxt, { color: theme.chromeDim }]}>CANCEL</Text>
              </TouchableOpacity>
            </>
          )}

          {step === 'recording' && (
            <>
              <Text style={[cm.title, { color: theme.chromeHi }]}>● RECORDING</Text>
              <Text style={[cm.bigNum, { color: theme.ice }]}>{events.length}</Text>
              <Text style={[cm.desc, { color: theme.chromeDim }]}>EVENTS CAPTURED</Text>
              <TouchableOpacity style={[cm.btn, cm.btnPrimary, { borderColor: theme.border2 }]}
                onPress={stopRec}>
                <Text style={[cm.btnTxt, { color: theme.chromeHi }]}>STOP RECORDING</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[cm.btn, { borderColor: theme.border }]} onPress={onCancel}>
                <Text style={[cm.btnTxt, { color: theme.chromeDim }]}>CANCEL</Text>
              </TouchableOpacity>
            </>
          )}

          {step === 'review' && (
            <>
              <Text style={[cm.title, { color: theme.chromeHi }]}>SELECT REAL JUMPS</Text>
              <Text style={[cm.desc, { color: theme.chromeDim }]}>
                Check which events were actual jumps. Uncheck false positives.
              </Text>
              <ScrollView style={[cm.eventList, { borderColor: theme.border }]}>
                {events.length === 0 && (
                  <Text style={[cm.desc, { color: theme.border2, padding: 16 }]}>No events detected.</Text>
                )}
                {events.map(e => {
                  const isSelected = selected[e.id] !== false;
                  return (
                    <TouchableOpacity key={e.id} onPress={() => toggle(e.id)}
                      style={[cm.eventRow, {
                        borderBottomColor: theme.border,
                        backgroundColor: isSelected ? theme.bg3 : 'transparent',
                      }]}>
                      <View style={[cm.checkbox, {
                        borderColor: isSelected ? theme.chromeHi : theme.border2,
                        backgroundColor: isSelected ? theme.chromeHi : theme.bg,
                      }]}>
                        {isSelected && <Text style={cm.check}>✓</Text>}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[cm.evTime, { color: theme.chromeHi }]}>
                          {(e.airtimeMs/1000).toFixed(3)}s airtime
                        </Text>
                        <Text style={[cm.evDetail, { color: theme.chromeDim }]}>
                          {e.impactG.toFixed(1)}G impact · {e.takeoffSpeedMph ? e.takeoffSpeedMph.toFixed(1)+'mph' : 'no GPS'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <TouchableOpacity style={[cm.btn, cm.btnPrimary, { borderColor: theme.border2 }]} onPress={save}>
                <Text style={[cm.btnTxt, { color: theme.chromeHi }]}>SAVE CALIBRATION</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[cm.btn, { borderColor: theme.border }]} onPress={onCancel}>
                <Text style={[cm.btnTxt, { color: theme.chromeDim }]}>CANCEL</Text>
              </TouchableOpacity>
            </>
          )}

        </View>
      </View>
    </Modal>
  );
}
const cm = StyleSheet.create({
  overlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center',
               padding: 20 },
  panel:     { borderRadius: 6, borderWidth: 2, padding: 24, gap: 10 },
  title:     { fontSize: 14, fontFamily: 'monospace', letterSpacing: 3, textAlign: 'center' },
  bigNum:    { fontSize: 64, fontFamily: 'monospace', textAlign: 'center', lineHeight: 70 },
  desc:      { fontSize: 10, fontFamily: 'monospace', lineHeight: 18, letterSpacing: 1,
               textAlign: 'center' },
  btn:       { padding: 14, borderRadius: 3, borderWidth: 1, alignItems: 'center' },
  btnPrimary:{ },
  btnTxt:    { fontSize: 11, fontFamily: 'monospace', letterSpacing: 2 },
  eventList: { maxHeight: 200, borderWidth: 1, borderRadius: 3 },
  eventRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12,
               borderBottomWidth: 1 },
  checkbox:  { width: 20, height: 20, borderRadius: 2, borderWidth: 1,
               alignItems: 'center', justifyContent: 'center' },
  check:     { fontSize: 12, color: '#000', fontWeight: 'bold' },
  evTime:    { fontSize: 12, fontFamily: 'monospace' },
  evDetail:  { fontSize: 9,  fontFamily: 'monospace', marginTop: 2 },
});
