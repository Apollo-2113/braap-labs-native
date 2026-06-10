import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, G, Line, Circle, Text as SvgText, Defs, RadialGradient, Stop } from 'react-native-svg';

function gToAngle(g) {
  return Math.min(90, Math.max(-90, (g / 5) * 180 - 90));
}

function polarToXY(angleDeg, r, cx, cy) {
  const rad = (angleDeg - 90) * Math.PI / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function needleTransform(angleDeg) {
  return `rotate(${angleDeg}, 80, 90)`;
}

export default function GaugeG({ value = 1.0, theme }) {
  const angle = gToAngle(value);

  return (
    <View style={[s.housing, { backgroundColor: theme.bg2, borderColor: theme.border2 }]}>
      <Text style={[s.label, { color: theme.chromeDim }]}>G-FORCE</Text>
      <Svg viewBox="0 0 160 100" width={150} height={95}>
        <Defs>
          <RadialGradient id="dg" cx="50%" cy="100%" r="80%">
            <Stop offset="0%"   stopColor="#1c1600"/>
            <Stop offset="100%" stopColor="#060400"/>
          </RadialGradient>
        </Defs>
        {/* Dial */}
        <Path d="M 10 90 A 70 70 0 0 1 150 90" fill="url(#dg)" stroke={theme.border2} strokeWidth="1.5"/>
        <Path d="M 6 90 A 74 74 0 0 1 154 90" fill="none" stroke={theme.border} strokeWidth="2"/>
        {/* Arc zones */}
        <Path d="M 12 90 A 66 66 0 0 1 46 34"  fill="none" stroke="#a8c820" strokeWidth="5" strokeLinecap="butt" opacity="0.8"/>
        <Path d="M 46 34 A 66 66 0 0 1 114 34" fill="none" stroke="#f0a800" strokeWidth="5" strokeLinecap="butt" opacity="0.8"/>
        <Path d="M 114 34 A 66 66 0 0 1 148 90" fill="none" stroke="#e84820" strokeWidth="5" strokeLinecap="butt" opacity="0.8"/>
        {/* Ticks */}
        {[-90,-54,-18,18,54,90].map(a => {
          const t = `rotate(${a}, 80, 90)`;
          return <Line key={a} x1="80" y1="22" x2="80" y2="34" stroke={theme.chrome} strokeWidth="1.5" transform={t}/>;
        })}
        {/* Needle */}
        <G transform={needleTransform(angle)}>
          <Path d="M 80 90 L 79 84 L 80 26 L 81 84 Z" fill={theme.needle}/>
          <Circle cx="80" cy="90" r="6" fill={theme.bg} stroke={theme.chrome} strokeWidth="1.5"/>
          <Circle cx="80" cy="90" r="2.5" fill={theme.needle}/>
        </G>
        {/* Readout */}
        <Path d="M 50 72 L 110 72 L 110 86 L 50 86 Z" fill={theme.bg} stroke={theme.border2}/>
        <SvgText x="80" y="83" textAnchor="middle" fontSize="9" fill={theme.chromeHi}
          fontFamily="monospace">{value.toFixed(2)}G</SvgText>
      </Svg>
    </View>
  );
}

const s = StyleSheet.create({
  housing: { flex: 1, alignItems: 'center', padding: 10, borderRadius: 6, borderWidth: 1,
             paddingTop: 8 },
  label:   { fontSize: 9, fontFamily: 'monospace', letterSpacing: 2, marginBottom: 4 },
});
