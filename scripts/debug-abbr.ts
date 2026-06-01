import * as dotenv from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
dotenv.config();
const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) });

async function main() {
  const teachers = await prisma.teacher.findMany({
    select: { lastName: true, firstName: true, patronymic: true },
  });

  for (const abbr of ["РЖ", "АЕ", "АК", "ВД", "ГС", "ДарьяВ", "Полина"]) {
    console.log(`\n«${abbr}»:`);
    const letters = abbr.split("");
    // Просто посмотрю всех с первой буквой Р
    if (abbr === "РЖ") {
      const r = teachers.filter((t) => t.firstName.charAt(0) === "Р");
      for (const t of r) console.log(`  Р... → "${t.lastName}" "${t.firstName}" "${t.patronymic ?? ""}"`);
    }
    if (abbr === "ДарьяВ") {
      const r = teachers.filter((t) => t.firstName === "Дарья");
      for (const t of r) console.log(`  Дарья → "${t.lastName}" "${t.firstName}" "${t.patronymic ?? ""}"`);
    }
  }
}
main().finally(() => prisma.$disconnect());
