import { randomUUID } from 'node:crypto';
import { googleJson } from './google';
import { readOptionalState, readState, writeState, withLock } from './store';
import { digest } from './crypto';
import { Data, Table, Row, schema, tables, SCHEMA_VERSION, emptyData } from './model';
import { invariant, AppError } from './errors';
import { environment } from './environment';
import { assertEnvironmentRoot } from './drive';
import { classroomRoster } from './roster';
const base = 'https://sheets.googleapis.com/v4/spreadsheets';
export function sheetStateKey(name: string) {
  return `${name}:${environment().mode}:${environment().root}`;
}

type SheetConfig = { id: string; url: string };
export async function sheetConfig(): Promise<SheetConfig | null> {
  const saved = (await readOptionalState<SheetConfig>(sheetStateKey('sheet-config')))?.value;
  const id = saved?.id || process.env.GOOGLE_SPREADSHEET_ID;
  return id ? { id, url: `https://docs.google.com/spreadsheets/d/${id}/edit` } : null;
}
function cell(value: string) {
  return { userEnteredValue: { stringValue: value } };
}
export function cellsRequest(table: Table, rows: Row[], sheetId: number) {
  const values = [[...schema[table]], ...rows.map((r) => schema[table].map((k) => r[k] ?? ''))];
  return {
    updateCells: {
      // A range also clears trailing old rows when a table becomes shorter.
      range: {
        sheetId,
        startRowIndex: 0,
        startColumnIndex: 0,
        endColumnIndex: schema[table].length,
      },
      rows: values.map((row) => ({ values: row.map(cell) })),
      fields: 'userEnteredValue',
    },
  };
}
async function properties(id: string) {
  return googleJson<{
    sheets: {
      properties: {
        sheetId: number;
        title: string;
        gridProperties: { rowCount: number; columnCount: number };
      };
    }[];
  }>(`${base}/${id}?fields=sheets.properties`);
}
export async function loadData(): Promise<Data> {
  const config = await sheetConfig();
  invariant(config, 'Chưa có Google Sheets. Khởi tạo tại Cài đặt.', 409);
  await assertEnvironmentRoot(config.id);
  const query = tables.map((t) => `ranges=${encodeURIComponent(`'${t}'!A:Z`)}`).join('&');
  const response = await googleJson<{ valueRanges: { values?: string[][] }[] }>(
    `${base}/${config.id}/values:batchGet?${query}&valueRenderOption=UNFORMATTED_VALUE`,
  );
  const data = emptyData();
  for (let i = 0; i < tables.length; i++) {
    const table = tables[i];
    const values = response.valueRanges[i]?.values || [];
    invariant(
      JSON.stringify(values[0]) === JSON.stringify(schema[table]),
      `Schema bảng ${table} không hợp lệ. Khôi phục header đúng trước khi tiếp tục.`,
      409,
    );
    data[table] = values
      .slice(1)
      .filter((row) => row[0])
      .map((row) => Object.fromEntries(schema[table].map((key, j) => [key, String(row[j] ?? '')])));
    invariant(
      new Set(data[table].map((r) => r.id)).size === data[table].length,
      `Bảng ${table} có ID trùng. Cần đối soát trước khi ghi.`,
      409,
    );
  }
  invariant(
    data.Meta.find((r) => r.id === 'schema')?.version === SCHEMA_VERSION,
    'Phiên bản schema không hỗ trợ.',
    409,
  );
  return data;
}
export async function initializeSheets() {
  return withLock('business', async () => {
    const existing = await sheetConfig();
    if (existing) {
      await loadData();
      return existing;
    }
    // Persist creation intent before calling Google; never silently create another sheet after an unknown outcome.
    const intent = await readState<{ pending: boolean }>(sheetStateKey('sheet-creation'));
    invariant(
      !intent?.value.pending,
      'Lần tạo Sheets trước chưa xác định kết quả. Tìm file Tuệ Minh Classroom trong Drive và cấu hình GOOGLE_SPREADSHEET_ID.',
      409,
    );
    await writeState(sheetStateKey('sheet-creation'), { pending: true });
    const configEnv = environment();
    const created = await googleJson<{ id: string; webViewLink?: string }>(
      'https://www.googleapis.com/drive/v3/files?fields=id,webViewLink&supportsAllDrives=true',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Tuệ Minh Classroom · ${configEnv.mode === 'development' ? 'DEV' : 'Production'}`,
          mimeType: 'application/vnd.google-apps.spreadsheet',
          parents: [configEnv.root],
          appProperties: { tm_classroom_schema: SCHEMA_VERSION, tm_environment: configEnv.mode },
        }),
      },
    );
    // Store exact returned identity immediately; initialize is separately resumable.
    const config = {
      id: created.id,
      url: created.webViewLink || `https://docs.google.com/spreadsheets/d/${created.id}/edit`,
    };
    await writeState(sheetStateKey('sheet-config'), config);
    await writeState(sheetStateKey('sheet-creation'), { pending: false, initializing: true });
    await prepareSheets(config.id);
    await seedSheets(config.id);
    await writeState(sheetStateKey('sheet-creation'), { pending: false, initializing: false });
    return config;
  });
}
async function prepareSheets(id: string) {
  await assertEnvironmentRoot(id);
  const metadata = await properties(id);
  const existing = new Set(metadata.sheets.map((s) => s.properties.title));
  const requests: unknown[] = [
    {
      updateSpreadsheetProperties: {
        properties: { locale: 'vi_VN', timeZone: 'Asia/Ho_Chi_Minh' },
        fields: 'locale,timeZone',
      },
    },
  ];
  let nextId = Math.max(0, ...metadata.sheets.map((s) => s.properties.sheetId)) + 1;
  for (const title of tables)
    if (!existing.has(title))
      requests.push({
        addSheet: {
          properties: {
            title,
            sheetId: nextId++,
            gridProperties: { rowCount: 1000, columnCount: 26, frozenRowCount: 1 },
          },
        },
      });
  await googleJson(`${base}/${id}:batchUpdate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  });
}
async function seedSheets(id: string) {
  const meta = await properties(id);
  const data = emptyData();
  data.Meta.push({ id: 'schema', version: SCHEMA_VERSION });
  const configEnv = environment();
  data.Classes.push({
    id: randomUUID(),
    name: configEnv.mode === 'development' ? 'HSK_UET · DEV' : 'HSK_UET',
    root_id: configEnv.root,
    expected_students: String(classroomRoster.length),
    status: 'active',
    version: '1',
  });
  for (const name of classroomRoster) {
    const studentId = randomUUID();
    data.Students.push({ id: studentId, name, email: '', status: 'active', version: '1' });
    data.Enrollments.push({
      id: `${data.Classes[0].id}~${studentId}`,
      class_id: data.Classes[0].id,
      student_id: studentId,
      joined_at: '',
      left_at: '',
      status: 'active',
      version: '1',
    });
  }
  await googleJson(`${base}/${id}:batchUpdate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: tables.map((t) =>
        cellsRequest(
          t,
          data[t],
          meta.sheets.find((s) => s.properties.title === t)!.properties.sheetId,
        ),
      ),
    }),
  });
}
export async function resumeInitialization() {
  return withLock('business', async () => {
    await assertCertain();
    const config = await sheetConfig();
    invariant(config, 'Không có spreadsheet để phục hồi.');
    await prepareSheets(config.id);
    // Only seed a completely blank app-owned spreadsheet. Never overwrite partial business data.
    const result = await googleJson<{ valueRanges: { values?: string[][] }[] }>(
      `${base}/${config.id}/values:batchGet?${tables.map((t) => `ranges=${encodeURIComponent(`'${t}'!A1:Z1000`)}`).join('&')}`,
    );
    invariant(
      result.valueRanges.every((v) => !v.values?.length),
      'Sheets đã có dữ liệu; không được khởi tạo đè. Kiểm tra schema hoặc khôi phục backup.',
      409,
    );
    await seedSheets(config.id);
    return config;
  });
}
export async function transaction<T>(
  operationId: string,
  payload: unknown,
  fn: (data: Data) => Promise<T> | T,
): Promise<T> {
  invariant(/^[a-zA-Z0-9_-]{8,100}$/.test(operationId), 'Thiếu mã thao tác hợp lệ.');
  return withLock(
    'business',
    async () => {
      await assertCertain();
      const config = await sheetConfig();
      invariant(config, 'Chưa khởi tạo Sheets.', 409);
      const data = await loadData();
      const fingerprint = digest(JSON.stringify(payload));
      const previous = data.Operations.find((o) => o.id === operationId);
      if (previous) {
        invariant(
          previous.fingerprint === fingerprint,
          'Mã thao tác đã được dùng cho nội dung khác.',
          409,
        );
        return JSON.parse(previous.result) as T;
      }
      const before = Object.fromEntries(tables.map((t) => [t, JSON.stringify(data[t])]));
      const result = await fn(data);
      data.Operations.push({
        id: operationId,
        fingerprint,
        created_at: new Date().toISOString(),
        result: JSON.stringify(result ?? null),
      });
      const changed = tables.filter((t) => before[t] !== JSON.stringify(data[t]));
      const meta = await properties(config.id);
      const requests: unknown[] = [];
      for (const table of changed) {
        const sheet = meta.sheets.find((s) => s.properties.title === table)?.properties;
        invariant(sheet, `Thiếu bảng ${table}.`, 409);
        if (sheet.gridProperties.rowCount < data[table].length + 1)
          requests.push({
            appendDimension: {
              sheetId: sheet.sheetId,
              dimension: 'ROWS',
              length: data[table].length + 100 - sheet.gridProperties.rowCount,
            },
          });
        requests.push(cellsRequest(table, data[table], sheet.sheetId));
      }
      // Atomic Sheets batch includes Operations receipt. If transport fails, retain the mutex
      // until request is known settled; no blind automatic retry of Google mutations.
      await writeState(sheetStateKey('business-uncertain'), { id: operationId, at: Date.now() });
      try {
        await googleJson(`${base}/${config.id}:batchUpdate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requests }),
        });
        await writeState(sheetStateKey('business-uncertain'), {
          id: operationId,
          at: Date.now(),
          resolved: true,
        });
      } catch (error) {
        // Block ALL future business writes after unknown outcome. Explicit reconciliation required.
        await writeState(sheetStateKey('business-uncertain'), { id: operationId, at: Date.now() });
        throw error;
      }
      return result;
    },
    10000,
  );
}
export async function assertCertain() {
  const entry = await readState<{ id: string; at: number; resolved?: boolean }>(
    sheetStateKey('business-uncertain'),
  );
  if (entry && !entry.value.resolved)
    throw new AppError(
      409,
      'Lần ghi trước chưa xác định kết quả. Vào Cài đặt để đối soát trước khi ghi tiếp.',
      'UNCERTAIN_WRITE',
    );
}
export function upsert(data: Data, table: Table, row: Row) {
  const index = data[table].findIndex((r) => r.id === row.id);
  if (index === -1) data[table].push(row);
  else data[table][index] = row;
}
