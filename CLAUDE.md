# school-management

ERP для коррекционного центра (~30 педагогов), клиент Дархан.

## Stack
- Next.js 16, React 19, TypeScript, Tailwind v4, shadcn/ui
- Prisma 7 + Neon PostgreSQL (PrismaNeonHttp)

## Commands
```bash
npm run dev        # Dev server
npm run build      # prisma generate + next build
npx prisma generate  # After schema changes
npx prisma db push   # Push schema to Neon
```

## Architecture
- `src/app/api/` — 18+ REST routes (attendance, payments, schedule, teachers, groups, students, reports)
- `src/app/` — Pages: attendance, groups, payments, schedule, students, teachers, reports
- `src/lib/import-utils.ts` — Google Sheets import (v1 + v2 форматы)
- `src/lib/schedule-utils.ts` — Schedule helpers
- `src/generated/prisma/` — Generated Prisma client (**committed to repo**)
- Path alias: `@/*` → `./src/*`

## Key Models
- **Teacher**: ставки (индив, группа×3), бонусы (за время/поведение), методист
- **Student**: контакт родителя, почасовая ставка, поведенческий флаг
- **Group**: тип (ГРМ, М0, М1...), привязка к учителю
- **ScheduleSlot**: день + время, категория (А/И/Тех/СОПР/Метод)
- **Attendance**: статус (ATTENDED/SICK/LATE/ABSENT), замены, ассистенты
- **Payment**: оплата родителей

## Key Rules
- **Import flow**: `/schedule/import` → preview → `/schedule/import/confirm`
- **3 статуса посещаемости**: присутствовал, болеет, отсутствует (+ опоздал)
- **Замены учителей**: tracked в Attendance
- **tsconfig target**: ES2017
