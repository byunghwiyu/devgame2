# 인력 사무소 - Web Vertical Slice

## 구조
- `frontend`: React + TypeScript + Vite + Zustand
- `backend`: Node.js + Fastify + Prisma + PostgreSQL + JWT Guest Auth

## 실행
1. 의존성 설치
```bash
npm install
```

2. 환경변수
- 루트 `.env.example`를 참고해 `backend/.env`, `frontend/.env` 작성

3. DB 마이그레이션 + 시드
```bash
cd backend
npx prisma migrate dev --name init
npm run seed
```

4. 개발 서버(루트)
```bash
cd ..
npm run dev
```

- FE: http://localhost:5173
- BE: http://localhost:4000
- Health: GET http://localhost:4000/health

## Sprint 1 구현 범위
- Foundation 초기화(폴더 분리, env 예시, README)
- Prisma 스키마 + 마이그레이션 대상 테이블 + seed
- Guest Auth (`POST /auth/guest`, `GET /profile`)
- 오프라인 보상(8시간 cap, 서버시간 기준)

## API
### POST /auth/guest
게스트 유저 생성 + JWT 반환

### GET /profile
인증 필요. 오프라인 보상 지급 후 프로필 반환

응답 예시:
```json
{
  "ok": true,
  "data": {
    "user": {
      "id": "...",
      "credits": 4600,
      "materialA": 0,
      "materialB": 0,
      "lastLoginAt": "2026-01-01T00:00:00.000Z"
    },
    "offlineReward": {
      "elapsedAppliedSeconds": 3600,
      "rewardGranted": 3600,
      "baseRatePerSec": 1
    }
  }
}
```
