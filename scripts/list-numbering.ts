import * as dotenv from "dotenv"; import { PrismaClient } from "../src/generated/prisma/client"; import { PrismaNeon } from "@prisma/adapter-neon";
dotenv.config(); const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) });
// Эталон Дархана (его Excel, фото 3)
const DARKHAN: Record<number,string> = {123:"Мырзагали Зара",125:"Сапар Дияр",126:"Сеилова Айзере",127:"Советхан Али",128:"Сериккали Амре",129:"Усенов Хасан",130:"Абулхак Инкар",131:"Жумагельды Альтаир",132:"Апсамат Алтаир",133:"Абилов Амирали",134:"Дубысова Айла",135:"Бектурова Айлин",136:"Серик Алимжан",137:"Кумарбек Аяулым",138:"Медетова Дамелия",139:"Дюсенова Рамина",140:"Садвакасова Малика",141:"Михайличенко Даниил",142:"Ержанулы Динмухаммед",143:"Галле Саша"};
(async()=>{
  const rows = await prisma.student.findMany({ where: { studentNumber: { gte: 118 } }, orderBy: { studentNumber: "asc" }, select: { studentNumber:true, lastName:true, firstName:true } });
  console.log("№   | В БАЗЕ                        | У ДАРХАНА (Excel)            | совпадает?");
  for (const s of rows) {
    const n = s.studentNumber!; const inApp = `${s.lastName} ${s.firstName}`; const d = DARKHAN[n] ?? "—";
    const match = d === "—" ? " " : (d === inApp ? "✓" : "✗ РАЗЛАД");
    console.log(`${String(n).padEnd(4)}| ${inApp.padEnd(29)}| ${d.padEnd(28)}| ${match}`);
  }
  // Проверим пропуски
  const nums = rows.map(r=>r.studentNumber!); const min=Math.min(...nums), max=Math.max(...nums); const gaps=[];
  for (let i=min;i<=max;i++) if(!nums.includes(i)) gaps.push(i);
  console.log(`\nПропуски в нумерации: ${gaps.length? gaps.join(", "):"нет"}`);
  await prisma.$disconnect();
})();
