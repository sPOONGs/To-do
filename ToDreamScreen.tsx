import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { AccessibilityInfo, ActivityIndicator, Alert, Animated, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SettingsIcon } from './DalviUi';
import { dailyEncouragement, DREAM_STORAGE_KEY, dreamDateKey, readDreamData, saveDreamLog, starterRecommendations, type DreamData, type DreamPreparation } from './dreamModel';

type Theme = { primary: string; secondary: string; soft: string; background: string };
type Props = { theme: Theme; now: Date; hasTodaySchedule: boolean; onSettings: () => void; onAddSchedule: (title: string) => void; onSwipeBlockedChange: (blocked: boolean) => void };
type Editor = { kind: 'goal' } | { kind: 'log'; date: string } | { kind: 'preparation'; id?: string } | { kind: 'history' };

export default function ToDreamScreen({ theme, now, hasTodaySchedule, onSettings, onAddSchedule, onSwipeBlockedChange }: Props) {
  const [data, setData] = useState<DreamData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [draft, setDraft] = useState('');
  const [goalDraft, setGoalDraft] = useState('');
  const [showAllPreparations, setShowAllPreparations] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const mounted = useRef(true);
  const writeLock = useRef(false);
  const today = dreamDateKey(now);
  const ink = { color: theme.primary };
  // The warm theme's secondary is a pale surface color, not readable body ink.
  const muted = { color: '#64748B' };
  const inputStyle = [s.input, { color: theme.primary, backgroundColor: theme.background }];

  useEffect(() => {
    mounted.current = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted.current) setReduceMotion(value); }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { mounted.current = false; subscription.remove(); };
  }, []);
  const load = async () => {
    setLoadError(false);
    try {
      const saved = readDreamData(await AsyncStorage.getItem(DREAM_STORAGE_KEY));
      if (mounted.current) { setData(saved); setGoalDraft(saved.goal); }
    } catch { if (mounted.current) setLoadError(true); }
  };
  useEffect(() => { void load(); }, []);
  const [inputFocused, setInputFocused] = useState(false);
  useEffect(() => {
    onSwipeBlockedChange(!!editor || busy || inputFocused);
    return () => onSwipeBlockedChange(false);
  }, [editor, busy, inputFocused, onSwipeBlockedChange]);

  const persist = async (next: DreamData, after?: () => void) => {
    if (!data || writeLock.current || loadError) return;
    writeLock.current = true; setBusy(true);
    try {
      await AsyncStorage.setItem(DREAM_STORAGE_KEY, JSON.stringify(next));
      if (mounted.current) { setData(next); after?.(); }
      void Haptics.selectionAsync().catch(() => {});
    } catch {
      if (mounted.current) Alert.alert('아직 저장되지 않았어요', '작성한 내용은 그대로예요. 잠시 후 다시 시도해 주세요.');
    } finally {
      writeLock.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const closeEditor = () => { if (!busy) { Keyboard.dismiss(); setEditor(null); } };
  const editGoal = () => { setDraft(data?.goal ?? ''); setEditor({ kind: 'goal' }); };
  const editLog = (date = today) => { setDraft(data?.logs.find(log => log.date === date)?.text ?? ''); setEditor({ kind: 'log', date }); };
  const editPreparation = (item?: DreamPreparation) => { setDraft(item?.title ?? ''); setEditor({ kind: 'preparation', id: item?.id }); };
  const saveEditor = () => {
    if (!data || !editor || editor.kind === 'history' || !draft.trim()) return;
    let next = data;
    if (editor.kind === 'goal') next = { ...data, goal: draft.trim() };
    if (editor.kind === 'log') next = saveDreamLog(data, editor.date, draft);
    if (editor.kind === 'preparation') {
      const id = editor.id;
      const preparations = id ? data.preparations.map(item => item.id === id ? { ...item, title: draft.trim() } : item)
        : [...data.preparations, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, title: draft.trim(), done: false, createdAt: new Date().toISOString() }];
      next = { ...data, preparations };
    }
    void persist(next, () => { Keyboard.dismiss(); setEditor(null); });
  };
  const preparationMenu = (item: DreamPreparation) => Alert.alert(item.title, undefined, [
    { text: '이름 다듬기', onPress: () => editPreparation(item) },
    { text: '삭제', style: 'destructive', onPress: () => Alert.alert('이 준비를 지울까요?', '다른 기록은 그대로 남아요.', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => { if (data) void persist({ ...data, preparations: data.preparations.filter(value => value.id !== item.id) }); } },
    ]) },
    { text: '취소', style: 'cancel' },
  ]);
  const todayLog = data?.logs.find(log => log.date === today);
  const recentLogs = (data?.logs ?? []).filter(log => log.date !== today).slice(0, 2);
  const suggestions = starterRecommendations({ goal: data?.goal ?? '', date: now, hasTodaySchedule });
  const preparations = data?.preparations ?? [];
  const visiblePreparations = showAllPreparations ? preparations : preparations.slice(0, 4);
  const title = editor?.kind === 'goal' ? '마음에 품은 꿈' : editor?.kind === 'log' ? `${Number(editor.date.slice(5, 7))}월 ${Number(editor.date.slice(8))}일의 한 걸음` : editor?.kind === 'history' ? '차곡차곡 남긴 발자국' : editor?.id ? '준비 다듬기' : '다음 한 걸음';

  return <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <View style={s.header}>
      <View style={s.headerText}><Text style={[s.headerEyebrow, ink]}>DALVI · 꿈을 위한 공간</Text><Text style={[s.heading, ink]}>To dream</Text></View>
      <SoftButton label="설정" onPress={onSettings} disabled={busy} reduceMotion={reduceMotion} style={s.iconButton}><SettingsIcon color={theme.primary} /></SoftButton>
    </View>
    <View style={s.encouragement}><Text style={[s.encouragementMoon, ink]}>☾</Text><Text style={[s.encouragementText, ink]}>{dailyEncouragement(now)}</Text></View>
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={s.content}>
      {loadError ? <View style={s.card}><Text style={[s.cardTitle, ink]}>꿈의 기록을 불러오지 못했어요</Text><Text style={[s.body, muted]}>저장된 기록을 지우지 않고 다시 살펴볼게요</Text><SoftButton onPress={() => void load()} reduceMotion={reduceMotion} style={s.textButton}><Text style={[s.actionText, ink]}>다시 불러오기</Text></SoftButton></View>
        : !data ? <ActivityIndicator color={theme.primary} style={s.loading} />
        : !data.goal ? <View style={s.onboarding}>
          <View style={[s.moon, { backgroundColor: theme.soft }]}><View style={[s.moonCutout, { backgroundColor: theme.background }]} /></View>
          <Text style={[s.welcomeTitle, ink]}>어떤 꿈을 품고 있나요?</Text>
          <Text style={[s.welcomeText, muted]}>아직 선명하지 않아도 괜찮아요{ '\n' }마음이 향하는 곳부터 시작해도 좋아요</Text>
          <TextInput value={goalDraft} onChangeText={setGoalDraft} maxLength={80} editable={!busy} onFocus={() => setInputFocused(true)} onBlur={() => setInputFocused(false)} accessibilityLabel="나의 목표 또는 꿈" placeholder="예: 나만의 앱을 만드는 개발자" placeholderTextColor={muted.color} style={[s.input, s.goalInput, { color: theme.primary, backgroundColor: '#fff' }]} />
          <SoftButton disabled={busy || !goalDraft.trim()} reduceMotion={reduceMotion} onPress={() => void persist({ ...data, goal: goalDraft.trim() }, () => { Keyboard.dismiss(); setInputFocused(false); })} style={[s.primaryButton, { backgroundColor: theme.primary }, (!goalDraft.trim() || busy) && s.disabled]}><Text style={s.primaryText}>{busy ? '담고 있어요…' : '나의 꿈 담기'}</Text></SoftButton>
        </View> : <>
          <View style={[s.card, { backgroundColor: theme.soft }]}>
            <View style={s.sectionRow}><Text style={[s.eyebrow, muted]}>내가 향하는 곳</Text><SoftButton label="꿈 수정" disabled={busy} reduceMotion={reduceMotion} onPress={editGoal} style={s.smallButton}><Text style={[s.smallText, muted]}>수정</Text></SoftButton></View>
            <Text style={[s.goalTitle, ink]}>{data.goal}</Text>
          </View>
          <View style={s.card}>
            <View style={s.sectionRow}><Text style={[s.cardTitle, ink]}>오늘 꿈을 위해 한 걸음</Text><Text style={[s.smallText, muted]}>{now.getMonth() + 1}.{now.getDate()}</Text></View>
            <Text style={[s.body, todayLog ? ink : muted]} numberOfLines={todayLog ? 4 : undefined}>{todayLog?.text ?? '배운 것, 시도한 것, 잠시 쉬어간 마음도\n오늘의 작은 발자국으로 남겨 봐요'}</Text>
            <SoftButton disabled={busy} reduceMotion={reduceMotion} onPress={() => editLog()} style={[s.secondaryButton, { backgroundColor: theme.background }]}><Text style={[s.actionText, ink]}>{todayLog ? '오늘의 기록 이어 쓰기' : '오늘의 한 걸음 남기기'}</Text></SoftButton>
          </View>
          {suggestions.map(suggestion => <View key={suggestion.id} style={[s.card, { backgroundColor: theme.soft }]}>
            <Text style={[s.eyebrow, muted]}>오늘의 작은 제안</Text>
            <Text style={[s.suggestionTitle, ink]}>{suggestion.title}</Text>
            <Text style={[s.body, muted]}>{suggestion.detail}</Text>
            <SoftButton label={`${suggestion.title} 오늘 일정으로 담기`} disabled={busy} reduceMotion={reduceMotion} onPress={() => onAddSchedule(suggestion.title)} style={s.textButton}><Text style={[s.actionText, ink]}>오늘 일정으로 담기  +</Text></SoftButton>
          </View>)}
          <View style={s.card}>
            <View style={s.sectionRow}><Text style={[s.cardTitle, ink]}>앞으로 준비할 것</Text><SoftButton label="준비할 것 추가" disabled={busy} reduceMotion={reduceMotion} onPress={() => editPreparation()} style={s.smallButton}><Text style={[s.plus, ink]}>+</Text></SoftButton></View>
            {!preparations.length ? <Text style={[s.body, muted]}>지금 떠오르는 작은 준비부터{ '\n' }하나씩 모아 가요</Text> : visiblePreparations.map(item => <View key={item.id} style={s.preparationRow}>
              <SoftButton label={`${item.title} ${item.done ? '완료 취소' : '완료'}`} role="checkbox" checked={item.done} disabled={busy} reduceMotion={reduceMotion} onPress={() => void persist({ ...data, preparations: data.preparations.map(value => value.id === item.id ? { ...value, done: !value.done } : value) })} style={s.checkTouch}><View style={[s.check, { borderColor: item.done ? theme.primary : muted.color, backgroundColor: item.done ? theme.primary : '#fff' }]}>{item.done && <View style={s.checkGlyph}><View style={s.checkShort} /><View style={s.checkLong} /></View>}</View></SoftButton>
              <Text style={[s.preparationTitle, ink, item.done && [s.done, muted]]}>{item.title}</Text>
              <SoftButton label={`${item.title} 더보기`} disabled={busy} reduceMotion={reduceMotion} onPress={() => preparationMenu(item)} style={s.moreButton}><Text style={[s.more, muted]}>···</Text></SoftButton>
            </View>)}
            {preparations.length > 4 && <SoftButton reduceMotion={reduceMotion} onPress={() => setShowAllPreparations(!showAllPreparations)} style={s.textButton}><Text style={[s.smallText, muted]}>{showAllPreparations ? '접어두기' : `준비 ${preparations.length}개 모두 보기`}</Text></SoftButton>}
          </View>
          {!!recentLogs.length && <View style={s.historySection}>
            <View style={s.sectionRow}><Text style={[s.cardTitle, ink]}>차곡차곡 남긴 발자국</Text><SoftButton reduceMotion={reduceMotion} onPress={() => setEditor({ kind: 'history' })} style={s.smallButton}><Text style={[s.smallText, muted]}>모두 보기</Text></SoftButton></View>
            {recentLogs.map(log => <SoftButton key={log.date} reduceMotion={reduceMotion} onPress={() => editLog(log.date)} style={s.historyRow}><Text style={[s.smallText, muted]}>{log.date.replaceAll('-', '.')}</Text><Text style={[s.body, ink]} numberOfLines={2}>{log.text}</Text></SoftButton>)}
          </View>}
        </>}
    </ScrollView>
    <Modal visible={!!editor} transparent animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={closeEditor}>
      <KeyboardAvoidingView style={s.modalRoot} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable accessibilityLabel="창 닫기" disabled={busy} onPress={closeEditor} style={s.backdrop} />
        <SafeAreaView style={s.sheet}>
          <View style={s.handle} />
          <View style={s.sheetHeader}><Text style={[s.cardTitle, ink]}>{title}</Text><SoftButton label="닫기" disabled={busy} reduceMotion={reduceMotion} onPress={closeEditor} style={s.smallButton}><Text style={[s.smallText, muted]}>닫기</Text></SoftButton></View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.sheetContent}>
            {editor?.kind === 'history' ? data?.logs.length ? data.logs.map(log => <SoftButton key={log.date} reduceMotion={reduceMotion} onPress={() => editLog(log.date)} style={s.historyRow}><Text style={[s.smallText, muted]}>{log.date.replaceAll('-', '.')}</Text><Text style={[s.body, ink]}>{log.text}</Text>{log.goal !== data.goal && <Text style={[s.oldGoal, muted]}>그때의 꿈 · {log.goal}</Text>}</SoftButton>) : <Text style={[s.body, muted]}>첫 발자국을 기다리고 있어요</Text> : <>
              <TextInput accessibilityLabel={title} value={draft} onChangeText={setDraft} editable={!busy} multiline={editor?.kind === 'log'} maxLength={editor?.kind === 'log' ? 1500 : editor?.kind === 'goal' ? 80 : 120} style={[inputStyle, editor?.kind === 'log' && s.logInput]} placeholder={editor?.kind === 'log' ? '오늘 해본 일, 마음에 남은 것…' : editor?.kind === 'goal' ? '마음이 향하는 곳' : '지금 시작할 수 있는 작은 준비'} placeholderTextColor={muted.color} textAlignVertical="top" />
              {editor?.kind === 'goal' && <Text style={[s.helper, muted]}>꿈이 달라져도, 지금까지의 발자국은 그대로 남아요</Text>}
              <View style={s.sheetButtons}><SoftButton containerStyle={s.sheetButtonSlot} disabled={busy} reduceMotion={reduceMotion} onPress={closeEditor} style={[s.secondaryButton, s.buttonFlex, { backgroundColor: theme.background }]}><Text style={[s.actionText, muted]}>취소</Text></SoftButton><SoftButton containerStyle={s.sheetButtonSlot} disabled={busy || !draft.trim()} reduceMotion={reduceMotion} onPress={saveEditor} style={[s.primaryButton, s.buttonFlex, { backgroundColor: theme.primary }, (!draft.trim() || busy) && s.disabled]}><Text style={s.primaryText}>{busy ? '담고 있어요…' : '저장'}</Text></SoftButton></View>
            </>}
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  </KeyboardAvoidingView>;
}

type SoftButtonProps = { children: React.ReactNode; onPress: () => void; label?: string; disabled?: boolean; reduceMotion: boolean; style?: import('react-native').StyleProp<import('react-native').ViewStyle>; containerStyle?: import('react-native').StyleProp<import('react-native').ViewStyle>; role?: 'button' | 'checkbox'; checked?: boolean };
function SoftButton({ children, onPress, label, disabled, reduceMotion, style, containerStyle, role = 'button', checked }: SoftButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => () => scale.stopAnimation(), [scale]);
  const animate = (value: number) => {
    if (reduceMotion) return;
    Animated.spring(scale, { toValue: value, damping: 20, stiffness: 420, mass: 0.7, useNativeDriver: true }).start();
  };
  return <Pressable style={containerStyle} accessibilityLabel={label} accessibilityRole={role} accessibilityState={{ disabled, ...(role === 'checkbox' ? { checked } : {}) }} disabled={disabled} onPressIn={() => animate(0.965)} onPressOut={() => animate(1)} onPress={onPress}><Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View></Pressable>;
}

const s = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  headerText: { flex: 1, minWidth: 0 },
  headerEyebrow: { fontSize: 10, letterSpacing: 1.4, fontWeight: '700', marginBottom: 4 },
  heading: { fontFamily: 'Nunito_800ExtraBold', fontSize: 32, lineHeight: 40, letterSpacing: -0.6 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: '#fff' },
  encouragement: { marginHorizontal: 20, paddingHorizontal: 8, paddingVertical: 7, marginBottom: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  encouragementMoon: { fontSize: 13, lineHeight: 20, opacity: 0.62 },
  encouragementText: { fontFamily: 'Nunito_600SemiBold_Italic', fontSize: 13, lineHeight: 20, letterSpacing: -0.15, textAlign: 'center', opacity: 0.82 },
  content: { padding: 20, paddingTop: 12, paddingBottom: 32, gap: 14 },
  card: { backgroundColor: '#fff', borderRadius: 23, padding: 18, gap: 10 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  eyebrow: { fontSize: 12, fontWeight: '600' },
  cardTitle: { fontSize: 16, fontWeight: '700', flexShrink: 1 },
  body: { fontSize: 14, lineHeight: 22 },
  smallText: { fontSize: 12, fontWeight: '600' },
  smallButton: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  goalTitle: { fontSize: 22, lineHeight: 31, fontWeight: '700', marginBottom: 2 },
  suggestionTitle: { fontSize: 16, lineHeight: 24, fontWeight: '700' },
  actionText: { fontSize: 14, fontWeight: '700' },
  primaryButton: { borderRadius: 16, minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondaryButton: { borderRadius: 16, minHeight: 46, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 12 },
  textButton: { minHeight: 44, justifyContent: 'center', paddingVertical: 8, alignSelf: 'flex-start' },
  disabled: { opacity: 0.4 },
  onboarding: { paddingVertical: 24, gap: 18 },
  moon: { width: 46, height: 46, borderRadius: 23, overflow: 'hidden', alignSelf: 'center', marginBottom: 6 },
  moonCutout: { position: 'absolute', width: 38, height: 38, borderRadius: 19, left: 17, top: -4 },
  welcomeTitle: { fontSize: 24, fontWeight: '700', textAlign: 'center' },
  welcomeText: { fontSize: 14, lineHeight: 24, textAlign: 'center', marginBottom: 12 },
  input: { borderRadius: 16, padding: 16, fontSize: 16, minHeight: 54 },
  goalInput: { marginTop: 4 },
  loading: { marginTop: 60 },
  preparationRow: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 45 },
  preparationTitle: { flex: 1, fontSize: 14, lineHeight: 21 },
  done: { textDecorationLine: 'line-through', opacity: 0.7 },
  checkTouch: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  check: { width: 22, height: 22, borderWidth: 1.6, borderRadius: 7, justifyContent: 'center', alignItems: 'center' },
  checkGlyph: { width: 14, height: 12 },
  checkShort: { position: 'absolute', width: 6, height: 2, left: 1, top: 6, borderRadius: 2, backgroundColor: '#fff', transform: [{ rotate: '44deg' }] },
  checkLong: { position: 'absolute', width: 10, height: 2, left: 4, top: 5, borderRadius: 2, backgroundColor: '#fff', transform: [{ rotate: '-46deg' }] },
  moreButton: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  more: { fontSize: 25, fontWeight: '700', marginTop: -7 },
  plus: { fontSize: 25, fontWeight: '400' },
  historySection: { paddingHorizontal: 4, gap: 7 },
  historyRow: { paddingVertical: 13, gap: 5, borderBottomColor: '#E8EDF2', borderBottomWidth: StyleSheet.hairlineWidth },
  oldGoal: { fontSize: 11, marginTop: 4 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(23,36,61,0.22)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '83%', minHeight: 210, paddingBottom: 12 },
  handle: { width: 38, height: 4, borderRadius: 2, backgroundColor: '#D9DFE7', alignSelf: 'center', marginTop: 12, marginBottom: 12 },
  sheetHeader: { paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  sheetContent: { padding: 22, paddingTop: 12, paddingBottom: 26, gap: 12 },
  logInput: { minHeight: 160, maxHeight: 260, lineHeight: 25 },
  helper: { fontSize: 12, lineHeight: 20 },
  sheetButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 },
  sheetButtonSlot: { flexGrow: 1, flexBasis: 120, minWidth: 115, maxWidth: '100%' },
  buttonFlex: { width: '100%' },
});
