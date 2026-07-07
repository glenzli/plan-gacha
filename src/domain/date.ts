export function formatDateId(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseDateId(dateId: string) {
  const [year, month, day] = dateId.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function addDays(dateId: string, offset: number) {
  const date = parseDateId(dateId);
  date.setDate(date.getDate() + offset);
  return formatDateId(date);
}

export function getTodayId() {
  return formatDateId(new Date());
}
