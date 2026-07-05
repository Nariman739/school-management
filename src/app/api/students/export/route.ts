import { prisma } from "@/lib/prisma";
import { generateExcel, excelResponse } from "@/lib/excel-export";
import { buildGroupDisplayName } from "@/lib/group-utils";

// GET /api/students/export — Excel-экспорт списка учеников
export async function GET() {
  try {
    const students = await prisma.student.findMany({
      where: { isActive: true },
      include: {
        groupMembers: {
          include: {
            group: { include: { members: { include: { student: true } } } },
          },
        },
      },
      orderBy: [{ studentNumber: "asc" }, { lastName: "asc" }],
    });

    const rows = students.map((s) => {
      const id = s.studentNumber != null ? s.studentNumber.toString().padStart(3, "0") : "";
      // Готовая ячейка «Имя ID» для копирования в шаблон расписания (например «Мансура 079»)
      const nameWithId = id ? `${s.firstName} ${id}` : s.firstName;
      return {
        studentNumber: s.studentNumber ?? "",
        nameWithId,
        lastName: s.lastName,
        firstName: s.firstName,
        patronymic: s.patronymic || "",
        parentName: s.parentName || "",
        parentPhone: s.parentPhone || "",
        hourlyRate: s.hourlyRate,
        tariffType: s.tariffType === "SUBSCRIPTION" ? "Абонемент" : "Поурочно",
        groups: s.groupMembers.map((gm) => buildGroupDisplayName(gm.group)).join(", ") || "—",
        behavioral: s.isBehavioral ? "Да" : "Нет",
      };
    });

    const buffer = generateExcel({
      columns: [
        { header: "ID", key: "studentNumber", width: 6 },
        { header: "Для расписания", key: "nameWithId", width: 20 },
        { header: "Фамилия", key: "lastName", width: 20 },
        { header: "Имя", key: "firstName", width: 15 },
        { header: "Отчество", key: "patronymic", width: 20 },
        { header: "Родитель", key: "parentName", width: 20 },
        { header: "Телефон", key: "parentPhone", width: 15 },
        { header: "Ставка ₸/час", key: "hourlyRate", width: 12 },
        { header: "Тариф", key: "tariffType", width: 12 },
        { header: "Группы", key: "groups", width: 20 },
        { header: "ПВД", key: "behavioral", width: 6 },
      ],
      rows,
      sheetName: "Ученики",
      title: `Список учеников (${students.length})`,
    });

    return excelResponse(buffer, "Ученики.xlsx");
  } catch (error) {
    console.error("Ошибка при экспорте учеников:", error);
    return new Response("Ошибка экспорта", { status: 500 });
  }
}
