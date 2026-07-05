import { prisma } from "@/lib/prisma";
import { generateExcel, excelResponse } from "@/lib/excel-export";

// GET /api/teachers/export — Excel-экспорт списка педагогов
export async function GET() {
  try {
    const teachers = await prisma.teacher.findMany({
      where: { isActive: true },
      orderBy: [{ teacherNumber: "asc" }, { lastName: "asc" }],
    });

    const rows = teachers.map((t) => {
      const id = t.teacherNumber != null ? t.teacherNumber.toString().padStart(2, "0") : "";
      const nameWithId = id ? `${t.firstName} ${id}` : t.firstName;
      return {
        teacherNumber: t.teacherNumber ?? "",
        nameWithId,
        lastName: t.lastName,
        firstName: t.firstName,
        patronymic: t.patronymic || "",
        phone: t.phone || "",
        specialization: t.specialization || "",
        individualRate: t.individualRate,
        groupRate: t.groupRate,
        groupRate3: t.groupRate3,
        groupRate5: t.groupRate5,
        morningBonus: t.morningBonusRate,
        eveningBonus: t.eveningBonusRate,
        behavioralBonus: t.behavioralBonus,
        isMethodist: t.isMethodist ? "Да" : "Нет",
        methodistRate: t.methodistWeeklyRate,
      };
    });

    const buffer = generateExcel({
      columns: [
        { header: "ID", key: "teacherNumber", width: 5 },
        { header: "Для расписания", key: "nameWithId", width: 20 },
        { header: "Фамилия", key: "lastName", width: 20 },
        { header: "Имя", key: "firstName", width: 15 },
        { header: "Отчество", key: "patronymic", width: 20 },
        { header: "Телефон", key: "phone", width: 15 },
        { header: "Спец.", key: "specialization", width: 8 },
        { header: "Инд. ₸", key: "individualRate", width: 10 },
        { header: "Груп. ₸", key: "groupRate", width: 10 },
        { header: "Груп.3 ₸", key: "groupRate3", width: 10 },
        { header: "Груп.5 ₸", key: "groupRate5", width: 10 },
        { header: "Утро ₸", key: "morningBonus", width: 10 },
        { header: "Вечер ₸", key: "eveningBonus", width: 10 },
        { header: "ПВД ₸", key: "behavioralBonus", width: 10 },
        { header: "Методист", key: "isMethodist", width: 10 },
        { header: "Метод ₸/нед", key: "methodistRate", width: 12 },
      ],
      rows,
      sheetName: "Педагоги",
      title: `Список педагогов (${teachers.length})`,
    });

    return excelResponse(buffer, "Педагоги.xlsx");
  } catch (error) {
    console.error("Ошибка при экспорте педагогов:", error);
    return new Response("Ошибка экспорта", { status: 500 });
  }
}
