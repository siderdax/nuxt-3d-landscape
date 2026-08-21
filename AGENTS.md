# AGENTS.md

## 작업 규칙
- 3단계 이상의 작업에서는 매 단계 완료 시마다 todo 목록(todowrite)을 반드시 업데이트한다.
- 변경 후 검증: `node --check <파일>` → `npm run build` 통과 필수.
- 커밋 스타일: `feat: <씬> detail pass - ...` (씬 단위 1커밋, 푸시는 요청 시에만).

## 씬 디테일 패스 패턴 (app/composables/use*Scene.js)
- 씬은 싱글 파일 Three.js composable: 상수/지형 함수 → 헬퍼 → 캔버스 텍스처 → 셰이더 → 동물/구조물 빌더 → `use*Scene()` (init → animation → dispose).
- 텍스처는 전부 canvas 생성 (`make*Texture()` 파일 상단 함수, 외부 에셋 금지).
- 모든 CanvasTexture는 `texAssets`에 push하고 `dispose()`에서 처리.
- 텍스처: `colorSpace = SRGBColorSpace`, `anisotropy 4~8`, 타일 텍스처는 `RepeatWrapping` (세무스: ±size 오프셋으로 9회 드로).
- InstancedMesh는 배치 후 `count = placed` + `instanceMatrix.needsUpdate` (identity matrix 잔존 인스턴스 방지).
- 동물은 +X 방향 빌드, `legs` 배열로 걷기 애니메이션, `faceToward`로 yaw 보간.
- 동물 몸통은 **캡슐/스피어 붙이지 않기** — `makeLoft(sections, seg)` 횡단면 로프트로 몸통+목+머리를 단일 메시로. 작은 액센트(귀/눈/코/발굽)만 별도.
- 씬 목록: ocean / city / space / landscape(useScene) / arctic. 완료된 디테일 패스: ocean, city, space.
