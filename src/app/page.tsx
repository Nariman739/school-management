import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [teacherCount, studentCount, groupCount] = await Promise.all([
    prisma.teacher.count({ where: { isActive: true } }),
    prisma.student.count({ where: { isActive: true } }),
    prisma.group.count(),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Главная</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Учителя
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{teacherCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Ученики
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{studentCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Группы
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{groupCount}</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
