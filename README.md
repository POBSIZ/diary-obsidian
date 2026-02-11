# Diary

Obsidian용 연간 플래너(Yearly Planner) 플러그인입니다.

## 기능

- **연간 플래너 뷰**: 12개월 × 31일 격자 형태의 연간 캘린더
- **날짜 노트**: 셀 클릭 시 해당 날짜 노트 열기 (없으면 생성)
- **기간 노트**: 드래그로 날짜 범위 선택 후 기간 노트 생성
- **공휴일 표시**: 설정한 국가의 공휴일을 캘린더에 표시
- **모바일 지원**: 터치 드래그, 하단 여백 조절 설정 지원

## 사용 방법

1. **플래너 열기**
   - 사이드바 캘린더 아이콘 클릭
   - 또는 명령 팔레트에서 "Open yearly planner" 실행

2. **날짜 노트 열기/생성**
   - 날짜 셀을 클릭하면 해당 날짜의 노트가 열립니다. 없으면 자동 생성됩니다.

3. **기간 노트 생성**
   - 날짜 셀을 드래그하여 범위를 선택한 뒤 놓으면 기간 노트 생성 모달이 열립니다.
   - 헤더의 "Add file" 버튼으로 단일 날짜 또는 기간 노트를 직접 생성할 수도 있습니다.

4. **연도 이동**
   - ◀/▶ 버튼으로 이전/다음 연도
   - "Today" 버튼으로 현재 연도로 이동
   - 연도 숫자 클릭으로 원하는 연도 직접 선택

## 설정

| 설정 | 설명 |
|------|------|
| **Planner folder** | 날짜/기간 노트가 저장되는 폴더 (기본: `Planner`) |
| **Date format** | 파일명 날짜 형식 (기본: `YYYY-MM-DD`) |
| **Month labels** | 월 헤더 표시 형식 (1월–12월 / Jan–Dec) |
| **Show holidays** | 공휴일 표시 여부 |
| **Holiday country** | 공휴일 국가 (대한민국, 미국, 일본, 중국 등) |
| **Mobile bottom padding** | 모바일에서 플래너 하단 여백 (rem) |

## 파일 형식

- **단일 날짜**: `{Planner folder}/2026-02-12.md`
- **기간 노트**: `{Planner folder}/2026-02-01_to_2026-02-07.md` (frontmatter에 `date_start`, `date_end` 포함)

## 수동 설치

1. [Releases](https://github.com/POBSIZ/diary-obsidian/releases)에서 최신 버전 다운로드
2. `main.js`, `styles.css`, `manifest.json`을 `Vault/.obsidian/plugins/diary-obsidian/` 폴더에 복사
3. Obsidian 설정 → 커뮤니티 플러그인에서 "Diary" 활성화

## 개발

- Node.js v16 이상
- `npm i` → `npm run dev` (watch 모드로 빌드)
- `npm run lint` (ESLint 검사)

## 라이선스

LICENSE 파일 참고.
