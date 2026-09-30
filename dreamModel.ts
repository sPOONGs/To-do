export const DREAM_STORAGE_KEY = '@dalvi/dream_v1';

export type DreamLog = { date: string; text: string; goal: string };
export type DreamPreparation = { id: string; title: string; done: boolean; createdAt: string };
export type DreamData = { version: 1; goal: string; logs: DreamLog[]; preparations: DreamPreparation[] };
export type DreamRecommendation = { id: string; title: string; detail: string; source: 'starter' | 'community' | 'ai' };
export type RecommendationContext = { goal: string; date: Date; hasTodaySchedule: boolean };
// A real community/AI provider can be connected here when a backend, consent,
// minimum sample policy, and an AI service are available. Never invent usage data.
export interface DreamRecommendationProvider {
  recommend(context: RecommendationContext): Promise<DreamRecommendation[]>;
}

export function dreamDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function validDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12);
  return Number.isFinite(date.getTime()) && dreamDateKey(date) === value;
}

export function readDreamData(raw: string | null): DreamData {
  if (raw === null) return { version: 1, goal: '', logs: [], preparations: [] };
  const data = JSON.parse(raw);
  if (!data || data.version !== 1 || typeof data.goal !== 'string'
    || !Array.isArray(data.logs) || !Array.isArray(data.preparations)
    || !data.logs.every((log: DreamLog) => log && validDay(log.date) && typeof log.text === 'string' && typeof log.goal === 'string')
    || !data.preparations.every((item: DreamPreparation) => item && typeof item.id === 'string' && !!item.id && typeof item.title === 'string' && typeof item.done === 'boolean' && typeof item.createdAt === 'string' && Number.isFinite(Date.parse(item.createdAt)))
    || new Set(data.logs.map((log: DreamLog) => log.date)).size !== data.logs.length
    || new Set(data.preparations.map((item: DreamPreparation) => item.id)).size !== data.preparations.length) {
    throw new Error('Invalid saved dream data');
  }
  return data;
}

export function saveDreamLog(data: DreamData, date: string, text: string): DreamData {
  if (!validDay(date) || !text.trim() || !data.goal.trim()) throw new Error('Invalid dream log');
  const existing = data.logs.find(log => log.date === date);
  const next = { date, text: text.trim(), goal: existing?.goal ?? data.goal };
  return { ...data, logs: [...data.logs.filter(log => log.date !== date), next].sort((a, b) => b.date.localeCompare(a.date)) };
}

const encouragements = [
  '작은 한 걸음도, 당신의 꿈 쪽으로.',
  '서두르지 않아도 괜찮아요. 나만의 속도로.',
  '오늘 남긴 작은 흔적이 내일의 빛이 되길.',
  '쉬어가는 날에도 꿈은 당신 곁에 있어요.',
  '아직은 희미해도, 조금씩 선명해질 거예요.',
  '남들과 다른 속도여도 괜찮아요.',
  '완벽한 하루보다, 나다운 한 걸음.',
  '오늘의 작은 용기를 오래 기억해요.',
  '달빛처럼 잔잔히, 원하는 모습에 가까이.',
  '처음의 서툶도 소중한 시작이에요.',
  '조금 느슨해도 괜찮은, 당신만의 여정.',
  '어제의 나에게, 오늘의 작은 빛을.',
  '한 번의 시도가 또 하나의 길을 열어요.',
  '마음에 품은 꿈을 가볍게 꺼내보는 하루.',
  '오늘의 속도도 충분히 좋은 속도예요.',
  '잘하고 싶은 마음만으로도 이미 소중해요.',
  '잠시 멈춘 시간도 나를 돌보는 과정이에요.',
  '조금씩 나아가는 당신을 조용히 응원해요.',
  '보이지 않는 노력도 분명히 쌓이고 있어요.',
  '오늘 해낸 작은 일을 다정하게 바라봐요.',
  '흔들리는 날에도 방향을 잃은 건 아니에요.',
  '쉬어갈 줄 아는 마음도 멋진 용기예요.',
  '지금의 나에게 가장 따뜻한 편이 되어줘요.',
  '천천히 익어가는 시간에는 깊이가 생겨요.',
  '작은 선택 하나가 하루의 빛을 바꿔요.',
  '오늘의 마음도 있는 그대로 충분해요.',
  '한 걸음 내디딘 나를 먼저 칭찬해 주세요.',
  '조용히 이어온 시간은 쉽게 사라지지 않아요.',
  '모든 날이 빛날 필요는 없어요.',
  '괜찮아지는 데에는 나만의 시간이 필요해요.',
  '지친 마음에는 잠깐의 여백을 선물해요.',
  '오늘의 최선은 어제와 달라도 괜찮아요.',
  '작은 성취도 오래 기뻐해도 좋아요.',
  '할 수 있는 만큼 해낸 오늘도 대단해요.',
  '마음이 편안해지는 쪽으로 한 걸음 가봐요.',
  '완벽하지 않아도 진심은 잘 전해져요.',
  '당신이 쌓은 시간은 당신을 배신하지 않아요.',
  '새로운 시작은 언제나 작은 마음에서 와요.',
  '오늘도 나를 포기하지 않은 것이 참 멋져요.',
  '답을 서두르지 않아도 길은 이어져요.',
  '조금 부족해 보여도 충분히 의미 있는 하루예요.',
  '나를 돌보는 일도 중요한 일정이에요.',
  '한숨 돌린 뒤 다시 시작해도 늦지 않아요.',
  '당신의 꾸준함은 생각보다 단단해요.',
  '오늘의 다정함이 내일의 힘이 되어줄 거예요.',
  '마음에 남은 작은 기쁨을 오래 간직해요.',
  '잘 버틴 하루에는 충분한 칭찬이 필요해요.',
  '실수한 순간에도 배운 것은 남아 있어요.',
  '지금 여기까지 온 나를 믿어봐도 좋아요.',
  '달빛 아래에서는 천천히 걸어도 괜찮아요.',
];

export const encouragementCount = encouragements.length;
export type EncouragementSlot = 'dream' | 'home-primary' | 'home-secondary';
const encouragementSlotOffset: Record<EncouragementSlot, number> = {
  dream: 0,
  'home-primary': 1,
  'home-secondary': 2,
};

function localDayNumber(date: Date) {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
}

export function dailyEncouragement(date: Date, slot: EncouragementSlot = 'dream') {
  const shiftedDay = localDayNumber(date) + encouragementSlotOffset[slot];
  const index = ((shiftedDay % encouragements.length) + encouragements.length) % encouragements.length;
  return encouragements[index];
}

export function starterRecommendations({ goal, date, hasTodaySchedule }: RecommendationContext): DreamRecommendation[] {
  if (!goal.trim() || hasTodaySchedule) return [];
  let ideas: [string, string][];
  if (/개발|코딩|프로그래|컴퓨터|소프트웨어/.test(goal)) {
    ideas = [['작은 코드 한 조각 완성하기', '익숙해지고 싶은 기능 하나를 20분만 만들어보기'], ['배운 개념을 내 말로 적어보기', '오늘 궁금한 개발 개념 하나를 짧게 정리하기'], ['작은 문제 하나 풀어보기', '정답보다 어떤 생각을 했는지 한 줄 남기기']];
  } else if (/디자인|그림|미술|일러스트|작가|글쓰기|음악|영상/.test(goal)) {
    ideas = [['좋아하는 작업에서 힌트 찾기', '마음에 드는 작업 하나와 그 이유를 세 줄로 남기기'], ['작은 초안 하나 만들어보기', '완성보다 시작에 마음을 두고 20분만 작업하기'], ['지난 작업을 다시 펼쳐보기', '마음에 드는 점 하나와 다듬을 점 하나 찾기']];
  } else if (/영어|외국어|일어|일본어|중국어|유학/.test(goal)) {
    ideas = [['쓰고 싶은 문장 세 개 모으기', '내 하루에 어울리는 표현을 골라 소리 내어 읽기'], ['짧은 이야기 듣고 따라 읽기', '부담 없는 길이로 10분만 언어와 가까워지기'], ['오늘을 외국어로 한 줄 남기기', '틀려도 괜찮은, 나만의 작은 문장 만들기']];
  } else if (/취업|이직|진로|면접|회사/.test(goal)) {
    ideas = [['마음에 드는 역할 하나 살펴보기', '채용 글에서 궁금한 역량 세 가지를 적어보기'], ['내 경험 하나 정리해보기', '내가 한 일과 배운 점을 짧은 문장으로 남기기'], ['다음 준비를 한 가지로 좁히기', '지금 손댈 수 있는 작은 일 하나 고르기']];
  } else if (/공부|시험|자격|합격|대학/.test(goal)) {
    ideas = [['작은 범위 하나 복습하기', '오늘은 20분, 부담 없이 시작할 수 있는 만큼'], ['헷갈린 내용 한 가지 정리하기', '이해한 내용을 내 말로 짧게 남기기'], ['다음 공부의 시작점 정하기', '책 한 쪽이나 문제 하나를 미리 골라두기']];
  } else {
    ideas = [['꿈에 필요한 한 가지 알아보기', '궁금한 점 하나를 골라 15분만 찾아보기'], ['다음 한 걸음을 작게 나눠보기', '오늘 시작할 수 있는 크기로 준비 한 가지 적기'], ['닮고 싶은 과정에서 힌트 찾기', '관련 인터뷰나 작업을 하나 보고 마음에 남은 점 적기']];
  }
  const index = ((localDayNumber(date) % ideas.length) + ideas.length) % ideas.length;
  return [{ id: `starter-${dreamDateKey(date)}-${index}`, title: ideas[index][0], detail: ideas[index][1], source: 'starter' }];
}

export const localStarterProvider: DreamRecommendationProvider = {
  recommend: async context => starterRecommendations(context),
};
