/** تحدد اكتمال المراجعة من حالتي المراجع والموظف المستقلتين. */
export function isReviewComplete(reviewerTerminal: boolean, employeeTerminal: boolean) {
  return reviewerTerminal && employeeTerminal;
}

/** لا يوضع تاريخ إكمال إلا عندما تكون الحالتان نهائيتين. */
export function completedAtForTransition(targetTerminal: boolean, otherTerminal: boolean, now = new Date()) {
  return isReviewComplete(targetTerminal, otherTerminal) ? now : null;
}
