// Быстрый тест распознавания стажировок и пар парсером импорта.
import { parseCellValueV2, matchGridV2 } from "../src/lib/import-utils";

function check(cell: string, expectType: string, expectMentor?: string) {
  const p = parseCellValueV2(cell);
  const okType = p.type === expectType;
  const okMentor = expectMentor === undefined || p.mentor === expectMentor;
  console.log(
    `${okType && okMentor ? "✅" : "❌"} "${cell}" → type=${p.type}` +
      (p.mentor ? ` mentor=${p.mentor}` : "") +
      (okType && okMentor ? "" : `  (ждали type=${expectType}${expectMentor ? ` mentor=${expectMentor}` : ""})`)
  );
}

console.log("=== parseCellValueV2: стажировки ===");
check("стрж", "internship", "Ризат Жанатовна");
check("стдм", "internship", "Динара Мейрамкызы");
check("стев", "internship", "Евгения Викторовна");
check("СТРЖ", "internship", "Ризат Жанатовна"); // регистр
check("стрж пн ср", "internship", "Ризат Жанатовна"); // хвост-дни
check("стрж.", "internship", "Ризат Жанатовна"); // точка

console.log("\n=== не должно ложно срабатывать ===");
check("Стас", "student"); // студент, не стажировка
check("метод", "method");
check("Асанали И", "student");
check("Малика+Асанали", "multi_student");
check("грМ0", "group");

console.log("\n=== matchGridV2: стажировка становится слотом-меткой ===");
const teachers = [
  { id: "t1", lastName: "Иванова", firstName: "Оксана", patronymic: "Ивановна" },
  { id: "t2", lastName: "Петрова", firstName: "Дарья", patronymic: "Петровна" },
  { id: "t3", lastName: "Кузнецова", firstName: "Мария", patronymic: "Сергеевна" },
];
// Реалистичный v2-блок: 3 педагога, каждый на 2 колонки (пн/ср/пт и вт/чт).
const grid = [
  ["", "Оксана Ивановна И", "", "Дарья Петровна А", "", "Мария Сергеевна Тех", ""],
  ["", "пн ср пт", "вт чт", "пн ср пт", "вт чт", "пн ср пт", "вт чт"],
  ["9.00", "стрж", "", "метод", "", "стдм", ""],
];
const res = matchGridV2(grid as string[][], teachers, [], []);
const row = res.matches.find((m) => m.lessonCategory === "Стажировка");
console.log(JSON.stringify({
  detectedFormat: res.detectedFormat,
  teacherLabel: row?.teacherLabel,
  studentOrGroupLabel: row?.studentOrGroupLabel,
  lessonType: row?.lessonType,
  lessonCategory: row?.lessonCategory,
  studentId: row?.studentId ?? null,
  errors: row?.errors,
}, null, 2));
console.log(
  row && row.errors.length === 0 && !row.studentId && row.lessonCategory === "Стажировка"
    ? "✅ слот-стажировка валиден, без ученика, в оплату не пойдёт"
    : "❌ что-то не так со слотом-стажировкой"
);
