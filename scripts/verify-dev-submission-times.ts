import * as nextEnv from '@next/env';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { environment, DEV_DRIVE_ROOT } from '../src/lib/environment';
import { loadData } from '../src/lib/sheets';
import { syncAssignment } from '../src/lib/business';
import { submissionStatus, submissionTiming } from '../src/lib/model';

async function main() {
  nextEnv.loadEnvConfig(process.cwd());
  assert.equal(environment().mode, 'development');
  assert.equal(environment().root, DEV_DRIVE_ROOT);
  const fixture = JSON.parse(await readFile('test-results/dev-student-submission.json', 'utf8'));
  const result = await syncAssignment(fixture.assignment_id, randomUUID());
  assert.ok(!('error' in result), JSON.stringify(result));
  const data = await loadData();
  const assignment = data.Assignments.find((a) => a.id === fixture.assignment_id)!;
  const students = data.Submissions.filter((s) => s.assignment_id === assignment.id).map((s) => {
    const state = submissionStatus(data, assignment, s.student_id);
    const expected = submissionTiming(s, state.files);
    assert.equal(s.submitted_at, expected.submitted_at);
    assert.equal(s.timing_source, expected.timing_source);
    if (state.files.length) assert.ok(['submitted', 'late'].includes(state.status));
    return {
      student: data.Students.find((student) => student.id === s.student_id)?.name,
      files: state.files.length,
      submitted_at: s.submitted_at,
      timing_source: s.timing_source,
      status: state.status,
      file_times: state.files.map((f) => ({ name: f.name, created_at: f.created_at })),
    };
  });
  const report = { dev_only: true, tested_at: new Date().toISOString(), result, students };
  await writeFile('docs/dev-submission-times.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
