import * as dotenv from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { matchStudentOrGroup } from "../src/lib/import-utils";
dotenv.config();
const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) });

async function main() {
  const students = await prisma.student.findMany({ where: { isActive: true } });
  const groups = await prisma.group.findMany();

  // Проверим кандидатов для "АльтаирЖ", "Алинурнов", "Айсултан010"
  for (const target of ["альтаир", "алинур", "мансура", "айсултан", "алту"]) {
    const found = students.filter((s) =>
      s.firstName.toLowerCase().includes(target.toLowerCase()) ||
      s.lastName.toLowerCase().includes(target.toLowerCase())
    );
    console.log(`\n[${target}]: ${found.length}`);
    for (const s of found) console.log(`  ${s.studentNumber ?? "-"} ${s.lastName} ${s.firstName}`);
  }

  console.log("\n=== Test cases ===");
  for (const tc of ["Мансура 009", "Айсултан010 И", "АльтаирЖ И", "Алинурнов И", "Малика+Асанали", "Асанали И", "Ердар И"]) {
    const r = matchStudentOrGroup(tc, students, groups);
    console.log(`"${tc}" → ${r ? `${r.type}: ${r.label}` : "❌"}`);
  }
}
main().finally(() => prisma.$disconnect());
