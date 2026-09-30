import { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

export type MoonTheme = { primary: string; secondary: string; soft: string; background: string };

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (alive) setReduced(value); }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => { alive = false; subscription.remove(); };
  }, []);
  return reduced;
}

export function SettingsIcon({ color, size = 20, backgroundColor = '#FFFFFF' }: { color: string; size?: number; backgroundColor?: string }) {
  return <View accessible={false} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    {[0, 45, 90, 135].map(angle => <View key={angle} style={{ position: 'absolute', width: size * .25, height: size, borderRadius: size * .1, backgroundColor: color, transform: [{ rotate: `${angle}deg` }] }} />)}
    <View style={{ position: 'absolute', width: size * .7, height: size * .7, borderRadius: size, backgroundColor: color }} />
    <View style={{ width: size * .45, height: size * .45, borderRadius: size, backgroundColor }} />
  </View>;
}

// Separate rounded strokes avoid font baselines and sharp Unicode glyphs on iOS.
export function ChevronDown({ color, size = 16 }: { color: string; size?: number }) {
  return <View accessible={false} style={{ width: size, height: size, position: 'relative' }}>
    <View style={{ position: 'absolute', left: size * .08, top: size * .46, width: size * .51, height: size * .15, borderRadius: size, backgroundColor: color, transform: [{ rotate: '43deg' }] }} />
    <View style={{ position: 'absolute', right: size * .08, top: size * .46, width: size * .51, height: size * .15, borderRadius: size, backgroundColor: color, transform: [{ rotate: '-43deg' }] }} />
  </View>;
}

export function StoreIcon({ color, size = 22 }: { color: string; size?: number }) {
  return <View accessible={false} style={{ width: size, height: size }}>
    <View style={{ position: 'absolute', left: size * .12, top: size * .4, width: size * .76, height: size * .53, borderWidth: 1.7, borderColor: color, borderRadius: 4 }} />
    <View style={{ position: 'absolute', left: size * .07, top: size * .12, width: size * .86, height: size * .36, borderWidth: 1.7, borderColor: color, borderTopLeftRadius: 5, borderTopRightRadius: 5, borderBottomLeftRadius: 4, borderBottomRightRadius: 4 }} />
    {[.35, .63].map(x => <View key={x} style={{ position: 'absolute', left: size * x, top: size * .18, width: 1.7, height: size * .22, borderRadius: 2, backgroundColor: color }} />)}
    <View style={{ position: 'absolute', left: size * .43, top: size * .62, width: size * .2, height: size * .26, borderWidth: 1.5, borderColor: color, borderRadius: 2 }} />
  </View>;
}

export function HomeIcon({ color }: { color: string }) {
  return <View accessible={false} style={{ width: 24, height: 24 }}>
    <View style={{ position: 'absolute', left: 4, top: 3, width: 16, height: 16, borderTopWidth: 1.8, borderLeftWidth: 1.8, borderTopLeftRadius: 6, borderColor: color, transform: [{ rotate: '45deg' }] }} />
    <View style={{ position: 'absolute', left: 3, top: 10, width: 18, height: 12, borderWidth: 1.8, borderTopWidth: 0, borderBottomLeftRadius: 6, borderBottomRightRadius: 6, borderColor: color }} />
    <View style={{ position: 'absolute', left: 9, top: 15, width: 6, height: 7, borderWidth: 1.8, borderBottomWidth: 0, borderTopLeftRadius: 3, borderTopRightRadius: 3, borderColor: color }} />
  </View>;
}

export function CalendarIcon({ color }: { color: string }) {
  return <View accessible={false} style={icon.calendar}>
    <View style={[icon.calendarBody, { borderColor: color }]} />
    <View style={[icon.calendarLine, { backgroundColor: color }]} />
    <View style={[icon.calendarRing, { backgroundColor: color, left: 6 }]} />
    <View style={[icon.calendarRing, { backgroundColor: color, right: 6 }]} />
    {[0, 1, 2, 3].map(index => <View key={index} style={[icon.calendarDot, { backgroundColor: color, left: 6 + (index % 2) * 6, top: 11 + Math.floor(index / 2) * 5 }]} />)}
  </View>;
}

export function LaterIcon({ color }: { color: string }) {
  return <Svg accessible={false} width={24} height={24} viewBox="0 0 24 24" fill="none">
    <Path d="M18.66 15.8 A9 9 0 1 1 19.5 12 L19.5 12.5 M16 9.5 L19.5 12.5 L22 8.5" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M10.5 6 V12.5 H6.5" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>;
}

export function DreamIcon({ color }: { color: string }) {
  return <View accessible={false} style={icon.dream}>
    <View style={[icon.dreamBubble, { borderColor: color }]} />
    <View style={[icon.dreamTail, { borderColor: color }]} />
    {[6.5, 10.5, 14.5].map(left => <View key={left} style={[icon.dreamDot, { backgroundColor: color, left }]} />)}
  </View>;
}

const icon = StyleSheet.create({
  home: { width: 22, height: 22 }, roof: { width: 13, height: 13, borderTopWidth: 1.8, borderLeftWidth: 1.8, borderRadius: 2, position: 'absolute', left: 4.5, top: 2, transform: [{ rotate: '45deg' }] },
  house: { position: 'absolute', left: 3, top: 9, width: 16, height: 12, borderWidth: 1.8, borderTopWidth: 0, borderBottomLeftRadius: 4, borderBottomRightRadius: 4 },
  door: { position: 'absolute', left: 10, bottom: 3, width: 2, height: 5, borderRadius: 1 },
  calendar: { height: 22, position: 'relative', width: 22 }, calendarBody: { borderRadius: 5, borderWidth: 1.7, bottom: 1, left: 2, position: 'absolute', right: 2, top: 4 }, calendarLine: { height: 1.5, left: 3, position: 'absolute', right: 3, top: 8 }, calendarRing: { borderRadius: 1, height: 5, position: 'absolute', top: 1, width: 2 }, calendarDot: { borderRadius: 1.5, height: 2.5, position: 'absolute', width: 2.5 },
  later: { height: 24, position: 'relative', width: 22 }, laterWithoutDots: { height: 22, position: 'relative', width: 22 }, clockCircle: { borderRadius: 9, borderWidth: 1.7, height: 18, left: 1, position: 'absolute', top: 1, width: 18 }, clockHandVertical: { borderRadius: 2, height: 6, left: 9, position: 'absolute', top: 5, width: 1.8 }, clockHandHorizontal: { borderRadius: 2, height: 1.8, left: 9, position: 'absolute', top: 10, transform: [{ rotate: '32deg' }], width: 6 }, clockArrowOne: { borderRadius: 2, height: 1.8, position: 'absolute', right: 0, top: 8, transform: [{ rotate: '-42deg' }], width: 6 }, clockArrowTwo: { borderRadius: 2, height: 1.8, position: 'absolute', right: 0, top: 8, transform: [{ rotate: '42deg' }], width: 6 }, laterDot: { borderRadius: 2, bottom: 0, height: 3, position: 'absolute', width: 3 },
  dream: { height: 22, position: 'relative', width: 22 }, dreamBubble: { borderRadius: 9, borderWidth: 1.7, height: 16, left: 1, position: 'absolute', top: 1, width: 20 }, dreamTail: { borderBottomWidth: 1.7, borderRightWidth: 1.7, bottom: 1, height: 7, left: 4, position: 'absolute', transform: [{ rotate: '31deg' }], width: 7 }, dreamDot: { borderRadius: 1.5, height: 2.5, position: 'absolute', top: 8, width: 2.5 },
});
