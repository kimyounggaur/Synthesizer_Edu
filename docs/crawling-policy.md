# 공식 매뉴얼 크롤링 정책

확인 기준일: 2026-09-09

## 공개·보관 경계

| 계층 | 내용 | 위치 | 공개 | 보존 |
|---|---|---|---|---|
| L1 | 제목, 모델, 문서 종류, 언어, 버전, 공식 URL, 해시, 확인 시각 | D1 `manual_documents` | 게시 승인 후 API | 영구 |
| L2 | 제조사 원본 PDF/HTML 바이트 | 로컬 비공개 캐시 또는 비공개 R2 | 금지 | 최대 90일 |
| L3 | 목차, 섹션 분류, 컨트롤명 후보 | D1 내부 테이블 | 금지 | 검수 목적 |

원본 PDF, 본문, 설명서 이미지를 `public/`, `app/`, 공개 API 또는 Git 이력에 넣지 않는다. 공개 매니페스트는 제조사 공식 딥링크와 SHA-256만 제공한다.

## 네트워크 하드 규칙

- 사용자 에이전트: `SynthCoachBot/1.0 (+https://synth-coach.vercel.app/bot; contact=<CRAWLER_CONTACT_URL>)`
- 소스 YAML의 정확한 base/asset 호스트만 허용한다. 와일드카드와 제3자 매뉴얼 집계 사이트는 금지한다.
- 호스트별 robots.txt를 먼저 확인하고 24시간 동안 캐시한다. `Disallow` 경로를 요청하지 않는다.
- 같은 호스트 요청은 하나씩 직렬 실행한다. HTML/JSON은 최소 2초, PDF는 최소 5초 간격이다. robots의 Crawl-delay가 더 길면 그 값을 따른다.
- 실행당 호스트 요청 예산은 최대 200건이다.
- HTML 타임아웃은 30초, PDF는 300초이며 타임아웃은 최대 3회다.
- 429는 Retry-After를 한 번 존중하고 다음 실행으로 이월한다. 5xx는 2·4·8·16·32초 지수 백오프 후 중단한다.
- 리다이렉트는 최대 5회이며 매 단계 allowlist를 다시 검사한다.
- 연속 403 3회 또는 robots의 루트 차단은 소스를 `blocked`로 바꾼다.
- 로그인, 등록, CAPTCHA, 프록시, UA 위장, 숫자 ID 범위 스캔은 금지한다. 헤드리스 브라우저는 기본 경로가 아니며 이 구현에는 포함하지 않는다.

## 상태와 권한

크롤러가 만들 수 있는 상태는 `draft`, `stale`, `dead`, `invalid`뿐이다. `verified`, `published`, `rejected`는 관리자 경로에서만 설정한다. `verified`와 `published`는 서로 다른 관리자가 수행해야 한다.

공개 조건은 공식 호스트·robots·Content-Type·매직 바이트·모델 매칭·표준 문서 종류·언어·SHA-256·파일 파싱을 모두 통과하고 독립 게시 승인을 받은 경우뿐이다. 텍스트 레이어가 없으면 OCR하지 않고 검수 큐로 보낸다.

## 스키마 보완

설계 본문의 5개 핵심 테이블은 그대로 두고 다음 관계를 명시적으로 보완했다.

- `manual_document_models`: 하나의 패밀리 설명서를 여러 실제 모델에 연결한다.
- `manual_control_candidates`: 본문 없이 컨트롤명 후보만 보관한다.
- `crawl_issues`: 자동 게이트 보류 큐다.
- `source_robots_checks`: 여러 base/asset 호스트의 robots 상태를 각각 기록한다.
- `content_sources`: 매뉴얼 변경 시 영향을 받는 학습 콘텐츠를 역조회한다.

이 보완은 단일 `model_id`와 URL unique 제약만으로 공통 설명서를 복제 없이 표현할 수 없는 설계 내부 모순을 해소한다.
