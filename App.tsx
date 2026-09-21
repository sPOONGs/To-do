import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Nunito_800ExtraBold, useFonts } from '@expo-google-fonts/nunito';
import * as Haptics from 'expo-haptics';
import * as SplashScreen from 'expo-splash-screen';
import ToLaterScreen, { type LaterItem } from './ToLaterScreen';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Dimensions, Easing, Image, KeyboardAvoidingView, LayoutAnimation, Modal, PanResponder, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

type Tab = '일정' | 'To later' | '나의 꿈' | '상점';
const tabs: Tab[] = ['일정', 'To later', '나의 꿈', '상점'];
type Schedule = { id: string; date: string; time: string; title: string; keyword?: string; category: string; color: string };
type Category = { id: string; name: string; color: string };
type ThemeKey = 'calm' | 'dreamy' | 'warm';
type AppTheme = { primary: string; secondary: string; soft: string; background: string };
const weekDays = ['일', '월', '화', '수', '목', '금', '토'];
const calendarDayHeight = 72;
const colors = ['#F28B82', '#F6B26B', '#F9D976', '#8FCB9B', '#89B5EF', '#B49AE3', '#3D3A43', '#E9A7C4'];
const defaultCategories: Category[] = [{ id: 'personal', name: '개인', color: '#7D72E9' }, { id: 'promise', name: '약속', color: '#FF9D6C' }, { id: 'health', name: '건강', color: '#4AAE94' }, { id: 'study', name: '공부', color: '#4F9BEA' }];
const appThemes: Record<ThemeKey, AppTheme> = {
  calm: { primary: '#17243D', secondary: '#8FA6BB', soft: '#E8EDF2', background: '#F8FAFC' },
  dreamy: { primary: '#4D4A78', secondary: '#AAA4D6', soft: '#E8EDF2', background: '#F8F7FC' },
  warm: { primary: '#17243D', secondary: '#E8EDF2', soft: '#F3E8C8', background: '#FFFCF5' },
};
const themeChoices: { key: ThemeKey; name: string; description: string }[] = [
  { key: 'calm', name: '고요한 달빛', description: '깊은 남색과 차분한 푸른빛' },
  { key: 'dreamy', name: '몽환적인 달빛', description: '보랏빛이 감도는 부드러운 달빛' },
  { key: 'warm', name: '따뜻한 달빛', description: '포근한 크림빛이 감도는 달빛' },
];
const dateKey = (date: Date) => `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
const dateLabel = (date: Date) => `${date.getMonth() + 1}월 ${date.getDate()}일`;
const parseDateKey = (key: string) => {
  const [year, month, day] = key.split('-').map(Number);
  return [year, month, day].every(Number.isFinite) ? new Date(year, month - 1, day) : new Date();
};
const formatTime = (date: Date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
const scheduleDateTime = (schedule: Schedule) => {
  const date = parseDateKey(schedule.date);
  const [hour, minute] = schedule.time.split(':').map(Number);
  date.setHours(Number.isFinite(hour) ? hour : 0, Number.isFinite(minute) ? minute : 0, 0, 0);
  return date;
};
const limitKeyword = (keyword: string) => Array.from(keyword.replace(/\r?\n/g, '')).slice(0, 8).join('');
const formatCalendarKeyword = (keyword: string) => {
  const characters = Array.from(keyword.trim()).slice(0, 8);
  return [characters.slice(0, 4).join(''), characters.slice(4, 8).join('')].filter(Boolean).join('\n');
};
const storageKey = '@my_time/schedules';
const categoryStorageKey = '@my_time/categories';
const themeStorageKey = '@my_time/theme';

void SplashScreen.preventAutoHideAsync();

function buildCalendar(month: Date): (Date | null)[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  return [...Array.from({ length: first.getDay() }, () => null), ...Array.from({ length: count }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index + 1))];
}

const calendarWeekCount = (month: Date) => Math.ceil((new Date(month.getFullYear(), month.getMonth(), 1).getDay() + new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()) / 7);

export default function App() {
  const [fontsLoaded, fontError] = useFonts({ Nunito_800ExtraBold });
  const [now, setNow] = useState(() => new Date());
  const today = now;
  const [activeTab, setActiveTab] = useState<Tab>('일정');
  const tabTranslate = useRef(new Animated.Value(0)).current;
  const tabTransitioning = useRef(false);
  const calendarTouch = useRef(false);
  const [laterSwipeBlocked, setLaterSwipeBlocked] = useState(false);
  const [selectedDate, setSelectedDate] = useState(today);
  const [shownMonth, setShownMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const calendarPageWidth = Dimensions.get('window').width - 40;
  const monthScrollRef = useRef<ScrollView>(null);
  const monthScrollLocked = useRef(false);
  const calendarHeightAnimated = useRef(new Animated.Value(calendarWeekCount(new Date(today.getFullYear(), today.getMonth(), 1)) * calendarDayHeight + 6)).current;
  const [brandMenuVisible, setBrandMenuVisible] = useState(false);
  const brandPressScale = useRef(new Animated.Value(1)).current;
  const brandMenuProgress = useRef(new Animated.Value(0)).current;
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [themeKey, setThemeKey] = useState<ThemeKey>('calm');
  const [themeLoaded, setThemeLoaded] = useState(false);
  const activeTheme = appThemes[themeKey];
  const [modalVisible, setModalVisible] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [titleInput, setTitleInput] = useState('');
  const [keywordInput, setKeywordInput] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [categories, setCategories] = useState<Category[]>(defaultCategories);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);
  const [categoryEditorOpen, setCategoryEditorOpen] = useState(false);
  const [showAdditionalCategories, setShowAdditionalCategories] = useState(false);
  const [categoryLayouts, setCategoryLayouts] = useState<Record<string, { x: number; y: number; width: number; height: number }>>({});
  const [draggedCategory, setDraggedCategory] = useState<Category | null>(null);
  const [dragOverCategoryId, setDragOverCategoryId] = useState<string | null>(null);
  const dragPosition = useMemo(() => new Animated.ValueXY(), []);
  const targetSwapPosition = useMemo(() => new Animated.ValueXY(), []);
  const [categorySwapTarget, setCategorySwapTarget] = useState<Category | null>(null);
  const categorySwapAnimating = useRef(false);
  const sheetTranslateY = useMemo(() => new Animated.Value(0), []);
  const sheetDragResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gesture) => gesture.dy > 3,
    onPanResponderGrant: () => sheetTranslateY.stopAnimation(),
    onPanResponderMove: (_, gesture) => sheetTranslateY.setValue(Math.max(0, gesture.dy)),
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dy > 90 || gesture.vy > 0.75) {
        setModalVisible(false);
        setEditingScheduleId(null);
      } else Animated.spring(sheetTranslateY, { damping: 22, stiffness: 240, toValue: 0, useNativeDriver: true }).start();
    },
    onPanResponderTerminate: () => Animated.spring(sheetTranslateY, { damping: 22, stiffness: 240, toValue: 0, useNativeDriver: true }).start(),
  }), [sheetTranslateY]);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [categoryNameInput, setCategoryNameInput] = useState('');
  const [categoryColorInput, setCategoryColorInput] = useState(colors[0]);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [timeValue, setTimeValue] = useState(new Date(2000, 0, 1, 9, 0));
  const [loaded, setLoaded] = useState(false);
  const [schedules, setSchedules] = useState<Schedule[]>([]);

  useEffect(() => {
    const loadSchedules = async () => {
      try {
        const saved = await AsyncStorage.getItem(storageKey);
        if (saved) { setSchedules(JSON.parse(saved) as Schedule[]); }
        else {
    const dinner = new Date(); dinner.setDate(today.getDate() + 3);
          setSchedules([
      { id: '1', date: dateKey(today), time: '10:00', title: '주간 계획 정리', keyword: '계획정리', category: '개인', color: colors[0] },
      { id: '2', date: dateKey(today), time: '19:30', title: '운동하기', keyword: '운동', category: '건강', color: colors[1] },
      { id: '3', date: dateKey(dinner), time: '19:00', title: '친구와 저녁 약속', keyword: '저녁약속', category: '약속', color: colors[2] },
          ]);
        }
      } catch { Alert.alert('저장된 일정을 불러오지 못했습니다.'); }
      finally { setLoaded(true); }
    };
    void loadSchedules();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontError, fontsLoaded]);

  useEffect(() => {
    const loadCategories = async () => {
      try {
        const saved = await AsyncStorage.getItem(categoryStorageKey);
        if (saved) setCategories(JSON.parse(saved) as Category[]);
      } catch { Alert.alert('카테고리를 불러오지 못했습니다.'); }
      finally { setCategoriesLoaded(true); }
    };
    void loadCategories();
  }, []);

  useEffect(() => {
    const loadTheme = async () => {
      try {
        const saved = await AsyncStorage.getItem(themeStorageKey);
        if (saved === 'calm' || saved === 'dreamy' || saved === 'warm') setThemeKey(saved);
      } finally { setThemeLoaded(true); }
    };
    void loadTheme();
  }, []);

  useEffect(() => {
    if (loaded) void AsyncStorage.setItem(storageKey, JSON.stringify(schedules));
  }, [loaded, schedules]);
  useEffect(() => {
    if (categoriesLoaded) void AsyncStorage.setItem(categoryStorageKey, JSON.stringify(categories));
  }, [categories, categoriesLoaded]);
  useEffect(() => {
    if (themeLoaded) void AsyncStorage.setItem(themeStorageKey, themeKey);
  }, [themeKey, themeLoaded]);
  const displayedMonth = Number.isNaN(shownMonth.getTime()) ? new Date(today.getFullYear(), today.getMonth(), 1) : shownMonth;
  const visibleMonths = useMemo(() => [-1, 0, 1].map((offset) => new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() + offset, 1)), [displayedMonth.getFullYear(), displayedMonth.getMonth()]);
  const calendarHeight = calendarWeekCount(displayedMonth) * calendarDayHeight + 6;
  useEffect(() => {
    Animated.timing(calendarHeightAnimated, { duration: 220, easing: Easing.out(Easing.cubic), toValue: calendarHeight, useNativeDriver: false }).start();
  }, [calendarHeight, calendarHeightAnimated]);
  useEffect(() => {
    if (Number.isNaN(shownMonth.getTime())) setShownMonth(new Date(today.getFullYear(), today.getMonth(), 1));
  }, [shownMonth]);
  useLayoutEffect(() => {
    monthScrollRef.current?.scrollTo({ animated: false, x: calendarPageWidth, y: 0 });
    monthScrollLocked.current = false;
  }, [calendarPageWidth, shownMonth, activeTab]);
  const selectedCategory = categories.find((category) => category.id === selectedCategoryId);
  const selectedSchedules = schedules.filter((schedule) => schedule.date === dateKey(selectedDate)).sort((a, b) => a.time.localeCompare(b.time));
  const selectedDateStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const selectedDateIsPast = selectedDateStart.getTime() < todayStart.getTime();
  const upcomingReference = selectedDateStart.getTime() <= todayStart.getTime() ? now : selectedDateStart;
  const upcomingReferenceDate = selectedDateIsPast ? today : selectedDate;
  const nearestSchedule = schedules.filter((schedule) => scheduleDateTime(schedule).getTime() >= upcomingReference.getTime()).sort((a, b) => scheduleDateTime(a).getTime() - scheduleDateTime(b).getTime())[0];
  const closeBrandMenu = (onClosed?: () => void) => Animated.timing(brandMenuProgress, { duration: 150, easing: Easing.in(Easing.cubic), toValue: 0, useNativeDriver: true }).start(() => { setBrandMenuVisible(false); onClosed?.(); });
  const toggleBrandMenu = () => {
    if (brandMenuVisible) { closeBrandMenu(); return; }
    setBrandMenuVisible(true);
    brandMenuProgress.setValue(0);
    requestAnimationFrame(() => Animated.spring(brandMenuProgress, { damping: 18, stiffness: 230, toValue: 1, useNativeDriver: true }).start());
  };
  const openSettings = () => closeBrandMenu(() => setSettingsVisible(true));
  const closeAddModal = () => { setModalVisible(false); setEditingScheduleId(null); };
  const openAddModal = (date: Date) => { sheetTranslateY.setValue(0); setEditingScheduleId(null); setSelectedDate(date); setTitleInput(''); setKeywordInput(''); setSelectedCategoryId(''); setShowAdditionalCategories(false); setCategoryEditorOpen(false); setCreatingCategory(false); setEditingCategoryId(null); setTimeValue(new Date(2000, 0, 1, 9, 0)); setModalVisible(true); };
  const openEditModal = (schedule: Schedule) => {
    const scheduleDate = parseDateKey(schedule.date);
    const [hour, minute] = schedule.time.split(':').map(Number);
    const matchingCategory = categories.find((category) => category.name === schedule.category && category.color === schedule.color);
    setEditingScheduleId(schedule.id);
    setSelectedDate(scheduleDate);
    setShownMonth(new Date(scheduleDate.getFullYear(), scheduleDate.getMonth(), 1));
    setTitleInput(schedule.title);
    setKeywordInput(schedule.keyword ?? '');
    setSelectedCategoryId(matchingCategory?.id ?? '');
    setShowAdditionalCategories(false);
    setCategoryEditorOpen(false);
    setCreatingCategory(false);
    setEditingCategoryId(null);
    setTimeValue(new Date(2000, 0, 1, hour, minute));
    sheetTranslateY.setValue(0);
    setModalVisible(true);
  };
  const finishMonthScroll = (offsetX: number) => {
    if (monthScrollLocked.current) return;
    const page = Math.round(offsetX / calendarPageWidth);
    const amount = page === 0 ? -1 : page === 2 ? 1 : 0;
    if (amount === 0) {
      monthScrollRef.current?.scrollTo({ animated: true, x: calendarPageWidth, y: 0 });
      return;
    }
    monthScrollLocked.current = true;
    setShownMonth((current) => {
      const validCurrent = Number.isNaN(current.getTime()) ? new Date(today.getFullYear(), today.getMonth(), 1) : current;
      return new Date(validCurrent.getFullYear(), validCurrent.getMonth() + amount, 1);
    });
  };
  const addSchedule = () => {
    const title = titleInput.trim();
    if (!title) { Alert.alert('일정 제목을 입력해 주세요.'); return; }
    const nextSchedule = { date: dateKey(selectedDate), time: formatTime(timeValue), title, keyword: keywordInput.trim(), category: selectedCategory?.name ?? '미지정', color: selectedCategory?.color ?? activeTheme.secondary };
    if (editingScheduleId) setSchedules((current) => current.map((schedule) => schedule.id === editingScheduleId ? { ...schedule, ...nextSchedule } : schedule));
    else setSchedules((current) => [...current, { id: `${Date.now()}`, ...nextSchedule }]);
    closeAddModal();
  };
  const beginCategoryEdit = (category: Category) => { setCreatingCategory(false); setEditingCategoryId(category.id); setCategoryNameInput(category.name); setCategoryColorInput(category.color); };
  const beginCategoryCreate = () => {
    if (categories.length >= 8) { Alert.alert('카테고리는 최대 8개까지 만들 수 있어요.'); return; }
    setCreatingCategory(true); setEditingCategoryId(null); setCategoryNameInput(''); setCategoryColorInput(colors[0]);
  };
  const saveCategory = () => {
    const name = categoryNameInput.trim();
    if (!name) { Alert.alert('카테고리 이름을 입력해 주세요.'); return; }
    const newId = `${Date.now()}`;
    const previous = categories.find((category) => category.id === editingCategoryId);
    if (editingCategoryId) {
      setCategories((current) => current.map((category) => category.id === editingCategoryId ? { ...category, name, color: categoryColorInput } : category));
      if (previous) setSchedules((current) => current.map((schedule) => schedule.category === previous.name && schedule.color === previous.color ? { ...schedule, category: name, color: categoryColorInput } : schedule));
    } else if (creatingCategory) setCategories((current) => [...current, { id: newId, name, color: categoryColorInput }]);
    setSelectedCategoryId(editingCategoryId ?? newId);
    setCreatingCategory(false);
    setEditingCategoryId(null);
  };
  const selectCategory = (category: Category) => {
    setSelectedCategoryId((current) => current === category.id ? '' : category.id);
    setShowAdditionalCategories(false);
  };
  const deleteCategory = (category: Category) => Alert.alert('카테고리를 삭제할까요?', `“${category.name}”은 카테고리 선택 목록에서 제거됩니다. 이미 만든 일정은 그대로 유지됩니다.`, [{ text: '취소', style: 'cancel' }, { text: '삭제', style: 'destructive', onPress: () => { setCategories((current) => current.filter((item) => item.id !== category.id)); if (selectedCategoryId === category.id) setSelectedCategoryId(''); } }]);
  const startCategoryDrag = (category: Category, x: number, y: number) => {
    if (categorySwapAnimating.current) return;
    setDraggedCategory(category);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    dragPosition.setValue({ x: categoryEditorOpen ? 0 : x - 31, y: categoryEditorOpen ? y - 27 : y - 31 });
  };
  const moveCategoryDrag = (x: number, y: number) => {
    if (categorySwapAnimating.current) return;
    dragPosition.setValue({ x: categoryEditorOpen ? 0 : x - 31, y: categoryEditorOpen ? y - 27 : y - 31 });
    const target = Object.entries(categoryLayouts).find(([, layout]) => x >= layout.x && x <= layout.x + layout.width && y >= layout.y && y <= layout.y + layout.height)?.[0] ?? null;
    setDragOverCategoryId(target);
  };
  const finishCategoryDrag = () => {
    if (draggedCategory && dragOverCategoryId && draggedCategory.id !== dragOverCategoryId) {
      const sourceId = draggedCategory.id;
      const targetId = dragOverCategoryId;
      const swapCategories = () => setCategories((current) => {
        const source = current.findIndex((category) => category.id === sourceId);
        const target = current.findIndex((category) => category.id === targetId);
        if (source < 0 || target < 0) return current;
        const next = [...current];
        [next[source], next[target]] = [next[target], next[source]];
        return next;
      });
      if (categoryEditorOpen) {
        const sourceLayout = categoryLayouts[sourceId];
        const targetLayout = categoryLayouts[targetId];
        const targetCategory = categories.find((category) => category.id === targetId);
        if (sourceLayout && targetLayout && targetCategory) {
          categorySwapAnimating.current = true;
          targetSwapPosition.setValue({ x: 0, y: targetLayout.y });
          setCategorySwapTarget(targetCategory);
          requestAnimationFrame(() => Animated.parallel([
            Animated.timing(dragPosition, { duration: 230, easing: Easing.inOut(Easing.cubic), toValue: { x: 0, y: targetLayout.y }, useNativeDriver: true }),
            Animated.timing(targetSwapPosition, { duration: 230, easing: Easing.inOut(Easing.cubic), toValue: { x: 0, y: sourceLayout.y }, useNativeDriver: true }),
          ]).start(({ finished }) => {
            if (finished) swapCategories();
            setCategorySwapTarget(null);
            setDraggedCategory(null);
            setDragOverCategoryId(null);
            categorySwapAnimating.current = false;
            if (finished) void Haptics.selectionAsync();
          }));
          return;
        }
      }
      LayoutAnimation.configureNext({ duration: 260, update: { type: LayoutAnimation.Types.easeInEaseOut } });
      swapCategories();
      void Haptics.selectionAsync();
    }
    setDraggedCategory(null);
    setDragOverCategoryId(null);
  };
  const deleteSchedule = (schedule: Schedule) => Alert.alert('일정을 삭제할까요?', `“${schedule.title}” 일정은 삭제 후 되돌릴 수 없습니다.`, [{ text: '취소', style: 'cancel' }, { text: '삭제', style: 'destructive', onPress: () => setSchedules((current) => current.filter((item) => item.id !== schedule.id)) }]);

  const settleTab = () => Animated.spring(tabTranslate, { toValue: 0, damping: 26, stiffness: 260, useNativeDriver: true }).start();
  const changeTab = (target: Tab) => {
    if (tabTransitioning.current || target === activeTab) return;
    tabTransitioning.current = true;
    const direction = tabs.indexOf(target) > tabs.indexOf(activeTab) ? 1 : -1;
    Animated.timing(tabTranslate, { toValue: -direction * calendarPageWidth, duration: 150, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(({ finished }) => {
      if (!finished) { tabTranslate.setValue(0); tabTransitioning.current = false; return; }
      tabTranslate.setValue(direction * calendarPageWidth);
      setActiveTab(target);
    });
  };
  useLayoutEffect(() => {
    if (!tabTransitioning.current) return;
    Animated.timing(tabTranslate, { toValue: 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => { tabTransitioning.current = false; });
  }, [activeTab, tabTranslate]);
  const tabSwipe = PanResponder.create({
    onStartShouldSetPanResponderCapture: () => { calendarTouch.current = false; return false; },
    onMoveShouldSetPanResponderCapture: (_, gesture) => !calendarTouch.current && !tabTransitioning.current && !modalVisible && !settingsVisible && !brandMenuVisible && !laterSwipeBlocked && gesture.numberActiveTouches === 1 && Math.abs(gesture.dx) > 18 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.8,
    onPanResponderMove: (_, gesture) => {
      const index = tabs.indexOf(activeTab);
      const atEdge = (index === 0 && gesture.dx > 0) || (index === tabs.length - 1 && gesture.dx < 0);
      tabTranslate.setValue(gesture.dx * (atEdge ? 0.15 : 0.7));
    },
    onPanResponderRelease: (_, gesture) => {
      const direction = gesture.dx < 0 ? 1 : -1;
      const target = tabs[tabs.indexOf(activeTab) + direction];
      if (target && (Math.abs(gesture.dx) > 65 || (Math.abs(gesture.dx) > 25 && Math.abs(gesture.vx) > 0.5))) changeTab(target);
      else settleTab();
    },
    onPanResponderTerminate: settleTab,
  });

  const scheduleLaterItem = async (item: LaterItem, date: Date) => {
    if (!loaded || !Number.isFinite(date.getTime())) throw new Error('Schedules not ready');
    const id = `later-${item.id}`;
    // A stable ID makes retrying safe if archiving the original item fails.
    if (schedules.some(schedule => schedule.id === id)) return;
    const category = categories.find(value => value.id === item.categoryId);
    const next = [...schedules, { id, title: item.title, date: dateKey(date), time: formatTime(date), category: category?.name ?? '미지정', color: category?.color ?? activeTheme.secondary }];
    await AsyncStorage.setItem(storageKey, JSON.stringify(next));
    setSchedules(next);
  };
  const openLaterSchedule = (item: LaterItem) => {
    const schedule = schedules.find(value => value.id === `later-${item.id}`);
    if (!schedule) { Alert.alert('일정을 찾을 수 없어요', '달력에서 삭제된 일정일 수 있어요. To later의 메모와 링크는 그대로 남아 있어요.'); return; }
    const target = parseDateKey(schedule.date);
    setSelectedDate(target);
    setShownMonth(new Date(target.getFullYear(), target.getMonth(), 1));
    changeTab('일정');
  };

  if (!fontsLoaded && !fontError) return null;

  return <SafeAreaView style={[styles.safeArea, { backgroundColor: activeTheme.background }]}>
    <StatusBar style="dark" />
    <View style={styles.container}>
      <View style={{ flex: 1, overflow: 'hidden' }}>
      <Animated.View style={{ flex: 1, transform: [{ translateX: tabTranslate }] }} {...tabSwipe.panHandlers}>
      {brandMenuVisible && <Pressable accessibilityLabel="브랜드 메뉴 닫기" onPress={() => closeBrandMenu()} style={styles.brandMenuBackdrop} />}
      {activeTab !== '상점' && activeTab !== 'To later' && <><View style={styles.header}>
        <Pressable accessibilityLabel="Dalvi 메뉴" accessibilityRole="button" accessibilityState={{ expanded: brandMenuVisible }} onPress={toggleBrandMenu} onPressIn={() => Animated.spring(brandPressScale, { damping: 18, stiffness: 300, toValue: 0.95, useNativeDriver: true }).start()} onPressOut={() => Animated.spring(brandPressScale, { damping: 16, stiffness: 260, toValue: 1, useNativeDriver: true }).start()} style={styles.brandButton}><Animated.View style={[styles.brand, { transform: [{ scale: brandPressScale }] }]}><Image accessibilityLabel="Dalvi 로고" source={require('./assets/dalvi-moon-clock-cropped.png')} style={[styles.brandLogo, { tintColor: activeTheme.primary }]} /><Text style={[styles.brandName, { color: activeTheme.primary }]}>Dalvi</Text><Animated.View style={[styles.brandChevron, { borderBottomColor: activeTheme.secondary, borderRightColor: activeTheme.secondary, transform: [{ rotate: brandMenuProgress.interpolate({ inputRange: [0, 1], outputRange: ['45deg', '225deg'] }) }] }]} /></Animated.View></Pressable>
        <Text style={[styles.month, { color: activeTheme.primary }]}>{displayedMonth.getFullYear()}년 {displayedMonth.getMonth() + 1}월</Text>
        {brandMenuVisible && <Animated.View style={[styles.brandMenu, { borderColor: activeTheme.secondary, opacity: brandMenuProgress, shadowColor: activeTheme.primary, transform: [{ translateY: brandMenuProgress.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) }, { scale: brandMenuProgress.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }] }]}><Pressable accessibilityLabel="설정 열기" onPress={openSettings} style={({ pressed }) => [styles.brandMenuItem, pressed && { backgroundColor: activeTheme.soft }]}><Text style={[styles.brandMenuIcon, { color: activeTheme.primary }]}>⚙︎</Text><Text style={[styles.brandMenuText, { color: activeTheme.primary }]}>설정</Text></Pressable></Animated.View>}
      </View>
      <View onTouchStart={() => { calendarTouch.current = true; }}>
      <View style={styles.weekRow}>{weekDays.map((day, index) => <Text key={day} style={[styles.weekHeader, { color: activeTheme.secondary }, index === 0 && styles.sunday, index === 6 && styles.saturday]}>{day}</Text>)}</View>
      <Animated.View style={[styles.calendarViewport, { height: calendarHeightAnimated }]}><ScrollView bounces={false} contentContainerStyle={styles.calendarPager} contentOffset={{ x: calendarPageWidth, y: 0 }} decelerationRate="fast" directionalLockEnabled horizontal onMomentumScrollEnd={(event) => finishMonthScroll(event.nativeEvent.contentOffset.x)} pagingEnabled ref={monthScrollRef} showsHorizontalScrollIndicator={false}>{visibleMonths.map((month) => <CalendarMonth key={`${month.getFullYear()}-${month.getMonth()}`} month={month} onSelectDate={setSelectedDate} pageWidth={calendarPageWidth} schedules={schedules} selectedDate={selectedDate} theme={activeTheme} today={today} />)}</ScrollView></Animated.View></View></>}
      {activeTab === 'To later' && <ToLaterScreen theme={activeTheme} categories={categories} onSettings={() => setSettingsVisible(true)} onSchedule={scheduleLaterItem} onOpenSchedule={openLaterSchedule} onSwipeBlockedChange={setLaterSwipeBlocked} />}
      {activeTab === 'To later' ? null : activeTab === '일정' ? <ScrollView contentContainerStyle={[styles.content, styles.compactScheduleContent]} showsVerticalScrollIndicator={false}>
        <View style={styles.sectionHeader}><Text style={[styles.sectionTitle, { color: activeTheme.primary }]}>{dateLabel(selectedDate)} 일정</Text><Pressable accessibilityLabel={`${dateLabel(selectedDate)}에 일정 추가`} hitSlop={8} onPress={() => openAddModal(selectedDate)} style={({ pressed }) => [styles.sectionAddButton, { backgroundColor: activeTheme.soft }, pressed && styles.sectionAddButtonPressed]}><Text style={[styles.sectionAddButtonText, { color: activeTheme.primary }]}>＋</Text></Pressable></View>
        {selectedSchedules.length ? selectedSchedules.map((schedule) => <ScheduleCard key={schedule.id} onDelete={() => deleteSchedule(schedule)} onEdit={() => openEditModal(schedule)} {...schedule} />) : <View style={styles.noSchedule}><Text style={styles.noScheduleText}>아직 등록된 일정이 없어요.</Text><Pressable onPress={() => openAddModal(selectedDate)}><Text style={styles.noScheduleAction}>이 날짜에 일정 추가하기</Text></Pressable></View>}
        {nearestSchedule && <UpcomingCard referenceDate={upcomingReferenceDate} schedule={nearestSchedule} />}
        <View accessibilityLabel="광고 배너 영역" style={[styles.adBannerSlot, { backgroundColor: activeTheme.soft, borderColor: activeTheme.secondary }]}><Text style={[styles.adBannerPlaceholder, { color: activeTheme.primary }]}>광고 영역</Text></View>
      </ScrollView> : activeTab === '상점' ? <View style={styles.shopScreen}><Text style={styles.shopIcon}>✦</Text><Text style={styles.emptyTabTitle}>상점</Text><Text style={styles.emptyTabText}>더 다양한 카테고리 색상, 광고 제거, 유저 커스텀 UI를 준비하고 있어요.</Text><Text style={styles.shopComingSoon}>나중에 발매될 예정입니다</Text></View> : <View style={styles.emptyTab}><Text style={styles.emptyTabTitle}>{activeTab}</Text><Text style={styles.emptyTabText}>이 탭은 일정 저장 기능을 만든 뒤 차례로 연결합니다.</Text></View>}
      </Animated.View></View>
      <View style={[styles.tabBar, { borderTopColor: activeTheme.soft }]}>{tabs.map((tab) => <Pressable key={tab} onPress={() => changeTab(tab)} style={styles.tabButton}><Text style={[styles.tabLabel, activeTab === tab && { color: activeTheme.primary }]}>{tab}</Text></Pressable>)}</View>
    </View>
    <Modal animationType="slide" onDismiss={() => sheetTranslateY.setValue(0)} transparent visible={modalVisible} onRequestClose={closeAddModal}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalBackdrop}><ScrollView bounces={false} contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled"><Pressable accessibilityLabel="일정 추가 닫기" onPress={closeAddModal} style={styles.modalDismissArea} /><Animated.View style={[styles.modalCard, { transform: [{ translateY: sheetTranslateY }] }]}><View style={styles.sheetHandleTouchArea} {...sheetDragResponder.panHandlers}><View style={[styles.modalHandle, styles.interactiveModalHandle]} /></View>
      {categoryEditorOpen ? <View>
        <View style={styles.editorHeader}><Pressable onPress={() => { setCategoryEditorOpen(false); setCreatingCategory(false); setEditingCategoryId(null); }}><Text style={styles.backText}>‹</Text></Pressable><Text style={styles.modalTitle}>카테고리 편집</Text><View style={styles.headerSpacer} /></View>
        {(creatingCategory || editingCategoryId) ? <View><TextInput onChangeText={setCategoryNameInput} placeholder="카테고리 이름" placeholderTextColor="#A19BA8" style={styles.input} value={categoryNameInput} /><Text style={styles.timeLabel}>색상</Text><View style={styles.palette}>{colors.map((color) => <Pressable key={color} onPress={() => setCategoryColorInput(color)} style={[styles.paletteChoice, categoryColorInput === color && styles.paletteChoiceSelected]}><View style={[styles.paletteSwatch, { backgroundColor: color }]} /></Pressable>)}</View><View style={styles.modalButtons}><Pressable onPress={() => { setCreatingCategory(false); setEditingCategoryId(null); }} style={styles.cancelButton}><Text style={styles.cancelText}>취소</Text></Pressable><Pressable onPress={saveCategory} style={styles.saveButton}><Text style={styles.saveText}>저장</Text></Pressable></View></View> : <View><Text style={styles.editListHint}>카테고리를 길게 누른 뒤 위아래로 옮겨 순서를 변경하세요.</Text><CategoryEditorList categories={categories} draggedCategoryId={draggedCategory?.id ?? null} dragOverCategoryId={dragOverCategoryId} onDelete={deleteCategory} onDragEnd={finishCategoryDrag} onDragMove={moveCategoryDrag} onDragStart={startCategoryDrag} onEdit={beginCategoryEdit} onMeasure={(id, layout) => setCategoryLayouts((current) => ({ ...current, [id]: layout }))} swappingCategoryId={categorySwapTarget?.id ?? null} /><Pressable disabled={categories.length >= 8} onPress={beginCategoryCreate} style={[styles.newCategoryButton, categories.length >= 8 && styles.newCategoryDisabled]}><Text style={styles.newCategoryText}>＋ 카테고리 추가 ({categories.length}/8)</Text></Pressable></View>}
      </View> : <View><Text style={styles.modalTitle}>{dateLabel(selectedDate)} 일정 {editingScheduleId ? '수정' : '추가'}</Text><TextInput onChangeText={setTitleInput} placeholder="무엇을 할 예정인가요?" placeholderTextColor="#A19BA8" style={styles.input} value={titleInput} /><TextInput maxLength={8} onChangeText={(text) => setKeywordInput(limitKeyword(text))} placeholder="캘린더에 표기할 키워드를 작성해 주세요" placeholderTextColor="#A19BA8" returnKeyType="done" style={styles.keywordInput} value={keywordInput} /><Text style={styles.keywordLimit}>{Array.from(keywordInput).length}/8</Text><View style={styles.labelRow}><View><Text style={styles.timeLabel}>카테고리</Text><Text style={styles.categoryHint}>{selectedCategory ? selectedCategory.name : '선택하지 않으면 미지정으로 저장돼요'}</Text></View><Pressable accessibilityLabel="카테고리 편집" onPress={() => setCategoryEditorOpen(true)} style={styles.categoryEditButton}><Text style={styles.categoryEditText}>편집</Text></Pressable></View>{showAdditionalCategories ? <CategorySwapPanel categories={categories} draggedCategoryId={draggedCategory?.id ?? null} dragOverCategoryId={dragOverCategoryId} onDragEnd={finishCategoryDrag} onDragMove={moveCategoryDrag} onDragStart={startCategoryDrag} onMeasure={(id, layout) => setCategoryLayouts((current) => ({ ...current, [id]: layout }))} onSelect={selectCategory} selectedCategoryId={selectedCategoryId} /> : <View style={styles.colorPicker}>{categories.slice(0, 4).map((category) => <Pressable key={category.id} accessibilityLabel={`${category.name} 카테고리${selectedCategoryId === category.id ? ' 선택 해제' : ' 선택'}`} accessibilityRole="radio" accessibilityState={{ checked: selectedCategoryId === category.id }} onPress={() => selectCategory(category)} style={[styles.colorChoice, selectedCategoryId === category.id && styles.colorChoiceSelected]}><View style={[styles.colorSwatch, { backgroundColor: category.color }]} /><Text numberOfLines={1} style={styles.colorName}>{category.name}</Text></Pressable>)}<Pressable accessibilityLabel="전체 카테고리와 순서 변경" onPress={() => setShowAdditionalCategories(true)} style={[styles.colorChoice, styles.moreCategoryChoice]}><Text style={styles.moreCategoryPlus}>＋</Text></Pressable></View>}<Text style={styles.timeLabel}>시간</Text><DateTimePicker display="spinner" is24Hour locale="ko-KR" mode="time" onChange={(_, date) => date && setTimeValue(date)} style={styles.timePicker} value={timeValue} /><View style={styles.modalButtons}><Pressable onPress={closeAddModal} style={styles.cancelButton}><Text style={styles.cancelText}>취소</Text></Pressable><Pressable onPress={addSchedule} style={styles.saveButton}><Text style={styles.saveText}>{editingScheduleId ? '수정 저장' : '저장'}</Text></Pressable></View></View>}
    </Animated.View></ScrollView>{draggedCategory && <Animated.View pointerEvents="none" style={[styles.dragOverlay, categoryEditorOpen ? styles.editorDragOverlay : styles.gridDragOverlay, { transform: dragPosition.getTranslateTransform() }]}>{categoryEditorOpen ? <View style={styles.dragOverlayRow}><Text style={styles.dragHandle}>≡</Text><View style={[styles.listColor, { backgroundColor: draggedCategory.color }]} /><Text style={styles.listCategoryName}>{draggedCategory.name}</Text></View> : <View style={[styles.colorChoice, styles.dragOverlayTile]}><View style={[styles.colorSwatch, { backgroundColor: draggedCategory.color }]} /><Text numberOfLines={1} style={styles.colorName}>{draggedCategory.name}</Text></View>}</Animated.View>}{categorySwapTarget && <Animated.View pointerEvents="none" style={[styles.dragOverlay, styles.editorDragOverlay, styles.targetSwapOverlay, { transform: targetSwapPosition.getTranslateTransform() }]}><View style={styles.dragOverlayRow}><Text style={styles.dragHandle}>≡</Text><View style={[styles.listColor, { backgroundColor: categorySwapTarget.color }]} /><Text style={styles.listCategoryName}>{categorySwapTarget.name}</Text></View></Animated.View>}</KeyboardAvoidingView></Modal>
    <Modal animationType="slide" onRequestClose={() => setSettingsVisible(false)} presentationStyle="pageSheet" visible={settingsVisible}>
      <SafeAreaView style={[styles.settingsScreen, { backgroundColor: activeTheme.background }]}>
        <View style={styles.settingsHeader}><Pressable accessibilityLabel="설정 닫기" hitSlop={10} onPress={() => setSettingsVisible(false)}><Text style={[styles.settingsBack, { color: activeTheme.primary }]}>‹</Text></Pressable><Text style={[styles.settingsTitle, { color: activeTheme.primary }]}>설정</Text><View style={styles.settingsHeaderSpacer} /></View>
        <Text style={[styles.settingsSectionTitle, { color: activeTheme.primary }]}>테마</Text>
        <Text style={styles.settingsDescription}>Dalvi에 어울리는 달빛 색상을 선택해 주세요.</Text>
        <View style={styles.themeList}>{themeChoices.map((choice) => { const palette = appThemes[choice.key]; const selected = themeKey === choice.key; return <Pressable accessibilityLabel={`${choice.name} 테마 선택`} accessibilityRole="radio" accessibilityState={{ checked: selected }} key={choice.key} onPress={() => setThemeKey(choice.key)} style={({ pressed }) => [styles.themeCard, { borderColor: selected ? activeTheme.primary : '#DCE3EB' }, selected && { backgroundColor: activeTheme.soft }, pressed && styles.themeCardPressed]}><View style={styles.themeSwatches}><View style={[styles.themeSwatch, { backgroundColor: palette.primary }]} /><View style={[styles.themeSwatch, { backgroundColor: palette.secondary }]} /><View style={[styles.themeSwatch, { backgroundColor: palette.soft }]} /></View><View style={styles.themeTextWrap}><Text style={[styles.themeName, { color: activeTheme.primary }]}>{choice.name}</Text><Text style={styles.themeDescription}>{choice.description}</Text></View><View style={[styles.themeRadio, { borderColor: selected ? activeTheme.primary : '#AAB5C1' }]}>{selected && <View style={[styles.themeRadioDot, { backgroundColor: activeTheme.primary }]} />}</View></Pressable>; })}</View>
      </SafeAreaView>
    </Modal>
  </SafeAreaView>;
}

function CalendarMonth({ month, pageWidth, selectedDate, today, schedules, theme, onSelectDate }: {
  month: Date; pageWidth: number; selectedDate: Date; today: Date; schedules: Schedule[]; theme: AppTheme; onSelectDate: (date: Date) => void;
}) {
  const dates = buildCalendar(month);
  return <View style={[styles.calendarGrid, { width: pageWidth }]}>{dates.map((date, index) => {
    if (!date) return <View key={`empty-${index}`} style={[styles.dayCell, styles.keywordDayCell]} />;
    const selected = dateKey(date) === dateKey(selectedDate);
    const todayCell = dateKey(date) === dateKey(today);
    const datedSchedules = schedules.filter((schedule) => schedule.date === dateKey(date));
    const keywordSchedules = datedSchedules.filter((schedule) => schedule.keyword?.trim()).slice(0, 2);
    const hasUnlabeledSchedule = datedSchedules.some((schedule) => !schedule.keyword?.trim());
    return <Pressable key={dateKey(date)} onPress={() => onSelectDate(date)} style={[styles.dayCell, styles.keywordDayCell]}><View style={[styles.dayCircle, styles.compactDayCircle, selected && { backgroundColor: theme.primary }, todayCell && !selected && { borderColor: theme.secondary, borderWidth: 1 }]}><Text style={[styles.dayText, styles.compactDayText, { color: theme.primary }, selected && styles.selectedDayText]}>{date.getDate()}</Text></View><View style={styles.calendarKeywordSlot}>{keywordSchedules.map((schedule) => <View key={schedule.id} style={[styles.calendarKeyword, { backgroundColor: `${schedule.color}24`, borderColor: `${schedule.color}70` }]}><Text numberOfLines={2} style={styles.calendarKeywordText}>{formatCalendarKeyword(schedule.keyword ?? '')}</Text></View>)}{hasUnlabeledSchedule && keywordSchedules.length === 0 && <View style={[styles.unlabeledScheduleDot, { backgroundColor: theme.primary }]} />}</View></Pressable>;
  })}</View>;
}

function ScheduleCard({ time, title, category, color, onEdit, onDelete }: Schedule & { onEdit: () => void; onDelete: () => void }) { return <View style={[styles.scheduleCard, styles.compactScheduleCard]}><View style={[styles.colorBar, { backgroundColor: color }]} /><View style={styles.timeWrap}><Text style={styles.time}>{time}</Text></View><View style={styles.scheduleTextWrap}><Text style={styles.scheduleTitle}>{title}</Text><Text style={styles.category}>{category}</Text></View><View style={styles.scheduleActions}><Pressable accessibilityLabel={`${title} 수정`} hitSlop={8} onPress={onEdit} style={styles.editScheduleButton}><Text style={styles.editScheduleText}>수정</Text></Pressable><Pressable accessibilityLabel={`${title} 삭제`} hitSlop={8} onPress={onDelete} style={styles.deleteButton}><Text style={styles.deleteText}>삭제</Text></Pressable></View></View>; }
function UpcomingCard({ schedule, referenceDate }: { schedule: Schedule; referenceDate: Date }) { const target = parseDateKey(schedule.date); const reference = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate()); const dayCount = Math.round((target.getTime() - reference.getTime()) / 86400000); const displayTitle = schedule.keyword?.trim() || schedule.title; return <View style={styles.upcomingCard}><View style={styles.upcomingBadge}><Text style={styles.upcomingBadgeText}>{dayCount === 0 ? 'D-DAY' : `D-${dayCount}`}</Text></View><View style={styles.upcomingTextWrap}><Text style={styles.upcomingLabel}>다가오는 일정</Text><Text style={styles.upcomingTitle}>{displayTitle}</Text><Text style={styles.upcomingDate}>{dateLabel(target)} · {schedule.time}</Text></View></View>; }

type CategoryLayout = { x: number; y: number; width: number; height: number };

function CategorySwapPanel({ categories, selectedCategoryId, draggedCategoryId, dragOverCategoryId, onSelect, onDragStart, onDragMove, onDragEnd, onMeasure }: {
  categories: Category[]; selectedCategoryId: string; draggedCategoryId: string | null; dragOverCategoryId: string | null;
  onSelect: (category: Category) => void; onDragStart: (category: Category, x: number, y: number) => void;
  onDragMove: (x: number, y: number) => void; onDragEnd: () => void; onMeasure: (id: string, layout: CategoryLayout) => void;
}) {
  const renderTile = (category: Category) => <CategoryGridDragTile key={category.id} category={category} dragged={draggedCategoryId === category.id} target={dragOverCategoryId === category.id && draggedCategoryId !== category.id} selected={selectedCategoryId === category.id} onDragEnd={onDragEnd} onDragMove={onDragMove} onDragStart={onDragStart} onMeasure={onMeasure} onSelect={onSelect} />;
  return <View style={styles.swapPanel}><Text style={styles.additionalTitle}>길게 누른 뒤 다른 카테고리 위에 놓으면 서로 자리가 바뀝니다.</Text><Text style={styles.swapSectionTitle}>상단 카테고리</Text><View style={styles.swapRow}>{categories.slice(0, 4).map(renderTile)}</View>{categories.length > 4 && <><Text style={styles.swapSectionTitle}>추가 카테고리</Text><View style={styles.swapRow}>{categories.slice(4).map(renderTile)}</View></>}</View>;
}

function CategoryGridDragTile({ category, selected, dragged, target, onSelect, onDragStart, onDragMove, onDragEnd, onMeasure }: {
  category: Category; selected: boolean; dragged: boolean; target: boolean; onSelect: (category: Category) => void;
  onDragStart: (category: Category, x: number, y: number) => void; onDragMove: (x: number, y: number) => void;
  onDragEnd: () => void; onMeasure: (id: string, layout: CategoryLayout) => void;
}) {
  const ref = useRef<View>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDragging = useRef(false);
  const handlers = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: (_, gesture) => { longPressTimer.current = setTimeout(() => { isDragging.current = true; onDragStart(category, gesture.x0, gesture.y0); }, 280); },
    onPanResponderMove: (_, gesture) => { if (isDragging.current) onDragMove(gesture.moveX, gesture.moveY); },
    onPanResponderRelease: () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); if (isDragging.current) onDragEnd(); else onSelect(category); isDragging.current = false; },
    onPanResponderTerminate: () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); if (isDragging.current) onDragEnd(); isDragging.current = false; },
  }), [category, onDragEnd, onDragMove, onDragStart, onSelect]);
  return <View ref={ref} onLayout={() => ref.current?.measureInWindow((x, y, width, height) => onMeasure(category.id, { x, y, width, height }))} style={styles.swapGridCell} {...handlers.panHandlers}><View style={[styles.colorChoice, selected && styles.colorChoiceSelected, dragged && styles.swapSource, target && styles.swapTarget]}><View style={[styles.colorSwatch, { backgroundColor: category.color }]} /><Text numberOfLines={1} style={styles.colorName}>{category.name}</Text></View></View>;
}

function CategoryEditorList({ categories, draggedCategoryId, dragOverCategoryId, swappingCategoryId, onEdit, onDelete, onDragStart, onDragMove, onDragEnd, onMeasure }: {
  categories: Category[]; draggedCategoryId: string | null; dragOverCategoryId: string | null;
  swappingCategoryId: string | null;
  onEdit: (category: Category) => void; onDelete: (category: Category) => void;
  onDragStart: (category: Category, x: number, y: number) => void; onDragMove: (x: number, y: number) => void;
  onDragEnd: () => void; onMeasure: (id: string, layout: CategoryLayout) => void;
}) {
  return <View style={styles.categoryDragList}>{categories.map((category) => <CategoryEditorDragRow key={category.id} category={category} canDelete={categories.length > 4} dragged={draggedCategoryId === category.id} swapping={swappingCategoryId === category.id} target={dragOverCategoryId === category.id && draggedCategoryId !== category.id} onDelete={onDelete} onDragEnd={onDragEnd} onDragMove={onDragMove} onDragStart={onDragStart} onEdit={onEdit} onMeasure={onMeasure} />)}</View>;
}

function CategoryEditorDragRow({ category, canDelete, dragged, target, swapping, onEdit, onDelete, onDragStart, onDragMove, onDragEnd, onMeasure }: {
  category: Category; canDelete: boolean; dragged: boolean; target: boolean; swapping: boolean;
  onEdit: (category: Category) => void; onDelete: (category: Category) => void;
  onDragStart: (category: Category, x: number, y: number) => void; onDragMove: (x: number, y: number) => void; onDragEnd: () => void;
  onMeasure: (id: string, layout: CategoryLayout) => void;
}) {
  const ref = useRef<View>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDragging = useRef(false);
  const handlers = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: (_, gesture) => { longPressTimer.current = setTimeout(() => { isDragging.current = true; onDragStart(category, gesture.x0, gesture.y0); }, 280); },
    onPanResponderMove: (_, gesture) => { if (isDragging.current) onDragMove(gesture.moveX, gesture.moveY); },
    onPanResponderRelease: () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); if (isDragging.current) onDragEnd(); else onEdit(category); isDragging.current = false; },
    onPanResponderTerminate: () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); if (isDragging.current) onDragEnd(); isDragging.current = false; },
  }), [category, onDragEnd, onDragMove, onDragStart, onEdit]);
  return <View ref={ref} onLayout={() => ref.current?.measureInWindow((x, y, width, height) => onMeasure(category.id, { x, y, width, height }))} style={[styles.categoryListItem, dragged && styles.categoryListItemDragged, target && styles.categoryListItemTarget, (dragged || swapping) && styles.categoryListItemGhosted]}><View style={styles.categoryListEdit} {...handlers.panHandlers}><Text style={styles.dragHandle}>≡</Text><View style={[styles.listColor, { backgroundColor: category.color }]} /><Text style={styles.listCategoryName}>{category.name}</Text><Text style={styles.editLabel}>수정</Text></View>{canDelete && <Pressable onPress={() => onDelete(category)} style={styles.categoryDeleteButton}><Text style={styles.categoryDeleteText}>삭제</Text></Pressable>}</View>;
}

const styles = StyleSheet.create({
  swapPanel: { backgroundColor: '#E8EDF2', borderRadius: 12, marginBottom: 8, marginTop: 9, padding: 10 },
  swapSectionTitle: { color: '#61758A', fontSize: 12, fontWeight: '800', marginBottom: 6, marginTop: 7 },
  swapSource: { opacity: 0.25 },
  swapTarget: { backgroundColor: '#FFF9DF', borderColor: '#E7BE55', borderStyle: 'dashed', borderWidth: 2, transform: [{ scale: 1.08 }] },
  editorDragOverlay: { left: 22, right: 22 },
  gridDragOverlay: { left: 0, right: 'auto' },
  dragOverlayTile: { backgroundColor: '#FFFFFF', elevation: 8, opacity: 0.97, shadowColor: '#17243D', shadowOpacity: 0.22, shadowRadius: 12 },
  modalDismissArea: { flex: 1, minHeight: 48 },
  sheetHandleTouchArea: { alignItems: 'center', marginHorizontal: -22, marginTop: -18, paddingBottom: 16, paddingTop: 18 },
  interactiveModalHandle: { marginBottom: 0 },
  keywordInput: { backgroundColor: '#E8EDF2', borderRadius: 13, color: '#17243D', fontSize: 14, paddingHorizontal: 15, paddingVertical: 13 },
  keywordLimit: { alignSelf: 'flex-end', color: '#8090A0', fontSize: 11, marginBottom: 8, marginRight: 4, marginTop: 3 },
  keywordDayCell: { height: calendarDayHeight, justifyContent: 'flex-start', paddingTop: 1 },
  calendarKeywordSlot: { alignItems: 'center', gap: 1, height: 35, justifyContent: 'flex-start', position: 'relative', width: '100%' },
  calendarKeyword: { alignItems: 'center', borderRadius: 4, borderWidth: 1, justifyContent: 'center', minHeight: 16, paddingHorizontal: 2, width: 42 },
  calendarKeywordText: { color: '#24344F', fontSize: 7.5, fontWeight: '700', lineHeight: 8, textAlign: 'center' },
  unlabeledScheduleDot: { backgroundColor: '#17243D', borderRadius: 2, height: 4, marginTop: 1, width: 4 },
  scheduleActions: { alignItems: 'center', flexDirection: 'row', paddingRight: 6 },
  editScheduleButton: { paddingHorizontal: 8, paddingVertical: 15 },
  editScheduleText: { color: '#17243D', fontSize: 12, fontWeight: '700' },
  compactScheduleContent: { gap: 8, paddingTop: 8 },
  compactScheduleCard: { minHeight: 64 },
  compactDayCircle: { borderRadius: 15, height: 30, width: 30 },
  compactDayText: { fontSize: 14 },
  categoryListItemGhosted: { opacity: 0 },
  targetSwapOverlay: { zIndex: 29 },
  root: { flex: 1 }, safeArea: { flex: 1, backgroundColor: '#F8FAFC' }, container: { flex: 1, paddingHorizontal: 20 }, header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingTop: 18, position: 'relative', zIndex: 30 }, brandButton: { marginLeft: 0 }, brand: { alignItems: 'center', flexDirection: 'row' }, brandLogo: { height: 22, marginRight: 7, position: 'relative', resizeMode: 'contain', top: -3, width: 22 }, brandName: { color: '#17243D', fontFamily: 'Nunito_800ExtraBold', fontSize: 28, letterSpacing: -1, lineHeight: 33 }, brandChevron: { borderBottomColor: '#718396', borderBottomWidth: 2, borderRightColor: '#718396', borderRightWidth: 2, borderRadius: 1, height: 10, marginLeft: 9, position: 'relative', top: -3, width: 10 }, brandMenuBackdrop: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0, zIndex: 20 }, brandMenu: { backgroundColor: '#FFFFFF', borderColor: '#DCE3EB', borderRadius: 16, borderWidth: 1, elevation: 10, left: 0, padding: 6, position: 'absolute', shadowColor: '#17243D', shadowOffset: { height: 7, width: 0 }, shadowOpacity: 0.14, shadowRadius: 16, top: 60, width: 164, zIndex: 40 }, brandMenuItem: { alignItems: 'center', borderRadius: 11, flexDirection: 'row', minHeight: 48, paddingHorizontal: 13 }, brandMenuItemPressed: { backgroundColor: '#E8EDF2' }, brandMenuIcon: { color: '#17243D', fontSize: 19, marginRight: 11 }, brandMenuText: { color: '#17243D', fontSize: 15, fontWeight: '800' }, adBannerSlot: { alignItems: 'center', backgroundColor: '#EEF2F6', borderColor: '#DCE3EB', borderRadius: 16, borderWidth: 1, height: 52, justifyContent: 'center', marginTop: 14, overflow: 'hidden' }, adBannerPlaceholder: { color: '#8FA6BB', fontSize: 11, fontWeight: '700', letterSpacing: 0.2 }, eyebrow: { color: '#66778A', fontSize: 13, fontWeight: '600', marginBottom: 3 }, month: { color: '#17243D', fontSize: 18, fontWeight: '800' }, addButton: { alignItems: 'center', backgroundColor: '#17243D', borderRadius: 22, height: 44, justifyContent: 'center', width: 44 }, addButtonText: { color: '#FFFFFF', fontSize: 27, fontWeight: '300', lineHeight: 30 },
  monthNavigator: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingTop: 12 }, arrow: { color: '#4E6075', fontSize: 31, fontWeight: '300', lineHeight: 36 }, navigatorText: { color: '#77889A', fontSize: 12, fontWeight: '600' }, weekRow: { flexDirection: 'row', marginTop: 18 }, weekHeader: { color: '#718396', flex: 1, fontSize: 13, fontWeight: '700', textAlign: 'center' }, sunday: { color: '#BD7C82' }, saturday: { color: '#6F8FAA' }, calendarViewport: { overflow: 'hidden' }, calendarPager: { flexDirection: 'row' }, calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }, dayCell: { alignItems: 'center', height: 47, justifyContent: 'center', width: '14.2857%' }, dayCircle: { alignItems: 'center', borderRadius: 17, height: 34, justifyContent: 'center', width: 34 }, selectedDayCircle: { backgroundColor: '#17243D' }, todayCircle: { borderColor: '#8FA6BB', borderWidth: 1 }, dayText: { color: '#17243D', fontSize: 15, fontWeight: '700' }, selectedDayText: { color: '#FFFFFF' }, dotRow: { height: 4, marginTop: 1 }, dot: { backgroundColor: '#17243D', borderRadius: 2, height: 4, width: 4 },
  content: { gap: 10, paddingBottom: 16, paddingTop: 14 }, sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }, sectionTitle: { color: '#17243D', fontSize: 19, fontWeight: '800' }, sectionAddButton: { alignItems: 'center', backgroundColor: '#E8EDF2', borderRadius: 15, height: 30, justifyContent: 'center', width: 30 }, sectionAddButtonPressed: { opacity: 0.65, transform: [{ scale: 0.94 }] }, sectionAddButtonText: { color: '#17243D', fontSize: 22, fontWeight: '500', lineHeight: 25 }, scheduleCard: { alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 18, flexDirection: 'row', minHeight: 70, overflow: 'hidden' }, colorBar: { alignSelf: 'stretch', width: 5 }, timeWrap: { paddingHorizontal: 13 }, time: { color: '#30415A', fontSize: 13, fontWeight: '700' }, scheduleTextWrap: { flex: 1, paddingVertical: 12 }, scheduleTitle: { color: '#17243D', fontSize: 15, fontWeight: '800', marginBottom: 4 }, category: { color: '#7B8A9A', fontSize: 12, fontWeight: '600' }, deleteButton: { paddingHorizontal: 15, paddingVertical: 15 }, deleteText: { color: '#B06E76', fontSize: 12, fontWeight: '700' }, noSchedule: { alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 18, padding: 20 }, noScheduleText: { color: '#66778A', fontSize: 14, fontWeight: '600', marginBottom: 9 }, noScheduleAction: { color: '#17243D', fontSize: 14, fontWeight: '800' },
  upcomingCard: { alignItems: 'center', backgroundColor: '#E8EDF2', borderRadius: 18, flexDirection: 'row', marginTop: 7, padding: 14 }, upcomingBadge: { alignItems: 'center', backgroundColor: '#17243D', borderRadius: 13, height: 51, justifyContent: 'center', marginRight: 13, width: 56 }, upcomingBadgeText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' }, upcomingTextWrap: { flex: 1 }, upcomingLabel: { color: '#60788F', fontSize: 11, fontWeight: '700', marginBottom: 2 }, upcomingTitle: { color: '#17243D', fontSize: 15, fontWeight: '800', marginBottom: 2 }, upcomingDate: { color: '#657789', fontSize: 12, fontWeight: '600' },
  emptyTab: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: 36 }, shopScreen: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: 36 }, emptyTabTitle: { color: '#17243D', fontSize: 21, fontWeight: '800', marginBottom: 8 }, emptyTabText: { color: '#708194', fontSize: 14, lineHeight: 21, textAlign: 'center' }, shopIcon: { color: '#17243D', fontSize: 38, fontWeight: '800', marginBottom: 14 }, shopComingSoon: { backgroundColor: '#E8EDF2', borderRadius: 18, color: '#17243D', fontSize: 13, fontWeight: '800', marginTop: 20, overflow: 'hidden', paddingHorizontal: 14, paddingVertical: 8 }, tabBar: { borderTopColor: '#DCE3EB', borderTopWidth: 1, flexDirection: 'row', paddingBottom: 12, paddingTop: 10 }, tabButton: { alignItems: 'center', flex: 1, paddingVertical: 7 }, tabLabel: { color: '#91A0AF', fontSize: 12, fontWeight: '700' }, tabLabelActive: { color: '#17243D' },
  modalBackdrop: { backgroundColor: 'rgba(23, 36, 61, 0.38)', flex: 1, justifyContent: 'flex-end' }, modalScroll: { flexGrow: 1, justifyContent: 'flex-end' }, modalCard: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, paddingBottom: 34 }, modalHandle: { alignSelf: 'center', backgroundColor: '#DCE3EB', borderRadius: 3, height: 5, marginBottom: 21, width: 42 }, modalTitle: { color: '#17243D', fontSize: 20, fontWeight: '800', marginBottom: 18 }, input: { backgroundColor: '#E8EDF2', borderRadius: 13, color: '#17243D', fontSize: 15, marginBottom: 12, paddingHorizontal: 15, paddingVertical: 14 }, labelRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, timeLabel: { color: '#3F526A', fontSize: 14, fontWeight: '800', marginLeft: 3, marginTop: 4 }, categoryHint: { color: '#8090A0', fontSize: 10.5, marginLeft: 3, marginTop: 2 }, categoryEditButton: { backgroundColor: '#E8EDF2', borderRadius: 12, paddingHorizontal: 11, paddingVertical: 6 }, categoryEditText: { color: '#17243D', fontSize: 12, fontWeight: '800' }, colorPicker: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, marginTop: 9 }, colorChoice: { alignItems: 'center', borderColor: 'transparent', borderRadius: 12, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 9, width: 62 }, colorChoiceSelected: { backgroundColor: '#E8EDF2', borderColor: '#8FA6BB' }, colorSwatch: { borderRadius: 9, height: 18, marginBottom: 6, width: 18 }, colorName: { color: '#3F526A', fontSize: 11, fontWeight: '700', maxWidth: 52 }, moreCategoryChoice: { backgroundColor: '#E8EDF2', justifyContent: 'center' }, moreCategoryPlus: { color: '#17243D', fontSize: 23, lineHeight: 32 }, swapGridCell: { alignItems: 'center', marginBottom: 7, width: '25%' }, swapRow: { flexDirection: 'row', flexWrap: 'wrap' }, dragOverlay: { left: 22, position: 'absolute', right: 22, top: 0, zIndex: 30 }, dragOverlayRow: { alignItems: 'center', backgroundColor: '#FFFFFF', borderColor: '#8FA6BB', borderRadius: 12, borderWidth: 1, elevation: 8, flexDirection: 'row', minHeight: 54, opacity: 0.97, paddingHorizontal: 13, shadowColor: '#17243D', shadowOpacity: 0.22, shadowRadius: 12 }, additionalCategories: { backgroundColor: '#E8EDF2', borderRadius: 12, marginBottom: 8, marginTop: 9, padding: 10 }, additionalTitle: { color: '#61758A', fontSize: 11, lineHeight: 16, marginBottom: 7 }, noExtraText: { color: '#718396', fontSize: 12, padding: 7 }, timePicker: { height: 144, marginBottom: 6, width: '100%' }, modalButtons: { flexDirection: 'row', gap: 9, marginTop: 9 }, cancelButton: { alignItems: 'center', backgroundColor: '#E8EDF2', borderRadius: 13, flex: 1, paddingVertical: 14 }, cancelText: { color: '#4E6075', fontSize: 15, fontWeight: '800' }, saveButton: { alignItems: 'center', backgroundColor: '#17243D', borderRadius: 13, flex: 1, paddingVertical: 14 }, saveText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' }, editorHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, backText: { color: '#17243D', fontSize: 30, lineHeight: 30 }, headerSpacer: { width: 18 }, editListHint: { color: '#718396', fontSize: 12, lineHeight: 18, marginBottom: 8 }, categoryDragList: { maxHeight: 430 }, categoryListItem: { alignItems: 'center', backgroundColor: '#FFFFFF', borderBottomColor: '#E8EDF2', borderBottomWidth: 1, flexDirection: 'row', minHeight: 54, paddingHorizontal: 4 }, categoryListItemDragged: { opacity: 0.25 }, categoryListItemTarget: { backgroundColor: '#FFF9DF', borderColor: '#E7BE55', borderRadius: 12, borderStyle: 'dashed', borderWidth: 2 }, categoryListEdit: { alignItems: 'center', flex: 1, flexDirection: 'row', paddingHorizontal: 7, paddingVertical: 14 }, dragHandle: { color: '#8FA6BB', fontSize: 19, marginRight: 11 }, categoryDeleteButton: { paddingHorizontal: 9, paddingVertical: 12 }, categoryDeleteText: { color: '#B06E76', fontSize: 12, fontWeight: '800' }, listColor: { borderRadius: 9, height: 18, marginRight: 12, width: 18 }, listCategoryName: { color: '#24344F', flex: 1, fontSize: 15, fontWeight: '700' }, editLabel: { color: '#17243D', fontSize: 13, fontWeight: '700' }, newCategoryButton: { alignItems: 'center', backgroundColor: '#E8EDF2', borderRadius: 13, marginTop: 17, paddingVertical: 14 }, newCategoryDisabled: { opacity: 0.5 }, newCategoryText: { color: '#17243D', fontSize: 14, fontWeight: '800' }, palette: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 6, marginTop: 10 }, paletteChoice: { alignItems: 'center', borderColor: 'transparent', borderRadius: 18, borderWidth: 2, height: 36, justifyContent: 'center', width: 36 }, paletteChoiceSelected: { borderColor: '#17243D' }, paletteSwatch: { borderRadius: 13, height: 26, width: 26 },
  settingsScreen: { flex: 1, paddingHorizontal: 22 },
  settingsHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 22, paddingTop: 14 },
  settingsBack: { fontSize: 35, lineHeight: 38, width: 32 },
  settingsTitle: { fontSize: 20, fontWeight: '800' },
  settingsHeaderSpacer: { width: 32 },
  settingsSectionTitle: { fontSize: 18, fontWeight: '800', marginBottom: 5 },
  settingsDescription: { color: '#718092', fontSize: 13, lineHeight: 19, marginBottom: 18 },
  themeList: { gap: 11 },
  themeCard: { alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1.5, flexDirection: 'row', minHeight: 82, paddingHorizontal: 16, paddingVertical: 14 },
  themeCardPressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  themeSwatches: { flexDirection: 'row', marginRight: 14 },
  themeSwatch: { borderColor: '#FFFFFF', borderRadius: 12, borderWidth: 2, height: 24, marginRight: -6, width: 24 },
  themeTextWrap: { flex: 1 },
  themeName: { fontSize: 15, fontWeight: '800', marginBottom: 3 },
  themeDescription: { color: '#718092', fontSize: 11, lineHeight: 16 },
  themeRadio: { alignItems: 'center', borderRadius: 10, borderWidth: 1.5, height: 20, justifyContent: 'center', marginLeft: 10, width: 20 },
  themeRadioDot: { borderRadius: 5, height: 10, width: 10 },
});
