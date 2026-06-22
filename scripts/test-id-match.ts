import * as dotenv from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { matchStudentOrGroup } from "../src/lib/import-utils";
dotenv.config();
const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) });

async function main() {
  const students = await prisma.student.findMany({ where: { isActive: true } });
  const groups = await prisma.group.findMany();

  for (const tc of ["Мансура 009", "Айсултан 010", "Жангир 018", "Адель 001 А", "Алуа 029 И", "грМ0", "Ердар", "метод"]) {
    const r = matchStudentOrGroup(tc, students, groups);
    console.log(`"${tc}" → ${r ? `${r.type}: ${r.label}` : "—"}`);
  }
}
main().finally(() => prisma.$disconnect());
