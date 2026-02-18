// Seed script — заполнение расписания на текущую неделю
const BASE = process.env.SEED_URL || "https://school-management-v7xh.vercel.app/api";

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
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
    console.error(`  FAIL ${path}:`, err.slice(0, 120));
    return null;
  }
  return res.json();
}

// Получить понедельник текущей недели
function getMonday() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split("T")[0];
}

async function main() {
  console.log("=== Заполнение расписания ===\n");

  const weekStart = getMonday();
  console.log(`Неделя: ${weekStart}\n`);

  // Загружаем учителей и учеников
  const teachers = await get("/teachers");
  const students = await get("/students");
  console.log(`Учителей: ${teachers.length}, Учеников: ${students.length}\n`);

  // Строим маппинг по фамилии
  const tByName = {};
  for (const t of teachers) tByName[t.lastName] = t;
  const sByName = {};
  for (const s of students) sByName[`${s.lastName} ${s.firstName}`] = s;
  const sById = (name) => sByName[name]?.id;
  const tById = (name) => tByName[name]?.id;

  // ============================================================
  // РАСПИСАНИЕ ПН/СР/ПТ (дни 1, 3, 5)
  // Каждый элемент: [фамилия учителя, время, тип, ученик/описание, категория]
  // ============================================================
  const mwfSlots = [
    // --- Малыга Дарья (Каб.1) ---
    ["Малыга", "09:00", "INDIVIDUAL", "Саурбаев Марк", "И"],
    ["Малыга", "10:00", "INDIVIDUAL", "Талгатбек Асанали", "И"],
    ["Малыга", "11:00", "INDIVIDUAL", "Жумагельды Алинур", "И"],
    ["Малыга", "12:00", "INDIVIDUAL", "Амиров Али", "А"],
    ["Малыга", "13:00", "METOD", null, "Метод"],
    ["Малыга", "14:00", "INDIVIDUAL", "Кушнир Александр", "И"],
    ["Малыга", "15:00", "INDIVIDUAL", "Самат Алдияр", "А"],
    ["Малыга", "16:00", "INDIVIDUAL", "Мергалин Тамерлан", "И"],

    // --- Спивакова Полина (Каб.2) ---
    ["Спивакова", "09:00", "INDIVIDUAL", "Адильулы Аскар", "И"],
    ["Спивакова", "10:00", "INDIVIDUAL", "Айтикенова Адель", "А"],
    ["Спивакова", "11:00", "INDIVIDUAL", "Арыстанов Ерхан", "И"],
    ["Спивакова", "12:00", "METOD", null, "Метод"],
    ["Спивакова", "13:00", "INDIVIDUAL", "Ахметжанов Алимхан", "А"],
    ["Спивакова", "14:00", "INDIVIDUAL", "Бежанов Ахмад", "И"],
    ["Спивакова", "15:00", "INDIVIDUAL", "Богбай Хамза", "Тех"],

    // --- Берсанова Зарема (Каб.3) ---
    ["Берсанова", "09:00", "INDIVIDUAL", "Дюсекеев Айбар", "И"],
    ["Берсанова", "10:00", "INDIVIDUAL", "Ержанулы Ерлар", "А"],
    ["Берсанова", "11:00", "INDIVIDUAL", "Жанболат Айсултан", "И"],
    ["Берсанова", "12:00", "INDIVIDUAL", "Жарылгапов Самир", "А"],
    ["Берсанова", "13:00", "METOD", null, "Метод"],
    ["Берсанова", "14:00", "INDIVIDUAL", "Бакенова Айым", "И"],
    ["Берсанова", "15:00", "INDIVIDUAL", "Игликов Таир", "Тех"],
    ["Берсанова", "16:00", "INDIVIDUAL", "Илиатова Малика", "И"],

    // --- Жумабекова Рахима (Каб.4) ---
    ["Жумабекова", "09:00", "METOD", null, "Метод"],
    ["Жумабекова", "10:00", "INDIVIDUAL", "Аленова Каракат", "И"],
    ["Жумабекова", "11:00", "INDIVIDUAL", "Амангелди Аслан", "А"],
    ["Жумабекова", "12:00", "INDIVIDUAL", "Бейсханов Арлан", "И"],
    ["Жумабекова", "13:00", "INDIVIDUAL", "Капай Амирали", "А"],
    ["Жумабекова", "14:00", "INDIVIDUAL", "Карагаева Райана", "И"],
    ["Жумабекова", "15:00", "INDIVIDUAL", "Курмангалин Алихан", "Тех"],

    // --- Середа Оксана (Каб.5) ---
    ["Середа", "09:00", "INDIVIDUAL", "Калырбек Адель", "И"],
    ["Середа", "10:00", "INDIVIDUAL", "Кайролла Адильхан", "А"],
    ["Середа", "11:00", "INDIVIDUAL", "Левичева Ева", "И"],
    ["Середа", "12:00", "INDIVIDUAL", "Макарбек Жангирхан", "И"],
    ["Середа", "13:00", "INDIVIDUAL", "Мубарак Братислав", "А"],
    ["Середа", "14:00", "METOD", null, "Метод"],
    ["Середа", "15:00", "INDIVIDUAL", "Нургай Жангир", "И"],

    // --- Хитрик Дарья (Каб.6) ---
    ["Хитрик", "09:00", "INDIVIDUAL", "Жаскайрат Алуа", "И"],
    ["Хитрик", "10:00", "INDIVIDUAL", "Жаскайрат Улпан", "И"],
    ["Хитрик", "11:00", "INDIVIDUAL", "Багымбаева Алима", "А"],
    ["Хитрик", "12:00", "INDIVIDUAL", "Байгалова Айша", "И"],
    ["Хитрик", "13:00", "INDIVIDUAL", "Кумапилов Амирлан", "Тех"],
    ["Хитрик", "14:00", "INDIVIDUAL", "Жунусбеков Арнур", "А"],
    ["Хитрик", "15:00", "METOD", null, "Метод"],
    ["Хитрик", "16:00", "INDIVIDUAL", "Винокурова Амелия", "И"],

    // --- Кусаин Маржан (Спортзал) ---
    ["Кусаин", "10:00", "INDIVIDUAL", "Курмангалин Амирхан", "И"],
    ["Кусаин", "11:00", "INDIVIDUAL", "Лакашов Ислам", "СОПР"],
    ["Кусаин", "12:00", "INDIVIDUAL", "Тулеуов Субхан", "И"],
    ["Кусаин", "14:00", "INDIVIDUAL", "Этимади Эмир", "СОПР"],

    // --- Давыдова Евгения (Каб.7) ---
    ["Давыдова", "09:00", "INDIVIDUAL", "Айтуганова Самира", "И"],
    ["Давыдова", "10:00", "INDIVIDUAL", "Карагасенов Искандер", "А"],
    ["Давыдова", "11:00", "METOD", null, "Метод"],
    ["Давыдова", "12:00", "INDIVIDUAL", "Кунанбай Жансая", "И"],
    ["Давыдова", "13:00", "INDIVIDUAL", "Кушнаренко Милана", "А"],
    ["Давыдова", "14:00", "INDIVIDUAL", "Мостипан Артем", "И"],
    ["Давыдова", "15:00", "INDIVIDUAL", "Сагынтаев Азим", "Тех"],

    // --- Ануварбекова Амина (Каб.8) ---
    ["Ануварбекова", "10:00", "INDIVIDUAL", "Алдаберген Айару", "И"],
    ["Ануварбекова", "11:00", "INDIVIDUAL", "Аманова Мерей", "А"],
    ["Ануварбекова", "12:00", "INDIVIDUAL", "Ашимов Алихан", "И"],
    ["Ануварбекова", "13:00", "INDIVIDUAL", "Богбай Айла", "А"],
    ["Ануварбекова", "14:00", "INDIVIDUAL", "Диксуль Муслим", "И"],
    ["Ануварбекова", "15:00", "METOD", null, "Метод"],
    ["Ануварбекова", "16:00", "INDIVIDUAL", "Зыркын Ерлик", "Тех"],

    // --- Садвакас Динара ---
    ["Садвакас", "09:00", "INDIVIDUAL", "Исимова Айдана", "И"],
    ["Садвакас", "10:00", "INDIVIDUAL", "Исимова Айлана", "И"],
    ["Садвакас", "11:00", "INDIVIDUAL", "Саденов Ихсан", "А"],
    ["Садвакас", "12:00", "METOD", null, "Метод"],
    ["Садвакас", "13:00", "INDIVIDUAL", "Сагимбаев Самир", "И"],
  ];

  // ============================================================
  // РАСПИСАНИЕ ВТ/ЧТ (дни 2, 4)
  // ============================================================
  const ttSlots = [
    // --- Малыга Дарья ---
    ["Малыга", "09:00", "INDIVIDUAL", "Айнабек Муслим", "И"],
    ["Малыга", "10:00", "INDIVIDUAL", "Атыгай Алихан", "А"],
    ["Малыга", "11:00", "INDIVIDUAL", "Байплинов Назар", "И"],
    ["Малыга", "12:00", "INDIVIDUAL", "Болат Мади", "А"],
    ["Малыга", "13:00", "METOD", null, "Метод"],
    ["Малыга", "14:00", "INDIVIDUAL", "Камалиденов Ерали", "И"],
    ["Малыга", "15:00", "INDIVIDUAL", "Пантюхов Максим", "Тех"],

    // --- Спивакова Полина ---
    ["Спивакова", "09:00", "INDIVIDUAL", "Рыженков Тамерлан", "И"],
    ["Спивакова", "10:00", "INDIVIDUAL", "Сапар Диар", "А"],
    ["Спивакова", "11:00", "INDIVIDUAL", "Секара Ратмир", "И"],
    ["Спивакова", "12:00", "INDIVIDUAL", "Четкин Эмир", "А"],
    ["Спивакова", "13:00", "METOD", null, "Метод"],
    ["Спивакова", "14:00", "INDIVIDUAL", "Агеев Тихон", "И"],

    // --- Берсанова Зарема ---
    ["Берсанова", "09:00", "INDIVIDUAL", "Кумаров Айсултан", "И"],
    ["Берсанова", "10:00", "INDIVIDUAL", "Кобзев Дима", "А"],
    ["Берсанова", "11:00", "INDIVIDUAL", "Пантюхов Мирон", "И"],
    ["Берсанова", "12:00", "INDIVIDUAL", "Бакибай Санжар", "А"],
    ["Берсанова", "13:00", "METOD", null, "Метод"],
    ["Берсанова", "14:00", "INDIVIDUAL", "Саурбаев Марк", "И"],
    ["Берсанова", "15:00", "INDIVIDUAL", "Талгатбек Асанали", "Тех"],

    // --- Жумабекова Рахима ---
    ["Жумабекова", "09:00", "INDIVIDUAL", "Жумагельды Алинур", "И"],
    ["Жумабекова", "10:00", "INDIVIDUAL", "Амиров Али", "А"],
    ["Жумабекова", "11:00", "INDIVIDUAL", "Кушнир Александр", "И"],
    ["Жумабекова", "12:00", "METOD", null, "Метод"],
    ["Жумабекова", "13:00", "INDIVIDUAL", "Самат Алдияр", "А"],
    ["Жумабекова", "14:00", "INDIVIDUAL", "Мергалин Тамерлан", "И"],

    // --- Середа Оксана ---
    ["Середа", "09:00", "INDIVIDUAL", "Адильулы Аскар", "И"],
    ["Середа", "10:00", "INDIVIDUAL", "Арыстанов Ерхан", "А"],
    ["Середа", "11:00", "INDIVIDUAL", "Ахметжанов Алимхан", "И"],
    ["Середа", "12:00", "METOD", null, "Метод"],
    ["Середа", "13:00", "INDIVIDUAL", "Бежанов Ахмад", "А"],
    ["Середа", "14:00", "INDIVIDUAL", "Богбай Хамза", "И"],

    // --- Хитрик Дарья ---
    ["Хитрик", "09:00", "INDIVIDUAL", "Дюсекеев Айбар", "И"],
    ["Хитрик", "10:00", "INDIVIDUAL", "Ержанулы Ерлар", "А"],
    ["Хитрик", "11:00", "INDIVIDUAL", "Жанболат Айсултан", "И"],
    ["Хитрик", "12:00", "INDIVIDUAL", "Жарылгапов Самир", "А"],
    ["Хитрик", "13:00", "METOD", null, "Метод"],
    ["Хитрик", "14:00", "INDIVIDUAL", "Бакенова Айым", "И"],

    // --- Кусаин Маржан ---
    ["Кусаин", "10:00", "INDIVIDUAL", "Игликов Таир", "СОПР"],
    ["Кусаин", "11:00", "INDIVIDUAL", "Илиатова Малика", "И"],
    ["Кусаин", "13:00", "INDIVIDUAL", "Этимади Эмир", "СОПР"],
    ["Кусаин", "14:00", "INDIVIDUAL", "Тулеуов Субхан", "И"],

    // --- Давыдова Евгения ---
    ["Давыдова", "09:00", "INDIVIDUAL", "Аленова Каракат", "И"],
    ["Давыдова", "10:00", "INDIVIDUAL", "Левичева Ева", "А"],
    ["Давыдова", "11:00", "INDIVIDUAL", "Макарбек Жангирхан", "И"],
    ["Давыдова", "12:00", "METOD", null, "Метод"],
    ["Давыдова", "13:00", "INDIVIDUAL", "Мубарак Братислав", "А"],
    ["Давыдова", "14:00", "INDIVIDUAL", "Нургай Жангир", "И"],

    // --- Ануварбекова Амина ---
    ["Ануварбекова", "10:00", "INDIVIDUAL", "Калырбек Адель", "И"],
    ["Ануварбекова", "11:00", "INDIVIDUAL", "Кайролла Адильхан", "А"],
    ["Ануварбекова", "12:00", "INDIVIDUAL", "Байгалова Айша", "И"],
    ["Ануварбекова", "13:00", "INDIVIDUAL", "Капай Амирали", "А"],
    ["Ануварбекова", "14:00", "METOD", null, "Метод"],
    ["Ануварбекова", "15:00", "INDIVIDUAL", "Карагаева Райана", "И"],
  ];

  // Кабинеты по учителям
  const rooms = {
    "Малыга": "Каб.1",
    "Спивакова": "Каб.2",
    "Берсанова": "Каб.3",
    "Жумабекова": "Каб.4",
    "Середа": "Каб.5",
    "Хитрик": "Каб.6",
    "Кусаин": "Спортзал",
    "Давыдова": "Каб.7",
    "Ануварбекова": "Каб.8",
    "Садвакас": "Каб.9",
  };

  // Создаём слоты ПН/СР/ПТ
  console.log("--- Пн / Ср / Пт ---");
  let created = 0;
  let failed = 0;

  for (const [teacherName, startTime, type, studentName, category] of mwfSlots) {
    const teacherId = tById(teacherName);
    if (!teacherId) {
      console.error(`  Учитель не найден: ${teacherName}`);
      failed++;
      continue;
    }

    const days = [1, 3, 5]; // Пн, Ср, Пт
    for (const dayOfWeek of days) {
      const endHour = parseInt(startTime.split(":")[0]) + 1;
      const endTime = `${endHour.toString().padStart(2, "0")}:00`;

      const body = {
        teacherId,
        dayOfWeek,
        startTime,
        endTime,
        weekStartDate: weekStart,
        lessonType: type === "METOD" ? "INDIVIDUAL" : "INDIVIDUAL",
        lessonCategory: category || null,
        room: rooms[teacherName] || null,
      };

      if (type !== "METOD" && studentName) {
        const studentId = sById(studentName);
        if (!studentId) {
          console.error(`  Ученик не найден: ${studentName}`);
          failed++;
          continue;
        }
        body.studentId = studentId;
      }

      const res = await post("/schedule", body);
      if (res) {
        created++;
      } else {
        failed++;
      }
    }
  }

  console.log(`  Создано: ${created}, Ошибок: ${failed}\n`);

  // Создаём слоты ВТ/ЧТ
  console.log("--- Вт / Чт ---");
  let created2 = 0;
  let failed2 = 0;

  for (const [teacherName, startTime, type, studentName, category] of ttSlots) {
    const teacherId = tById(teacherName);
    if (!teacherId) {
      console.error(`  Учитель не найден: ${teacherName}`);
      failed2++;
      continue;
    }

    const days = [2, 4]; // Вт, Чт
    for (const dayOfWeek of days) {
      const endHour = parseInt(startTime.split(":")[0]) + 1;
      const endTime = `${endHour.toString().padStart(2, "0")}:00`;

      const body = {
        teacherId,
        dayOfWeek,
        startTime,
        endTime,
        weekStartDate: weekStart,
        lessonType: "INDIVIDUAL",
        lessonCategory: category || null,
        room: rooms[teacherName] || null,
      };

      if (type !== "METOD" && studentName) {
        const studentId = sById(studentName);
        if (!studentId) {
          console.error(`  Ученик не найден: ${studentName}`);
          failed2++;
          continue;
        }
        body.studentId = studentId;
      }

      const res = await post("/schedule", body);
      if (res) {
        created2++;
      } else {
        failed2++;
      }
    }
  }

  console.log(`  Создано: ${created2}, Ошибок: ${failed2}\n`);

  console.log("=== Готово! ===");
  console.log(`Всего создано слотов: ${created + created2}`);
  console.log(`Ошибок: ${failed + failed2}`);
  console.log(`\nОткрой https://school-management-v7xh.vercel.app/schedule`);
}

main().catch(console.error);
