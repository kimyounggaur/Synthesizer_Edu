# 검증 기록

검증 일자: 2026-09-08 (Asia/Seoul).

## 실행한 자동 검증

- TypeScript 전체 타입 검사.
- 작성한 소스의 lint. 생성된 Base UI 카탈로그/공용 모바일 훅은 외부 생성 코드로 분리합니다. React Compiler는 사용하지 않으므로 해당 실험 진단을 적용하지 않습니다. React Hooks와 TypeScript correctness 규칙은 유지합니다.
- Node 기반 계약·상태·오프라인 테스트 15개: 브랜드 충돌, 접미사, 미지원 모델, 8개 학습 계약, 상태 재확인, 완료 경계, 모델·릴리스 불일치, 하드웨어 진입 차단, 모의 상태, 검수 위조, 로컬 복원, 캐시 해시·실패복구·동시다운로드·오프라인 냉시작.
- 실제 로컬 HTTP API 확인9개: 앱/직접경로/PWA자산, 브랜드 충돌, OCR미연결, 동일출처, 접미사확정, 관리자·결과소유권·초안보호, 패키지해시, 피드백 저장.

## 아직 수행하지 않은 검증

- 실제 Google Cloud Vision 호출 및 모델명 사진 평가: 인증 정보 미제공.
- 실물 JUNO-DS61 패널 좌표·조작·출력·펌웨어 대조.
- iOS/Android 실기기의 카메라 권한, 설치, Wake Lock, 스크린리더, 200% 확대와 터치 관찰.
- 초보자 사용자 시험 및 문서의 목표 성공률·학습시간 측정.

브라우저 UI 자동화·스크린샷 검사는 직접 요청되지 않아 수행하지 않았습니다. 서비스워커의 오류 복구와 동시성은 독립 VM의 Cache API 모형에서 오류를 주입하여 검증했으며, 이를 실기기 오프라인 검증으로 표시하지 않습니다.

## 의존성 검토

생성된 기본 의존성의 audit14건에서 보안 수정을 적용했습니다. React/RSC 19.2.8, plugin-rsc0.5.34, Vite8.0.16, Cloudflare plugin1.51.1, Wrangler4.120.0을 사용합니다.

남은 audit6건(4 moderate·2 high): Drizzle 개발 체인의 esbuild 관련4건과 vinext→image-size2건입니다. image-size의 ICNS/JXL/HEIF 파서 문제는 현재 앱의 사용자가 올리는 사진 경로와 연결되어 있지 않습니다. 업로드는 JPG만 처리하고 신뢰하는 저장소 SVG 아이콘만 메타데이터로 사용합니다. 단순히 경고를 숨기기 위한 큰 버전 하향·프레임워크 번들링 변경은 하지 않았습니다. 공개 운영 전 upstream 패치 여부를 다시 확인해야 합니다.

관련 근거: https://github.com/react/react/security/advisories/GHSA-wx67-qw84-cm4g, https://github.com/vitejs/vite/security/advisories/GHSA-fx2h-pf6j-xcff, https://github.com/advisories/GHSA-w3rx-r6r6-pgpr, https://github.com/advisories/GHSA-5p2g-fcmc-qvqq
