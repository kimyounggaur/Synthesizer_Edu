# 신디 코치 — 신디사이저 조작법 배우기

첨부된 `synthesizer_operation_learning_mobile_webapp_spec_v1_1_visual.md`의 P0 기능과 36장 비주얼 학습 구조를 구현한 한국어 모바일 웹앱입니다.

## 실행

Node.js 22.13 이상을 사용합니다.

```powershell
npm install
npx wrangler d1 execute DB --local --config wrangler.local.json --file drizzle/0000_stale_stick.sql
npm run dev -- --host 127.0.0.1
```

DB 초기화 명령은 새 로컬 DB에서 한 번 실행합니다. 이미 적용한 SQL을 다시 실행하지 않습니다. 로컬 주소는 개발 서버에 출력됩니다.

```powershell
npm run typecheck
npm run lint
npm test
npm run crawl:validate-sources
npm run test:api  # 개발 서버가 실행 중이어야 합니다.
npm run build
```

## 구현한 흐름

- 첫 진입 → 카메라/사진 선택/직접 입력 → 정확한 모델명과 접미사 확인 → 지원 상태 안내.
- 전면·후면·좌우 측면 SVG 도해, 의미 있는 컨트롤 ID, 확대·이동·이름 목록, 동작 시연, 노브·슬라이더 대체 조작.
- L00–L07 총 8개 화면 연습과 T01–T05 문제 해결, 버튼 찾기 연습.
- 한 번에 한 행동, 시작·재개 확인, 결과 확인, 도움 분기, 마무리 확인, 중복 완료 방지.
- IndexedDB 게스트 기록, 모의 패널 상태 복원, 읽어 주기·움직임 감소·큰 글자·화면 켜 두기 설정.
- 명시적 다운로드, SHA-256 검증, 임시 캐시에서 활성 캐시로 전환, 동시 다운로드 직렬화, 오프라인 직접 경로 폴백.
- 서버 모델 검색/확정, OCR 어댑터, 세션 소유권, 입력 크기·이미지 서명·픽셀 제한, 동일 출처 검사, 요청 횟수 제한.
- 관리자 권한 확인, 구조화 초안 편집, 동일 학습 렌더러 미리보기, 독립 검수·게시 차단, 회수·감사 기록.

## 중요한 현재 상태

**앱의 개발 완료와 실물 악기 조작 안내의 출시 승인은 별개입니다.** 문서에 실물 검수 자료가 없으므로 현재 모든 학습은 `screen_practice`, `R0`, `hardwareVerified:false`입니다. 실제 악기 제어·저장·초기화·SysEx 송신은 구현하지 않습니다.

JUNO-DS61 패널은 공식 문헌을 참고해 작성한 **학습용 도해**입니다. 좌표는 정규화된 도해 좌표이며 `actualBbox:null`로 유지합니다. 실물과 1:1로 대조한 디지털 트윈이라고 표시하지 않습니다. 실제 패널 추적 자산·실물 검수·독립 콘텐츠 검토가 완료되어야 실제 조작 학습을 추가할 수 있습니다.

**Google Cloud Vision 인증 정보는 제공되지 않았습니다.** 촬영, 이미지 자르기, EXIF를 포함하지 않는 JPG 재생성, 업로드 검증 및 서버 어댑터는 구현되어 있습니다. 인증 정보가 없거나 기능이 꺼져 있으면 503 `OCR_NOT_CONFIGURED`와 직접 입력 경로를 제공합니다. 가짜 OCR 결과를 만들지 않습니다.

## 환경 설정

`.env.example`의 키를 참고합니다. Cloudflare 로컬 실행은 Git에 포함하지 않는 `.dev.vars`를 사용할 수 있습니다. 배포 환경 값은 Sites 비밀 설정에 저장합니다.

| 변수                    | 용도                                                                       |
| ----------------------- | -------------------------------------------------------------------------- |
| `GOOGLE_VISION_API_KEY` | 서버 전용 Google Cloud Vision 키. 브라우저에 전달하지 않습니다.            |
| `OCR_DISABLED`          | `true`면 외부 OCR 요청을 차단합니다. 키 연결 후 `false`로 변경합니다.      |
| `ADMIN_EMAILS`          | 플랫폼 인증으로 확인된 관리자 이메일 허용 목록. 빈 값이면 모두 거부합니다. |
| `CRAWLER_INGEST_URL`    | 초안 상태만 받는 배포 앱의 `/api/crawler/drafts` HTTPS 주소입니다.          |
| `CRAWLER_INGEST_TOKEN`  | GitHub Actions와 수집 API에만 저장하는 크롤러 전용 토큰입니다.              |
| `R2_*`                  | 비공개 90일 원본 캐시용 R2 S3 자격증명입니다.                               |

## 공식 매뉴얼 수집

수집기는 `SEED → DISCOVER → EXTRACT → NORMALIZE → FETCH → VALIDATE → DERIVE → PUBLISH` 순서를 따릅니다. 여기서 `PUBLISH`는 공개 게시가 아니라 **D1 미검수 초안 저장**을 뜻합니다. 실제 공개는 관리자 두 명의 검증·독립 게시 단계를 거쳐야 합니다.

```powershell
npm run crawl -- --all --dry-run
npm run crawl -- --source roland --until normalize
npm run crawl -- --model "roland/juno-ds61" --force --dry-run
```

- L1: 공식 원문 링크·서지정보·해시만 D1 및 공개 API에 보관합니다.
- L2: 원본 바이트는 로컬 비공개 캐시 또는 비공개 R2에 최대 90일 보관하며 앱에서 제공하지 않습니다.
- L3: 목차·섹션·컨트롤명 후보만 D1 내부 검수용으로 보관하고 본문은 즉시 폐기합니다.
- 크롤러는 `published`/`verified`/`rejected` 상태를 쓸 수 없습니다. 임의 SQL 토큰 대신 제한된 ingest API만 사용합니다.
- 현재 Vercel 어댑터에는 D1/R2 런타임 바인딩이 없으므로 저장·검수 API의 운영 원본은 Cloudflare 배포입니다. Vercel 빌드는 공개 프런트엔드 미러로 유지됩니다.

개발 도구와 타입/RSC의 보안 패치는 적용했습니다. `npm audit`의 잔여 항목과 제한은 [검증 기록](docs/verification.md)에 기록합니다. 비공개 Sites 접근은 사이트 소유자의 플랫폼 로그인이 필요하며, 앱 자체의 첫 학습 가입 요구와는 별개입니다.

## 기술 선택

React 19 + TypeScript, Next.js App Router 호환 Vinext, Cloudflare Workers/D1, Base UI, SVG/CSS, IndexedDB/Service Worker입니다. 설계서 20.2의 대안 허용에 따라 관리 데이터는 Sites 런타임의 D1을 사용합니다. Supabase 계정·비밀키·유료 프로젝트를 임의로 만들지 않았습니다. 계정 동기화·추가 악기·AR·MIDI는 P1/P2 후속 범위입니다.

## 자료

- [요구사항 대응 및 출시 경계](docs/requirements.md)
- [검증 기록](docs/verification.md)
- [콘텐츠·패널 검수 인계](docs/content-review.md)
- [API 계약](docs/api.md)
- [크롤링 정책](docs/crawling-policy.md)
- [소스 실측 상태](docs/sources-status.md)
- [크롤러 운영](docs/crawler-operations.md)
- [매뉴얼 이의·삭제 절차](docs/takedown.md)
- [Roland 공식 설명서](https://static.roland.com/assets/media/pdf/JUNO-DS_e02_W.pdf)
