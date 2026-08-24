export type ReviewProductivitySource = {
  id: number;
  name: string;
  total: number;
  completed: number;
  overdue: number;
};

export type DailyProductivitySource = {
  employeeId: number;
  employeeName: string;
  total: number;
  completed: number;
  overdue: number;
  unupdated: number;
};

export type TeamProductivityMember = {
  employeeId: number;
  employeeName: string;
  reviewTotal: number;
  reviewCompleted: number;
  reviewOverdue: number;
  dailyTotal: number;
  dailyCompleted: number;
  dailyOverdue: number;
  dailyUnupdated: number;
  totalWorkload: number;
  completedWork: number;
  attentionItems: number;
  reviewCompletionRate: number;
  dailyCompletionRate: number;
};

export type TeamProductivitySortKey = "employeeName" | "reviewCompletionRate" | "dailyCompletionRate" | "attentionItems" | "totalWorkload";
export type TeamProductivitySortDirection = "asc" | "desc";

const completionRate = (completed: number, total: number) => total ? Math.round((completed / total) * 100) : 0;

export function summarizeTeamProductivity(reviewEmployees: ReviewProductivitySource[], dailyEmployees: DailyProductivitySource[]) {
  const members = new Map<number, TeamProductivityMember>();
  const ensureMember = (employeeId: number, employeeName: string) => {
    const current = members.get(employeeId);
    if (current) return current;
    const created: TeamProductivityMember = { employeeId, employeeName, reviewTotal: 0, reviewCompleted: 0, reviewOverdue: 0, dailyTotal: 0, dailyCompleted: 0, dailyOverdue: 0, dailyUnupdated: 0, totalWorkload: 0, completedWork: 0, attentionItems: 0, reviewCompletionRate: 0, dailyCompletionRate: 0 };
    members.set(employeeId, created);
    return created;
  };

  for (const employee of reviewEmployees) {
    const current = ensureMember(employee.id, employee.name);
    current.reviewTotal += employee.total;
    current.reviewCompleted += employee.completed;
    current.reviewOverdue += employee.overdue;
  }
  for (const employee of dailyEmployees) {
    const current = ensureMember(employee.employeeId, employee.employeeName);
    current.dailyTotal += employee.total;
    current.dailyCompleted += employee.completed;
    current.dailyOverdue += employee.overdue;
    current.dailyUnupdated += employee.unupdated;
  }

  const rows = Array.from(members.values()).map(member => ({
    ...member,
    totalWorkload: member.reviewTotal + member.dailyTotal,
    completedWork: member.reviewCompleted + member.dailyCompleted,
    attentionItems: member.reviewOverdue + member.dailyOverdue + member.dailyUnupdated,
    reviewCompletionRate: completionRate(member.reviewCompleted, member.reviewTotal),
    dailyCompletionRate: completionRate(member.dailyCompleted, member.dailyTotal),
  })).sort((first, second) => second.attentionItems - first.attentionItems || second.totalWorkload - first.totalWorkload || first.employeeName.localeCompare(second.employeeName, "ar"));

  const totals = rows.reduce((current, member) => ({
    reviewTotal: current.reviewTotal + member.reviewTotal,
    reviewCompleted: current.reviewCompleted + member.reviewCompleted,
    dailyTotal: current.dailyTotal + member.dailyTotal,
    dailyCompleted: current.dailyCompleted + member.dailyCompleted,
    attentionItems: current.attentionItems + member.attentionItems,
  }), { reviewTotal: 0, reviewCompleted: 0, dailyTotal: 0, dailyCompleted: 0, attentionItems: 0 });

  return {
    rows,
    ...totals,
    totalWorkload: totals.reviewTotal + totals.dailyTotal,
    completedWork: totals.reviewCompleted + totals.dailyCompleted,
    reviewCompletionRate: completionRate(totals.reviewCompleted, totals.reviewTotal),
    dailyCompletionRate: completionRate(totals.dailyCompleted, totals.dailyTotal),
    employeesNeedingAttention: rows.filter(member => member.attentionItems > 0).length,
  };
}

export function sortTeamProductivityRows(rows: TeamProductivityMember[], key: TeamProductivitySortKey, direction: TeamProductivitySortDirection) {
  const multiplier = direction === "asc" ? 1 : -1;
  return [...rows].sort((first, second) => {
    if (key === "employeeName") return first.employeeName.localeCompare(second.employeeName, "ar") * multiplier;
    const difference = first[key] - second[key];
    return difference ? difference * multiplier : first.employeeName.localeCompare(second.employeeName, "ar");
  });
}
