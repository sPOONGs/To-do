# Dalvi

달빛 아래 나의 시간을 정리하는 플래너. Expo / React Native로 만들며 iPhone을 우선으로 다듬고 있습니다.

## 화면 구성

- **홈** — 기본 09–22시를 한눈에 보는 요일별 반복 일과표와 다가오는 일정. 그보다 이르거나 늦은 일과가 있을 때만 필요한 시간대가 펼쳐집니다. Dalvi 로고 메뉴에서 설정으로 이동합니다.
- **To do** — 월간 달력, 일정 추가·수정·삭제, 키워드와 카테고리. 달력 안에서 좌우로 넘기면 월이 바뀝니다.
- **To later** — 날짜 없이 담아 두는 할 일·메모·링크. 검색, 카테고리별 보기, 고정, 완료, 일정으로 옮기기를 지원합니다.
- **To dream** — 나의 목표, 오늘의 작은 기록, 준비 목록, 매일 바뀌는 응원, 비어 있는 오늘을 위한 시작 제안.

상점의 결제·광고·사용자 UI 거래 코드는 후속 개발을 위해 남겨 두었지만 현재 화면에서는 비활성화했습니다. 실제 광고가 없을 때는 배너가 공간을 차지하지 않습니다.

## 실행

검증 환경: Node.js 22.17, Expo SDK 57. Windows PowerShell에서는 `.cmd` 명령을 사용하면 PowerShell 스크립트 실행 정책에 걸리지 않습니다.

최초 한 번 Dalvi 전용 개발 앱을 EAS에서 빌드합니다. Apple 인증서 설정 과정에서는 본인의 Apple Developer 계정과 2단계 인증이 필요합니다.

```powershell
npm.cmd ci
npx.cmd eas-cli@latest build --platform ios --profile development
```

빌드가 끝나면 EAS가 표시하는 설치 링크를 iPhone에서 열어 Dalvi 개발 앱을 설치합니다. 이후 평소 개발은 다음 명령으로 시작하고, Expo Go 대신 설치한 Dalvi 앱으로 QR 코드를 엽니다.

```powershell
npm.cmd run start:dev
```

네이티브 패키지·위젯·로그인 설정을 추가하거나 앱 아이콘 같은 네이티브 설정을 바꾼 경우에만 Development Build를 다시 생성하면 됩니다. TypeScript와 화면 코드만 바꾼 경우에는 다시 빌드하지 않아도 됩니다.

## 검증

```powershell
npm.cmd run typecheck
npm.cmd test
npx.cmd expo export --platform ios --output-dir .expo/review-ios
npx.cmd expo export --platform android --output-dir .expo/review-android
```

모델 테스트는 데이터 보존, 날짜 검증, 느린/반복 월 넘김, 시간표 겹침, 완료/되돌리기, 목표 기록 등을 확인합니다. 번들 검증은 실제 기기 UI·애니메이션 검증을 대체하지 않습니다.

## PWA

웹 버전은 다음 명령으로 `dist/`에 생성됩니다.

```powershell
npm.cmd run build:web
```

`main` 브랜치에 변경사항을 올리면 GitHub Actions가 같은 빌드를 검증한 뒤 GitHub Pages에 자동 배포합니다.

- PWA: <https://spoongs.github.io/To-do/>
- 저장소: <https://github.com/sPOONGs/To-do>

iPhone Safari에서 PWA를 연 뒤 공유 버튼의 **홈 화면에 추가**를 선택하면 앱처럼 실행할 수 있습니다. PWA의 일정 데이터도 현재는 해당 브라우저와 기기에만 저장됩니다.

## 저장과 미연결 기능

현재 데이터는 기기의 AsyncStorage에만 저장됩니다. 계정 동기화나 서버 전송은 없습니다. 앱 삭제·기기 변경 시 데이터가 사라질 수 있습니다.

To dream의 제안은 앱에 담긴 목표별 시작 문구이며 실제 다른 이용자의 활동이나 AI 응답이 아닙니다. 실제 연동을 위한 `DreamRecommendationProvider` 인터페이스는 분리했습니다. 이용자 표본, 공개 동의, 서버/API 연결은 후속 단계입니다. 다른 앱의 시청 이력·메시지를 자동으로 읽는 기능도 연결되어 있지 않습니다.

대한민국 공휴일은 우주항공청 월력요항을 가공한 MIT 패키지 `@hyunbinseo/holidays-kr`의 정적 자료를 사용합니다. 현재 포함 범위는 2018~2027년이며, 범위 밖 날짜는 잘못 추측해 표시하지 않습니다.

## 이전 버전과 검토 기록

변경 전 소스 백업 ZIP은 로컬 작업 폴더의 `../backups/`에 별도로 보관되어 있습니다. GitHub에 자동 업로드되지 않습니다.
자세한 경로, 복원 주의사항, 기기 점검 목록은 [검토 기록](REVIEW_NOTES.md)에 정리했습니다.
