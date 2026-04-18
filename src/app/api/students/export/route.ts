import { prisma } from "@/lib/prisma";
import { generateExcel, excelResponse } from "@/lib/excel-export";

// GET /api/students/export — Excel-экспорт списка учеников
export async function GET() {
  try {
    const students = await prisma.student.findMany({
      where: { isActive: true },
      include: { groupMembers: { include: { group: true } } },
      orderBy: { lastName: "asc" },
    });

    const rows = students.map((s) => ({
      lastName: s.lastName,
      firstName: s.firstName,
      patronymic: s.patronymic || "",
      parentName: s.parentName || "",
      parentPhone: s.parentPhone || "",
      hourlyRate: s.hourlyRate,
      tariffType: s.tariffType === "SUBSCRIPTION" ? "Абонемент" : "Поурочно",
      groups: s.groupMembers.map((gm) => gm.group.name).join(", ") || "—",
      behavioral: s.isBehavioral ? "Да" : "Нет",
    }));

    const buffer = generateExcel({
      columns: [
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
