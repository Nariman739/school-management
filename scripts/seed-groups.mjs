// Seed script — добавление 12 групп из расписания клиента
const BASE = process.env.SEED_URL || "https://school-management-v7xh.vercel.app/api";

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    console.error(`  FAIL GET ${path}:`, await res.text());
    return null;
  }
  return res.json();
}

async function post(path, data) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error(`  FAIL POST ${path}:`, err);
    return null;
  }
  return res.json();
}

// 12 групп из таблицы расписания клиента
const groupNames = [
  "М0",
  "М1",
  "МНО ОНР",
  "МНО ОНР2",
  "шк1",
  "шк2",
  "шк3",
  "реч1",
  "реч2",
  "реч3",
  "МНО",
  "шк1 АФК",
];

async function main() {
  console.log("=== Добавление групп из расписания ===\n");

  // 1. Получаем существующие группы
  const existingGroups = await get("/groups");
  if (!existingGroups) {
    console.error("Не удалось получить список групп");
    return;
  }
  const existingNames = new Set(existingGroups.map((g) => g.name.toLowerCase()));
  console.log(`Существующие группы (${existingGroups.length}):`, existingGroups.map((g) => g.name).join(", ") || "(нет)");

  // 2. Получаем первого учителя как дефолтного "владельца" группы
  const teachers = await get("/teachers");
  if (!teachers || teachers.length === 0) {
    console.error("Нет учителей в БД — невозможно создать группу (teacherId обязателен)");
    return;
  }
  const defaultTeacher = teachers[0];
  console.log(`Дефолтный учитель для групп: ${defaultTeacher.lastName} ${defaultTeacher.firstName} (${defaultTeacher.id})\n`);

  // 3. Создаём недостающие группы
  let created = 0;
  let skipped = 0;
  for (const name of groupNames) {
    if (existingNames.has(name.toLowerCase())) {
      console.log(`  ⏭ "${name}" — уже существует`);
      skipped++;
      continue;
    }
    const res = await post("/groups", { name, teacherId: defaultTeacher.id });
    if (res) {
      console.log(`  ✅ "${name}" — создана (id: ${res.id})`);
      created++;
    }
  }

  console.log(`\n=== Готово! ===`);
  console.log(`Создано: ${created}`);
  console.log(`Пропущено (уже были): ${skipped}`);
  console.log(`Всего групп теперь: ${existingGroups.length + created}`);
}

main().catch(console.error);
