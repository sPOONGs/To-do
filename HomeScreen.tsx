import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Easing, Keyboard, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useReducedMotion, type MoonTheme } from './DalviUi';
import { dailyEncouragement } from './dreamModel';
import { scheduleDisplayTitle } from './plannerModel';
import { DAY_NAMES, ROUTINE_COLORS, WEEK_DAYS, getHomeScheduleSummary, homeScheduleTime, minuteLabel, readWeeklyRoutines, routineConflict, timetableRange, type HomeSchedule, type WeeklyRoutine } from './weeklyModel';

type Props = {
  theme: MoonTheme;
  now: Date;
  schedules: HomeSchedule[];
  onAddSchedule: () => void;
  onEditSchedule: (schedule: HomeSchedule) => void;
  onDeleteSchedule: (schedule: HomeSchedule) => void;
  onToggleSchedule: (schedule: HomeSchedule) => void;
  onCompleteSchedules: (scheduleIds: string[]) => void;
  onOpenTodo: () => void;
  onSwipeBlockedChange: (blocked: boolean) => void;
  onTimetableTouch: (active: boolean) => void;
};
const storageKey = '@dalvi/weekly_routines_v1';
const hourHeight = 28;
const dateForMinute = (minute: number) => new Date(2026, 0, 1, Math.floor((minute % 1440) / 60), minute % 60);

export default function HomeScreen({ theme, now, schedules, onEditSchedule, onToggleSchedule, onCompleteSchedules, onSwipeBlockedChange, onTimetableTouch }: Props) {
  const [routines, setRoutines] = useState<WeeklyRoutine[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<'list' | 'edit' | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [days, setDays] = useState<number[]>([now.getDay()]);
  const [start, setStart] = useState(540);
  const [end, setEnd] = useState(600);
  const [color, setColor] = useState(ROUTINE_COLORS[0]);
  const [clock, setClock] = useState<'start' | 'end' | null>(null);
  const [agendaVisible, setAgendaVisible] = useState(false);
  const reduceMotion = useReducedMotion();
  const sheetProgress = useRef(new Animated.Value(0)).current;
  const sheetDrag = useRef(new Animated.Value(0)).current;
  const closing = useRef(false);
  const saving = useRef(false);
  const alive = useRef(true);
  const [gridWidth, setGridWidth] = useState(280);
  const summary = useMemo(() => getHomeScheduleSummary(schedules, now), [schedules, now]);
  const homeWhisper = useMemo(() => dailyEncouragement(now, 'home-primary'), [now]);
  const ink = { color: theme.primary };
  const sortedRoutines = useMemo(() => [...routines].sort((a, b) => a.start - b.start), [routines]);
  const visibleRange = useMemo(() => timetableRange(routines), [routines]);
  const visibleStartHour = visibleRange.startHour;
  const visibleHours = useMemo(() => Array.from({ length: visibleRange.endHour - visibleStartHour + 1 }, (_, index) => visibleStartHour + index), [visibleRange.endHour, visibleStartHour]);
  const visibleTableHeight = (visibleRange.endHour - visibleStartHour) * hourHeight + 18;

  const load = async () => {
    setLoaded(false); setLoadFailed(false);
    try {
      const values = readWeeklyRoutines(await AsyncStorage.getItem(storageKey));
      if (alive.current) { setRoutines(values); setLoaded(true); }
    } catch { if (alive.current) setLoadFailed(true); }
  };
  useEffect(() => {
    alive.current = true;
    void load();
    return () => { alive.current = false; sheetProgress.stopAnimation(); sheetDrag.stopAnimation(); };
  }, [sheetDrag, sheetProgress]);
  useEffect(() => {
    onSwipeBlockedChange(sheet !== null || busy || agendaVisible);
    return () => onSwipeBlockedChange(false);
  }, [sheet, busy, agendaVisible, onSwipeBlockedChange]);
  useEffect(() => {
    if (sheet === null) return;
    sheetDrag.setValue(0);
    Animated.timing(sheetProgress, { toValue: 1, duration: reduceMotion ? 0 : 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [sheet, reduceMotion, sheetProgress, sheetDrag]);

  const closeSheet = () => {
    if (!alive.current || saving.current || closing.current) return;
    closing.current = true; Keyboard.dismiss();
    Animated.timing(sheetProgress, { toValue: 0, duration: reduceMotion ? 0 : 210, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => {
      if (alive.current) { setSheet(null); setClock(null); sheetDrag.setValue(0); }
      closing.current = false;
    });
  };
  const closeRef = useRef(closeSheet);
  closeRef.current = closeSheet;
  const handlePan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => !saving.current && gesture.dy > 5 && gesture.dy > Math.abs(gesture.dx),
    onPanResponderMove: (_, gesture) => sheetDrag.setValue(Math.max(0, gesture.dy)),
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dy > 80 || (gesture.dy > 20 && gesture.vy > .7)) closeRef.current();
      else if (reduceMotion) sheetDrag.setValue(0);
      else Animated.spring(sheetDrag, { toValue: 0, damping: 24, stiffness: 240, useNativeDriver: true }).start();
    },
    onPanResponderTerminate: () => { if (reduceMotion) sheetDrag.setValue(0); else Animated.spring(sheetDrag, { toValue: 0, damping: 24, stiffness: 240, useNativeDriver: true }).start(); },
  }), [sheetDrag, reduceMotion]);

  const openEditor = (routine?: WeeklyRoutine) => {
    if (!loaded || saving.current || closing.current) return;
    setEditingId(routine?.id ?? null); setTitle(routine?.title ?? '');
    setDays(routine ? [...routine.days] : [now.getDay()]);
    setStart(routine?.start ?? 540); setEnd(routine?.end ?? 600);
    setColor(routine?.color ?? ROUTINE_COLORS[0]); setClock(null); setSheet('edit');
  };
  const persist = async (values: WeeklyRoutine[]) => {
    if (!loaded || saving.current || closing.current || !alive.current) return false;
    saving.current = true; setBusy(true);
    try {
      await AsyncStorage.setItem(storageKey, JSON.stringify(values));
      if (alive.current) setRoutines(values);
      void Haptics.selectionAsync().catch(() => {});
      return true;
    } catch { Alert.alert('잠시 저장하지 못했어요', '적어 둔 내용은 그대로 있어요. 잠시 후 다시 저장해 주세요.'); return false; }
    finally { saving.current = false; if (alive.current) setBusy(false); }
  };
  const save = async () => {
    if (saving.current || closing.current || !alive.current) return;
    if (!title.trim()) { Alert.alert('어떤 일과인가요?', '일과의 이름을 짧게 담아 주세요.'); return; }
    if (!days.length) { Alert.alert('함께할 요일을 골라 주세요', '매주 반복할 요일을 하나 이상 선택할 수 있어요.'); return; }
    if (end <= start) { Alert.alert('시간을 한 번 살펴봐 주세요', '마치는 시간은 시작보다 늦어야 해요. 자정을 지나 이어지는 일과는 날짜별로 나누어 담을 수 있어요.'); return; }
    const candidate: WeeklyRoutine = { id: editingId ?? `week-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, title: title.trim(), days: WEEK_DAYS.filter(day => days.includes(day)), start, end, color };
    const conflict = routineConflict(routines, candidate);
    if (conflict) { Alert.alert('이 시간에는 다른 일과가 있어요', `${DAY_NAMES[conflict.day]}요일의 ‘${conflict.routine.title}’와 시간이 겹쳐요. 조금 다른 시간에 담아 주세요.`); return; }
    const next = editingId ? routines.map(item => item.id === editingId ? candidate : item) : [...routines, candidate];
    if (await persist(next)) {
      closeSheet();
    }
  };
  const remove = () => {
    if (!editingId || saving.current || closing.current) return;
    Alert.alert('일과를 지울까요?', '선택한 요일의 반복 일과가 함께 지워져요.', [
      { text: '그대로 둘게요', style: 'cancel' },
      { text: '지우기', style: 'destructive', onPress: () => { void (async () => { if (await persist(routines.filter(item => item.id !== editingId))) closeSheet(); })(); } },
    ]);
  };
  return <View style={s.screen}>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <View style={s.sectionHeading}>
        <View style={s.grow}><Text style={[s.heading, ink]}>한 주의 리듬</Text><Text style={s.caption}>매주 돌아오는 시간을 한눈에 만나봐요</Text></View>
        <SoftButton label="일과 추가" onPress={() => openEditor()} disabled={!loaded || busy} reduced={reduceMotion} style={{ backgroundColor: theme.soft }}><Text style={[s.plus, ink]}>＋</Text></SoftButton>
      </View>
      <View style={s.timetable} onTouchCancel={() => onTimetableTouch(false)} onTouchEnd={() => onTimetableTouch(false)} onTouchStart={() => onTimetableTouch(true)}>
        <View style={s.weekHeader}><View style={s.timeGutter} />{WEEK_DAYS.map(day => <View key={day} style={s.dayHeading}><View style={[s.dayPill, day === now.getDay() && { backgroundColor: theme.soft }]}><Text maxFontSizeMultiplier={1.8} style={[s.dayText, day === now.getDay() ? ink : s.muted]}>{DAY_NAMES[day]}</Text></View></View>)}</View>
        <View style={[s.tableViewport, { height: visibleTableHeight }]}>
          <View style={[s.tableBody, { height: visibleTableHeight }]}>
            <View style={s.timeGutter}>{visibleHours.map(hour => <Text key={hour} maxFontSizeMultiplier={1.4} style={[s.hour, { top: (hour - visibleStartHour) * hourHeight + 4 }]}>{String(hour).padStart(2, '0')}</Text>)}</View>
            <View style={s.grid} onLayout={event => setGridWidth(event.nativeEvent.layout.width)}>
              {visibleHours.map(hour => <View key={hour} style={[s.hourLine, { top: (hour - visibleStartHour) * hourHeight }]} />)}
              {WEEK_DAYS.map((day, index) => <View pointerEvents="none" key={day} style={[s.dayColumn, { left: index * gridWidth / 7, width: gridWidth / 7, backgroundColor: day === now.getDay() ? `${theme.soft}77` : 'transparent' }]} />)}
              {sortedRoutines.flatMap(routine => routine.days.map(day => {
                const durationHeight = (routine.end - routine.start) / 60 * hourHeight;
                return <Pressable key={`${routine.id}-${day}`} accessibilityRole="button" accessibilityLabel={`${DAY_NAMES[day]}요일 ${routine.title}, ${minuteLabel(routine.start)}부터 ${minuteLabel(routine.end)}. 수정하기`} onPress={() => openEditor(routine)} disabled={busy}
                  style={({ pressed }) => [s.routine, { left: WEEK_DAYS.indexOf(day) * gridWidth / 7 + 2, width: gridWidth / 7 - 4, top: (routine.start / 60 - visibleStartHour) * hourHeight + 1, height: Math.max(3, durationHeight - 2), backgroundColor: routine.color, opacity: pressed ? .65 : 1 }]}>
                  {durationHeight >= 22 && <Text maxFontSizeMultiplier={1.5} style={[s.routineTitle, ink]} numberOfLines={Math.max(1, Math.floor((durationHeight - 10) / 14))}>{routine.title}</Text>}
                </Pressable>;
              }))}
            </View>
          </View>
        </View>
        <View style={s.tableFooter}><Text style={[s.hint, s.shrink]}>매주 반복 · 이른 시간과 늦은 시간은 일과에 맞춰 펼쳐져요</Text><SoftButton label="반복 일과 목록 편집" onPress={() => setSheet('list')} disabled={!loaded || busy} reduced={reduceMotion}><Text style={[s.actionText, ink]}>편집</Text></SoftButton></View>
      </View>
      {!loaded && <Pressable disabled={!loadFailed} onPress={() => void load()} style={s.notice}><Text style={s.caption}>{loadFailed ? '일과를 불러오지 못했어요. 눌러서 다시 시도' : '한 주의 시간을 불러오고 있어요…'}</Text></Pressable>}
      {loaded && !routines.length && <Pressable accessibilityRole="button" accessibilityLabel="반복 일과 추가" onPress={() => openEditor()} style={s.emptyRhythm}><MoonWhisper color={theme.primary} text={homeWhisper} /></Pressable>}

      {summary.upcoming ? <Pressable accessibilityRole="button" accessibilityLabel={`다가오는 일정 ${scheduleDisplayTitle(summary.upcoming.schedule)}, 수정하기`} onPress={() => onEditSchedule(summary.upcoming!.schedule)} style={({ pressed }) => [s.upcoming, { backgroundColor: theme.soft, opacity: pressed ? .7 : 1 }]}>
        <View style={[s.dday, { backgroundColor: theme.primary }]}><Text style={s.ddayText}>{summary.daysUntil === 0 ? '오늘' : `D-${summary.daysUntil}`}</Text></View>
        <View style={s.grow}><Text style={s.hint}>다가오는 일정</Text><Text style={[s.scheduleTitle, ink]} numberOfLines={2}>{scheduleDisplayTitle(summary.upcoming.schedule)}</Text><Text style={s.caption}>{summary.upcoming.date.getMonth() + 1}월 {summary.upcoming.date.getDate()}일 · {summary.upcoming.schedule.time}</Text></View>
      </Pressable> : null}
      <SoftButton label="일정 확인하기" onPress={() => setAgendaVisible(true)} reduced={reduceMotion} style={s.agendaButton}><Text style={[s.scheduleTitle, ink]}>일정 확인하기</Text><Text style={[s.agendaButtonCount, ink]}>{summary.pending.length}개 남음  ›</Text></SoftButton>
    </ScrollView>

    <Modal visible={agendaVisible} animationType={reduceMotion ? 'fade' : 'slide'} presentationStyle="pageSheet" onRequestClose={() => setAgendaVisible(false)}>
      <SafeAreaView style={[s.agendaScreen, { backgroundColor: theme.background }]}>
        <View style={s.agendaTopBar}><SoftButton label="일정 확인 닫기" onPress={() => setAgendaVisible(false)} reduced={reduceMotion} style={s.agendaBackButton}><Text style={[s.agendaBack, ink]}>‹</Text></SoftButton><SoftButton label="남은 일정 모두 완료" disabled={!summary.pending.length} onPress={() => onCompleteSchedules(summary.pending.map(item => item.id))} reduced={reduceMotion} style={[s.agendaCompleteAll, { backgroundColor: '#FFFFFF' }]}><Text style={[s.agendaCompleteAllText, { color: theme.primary }]}>모두 완료</Text></SoftButton></View>
        <View style={s.agendaHero}><Text style={[s.agendaHeroText, ink]}>챙겨야 할 일정이</Text><Text style={[s.agendaHeroText, ink]}><Text style={{ color: theme.secondary }}>{summary.pending.length}개</Text> 남아 있어요</Text></View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.agendaContent}>
          <AgendaSection title="아직 남은 일정" empty="남아 있는 일정이 없어요" now={now} schedules={summary.pending} theme={theme} onToggle={onToggleSchedule} />
          <AgendaSection title="오늘 완료한 일정" empty="완료한 일정이 이곳에 차곡차곡 모여요" now={now} schedules={summary.completedToday} theme={theme} onToggle={onToggleSchedule} />
        </ScrollView>
      </SafeAreaView>
    </Modal>

    <Modal transparent visible={sheet !== null} animationType="none" onRequestClose={closeSheet}>
      <View style={s.modalRoot}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#17243D', opacity: sheetProgress.interpolate({ inputRange: [0, 1], outputRange: [0, .22] }) }]} />
        <Pressable accessibilityRole="button" accessibilityLabel="일과 창 닫기" style={StyleSheet.absoluteFill} disabled={busy} onPress={closeSheet} />
        <KeyboardAvoidingView pointerEvents="box-none" style={s.modalAvoid} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Animated.View style={[s.sheet, { opacity: reduceMotion ? sheetProgress : 1, transform: [{ translateY: Animated.add(sheetProgress.interpolate({ inputRange: [0, 1], outputRange: [650, 0] }), sheetDrag) }] }]}>
            <View style={s.handleArea} {...handlePan.panHandlers}><View style={s.handle} /></View>
            <View style={s.sheetHeader}><Text style={[s.heading, ink]}>{sheet === 'list' ? '한 주에 담은 일과' : editingId ? '일과 다듬기' : '일과 담기'}</Text><SoftButton label="일과 창 닫기" onPress={closeSheet} disabled={busy} reduced={reduceMotion}><Text style={[s.actionText, ink]}>닫기</Text></SoftButton></View>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={s.sheetContent}>
              {sheet === 'list' ? <>
                <Text style={s.caption}>일과를 누르면 시간과 요일을 다듬을 수 있어요.</Text>
                {sortedRoutines.map(routine => <Pressable key={routine.id} accessibilityRole="button" onPress={() => openEditor(routine)} style={s.routineRow}><View style={[s.colorDot, { backgroundColor: routine.color }]} /><View style={s.grow}><Text style={[s.scheduleTitle, ink]}>{routine.title}</Text><Text style={s.caption}>{WEEK_DAYS.filter(day => routine.days.includes(day)).map(day => DAY_NAMES[day]).join(' · ')} · {minuteLabel(routine.start)}–{minuteLabel(routine.end)}</Text></View></Pressable>)}
                {!routines.length && <Text style={[s.emptyList, s.caption]}>아직 담아 둔 일과가 없어요.</Text>}
                <Pressable onPress={() => openEditor()} style={[s.primaryButton, { backgroundColor: theme.primary }]}><Text style={s.primaryText}>새 일과 담기</Text></Pressable>
              </> : <>
                <TextInput value={title} onChangeText={setTitle} placeholder="어떤 시간을 보낼까요?" placeholderTextColor="#8C98A7" maxLength={40} style={[s.input, ink]} editable={!busy} returnKeyType="done" onSubmitEditing={Keyboard.dismiss} />
                <Text style={[s.fieldLabel, ink]}>함께할 요일 <Text style={s.hint}>매주 반복</Text></Text>
                <View style={s.dayChoices}>{WEEK_DAYS.map(day => <Pressable key={day} accessibilityRole="checkbox" accessibilityLabel={`${DAY_NAMES[day]}요일`} accessibilityState={{ checked: days.includes(day) }} disabled={busy} onPress={() => { setDays(current => current.includes(day) ? current.filter(value => value !== day) : [...current, day]); void Haptics.selectionAsync().catch(() => {}); }} style={[s.dayChoice, { backgroundColor: days.includes(day) ? theme.primary : theme.soft }]}><Text style={[s.dayText, { color: days.includes(day) ? '#FFFFFF' : theme.primary }]}>{DAY_NAMES[day]}</Text></Pressable>)}</View>
                <View style={s.timeChoices}>{(['start', 'end'] as const).map(value => <Pressable accessibilityRole="button" accessibilityLabel={`${value === 'start' ? '시작' : '마침'} 시간 선택`} key={value} disabled={busy} onPress={() => { Keyboard.dismiss(); setClock(current => current === value ? null : value); }} style={[s.timeChoice, { backgroundColor: clock === value ? theme.soft : '#F5F7F9' }]}><Text style={s.caption}>{value === 'start' ? '시작' : '마침'}</Text><Text style={[s.timeValue, ink]}>{minuteLabel(value === 'start' ? start : end)}</Text></Pressable>)}</View>
                {clock !== null && <DateTimePicker value={dateForMinute(clock === 'start' ? start : end)} mode="time" display={Platform.OS === 'ios' ? 'spinner' : 'default'} minuteInterval={5} locale="ko-KR" themeVariant="light" textColor={theme.primary} onChange={(event, date) => { if (Platform.OS !== 'ios') setClock(null); if (saving.current || closing.current || event.type !== 'set' || !date) return; const minute = date.getHours() * 60 + date.getMinutes(); if (clock === 'start') setStart(minute); else setEnd(minute === 0 ? 1440 : minute); }} />}
                <Text style={s.hint}>마침을 00:00으로 고르면 그날의 자정(24:00)이에요.</Text>
                <Text style={[s.fieldLabel, ink]}>나만의 빛깔</Text>
                <View style={s.colorChoices}>{ROUTINE_COLORS.map((value, index) => <Pressable key={value} accessibilityRole="radio" accessibilityLabel={`${['푸른빛', '보랏빛', '풀빛', '모래빛', '장밋빛', '물빛'][index]} 선택`} accessibilityState={{ checked: value === color }} disabled={busy} onPress={() => setColor(value)} style={[s.colorChoice, value === color && { borderColor: theme.primary }]}><View style={[s.colorCircle, { backgroundColor: value }]}>{value === color && <View style={[s.selectedColor, { backgroundColor: theme.primary }]} />}</View></Pressable>)}</View>
                <Pressable accessibilityRole="button" disabled={busy} onPress={() => void save()} style={({ pressed }) => [s.primaryButton, { backgroundColor: theme.primary, opacity: busy || pressed ? .65 : 1 }]}><Text style={s.primaryText}>{busy ? '담고 있어요…' : editingId ? '변경한 일과 담기' : '한 주에 담기'}</Text></Pressable>
                {editingId && <Pressable disabled={busy} onPress={remove} style={s.deleteButton}><Text style={s.deleteText}>이 일과 지우기</Text></Pressable>}
              </>}
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  </View>;
}

function AgendaSection({ title, empty, now, schedules, theme, onToggle }: { title: string; empty: string; now: Date; schedules: HomeSchedule[]; theme: MoonTheme; onToggle: (schedule: HomeSchedule) => void }) {
  return <View style={s.agendaSection}>
    <View style={s.agendaSectionHeading}><Text style={[s.agendaSectionTitle, { color: theme.primary }]}>{title}</Text><Text style={s.caption}>{schedules.length}개</Text></View>
    {!schedules.length ? <View style={s.agendaEmpty}><Text style={s.caption}>{empty}</Text></View> : schedules.map(schedule => { const date = homeScheduleTime(schedule); const overdueDays = date ? Math.max(0, Math.round((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())) / 86400000)) : 0; return <View key={schedule.id} style={s.agendaRow}>
      <Pressable accessibilityLabel={`${schedule.title} ${schedule.completed ? '완료 취소' : '완료'}`} accessibilityRole="checkbox" accessibilityState={{ checked: !!schedule.completed }} hitSlop={5} onPress={() => onToggle(schedule)} style={({ pressed }) => [s.agendaCheckTouch, pressed && { transform: [{ scale: 0.9 }], opacity: 0.7 }]}><View style={[s.agendaCheck, { borderColor: schedule.completed ? theme.primary : theme.secondary, backgroundColor: schedule.completed ? theme.primary : '#FFFFFF' }]}>{schedule.completed && <Text style={s.agendaCheckText}>✓</Text>}</View></Pressable>
      <View style={s.agendaScheduleBody}><View style={s.agendaTimeWrap}><Text style={[s.agendaDue, { color: overdueDays > 0 ? '#C56E76' : theme.secondary }]}>{overdueDays > 0 ? `D+${overdueDays}` : '오늘'}</Text><Text style={[s.scheduleTime, { color: theme.primary }, schedule.completed && s.agendaDone]}>{schedule.time}</Text></View><View style={s.grow}><Text numberOfLines={2} style={[s.scheduleTitle, { color: theme.primary }, schedule.completed && s.agendaDone]}>{schedule.title}</Text><Text style={s.caption}>{date ? `${date.getMonth() + 1}월 ${date.getDate()}일 · ` : ''}{schedule.category || '미지정'}</Text></View></View>
    </View>; })}
  </View>;
}

function SoftButton({ label, onPress, children, reduced, disabled = false, style }: { label: string; onPress: () => void; children: React.ReactNode; reduced: boolean; disabled?: boolean; style?: object }) {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => () => scale.stopAnimation(), [scale]);
  const press = (toValue: number) => { if (!reduced) Animated.spring(scale, { toValue, damping: 19, stiffness: 330, useNativeDriver: true }).start(); };
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} onPressIn={() => press(.94)} onPressOut={() => press(1)}><Animated.View style={[s.softButton, style, { opacity: disabled ? .45 : 1, transform: [{ scale }] }]}>{children}</Animated.View></Pressable>;
}

function MoonWhisper({ color, text }: { color: string; text: string }) {
  return <View style={s.moonWhisperRow}><Text style={[s.moonWhisperIcon, { color }]}>☾</Text><Text style={[s.moonWhisper, { color }]}>{text}</Text></View>;
}

const s = StyleSheet.create({
  screen: { flex: 1 }, content: { paddingTop: 4, paddingBottom: 26, gap: 12 }, grow: { flex: 1 }, shrink: { flexShrink: 1 }, muted: { color: '#8592A2' },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 5 },
  heading: { fontSize: 20, fontWeight: '700', letterSpacing: -.5, flexShrink: 1 }, caption: { color: '#7D8998', fontSize: 12, lineHeight: 19 }, hint: { color: '#8995A3', fontSize: 11, lineHeight: 17 },
  softButton: { minWidth: 44, minHeight: 44, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', borderRadius: 16 }, plus: { fontSize: 25, lineHeight: 30, fontWeight: '400' }, actionText: { fontSize: 13, fontWeight: '600' },
  timetable: { backgroundColor: '#FFFFFF', borderRadius: 22, overflow: 'hidden', borderWidth: 1, borderColor: '#EDF1F5' },
  weekHeader: { height: 41, flexDirection: 'row', alignItems: 'center', paddingRight: 7 }, timeGutter: { width: 39 }, dayHeading: { flex: 1, alignItems: 'center' }, dayPill: { width: 29, height: 29, alignItems: 'center', justifyContent: 'center', borderRadius: 11 }, dayText: { fontSize: 12, fontWeight: '600' },
  tableViewport: { overflow: 'hidden' }, tableBody: { flexDirection: 'row', paddingRight: 7 }, hour: { position: 'absolute', left: 8, fontSize: 11, lineHeight: 14, fontWeight: '600', color: '#8391A2', fontVariant: ['tabular-nums'] }, grid: { flex: 1 }, hourLine: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: '#E8EDF2' }, dayColumn: { position: 'absolute', top: 0, bottom: 0, borderLeftWidth: StyleSheet.hairlineWidth, borderColor: '#EDF1F5' },
  routine: { position: 'absolute', borderRadius: 6, overflow: 'hidden', paddingHorizontal: 3, paddingTop: 3 }, routineTitle: { fontSize: 10, fontWeight: '600', lineHeight: 14 },
  tableFooter: { minHeight: 40, paddingLeft: 14, paddingRight: 5, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#EDF1F5' },
  notice: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 10 }, emptyRhythm: { minHeight: 60, justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 16 }, moonWhisperRow: { alignItems: 'center', flexDirection: 'row', gap: 7, justifyContent: 'center' }, moonWhisperIcon: { fontSize: 13, lineHeight: 20, opacity: 0.62 }, moonWhisper: { flexShrink: 1, fontFamily: 'Nunito_600SemiBold_Italic', fontSize: 13, lineHeight: 21, letterSpacing: -0.15, textAlign: 'center', opacity: 0.82 }, smallText: { fontSize: 12, lineHeight: 20 },
  scheduleCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 21, overflow: 'hidden', paddingRight: 5, minHeight: 74 }, scheduleStripe: { width: 4, alignSelf: 'stretch' }, scheduleMain: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingLeft: 14, gap: 13 }, scheduleTime: { fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] }, scheduleTitle: { fontSize: 15, lineHeight: 21, fontWeight: '600' }, ellipsis: { fontSize: 12, letterSpacing: 2 },
  emptyToday: { backgroundColor: '#FFFFFF', borderRadius: 22, padding: 21, gap: 6, minHeight: 90 }, bodyText: { fontSize: 15, lineHeight: 22, fontWeight: '500' }, viewAll: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  upcoming: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14, borderRadius: 22, marginTop: 2 }, dday: { minWidth: 62, height: 62, paddingHorizontal: 6, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }, ddayText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  agendaButton: { backgroundColor: '#FFFFFF', borderColor: '#E7ECF1', borderRadius: 20, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 58, paddingHorizontal: 17, paddingVertical: 11, width: '100%' }, agendaButtonCount: { fontSize: 12, fontWeight: '700', marginLeft: 10 }, agendaScreen: { flex: 1 }, agendaTopBar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 14 }, agendaBackButton: { backgroundColor: '#FFFFFF', borderRadius: 22, height: 44, minHeight: 44, minWidth: 44, paddingHorizontal: 0, width: 44 }, agendaBack: { fontSize: 37, fontWeight: '300', lineHeight: 39, marginTop: -4 }, agendaCompleteAll: { borderRadius: 22, minHeight: 44, paddingHorizontal: 18 }, agendaCompleteAllText: { fontSize: 14, fontWeight: '700' }, agendaHero: { paddingBottom: 34, paddingHorizontal: 28, paddingTop: 34 }, agendaHeroText: { fontSize: 28, fontWeight: '500', letterSpacing: -0.8, lineHeight: 40 }, agendaContent: { gap: 24, paddingBottom: 40, paddingHorizontal: 24 }, agendaSection: { gap: 9 }, agendaSectionHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2 }, agendaSectionTitle: { fontSize: 16, fontWeight: '700' }, agendaEmpty: { alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 18, minHeight: 72, justifyContent: 'center', padding: 16 }, agendaRow: { alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 18, flexDirection: 'row', minHeight: 76, paddingLeft: 8, paddingRight: 8 }, agendaCheckTouch: { alignItems: 'center', justifyContent: 'center', minHeight: 48, minWidth: 44 }, agendaCheck: { alignItems: 'center', borderRadius: 7, borderWidth: 1.5, height: 22, justifyContent: 'center', width: 22 }, agendaCheckText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', lineHeight: 16 }, agendaScheduleBody: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 12, minHeight: 74, paddingVertical: 10 }, agendaTimeWrap: { alignItems: 'flex-start', minWidth: 48 }, agendaDue: { fontSize: 11, fontWeight: '800', marginBottom: 2 }, agendaDone: { opacity: 0.48, textDecorationLine: 'line-through' },
  modalRoot: { flex: 1, justifyContent: 'flex-end' }, modalAvoid: { flex: 1, justifyContent: 'flex-end' }, sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingBottom: Platform.OS === 'ios' ? 26 : 15, maxHeight: '90%' },
  handleArea: { height: 28, justifyContent: 'center', alignItems: 'center' }, handle: { width: 36, height: 4, borderRadius: 3, backgroundColor: '#DCE2E9' }, sheetHeader: { paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, sheetContent: { paddingHorizontal: 22, paddingBottom: 16, gap: 12 },
  input: { backgroundColor: '#F4F6F9', minHeight: 52, borderRadius: 16, paddingHorizontal: 16, fontSize: 16 }, fieldLabel: { fontSize: 13, fontWeight: '600', marginTop: 4 }, dayChoices: { flexDirection: 'row', justifyContent: 'space-between', gap: 3 }, dayChoice: { flex: 1, minHeight: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  timeChoices: { flexDirection: 'row', gap: 10 }, timeChoice: { flex: 1, minHeight: 71, borderRadius: 17, padding: 12, gap: 2 }, timeValue: { fontSize: 22, fontWeight: '600', fontVariant: ['tabular-nums'] },
  colorChoices: { flexDirection: 'row', justifyContent: 'space-between', gap: 2 }, colorChoice: { width: 44, height: 44, borderRadius: 17, borderWidth: 1.5, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' }, colorCircle: { width: 31, height: 31, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, selectedColor: { width: 6, height: 6, borderRadius: 3 },
  primaryButton: { minHeight: 51, borderRadius: 17, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, marginTop: 3 }, primaryText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' }, deleteButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' }, deleteText: { fontSize: 13, color: '#AA8087' },
  routineRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#F7F9FB', borderRadius: 16, padding: 13, minHeight: 64 }, colorDot: { width: 15, height: 28, borderRadius: 6 }, emptyList: { paddingVertical: 24, textAlign: 'center' },
});
