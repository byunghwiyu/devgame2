# Project H (Web Vertical Slice)

기준일: 2026-02-24
기준 커밋: 696c339

Project H는 인력사무소 테마의 웹 기반 운영 RPG 수직 슬라이스입니다.
핵심 루프는 Recruit -> Office -> Field -> Craft 입니다.

## 기술 스택
- Frontend: React 18, TypeScript, Vite, Zustand
- Backend: Node.js, Fastify, TypeScript
- DB/ORM: PostgreSQL, Prisma
- Auth: JWT (POST /auth/signup, POST /auth/login, POST /auth/guest)
- Monorepo: npm workspaces (frontend, backend)

## 폴더 구조
- frontend: UI, 전투 연출, API 클라이언트
- backend: 라우트, 게임/전투 서비스, Prisma
- data: 밸런스/콘텐츠 CSV
- PROJECT_H_SUMMARY.md: 최신 구현/시스템 상세 문서

## 현재 구현 기능
- Recruit: 오퍼 조회, 리롤, 채용
- Office: 용병 관리, 장비 장착/해제, 승급 진행
- Field: 지역/웨이브 진행, 전투 세션 시작/목록/진입, 리포트
- Craft: 레시피 조회, 제작 시작/완료 수령

## 전투 시스템 요약
- 턴제 자동전투
- 플레이어 팀 vs 몬스터 팀 2그룹
- 팀 평균 민첩(agility) 비교로 선공 결정
- 1턴당 1유닛 행동, 이후 진영 교대
- EXPLORE -> BATTLE -> LOOT phase 진행
- Pause/Resume 지원 (POST /battle/pause)

## 실행 방법
1. 의존성 설치
   npm install

2. 환경 변수 설정
- .env.example 참고 후 backend/.env, frontend/.env 작성

3. DB 준비
   cd backend
   npx prisma migrate dev --name init
   npm run seed

4. 개발 서버 실행
   cd ..
   npm run dev

- FE: http://localhost:5173
- BE: http://localhost:4000
- Health: GET /health

## 주요 API
- Auth: POST /auth/signup, POST /auth/login, POST /auth/guest
- Profile: GET /profile, POST /profile/cheat-credits
- Offers/Recruit: GET /offers, POST /offers/reroll, POST /recruit
- Mercenary/Equipment/Promotion:
  GET /mercenaries, GET /equipments, POST /equip, POST /unequip,
  POST /promotion/start, GET /promotion/status, POST /promotion/claim
- Location/Dispatch:
  GET /locations, POST /dispatch/start, GET /dispatch/status, POST /dispatch/claim
- Battle:
  GET /battle/config, GET /battle/current, GET /battle/list, GET /battle/state,
  POST /battle/start, POST /battle/pause, POST /battle/action,
  POST /battle/retreat, POST /battle/close, GET /battle/report/:sessionId
- Craft: GET /craft/recipes, POST /craft/start, GET /craft/status, POST /craft/claim

## 문서 안내
- 전체 최신 스펙, CSV 목록, 운영 이슈 대응은 PROJECT_H_SUMMARY.md를 기준으로 확인합니다.
