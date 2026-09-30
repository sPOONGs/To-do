import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Nunito_600SemiBold_Italic, Nunito_800ExtraBold, useFonts } from '@expo-google-fonts/nunito';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import * as SplashScreen from 'expo-splash-screen';
import ToLaterScreen, { type LaterItem } from './ToLaterScreen';
import HomeScreen from './HomeScreen';
import ToDreamScreen from './ToDreamScreen';
import { preserveLegacyData, storageKeys, storePlannerValue } from './plannerStorage';
import { bindLegacyCategories, calendarKeywordSchedules, dateKey, dateLabel, parseDateKey, readCategories, readSchedules, scheduleDateTime, scheduleDisplayTitle, type Category, type Schedule } from './plannerModel';
import { buildCalendar, calendarWeekCount, finishMonthGesture, isStationaryPageRelease, settledMonthPage, type MonthGesture } from './calendarModel';
import { compactHolidayName, getKoreanHolidayNames } from './koreanHolidays';
import { ChevronDown, HomeIcon, LaterIcon, SettingsIcon, StoreIcon, useReducedMotion } from './DalviUi';
import { expandScheduleDates, isDateInSelection, selectScheduleDate, type ScheduleMode } from './scheduleSelection';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, AppState, Easing, Image, KeyboardAvoidingView, LayoutAnimation, Linking, Modal, PanResponder, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

type Tab = '홈' | 'To do' | 'To later' | 'To dream';
type SettingsSection = 'main' | 'theme' | 'help';
type ScheduleStep = 'setup' | 'details';
const tabs: Tab[] = ['홈', 'To do', 'To later', 'To dream'];
type ThemeKey = 'calm' | 'dreamy' | 'warm';
type AppTheme = { primary: string; secondary: string; soft: string; background: string };
const weekDays = ['일', '월', '화', '수', '목', '금', '토'];
const calendarDayHeight = 72;
const adsEnabled = false;
const shopEnabled = false;
const minimumLoadingScreenMs = 3000;
const loadingQuotes = [
  '달빛 아래, 오늘의 시간을 천천히 펼쳐요.',
  '서두르지 않아도 괜찮아요. 나의 속도로 가요.',
  '작은 하루들이 모여 나의 길이 되어가요.',
  '오늘의 한 칸도 다정하게 채워 볼까요?',
  '잠시 숨을 고르고, 나의 시간을 만나러 가요.',
];
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
const scheduleModeChoices: { key: ScheduleMode; name: string }[] = [
  { key: 'single', name: '일반' },
  { key: 'range', name: '기간' },
  { key: 'multi', name: '다중' },
];
const scheduleModeLabel = (mode?: Schedule['mode']) => mode === 'range' ? '기간' : mode === 'multi' ? '다중' : '일반';
const formatTime = (date: Date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
const scheduleSelectionLabel = (mode: ScheduleMode, keys: string[]) => {
  if (!keys.length) return '날짜를 골라 주세요';
  if (mode === 'range') return keys.length === 2 ? `${dateLabel(parseDateKey(keys[0]))} – ${dateLabel(parseDateKey(keys[1]))}` : `${dateLabel(parseDateKey(keys[0]))}부터 마지막 날을 골라 주세요`;
  if (mode === 'multi') return `${keys.length}개의 날짜`;
  return dateLabel(parseDateKey(keys[0]));
};
const limitKeyword = (keyword: string) => Array.from(keyword.replace(/\r?\n/g, '')).slice(0, 8).join('');
const formatCalendarKeyword = (keyword: string) => {
  const characters = Array.from(keyword.trim()).slice(0, 8);
  return [characters.slice(0, 4).join(''), characters.slice(4, 8).join('')].filter(Boolean).join('\n');
};
const storageKey = storageKeys.schedules;
const categoryStorageKey = storageKeys.categories;
const themeStorageKey = storageKeys.theme;

void SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const [fontsLoaded, fontError] = useFonts({ Nunito_600SemiBold_Italic, Nunito_800ExtraBold });
  const [introReady, setIntroReady] = useState(false);
  const reduceMotion = useReducedMotion();
  const [now, setNow] = useState(() => new Date());
  const today = now;
  const [activeTab, setActiveTab] = useState<Tab>('홈');
  const tabTranslate = useRef(new Animated.Value(0)).current;
  const tabTransitioning = useRef(false);
  const calendarTouch = useRef(false);
  const scheduleCardTouch = useRef(false);
  const [laterSwipeBlocked, setLaterSwipeBlocked] = useState(false);
  const [selectedDate, setSelectedDate] = useState(today);
  const [shownMonth, setShownMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const { width: windowWidth } = useWindowDimensions();
  const calendarPageWidth = Math.max(240, windowWidth - 40);
  const monthScrollRef = useRef<ScrollView>(null);
  const monthScrollLocked = useRef(false);
  const monthGesture = useRef<MonthGesture>({ phase: 'idle', targetPage: null });
  const calendarHeightAnimated = useRef(new Animated.Value(calendarWeekCount(new Date(today.getFullYear(), today.getMonth(), 1)) * calendarDayHeight + 6)).current;
  const [brandMenuVisible, setBrandMenuVisible] = useState(false);
  const brandPressScale = useRef(new Animated.Value(1)).current;
  const brandMenuProgress = useRef(new Animated.Value(0)).current;
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('main');
  const settingsPageX = useRef(new Animated.Value(0)).current;
  const settingsTransitioning = useRef(false);
  const [shopVisible, setShopVisible] = useState(false);
  const [themeKey, setThemeKey] = useState<ThemeKey>('calm');
  const [themeLoaded, setThemeLoaded] = useState(false);
  const activeTheme = appThemes[themeKey];
  const [loadingQuote] = useState(() => loadingQuotes[Math.floor(Math.random() * loadingQuotes.length)]);
  const [modalVisible, setModalVisible] = useState(false);
  const [scheduleStep, setScheduleStep] = useState<ScheduleStep>('setup');
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>('single');
  const scheduleStepX = useRef(new Animated.Value(0)).current;
  const scheduleStepTransitioning = useRef(false);
  const scheduleCalendarReveal = useRef(new Animated.Value(0)).current;
  const scheduleModePosition = useRef(new Animated.Value(0)).current;
  const [scheduleModeRowWidth, setScheduleModeRowWidth] = useState(0);
  const [scheduleDateKeys, setScheduleDateKeys] = useState<string[]>([dateKey(today)]);
  const [schedulePickerMonth, setSchedulePickerMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [titleInput, setTitleInput] = useState('');
  const [keywordInput, setKeywordInput] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const categoryIndicatorX = useRef(new Animated.Value(0)).current;
  const categoryIndicatorOpacity = useRef(new Animated.Value(0)).current;
  const [categoryPickerWidth, setCategoryPickerWidth] = useState(0);
  const [preservedCategory, setPreservedCategory] = useState<Pick<Category, 'name' | 'color'> | null>(null);
  const [categories, setCategories] = useState<Category[]>(defaultCategories);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);
  const [categoryEditorOpen, setCategoryEditorOpen] = useState(false);
  const [showAdditionalCategories, setShowAdditionalCategories] = useState(false);
  const categoryLayouts = useRef<Record<string, { x: number; y: number; width: number; height: number }>>({});
  const categoryMeasures = useRef<Record<string, () => void>>({});
  const modalRoot = useRef<View>(null);
  const modalOrigin = useRef({ x: 0, y: 0 });
  const [draggedCategory, setDraggedCategory] = useState<Category | null>(null);
  const [dragOverCategoryId, setDragOverCategoryId] = useState<string | null>(null);
  const dragPosition = useMemo(() => new Animated.ValueXY(), []);
  const targetSwapPosition = useMemo(() => new Animated.ValueXY(), []);
  const [categorySwapTarget, setCategorySwapTarget] = useState<Category | null>(null);
  const categorySwapAnimating = useRef(false);
  const sheetTranslateY = useMemo(() => new Animated.Value(0), []);
  const closeScheduleRef = useRef<() => void>(() => {});
  const sheetDragResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gesture) => gesture.dy > 3,
    onPanResponderGrant: () => sheetTranslateY.stopAnimation(),
    onPanResponderMove: (_, gesture) => sheetTranslateY.setValue(Math.max(0, gesture.dy)),
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dy > 90 || gesture.vy > 0.75) {
        closeScheduleRef.current();
      } else Animated.spring(sheetTranslateY, { damping: 22, stiffness: 240, toValue: 0, useNativeDriver: true }).start();
    },
    onPanResponderTerminate: () => Animated.spring(sheetTranslateY, { damping: 22, stiffness: 240, toValue: 0, useNativeDriver: true }).start(),
  }), [sheetTranslateY]);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [categoryNameInput, setCategoryNameInput] = useState('');
  const [categoryColorInput, setCategoryColorInput] = useState(colors[0]);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [timeValue, setTimeValue] = useState(new Date(2000, 0, 1, 9, 0));
  const [androidTimePickerVisible, setAndroidTimePickerVisible] = useState(false);
  const scheduleSubmitted = useRef(false);
  const [loaded, setLoaded] = useState(false);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    const loadPlanner = async () => {
      setLoadError(false);
      try {
        await preserveLegacyData();
        const values = new Map(await AsyncStorage.multiGet([storageKey, categoryStorageKey, themeStorageKey]));
        const savedSchedules = readSchedules(values.get(storageKey) ?? null);
        const savedCategories = readCategories(values.get(categoryStorageKey) ?? null, defaultCategories);
        const savedTheme = values.get(themeStorageKey);
        if (!alive) return;
        setSchedules(bindLegacyCategories(savedSchedules, savedCategories)); setCategories(savedCategories);
        if (savedTheme === 'calm' || savedTheme === 'dreamy' || savedTheme === 'warm') setThemeKey(savedTheme);
        setCategoriesLoaded(true); setThemeLoaded(true); setLoaded(true);
      } catch { if (alive) setLoadError(true); }
    };
    void loadPlanner();
    return () => { alive = false; };
  }, [loadAttempt]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') setNow(new Date()); });
    return () => { clearInterval(timer); subscription.remove(); };
  }, []);

  useEffect(() => {
    if (!fontsLoaded && !fontError) return;
    void SplashScreen.hideAsync().catch(() => {});
    const timer = setTimeout(() => setIntroReady(true), minimumLoadingScreenMs);
    return () => clearTimeout(timer);
  }, [fontError, fontsLoaded]);

  useEffect(() => {
    if (loaded) void storePlannerValue(storageKey, JSON.stringify(schedules)).catch(() => Alert.alert('일정을 저장하지 못했어요', '앱을 닫기 전에 저장 공간을 확인해 주세요.'));
  }, [loaded, schedules]);
  useEffect(() => {
    if (categoriesLoaded) void storePlannerValue(categoryStorageKey, JSON.stringify(categories)).catch(() => Alert.alert('카테고리를 저장하지 못했어요'));
  }, [categories, categoriesLoaded]);
  useEffect(() => {
    if (themeLoaded) void storePlannerValue(themeStorageKey, themeKey).catch(() => Alert.alert('달빛 색상을 저장하지 못했어요'));
  }, [themeKey, themeLoaded]);
  const displayedMonth = Number.isNaN(shownMonth.getTime()) ? new Date(today.getFullYear(), today.getMonth(), 1) : shownMonth;
  const visibleMonths = useMemo(() => [-1, 0, 1].map((offset) => new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() + offset, 1)), [displayedMonth.getFullYear(), displayedMonth.getMonth()]);
  const calendarHeight = calendarWeekCount(displayedMonth) * calendarDayHeight + 6;
  useEffect(() => {
    Animated.timing(calendarHeightAnimated, { duration: reduceMotion ? 0 : 220, easing: Easing.out(Easing.cubic), toValue: calendarHeight, useNativeDriver: false }).start();
  }, [calendarHeight, calendarHeightAnimated, reduceMotion]);
  useEffect(() => {
    if (Number.isNaN(shownMonth.getTime())) setShownMonth(new Date(today.getFullYear(), today.getMonth(), 1));
  }, [shownMonth]);
  useLayoutEffect(() => {
    monthGesture.current = { phase: 'idle', targetPage: null };
    monthScrollRef.current?.scrollTo({ animated: false, x: calendarPageWidth, y: 0 });
    monthScrollLocked.current = false;
  }, [calendarPageWidth, shownMonth, activeTab]);
  const scheduleSetupDates = useMemo(() => expandScheduleDates(scheduleMode, scheduleDateKeys), [scheduleDateKeys, scheduleMode]);
  const scheduleSetupValid = scheduleSetupDates.length > 0;
  const scheduleModeChoiceWidth = scheduleModeRowWidth > 0 ? (scheduleModeRowWidth - 16) / 3 : 0;
  const categoryIndicatorStride = categoryPickerWidth > 0 ? (categoryPickerWidth - 62) / 4 : 0;
  const schedulePickerHeight = 112 + calendarWeekCount(schedulePickerMonth) * 39;
  useEffect(() => {
    const index = categories.slice(0, 4).findIndex(category => category.id === selectedCategoryId);
    if (index < 0 || categoryPickerWidth <= 0) {
      Animated.timing(categoryIndicatorOpacity, { duration: reduceMotion ? 0 : 130, toValue: 0, useNativeDriver: true }).start();
      return;
    }
    if (reduceMotion) {
      categoryIndicatorX.setValue(index * categoryIndicatorStride);
      categoryIndicatorOpacity.setValue(1);
      return;
    }
    const animation = Animated.parallel([
      Animated.spring(categoryIndicatorX, { damping: 22, stiffness: 260, toValue: index * categoryIndicatorStride, useNativeDriver: true }),
      Animated.timing(categoryIndicatorOpacity, { duration: reduceMotion ? 0 : 140, toValue: 1, useNativeDriver: true }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [categories, categoryIndicatorOpacity, categoryIndicatorStride, categoryIndicatorX, categoryPickerWidth, reduceMotion, selectedCategoryId]);
  const selectedCategory = categories.find((category) => category.id === selectedCategoryId) ?? preservedCategory;
  const selectedSchedules = schedules.filter((schedule) => schedule.date === dateKey(selectedDate)).sort((a, b) => a.time.localeCompare(b.time));
  const selectedDateStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const selectedDateIsPast = selectedDateStart.getTime() < todayStart.getTime();
  const upcomingReference = selectedDateStart.getTime() <= todayStart.getTime() ? now : selectedDateStart;
  const upcomingReferenceDate = selectedDateIsPast ? today : selectedDate;
  const nearestSchedule = schedules.filter((schedule) => !schedule.completed && scheduleDateTime(schedule).getTime() >= upcomingReference.getTime()).sort((a, b) => scheduleDateTime(a).getTime() - scheduleDateTime(b).getTime())[0];
  const closeBrandMenu = (onClosed?: () => void) => {
    if (!brandMenuVisible) { onClosed?.(); return; }
    Animated.timing(brandMenuProgress, { duration: reduceMotion ? 0 : 150, easing: Easing.in(Easing.cubic), toValue: 0, useNativeDriver: true }).start(({ finished }) => { if (finished) { setBrandMenuVisible(false); onClosed?.(); } });
  };
  const toggleBrandMenu = () => {
    if (brandMenuVisible) { closeBrandMenu(); return; }
    setBrandMenuVisible(true);
    brandMenuProgress.setValue(0);
    if (reduceMotion) brandMenuProgress.setValue(1);
    else Animated.spring(brandMenuProgress, { damping: 18, stiffness: 230, toValue: 1, useNativeDriver: true }).start();
  };
  const showSettings = () => { settingsPageX.stopAnimation(); settingsPageX.setValue(0); settingsTransitioning.current = false; setSettingsSection('main'); setSettingsVisible(true); };
  const openSettings = () => closeBrandMenu(showSettings);
  const transitionSettingsSection = (next: SettingsSection, direction: 1 | -1) => {
    if (settingsTransitioning.current || settingsSection === next) return;
    if (reduceMotion) { setSettingsSection(next); settingsPageX.setValue(0); return; }
    settingsTransitioning.current = true;
    Animated.timing(settingsPageX, { duration: 135, easing: Easing.in(Easing.cubic), toValue: -direction * 28, useNativeDriver: true }).start(({ finished }) => {
      if (!finished) { settingsTransitioning.current = false; return; }
      setSettingsSection(next);
      settingsPageX.setValue(direction * 28);
      Animated.spring(settingsPageX, { damping: 22, stiffness: 260, toValue: 0, useNativeDriver: true }).start(() => { settingsTransitioning.current = false; });
    });
  };
  const closeSettings = () => {
    if (settingsSection !== 'main') { transitionSettingsSection('main', -1); return; }
    setSettingsVisible(false);
  };
  const transitionScheduleStep = (next: ScheduleStep, direction: 1 | -1) => {
    if (scheduleStepTransitioning.current || scheduleStep === next) return;
    if (reduceMotion) { setScheduleStep(next); scheduleStepX.setValue(0); return; }
    scheduleStepTransitioning.current = true;
    Animated.timing(scheduleStepX, { duration: 135, easing: Easing.in(Easing.cubic), toValue: -direction * 26, useNativeDriver: true }).start(({ finished }) => {
      if (!finished) { scheduleStepTransitioning.current = false; return; }
      setScheduleStep(next);
      scheduleStepX.setValue(direction * 26);
      Animated.spring(scheduleStepX, { damping: 22, stiffness: 270, toValue: 0, useNativeDriver: true }).start(() => { scheduleStepTransitioning.current = false; });
    });
  };
  const changeScheduleMode = (next: ScheduleMode) => {
    if (next === scheduleMode) return;
    const index = scheduleModeChoices.findIndex(choice => choice.key === next);
    setScheduleMode(next);
    setScheduleDateKeys(current => [current[0] ?? dateKey(selectedDate)]);
    if (reduceMotion) scheduleModePosition.setValue(index);
    else Animated.spring(scheduleModePosition, { damping: 22, stiffness: 280, toValue: index, useNativeDriver: true }).start();
    Animated.timing(scheduleCalendarReveal, { duration: reduceMotion ? 0 : 220, easing: Easing.out(Easing.cubic), toValue: next === 'single' ? 0 : 1, useNativeDriver: false }).start();
    void Haptics.selectionAsync().catch(() => {});
  };
  const closeAddModal = () => { cancelCategoryDrag(); scheduleStepX.stopAnimation(); scheduleCalendarReveal.stopAnimation(); setAndroidTimePickerVisible(false); setModalVisible(false); setEditingScheduleId(null); scheduleStepTransitioning.current = false; };
  closeScheduleRef.current = closeAddModal;
  const openAddModal = (date: Date) => { scheduleSubmitted.current = false; setAndroidTimePickerVisible(false); sheetTranslateY.setValue(0); scheduleStepX.setValue(0); scheduleCalendarReveal.setValue(0); scheduleModePosition.setValue(0); scheduleStepTransitioning.current = false; setEditingScheduleId(null); setScheduleStep('setup'); setScheduleMode('single'); setScheduleDateKeys([dateKey(date)]); setSchedulePickerMonth(new Date(date.getFullYear(), date.getMonth(), 1)); setSelectedDate(date); setTitleInput(''); setKeywordInput(''); setSelectedCategoryId(''); setPreservedCategory(null); setShowAdditionalCategories(false); setCategoryEditorOpen(false); setCreatingCategory(false); setEditingCategoryId(null); setTimeValue(new Date(2000, 0, 1, 9, 0)); setModalVisible(true); };
  const openEditModal = (schedule: Schedule) => {
    scheduleSubmitted.current = false;
    setAndroidTimePickerVisible(false);
    const scheduleDate = parseDateKey(schedule.date);
    const [hour, minute] = schedule.time.split(':').map(Number);
    const matchingCategory = categories.find(category => category.id === schedule.categoryId);
    setPreservedCategory(!matchingCategory && schedule.category !== '미지정' ? { name: schedule.category, color: schedule.color } : null);
    setEditingScheduleId(schedule.id);
    scheduleStepX.setValue(0);
    scheduleCalendarReveal.setValue(0);
    scheduleModePosition.setValue(0);
    scheduleStepTransitioning.current = false;
    setScheduleStep('details');
    setScheduleMode('single');
    setScheduleDateKeys([dateKey(scheduleDate)]);
    setSchedulePickerMonth(new Date(scheduleDate.getFullYear(), scheduleDate.getMonth(), 1));
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
    const completed = finishMonthGesture(monthGesture.current, offsetX, calendarPageWidth);
    if (!completed) return;
    monthGesture.current = completed.state;
    const amount = completed.delta;
    if (amount === 0) return;
    monthScrollLocked.current = true;
    setShownMonth((current) => {
      const validCurrent = Number.isNaN(current.getTime()) ? new Date(today.getFullYear(), today.getMonth(), 1) : current;
      return new Date(validCurrent.getFullYear(), validCurrent.getMonth() + amount, 1);
    });
  };
  const continueScheduleSetup = () => {
    if (!scheduleSetupValid) return;
    transitionScheduleStep('details', 1);
  };
  const addSchedule = () => {
    if (scheduleSubmitted.current) return;
    const title = titleInput.trim();
    if (!title) { Alert.alert('일정 제목을 입력해 주세요.'); return; }
    const dates = editingScheduleId ? scheduleDateKeys.slice(0, 1) : scheduleSetupDates;
    if (!dates.length) { Alert.alert(scheduleMode === 'range' ? '기간의 시작일과 마지막 날을 골라 주세요.' : '일정을 담을 날짜를 골라 주세요.'); return; }
    scheduleSubmitted.current = true;
    const sharedSchedule = { time: formatTime(timeValue), title, keyword: keywordInput.trim(), categoryId: selectedCategoryId, category: selectedCategory?.name ?? '미지정', color: selectedCategory?.color ?? '#8FA6BB' };
    if (editingScheduleId) setSchedules((current) => current.map((schedule) => schedule.id === editingScheduleId ? { ...schedule, date: dates[0], ...sharedSchedule } : schedule));
    else {
      const batch = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const createdAt = Date.now();
      setSchedules((current) => [...current, ...dates.map((date, index) => ({ id: `schedule-${batch}-${index}`, date, mode: scheduleMode, groupId: batch, completed: false, createdAt, ...sharedSchedule }))]);
    }
    const focusDate = parseDateKey(dates[0]);
    setSelectedDate(focusDate);
    setShownMonth(new Date(focusDate.getFullYear(), focusDate.getMonth(), 1));
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
    const newId = `category-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const previous = categories.find((category) => category.id === editingCategoryId);
    if (editingCategoryId) {
      setCategories((current) => current.map((category) => category.id === editingCategoryId ? { ...category, name, color: categoryColorInput } : category));
      if (previous) setSchedules(current => current.map(schedule => schedule.categoryId === previous.id ? { ...schedule, category: name, color: categoryColorInput } : schedule));
    } else if (creatingCategory) setCategories((current) => [...current, { id: newId, name, color: categoryColorInput }]);
    setSelectedCategoryId(editingCategoryId ?? newId);
    setPreservedCategory(null);
    setCreatingCategory(false);
    setEditingCategoryId(null);
  };
  const selectCategory = (category: Category) => {
    if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setPreservedCategory(null);
    setSelectedCategoryId((current) => current === category.id ? '' : category.id);
    setShowAdditionalCategories(false);
    void Haptics.selectionAsync().catch(() => {});
  };
  const deleteCategory = (category: Category) => {
    if (categories.length <= 4) return;
    Alert.alert('카테고리를 삭제할까요?', `“${category.name}”은 선택 목록에서 지워져요. 이미 담은 일정의 이름과 빛깔은 그대로 남아요.`, [{ text: '취소', style: 'cancel' }, { text: '삭제', style: 'destructive', onPress: () => { setCategories(current => current.length > 4 ? current.filter(item => item.id !== category.id) : current); if (selectedCategoryId === category.id) { setSelectedCategoryId(''); setPreservedCategory(editingScheduleId ? { name: category.name, color: category.color } : null); } } }]);
  };
  const registerCategoryMeasure = (id: string, measure: (() => void) | null) => {
    if (measure) categoryMeasures.current[id] = measure;
    else { delete categoryMeasures.current[id]; delete categoryLayouts.current[id]; }
  };
  const measureCategory = (id: string, layout: CategoryLayout) => { categoryLayouts.current[id] = layout; };
  const cancelCategoryDrag = () => {
    dragPosition.stopAnimation(); targetSwapPosition.stopAnimation();
    categorySwapAnimating.current = false;
    setDraggedCategory(null); setDragOverCategoryId(null); setCategorySwapTarget(null);
  };
  const startCategoryDrag = (category: Category, x: number, y: number) => {
    if (categorySwapAnimating.current) return;
    Object.values(categoryMeasures.current).forEach(measure => measure());
    setDragOverCategoryId(null);
    setDraggedCategory(category);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    dragPosition.setValue({ x: categoryEditorOpen ? 0 : x - modalOrigin.current.x - 31, y: y - modalOrigin.current.y - (categoryEditorOpen ? 27 : 31) });
  };
  const moveCategoryDrag = (x: number, y: number) => {
    if (categorySwapAnimating.current) return;
    dragPosition.setValue({ x: categoryEditorOpen ? 0 : x - modalOrigin.current.x - 31, y: y - modalOrigin.current.y - (categoryEditorOpen ? 27 : 31) });
    const target = Object.entries(categoryLayouts.current).find(([, layout]) => x >= layout.x && x <= layout.x + layout.width && y >= layout.y && y <= layout.y + layout.height)?.[0] ?? null;
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
        const sourceLayout = categoryLayouts.current[sourceId];
        const targetLayout = categoryLayouts.current[targetId];
        const targetCategory = categories.find((category) => category.id === targetId);
        if (sourceLayout && targetLayout && targetCategory) {
          categorySwapAnimating.current = true;
          targetSwapPosition.setValue({ x: 0, y: targetLayout.y - modalOrigin.current.y });
          setCategorySwapTarget(targetCategory);
          requestAnimationFrame(() => Animated.parallel([
            Animated.timing(dragPosition, { duration: reduceMotion ? 0 : 230, easing: Easing.inOut(Easing.cubic), toValue: { x: 0, y: targetLayout.y - modalOrigin.current.y }, useNativeDriver: true }),
            Animated.timing(targetSwapPosition, { duration: reduceMotion ? 0 : 230, easing: Easing.inOut(Easing.cubic), toValue: { x: 0, y: sourceLayout.y - modalOrigin.current.y }, useNativeDriver: true }),
          ]).start(({ finished }) => {
            if (finished) swapCategories();
            setCategorySwapTarget(null);
            setDraggedCategory(null);
            setDragOverCategoryId(null);
            categorySwapAnimating.current = false;
            if (finished) void Haptics.selectionAsync().catch(() => {});
          }));
          return;
        }
      }
      if (!reduceMotion) LayoutAnimation.configureNext({ duration: 260, update: { type: LayoutAnimation.Types.easeInEaseOut } });
      swapCategories();
      void Haptics.selectionAsync().catch(() => {});
    }
    setDraggedCategory(null);
    setDragOverCategoryId(null);
  };
  const deleteSchedule = (schedule: Schedule) => Alert.alert('일정을 삭제할까요?', `“${schedule.title}” 일정은 삭제 후 되돌릴 수 없습니다.`, [{ text: '취소', style: 'cancel' }, { text: '삭제', style: 'destructive', onPress: () => setSchedules((current) => current.filter((item) => item.id !== schedule.id)) }]);
  const toggleScheduleCompleted = (schedule: Schedule) => {
    setSchedules((current) => current.map((item) => item.id === schedule.id ? { ...item, completed: !item.completed } : item));
    void Haptics.selectionAsync().catch(() => {});
  };
  const completeSchedules = (scheduleIds: string[]) => {
    const ids = new Set(scheduleIds);
    setSchedules((current) => current.map((item) => ids.has(item.id) ? { ...item, completed: true } : item));
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  const settleTab = () => Animated.spring(tabTranslate, { toValue: 0, damping: 26, stiffness: 260, useNativeDriver: true }).start();
  const changeTab = (target: Tab) => {
    if (tabTransitioning.current || target === activeTab) return;
    void Haptics.selectionAsync().catch(() => {});
    if (reduceMotion) { tabTranslate.setValue(0); setActiveTab(target); return; }
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
    onStartShouldSetPanResponder: () => false,
    // Let nested horizontal controls (the month pager and schedule cards) claim
    // the gesture first. The page-level tab swipe only handles unclaimed space.
    onMoveShouldSetPanResponder: (_, gesture) => !calendarTouch.current && !scheduleCardTouch.current && !tabTransitioning.current && !modalVisible && !settingsVisible && !shopVisible && !brandMenuVisible && !laterSwipeBlocked && gesture.numberActiveTouches === 1 && Math.abs(gesture.dx) > 18 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.8,
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
    const next = [...schedules, { id, title: item.title, date: dateKey(date), time: formatTime(date), categoryId: category?.id ?? '', category: category?.name ?? '미지정', color: category?.color ?? '#8FA6BB', completed: false, createdAt: Date.now() }];
    await storePlannerValue(storageKey, JSON.stringify(next));
    setSchedules(next);
  };
  const openLaterSchedule = (item: LaterItem) => {
    const schedule = schedules.find(value => value.id === `later-${item.id}`);
    if (!schedule) { Alert.alert('일정을 찾을 수 없어요', '달력에서 삭제된 일정일 수 있어요. To later의 메모와 링크는 그대로 남아 있어요.'); return; }
    const target = parseDateKey(schedule.date);
    setSelectedDate(target);
    setShownMonth(new Date(target.getFullYear(), target.getMonth(), 1));
    changeTab('To do');
  };

  if (!fontsLoaded && !fontError) return null;
  if (!loaded || !introReady) return <SafeAreaView style={[styles.safeArea, { backgroundColor: activeTheme.background }]}>
    <StatusBar style="dark" />
    {loadError ? <View style={styles.emptyTab}>
      <Image source={require('./assets/dalvi-moon-clock-cropped.png')} style={{ height: 38, width: 38, tintColor: activeTheme.primary, marginBottom: 20 }} />
      <Text style={[styles.emptyTabTitle, { color: activeTheme.primary }]}>잠시 불러오지 못했어요</Text>
      <Text style={styles.emptyTabText}>저장된 내용은 덮어쓰지 않고 그대로 두었어요.\n잠시 후 다시 시도해 주세요.</Text>
      <Pressable onPress={() => setLoadAttempt(value => value + 1)} style={[styles.todayButton, { backgroundColor: activeTheme.soft, marginTop: 20, paddingVertical: 12 }]}><Text style={{ color: activeTheme.primary }}>다시 불러오기</Text></Pressable>
    </View> : <View style={styles.loadingScreen}>
      <Image accessibilityLabel="Dalvi" resizeMode="contain" source={require('./assets/dalvi-loading-logo.png')} style={styles.loadingLogo} />
      <ActivityIndicator accessibilityLabel="Dalvi 불러오는 중" color="#A2ABB5" size="small" style={styles.loadingSpinner} />
      <Text style={styles.loadingQuote}>{loadingQuote}</Text>
    </View>}
  </SafeAreaView>;

  return <SafeAreaView style={[styles.safeArea, { backgroundColor: activeTheme.background }]}>
    <StatusBar style="dark" />
    <View style={styles.container}>
      <View style={{ flex: 1, overflow: 'hidden' }}>
      <Animated.View style={{ flex: 1, transform: [{ translateX: tabTranslate }] }} {...tabSwipe.panHandlers}>
      {brandMenuVisible && <Pressable accessibilityLabel="브랜드 메뉴 닫기" onPress={() => closeBrandMenu()} style={styles.brandMenuBackdrop} />}
      {loadError && <Text accessibilityRole="alert" style={styles.dataWarning}>일정을 불러오지 못했어요. 기존 내용은 그대로 보관 중이에요.</Text>}
      {activeTab === '홈' && <>
        <View style={[styles.header, { paddingBottom: 14 }]}>
          <Pressable accessibilityLabel="Dalvi 메뉴" accessibilityRole="button" accessibilityState={{ expanded: brandMenuVisible }} onPress={toggleBrandMenu} onPressIn={() => { if (!reduceMotion) Animated.spring(brandPressScale, { damping: 18, stiffness: 300, toValue: 0.95, useNativeDriver: true }).start(); }} onPressOut={() => Animated.spring(brandPressScale, { damping: 16, stiffness: 260, toValue: 1, useNativeDriver: true }).start()} style={styles.brandButton}>
            <Animated.View style={[styles.brand, { transform: [{ scale: brandPressScale }] }]}>
              <Image accessibilityLabel="Dalvi 로고" source={require('./assets/dalvi-moon-clock-cropped.png')} style={[styles.brandLogo, { tintColor: activeTheme.primary }]} />
              <Text style={[styles.brandName, { color: activeTheme.primary, fontFamily: fontsLoaded ? 'Nunito_800ExtraBold' : undefined }]}>Dalvi</Text>
              <Animated.View style={{ marginLeft: 8, transform: [{ rotate: brandMenuProgress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }] }}><ChevronDown color="#718396" size={16} /></Animated.View>
            </Animated.View>
          </Pressable>
          <Text style={styles.homeDate}>{dateLabel(today)} {weekDays[today.getDay()]}요일</Text>
          {brandMenuVisible && <Animated.View style={[styles.brandMenu, { borderColor: activeTheme.soft, opacity: brandMenuProgress, shadowColor: activeTheme.primary, transform: [{ translateY: brandMenuProgress.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) }, { scale: brandMenuProgress.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }] }]}>
            <Pressable accessibilityLabel="설정 열기" onPress={openSettings} style={({ pressed }) => [styles.brandMenuItem, pressed && { backgroundColor: activeTheme.soft }]}><SettingsIcon color={activeTheme.primary} /><Text style={[styles.brandMenuText, { color: activeTheme.primary, marginLeft: 12 }]}>설정</Text></Pressable>
            {shopEnabled && <Pressable accessibilityLabel="상점 열기" onPress={() => closeBrandMenu(() => setShopVisible(true))} style={({ pressed }) => [styles.brandMenuItem, pressed && { backgroundColor: activeTheme.soft }]}><StoreIcon color={activeTheme.primary} size={20} /><Text style={[styles.brandMenuText, { color: activeTheme.primary, marginLeft: 12 }]}>상점</Text></Pressable>}
          </Animated.View>}
        </View>
        <HomeScreen theme={activeTheme} now={now} schedules={schedules} onAddSchedule={() => openAddModal(new Date())} onEditSchedule={openEditModal} onDeleteSchedule={deleteSchedule} onToggleSchedule={toggleScheduleCompleted} onCompleteSchedules={completeSchedules} onOpenTodo={() => { const date = new Date(); setSelectedDate(date); setShownMonth(new Date(date.getFullYear(), date.getMonth(), 1)); changeTab('To do'); }} onSwipeBlockedChange={setLaterSwipeBlocked} onTimetableTouch={(active) => { calendarTouch.current = active; }} />
      </>}
      {activeTab === 'To do' && <>
        <View style={styles.screenHeader}><View><Text style={[styles.screenEyebrow, { color: activeTheme.primary }]}>DALVI · 오늘을 위한 공간</Text><Text style={[styles.screenTitle, { color: activeTheme.primary }]}>To do</Text></View><Pressable accessibilityLabel="설정 열기" hitSlop={4} onPress={showSettings} style={({ pressed }) => [styles.headerIconButton, pressed && styles.sectionAddButtonPressed]}><SettingsIcon color={activeTheme.primary} /></Pressable></View>
        <ScrollView contentContainerStyle={{ paddingBottom: 16 }} showsVerticalScrollIndicator={false} directionalLockEnabled>
          <View style={styles.todoMonthRow}><Text style={[styles.month, { color: activeTheme.primary }]}>{displayedMonth.getFullYear()}년 {displayedMonth.getMonth() + 1}월</Text><Pressable accessibilityLabel="오늘 날짜로 이동" hitSlop={8} onPress={() => { const date = new Date(); setSelectedDate(date); setShownMonth(new Date(date.getFullYear(), date.getMonth(), 1)); }} style={[styles.todayButton, { backgroundColor: activeTheme.soft }]}><Text style={{ color: activeTheme.primary, fontSize: 12, fontWeight: '700' }}>오늘</Text></Pressable></View>
          <View onTouchCancel={() => { calendarTouch.current = false; }} onTouchEnd={() => { calendarTouch.current = false; }} onTouchStart={() => { calendarTouch.current = true; }}>
            <View style={styles.weekRow}>{weekDays.map((day, index) => <Text key={day} style={[styles.weekHeader, index === 0 && styles.sunday, index === 6 && styles.saturday]}>{day}</Text>)}</View>
            <Animated.View style={[styles.calendarViewport, { height: calendarHeightAnimated }]}>
              <ScrollView bounces={false} contentContainerStyle={styles.calendarPager} contentOffset={{ x: calendarPageWidth, y: 0 }} decelerationRate="fast" directionalLockEnabled horizontal pagingEnabled ref={monthScrollRef} showsHorizontalScrollIndicator={false}
                onScrollBeginDrag={() => { monthGesture.current = { phase: 'dragging', targetPage: null }; }}
                onScrollEndDrag={({ nativeEvent: event }) => {
                  const target = event.targetContentOffset?.x;
                  monthGesture.current = { phase: 'released', targetPage: target === undefined ? null : settledMonthPage(target, calendarPageWidth) };
                  if (Platform.OS === 'ios' && isStationaryPageRelease(event.contentOffset.x, target, event.velocity?.x, calendarPageWidth)) finishMonthScroll(event.contentOffset.x);
                }}
                onMomentumScrollEnd={event => finishMonthScroll(event.nativeEvent.contentOffset.x)}>
                {visibleMonths.map(month => <CalendarMonth key={`${month.getFullYear()}-${month.getMonth()}`} month={month} onSelectDate={setSelectedDate} pageWidth={calendarPageWidth} schedules={schedules} selectedDate={selectedDate} theme={activeTheme} today={today} />)}
              </ScrollView>
            </Animated.View>
          </View>
          <View style={[styles.content, styles.compactScheduleContent]}>
            <View style={styles.sectionHeader}><Text style={[styles.sectionTitle, { color: activeTheme.primary }]}>{dateLabel(selectedDate)} 일정</Text><Pressable accessibilityLabel={`${dateLabel(selectedDate)}에 일정 추가`} hitSlop={8} onPress={() => openAddModal(selectedDate)} style={({ pressed }) => [styles.sectionAddButton, { backgroundColor: activeTheme.soft }, pressed && styles.sectionAddButtonPressed]}><Text style={[styles.sectionAddButtonText, { color: activeTheme.primary }]}>＋</Text></Pressable></View>
            {selectedSchedules.length ? selectedSchedules.map((schedule) => <ScheduleCard key={schedule.id} theme={activeTheme} onDelete={() => deleteSchedule(schedule)} onEdit={() => openEditModal(schedule)} onSwipeTouchChange={(active) => { scheduleCardTouch.current = active; }} onToggle={() => toggleScheduleCompleted(schedule)} {...schedule} />) : <View style={styles.noSchedule}><Text style={styles.noScheduleText}>아직 비어 있는 하루예요</Text><Pressable onPress={() => openAddModal(selectedDate)} style={{ padding: 8 }}><Text style={[styles.noScheduleAction, { color: activeTheme.primary }]}>이 날짜에 일정 담기</Text></Pressable></View>}
            {nearestSchedule && <UpcomingCard theme={activeTheme} referenceDate={upcomingReferenceDate} schedule={nearestSchedule} />}
            {/* The banner slot stays available without occupying space before ads launch. */}
            {adsEnabled && <View accessibilityLabel="광고 배너 영역" style={[styles.adBannerSlot, { backgroundColor: activeTheme.soft }]} />}
          </View>
        </ScrollView>
      </>}
      {activeTab === 'To later' && <ToLaterScreen theme={activeTheme} categories={categories} onSettings={showSettings} onSchedule={scheduleLaterItem} onOpenSchedule={openLaterSchedule} onSwipeBlockedChange={setLaterSwipeBlocked} />}
      {activeTab === 'To dream' && <View style={{ flex: 1, marginHorizontal: -20 }}><ToDreamScreen theme={activeTheme} now={now} hasTodaySchedule={schedules.some(schedule => schedule.date === dateKey(today)) || !loaded} onSettings={showSettings} onAddSchedule={title => { openAddModal(new Date()); setTitleInput(title); }} onSwipeBlockedChange={setLaterSwipeBlocked} /></View>}
      </Animated.View></View>
      <View accessibilityRole="tablist" style={[styles.tabBar, { borderTopColor: activeTheme.soft }]}>{tabs.map((tab) => <BottomTabButton active={activeTab === tab} disabled={laterSwipeBlocked || modalVisible || settingsVisible || shopVisible} key={tab} onPress={() => { closeBrandMenu(); changeTab(tab); }} reduceMotion={reduceMotion} tab={tab} theme={activeTheme} />)}</View>
    </View>
    <Modal animationType={reduceMotion ? "fade" : "slide"} onShow={() => modalRoot.current?.measureInWindow((x, y) => { modalOrigin.current = { x, y }; })} onDismiss={() => sheetTranslateY.setValue(0)} transparent visible={modalVisible} onRequestClose={closeAddModal}><View ref={modalRoot} collapsable={false} style={{ flex: 1 }}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalBackdrop}><ScrollView scrollEnabled={!draggedCategory} bounces={false} contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled"><Pressable accessibilityLabel="일정 추가 닫기" onPress={closeAddModal} style={styles.modalDismissArea} /><Animated.View style={[styles.modalCard, { transform: [{ translateY: sheetTranslateY }] }]}><View style={styles.sheetHandleTouchArea} {...sheetDragResponder.panHandlers}><View style={[styles.modalHandle, styles.interactiveModalHandle]} /></View>
      {categoryEditorOpen ? <View>
        <View style={styles.editorHeader}><Pressable onPress={() => { setCategoryEditorOpen(false); setCreatingCategory(false); setEditingCategoryId(null); }}><Text style={styles.backText}>‹</Text></Pressable><Text style={styles.modalTitle}>카테고리 편집</Text><View style={styles.headerSpacer} /></View>
        {(creatingCategory || editingCategoryId) ? <View><TextInput onChangeText={setCategoryNameInput} placeholder="카테고리 이름" placeholderTextColor="#A19BA8" style={styles.input} value={categoryNameInput} /><Text style={styles.timeLabel}>색상</Text><View style={styles.palette}>{colors.map((color) => <Pressable key={color} onPress={() => setCategoryColorInput(color)} style={[styles.paletteChoice, categoryColorInput === color && styles.paletteChoiceSelected]}><View style={[styles.paletteSwatch, { backgroundColor: color }]} /></Pressable>)}</View><View style={styles.modalButtons}><Pressable onPress={() => { setCreatingCategory(false); setEditingCategoryId(null); }} style={styles.cancelButton}><Text style={styles.cancelText}>취소</Text></Pressable><Pressable onPress={saveCategory} style={styles.saveButton}><Text style={styles.saveText}>저장</Text></Pressable></View></View> : <View><Text style={styles.editListHint}>카테고리를 길게 누른 뒤 위아래로 옮겨 순서를 변경하세요.</Text><CategoryEditorList categories={categories} draggedCategoryId={draggedCategory?.id ?? null} dragOverCategoryId={dragOverCategoryId} onDelete={deleteCategory} onDragEnd={finishCategoryDrag} onDragMove={moveCategoryDrag} onDragStart={startCategoryDrag} onEdit={beginCategoryEdit} onMeasure={measureCategory} onDragCancel={cancelCategoryDrag} onRegisterMeasure={registerCategoryMeasure} swappingCategoryId={categorySwapTarget?.id ?? null} /><Pressable disabled={categories.length >= 8} onPress={beginCategoryCreate} style={[styles.newCategoryButton, categories.length >= 8 && styles.newCategoryDisabled]}><Text style={styles.newCategoryText}>＋ 카테고리 추가 ({categories.length}/8)</Text></Pressable></View>}
      </View> : <Animated.View style={{ opacity: scheduleStepX.interpolate({ inputRange: [-26, 0, 26], outputRange: [0, 1, 0], extrapolate: 'clamp' }), transform: [{ translateX: scheduleStepX }] }}>{scheduleStep === 'setup' ? <View>
        <View style={styles.editorHeader}><Text style={styles.modalTitle}>{editingScheduleId ? '분류와 날짜 다듬기' : '어떤 일정인가요?'}</Text><Pressable accessibilityLabel="일정 추가 닫기" onPress={closeAddModal} style={styles.setupCloseButton}><Text style={styles.setupCloseText}>닫기</Text></Pressable></View>
        {!editingScheduleId && <View onLayout={event => setScheduleModeRowWidth(event.nativeEvent.layout.width)} style={styles.scheduleModeRow}>{scheduleModeChoiceWidth > 0 && <Animated.View pointerEvents="none" style={[styles.scheduleModeIndicator, { backgroundColor: activeTheme.soft, transform: [{ translateX: Animated.multiply(scheduleModePosition, scheduleModeChoiceWidth + 4) }], width: scheduleModeChoiceWidth }]} />}{scheduleModeChoices.map(choice => { const selected = scheduleMode === choice.key; return <Pressable key={choice.key} accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={() => changeScheduleMode(choice.key)} style={styles.scheduleModeChoice}><Text style={[styles.scheduleModeName, selected && { color: activeTheme.primary }]}>{choice.name}</Text></Pressable>; })}</View>}
        <View style={styles.labelRow}><View><Text style={styles.timeLabel}>카테고리</Text><Text style={styles.categoryHint}>{selectedCategory ? selectedCategory.name : '고르지 않으면 미지정으로 담아요'}</Text></View><Pressable accessibilityLabel="카테고리 편집" onPress={() => setCategoryEditorOpen(true)} style={styles.categoryEditButton}><Text style={styles.categoryEditText}>편집</Text></Pressable></View>
        {showAdditionalCategories ? <CategorySwapPanel categories={categories} draggedCategoryId={draggedCategory?.id ?? null} dragOverCategoryId={dragOverCategoryId} onDragEnd={finishCategoryDrag} onDragMove={moveCategoryDrag} onDragStart={startCategoryDrag} onMeasure={measureCategory} onDragCancel={cancelCategoryDrag} onRegisterMeasure={registerCategoryMeasure} onSelect={selectCategory} selectedCategoryId={selectedCategoryId} /> : <View onLayout={event => setCategoryPickerWidth(event.nativeEvent.layout.width)} style={styles.colorPicker}>{categoryPickerWidth > 0 && <Animated.View pointerEvents="none" style={[styles.categorySelectionIndicator, { backgroundColor: activeTheme.soft, borderColor: activeTheme.secondary, opacity: categoryIndicatorOpacity, transform: [{ translateX: categoryIndicatorX }] }]} />}{categories.slice(0, 4).map((category) => <Pressable key={category.id} accessibilityLabel={`${category.name} 카테고리${selectedCategoryId === category.id ? ' 선택 해제' : ' 선택'}`} accessibilityRole="radio" accessibilityState={{ checked: selectedCategoryId === category.id }} onPress={() => selectCategory(category)} style={styles.colorChoice}><View style={[styles.colorSwatch, { backgroundColor: category.color }]} /><Text numberOfLines={1} style={styles.colorName}>{category.name}</Text></Pressable>)}<Pressable accessibilityLabel="전체 카테고리와 순서 변경" onPress={() => { if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setShowAdditionalCategories(true); }} style={[styles.colorChoice, styles.moreCategoryChoice]}><Text style={styles.moreCategoryPlus}>＋</Text></Pressable></View>}
        <Animated.View pointerEvents={scheduleMode === 'single' ? 'none' : 'auto'} style={[styles.scheduleCalendarReveal, { height: scheduleCalendarReveal.interpolate({ inputRange: [0, 1], outputRange: [0, schedulePickerHeight] }), opacity: scheduleCalendarReveal, transform: [{ translateY: scheduleCalendarReveal.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }]}><ScheduleDatePicker mode={scheduleMode} month={schedulePickerMonth} selectedKeys={scheduleDateKeys} theme={activeTheme} onMonthChange={amount => { if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setSchedulePickerMonth(current => new Date(current.getFullYear(), current.getMonth() + amount, 1)); }} onSelect={date => { const key = dateKey(date); const next = selectScheduleDate(scheduleMode, scheduleDateKeys, key); if (scheduleMode === 'multi' && next === scheduleDateKeys) { Alert.alert('다중 일정은 한 번에 60일까지 고를 수 있어요.'); return; } setScheduleDateKeys(next); }} /></Animated.View>
        <Text style={styles.scheduleSelectionSummary}>{scheduleSelectionLabel(scheduleMode, scheduleDateKeys)}</Text>
        <View style={styles.modalButtons}><Pressable onPress={closeAddModal} style={styles.cancelButton}><Text style={styles.cancelText}>취소</Text></Pressable><Pressable accessibilityRole="button" accessibilityState={{ disabled: !scheduleSetupValid }} disabled={!scheduleSetupValid} onPress={continueScheduleSetup} style={[styles.saveButton, { backgroundColor: activeTheme.primary }, !scheduleSetupValid && styles.saveButtonDisabled]}><Text style={styles.saveText}>완료</Text></Pressable></View>
      </View> : <View>
        <View style={styles.detailsHeader}><Pressable accessibilityLabel="분류와 날짜 다시 선택" onPress={() => transitionScheduleStep('setup', -1)} style={styles.detailsBackButton}><Text style={[styles.detailsBackText, { color: activeTheme.primary }]}>‹</Text></Pressable><View style={styles.detailsHeading}><Text style={styles.modalTitle}>{editingScheduleId ? '일정 다듬기' : '일정 내용 담기'}</Text><Text style={styles.categoryHint}>{scheduleSelectionLabel(scheduleMode, scheduleDateKeys)} · {selectedCategory?.name ?? '미지정'}</Text></View></View>
        <TextInput autoFocus={false} onChangeText={setTitleInput} placeholder="무엇을 할 예정인가요?" placeholderTextColor="#A19BA8" style={styles.input} value={titleInput} />
        <TextInput maxLength={8} onChangeText={(text) => setKeywordInput(limitKeyword(text))} placeholder="캘린더에 보일 키워드를 적어 주세요" placeholderTextColor="#A19BA8" returnKeyType="done" style={styles.keywordInput} value={keywordInput} /><Text style={styles.keywordLimit}>{Array.from(keywordInput).length}/8</Text>
        <Text style={styles.timeLabel}>시간</Text>{Platform.OS === 'ios' ? <DateTimePicker display="spinner" themeVariant="light" textColor={activeTheme.primary} is24Hour locale="ko-KR" mode="time" onChange={(_, date) => date && setTimeValue(date)} style={styles.timePicker} value={timeValue} /> : <Pressable accessibilityLabel="일정 시간 선택" onPress={() => setAndroidTimePickerVisible(true)} style={[styles.input, { marginTop: 10 }]}><Text style={{ color: activeTheme.primary }}>{formatTime(timeValue)}</Text></Pressable>}{Platform.OS !== 'ios' && androidTimePickerVisible && <DateTimePicker mode="time" is24Hour value={timeValue} onChange={(event, date) => { setAndroidTimePickerVisible(false); if (event.type === 'set' && date) setTimeValue(date); }} />}
        <View style={styles.modalButtons}><Pressable onPress={() => transitionScheduleStep('setup', -1)} style={styles.cancelButton}><Text style={styles.cancelText}>이전</Text></Pressable><Pressable onPress={addSchedule} style={[styles.saveButton, { backgroundColor: activeTheme.primary }]}><Text style={styles.saveText}>{editingScheduleId ? '수정 저장' : '일정 저장'}</Text></Pressable></View>
      </View>}</Animated.View>}
    </Animated.View></ScrollView>{draggedCategory && <Animated.View pointerEvents="none" style={[styles.dragOverlay, categoryEditorOpen ? styles.editorDragOverlay : styles.gridDragOverlay, { transform: dragPosition.getTranslateTransform() }]}>{categoryEditorOpen ? <View style={styles.dragOverlayRow}><Text style={styles.dragHandle}>≡</Text><View style={[styles.listColor, { backgroundColor: draggedCategory.color }]} /><Text style={styles.listCategoryName}>{draggedCategory.name}</Text></View> : <View style={[styles.colorChoice, styles.dragOverlayTile]}><View style={[styles.colorSwatch, { backgroundColor: draggedCategory.color }]} /><Text numberOfLines={1} style={styles.colorName}>{draggedCategory.name}</Text></View>}</Animated.View>}{categorySwapTarget && <Animated.View pointerEvents="none" style={[styles.dragOverlay, styles.editorDragOverlay, styles.targetSwapOverlay, { transform: targetSwapPosition.getTranslateTransform() }]}><View style={styles.dragOverlayRow}><Text style={styles.dragHandle}>≡</Text><View style={[styles.listColor, { backgroundColor: categorySwapTarget.color }]} /><Text style={styles.listCategoryName}>{categorySwapTarget.name}</Text></View></Animated.View>}</KeyboardAvoidingView></View></Modal>
    <Modal animationType={reduceMotion ? "fade" : "slide"} onDismiss={() => { setSettingsSection('main'); settingsPageX.setValue(0); settingsTransitioning.current = false; }} onRequestClose={closeSettings} presentationStyle="pageSheet" visible={settingsVisible}>
      <SafeAreaView style={[styles.settingsScreen, { backgroundColor: activeTheme.background }]}>
        <View style={styles.settingsFrame}>
        <View style={styles.settingsHeader}><Pressable accessibilityLabel={settingsSection === 'main' ? '설정 닫기' : '설정으로 돌아가기'} onPress={closeSettings} style={({ pressed }) => [styles.settingsBackButton, pressed && { backgroundColor: activeTheme.soft }]}><Text style={[styles.settingsBack, { color: activeTheme.primary }]}>‹</Text></Pressable><Text style={[styles.settingsTitle, { color: activeTheme.primary }]}>{settingsSection === 'theme' ? '테마 변경' : settingsSection === 'help' ? '도움말' : '설정'}</Text><View style={styles.settingsHeaderSpacer} /></View>
        <ScrollView contentContainerStyle={styles.settingsContent} showsVerticalScrollIndicator={false}><Animated.View style={{ opacity: settingsPageX.interpolate({ inputRange: [-28, 0, 28], outputRange: [0, 1, 0], extrapolate: 'clamp' }), transform: [{ translateX: settingsPageX }] }}>
          {settingsSection === 'main' ? <>
            <Text style={styles.settingsLead}>나에게 편안한 달빛과{ '\n' }Dalvi의 사용 방법을 살펴보세요.</Text>
            <View style={styles.settingsMenu}>
              <Pressable accessibilityRole="button" accessibilityLabel="테마 변경" onPress={() => { void Haptics.selectionAsync().catch(() => {}); transitionSettingsSection('theme', 1); }} style={({ pressed }) => [styles.settingsMenuRow, pressed && { backgroundColor: activeTheme.soft }]}>
                <View style={styles.settingsThemePreview}>{[activeTheme.primary, activeTheme.secondary, activeTheme.soft].map((color, index) => <View key={`${color}-${index}`} style={[styles.settingsThemeDot, { backgroundColor: color }]} />)}</View>
                <View style={styles.settingsMenuTextWrap}><Text style={[styles.settingsMenuTitle, { color: activeTheme.primary }]}>테마 변경</Text><Text style={styles.settingsMenuCaption}>{themeChoices.find(choice => choice.key === themeKey)?.name}</Text></View><Text style={styles.settingsMenuChevron}>›</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="도움말" onPress={() => { void Haptics.selectionAsync().catch(() => {}); transitionSettingsSection('help', 1); }} style={({ pressed }) => [styles.settingsMenuRow, pressed && { backgroundColor: activeTheme.soft }]}>
                <View style={[styles.settingsMenuIcon, { backgroundColor: activeTheme.soft }]}><Text style={[styles.settingsMenuIconText, { color: activeTheme.primary }]}>?</Text></View>
                <View style={styles.settingsMenuTextWrap}><Text style={[styles.settingsMenuTitle, { color: activeTheme.primary }]}>도움말</Text><Text style={styles.settingsMenuCaption}>각 공간의 쓰임과 문의 방법</Text></View><Text style={styles.settingsMenuChevron}>›</Text>
              </Pressable>
            </View>
            <Text style={[styles.settingsSectionTitle, styles.settingsSecondaryTitle, { color: activeTheme.primary }]}>데이터 보관</Text>
            <View style={styles.settingsInfoCard}><Text style={[styles.settingsInfoTitle, { color: activeTheme.primary }]}>나의 시간은 이 기기에 머물러요</Text><Text style={styles.settingsInfoText}>현재 일정과 기록은 계정이나 서버가 아닌 이 기기에만 저장돼요. 앱을 삭제하면 함께 사라질 수 있으니 정식 출시 전에는 중요한 내용을 따로 보관해 주세요.</Text></View>
            <Text style={styles.settingsVersion}>Dalvi 1.0.0</Text>
          </> : settingsSection === 'theme' ? <>
            <Text style={styles.settingsDescription}>지금의 화면에 머물 달빛을 골라 주세요. 선택하면 모든 화면에 바로 스며들어요.</Text>
            <View style={styles.themeList}>{themeChoices.map((choice) => { const palette = appThemes[choice.key]; const selected = themeKey === choice.key; return <Pressable accessibilityLabel={`${choice.name} 테마 선택`} accessibilityRole="radio" accessibilityState={{ checked: selected }} key={choice.key} onPress={() => { if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setThemeKey(choice.key); void Haptics.selectionAsync().catch(() => {}); }} style={({ pressed }) => [styles.themeCard, { borderColor: selected ? activeTheme.primary : '#DCE3EB' }, selected && { backgroundColor: activeTheme.soft }, pressed && styles.themeCardPressed]}><View style={styles.themeSwatches}><View style={[styles.themeSwatch, { backgroundColor: palette.primary }]} /><View style={[styles.themeSwatch, { backgroundColor: palette.secondary }]} /><View style={[styles.themeSwatch, { backgroundColor: palette.soft }]} /></View><View style={styles.themeTextWrap}><Text style={[styles.themeName, { color: activeTheme.primary }]}>{choice.name}</Text><Text style={styles.themeDescription}>{choice.description}</Text></View><View style={[styles.themeRadio, { borderColor: selected ? activeTheme.primary : '#AAB5C1' }]}>{selected && <View style={[styles.themeRadioDot, { backgroundColor: activeTheme.primary }]} />}</View></Pressable>; })}</View>
          </> : <>
            <Text style={styles.settingsDescription}>각 공간은 시간을 정리하는 방식에 따라 조금씩 다른 역할을 해요.</Text>
            <View style={styles.helpList}>
              <View style={styles.helpCard}><Text style={[styles.helpTitle, { color: activeTheme.primary }]}>To do</Text><Text style={styles.helpText}>날짜와 시간이 정해진 일정을 담아요. 하루 일정은 물론, 이어지는 기간이나 여러 날짜에도 같은 일정을 만들 수 있어요.</Text></View>
              <View style={styles.helpCard}><Text style={[styles.helpTitle, { color: activeTheme.primary }]}>To later</Text><Text style={styles.helpText}>언젠가 하고 싶은 일과 다시 보고 싶은 것을 잠시 맡겨 두는 공간이에요. 카테고리와 완료 상태로 가볍게 정리할 수 있어요.</Text></View>
              <View style={styles.helpCard}><Text style={[styles.helpTitle, { color: activeTheme.primary }]}>To dream</Text><Text style={styles.helpText}>나의 목표를 적고, 오늘의 작은 발자국과 앞으로 준비할 일을 차곡차곡 모아요.</Text></View>
            </View>
            <View style={[styles.contactCard, { backgroundColor: activeTheme.soft }]}><Text style={[styles.helpTitle, { color: activeTheme.primary }]}>Dalvi에게 이야기하기</Text><Text style={styles.helpText}>궁금한 점이나 전하고 싶은 이야기가 있다면 편하게 남겨 주세요.</Text><Pressable accessibilityRole="link" accessibilityLabel="문의 이메일 보내기" onPress={() => { void Linking.openURL('mailto:seojin8498@naver.com').catch(() => Alert.alert('메일 앱을 열지 못했어요', 'seojin8498@naver.com으로 문의해 주세요.')); }} style={styles.contactEmailButton}><Text style={[styles.contactEmail, { color: activeTheme.primary }]}>seojin8498@naver.com</Text></Pressable></View>
          </>}</Animated.View>
        </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
    {shopEnabled && <Modal animationType={reduceMotion ? 'fade' : 'slide'} onRequestClose={() => setShopVisible(false)} presentationStyle="pageSheet" visible={shopVisible}>
      <SafeAreaView style={[styles.settingsScreen, { backgroundColor: activeTheme.background }]}>
        <View style={styles.settingsFrame}>
        <View style={styles.settingsHeader}><Pressable accessibilityLabel="상점 닫기" hitSlop={10} onPress={() => setShopVisible(false)}><Text style={[styles.settingsBack, { color: activeTheme.primary }]}>‹</Text></Pressable><Text style={[styles.settingsTitle, { color: activeTheme.primary }]}>달빛 상점</Text><View style={styles.settingsHeaderSpacer} /></View>
        <View style={styles.shopScreen}>
          <View style={[styles.shopEmblem, { backgroundColor: activeTheme.soft }]}><StoreIcon color={activeTheme.primary} size={38} /></View>
          <Text style={[styles.emptyTabTitle, { color: activeTheme.primary }]}>조금 더 나다운 Dalvi</Text>
          <Text style={styles.emptyTabText}>다채로운 카테고리 색상과 광고 없는 시간,{ '\n' }서로의 취향을 나누는 화면을 준비하고 있어요.</Text>
          <Text style={[styles.shopComingSoon, { backgroundColor: activeTheme.soft, color: activeTheme.primary }]}>달빛 상점은 다음에 만나요</Text>
        </View>
        </View>
      </SafeAreaView>
    </Modal>}
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
    const holidayNames = getKoreanHolidayNames(date);
    const isRedDay = date.getDay() === 0 || holidayNames.length > 0;
    const isSaturday = date.getDay() === 6;
    const datedSchedules = schedules.filter((schedule) => schedule.date === dateKey(date));
    const keywordSchedules = calendarKeywordSchedules(datedSchedules);
    const hasUnlabeledSchedule = datedSchedules.some((schedule) => !schedule.keyword?.trim());
    const startsRangeSegment = keywordSchedules.some((schedule) => {
      if (schedule.mode !== 'range' || !schedule.groupId) return false;
      const previous = new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1);
      return date.getDay() === 0 || previous.getMonth() !== date.getMonth() || previous.getFullYear() !== date.getFullYear() || !schedules.some((item) => item.groupId === schedule.groupId && item.date === dateKey(previous) && item.keyword?.trim());
    });
    return <Pressable accessibilityRole="button" accessibilityLabel={`${date.getDate()}일${holidayNames.length ? `, ${holidayNames.join(', ')}` : ''}`} key={dateKey(date)} onPress={() => onSelectDate(date)} style={[styles.dayCell, styles.keywordDayCell, startsRangeSegment && styles.rangeStartDayCell]}><View style={[styles.dayCircle, styles.compactDayCircle, selected && { backgroundColor: theme.primary }, todayCell && !selected && { borderColor: theme.secondary, borderWidth: 1 }]}><Text style={[styles.dayText, styles.compactDayText, { color: isRedDay ? '#C56E76' : isSaturday ? '#6F8FAA' : theme.primary }, selected && styles.selectedDayText]}>{date.getDate()}</Text></View><View style={styles.calendarKeywordSlot}><View style={styles.calendarHolidaySlot}>{holidayNames.length > 0 && <Text numberOfLines={1} style={styles.holidayLabel}>{compactHolidayName(holidayNames)}</Text>}</View>{keywordSchedules.map((schedule) => {
      const range = schedule.mode === 'range' && !!schedule.groupId;
      const previous = new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1);
      const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
      const joinsLeft = range && date.getDay() !== 0 && previous.getMonth() === date.getMonth() && previous.getFullYear() === date.getFullYear() && schedules.some(item => item.groupId === schedule.groupId && item.date === dateKey(previous) && item.keyword?.trim());
      const joinsRight = range && date.getDay() !== 6 && next.getMonth() === date.getMonth() && next.getFullYear() === date.getFullYear() && schedules.some(item => item.groupId === schedule.groupId && item.date === dateKey(next) && item.keyword?.trim());
      let segmentLength = 1;
      if (range && !joinsLeft) {
        let cursor = date;
        while (cursor.getDay() !== 6) {
          const following = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
          const continues = following.getMonth() === date.getMonth() && following.getFullYear() === date.getFullYear() && schedules.some((item) => item.groupId === schedule.groupId && item.date === dateKey(following) && item.keyword?.trim());
          if (!continues) break;
          segmentLength += 1;
          cursor = following;
        }
      }
      const rangeKeyword = (schedule.keyword ?? '').trim();
      return <View key={schedule.id} style={[styles.calendarKeyword, range && styles.calendarRangeKeyword, range && { borderBottomLeftRadius: joinsLeft ? 0 : 4, borderTopLeftRadius: joinsLeft ? 0 : 4, borderBottomRightRadius: joinsRight ? 0 : 4, borderTopRightRadius: joinsRight ? 0 : 4, borderLeftWidth: joinsLeft ? 0 : 1, borderRightWidth: joinsRight ? 0 : 1 }, { backgroundColor: `${schedule.color}24`, borderColor: `${schedule.color}70` }]}>{(!range || !joinsLeft) && <Text numberOfLines={range && segmentLength > 1 ? 1 : 2} style={[styles.calendarKeywordText, range && styles.calendarRangeKeywordText, range && styles.calendarRangeKeywordOverlay, range && { width: `${segmentLength * 100}%` }]}>{range && segmentLength > 1 ? rangeKeyword : formatCalendarKeyword(rangeKeyword)}</Text>}</View>;
    })}{hasUnlabeledSchedule && keywordSchedules.length === 0 && <View style={[styles.unlabeledScheduleDot, { backgroundColor: theme.primary }]} />}</View></Pressable>;
  })}</View>;
}

function ScheduleDatePicker({ month, mode, selectedKeys, theme, onMonthChange, onSelect }: {
  month: Date;
  mode: ScheduleMode;
  selectedKeys: string[];
  theme: AppTheme;
  onMonthChange: (amount: number) => void;
  onSelect: (date: Date) => void;
}) {
  const dates = buildCalendar(month);
  const hint = mode === 'range'
    ? selectedKeys.length === 1 ? '마지막 날을 골라 주세요' : '시작일과 마지막 날 사이를 함께 담아요'
    : mode === 'multi' ? '서로 떨어진 날짜도 여러 번 눌러 고를 수 있어요' : '일정을 담을 하루를 골라 주세요';
  return <View style={styles.scheduleCalendar}>
    <View style={styles.scheduleCalendarHeader}>
      <Pressable accessibilityLabel="이전 달" hitSlop={8} onPress={() => onMonthChange(-1)} style={styles.scheduleCalendarArrow}><Text style={{ color: theme.primary, fontSize: 24 }}>‹</Text></Pressable>
      <Text style={[styles.scheduleCalendarMonth, { color: theme.primary }]}>{month.getFullYear()}년 {month.getMonth() + 1}월</Text>
      <Pressable accessibilityLabel="다음 달" hitSlop={8} onPress={() => onMonthChange(1)} style={styles.scheduleCalendarArrow}><Text style={{ color: theme.primary, fontSize: 24 }}>›</Text></Pressable>
    </View>
    <View style={styles.scheduleCalendarWeek}>{weekDays.map((day, index) => <Text key={day} style={[styles.scheduleCalendarWeekText, index === 0 && styles.sunday, index === 6 && styles.saturday]}>{day}</Text>)}</View>
    <View style={styles.scheduleCalendarGrid}>{dates.map((date, index) => {
      if (!date) return <View key={`empty-${index}`} style={styles.scheduleCalendarEmpty} />;
      const key = dateKey(date);
      const selected = selectedKeys.includes(key);
      const inSelection = isDateInSelection(mode, selectedKeys, key);
      const joinsRangeLeft = mode === 'range' && selectedKeys.length === 2 && date.getDay() !== 0 && date.getDate() !== 1 && isDateInSelection(mode, selectedKeys, dateKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1)));
      const joinsRangeRight = mode === 'range' && selectedKeys.length === 2 && date.getDay() !== 6 && date.getDate() !== new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate() && isDateInSelection(mode, selectedKeys, dateKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)));
      const red = date.getDay() === 0 || getKoreanHolidayNames(date).length > 0;
      const saturday = date.getDay() === 6;
      return <Pressable
        accessibilityRole={mode === 'multi' ? 'checkbox' : 'button'}
        accessibilityState={mode === 'multi' ? { checked: selected } : undefined}
        accessibilityLabel={`${dateLabel(date)}${selected ? ', 선택됨' : ''}`}
        key={key}
        onPress={() => onSelect(date)}
        style={[styles.scheduleCalendarDay, inSelection && { backgroundColor: theme.soft, borderBottomLeftRadius: joinsRangeLeft ? 0 : 12, borderTopLeftRadius: joinsRangeLeft ? 0 : 12, borderBottomRightRadius: joinsRangeRight ? 0 : 12, borderTopRightRadius: joinsRangeRight ? 0 : 12 }]}
      >
        <View style={[styles.scheduleCalendarDayCircle, selected && { backgroundColor: theme.primary }]}>
          <Text style={[styles.scheduleCalendarDayText, { color: red ? '#C56E76' : saturday ? '#6F8FAA' : theme.primary }, selected && styles.selectedDayText]}>{date.getDate()}</Text>
        </View>
      </Pressable>;
    })}</View>
    <Text style={styles.scheduleCalendarHint}>{hint}</Text>
  </View>;
}

function ScheduleCard({ time, title, category, color, mode, completed, onToggle, onEdit, onDelete, onSwipeTouchChange, theme }: Schedule & { onToggle: () => void; onEdit: () => void; onDelete: () => void; onSwipeTouchChange: (active: boolean) => void; theme: AppTheme }) {
  const actionWidth = 132;
  const reduceMotion = useReducedMotion();
  const translateX = useRef(new Animated.Value(0)).current;
  const open = useRef(false);
  const gestureOrigin = useRef(0);
  const settle = (showActions: boolean) => {
    open.current = showActions;
    if (reduceMotion) { translateX.setValue(showActions ? -actionWidth : 0); return; }
    Animated.spring(translateX, { damping: 24, stiffness: 270, toValue: showActions ? -actionWidth : 0, useNativeDriver: true }).start();
  };
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.35,
    onPanResponderGrant: () => { gestureOrigin.current = open.current ? -actionWidth : 0; },
    onPanResponderMove: (_, gesture) => translateX.setValue(Math.max(-actionWidth, Math.min(0, gestureOrigin.current + gesture.dx))),
    onPanResponderRelease: (_, gesture) => {
      if (open.current && (gesture.dx > 7 || gesture.vx > 0.12)) { settle(false); return; }
      settle(gestureOrigin.current + gesture.dx < -actionWidth * 0.42 || gesture.vx < -0.45);
    },
    onPanResponderTerminate: () => settle(open.current),
  }), [reduceMotion, translateX]);
  useEffect(() => () => translateX.stopAnimation(), [translateX]);
  const runAction = (action: () => void) => {
    open.current = false;
    if (reduceMotion) { translateX.setValue(0); action(); return; }
    Animated.timing(translateX, { duration: 130, easing: Easing.out(Easing.cubic), toValue: 0, useNativeDriver: true }).start(({ finished }) => { if (finished) action(); });
  };
  return <View onTouchCancel={() => onSwipeTouchChange(false)} onTouchEnd={() => onSwipeTouchChange(false)} onTouchStart={() => onSwipeTouchChange(true)} style={[styles.scheduleSwipeShell, styles.compactScheduleCard]}>
    <View style={styles.scheduleSwipeActions}><Pressable accessibilityLabel={`${title} 수정`} onPress={() => runAction(onEdit)} style={[styles.scheduleSwipeAction, { backgroundColor: theme.soft }]}><Text style={[styles.scheduleSwipeActionText, { color: theme.primary }]}>수정</Text></Pressable><Pressable accessibilityLabel={`${title} 삭제`} onPress={() => runAction(onDelete)} style={[styles.scheduleSwipeAction, styles.scheduleDeleteAction]}><Text style={styles.scheduleDeleteActionText}>삭제</Text></Pressable></View>
    <Animated.View {...pan.panHandlers} style={[styles.scheduleCard, styles.scheduleSwipeFront, { transform: [{ translateX }] }]}><View style={[styles.colorBar, { backgroundColor: color }]} /><View style={styles.timeWrap}><Text style={[styles.time, completed && styles.completedScheduleText]}>{time}</Text></View><View style={styles.scheduleTextWrap}><Text style={[styles.scheduleTitle, { color: theme.primary }, completed && styles.completedScheduleText]}>{title}</Text><View style={styles.scheduleMetaRow}><Text style={[styles.scheduleModeBadge, { backgroundColor: theme.soft, color: theme.primary }]}>{scheduleModeLabel(mode)}</Text><Text style={styles.category}>{category}</Text></View></View><Pressable accessibilityLabel={`${title} ${completed ? '완료 취소' : '완료'}`} accessibilityRole="checkbox" accessibilityState={{ checked: !!completed }} hitSlop={4} onPress={onToggle} style={({ pressed }) => [styles.scheduleCheckTouch, pressed && styles.scheduleCheckPressed]}><View style={[styles.scheduleCheck, { borderColor: completed ? theme.primary : theme.secondary, backgroundColor: completed ? theme.primary : '#FFFFFF' }]}>{completed && <View style={styles.scheduleCheckGlyph}><View style={styles.scheduleCheckShort} /><View style={styles.scheduleCheckLong} /></View>}</View></Pressable></Animated.View>
  </View>;
}
function UpcomingCard({ schedule, referenceDate, theme }: { schedule: Schedule; referenceDate: Date; theme: AppTheme }) { const target = parseDateKey(schedule.date); const dayCount = Math.round((Date.UTC(target.getFullYear(), target.getMonth(), target.getDate()) - Date.UTC(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate())) / 86400000); return <View style={[styles.upcomingCard, { backgroundColor: theme.soft }]}><View style={[styles.upcomingBadge, { backgroundColor: theme.primary }]}><Text style={styles.upcomingBadgeText}>{dayCount === 0 ? 'D-DAY' : `D-${dayCount}`}</Text></View><View style={styles.upcomingTextWrap}><Text style={styles.upcomingLabel}>다가오는 일정</Text><Text style={[styles.upcomingTitle, { color: theme.primary }]}>{scheduleDisplayTitle(schedule)}</Text><Text style={styles.upcomingDate}>{dateLabel(target)} · {schedule.time}</Text></View></View>; }

function BottomTabIcon({ tab, color }: { tab: Tab; color: string }) {
  if (tab === '홈') return <HomeIcon color={color} />;
  if (tab === 'To do') return <Ionicons accessible={false} color={color} name="calendar-outline" size={24} />;
  if (tab === 'To later') return <LaterIcon color={color} />;
  return <Ionicons accessible={false} color={color} name="cloudy-night-outline" size={24} />;
}

function BottomTabButton({ active, disabled, onPress, reduceMotion, tab, theme }: { active: boolean; disabled: boolean; onPress: () => void; reduceMotion: boolean; tab: Tab; theme: AppTheme }) {
  const activeProgress = useRef(new Animated.Value(active ? 1 : 0)).current;
  const pressScale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    activeProgress.stopAnimation();
    if (reduceMotion) activeProgress.setValue(active ? 1 : 0);
    else Animated.spring(activeProgress, { damping: 17, mass: .72, stiffness: 245, toValue: active ? 1 : 0, useNativeDriver: true }).start();
    return () => activeProgress.stopAnimation();
  }, [active, activeProgress, reduceMotion]);
  useEffect(() => () => pressScale.stopAnimation(), [pressScale]);
  const animatePress = (pressed: boolean) => {
    if (reduceMotion) return;
    if (pressed) Animated.timing(pressScale, { duration: 75, easing: Easing.out(Easing.quad), toValue: .9, useNativeDriver: true }).start();
    else Animated.spring(pressScale, { damping: 13, mass: .55, stiffness: 330, toValue: 1, useNativeDriver: true }).start();
  };
  const color = active ? theme.primary : '#91A0AF';
  return <Pressable accessibilityLabel={tab === '홈' ? '홈' : tab} accessibilityRole="tab" accessibilityState={{ selected: active, disabled }} disabled={disabled} onPress={onPress} onPressIn={() => animatePress(true)} onPressOut={() => animatePress(false)} style={styles.tabButton}>
    <View style={styles.tabAnimatedContent}>
      <View style={styles.tabIconStage}>
        <Animated.View pointerEvents="none" style={[styles.tabIconGlow, { backgroundColor: theme.soft, opacity: activeProgress.interpolate({ inputRange: [0, 1], outputRange: [0, .9], extrapolate: 'clamp' }), transform: [{ scale: Animated.multiply(pressScale, activeProgress.interpolate({ inputRange: [0, 1], outputRange: [.72, 1] })) }] }]} />
        <BottomTabIcon color={color} tab={tab} />
      </View>
      <Text style={[styles.tabLabel, { color }, active && styles.tabLabelActive]}>{tab}</Text>
    </View>
  </Pressable>;
}

type CategoryLayout = { x: number; y: number; width: number; height: number };

function CategorySwapPanel({ categories, selectedCategoryId, draggedCategoryId, dragOverCategoryId, onSelect, onDragStart, onDragMove, onDragEnd, onDragCancel, onMeasure, onRegisterMeasure }: {
  categories: Category[]; selectedCategoryId: string; draggedCategoryId: string | null; dragOverCategoryId: string | null;
  onSelect: (category: Category) => void; onDragStart: (category: Category, x: number, y: number) => void;
  onDragMove: (x: number, y: number) => void; onDragEnd: () => void; onDragCancel: () => void; onMeasure: (id: string, layout: CategoryLayout) => void;
  onRegisterMeasure: (id: string, measure: (() => void) | null) => void;
}) {
  const renderTile = (category: Category) => <CategoryGridDragTile key={category.id} category={category} dragged={draggedCategoryId === category.id} target={dragOverCategoryId === category.id && draggedCategoryId !== category.id} selected={selectedCategoryId === category.id} onDragEnd={onDragEnd} onDragCancel={onDragCancel} onDragMove={onDragMove} onDragStart={onDragStart} onMeasure={onMeasure} onRegisterMeasure={onRegisterMeasure} onSelect={onSelect} />;
  return <View style={styles.swapPanel}><Text style={styles.additionalTitle}>길게 누른 뒤 다른 카테고리 위에 놓으면 서로 자리가 바뀝니다.</Text><Text style={styles.swapSectionTitle}>상단 카테고리</Text><View style={styles.swapRow}>{categories.slice(0, 4).map(renderTile)}</View>{categories.length > 4 && <><Text style={styles.swapSectionTitle}>추가 카테고리</Text><View style={styles.swapRow}>{categories.slice(4).map(renderTile)}</View></>}</View>;
}

function CategoryGridDragTile({ category, selected, dragged, target, onSelect, onDragStart, onDragMove, onDragEnd, onDragCancel, onMeasure, onRegisterMeasure }: {
  category: Category; selected: boolean; dragged: boolean; target: boolean; onSelect: (category: Category) => void;
  onDragStart: (category: Category, x: number, y: number) => void; onDragMove: (x: number, y: number) => void;
  onDragEnd: () => void; onDragCancel: () => void; onMeasure: (id: string, layout: CategoryLayout) => void;
  onRegisterMeasure: (id: string, measure: (() => void) | null) => void;
}) {
  const { ref, handlers, measure } = useCategoryDragGesture({ category, onAction: onSelect, onDragStart, onDragMove, onDragEnd, onDragCancel, onMeasure, onRegisterMeasure });
  return <View ref={ref} collapsable={false} onLayout={measure} style={styles.swapGridCell} {...handlers.panHandlers}><View style={[styles.colorChoice, selected && styles.colorChoiceSelected, dragged && styles.swapSource, target && styles.swapTarget]}><View style={[styles.colorSwatch, { backgroundColor: category.color }]} /><Text numberOfLines={1} style={styles.colorName}>{category.name}</Text></View></View>;
}

function CategoryEditorList({ categories, draggedCategoryId, dragOverCategoryId, swappingCategoryId, onEdit, onDelete, onDragStart, onDragMove, onDragEnd, onDragCancel, onMeasure, onRegisterMeasure }: {
  categories: Category[]; draggedCategoryId: string | null; dragOverCategoryId: string | null;
  swappingCategoryId: string | null;
  onEdit: (category: Category) => void; onDelete: (category: Category) => void;
  onDragStart: (category: Category, x: number, y: number) => void; onDragMove: (x: number, y: number) => void;
  onDragEnd: () => void; onDragCancel: () => void; onMeasure: (id: string, layout: CategoryLayout) => void;
  onRegisterMeasure: (id: string, measure: (() => void) | null) => void;
}) {
  return <View style={styles.categoryDragList}>{categories.map((category) => <CategoryEditorDragRow key={category.id} category={category} canDelete={categories.length > 4} dragged={draggedCategoryId === category.id} swapping={swappingCategoryId === category.id} target={dragOverCategoryId === category.id && draggedCategoryId !== category.id} onDelete={onDelete} onDragEnd={onDragEnd} onDragCancel={onDragCancel} onDragMove={onDragMove} onDragStart={onDragStart} onEdit={onEdit} onMeasure={onMeasure} onRegisterMeasure={onRegisterMeasure} />)}</View>;
}

function CategoryEditorDragRow({ category, canDelete, dragged, target, swapping, onEdit, onDelete, onDragStart, onDragMove, onDragEnd, onDragCancel, onMeasure, onRegisterMeasure }: {
  category: Category; canDelete: boolean; dragged: boolean; target: boolean; swapping: boolean;
  onEdit: (category: Category) => void; onDelete: (category: Category) => void;
  onDragStart: (category: Category, x: number, y: number) => void; onDragMove: (x: number, y: number) => void; onDragEnd: () => void;
  onDragCancel: () => void; onMeasure: (id: string, layout: CategoryLayout) => void;
  onRegisterMeasure: (id: string, measure: (() => void) | null) => void;
}) {
  const { ref, handlers, measure } = useCategoryDragGesture({ category, onAction: onEdit, onDragStart, onDragMove, onDragEnd, onDragCancel, onMeasure, onRegisterMeasure });
  return <View ref={ref} collapsable={false} onLayout={measure} style={[styles.categoryListItem, dragged && styles.categoryListItemDragged, target && styles.categoryListItemTarget, (dragged || swapping) && styles.categoryListItemGhosted]}><View style={styles.categoryListEdit} {...handlers.panHandlers}><Text style={styles.dragHandle}>≡</Text><View style={[styles.listColor, { backgroundColor: category.color }]} /><Text style={styles.listCategoryName}>{category.name}</Text><Text style={styles.editLabel}>수정</Text></View>{canDelete && <Pressable onPress={() => onDelete(category)} style={styles.categoryDeleteButton}><Text style={styles.categoryDeleteText}>삭제</Text></Pressable>}</View>;
}

function useCategoryDragGesture(callbacks: {
  category: Category; onAction: (category: Category) => void;
  onDragStart: (category: Category, x: number, y: number) => void;
  onDragMove: (x: number, y: number) => void; onDragEnd: () => void; onDragCancel: () => void;
  onMeasure: (id: string, layout: CategoryLayout) => void;
  onRegisterMeasure: (id: string, measure: (() => void) | null) => void;
}) {
  const ref = useRef<View>(null);
  const latest = useRef(callbacks);
  latest.current = callbacks;
  const mounted = useRef(true);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDragging = useRef(false);
  const cancelledTap = useRef(false);
  const touchPosition = useRef({ x: 0, y: 0 });
  const clearLongPress = () => {
    if (longPressTimer.current !== null) clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  };
  const measure = useMemo(() => () => {
    const node = ref.current;
    const id = latest.current.category.id;
    node?.measureInWindow((x, y, width, height) => {
      if (mounted.current && node === ref.current && width > 0 && height > 0 && [x, y, width, height].every(Number.isFinite)) latest.current.onMeasure(id, { x, y, width, height });
    });
  }, []);
  useEffect(() => {
    mounted.current = true;
    const id = callbacks.category.id;
    latest.current.onRegisterMeasure(id, measure);
    return () => {
      mounted.current = false;
      clearLongPress();
      latest.current.onRegisterMeasure(id, null);
      if (isDragging.current) latest.current.onDragCancel();
      isDragging.current = false;
    };
  }, [callbacks.category.id, measure]);
  // Keep a single responder for the whole gesture. Live refs avoid restarting
  // PanResponder when highlighting a target causes the parent to render again.
  const handlers = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: (_, gesture) => {
      clearLongPress(); isDragging.current = false; cancelledTap.current = false;
      touchPosition.current = { x: gesture.x0, y: gesture.y0 };
      measure();
      longPressTimer.current = setTimeout(() => {
        longPressTimer.current = null;
        if (!mounted.current || cancelledTap.current) return;
        isDragging.current = true;
        latest.current.onDragStart(latest.current.category, touchPosition.current.x, touchPosition.current.y);
      }, 280);
    },
    onPanResponderMove: (_, gesture) => {
      touchPosition.current = { x: gesture.moveX, y: gesture.moveY };
      if (isDragging.current) latest.current.onDragMove(gesture.moveX, gesture.moveY);
      else if (Math.abs(gesture.dx) > 8 || Math.abs(gesture.dy) > 8) { cancelledTap.current = true; clearLongPress(); }
    },
    onPanResponderTerminationRequest: () => !isDragging.current,
    onPanResponderRelease: () => {
      clearLongPress();
      const wasDragging = isDragging.current;
      isDragging.current = false;
      if (wasDragging) latest.current.onDragEnd();
      else if (!cancelledTap.current) latest.current.onAction(latest.current.category);
    },
    onPanResponderTerminate: () => {
      clearLongPress(); cancelledTap.current = true;
      const wasDragging = isDragging.current;
      isDragging.current = false;
      if (wasDragging) latest.current.onDragCancel();
    },
  }), [measure]);
  return { ref, handlers, measure };
}

const styles = StyleSheet.create({
  dataWarning: { color: '#9C5862', fontSize: 12, lineHeight: 18, paddingVertical: 8 },
  homeDate: { color: '#64748B', fontSize: 12, fontWeight: '600' },
  screenHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 17, paddingBottom: 14 },
  screenEyebrow: { fontSize: 10, letterSpacing: 1.4, fontWeight: '700', marginBottom: 4 },
  screenTitle: { fontFamily: 'Nunito_800ExtraBold', fontSize: 32, lineHeight: 40, letterSpacing: -.6 },
  headerIconButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center' },
  todoMonthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 3 },
  todayButton: { paddingHorizontal: 12, minHeight: 32, justifyContent: 'center', borderRadius: 14 },
  shopEmblem: { padding: 22, borderRadius: 30, marginBottom: 24 },
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
  rangeStartDayCell: { zIndex: 2 },
  calendarKeywordSlot: { alignItems: 'center', gap: 0, height: 42, justifyContent: 'flex-start', position: 'relative', width: '100%' }, calendarHolidaySlot: { alignItems: 'center', height: 11, justifyContent: 'center', width: '100%' },
  holidayLabel: { color: '#C56E76', fontSize: 9, fontWeight: '700', lineHeight: 11, maxWidth: '100%', textAlign: 'center' },
  calendarKeyword: { alignItems: 'center', borderRadius: 4, borderWidth: 1, justifyContent: 'center', minHeight: 15, paddingHorizontal: 2, width: 42 },
  calendarRangeKeyword: { alignSelf: 'stretch', height: 16, minHeight: 16, overflow: 'visible', paddingHorizontal: 1, position: 'relative', width: '100%' }, calendarRangeKeywordText: { fontSize: 8, lineHeight: 16 },
  calendarRangeKeywordOverlay: { bottom: 0, left: 0, paddingHorizontal: 3, position: 'absolute', textAlign: 'center', top: 0, zIndex: 4 },
  calendarKeywordText: { color: '#24344F', fontSize: 7.5, fontWeight: '700', lineHeight: 8, textAlign: 'center' },
  unlabeledScheduleDot: { backgroundColor: '#17243D', borderRadius: 2, height: 4, marginTop: 1, width: 4 },
  scheduleMetaRow: { alignItems: 'center', flexDirection: 'row', gap: 6 }, scheduleModeBadge: { borderRadius: 7, fontSize: 9.5, fontWeight: '800', overflow: 'hidden', paddingHorizontal: 6, paddingVertical: 2 },
  scheduleSwipeShell: { backgroundColor: '#FFFFFF', borderRadius: 18, minHeight: 70, overflow: 'hidden', position: 'relative' }, scheduleSwipeActions: { bottom: 5, flexDirection: 'row', gap: 6, paddingLeft: 6, paddingRight: 5, position: 'absolute', right: 0, top: 5, width: 132 }, scheduleSwipeAction: { alignItems: 'center', borderRadius: 14, flex: 1, justifyContent: 'center' }, scheduleSwipeActionText: { fontSize: 12, fontWeight: '800' }, scheduleDeleteAction: { backgroundColor: '#D89096' }, scheduleDeleteActionText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' }, scheduleSwipeFront: { minHeight: 70, width: '100%' },
  scheduleCheckTouch: { alignItems: 'center', justifyContent: 'center', minHeight: 52, paddingHorizontal: 15 }, scheduleCheckPressed: { opacity: 0.68, transform: [{ scale: 0.9 }] }, scheduleCheck: { alignItems: 'center', borderRadius: 7, borderWidth: 1.5, height: 22, justifyContent: 'center', width: 22 }, scheduleCheckGlyph: { height: 12, width: 14 }, scheduleCheckShort: { backgroundColor: '#FFFFFF', borderRadius: 2, height: 2, left: 1, position: 'absolute', top: 6, transform: [{ rotate: '44deg' }], width: 6 }, scheduleCheckLong: { backgroundColor: '#FFFFFF', borderRadius: 2, height: 2, left: 4, position: 'absolute', top: 5, transform: [{ rotate: '-46deg' }], width: 10 }, completedScheduleText: { opacity: 0.48, textDecorationLine: 'line-through' },
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
  emptyTab: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: 36 }, loadingScreen: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingBottom: 34, paddingHorizontal: 32 }, loadingLogo: { height: 228, width: 228 }, loadingSpinner: { marginTop: 14 }, loadingQuote: { color: '#929DA9', fontSize: 13, lineHeight: 20, marginTop: 18, textAlign: 'center' }, shopScreen: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: 36 }, emptyTabTitle: { color: '#17243D', fontSize: 21, fontWeight: '800', marginBottom: 8 }, emptyTabText: { color: '#708194', fontSize: 14, lineHeight: 21, textAlign: 'center' }, shopIcon: { color: '#17243D', fontSize: 38, fontWeight: '800', marginBottom: 14 }, shopComingSoon: { backgroundColor: '#E8EDF2', borderRadius: 18, color: '#17243D', fontSize: 13, fontWeight: '800', marginTop: 20, overflow: 'hidden', paddingHorizontal: 14, paddingVertical: 8 }, tabBar: { borderTopColor: '#DCE3EB', borderTopWidth: 1, flexDirection: 'row', paddingBottom: 7, paddingTop: 7 }, tabButton: { alignItems: 'center', flex: 1, justifyContent: 'center', minHeight: 53, paddingVertical: 2 }, tabAnimatedContent: { alignItems: 'center', gap: 2, justifyContent: 'center' }, tabIconStage: { alignItems: 'center', height: 30, justifyContent: 'center', position: 'relative', width: 42 }, tabIconGlow: { borderRadius: 14, height: 28, position: 'absolute', width: 38 }, tabLabel: { fontSize: 10.5, fontWeight: '700' }, tabLabelActive: { fontWeight: '800' },
  modalBackdrop: { backgroundColor: 'rgba(23, 36, 61, 0.38)', flex: 1, justifyContent: 'flex-end' }, modalScroll: { flexGrow: 1, justifyContent: 'flex-end' }, modalCard: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, paddingBottom: 34 }, modalHandle: { alignSelf: 'center', backgroundColor: '#DCE3EB', borderRadius: 3, height: 5, marginBottom: 21, width: 42 }, modalTitle: { color: '#17243D', fontSize: 20, fontWeight: '800', marginBottom: 18 }, input: { backgroundColor: '#E8EDF2', borderRadius: 13, color: '#17243D', fontSize: 15, marginBottom: 12, paddingHorizontal: 15, paddingVertical: 14 }, labelRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, timeLabel: { color: '#3F526A', fontSize: 14, fontWeight: '800', marginLeft: 3, marginTop: 4 }, categoryHint: { color: '#8090A0', fontSize: 10.5, marginLeft: 3, marginTop: 2 }, categoryEditButton: { backgroundColor: '#E8EDF2', borderRadius: 12, paddingHorizontal: 11, paddingVertical: 6 }, categoryEditText: { color: '#17243D', fontSize: 12, fontWeight: '800' }, colorPicker: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, marginTop: 9, position: 'relative' }, categorySelectionIndicator: { borderRadius: 12, borderWidth: 1, bottom: 0, left: 0, position: 'absolute', top: 0, width: 62 }, colorChoice: { alignItems: 'center', borderColor: 'transparent', borderRadius: 12, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 9, width: 62, zIndex: 1 }, colorChoiceSelected: { backgroundColor: '#E8EDF2', borderColor: '#8FA6BB' }, colorSwatch: { borderRadius: 9, height: 18, marginBottom: 6, width: 18 }, colorName: { color: '#3F526A', fontSize: 11, fontWeight: '700', maxWidth: 52 }, moreCategoryChoice: { backgroundColor: '#E8EDF2', justifyContent: 'center' }, moreCategoryPlus: { color: '#17243D', fontSize: 23, lineHeight: 32 }, swapGridCell: { alignItems: 'center', marginBottom: 7, width: '25%' }, swapRow: { flexDirection: 'row', flexWrap: 'wrap' }, dragOverlay: { left: 22, position: 'absolute', right: 22, top: 0, zIndex: 30 }, dragOverlayRow: { alignItems: 'center', backgroundColor: '#FFFFFF', borderColor: '#8FA6BB', borderRadius: 12, borderWidth: 1, elevation: 8, flexDirection: 'row', minHeight: 54, opacity: 0.97, paddingHorizontal: 13, shadowColor: '#17243D', shadowOpacity: 0.22, shadowRadius: 12 }, additionalCategories: { backgroundColor: '#E8EDF2', borderRadius: 12, marginBottom: 8, marginTop: 9, padding: 10 }, additionalTitle: { color: '#61758A', fontSize: 11, lineHeight: 16, marginBottom: 7 }, noExtraText: { color: '#718396', fontSize: 12, padding: 7 }, timePicker: { height: 144, marginBottom: 6, width: '100%' }, modalButtons: { flexDirection: 'row', gap: 9, marginTop: 9 }, cancelButton: { alignItems: 'center', backgroundColor: '#E8EDF2', borderRadius: 13, flex: 1, paddingVertical: 14 }, cancelText: { color: '#4E6075', fontSize: 15, fontWeight: '800' }, saveButton: { alignItems: 'center', backgroundColor: '#17243D', borderRadius: 13, flex: 1, paddingVertical: 14 }, saveButtonDisabled: { opacity: 0.28 }, saveText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' }, editorHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, backText: { color: '#17243D', fontSize: 30, lineHeight: 30 }, headerSpacer: { width: 18 }, editListHint: { color: '#718396', fontSize: 12, lineHeight: 18, marginBottom: 8 }, categoryDragList: { maxHeight: 430 }, categoryListItem: { alignItems: 'center', backgroundColor: '#FFFFFF', borderBottomColor: '#E8EDF2', borderBottomWidth: 1, flexDirection: 'row', minHeight: 54, paddingHorizontal: 4 }, categoryListItemDragged: { opacity: 0.25 }, categoryListItemTarget: { backgroundColor: '#FFF9DF', borderColor: '#E7BE55', borderRadius: 12, borderStyle: 'dashed', borderWidth: 2 }, categoryListEdit: { alignItems: 'center', flex: 1, flexDirection: 'row', paddingHorizontal: 7, paddingVertical: 14 }, dragHandle: { color: '#8FA6BB', fontSize: 19, marginRight: 11 }, categoryDeleteButton: { paddingHorizontal: 9, paddingVertical: 12 }, categoryDeleteText: { color: '#B06E76', fontSize: 12, fontWeight: '800' }, listColor: { borderRadius: 9, height: 18, marginRight: 12, width: 18 }, listCategoryName: { color: '#24344F', flex: 1, fontSize: 15, fontWeight: '700' }, editLabel: { color: '#17243D', fontSize: 13, fontWeight: '700' }, newCategoryButton: { alignItems: 'center', backgroundColor: '#E8EDF2', borderRadius: 13, marginTop: 17, paddingVertical: 14 }, newCategoryDisabled: { opacity: 0.5 }, newCategoryText: { color: '#17243D', fontSize: 14, fontWeight: '800' }, palette: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 6, marginTop: 10 }, paletteChoice: { alignItems: 'center', borderColor: 'transparent', borderRadius: 18, borderWidth: 2, height: 36, justifyContent: 'center', width: 36 }, paletteChoiceSelected: { borderColor: '#17243D' }, paletteSwatch: { borderRadius: 13, height: 26, width: 26 },
  setupCloseButton: { alignItems: 'center', justifyContent: 'center', minHeight: 44, minWidth: 44, paddingHorizontal: 4 }, setupCloseText: { color: '#718396', fontSize: 13, fontWeight: '700' },
  scheduleModeRow: { backgroundColor: '#F2F5F8', borderRadius: 16, flexDirection: 'row', gap: 4, marginBottom: 13, padding: 4, position: 'relative' }, scheduleModeIndicator: { borderRadius: 13, bottom: 4, left: 4, position: 'absolute', top: 4 }, scheduleModeChoice: { alignItems: 'center', borderRadius: 13, flex: 1, minHeight: 40, justifyContent: 'center', paddingHorizontal: 4, zIndex: 1 }, scheduleModeName: { color: '#56687C', fontSize: 14, fontWeight: '800' }, scheduleSelectionSummary: { color: '#657789', fontSize: 12, fontWeight: '700', marginTop: 7, textAlign: 'center' }, scheduleCalendarReveal: { overflow: 'hidden' },
  detailsHeader: { alignItems: 'flex-start', flexDirection: 'row', marginBottom: 4 }, detailsBackButton: { alignItems: 'center', justifyContent: 'center', minHeight: 44, width: 38 }, detailsBackText: { fontSize: 32, lineHeight: 35 }, detailsHeading: { flex: 1, paddingTop: 4 },
  scheduleCalendar: { backgroundColor: '#F7F9FB', borderRadius: 18, marginTop: 10, paddingBottom: 10, paddingHorizontal: 8, paddingTop: 8 }, scheduleCalendarHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }, scheduleCalendarArrow: { alignItems: 'center', height: 40, justifyContent: 'center', width: 40 }, scheduleCalendarMonth: { fontSize: 14, fontWeight: '800' }, scheduleCalendarWeek: { flexDirection: 'row', marginBottom: 2 }, scheduleCalendarWeekText: { color: '#748496', fontSize: 10.5, fontWeight: '700', textAlign: 'center', width: '14.2857%' }, scheduleCalendarGrid: { flexDirection: 'row', flexWrap: 'wrap' }, scheduleCalendarEmpty: { height: 39, width: '14.2857%' }, scheduleCalendarDay: { alignItems: 'center', borderRadius: 12, height: 39, justifyContent: 'center', width: '14.2857%' }, scheduleCalendarDayCircle: { alignItems: 'center', borderRadius: 14, height: 28, justifyContent: 'center', width: 28 }, scheduleCalendarDayText: { fontSize: 12.5, fontWeight: '700' }, scheduleCalendarHint: { color: '#8190A0', fontSize: 10.5, lineHeight: 16, marginTop: 5, textAlign: 'center' },
  settingsScreen: { flex: 1 },
  settingsFrame: { flex: 1, paddingHorizontal: 28 },
  settingsHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 22, paddingTop: 18 },
  settingsContent: { paddingBottom: 36 },
  settingsBackButton: { alignItems: 'center', borderRadius: 16, height: 44, justifyContent: 'center', width: 44 },
  settingsBack: { fontSize: 34, lineHeight: 36, marginTop: -2 },
  settingsTitle: { fontSize: 20, fontWeight: '800' },
  settingsHeaderSpacer: { width: 44 },
  settingsLead: { color: '#66778A', fontFamily: 'Nunito_600SemiBold_Italic', fontSize: 16, lineHeight: 25, marginBottom: 24, paddingHorizontal: 4 },
  settingsMenu: { backgroundColor: '#FFFFFF', borderColor: '#DCE3EB', borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  settingsMenuRow: { alignItems: 'center', borderBottomColor: '#E8EDF2', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', minHeight: 82, paddingHorizontal: 22, paddingVertical: 16 },
  settingsMenuTextWrap: { flex: 1, marginLeft: 14 }, settingsMenuTitle: { fontSize: 15, fontWeight: '800', marginBottom: 3 }, settingsMenuCaption: { color: '#7B8998', fontSize: 11.5 }, settingsMenuChevron: { color: '#91A0AF', fontSize: 26, marginLeft: 8 },
  settingsThemePreview: { flexDirection: 'row', width: 42 }, settingsThemeDot: { borderColor: '#FFFFFF', borderRadius: 12, borderWidth: 2, height: 24, marginRight: -7, width: 24 }, settingsMenuIcon: { alignItems: 'center', borderRadius: 13, height: 38, justifyContent: 'center', width: 38 }, settingsMenuIconText: { fontSize: 18, fontWeight: '800' },
  settingsSectionTitle: { fontSize: 18, fontWeight: '800', marginBottom: 5 },
  settingsDescription: { color: '#718092', fontSize: 13, lineHeight: 19, marginBottom: 18 },
  settingsSecondaryTitle: { marginTop: 30 },
  settingsInfoCard: { backgroundColor: '#FFFFFF', borderColor: '#DCE3EB', borderRadius: 18, borderWidth: 1, paddingHorizontal: 22, paddingVertical: 21 },
  settingsInfoTitle: { fontSize: 14, fontWeight: '800', marginBottom: 6 },
  settingsInfoText: { color: '#718092', fontSize: 12, lineHeight: 19 },
  settingsVersion: { color: '#9AA5B1', fontSize: 11, marginTop: 22, textAlign: 'center' },
  themeList: { gap: 11 },
  themeCard: { alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1.5, flexDirection: 'row', minHeight: 82, paddingHorizontal: 20, paddingVertical: 15 },
  themeCardPressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  themeSwatches: { flexDirection: 'row', marginRight: 14 },
  themeSwatch: { borderColor: '#FFFFFF', borderRadius: 12, borderWidth: 2, height: 24, marginRight: -6, width: 24 },
  themeTextWrap: { flex: 1 },
  themeName: { fontSize: 15, fontWeight: '800', marginBottom: 3 },
  themeDescription: { color: '#718092', fontSize: 11, lineHeight: 16 },
  themeRadio: { alignItems: 'center', borderRadius: 10, borderWidth: 1.5, height: 20, justifyContent: 'center', marginLeft: 10, width: 20 },
  themeRadioDot: { borderRadius: 5, height: 10, width: 10 },
  helpList: { gap: 10 }, helpCard: { backgroundColor: '#FFFFFF', borderColor: '#E0E6ED', borderRadius: 18, borderWidth: 1, paddingHorizontal: 20, paddingVertical: 17 }, helpTitle: { fontSize: 15, fontWeight: '800', marginBottom: 6 }, helpText: { color: '#718092', fontSize: 12.5, lineHeight: 20 }, contactCard: { borderRadius: 20, marginTop: 18, paddingHorizontal: 20, paddingVertical: 18 }, contactEmailButton: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', marginTop: 5 }, contactEmail: { fontSize: 13, fontWeight: '800', textDecorationLine: 'underline' },
});
