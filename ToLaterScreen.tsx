import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { AccessibilityInfo, ActivityIndicator, Alert, Animated, Easing, Image, Keyboard, KeyboardAvoidingView, LayoutAnimation, Linking, Modal, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { filterLaterItems, laterFilters as filters, linkKey, normalizeLaterUrl, readLaterItems, undoLaterChange, youtubeId, type LaterFilter as Filter, type LaterItem, type LaterUndo } from './laterModel';
export { normalizeLaterUrl, type LaterItem } from './laterModel';

type Category = { id: string; name: string; color: string };
type Theme = { primary: string; secondary: string; soft: string; background: string };
type Props = { theme: Theme; categories: Category[]; onSettings: () => void; onSchedule: (item: LaterItem, date: Date) => Promise<void>; onOpenSchedule: (item: LaterItem) => void; onSwipeBlockedChange: (blocked: boolean) => void };
const storageKey = '@my_time/to_later_v1';
type Rect = { x: number; y: number; width: number; height: number };
const measure = (view: View | null | undefined): Promise<Rect | null> => new Promise(resolve => {
  if (!view) { resolve(null); return; }
  const timeout = setTimeout(() => resolve(null), 250);
  view.measureInWindow((x, y, width, height) => { clearTimeout(timeout); resolve(width > 0 && height > 0 ? { x, y, width, height } : null); });
});

export default function ToLaterScreen({ theme, categories, onSettings, onSchedule, onOpenSchedule, onSwipeBlockedChange }: Props) {
  const [items, setItems] = useState<LaterItem[]>([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const rootRef = useRef<View>(null);
  const cardRefs = useRef<Record<string, View | null>>({});
  const filterRefs = useRef<Partial<Record<Filter, View | null>>>({});
  const progress = useRef(new Animated.Value(0)).current;
  const receiveScale = useRef(new Animated.Value(1)).current;
  const pinMotion = useRef(new Animated.Value(0)).current;
  const [pinningId, setPinningId] = useState<string | null>(null);
  const [destination, setDestination] = useState<Filter | null>(null);
  const [flight, setFlight] = useState<{ item: LaterItem; index: number; rect: Rect; dx: number; dy: number } | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) setReduceMotion(value); }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { mounted = false; subscription.remove(); progress.stopAnimation(); receiveScale.stopAnimation(); pinMotion.stopAnimation(); };
  }, [progress, receiveScale, pinMotion]);
  const [filter, setFilter] = useState<Filter>('전체');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [categoryPicker, setCategoryPicker] = useState(false);
  const [menuItem, setMenuItem] = useState<LaterItem | null>(null);
  const afterMenuClose = useRef<(() => void) | null>(null);
  const runMenuAction = () => { const run = afterMenuClose.current; afterMenuClose.current = null; run?.(); };
  useEffect(() => { if (!menuItem && !categoryPicker && Platform.OS !== 'ios') runMenuAction(); }, [menuItem, categoryPicker]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [undo, setUndo] = useState<LaterUndo | null>(null);
  const toastProgress = useRef(new Animated.Value(0)).current;
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const toggleSearch = () => {
    if (searchOpen) { setQuery(''); Keyboard.dismiss(); }
    setSearchOpen(!searchOpen);
  };
  const [editor, setEditor] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [memo, setMemo] = useState('');
  const [url, setUrl] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [moving, setMoving] = useState<LaterItem | null>(null);
  const [date, setDate] = useState(new Date());
  const [picker, setPicker] = useState<'date' | 'time' | null>(null);
  useEffect(() => {
    if (!undo) return;
    toastProgress.setValue(0);
    Animated.timing(toastProgress, { toValue: 1, duration: reduceMotion ? 0 : 180, useNativeDriver: true }).start();
    return () => toastProgress.stopAnimation();
  }, [undo, reduceMotion, toastProgress]);
  useEffect(() => {
    if (!undo || busy || editor || moving || menuItem || categoryPicker) return;
    const timer = setTimeout(() => {
      Animated.timing(toastProgress, { toValue: 0, duration: reduceMotion ? 0 : 160, useNativeDriver: true }).start(({ finished }) => { if (finished) setUndo(null); });
    }, 6000);
    return () => { clearTimeout(timer); toastProgress.stopAnimation(); };
  }, [undo, busy, editor, moving, menuItem, categoryPicker, reduceMotion, toastProgress]);
  useEffect(() => {
    onSwipeBlockedChange(editor || !!moving || busy || searchOpen || !!menuItem || categoryPicker);
    return () => onSwipeBlockedChange(false);
  }, [editor, moving, busy, searchOpen, menuItem, categoryPicker, onSwipeBlockedChange]);
  const ink = { color: theme.primary };
  const load = async () => {
    setLoadError(false);
    try {
      const raw = await AsyncStorage.getItem(storageKey);
      const data = readLaterItems(raw);
      setItems(data); setReady(true);
    } catch { setLoadError(true); }
  };
  useEffect(() => { void load(); }, []);
  // Persist before updating the screen; failed writes leave the original list intact.
  const persist = async (next: LaterItem[]) => {
    await AsyncStorage.setItem(storageKey, JSON.stringify(next));
    setItems(next);
  };
  const mutate = async (action: () => Promise<void>) => {
    if (lock.current || !ready) return;
    lock.current = true; setBusy(true);
    try { await action(); }
    catch { Alert.alert('저장하지 못했어요', '내용은 그대로 남아 있어요. 다시 시도해 주세요.'); }
    finally { lock.current = false; setBusy(false); }
  };
  const edit = (item?: LaterItem) => {
    setEditingId(item?.id ?? null); setTitle(item?.title ?? ''); setMemo(item?.memo ?? ''); setUrl(item?.url ?? ''); setCategoryId(item?.categoryId ?? ''); setEditor(true);
  };
  const toggleDone = (item: LaterItem, index: number) => {
    void mutate(async () => {
      const target: Filter = !item.done ? '완료' : item.scheduled ? '일정' : item.url ? '링크' : '할 일';
      const next = items.map(value => value.id === item.id ? { ...value, done: !value.done } : value);
      const [source, goal, root] = await Promise.all([measure(cardRefs.current[item.id]), measure(filterRefs.current[target]), measure(rootRef.current)]);
      await AsyncStorage.setItem(storageKey, JSON.stringify(next));
      void Haptics.selectionAsync().catch(() => {});
      setDestination(target);
      if (!reduceMotion && source && goal && root) {
        progress.setValue(0);
        setFlight({ item, index, rect: { ...source, x: source.x - root.x, y: source.y - root.y }, dx: goal.x + goal.width / 2 - source.x - source.width / 2, dy: goal.y + goal.height / 2 - source.y - source.height / 2 });
        await new Promise<void>(resolve => requestAnimationFrame(() => {
          Animated.timing(progress, { toValue: 1, duration: 520, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }).start(() => resolve());
        }));
        LayoutAnimation.configureNext({ duration: 230, update: { type: LayoutAnimation.Types.easeInEaseOut }, delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity } });
      }
      setItems(next); setFlight(null);
      if (!reduceMotion) {
        await new Promise<void>(resolve => Animated.sequence([
          Animated.timing(receiveScale, { toValue: 1.12, duration: 100, useNativeDriver: true }),
          // Keep the original spring feel without waiting for its imperceptible tail.
          Animated.spring(receiveScale, { toValue: 1, damping: 15, stiffness: 250, restDisplacementThreshold: 0.005, restSpeedThreshold: 0.05, useNativeDriver: true }),
        ]).start(() => resolve()));
      }
      setDestination(null);
      setUndo({ item, index: items.findIndex(value => value.id === item.id), kind: 'done', message: item.done ? '완료를 취소했어요' : '완료했어요' });
      AccessibilityInfo.announceForAccessibility(`${target} 항목으로 이동했어요`);
    });
  };
  const save = () => {
    if (!title.trim()) { Alert.alert('제목을 입력해 주세요.'); return; }
    let cleanUrl: string;
    try { cleanUrl = normalizeLaterUrl(url); } catch { Alert.alert('링크를 확인해 주세요', 'https://로 시작하는 웹사이트 또는 영상 주소를 입력해 주세요.'); return; }
    const commit = () => void mutate(async () => {
      const fields = { title: title.trim(), memo: memo.trim(), url: cleanUrl, categoryId };
      const next = editingId ? items.map(item => item.id === editingId ? { ...item, ...fields } : item) : [{ ...fields, id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, createdAt: new Date().toISOString(), done: false, statusVersion: 2 as const }, ...items];
      await persist(next); setEditor(false);
    });
    const duplicate = cleanUrl && items.find(item => item.id !== editingId && linkKey(item.url) === linkKey(cleanUrl));
    if (duplicate) Alert.alert('이미 담아둔 링크예요', `“${duplicate.title}”에 같은 링크가 있어요. 그래도 따로 저장할까요?`, [{ text: '취소', style: 'cancel' }, { text: '따로 저장', onPress: commit }]);
    else commit();
  };
  const animateList = () => { if (!reduceMotion) LayoutAnimation.configureNext({ duration: 210, update: { type: LayoutAnimation.Types.easeInEaseOut } }); };
  const remove = (item: LaterItem) => void mutate(async () => {
    const next = items.filter(value => value.id !== item.id);
    await AsyncStorage.setItem(storageKey, JSON.stringify(next));
    animateList();
    setItems(next);
    setUndo({ item, index: items.findIndex(value => value.id === item.id), kind: 'delete', message: item.scheduled ? '메모를 삭제했어요 · 일정은 유지돼요' : '삭제했어요' });
  });
  const restore = () => { if (undo) void mutate(async () => {
    const next = undoLaterChange(items, undo);
    await AsyncStorage.setItem(storageKey, JSON.stringify(next));
    animateList();
    setItems(next);
    setUndo(null);
    setFilter(undo.item.done ? '완료' : undo.item.scheduled ? '일정' : undo.item.url ? '링크' : '할 일');
    setCategoryFilter(null); setQuery('');
    void Haptics.selectionAsync().catch(() => {});
  }); };
  const pin = (item: LaterItem) => void mutate(async () => {
    const next = items.map(value => value.id === item.id ? { ...value, pinned: !value.pinned } : value);
    await AsyncStorage.setItem(storageKey, JSON.stringify(next));
    if (reduceMotion) setItems(next);
    else {
      const direction = item.pinned ? 1 : -1;
      setPinningId(item.id);
      pinMotion.setValue(0);
      await new Promise<void>(resolve => Animated.timing(pinMotion, { toValue: direction, duration: 130, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => resolve()));
      setItems(next);
      pinMotion.setValue(-direction);
      await new Promise<void>(resolve => requestAnimationFrame(() => Animated.timing(pinMotion, { toValue: 0, duration: 210, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => resolve())));
      setPinningId(null);
    }
    void Haptics.selectionAsync().catch(() => {});
  });
  const moveOrder = (item: LaterItem, direction: number) => {
    const index = visible.findIndex(value => value.id === item.id);
    const other = visible[index + direction];
    if (!other || !!other.pinned !== !!item.pinned) return;
    const next = [...items]; const a = next.findIndex(value => value.id === item.id); const b = next.findIndex(value => value.id === other.id);
    [next[a], next[b]] = [next[b], next[a]];
    void mutate(() => persist(next));
  };
  const openLink = async (value: string) => {
    try { const safe = normalizeLaterUrl(value); if (safe) await Linking.openURL(safe); }
    catch { Alert.alert('링크를 열 수 없어요', '주소를 확인하고 다시 시도해 주세요.'); }
  };
  const transfer = () => { if (moving) void mutate(async () => {
    await onSchedule(moving, date);
    await persist(items.map(item => item.id === moving.id ? { ...item, done: false, scheduled: true, statusVersion: 2 } : item));
    setMoving(null); setFilter('일정'); setQuery(''); setCategoryFilter(null);
    void Haptics.selectionAsync().catch(() => {});
  }); };
  const visible = filterLaterItems(items, filter, categoryFilter, query);
  const pending = items.filter(item => !item.done).length;
  const action = (label: string, onPress: () => void, disabled = false) => <Pressable accessibilityRole="button" disabled={disabled || busy} onPress={onPress} style={({ pressed }) => [s.action, { backgroundColor: theme.soft }, (pressed || disabled || busy) && { opacity: 0.45 }]}><Text style={[s.actionText, ink]}>{label}</Text></Pressable>;
  const menuAction = (label: string, run: () => void, disabled = false, destructive = false) => <Pressable accessibilityRole="button" disabled={busy || disabled} onPress={() => { afterMenuClose.current = run; setMenuItem(null); }} style={({ pressed }) => [s.menuRow, pressed && { backgroundColor: theme.soft }, (busy || disabled) && { opacity: 0.35 }]}><Text style={[s.menuText, destructive ? { color: '#AA5864' } : ink]}>{label}</Text></Pressable>;
  const closeMenu = () => { setMenuItem(null); setCategoryPicker(false); };
  const menuIndex = menuItem ? visible.findIndex(item => item.id === menuItem.id) : -1;
  const canMove = (direction: number) => !!menuItem && !!visible[menuIndex + direction] && !!visible[menuIndex + direction].pinned === !!menuItem.pinned;

  const renderCard = (item: LaterItem, index: number, overlay = false) => {
        const category = categories.find(value => value.id === item.categoryId);
        const pinStyle = !overlay && pinningId === item.id ? { opacity: pinMotion.interpolate({ inputRange: [-1, 0, 1], outputRange: [0.18, 1, 0.18] }), transform: [{ translateY: pinMotion.interpolate({ inputRange: [-1, 0, 1], outputRange: [-12, 0, 12] }) }, { scale: pinMotion.interpolate({ inputRange: [-1, 0, 1], outputRange: [0.985, 1, 0.985] }) }] } : undefined;
        return <Animated.View key={item.id} collapsable={false} ref={overlay ? undefined : (view) => { cardRefs.current[item.id] = view as unknown as View; }} style={[s.card, pinStyle, !overlay && flight?.item.id === item.id && { opacity: 0 }]}>
          <View style={s.cardHead}>
            <MotionCheck title={item.title} checked={overlay ? !item.done : item.done} disabled={busy || overlay} color={theme.primary} reduceMotion={reduceMotion} onPress={() => toggleDone(item, index)} />
            <View style={s.grow}><Text style={[s.cardTitle, ink, item.done && { opacity: 0.6 }]}>{item.title}</Text>
              <View style={s.metadata}>{item.pinned && <Text style={[s.category, ink]}>고정</Text>}{category && <><View style={[s.dot, { backgroundColor: category.color }]} /><Text style={s.small}>{category.name}</Text></>}{!category && <Text style={s.small}>{new Date(item.createdAt).toLocaleDateString('ko-KR')} 담음</Text>}</View>
            </View>
            <Pressable disabled={busy || overlay} accessibilityRole="button" accessibilityLabel={`${item.title} 메뉴`} onPress={() => setMenuItem(item)} style={({ pressed }) => [s.more, pressed && { backgroundColor: theme.soft }]}><Text style={[s.moreText, ink]}>⋯</Text></Pressable>
          </View>
          {!!item.memo && <Pressable disabled={busy || overlay} accessibilityRole="button" accessibilityLabel="메모 펼치기 또는 접기" accessibilityState={{ expanded: expanded === item.id }} onPress={() => { animateList(); setExpanded(expanded === item.id ? null : item.id); }}><Text numberOfLines={expanded === item.id ? undefined : 2} style={s.memo}>{item.memo}</Text></Pressable>}
          {!!item.url && <LinkPreview url={item.url} theme={theme} disabled={busy || overlay} onPress={() => { void openLink(item.url); }} />}
          {item.scheduled && <Pressable disabled={busy || overlay} accessibilityRole="button" onPress={() => onOpenSchedule(item)} style={({ pressed }) => [s.scheduleBadge, { backgroundColor: theme.soft }, pressed && { opacity: 0.6 }]}><Text style={[s.actionText, ink]}>일정에 등록됨</Text><Text style={[s.actionText, ink]}>일정 보기 ›</Text></Pressable>}
        </Animated.View>;
      };

  return <View ref={rootRef} collapsable={false} style={s.screen}>
    <View style={s.heading}><View><Text style={[s.eyebrow, ink]}>DALVI · 나중을 위한 공간</Text><Text style={[s.title, ink]}>To later</Text></View><View style={s.headerTools}>
      <Pressable accessibilityRole="button" accessibilityLabel={searchOpen ? '검색 닫기' : '검색 열기'} accessibilityState={{ expanded: searchOpen }} disabled={busy} onPress={toggleSearch} style={({ pressed }) => [s.iconButton, pressed && { opacity: 0.5 }]}>{searchOpen ? <Text style={[s.closeIcon, ink]}>×</Text> : <View accessible={false} style={s.searchIcon}><View style={[s.searchRing, { borderColor: theme.primary }]} /><View style={[s.searchHandle, { backgroundColor: theme.primary }]} /></View>}</Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="설정 열기" disabled={busy} onPress={onSettings} style={({ pressed }) => [s.iconButton, pressed && { opacity: 0.5 }]}><View accessible={false} style={s.gearIcon}>{[0, 45, 90, 135].map(angle => <View key={angle} style={[s.gearTeeth, { backgroundColor: theme.primary, transform: [{ rotate: `${angle}deg` }] }]} />)}<View style={[s.gearBody, { backgroundColor: theme.primary }]} /><View style={s.gearHole} /></View></Pressable>
    </View></View>
    {searchOpen && <TextInput autoFocus accessibilityLabel="To later 검색" placeholder="제목, 메모, 링크 검색" placeholderTextColor="#778492" value={query} onChangeText={setQuery} returnKeyType="search" onSubmitEditing={() => Keyboard.dismiss()} clearButtonMode="while-editing" style={[s.search, ink]} />}
    <View style={[s.hero, { backgroundColor: theme.soft }]}><Text style={[s.moon, ink]}>☾</Text><View style={s.grow}><Text style={[s.heroTitle, ink]}>언젠가의 나에게</Text><Text style={s.muted}>하고 싶은 일, 다시 보고 싶은 순간.{ '\n' }지금은 여기 잠시 담아두세요.</Text></View><Text style={[s.count, ink]}>{pending}</Text></View>
    <Pressable disabled={!ready || busy} accessibilityRole="button" onPress={() => edit()} style={[s.add, { backgroundColor: theme.primary }, !ready && { opacity: 0.5 }]}><Text style={s.white}>＋ 나중에 할 일 담기</Text></Pressable>
    <View style={s.filters}>{filters.map(value => <Animated.View key={value} style={{ flex: 1, transform: [{ scale: destination === value ? receiveScale : 1 }] }}><Pressable ref={view => { filterRefs.current[value] = view; }} collapsable={false} disabled={busy} accessibilityRole="tab" accessibilityState={{ selected: value === filter }} onPress={() => { animateList(); setFilter(value); }} style={[s.filter, (value === filter || value === destination) && { backgroundColor: theme.soft }]}><Text style={[s.actionText, value === filter || value === destination ? ink : s.muted]}>{value}</Text></Pressable></Animated.View>)}</View>
    <View style={s.listTools}><Text style={s.small}>{visible.length}개의 기억</Text><Pressable disabled={busy} accessibilityRole="button" accessibilityLabel="카테고리로 모아보기" onPress={() => setCategoryPicker(true)} style={s.categoryFilter}><Text numberOfLines={1} style={[s.actionText, ink]}>{categoryFilter === null ? '모든 카테고리' : categoryFilter === '' ? '미지정' : categories.find(value => value.id === categoryFilter)?.name ?? '삭제된 카테고리'} ⌄</Text></Pressable></View>
    <ScrollView scrollEnabled={!busy} style={s.grow} contentContainerStyle={s.list} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      {!ready ? loadError ? <View style={s.empty}><Text style={s.muted}>저장한 항목을 불러오지 못했어요.</Text>{action('다시 시도', () => { void load(); })}</View> : <ActivityIndicator color={theme.primary} /> : visible.length === 0 ? <View style={s.empty}><Text style={[s.emptyIcon, ink]}>☾</Text><Text style={[s.heroTitle, ink]}>{query || categoryFilter !== null ? '조건에 맞는 항목이 없어요' : filter === '완료' ? '완료한 일이 여기에 모여요' : filter === '일정' ? '날짜가 정해진 일이 모여요' : '나중에 하고 싶은 일이 있나요?'}</Text><Text style={s.muted}>{query || categoryFilter !== null ? '검색어나 카테고리를 바꿔보세요.' : filter === '일정' ? '카드 메뉴에서 일정으로 등록할 수 있어요.' : '작은 생각도 좋아요. 잊기 전에 담아두세요.'}</Text>{(query || categoryFilter !== null) && action('필터 초기화', () => { setQuery(''); setCategoryFilter(null); })}</View> : visible.map((item, index) => renderCard(item, index))}
    </ScrollView>
    {undo && <Animated.View accessibilityLiveRegion="polite" style={[s.toast, { backgroundColor: theme.primary, opacity: toastProgress, transform: [{ translateY: toastProgress.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}><Text style={[s.white, s.grow, { fontSize: 12 }]}>{undo.message}</Text><Pressable disabled={busy} accessibilityRole="button" onPress={restore} style={s.undoButton}><Text style={[s.white, { fontSize: 13, opacity: busy ? 0.5 : 1 }]}>되돌리기</Text></Pressable><Pressable disabled={busy} accessibilityRole="button" accessibilityLabel="알림 닫기" onPress={() => setUndo(null)} style={s.undoClose}><Text style={s.white}>×</Text></Pressable></Animated.View>}
    {flight && <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', zIndex: 50, left: flight.rect.x, top: flight.rect.y, width: flight.rect.width, height: flight.rect.height, opacity: progress.interpolate({ inputRange: [0, 0.78, 1], outputRange: [1, 0.95, 0] }), transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, flight.dx] }) }, { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, flight.dy] }) }, { scale: progress.interpolate({ inputRange: [0, 0.12, 1], outputRange: [1, 1.025, 0.04] }) }] }}>{renderCard(flight.item, flight.index, true)}</Animated.View>}
    <Modal visible={!!menuItem || categoryPicker} transparent animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={closeMenu} onDismiss={runMenuAction}>
      <View style={s.menuBackdrop}><Pressable accessibilityRole="button" accessibilityLabel="메뉴 닫기" onPress={closeMenu} style={StyleSheet.absoluteFill} />
        <SafeAreaView style={[s.menuSheet, { backgroundColor: theme.background }]}><View style={s.menuHandle} /><View style={s.menuHeading}><Text numberOfLines={2} style={[s.heroTitle, ink, s.grow]}>{categoryPicker ? '카테고리로 모아보기' : menuItem?.title}</Text><Pressable accessibilityRole="button" accessibilityLabel="메뉴 닫기" onPress={closeMenu} style={s.more}><Text style={[s.closeIcon, ink]}>×</Text></Pressable></View>
          <ScrollView bounces={false}>
            {categoryPicker ? [{ id: null, name: '모든 카테고리', color: theme.secondary }, { id: '', name: '미지정', color: theme.secondary }, ...categories].map(category => { const selected = categoryFilter === category.id; return <Pressable key={category.id ?? 'all'} accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={() => { animateList(); setCategoryFilter(category.id); setCategoryPicker(false); }} style={({ pressed }) => [s.menuRow, s.categoryMenuRow, pressed && { backgroundColor: theme.soft }]}><View style={[s.dot, { backgroundColor: category.color }]} /><Text style={[s.menuText, ink, s.grow]}>{category.name}</Text><View style={[s.categoryRadio, { borderColor: selected ? theme.primary : theme.secondary }]}>{selected && <View style={[s.categoryRadioDot, { backgroundColor: theme.primary }]} />}</View></Pressable>; }) : menuItem && <>
              {menuAction(menuItem.pinned ? '고정 해제' : '맨 위에 고정', () => pin(menuItem))}
              {menuItem.scheduled ? menuAction('등록한 일정 보기', () => onOpenSchedule(menuItem)) : !menuItem.done && menuAction('일정으로 등록', () => { setMoving(menuItem); setDate(new Date()); setPicker(null); })}
              {menuAction('내용 수정', () => edit(menuItem))}
              {menuAction('위로 이동', () => moveOrder(menuItem, -1), !canMove(-1))}
              {menuAction('아래로 이동', () => moveOrder(menuItem, 1), !canMove(1))}
              {menuAction(menuItem.scheduled ? 'To later에서 삭제 · 일정은 유지' : '삭제', () => remove(menuItem), false, true)}
            </>}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
    <Modal visible={editor || !!moving} animationType="slide" onRequestClose={() => { if (!busy) { setEditor(false); setMoving(null); } }}>
      <SafeAreaView style={[s.screen, { backgroundColor: theme.background }]}><KeyboardAvoidingView style={s.grow} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={s.modalHeading}><Text style={[s.heroTitle, ink]}>{moving ? '언제로 정할까요?' : editingId ? '담아둔 항목 수정' : '나중을 위해 담기'}</Text>{action('취소', () => { setEditor(false); setMoving(null); })}</View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.form}>
          {moving ? <><Text style={[s.cardTitle, ink]}>{moving.title}</Text><Text style={s.muted}>날짜와 시간을 정하면 일정에 등록돼요.</Text>{action(date.toLocaleDateString('ko-KR'), () => setPicker('date'))}{action(date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }), () => setPicker('time'))}{picker && <DateTimePicker value={date} mode={picker} display={Platform.OS === 'ios' ? 'spinner' : 'default'} locale="ko-KR" onChange={(event, next) => { if (Platform.OS !== 'ios') setPicker(null); if (event.type !== 'dismissed' && next) setDate(next); }} />}<Text style={s.muted}>메모와 링크는 ‘일정’ 목록에 남아요. 완료 여부는 별도로 체크할 수 있어요.</Text></> : <>
            <Text style={[s.label, ink]}>제목</Text><TextInput accessibilityLabel="제목" value={title} onChangeText={setTitle} maxLength={120} placeholder="언젠가 무엇을 하고 싶나요?" placeholderTextColor="#778492" style={[s.input, ink]} />
            <Text style={[s.label, ink]}>메모 · 선택</Text><TextInput accessibilityLabel="메모" value={memo} onChangeText={setMemo} maxLength={4000} multiline placeholder="잊고 싶지 않은 생각을 적어보세요" placeholderTextColor="#778492" style={[s.input, s.memoInput, ink]} />
            <Text style={[s.label, ink]}>링크 · 선택</Text><TextInput accessibilityLabel="링크" value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" maxLength={2048} placeholder="영상이나 웹페이지 주소 붙여넣기" placeholderTextColor="#778492" style={[s.input, ink]} />
            <Text style={[s.label, ink]}>카테고리</Text><View style={s.actions}>{[{ id: '', name: '미지정', color: theme.secondary }, ...categories].map(category => <Pressable accessibilityRole="radio" accessibilityState={{ checked: categoryId === category.id }} key={category.id} onPress={() => setCategoryId(category.id)} style={[s.categoryChoice, { borderColor: categoryId === category.id ? theme.primary : 'transparent', backgroundColor: theme.soft }]}><View style={[s.dot, { backgroundColor: category.color }]} /><Text style={ink}>{category.name}</Text></Pressable>)}</View>
          </>}
          <Pressable disabled={busy} accessibilityRole="button" onPress={moving ? transfer : save} style={[s.add, { backgroundColor: theme.primary }]}>{busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.white}>{moving ? '일정으로 등록하기' : '저장하기'}</Text>}</Pressable>
        </ScrollView>
      </KeyboardAvoidingView></SafeAreaView>
    </Modal>
  </View>;
}

const videoTitles = new Map<string, string>();
function LinkPreview({ url, theme, disabled, onPress }: { url: string; theme: Theme; disabled: boolean; onPress: () => void }) {
  const video = youtubeId(url);
  const [failed, setFailed] = useState(false);
  const [videoTitle, setVideoTitle] = useState('');
  useEffect(() => setFailed(false), [url]);
  useEffect(() => {
    setVideoTitle(video ? videoTitles.get(video) ?? '' : '');
    if (!video || videoTitles.has(video)) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    // Only contact the video's own provider, never arbitrary user-supplied websites.
    void fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${video}`)}`, { signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        if (!controller.signal.aborted && typeof data?.title === 'string') {
          const title = data.title.slice(0, 200);
          if (videoTitles.size >= 100) videoTitles.clear();
          videoTitles.set(video, title); setVideoTitle(title);
        }
      }).catch(() => {}).finally(() => clearTimeout(timeout));
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [video]);
  let host = url;
  try { host = new URL(normalizeLaterUrl(url)).hostname.replace(/^www\./, ''); } catch {}
  return <Pressable accessibilityRole="link" accessibilityLabel={`${host} 링크 열기`} disabled={disabled} onPress={onPress} style={({ pressed }) => [s.link, { backgroundColor: theme.soft }, pressed && { opacity: 0.65, transform: [{ scale: 0.985 }] }]}>
    {video && !failed ? <Image source={{ uri: `https://i.ytimg.com/vi/${video}/mqdefault.jpg` }} style={s.thumbnail} onError={() => setFailed(true)} accessibilityLabel="유튜브 영상 미리보기" /> : <View style={s.linkSymbol}><Text style={{ color: theme.primary, fontSize: 20 }}>{video ? '▷' : '↗'}</Text></View>}
    <View style={s.grow}><Text numberOfLines={1} style={[s.actionText, { color: theme.primary }]}>{videoTitle || (video ? 'YouTube' : host)}</Text><Text style={s.small}>{video ? 'YouTube · ' : ''}링크 열기</Text></View><Text style={{ color: theme.secondary }}>›</Text>
  </Pressable>;
}

function MotionCheck({ title, checked, disabled, color, reduceMotion, onPress }: { title: string; checked: boolean; disabled: boolean; color: string; reduceMotion: boolean; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const animate = (value: number) => {
    if (reduceMotion) return;
    Animated.spring(scale, { toValue: value, damping: 16, stiffness: 350, useNativeDriver: true }).start();
  };
  useEffect(() => () => scale.stopAnimation(), [scale]);
  return <Pressable accessibilityRole="checkbox" accessibilityLabel={`${title} ${checked ? '완료 취소' : '완료'}`} accessibilityState={{ checked, disabled }} disabled={disabled} hitSlop={7} onPressIn={() => animate(0.82)} onPressOut={() => animate(1)} onPress={onPress}><Animated.View style={[s.check, { borderColor: color, transform: [{ scale }] }, checked && { backgroundColor: color }]}><Text style={s.white}>{checked ? '✓' : ''}</Text></Animated.View></Pressable>;
}

const s = StyleSheet.create({
  screen: { flex: 1 }, grow: { flex: 1 }, heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 20, paddingBottom: 18 },
  eyebrow: { fontSize: 10, letterSpacing: 1.4, fontWeight: '700', marginBottom: 4 }, title: { fontFamily: 'Nunito_800ExtraBold', fontSize: 32, lineHeight: 40 },
  hero: { borderRadius: 22, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }, moon: { fontSize: 42 }, heroTitle: { fontSize: 18, fontWeight: '800', marginBottom: 5 }, muted: { color: '#667586', fontSize: 12, lineHeight: 19 }, count: { fontSize: 28, fontWeight: '800' },
  add: { padding: 15, borderRadius: 14, alignItems: 'center', marginVertical: 5 }, white: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 }, search: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 12, marginBottom: 14, fontSize: 14 },
  headerTools: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 24, paddingHorizontal: 1, gap: 0, shadowColor: '#17243D', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.04, shadowRadius: 10, elevation: 1 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  closeIcon: { fontSize: 30, lineHeight: 32 },
  gearIcon: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  gearTeeth: { position: 'absolute', left: 7.5, top: 0, width: 5, height: 20, borderRadius: 2 },
  gearBody: { position: 'absolute', left: 3, top: 3, width: 14, height: 14, borderRadius: 7 },
  gearHole: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: '#FFFFFF' },
  searchIcon: { width: 20, height: 20 }, searchRing: { width: 16, height: 16, borderRadius: 8, borderWidth: 2.5 }, searchHandle: { position: 'absolute', width: 9, height: 3.5, borderRadius: 2, left: 11.5, top: 14.5, transform: [{ rotate: '45deg' }] },
  filters: { flexDirection: 'row', gap: 3, marginTop: 12 }, filter: { minHeight: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6, borderRadius: 16 }, list: { gap: 12, paddingBottom: 90 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, gap: 10 }, cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 }, cardTitle: { fontSize: 17, fontWeight: '700', lineHeight: 24 }, check: { height: 30, width: 30, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 7, height: 7, borderRadius: 4 }, small: { fontSize: 11, color: '#697889' }, category: { fontSize: 11, fontWeight: '600' }, memo: { fontSize: 14, lineHeight: 21, color: '#4C5B6D' }, link: { padding: 8, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  metadata: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 4 },
  more: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, moreText: { fontSize: 25, lineHeight: 28 },
  thumbnail: { width: 72, height: 42, borderRadius: 7 }, linkSymbol: { width: 34, height: 36, alignItems: 'center', justifyContent: 'center' },
  scheduleBadge: { borderRadius: 10, paddingHorizontal: 12, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  listTools: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }, categoryFilter: { minHeight: 44, maxWidth: '70%', justifyContent: 'center', paddingHorizontal: 8 },
  menuBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,25,43,0.3)' }, menuSheet: { maxHeight: '78%', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingBottom: 20 }, menuHandle: { width: 34, height: 4, borderRadius: 2, backgroundColor: '#BFC7D0', alignSelf: 'center', marginTop: 12 }, menuHeading: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 22, paddingVertical: 10, gap: 10 }, menuRow: { minHeight: 50, paddingHorizontal: 24, paddingVertical: 14, justifyContent: 'center' }, menuText: { fontSize: 15, fontWeight: '600' },
  categoryMenuRow: { alignItems: 'center', flexDirection: 'row', gap: 10 }, categoryRadio: { alignItems: 'center', borderRadius: 10, borderWidth: 1.5, height: 20, justifyContent: 'center', width: 20 }, categoryRadioDot: { borderRadius: 5, height: 10, width: 10 },
  toast: { position: 'absolute', bottom: 8, left: 0, right: 0, borderRadius: 18, paddingLeft: 16, paddingRight: 4, flexDirection: 'row', alignItems: 'center', gap: 5, zIndex: 20 }, undoButton: { minHeight: 50, justifyContent: 'center', paddingHorizontal: 8 }, undoClose: { width: 44, height: 50, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, action: { paddingHorizontal: 12, minHeight: 36, paddingVertical: 9, borderRadius: 11 }, actionText: { fontSize: 12, fontWeight: '700' }, empty: { alignItems: 'center', paddingVertical: 35, gap: 10 }, emptyIcon: { fontSize: 48 },
  modalHeading: { padding: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, form: { padding: 20, gap: 12, paddingBottom: 45 }, label: { fontSize: 13, fontWeight: '700', marginTop: 4 }, input: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 15, fontSize: 15 }, memoInput: { minHeight: 110, textAlignVertical: 'top' }, categoryChoice: { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1.5, borderRadius: 12, padding: 10 },
});
