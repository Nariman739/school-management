// Seed script — заливка данных из Excel
const BASE = "http://localhost:3000/api";

async function post(path, data) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error(`  FAIL ${path}:`, err);
    return null;
  }
  return res.json();
}

// ============================================================
// УЧИТЕЛЯ (лист "педагоги")
// individualRate = основная ставка
// groupRate = ставка "группа" (первое число из диапазона)
// ============================================================
const teachers = [
  { lastName: "Малыга", firstName: "Дарья", patronymic: "Алексеевна", individualRate: 1200, groupRate: 1500 },
  { lastName: "Капсаматова", firstName: "Жанель", patronymic: "Женисовна", individualRate: 2300, groupRate: 0 },
  { lastName: "Садвакас", firstName: "Динара", patronymic: "Мейрамкызы", individualRate: 1200, groupRate: 1500 },
  { lastName: "Берсанова", firstName: "Зарема", patronymic: "Магомедовна", individualRate: 1500, groupRate: 1500 },
  { lastName: "Спивакова", firstName: "Полина", patronymic: "Павловна", individualRate: 1300, groupRate: 0 },
  { lastName: "Жолдыбай", firstName: "Айдана", patronymic: "Ербулатовна", individualRate: 1500, groupRate: 0 },
  { lastName: "Жумабекова", firstName: "Рахима", patronymic: "Нурланбековна", individualRate: 1500, groupRate: 1800 },
  { lastName: "Середа", firstName: "Оксана", patronymic: "Ивановна", individualRate: 1400, groupRate: 2000 },
  { lastName: "Хитрик", firstName: "Дарья", patronymic: "Александровна", individualRate: 1400, groupRate: 2000 },
  { lastName: "Ануварбекова", firstName: "Амина", patronymic: "Канатовна", individualRate: 1400, groupRate: 2000 },
  { lastName: "Кусаин", firstName: "Маржан", patronymic: "Ермагамбетовна", individualRate: 1400, groupRate: 1500 },
  { lastName: "Минин", firstName: "Дмитрий", patronymic: "Николаевич", individualRate: 1500, groupRate: 0 },
  { lastName: "Алфутов", firstName: "Артур", patronymic: "Васильевич", individualRate: 1400, groupRate: 0 },
  { lastName: "Мусагажинова", firstName: "Адель", patronymic: "Даниаровна", individualRate: 1100, groupRate: 0 },
  { lastName: "Давыдова", firstName: "Евгения", patronymic: "Викторовна", individualRate: 1200, groupRate: 2000 },
  { lastName: "Мырзабекова", firstName: "Зарина", patronymic: "Нурлыбековна", individualRate: 1200, groupRate: 0 },
  { lastName: "Есумжанов", firstName: "Расул", patronymic: "Женисович", individualRate: 1200, groupRate: 0 },
  { lastName: "Жаменке", firstName: "Нигмат", patronymic: "Дмитриевич", individualRate: 1500, groupRate: 0 },
  { lastName: "Герт", firstName: "Элина", patronymic: "Владимировна", individualRate: 1200, groupRate: 0 },
  { lastName: "Смагулова", firstName: "Аяжан", patronymic: "Мубараковна", individualRate: 1100, groupRate: 0 },
  { lastName: "Волынкина", firstName: "Дарья", patronymic: "Евгеньевна", individualRate: 1200, groupRate: 0 },
  { lastName: "Адилбекова", firstName: "Дильназ", patronymic: "Жанатовна", individualRate: 1200, groupRate: 0 },
  { lastName: "Кинаят", firstName: "Аида", patronymic: "Талгатовна", individualRate: 1200, groupRate: 0 },
  { lastName: "Арыстанбекова", firstName: "Жансая", patronymic: "Болатовна", individualRate: 1100, groupRate: 0 },
  { lastName: "Гончарова", firstName: "Дарья", patronymic: "Вячеславовна", individualRate: 1100, groupRate: 0 },
  { lastName: "Садвакасова", firstName: "Айдана", patronymic: "Таурбековна", individualRate: 1200, groupRate: 1300 },
  { lastName: "Кондыбаева", firstName: "Дильназ", patronymic: "Амангельдыевна", individualRate: 1100, groupRate: 0 },
  { lastName: "Нурлыбекова", firstName: "Анель", patronymic: "Ержановна", individualRate: 1000, groupRate: 0 },
  { lastName: "Апсалямова", firstName: "Полина", patronymic: "Юрьевна", individualRate: 1200, groupRate: 0 },
  { lastName: "Щеглов", firstName: "Роман", patronymic: "Александрович", individualRate: 1400, groupRate: 0 },
  { lastName: "Оспанова", firstName: "Ризат", patronymic: "Жанатовна", individualRate: 2000, groupRate: 0 },
  { lastName: "Айтбаева", firstName: "Даяна", patronymic: "Ораловна", individualRate: 1000, groupRate: 0 },
  { lastName: "Коныспай", firstName: "Кымбат", patronymic: "Канаткызы", individualRate: 1000, groupRate: 0 },
];

// ============================================================
// УЧЕНИКИ (лист "дети")
// hourlyRate = столбец B "И+А+Ф (инд урок)"
// ============================================================
const students = [
  // --- основной список (строки 2-47) ---
  { lastName: "Адильулы", firstName: "Аскар", hourlyRate: 3000 },
  { lastName: "Айтикенова", firstName: "Адель", hourlyRate: 4000 },
  { lastName: "Айтуганова", firstName: "Самира", hourlyRate: 1800 },
  { lastName: "Аленова", firstName: "Каракат", hourlyRate: 4000 },
  { lastName: "Амангелди", firstName: "Аслан", hourlyRate: 3500 },
  { lastName: "Амиров", firstName: "Али", hourlyRate: 4500 },
  { lastName: "Арыстанов", firstName: "Ерхан", hourlyRate: 4000 },
  { lastName: "Ахметжанов", firstName: "Алимхан", hourlyRate: 4000 },
  { lastName: "Багымбаева", firstName: "Алима", hourlyRate: 3500 },
  { lastName: "Байгалова", firstName: "Айша", hourlyRate: 4000 },
  { lastName: "Бежанов", firstName: "Ахмад", hourlyRate: 4000 },
  { lastName: "Бейсханов", firstName: "Арлан", hourlyRate: 3500 },
  { lastName: "Бакенова", firstName: "Айым", hourlyRate: 4000 },
  { lastName: "Богбай", firstName: "Хамза", hourlyRate: 4000 },
  { lastName: "Винокурова", firstName: "Амелия", hourlyRate: 3000 },
  { lastName: "Дюсекеев", firstName: "Айбар", hourlyRate: 4000 },
  { lastName: "Ержанулы", firstName: "Ерлар", hourlyRate: 4000 },
  { lastName: "Жанболат", firstName: "Айсултан", hourlyRate: 4000 },
  { lastName: "Жарылгапов", firstName: "Самир", hourlyRate: 4000 },
  { lastName: "Жаскайрат", firstName: "Алуа", hourlyRate: 3500 },
  { lastName: "Жаскайрат", firstName: "Улпан", hourlyRate: 3500 },
  { lastName: "Кумапилов", firstName: "Амирлан", hourlyRate: 4000 },
  { lastName: "Жумагельды", firstName: "Алинур", hourlyRate: 4500 },
  { lastName: "Жунусбеков", firstName: "Арнур", hourlyRate: 3000 },
  { lastName: "Игликов", firstName: "Таир", hourlyRate: 4000 },
  { lastName: "Илиатова", firstName: "Малика", hourlyRate: 3500 },
  { lastName: "Калырбек", firstName: "Адель", hourlyRate: 4000 },
  { lastName: "Кайролла", firstName: "Адильхан", hourlyRate: 4000 },
  { lastName: "Капай", firstName: "Амирали", hourlyRate: 4000 },
  { lastName: "Карагаева", firstName: "Райана", hourlyRate: 3500 },
  { lastName: "Курмангалин", firstName: "Алихан", hourlyRate: 4000 },
  { lastName: "Курмангалин", firstName: "Амирхан", hourlyRate: 4000 },
  { lastName: "Кушнир", firstName: "Александр", hourlyRate: 4500 },
  { lastName: "Левичева", firstName: "Ева", hourlyRate: 4000 },
  { lastName: "Лакашов", firstName: "Ислам", hourlyRate: 3000 },
  { lastName: "Макарбек", firstName: "Жангирхан", hourlyRate: 4000 },
  { lastName: "Мергалин", firstName: "Тамерлан", hourlyRate: 4500 },
  { lastName: "Мубарак", firstName: "Братислав", hourlyRate: 4000 },
  { lastName: "Нургай", firstName: "Жангир", hourlyRate: 4000 },
  { lastName: "Самат", firstName: "Алдияр", hourlyRate: 4500 },
  { lastName: "Саурбаев", firstName: "Марк", hourlyRate: 4000 },
  { lastName: "Талгатбек", firstName: "Асанали", hourlyRate: 4500 },
  { lastName: "Тулеуов", firstName: "Субхан", hourlyRate: 3500 },
  { lastName: "Этимади", firstName: "Эмир", hourlyRate: 3500 },

  // --- группа "пн ср пт" (строки 55-68) ---
  { lastName: "Аманова", firstName: "Мерей", hourlyRate: 2500 },
  { lastName: "Алдаберген", firstName: "Айару", hourlyRate: 3000 },
  { lastName: "Ашимов", firstName: "Алихан", hourlyRate: 4000 },
  { lastName: "Богбай", firstName: "Айла", hourlyRate: 4000 },
  { lastName: "Диксуль", firstName: "Муслим", hourlyRate: 3500 },
  { lastName: "Зыркын", firstName: "Ерлик", hourlyRate: 4000 },
  { lastName: "Исимова", firstName: "Айдана", hourlyRate: 3500 },
  { lastName: "Исимова", firstName: "Айлана", hourlyRate: 3500 },
  { lastName: "Карагасенов", firstName: "Искандер", hourlyRate: 4000 },
  { lastName: "Кунанбай", firstName: "Жансая", hourlyRate: 4500 },
  { lastName: "Кушнаренко", firstName: "Милана", hourlyRate: 4000 },
  { lastName: "Мостипан", firstName: "Артем", hourlyRate: 4000 },
  { lastName: "Сагынтаев", firstName: "Азим", hourlyRate: 4000 },
  { lastName: "Саденов", firstName: "Ихсан", hourlyRate: 3500 },

  // --- группа "вт чт" (строки 72-83) ---
  { lastName: "Айнабек", firstName: "Муслим", hourlyRate: 3500 },
  { lastName: "Атыгай", firstName: "Алихан", hourlyRate: 3000 },
  { lastName: "Агеев", firstName: "Тихон", hourlyRate: 2500 },
  { lastName: "Байплинов", firstName: "Назар", hourlyRate: 4000 },
  { lastName: "Болат", firstName: "Мади", hourlyRate: 4000 },
  { lastName: "Камалиденов", firstName: "Ерали", hourlyRate: 4000 },
  { lastName: "Пантюхов", firstName: "Максим", hourlyRate: 3000 },
  { lastName: "Рыженков", firstName: "Тамерлан", hourlyRate: 3000 },
  { lastName: "Сагимбаев", firstName: "Самир", hourlyRate: 4000 },
  { lastName: "Сапар", firstName: "Диар", hourlyRate: 4000 },
  { lastName: "Секара", firstName: "Ратмир", hourlyRate: 4500 },
  { lastName: "Четкин", firstName: "Эмир", hourlyRate: 3000 },

  // --- суббота (строки 87-90) ---
  { lastName: "Кумаров", firstName: "Айсултан", hourlyRate: 4000 },
  { lastName: "Кобзев", firstName: "Дима", hourlyRate: 4000 },
  { lastName: "Пантюхов", firstName: "Мирон", hourlyRate: 3000 },
  { lastName: "Бакибай", firstName: "Санжар", hourlyRate: 4000 },
];

async function main() {
  console.log("=== Заливка тестовых данных ===\n");

  // --- Учителя ---
  console.log(`Создаю ${teachers.length} учителей...`);
  let tOk = 0;
  for (const t of teachers) {
    const res = await post("/teachers", t);
    if (res) tOk++;
  }
  console.log(`  Готово: ${tOk}/${teachers.length}\n`);

  // --- Ученики ---
  console.log(`Создаю ${students.length} учеников...`);
  let sOk = 0;
  for (const s of students) {
    const res = await post("/students", s);
    if (res) sOk++;
  }
  console.log(`  Готово: ${sOk}/${students.length}\n`);

  console.log("=== Готово! ===");
  console.log(`Учителей: ${tOk}`);
  console.log(`Учеников: ${sOk}`);
  console.log("\nОткрой http://localhost:3000 чтобы увидеть данные");
}

main().catch(console.error);
