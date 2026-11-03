export const classroomRoster = [
  'Bùi Danh Thái',
  'Bùi Minh Đức',
  'Đặng Ngọc Anh Vũ',
  'Đặng Ngọc Đức',
  'Đặng Phương Dung',
  'Phạm Lê Khanh',
  'Lê Việt Thái',
  'Nguyễn Đình Quang',
  'Nguyễn Huy',
  'Nguyễn Quang Sáng',
  'Trung Phạm',
  'Vũ Quang Hiếu',
] as const;
const normalized = (name: string) =>
  name.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');
export function matchesStudentFolder(folder: string, student: string) {
  folder = folder.replace(/^\s*\d+\.\s*/, '');
  return (
    normalized(folder) === normalized(student) ||
    (normalized(student) === normalized('Phạm Lê Khanh') && normalized(folder) === 'khanh')
  );
}
export function studentFolderNames(names: string[]) {
  const extra = names
    .filter((n) => !(classroomRoster as readonly string[]).includes(n))
    .sort((a, b) => a.localeCompare(b, 'vi'));
  return new Map(
    names.map((name) => {
      const known = (classroomRoster as readonly string[]).indexOf(name);
      const index = known >= 0 ? known + 1 : classroomRoster.length + extra.indexOf(name) + 1;
      return [name, `${String(index).padStart(2, '0')}. ${name}`];
    }),
  );
}
export function sessionFolderName(number: number, date: string) {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (
    !Number.isInteger(number) ||
    number < 1 ||
    number > 999 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  )
    throw new Error('Số buổi hoặc ngày học không hợp lệ.');
  const [year, month, day] = date.split('-');
  return `Buổi ${String(number).padStart(2, '0')}_${day}/${month}/${year}`;
}
