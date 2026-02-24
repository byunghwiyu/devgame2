# Project H 통합 요약 (최신 버전)

기준일: 2026-02-24  
기준 커밋: `696c339`  
대상 경로: `C:\dev\Project H`

## 1) 프로젝트 개요
Project H는 인력사무소 테마의 웹 기반 운영 RPG 수직 슬라이스(Vertical Slice)입니다. 핵심 루프는 `Recruit / Office / Field / Craft`이며, 유저는 채용-육성-전투-보상 순환을 반복합니다.

## 2) 기술 스택
- Frontend: React 18, TypeScript, Vite, Zustand
- Backend: Node.js, Fastify, TypeScript
- DB/ORM: PostgreSQL, Prisma
- Auth: JWT (계정 로그인/회원가입 + 게스트)
- Repo: npm workspaces (`frontend`, `backend`)

## 3) 디렉터리 구조
- `backend/src`
  - `routes`: API 엔드포인트
  - `services`: 전투/게임 로직
  - `data/registry.ts`: CSV 로드/검증/조회
  - `plugins`: auth, prisma
- `backend/prisma`
  - `schema.prisma`, `seed.ts`
- `frontend/src`
  - `App.tsx`: 메인 UI/전투 UI/팝업 연출
  - `api.ts`: API 클라이언트
  - `types.ts`: 타입 정의
  - `styles.css`: UI 스타일
- `data`
  - 밸런스/콘텐츠 CSV
- `frontend/public/assets`
  - 일러스트/스프라이트/atlas

## 4) 구현 기능 요약
### Recruit
- 오퍼 슬롯 기반 제안 목록 조회
- 리롤(크레딧 소모)
- 채용 후 용병 생성 및 슬롯 갱신
- 오퍼에 탤런트 프리뷰 표시

### Office
- 용병 목록 조회(전투력/탤런트/성장정보)
- 장비 장착/해제
- 승급 시작/상태 조회/완료

### Field
- 지역 목록/개방 상태 조회
- 팀 편성 후 전투 세션 시작
- 다중 전투 세션 목록 조회 및 개별 진입
- 전투 `Pause/Resume` 지원
- Retreat/Close 및 리포트 확인

### Craft
- 레시피 조회
- 제작 시작/상태 조회/완료 수령
- 제작 결과 장비 생성

## 5) 전투 시스템 (현재 코드)
- 세션 단위 상태 관리 (`backend/src/services/battle.ts`)
- Phase: `EXPLORE -> BATTLE -> LOOT`
- Stage Type: `BATTLE / EXPLORE / HIDDEN / BOSS`
- 턴 규칙
  - 팀 평균 민첩(agility) 비교로 선공 결정
  - 턴마다 1유닛만 행동
  - `ALLY <-> ENEMY` 교대 진행
- 스킬 처리
  - passive: 스탯 보정
  - active: 단일/광역/치유 로직
- 보상
  - 스테이지 보상(크레딧/재화/경험치)
  - 몬스터 드랍 장비
  - 리포트 통계(클리어/리트라이/킬/초당 경험치 등)
- 전투 제어
  - `paused` 상태로 진행 정지/재개

## 6) 프론트 전투 연출 시스템
- `combatEvents` 기반 팝업/FX 우선 처리
- fallback(HP diff), log 기반 보정 경로 존재
- 최신 반영 사항
  - dead 유닛 연출 제한
  - 팝업 렌더 매칭을 `unitId` 기준으로 고정
  - 팝업 디버그 콘솔 로그 추가 (`[battle-popup] ...`, DEV 환경)

## 7) API 엔드포인트 (최신)
### Auth
- `POST /auth/signup`
- `POST /auth/login`
- `POST /auth/guest`

### Profile
- `GET /profile`
- `POST /profile/cheat-credits`

### Offers / Recruit
- `GET /offers`
- `POST /offers/reroll`
- `POST /recruit`

### Mercenary / Equipment / Promotion
- `GET /mercenaries`
- `GET /equipments`
- `POST /equip`
- `POST /unequip`
- `POST /promotion/start`
- `GET /promotion/status`
- `POST /promotion/claim`

### Location / Dispatch
- `GET /locations`
- `POST /dispatch/start`
- `GET /dispatch/status`
- `POST /dispatch/claim`

### Battle
- `GET /battle/config`
- `GET /battle/current`
- `GET /battle/list`
- `GET /battle/state`
- `POST /battle/start`
- `POST /battle/pause`
- `POST /battle/retreat`
- `POST /battle/close`

### Craft
- `GET /recipes`
- `POST /craft/start`
- `GET /craft/status`
- `POST /craft/claim`

## 8) CSV 테이블 (최신)
- `characters.csv`
- `combat_skills.csv`
- `combat_units.csv`
- `define_table.csv`
- `field_stage_encounters.csv`
- `field_stage_rules.csv`
- `level_curve.csv`
- `location_waves.csv`
- `locations.csv`
- `monster_drops.csv`
- `office_level.csv`
- `promotion_rules.csv`
- `recipes.csv`
- `talents.csv`

## 9) 실행 / 배포 체크포인트
### 개발
```bash
npm install
npm run dev
```
- FE: `http://localhost:5173`
- BE: `http://localhost:4000`
- Health: `GET /health`

### 빌드
```bash
npm run build
```

### 정적 서빙 시 주의
- `frontend/dist`를 서빙하는 경우, 코드 수정 후 반드시 `frontend` 재빌드 필요
- 브라우저 강력 새로고침(`Ctrl+F5`) 또는 캐시 무효화 필요

## 10) 현재 운영 이슈 대응 포인트
- 전투 연출 이슈 재현 시 DEV 콘솔에서 `[battle-popup]` 로그로 이벤트 경로 확인
- 전투 진행 제어는 `Pause/Resume` 버튼 또는 `/battle/pause` API로 즉시 제어 가능
- CSV 컬럼 변경 시 `backend/src/data/registry.ts`와 함께 동기화 필요
