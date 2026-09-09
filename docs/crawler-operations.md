# 매뉴얼 크롤러 운영 가이드

## 실행 경계

- 네트워크 수집: GitHub Actions Node.js 22.
- 구조화 메타데이터와 내부 파생물: Cloudflare D1.
- 원본 캐시: 비공개 R2, 최대 90일.
- 공개 앱: 게시 승인된 L1만 `/api/manuals/manifest`에서 제공.
- 크롤러 자격증명: 임의 D1 SQL 권한이 아니라 `/api/crawler/drafts` 전용 bearer token.

현재 Vercel 어댑터는 D1/R2 바인딩을 제공하지 않는다. 따라서 Vercel 자동 배포는 프런트엔드 미러이며, 저장·검수 API와 ingest URL은 `.openai/hosting.json`의 Cloudflare 프로젝트를 운영 원본으로 사용한다.

## 명령

```bash
npm run crawl:validate-sources
npm run crawl -- --all
npm run crawl -- --source roland
npm run crawl -- --source korg --until normalize
npm run crawl -- --source arturia --dry-run
npm run crawl -- --model "roland/juno-ds61" --force
npm run crawl:report
```

`--dry-run`은 네트워크 정책을 그대로 적용하지만 D1, R2, 로컬 디스크와 리포트에 쓰지 않는다. `--until normalize`은 원본 다운로드를 시작하지 않는다.

## 비밀 설정

| 이름 | 위치 | 용도 |
|---|---|---|
| `CRAWLER_INGEST_URL` | GitHub Actions | Cloudflare 배포의 `/api/crawler/drafts` |
| `CRAWLER_INGEST_TOKEN` | Actions + Cloudflare secret | 초안 전용 인증; 두 값이 같아야 함 |
| `R2_ACCOUNT_ID` | Actions | R2 S3 endpoint |
| `R2_ACCESS_KEY_ID` | Actions | 비공개 bucket 쓰기 키 |
| `R2_SECRET_ACCESS_KEY` | Actions | 비공개 bucket 쓰기 비밀 |
| `R2_BUCKET_NAME` | Actions | 공개 접근이 꺼진 bucket |

토큰을 저장소, 리포트, 명령행 인자 또는 `NEXT_PUBLIC_*` 변수에 넣지 않는다. GitHub의 정기 실행은 리포트 브랜치와 PR만 만들며 자동 병합하지 않는다. 실제 문서 상태는 `draft`로만 수집되고 관리자 두 명의 검수 뒤에만 `published`가 된다.

## 장애 처리

- 403 3회/robots 루트 차단: 소스를 `blocked`, 자동 재시도 중단.
- selector health check 미달: `failed`, 리포트와 PR에서 즉시 표시.
- 발견량 30% 이상 감소: 드리프트 경고.
- 404: 실행별 오류를 기록하고 3회 연속 확인된 뒤 `dead`.
- 해시 변경: 기존 `verified`/`published`를 `stale`로 바꾸고 `content_sources` 역색인으로 영향 학습을 확인.
- 텍스트 레이어 없음: OCR하지 않고 `needs_review`.
- 권리 요청: [takedown 절차](takedown.md)를 즉시 적용.

원격 D1 마이그레이션은 정기 크롤 워크플로에서 수행하지 않는다. 보호된 GitHub Environment의 수동 마이그레이션 워크플로를 사용한다.
