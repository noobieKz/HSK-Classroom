import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classroomRoster,
  matchesStudentFolder,
  studentFolderNames,
  sessionFolderName,
} from '../src/lib/roster';
test('Owner roster has 12 distinct names and resolves only confirmed Khanh alias', () => {
  assert.equal(new Set(classroomRoster).size, 12);
  assert.ok(classroomRoster.includes('Phạm Lê Khanh'));
  assert.ok(matchesStudentFolder(' Khanh ', 'Phạm Lê Khanh'));
  assert.ok(matchesStudentFolder('Đặng Ngọc Đức'.normalize('NFD'), 'Đặng Ngọc Đức'));
  assert.equal(matchesStudentFolder('Đức', 'Bùi Minh Đức'), false);
  assert.equal(matchesStudentFolder('Đặng Ngọc Đức', 'Bùi Minh Đức'), false);
  assert.ok(matchesStudentFolder('04. Đặng Ngọc Đức', 'Đặng Ngọc Đức'));
  assert.equal(studentFolderNames([...classroomRoster]).get('Bùi Danh Thái'), '01. Bùi Danh Thái');
  assert.equal(studentFolderNames([...classroomRoster]).get('Phạm Lê Khanh'), '06. Phạm Lê Khanh');
  assert.equal(sessionFolderName(2, '2026-11-03'), 'Buổi 02_03/11/2026');
  assert.throws(() => sessionFolderName(1, '2026-02-30'));
});
