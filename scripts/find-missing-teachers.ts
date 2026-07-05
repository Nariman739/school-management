import * as XLSX from "xlsx";
import * as dotenv from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { detectFormat, matchGridV2 } from "../src/lib/import-utils";
dotenv.config();
const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) });
async function main() {
  const [teachers, students, groups] = await Promise.all([
    prisma.teacher.findMany({ where: { isActive: true } }),
    prisma.student.findMany({ where: { isActive: true } }),
    prisma.group.findMany(),
  ]);
  const wb = XLSX.readFile("/tmp/darkhan-list.xlsx");
  const missing = new Set<string>();
  for (const s of ["8-12.06", "13.06"]) {
    const ws = wb.Sheets[s]; if (!ws) continue;
    const grid: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false }) as any[][];
    const normalized = grid.map((row) => row.map((c) => (c == null ? "" : String(c))));
    const p = matchGridV2(normalized, teachers, students, groups, detectFormat(normalized));
    for (const m of p.matches) if (!m.teacherId) missing.add(m.cell.teacherName);
  }
  console.log(`Уникальных ненайденных педагогов: ${missing.size}`);
  for (const t of missing) console.log(`  ${t}`);
}
main().finally(() => prisma.$disconnect());
