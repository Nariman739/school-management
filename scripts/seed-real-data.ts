/**
 * Загрузка реальных данных Дархана из XLSX файлов
 *
 * Запуск: node scripts/seed-real-data.mjs
 *
 * Файлы: data/teachers.xlsx, data/students.xlsx, data/groups.xlsx
 */

import XLSX from 'xlsx';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { resolve } from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: resolve(__dirname, '..', '.env') });

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// === Helpers ===

function parseRate(val: any): number {
  if (val === null || val === undefined || val === '') return 0;
  const s = String(val).trim();
  // Если диапазон "1500-2000", вернуть первое число
  if (s.includes('-')) {
    const parts = s.split('-').map(p => parseInt(p.trim(), 10)).filter(n => !isNaN(n));
    return parts[0] || 0;
  }
  return parseInt(s, 10) || 0;
}

function parseRateHigh(val: any): number {
  if (val === null || val === undefined || val === '') return 0;
  const s = String(val).trim();
  // Если диапазон "1500-2000", вернуть последнее число
  if (s.includes('-')) {
    const parts = s.split('-').map(p => parseInt(p.trim(), 10)).filter(n => !isNaN(n));
    return parts[parts.length - 1] || 0;
  }
  return parseInt(s, 10) || 0;
}

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  return {
    lastName: parts[0] || '',
    firstName: parts[1] || '',
    patronymic: parts[2] || null,
  };
}

// === Step 1: Clear all data ===

async function clearData() {
  console.log('\n🗑️  Очистка существующих данных...');
  await prisma.attendance.deleteMany();
  await prisma.methodistCheck.deleteMany();
  await prisma.scheduleSlot.deleteMany();
  await prisma.groupMember.deleteMany();
  await prisma.group.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.nameAlias.deleteMany();
  await prisma.student.deleteMany();
  await prisma.teacher.deleteMany();
  console.log('   ✅ Все данные удалены');
}

// === Step 2: Seed teachers ===

async function seedTeachers() {
  console.log('\n👨‍🏫 Загрузка педагогов...');
  const wb = XLSX.readFile(resolve(__dirname, '..', 'data', 'teachers.xlsx'));
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

  // Row 0 = headers, rows 1-35 = data
  const teachers = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row[0] || typeof row[0] !== 'string' || row[0].length < 3) continue;

    const fullName = row[0].trim();
    // Пропускаем мусор типа "им"
    if (fullName.length < 4) continue;

    const { lastName, firstName, patronymic } = splitName(fullName);
    const individualRate = parseRate(row[1]);
    const accompanimentRate = parseRate(row[2]);
    const groupRateRaw = row[3];
    const groupRate = parseRate(groupRateRaw);
    const groupRate3 = parseRateHigh(groupRateRaw); // высокая граница диапазона
    const pairRate = parseRate(row[4]);
    const morningBonusRate = parseRate(row[5]);
    const eveningBonusRate = parseRate(row[6]);
    const behavioralBonus = parseRate(row[7]);
    const saturdayRate = parseRate(row[8]);
    const methodRate = parseRate(row[9]);

    const teacher = await prisma.teacher.create({
      data: {
        lastName,
        firstName,
        patronymic,
        individualRate,
        accompanimentRate,
        groupRate,
        groupRate3: groupRate3 !== groupRate ? groupRate3 : 0, // если не диапазон, 0
        groupRate5: 0,
        assistantRate: accompanimentRate, // ассистент = сопровождение
        pairRate,
        saturdayRate,
        morningBonusRate,
        eveningBonusRate,
        behavioralBonus,
        isMethodist: methodRate > 0,
        methodistWeeklyRate: methodRate,
        methodistDailyRate: methodRate > 0 ? Math.round(methodRate / 5) : 0,
      },
    });

    teachers.push(teacher);
    console.log(`   ✅ ${lastName} ${firstName} — инд:${individualRate}, сопр:${accompanimentRate}, гр:${groupRate}${groupRate3 !== groupRate ? `-${groupRate3}` : ''}`);
  }

  console.log(`\n   📊 Итого педагогов: ${teachers.length}`);
  return teachers;
}

// === Step 3: Seed students ===

async function seedStudents() {
  console.log('\n👦 Загрузка учеников...');
  const wb = XLSX.readFile(resolve(__dirname, '..', 'data', 'students.xlsx'));

  const students = [];
  const studentMap = new Map(); // firstName -> student (для групп)

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

    console.log(`\n   📋 Вкладка "${sheetName}":`);

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      // Колонка 1 = ФИО (колонка 0 = №)
      const name = row[1];
      if (!name || typeof name !== 'string' || name.trim().length < 2) continue;

      let cleanName = name.trim();
      // Убираем пометки в скобках: "Бакибай Санжар (пт/сб)" -> "Бакибай Санжар"
      cleanName = cleanName.replace(/\s*\(.*?\)\s*$/, '').trim();

      const parts = cleanName.split(/\s+/);
      const lastName = parts[0] || '';
      const firstName = parts[1] || '';

      if (!lastName || !firstName) continue;

      const student = await prisma.student.create({
        data: {
          lastName,
          firstName,
          scheduleType: sheetName,
          hourlyRate: 0,
        },
      });

      students.push(student);

      // Сохраняем в map для поиска по имени (для групп)
      // Если имя уже есть — не перезаписываем, дубликаты будут искаться позже
      if (!studentMap.has(firstName)) {
        studentMap.set(firstName, student);
      }

      console.log(`      ${lastName} ${firstName} → ${sheetName}`);
    }
  }

  console.log(`\n   📊 Итого учеников: ${students.length}`);
  return { students, studentMap };
}

// === Step 4: Seed groups ===

async function seedGroups(teachers: any[], studentMap: Map<string, any>) {
  console.log('\n👥 Загрузка групп...');
  const wb = XLSX.readFile(resolve(__dirname, '..', 'data', 'groups.xlsx'));
  const ws = wb.Sheets['дети'];
  if (!ws) {
    console.log('   ❌ Лист "дети" не найден!');
    return;
  }

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

  // Нижняя таблица начинается с row 24 (строка с заголовками групп)
  // Row 24: ["МНО", "грМ0 утро", "грМ1 утро", "грреч1 вечер...", ...]
  // Rows 25+: имена учеников по колонкам

  const headerRow = rows[24];
  if (!headerRow) {
    console.log('   ❌ Не найдена таблица составов групп (строка 24)');
    return;
  }

  // Первый доступный учитель (для групп без точного соответствия)
  const defaultTeacher = teachers[0];
  const groups = [];

  // Парсим каждую колонку как группу
  for (let col = 0; col < headerRow.length; col++) {
    const groupName = headerRow[col];
    if (!groupName || typeof groupName !== 'string') continue;

    const cleanName = groupName.trim();
    if (!cleanName || cleanName === 'МНО') continue; // первая колонка = МНО (тип, не группа)

    // Собираем учеников из этой колонки
    const memberNames = [];
    for (let row = 25; row < rows.length; row++) {
      const cellValue = rows[row]?.[col];
      if (!cellValue || typeof cellValue !== 'string') continue;

      let studentName = cellValue.trim();
      // Убираем пометки: "Алан ежд. 10.00", "Амре 20 мин", "Самир в 10:00"
      studentName = studentName.replace(/\s+(ежд\.|на\s+\d+|в\s+\d+|втчт|\d+\.\d+|на|мин|ср|пт|пн).*$/i, '').trim();
      // Убираем суффиксы: "Алинурнов пнсрпт" -> "Алинурнов"... но это может быть часть имени
      // Убираем "нов" суффикс: "Адельнов" — это видимо новенький

      if (studentName.length >= 2) {
        memberNames.push(studentName);
      }
    }

    if (memberNames.length === 0) continue;

    // Матчим учеников по имени
    const matchedStudents = [];
    const unmatchedNames = [];

    for (const name of memberNames) {
      // Ищем точное совпадение по firstName
      const student = studentMap.get(name);
      if (student) {
        matchedStudents.push(student);
      } else {
        // Пробуем частичное совпадение
        let found = false;
        for (const [key, s] of studentMap) {
          if (key.startsWith(name) || name.startsWith(key)) {
            matchedStudents.push(s);
            found = true;
            break;
          }
        }
        if (!found) {
          unmatchedNames.push(name);
        }
      }
    }

    // Создаём группу
    const group = await prisma.group.create({
      data: {
        name: cleanName,
        teacherId: defaultTeacher.id,
      },
    });

    // Добавляем участников
    for (const student of matchedStudents) {
      try {
        await prisma.groupMember.create({
          data: {
            groupId: group.id,
            studentId: student.id,
          },
        });
      } catch (e) {
        // Дубликат — пропускаем
      }
    }

    groups.push(group);
    console.log(`   ✅ ${cleanName}: ${matchedStudents.length} уч.${unmatchedNames.length > 0 ? ` (не найдены: ${unmatchedNames.join(', ')})` : ''}`);
  }

  // Также создаём группы из верхней таблицы (row 0-21) которые не попали в нижнюю
  const upperGroups = [];
  for (let i = 0; i <= 21; i++) {
    const row = rows[i];
    if (!row || !row[0] || typeof row[0] !== 'string') continue;
    const name = row[0].trim();
    if (name.length < 2) continue;
    // Проверяем что такая группа ещё не создана
    const exists = groups.find(g => g.name.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(g.name.toLowerCase()));
    if (!exists) {
      upperGroups.push(name);
    }
  }

  for (const name of upperGroups) {
    // Некоторые из верхней таблицы уже созданы. Создаём только уникальные.
    const existing = groups.find(g => g.name === name);
    if (!existing) {
      const group = await prisma.group.create({
        data: {
          name,
          teacherId: defaultTeacher.id,
        },
      });
      groups.push(group);
      console.log(`   ✅ ${name}: (без участников, из верхней таблицы)`);
    }
  }

  console.log(`\n   📊 Итого групп: ${groups.length}`);
  return groups;
}

// === Main ===

async function main() {
  console.log('🏫 School Management — Загрузка реальных данных Дархана');
  console.log('=========================================================');

  await clearData();
  const teachers = await seedTeachers();
  const { students, studentMap } = await seedStudents();
  await seedGroups(teachers, studentMap);

  console.log('\n=========================================================');
  console.log('✅ Загрузка завершена!');
  console.log(`   Педагоги: ${teachers.length}`);
  console.log(`   Ученики: ${students.length}`);
  console.log('\n⚠️  Учителя привязаны к группам по умолчанию (первый педагог).');
  console.log('   Нужно вручную назначить правильных учителей через UI.');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('❌ Ошибка:', e);
  prisma.$disconnect();
  process.exit(1);
});
