import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

// PUT /api/students/[id] — update a student
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const {
      lastName, firstName, patronymic, parentName, parentPhone, hourlyRate,
      tariffType, subscriptionRate, subscriptionLessons, enrollmentDate, notes, isBehavioral,
    } = body;

    if (!lastName || !firstName) {
      return NextResponse.json(
        { error: "Фамилия и имя обязательны для заполнения" },
        { status: 400 }
      );
    }

    const existing = await prisma.student.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Ученик не найден" },
        { status: 404 }
      );
    }

    const newHourlyRate = hourlyRate ? parseInt(String(hourlyRate), 10) : 0;
    const newTariffType = tariffType || existing.tariffType;

    // Если тариф изменился — сохраняем историю
    if (newHourlyRate !== existing.hourlyRate || newTariffType !== existing.tariffType) {
      // Закрываем текущий тариф
      const openTariff = await prisma.tariffHistory.findFirst({
        where: { studentId: id, effectiveTo: null },
      });
      if (openTariff) {
        await prisma.tariffHistory.update({
          where: { id: openTariff.id },
          data: { effectiveTo: new Date().toISOString().split("T")[0] },
        });
      }

      // Создаём новую запись
      await prisma.tariffHistory.create({
        data: {
          studentId: id,
          hourlyRate: newHourlyRate,
          tariffType: newTariffType,
          subscriptionRate: subscriptionRate ? parseInt(String(subscriptionRate), 10) : null,
          effectiveFrom: new Date().toISOString().split("T")[0],
        },
      });
    }

    const student = await prisma.student.update({
      where: { id },
      data: {
        lastName,
        firstName,
        patronymic: patronymic || null,
        parentName: parentName || null,
        parentPhone: parentPhone || null,
        hourlyRate: newHourlyRate,
        tariffType: newTariffType,
        subscriptionRate: subscriptionRate ? parseInt(String(subscriptionRate), 10) : null,
        subscriptionLessons: subscriptionLessons ? parseInt(String(subscriptionLessons), 10) : null,
        enrollmentDate: enrollmentDate || null,
        notes: notes || null,
        isBehavioral: isBehavioral !== undefined ? Boolean(isBehavioral) : existing.isBehavioral,
      },
    });

    await logAudit({ entityType: "Student", entityId: id, action: "UPDATE" });

    return NextResponse.json(student);
  } catch (error) {
    console.error("Failed to update student:", error);
    return NextResponse.json(
      { error: "Не удалось обновить данные ученика" },
      { status: 500 }
    );
  }
}

// DELETE /api/students/[id] — soft delete (set isActive=false)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await prisma.student.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Ученик не найден" },
        { status: 404 }
      );
    }

    await prisma.student.update({
      where: { id },
      data: { isActive: false },
    });

    await logAudit({ entityType: "Student", entityId: id, action: "DELETE" });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete student:", error);
    return NextResponse.json(
      { error: "Не удалось удалить ученика" },
      { status: 500 }
    );
  }
}
