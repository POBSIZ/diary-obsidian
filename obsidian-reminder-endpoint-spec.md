# Obsidian Reminder Plugin → External Endpoint 연동 문서

## 목표
Obsidian 플러그인에서 리마인더가 생성/수정/삭제될 때 외부 endpoint로 이벤트를 보내고, 실제 예약/발송은 OpenClaw 쪽에서 처리한다.

이 구조의 목적:
- Obsidian/iCloud 파일 전체 스캔 제거
- 앱 외부에서 안정적으로 알림 예약 유지
- Obsidian 앱이 꺼져 있어도 알림 발송 가능하게 설계

---

## 전체 구조

### Plugin 역할
- note/file/frontmatter를 읽어 reminder 정보 해석
- reminder absolute time(`notifyAt`) 계산
- 외부 endpoint에 `upsert/delete` 요청 전송

### External endpoint 역할
- reminder를 식별 가능한 id 기준으로 저장/갱신/삭제
- OpenClaw cron 또는 동등한 스케줄러에 등록
- 시각이 되면 Discord 채널로 메시지 전송

---

## 권장 API

### 1. Reminder Upsert
**POST** `/reminders/upsert`

용도:
- 리마인더 생성
- 리마인더 수정
- 같은 id의 기존 예약 갱신

#### Headers
```http
Authorization: Bearer <TOKEN>
Content-Type: application/json
```

#### Request Body
```json
{
  "id": "planner:Planner/2026-03-31-카메라 정리하기.md:1380",
  "title": "카메라 정리하기",
  "filePath": "Planner/2026-03-31-카메라 정리하기.md",
  "vault": "NOTE",
  "notifyAt": "2026-03-31T23:00:00+09:00",
  "timezone": "Asia/Seoul",
  "content": "카메라 정리하기",
  "body": "노트 본문 전체 또는 요약",
  "channel": "discord",
  "target": "1486333010864242800",
  "source": "obsidian-plugin",
  "meta": {
    "noteDate": "2026-03-31",
    "notifyMinutes": 1380,
    "tags": ["planner"]
  }
}
```

#### Response Body
```json
{
  "ok": true,
  "id": "planner:Planner/2026-03-31-카메라 정리하기.md:1380",
  "jobId": "optional-scheduler-job-id"
}
```

---

### 2. Reminder Delete
**POST** `/reminders/delete`

용도:
- reminder 삭제
- notify_minutes 제거
- 더 이상 예약이 필요 없을 때 제거

#### Headers
```http
Authorization: Bearer <TOKEN>
Content-Type: application/json
```

#### Request Body
```json
{
  "id": "planner:Planner/2026-03-31-카메라 정리하기.md:1380"
}
```

#### Response Body
```json
{
  "ok": true,
  "id": "planner:Planner/2026-03-31-카메라 정리하기.md:1380",
  "deleted": true
}
```

---

## 필드 정의

### 필수 필드
- `id`
  - reminder의 고유 식별자
  - 같은 reminder를 수정/삭제할 때 같은 값 유지 필요
- `title`
  - 사용자에게 보일 reminder 제목
- `filePath`
  - vault 내 상대 경로
- `notifyAt`
  - 절대 시각(ISO-8601, timezone 포함 권장)
- `timezone`
  - 예: `Asia/Seoul`
- `channel`
  - 예: `discord`
- `target`
  - 전송 대상 채널 id

### 선택 필드
- `content`
  - 짧은 알림 텍스트
- `body`
  - 긴 본문 또는 note 요약
- `vault`
  - vault 이름
- `source`
  - 예: `obsidian-plugin`
- `meta`
  - 디버깅/추가 기능용 메타데이터

---

## notifyAt 계산 규칙

플러그인은 reminder를 보낼 때 **파일명 + notify_minutes를 직접 해석해서 절대 시각을 계산**해야 한다.

예시:
- 파일명: `Planner/2026-03-31-카메라 정리하기.md`
- `notify_minutes: 1380`
- timezone: `Asia/Seoul`

결과:
- noteDate = `2026-03-31`
- notify time = `23:00`
- notifyAt = `2026-03-31T23:00:00+09:00`

**중요:** 서버/OpenClaw 쪽은 파일명 규칙을 재해석하지 않아도 되도록, 플러그인에서 `notifyAt`를 완성해서 보내는 것이 권장된다.

---

## ID 생성 규칙 권장안

### 단순 버전
```ts
const id = `planner:${filePath}:${notifyMinutes}`;
```

### 조금 더 안전한 버전
```ts
const id = `planner:${filePath}:${notifyAt}`;
```

### 가장 안정적인 버전
- frontmatter에 `reminder_id` UUID 저장
- 이후 수정/삭제 시 해당 UUID 재사용

예시:
```yaml
reminder_id: 7f4c9d5d-5e57-4ac1-b2d1-5ef3f4f5c111
notify_minutes: 1380
```

내 추천:
- 초기 구현은 `planner:${filePath}:${notifyMinutes}`
- 장기적으로는 `reminder_id` UUID 도입

---

## 플러그인 Settings 권장 항목

```ts
interface ReminderPluginSettings {
  endpointBaseUrl: string;   // ex) https://example.com/hooks/obsidian
  endpointToken: string;     // bearer/shared secret
  defaultChannel: string;    // discord
  defaultTarget: string;     // 1486333010864242800
  timezone: string;          // Asia/Seoul
  sendBody: boolean;         // note 본문 포함 여부
  debounceMs: number;        // ex) 1000
}
```

추천 기본값:
- `defaultChannel = "discord"`
- `defaultTarget = "1486333010864242800"`
- `timezone = "Asia/Seoul"`
- `debounceMs = 1000`

---

## 플러그인 동작 규칙

### Upsert를 보내야 하는 경우
- 새 reminder 생성
- `notify_minutes` 변경
- note 날짜 변경
- file path 변경
- title/body 변경 (알림 내용에 반영하고 싶을 경우)
- target/channel 변경

### Delete를 보내야 하는 경우
- reminder 제거
- `notify_minutes` 삭제
- note 삭제
- reminder 기능 비활성화

---

## 전송 payload 권장 예시

### 짧은 메시지 중심
```json
{
  "id": "planner:Planner/2026-03-31-카메라 정리하기.md:1380",
  "title": "카메라 정리하기",
  "filePath": "Planner/2026-03-31-카메라 정리하기.md",
  "notifyAt": "2026-03-31T23:00:00+09:00",
  "timezone": "Asia/Seoul",
  "content": "카메라 정리하기",
  "channel": "discord",
  "target": "1486333010864242800"
}
```

### 본문 포함형
```json
{
  "id": "planner:Planner/2026-03-31-카메라 정리하기.md:1380",
  "title": "카메라 정리하기",
  "filePath": "Planner/2026-03-31-카메라 정리하기.md",
  "vault": "NOTE",
  "notifyAt": "2026-03-31T23:00:00+09:00",
  "timezone": "Asia/Seoul",
  "content": "카메라 정리하기",
  "body": "노트 본문 전체 또는 요약",
  "channel": "discord",
  "target": "1486333010864242800",
  "source": "obsidian-plugin",
  "meta": {
    "noteDate": "2026-03-31",
    "notifyMinutes": 1380
  }
}
```

---

## Obsidian Plugin 예시 코드 형태

```ts
import { requestUrl } from "obsidian";

await requestUrl({
  url: `${settings.endpointBaseUrl}/reminders/upsert`,
  method: "POST",
  headers: {
    "Authorization": `Bearer ${settings.endpointToken}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    id,
    title,
    filePath,
    vault: this.app.vault.getName(),
    notifyAt,
    timezone: settings.timezone,
    content: title,
    body: settings.sendBody ? bodyText : undefined,
    channel: settings.defaultChannel,
    target: settings.defaultTarget,
    source: "obsidian-plugin",
    meta: {
      noteDate,
      notifyMinutes
    }
  })
});
```

삭제:

```ts
await requestUrl({
  url: `${settings.endpointBaseUrl}/reminders/delete`,
  method: "POST",
  headers: {
    "Authorization": `Bearer ${settings.endpointToken}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({ id })
});
```

---

## 권장 에러 처리

플러그인에서 실패 시:
- 실패 로그 남기기
- Notice 표시 optional
- 같은 reminder에 대해 짧은 debounce 후 재시도 가능
- endpoint 응답 코드와 body를 debug log에 저장

예시:
- 2xx: 성공
- 4xx: payload 문제 → 사용자/로그에 표시
- 5xx: 서버 문제 → 재시도 후보
- network error: 재시도 후보

---

## 구현 권장 순서

1. 플러그인 settings 추가
2. note에서 `notify_minutes` + 날짜 파싱
3. `notifyAt` 계산
4. `upsert/delete` 요청 전송
5. OpenClaw 쪽 endpoint 구현
6. OpenClaw cron 등록/삭제 연동
7. 테스트 버튼 추가

---

## 최종 권장 구조
- **Plugin** = reminder 생성/수정/삭제 이벤트 발행자
- **OpenClaw endpoint** = 예약 동기화 계층
- **OpenClaw cron** = 실제 알림 발송 엔진

이 구조로 가면:
- Obsidian 앱이 꺼져 있어도 알림 유지 가능
- iCloud vault polling 제거 가능
- reminder 동작이 훨씬 예측 가능해짐

---

## 한 줄 요약
플러그인은 **`notifyAt`가 계산된 reminder payload를 external endpoint에 upsert/delete 형태로 보내도록 구현**하면 되고, 실제 스케줄링과 Discord 전송은 외부(OpenClaw)에서 처리하도록 분리하는 것이 가장 안정적이다.
