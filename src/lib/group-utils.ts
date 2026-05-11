type StudentLike = { firstName: string; lastName: string; patronymic?: string | null };
type GroupMemberLike = { student: StudentLike };
type GroupLike = { name?: string | null; groupType?: string | null; members?: GroupMemberLike[] };

export const ALLOWED_GROUP_TYPES = ["INDIVIDUAL", "PAIR", "GROUP"] as const;

export function buildGroupDisplayName(group: GroupLike): string {
  if (group.name && group.name.trim().length > 0) return group.name;

  const members = group.members ?? [];
  if (!members.length) return "Без названия";

  const labels = members.map((m) => `${m.student.firstName} ${m.student.lastName}`.trim());

  if (group.groupType === "PAIR" && labels.length === 2) {
    return labels.join(" + ");
  }
  if (group.groupType === "INDIVIDUAL" && labels.length === 1) {
    return labels[0];
  }
  return labels.join(", ");
}

export function validateGroupComposition(
  groupType: string,
  memberCount: number,
  name?: string | null,
): string | null {
  if (!ALLOWED_GROUP_TYPES.includes(groupType as (typeof ALLOWED_GROUP_TYPES)[number])) {
    return `Тип группы должен быть одним из: ${ALLOWED_GROUP_TYPES.join(", ")}`;
  }
  if (groupType === "PAIR" && memberCount !== 2) {
    return "В паре должно быть ровно 2 ученика";
  }
  if (groupType === "INDIVIDUAL" && memberCount > 1) {
    return "В индивидуальной группе может быть только 1 ученик";
  }
  if (groupType === "GROUP" && (!name || !name.trim())) {
    return "Для группы обязательно укажите название";
  }
  return null;
}
