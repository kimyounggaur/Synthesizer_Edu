# Tier 1 공식 소스 실측 상태

확인일: 2026-09-09. `SynthCoachBot/1.0` 식별 방식으로 robots와 대표 지원/자산 URL을 확인했다. 자세한 allowlist와 셀렉터는 `sources/*.yaml`이 단일 진실 원천이다.

| 제조사 | 공식 base / asset | robots·접근 결과 | 시작 상태 |
|---|---|---|---|
| Roland | `www.roland.com` / `static.roland.com` | 대표 지원·PDF 허용 | active |
| Korg | `www.korg.com` / `cdn.korg.com` | robots 404(빈 규칙), 공개 링크 확인 | active |
| Yamaha | `download.yamaha.com`, `usa.yamaha.com`, `jp.yamaha.com` / `data.yamaha.com` | robots가 403 | **blocked** |
| Arturia | `www.arturia.com` / `dl.arturia.net` | 공개 지원·PDF 확인 | active |
| Nord/Clavia | `www.nordkeyboards.com` | robots 허용, 동일 호스트 PDF | active |
| Novation | `downloads.novationmusic.com`, `userguides.novationmusic.com` / `fael-downloads-prod.focusrite.com` | 공개 경로 확인 | active |
| Behringer | `www.behringer.com` / `cdn-media.empowertribe.com` | 제품 HTML·공식 CDN 확인 | active |
| Casio | `www.casio.com`, `support.casio.com` | 주 제품 지원 페이지가 봇 UA에 403 | **blocked** |

## 실측 대표 링크

- Roland: [JUNO-DS61 지원](https://www.roland.com/global/support/by_product/juno-ds61/owners_manuals/), [공식 PDF](https://static.roland.com/assets/media/pdf/JUNO-DS_88_76_61_eng01_W.pdf)
- Korg: [phase8 다운로드](https://www.korg.com/us/support/download/product/0/1008/), [라이선스 페이지](https://www.korg.com/us/support/download/manual/0/1008/5655/)
- Yamaha: [MODX M 다운로드](https://usa.yamaha.com/products/music_production/synthesizers/modxm/downloads.html), [robots](https://download.yamaha.com/robots.txt)
- Arturia: [MiniFreak 다운로드](https://www.arturia.com/support/downloads-manuals/product/minifreak), [공식 PDF](https://dl.arturia.net/products/minifreak/manual/minifreak_Manual_4_0_1_EN.pdf)
- Nord: [Stage 4 다운로드](https://www.nordkeyboards.com/products/nord-stage-4/downloads/)
- Novation: [Peak 다운로드](https://downloads.novationmusic.com/novation/synthesisers/peak), [웹 가이드](https://userguides.novationmusic.com/hc/en-gb/sections/25494651062546-Peak-User-Guide)
- Behringer: [MODEL D 제품](https://www.behringer.com/en/products/0718-AAC)
- Casio: [CT-X5000 지원](https://www.casio.com/intl/electronic-musical-instruments/support.CT-X5000/)

문서 초안의 `downloads.arturia.net`과 `mediadl.musictribe.com`은 현재 실측값이 아니므로 사용하지 않는다. 각각 `dl.arturia.net`, `cdn-media.empowertribe.com`으로 교정했다.
