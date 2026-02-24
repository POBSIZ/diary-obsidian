# Diary

Obsidian용 **다이어리 플러그인**입니다. 연간·월간 플래너를 제공합니다.

## 기능

- **연간 플래너**: 12개월 × 31일 격자 형태의 연간 캘린더
- **월간 플래너**: 한 달 단위 상세 뷰, 핀치 줌 지원 (모바일)
- **날짜 노트**: 셀 클릭 시 해당 날짜 노트 열기 (없으면 생성)
- **기간 노트**: 드래그로 날짜 범위 선택 후 기간 노트 생성
- **플랜 노트**: 연간/월간 플랜 노트 패널 (해당 기간 요약 노트 생성·열기)
- **공휴일 표시**: 설정한 국가의 공휴일을 캘린더에 표시
- **다국어**: 영어/한국어 UI
- **모바일 지원**: 터치 드래그, 핀치 줌(월간), 하단 여백·셀 너비 조절 설정

## 사용 방법

### 플래너 열기

- 사이드바: **calendar-range** 아이콘 → 연간 플래너, **calendar-days** 아이콘 → 월간 플래너
- 명령 팔레트: "Open yearly planner" / "Open monthly planner"

### 날짜·기간 노트

- **날짜 노트**: 날짜 셀 클릭 시 해당 날짜 노트 열기 (없으면 자동 생성)
- **기간 노트**: 날짜 셀을 드래그해 범위 선택 후 놓으면 기간 노트 생성 모달 표시
- **Add file** 버튼으로 단일 날짜 또는 기간 노트 직접 생성 가능

### 네비게이션

- **연간**: ◀/▶ 이전·다음 연도, "Today" 현재 연도, 연도 숫자 클릭으로 선택
- **월간**: ◀/▶ 이전·다음 달, "Today" 현재 달, 월·연도 클릭으로 선택

## 설정

| 설정 | 설명 |
|------|------|
| **Language** | UI 언어 (English / 한국어) |
| **Planner folder** | 날짜·기간 노트 저장 폴더 (기본: `Planner`) |
| **Date format** | 파일명 날짜 형식 (기본: `YYYY-MM-DD`) |
| **Show holidays** | 공휴일 표시 여부 |
| **Holiday country** | 공휴일 국가 (대한민국, 미국, 일본, 중국 등) |
| **Mobile bottom padding** | 모바일 플래너 하단 여백 (rem) |
| **Mobile cell width** | 모바일 월 셀 너비 (rem) |

## 파일 형식

- **단일 날짜**: `{Planner folder}/2026-02-12.md`
- **기간 노트**: `{Planner folder}/2026-02-01_to_2026-02-07.md` (frontmatter에 `date_start`, `date_end` 포함)
- **플랜 노트**: 연간 `{Planner folder}/{year}.md`, 월간 `{Planner folder}/{year}-{month}.md` (해당 기간 요약 노트)

## 베타 테스트

- **방법 A (간단)**: [Releases](https://github.com/POBSIZ/obsidian-diary/releases)에서 Pre-release 또는 Draft를 수동 다운로드 후 설치
- **방법 B (BRAT)**: [BRAT 플러그인](https://obsidian.md/plugins?id=obsidian42-brat) 설치 → **Add beta plugin** → `POBSIZ/obsidian-diary` 레포 URL 추가

## 수동 설치

1. [Releases](https://github.com/POBSIZ/obsidian-diary/releases)에서 최신 버전 다운로드
2. `main.js`, `styles.css`, `manifest.json`을 `Vault/.obsidian/plugins/diary/` 폴더에 복사
3. **Settings → Community plugins**에서 "Diary" 활성화

## 개발

- Node.js 18+ (LTS 권장)
- `npm install` → `npm run dev` (watch 모드 빌드)
- `npm run build` (프로덕션 빌드)
- `npm run lint` (ESLint 검사)

## 라이선스

LICENSE 파일 참고.
