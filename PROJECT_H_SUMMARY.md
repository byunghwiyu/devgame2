# Project H 통합 요약

기준일: 2026-02-22  
대상: `C:\dev\Project H`

## 1) 프로젝트 한 줄 요약
Project H는 인력사무소 테마의 웹 기반 운영 RPG 수직 슬라이스(Vertical Slice)로, `Recruit / Office / Field / Craft` 4개 루프를 중심으로 성장-파견-전투-제작을 반복하는 구조다.

## 2) 기술 스택
- Frontend: React 18 + TypeScript + Vite + Zustand
- Backend: Node.js + Fastify + TypeScript
- DB/ORM: PostgreSQL + Prisma
- 인증: Fastify JWT (게스트/계정 인증 흐름)
- 모노레포: npm workspaces (`frontend`, `backend`)

## 3) 디렉터리 구조
- `backend/src`
  - `routes`: API 엔드포인트
  - `services`: 게임 로직(전투/성장/보상)
  - `data/registry.ts`: CSV 테이블 로드/검증/조회
  - `plugins`: auth, prisma
- `backend/prisma`
  - `schema.prisma`: DB 모델 정의
  - `seed.ts`: 초기 데이터 시드
- `frontend/src`
  - `App.tsx`: 메인 UI/게임 플로우
  - `api.ts`: API 클라이언트
  - `types.ts`: API/도메인 타입
  - `styles.css`: 전체 UI 스타일
- `data`
  - 캐릭터/전투/필드/드랍/제작/성장 관련 CSV 마스터 테이블

## 4) 핵심 게임 루프(구현 관점)
1. Recruit
- 오퍼 슬롯 기반 캐릭터 제안
- 채용 비용(크레딧) 소모 후 용병 획득
- 리롤로 오퍼 갱신

2. Office
- 보유 용병 조회/정렬
- 장비 장착/교체
- 승급(프로모션) 진행/완료

3. Field
- 팀 편성 후 필드 파견
- 전투 세션 목록/진행/리포트
- 동시 다중 세션 구조 지원(보유 캐릭터가 충분한 경우)

4. Craft
- 레시피 기반 제작 시작
- 제작 대기열 상태 확인
- 완료 보상(장비) 수령

## 5) 전투 시스템 요약(현재 코드 기준)
- 전투 세션 단위 상태 관리(`backend/src/services/battle.ts`)
- 단계(phase): `EXPLORE -> BATTLE -> LOOT`
- 스테이지 타입: `BATTLE / EXPLORE / HIDDEN / BOSS`
- 진행 규칙: 액션 단위 턴 처리(`actionTurn`), 게이지 기반 틱 업데이트
- 전투 연출 데이터: `combatEvents` + 로그 + 드랍 스택
- 전투 결과 리포트: 클리어/패배/경험치/크레딧/재화/처치 수 등 집계

## 6) SD 스프라이트 연동 현황
- 현재 타입/전투 뷰에 스프라이트 메타 필드가 연결되어 있음
- 리소스 루트
  - 아군: `frontend/public/assets/sprites/mercs`
  - 몬스터: `frontend/public/assets/sprites/monsters`
- 권장 운영 방식
  - 파일명 기반 참조(절대 경로 대신)
  - PNG(투명 배경) 사용
  - SD는 보통 `idle 4~6f`, `attack 6~8f` 권장

## 7) 백엔드 API(주요 엔드포인트)
- 인증/프로필
  - `POST /auth/guest`
  - `GET /profile`
  - `POST /profile/cheat-credits`
- 오퍼/채용
  - `GET /offers`
  - `POST /offers/reroll`
  - `POST /recruit`
- 캐릭터/장비/성장
  - `GET /mercenaries`
  - `GET /equipments`
  - `GET /promotion/status`
- 필드/전투
  - `GET /locations`
  - `GET /battle/config`
  - `GET /battle/current`
  - `GET /battle/list`
  - `GET /battle/state`
  - `POST /battle/start`
  - `POST /battle/retreat`
  - `POST /battle/close`
- 파견/제작
  - `GET /dispatch/status`
  - `GET /recipes`
  - `GET /craft/status`

## 8) DB 모델(Prisma)
- `User`
- `Mercenary`
- `Equipment`
- `Dispatch`
- `CraftJob`
- `Offer`
- `PromotionJob`

## 9) CSV 테이블(게임 밸런스/콘텐츠)
- `characters.csv`
- `talents.csv`
- `combat_units.csv`
- `combat_skills.csv`
- `locations.csv`
- `location_waves.csv`
- `field_stage_rules.csv`
- `field_stage_encounters.csv`
- `monster_drops.csv`
- `recipes.csv`
- `level_curve.csv`
- `office_level.csv`
- `promotion_rules.csv`
- `define_table.csv`
- `explore_texts.csv`

## 10) 실행 방법
루트 기준:
```bash
npm install
npm run dev
```
빌드:
```bash
npm run build
```

## 11) 현재 작업 시 주의사항
- CSV가 실질적인 밸런스/콘텐츠 소스라서 컬럼 변경 시 `backend/src/data/registry.ts` 파서와 함께 수정 필요
- 이미지 경로는 절대경로보다 파일명 참조로 통일하는 편이 운영 안정성이 높음
- 프론트가 정적 캐시로 서빙될 때는 최신 빌드 산출물 반영 여부를 항상 확인

## 12) 다음 추천 정리 작업
1. 스프라이트 스키마를 최종 1안으로 고정(분리 시트 vs 단일 시트)
2. `combat_units.csv` 헤더 규격 문서화
3. 전투 연출 QA 체크리스트(이벤트 발생/팝업/턴 증가/세션 종료) 문서 추가
4. 운영용 관리자 치트/리셋 API 범위 확정
