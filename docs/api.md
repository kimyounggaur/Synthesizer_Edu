# API 계약

모든 동적 응답은 기본 `Cache-Control: no-store`. 요청 오류는 `code`, 쉬운 한국어 `message`, `request_id`를 반환합니다. 서버 비밀키·원본 사진·OCR 원문은 로그에 기록하지 않습니다.

| 경로                          | 메서드     | 주요 조건                                                              |
| ----------------------------- | ---------- | ---------------------------------------------------------------------- |
| `/api/session`                | GET        | HttpOnly·SameSite=Strict, HTTPS Secure 게스트 세션 사전 발급           |
| `/api/models?q=`              | GET        | 브랜드 충돌/접미사 보존, 후보 최대 3개                                 |
| `/api/models/[id]`            | GET        | 카탈로그와 실제 안내 상태를 분리                                       |
| `/api/models/confirm`         | POST       | confirmed=true와 정확한 suffix 필요; 실제 안내 허용 안 함              |
| `/api/identify/status`        | GET        | 외부 OCR 연결 여부                                                     |
| `/api/identify`               | POST       | multipart JPG, consent=true, client_request_id(UUID), 세션별 멱등 처리 |
| `/api/identify/[id]`          | GET/DELETE | 세션 소유권, 15분 조회 TTL                                             |
| `/api/demo/package`           | GET        | R0 화면 연습 + 정확한 JSON의 SHA-256                                   |
| `/api/profiles/[id]/manifest` | GET        | 실제 릴리스 없음, R0 오프라인 정책                                     |
| `/api/releases/[id]`          | GET        | 게시본만, 초안404/회수410                                              |
| `/api/feedback`               | POST       | 요청 종류/학습·단계 ID 확인, 설명 최대500자, 횟수 제한                 |
| `/api/admin`                  | GET        | 플랫폼 인증 사용자와 서버 관리자 허용목록 모두 필요                    |
| `/api/admin/releases`         | POST       | validate/save/review/publish/revoke, revision 충돌 확인, 감사 기록     |

사진 요청 전체 최대3MiB, 이미지2MiB, JPG 서명/SOF/EOI·400만 픽셀·최대변2400px 검사. 브라우저에서 잘라내고 JPG 재생성하며 원본 메타데이터를 복사하지 않습니다. Google의 이미지 디코더에서도 유효성을 확인합니다. 공급자 처리 상한14초, UI 상한15.5초, 8초 후 지연 안내. 공급자 장애503·시간초과504·중복 처리409를 분리합니다.

OCR 원문은 일시 메모리에서만 처리하고, 결과 저장에는 브랜드·모델 표기와 후보만 포함합니다. 결과는15분 후 조회할 수 없으며, 만료 행의 물리 삭제는 다음 인식 요청 정리 시 수행됩니다. 무트래픽 상태의 즉시 TTL 삭제는 보장하지 않습니다. 공개 운영 전 독립적인 정기 정리 작업과 법적 보관 정책을 확정해야 합니다.

게시된 릴리스는 불변이고 새 내용은 새 초안으로 저장해야 합니다. 서버가 payload의 릴리스ID·화면연습 모드·실물미검수 상태를 정규화합니다. 관리자도 `hardwareVerified:true` 또는 비R0 절차를 끼워 넣을 수 없습니다.
