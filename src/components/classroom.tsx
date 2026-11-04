'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  Data,
  Row,
  includedStudents,
  submissionStatus,
  lastReview,
  average,
  statusLabels,
} from '@/lib/model';

type Bootstrap = {
  environment?: { mode: string; root: string };
  authenticated: boolean;
  csrf?: string;
  google?: { configured: boolean; connected: boolean; email: string; callback: string } | null;
  sheet?: { id: string; url: string } | null;
};
type Page = 'dashboard' | 'students' | 'sessions' | 'submissions' | 'reports' | 'settings';
type ModalState = { type: string; row?: Row; student?: Row };
type FileItem = { id: string; name: string; mimeType: string; createdTime?: string };
type Progress = {
  id: string;
  name: string;
  size: number;
  offset: number;
  complete: boolean;
  recorded: boolean;
  chunkSize: number;
};
const nav: { id: Page; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Tổng quan', icon: 'grid' },
  { id: 'students', label: 'Học viên', icon: 'users' },
  { id: 'sessions', label: 'Buổi học & bài tập', icon: 'book' },
  { id: 'submissions', label: 'Bài nộp & chấm bài', icon: 'check' },
  { id: 'reports', label: 'Báo cáo tiến độ', icon: 'chart' },
  { id: 'settings', label: 'Kết nối & cài đặt', icon: 'settings' },
];
const paths: Record<string, ReactNode> = {
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 21v-3a6 6 0 0 1 12 0v3m2-16a3 3 0 0 1 0 6m2 3c2 1 3 3 3 5" />
    </>
  ),
  book: (
    <>
      <path d="M12 5C8 2 4 3 2 4v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-3-1-7-2-10 1zm0 0v15" />
    </>
  ),
  check: (
    <>
      <rect x="4" y="3" width="16" height="19" rx="2" />
      <path d="m8 12 3 3 5-6M8 3v3h8V3" />
    </>
  ),
  chart: (
    <>
      <path d="M3 3v18h18M7 16v-4m5 4V8m5 8V5" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="m9 3 1 2h4l1-2 3 2-1 2 2 3 2 1v3l-2 1-2 3 1 2-3 2-1-2h-4l-1 2-3-2 1-2-2-3-2-1v-3l2-1 2-3-1-2z" />
    </>
  ),
  arrow: <path d="m9 5 7 7-7 7" />,
  plus: <path d="M12 5v14M5 12h14" />,
  sync: (
    <>
      <path d="M20 7v5h-5M4 17v-5h5" />
      <path d="M6 6a8 8 0 0 1 14 6M4 12a8 8 0 0 0 14 6" />
    </>
  ),
  out: (
    <>
      <path d="M14 3h7v7m0-7L10 14M10 3H3v18h18v-7" />
    </>
  ),
  logout: <path d="M9 4H3v16h6m5-12 4 4-4 4m-7-4h11" />,
  folder: <path d="M3 5h7l2 3h9v12H3z" />,
  file: <path d="M5 2h9l5 5v15H5zm9 0v6h5" />,
  search: (
    <>
      <circle cx="10" cy="10" r="6" />
      <path d="m15 15 6 6" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6v6l4 2" />
    </>
  ),
  close: <path d="m6 6 12 12M6 18 18 6" />,
  download: <path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4" />,
};
function Icon({ name }: { name: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.file}
    </svg>
  );
}
function format(value: string, withTime = true) {
  return value
    ? new Intl.DateTimeFormat('vi-VN', {
        dateStyle: 'short',
        ...(withTime ? { timeStyle: 'short' as const } : {}),
        timeZone: 'Asia/Ho_Chi_Minh',
      }).format(new Date(value))
    : 'Chưa có';
}
function localDate(value = '') {
  return value ? new Date(new Date(value).getTime() + 7 * 3600000).toISOString().slice(0, 16) : '';
}
const today = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
const dateTime = (value: string) => (value ? new Date(`${value}:00+07:00`).toISOString() : '');
const val = (fd: FormData, key: string) => String(fd.get(key) || '');
function Tag({ status, children }: { status?: string; children?: ReactNode }) {
  return (
    <span className={`tag ${status || ''}`}>
      {children || statusLabels[status || ''] || status}
    </span>
  );
}
function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon name="book" />
      </span>
      <h3>{title}</h3>
      <div>{children}</div>
    </div>
  );
}
function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="dialog-heading">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="Đóng" onClick={close}>
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export default function Classroom() {
  const [boot, setBoot] = useState<Bootstrap | null>(null),
    [data, setData] = useState<Data | null>(null),
    [page, setPage] = useState<Page>('dashboard');
  const [classId, setClassId] = useState(''),
    [sessionId, setSessionId] = useState(''),
    [assignmentId, setAssignmentId] = useState('');
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [modal, setModal] = useState<ModalState | null>(null),
    [query, setQuery] = useState(''),
    [filter, setFilter] = useState('all');
  const autoSyncRunning = useRef(false);
  const [autoSyncing, setAutoSyncing] = useState(false);
  const pending = useRef(new Map<string, string>());
  const request = useCallback(
    async (action: string, payload?: unknown): Promise<any> => {
      const key = JSON.stringify({ action, payload });
      let operationId = pending.current.get(key);
      if (!operationId) {
        operationId = crypto.randomUUID();
        pending.current.set(key, operationId);
      }
      let response: Response;
      let result: any;
      for (let attempt = 0; ; attempt++) {
        response = await fetch('/api/app', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': boot?.csrf || '' },
          body: JSON.stringify({ action, payload, operationId }),
        });
        result = await response.json();
        // Reuse the same receipt ID while an automatic sync temporarily owns the mutex.
        if (response.status === 409 && result.code === 'LOCKED' && attempt < 24) {
          await new Promise((resolve) => setTimeout(resolve, 750));
          continue;
        }
        break;
      }
      if (!response.ok || result.error)
        throw new Error(result.error || 'Không thể hoàn tất yêu cầu.');
      pending.current.delete(key);
      return result;
    },
    [boot?.csrf],
  );
  const refresh = useCallback(async () => {
    const response = await fetch('/api/app?action=bootstrap', { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    setBoot(result);
    if (result.authenticated && result.google?.connected && result.sheet) {
      const response = await fetch('/api/app?action=data', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setData(result.data);
    } else setData(null);
  }, []);
  useEffect(() => {
    refresh()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    const params = new URLSearchParams(location.search);
    if (params.has('oauth')) {
      if (params.get('oauth') === 'connected') setNotice('Đã kết nối Google.');
      else
        setError(
          'Kết nối Google chưa thành công. Kiểm tra quyền, callback và cấu hình, rồi thử lại.',
        );
      history.replaceState(null, '', '/');
    }
  }, [refresh]);
  useEffect(() => {
    if (!classId && data?.Classes[0]) setClassId(data.Classes[0].id);
  }, [data, classId]);
  const cls = data?.Classes.find((c) => c.id === classId);
  const sessions = data?.Sessions.filter((s) => s.class_id === classId) || [];
  const assignments =
    data?.Assignments.filter(
      (a) =>
        a.class_id === classId &&
        a.status === 'active' &&
        (!sessionId || a.session_id === sessionId),
    ) || [];
  const assignment = assignments.find((a) => a.id === assignmentId) || assignments[0];
  useEffect(() => {
    if (page !== 'submissions' || !assignment || busy || modal || !boot?.google?.connected) return;
    let active = true;
    const sync = async () => {
      if (autoSyncRunning.current) return;
      autoSyncRunning.current = true;
      setAutoSyncing(true);
      try {
        await request('sync', { assignment_id: assignment.id });
        if (active) await refresh();
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        autoSyncRunning.current = false;
        setAutoSyncing(false);
      }
    };
    void sync();
    const timer = setInterval(() => void sync(), 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [page, assignment?.id, busy, modal, boot?.google?.connected, request, refresh]);
  const students =
    data?.Students.filter((s) =>
      data.Enrollments.some((e) => e.class_id === classId && e.student_id === s.id),
    ) || [];
  const activeStudents = students.filter((s) =>
    data?.Enrollments.some(
      (e) => e.class_id === classId && e.student_id === s.id && e.status === 'active',
    ),
  );
  const scopedAssignments = assignments.filter((a) => a.status === 'active');
  const states = data
    ? scopedAssignments.flatMap((a) =>
        includedStudents(data, a).map((student) => ({
          ...submissionStatus(data, a, student.id),
          student,
          assignment: a,
        })),
      )
    : [];
  const submitted = states.filter((s) => s.files.length > 0).length,
    reviewed = states.filter((s) => s.files.length && s.review).length;
  const latestSync = data?.SyncLogs.filter(
    (s) => s.class_id === classId && s.status === 'success',
  ).at(-1);
  const run = async (task: () => Promise<unknown>, message?: string, refreshAfter = true) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await task();
      if (refreshAfter) await refresh();
      if (message) setNotice(message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const save = async (action: string, payload: unknown, close = true) => {
    const result = await request(action, payload);
    if (close) setModal(null);
    return result;
  };
  const go = (next: Page) => {
    setPage(next);
    setQuery('');
    setFilter('all');
  };
  const changeClass = (id: string) => {
    setClassId(id);
    setSessionId('');
    setAssignmentId('');
  };
  const footer = (
    <div className="form-footer">
      <button type="button" className="secondary" disabled={busy} onClick={() => setModal(null)}>
        Hủy
      </button>
      <button disabled={busy}>
        {busy ? 'Đang lưu…' : modal?.type === 'assignment' ? 'Lưu' : 'Lưu thay đổi'}
      </button>
    </div>
  );
  if (loading)
    return (
      <main className="login">
        <span className="brand-symbol">慧</span>
        <p role="status">Đang mở lớp học…</p>
      </main>
    );
  if (!boot?.authenticated)
    return (
      <main className="login-page">
        <div className="login-story">
          <span className="eyebrow">TIẾNG TRUNG TUỆ MINH</span>
          <h1>
            Mỗi bài học,
            <br />
            một bước tiến.
          </h1>
          <p>
            Một không gian gọn gàng để theo dõi lớp học,
            <br />
            chấm bài và đồng hành cùng học viên.
          </p>
          <div className="seal">
            学<span>Học mỗi ngày</span>
          </div>
        </div>
        <div className="login">
          <div className="brand">
            <span className="brand-symbol">慧</span>
            <div>
              <strong>Tuệ Minh</strong>
              <small>CLASSROOM</small>
            </div>
          </div>
          <h2>Chào cô, mời đăng nhập</h2>
          <p className="muted">Không gian quản lý dành riêng cho giáo viên.</p>
          {error && (
            <div role="alert" className="alert error">
              {error}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              void run(() =>
                request('login', { username: val(fd, 'username'), password: val(fd, 'password') }),
              );
            }}
          >
            <Field label="Tên đăng nhập">
              <input
                name="username"
                autoComplete="username"
                required
                maxLength={100}
                defaultValue="admin"
              />
            </Field>
            <Field label="Mật khẩu">
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                maxLength={128}
                required
              />
            </Field>
            <button className="full" disabled={busy}>
              {busy ? 'Đang đăng nhập…' : 'Đăng nhập vào lớp học'}
              <Icon name="arrow" />
            </button>
          </form>
          <small className="login-foot">Dữ liệu riêng tư · Chỉ giáo viên có quyền truy cập</small>
        </div>
      </main>
    );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Tuệ Minh Classroom">
          <span className="brand-symbol">慧</span>
          <div>
            <strong>Tuệ Minh</strong>
            <small>CLASSROOM</small>
          </div>
        </a>
        <span className="nav-label">KHÔNG GIAN GIẢNG DẠY</span>
        <nav>
          {nav.map((item) => (
            <button
              key={item.id}
              className={page === item.id ? 'active' : ''}
              onClick={() => go(item.id)}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {item.id === 'submissions' && submitted > reviewed && <b>{submitted - reviewed}</b>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span>温故而知新</span>
            <p>Ôn điều cũ, hiểu điều mới.</p>
          </div>
          <div className="teacher">
            <span className="avatar">GV</span>
            <div>
              <strong>Giáo viên Tuệ Minh</strong>
              <small>Quản trị viên</small>
            </div>
            <button
              aria-label="Đăng xuất"
              className="icon-button"
              disabled={busy}
              onClick={() => void run(() => request('logout'))}
            >
              <Icon name="logout" />
            </button>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            Không gian giảng dạy <span>/</span>{' '}
            <strong>{nav.find((n) => n.id === page)?.label}</strong>
          </div>
          <div className="topbar-right">
            {boot.environment?.mode === 'development' && <span className="dev-badge">DEV</span>}
            <span className={`connection-dot ${boot.google?.connected ? 'online' : ''}`} />
            <span>{boot.google?.connected ? 'Google đã kết nối' : 'Chưa kết nối Google'}</span>
            <span className="avatar small">GV</span>
          </div>
        </header>
        <main className="main">
          <div className="page-heading">
            <div>
              <span className="eyebrow">TUỆ MINH CLASSROOM</span>
              <h1>
                {page === 'dashboard'
                  ? 'Lớp học của bạn, trong tầm tay.'
                  : nav.find((n) => n.id === page)?.label}
              </h1>
              <p className="muted">
                {page === 'dashboard'
                  ? 'Cùng học viên tiến bộ, từ những bài học mỗi ngày.'
                  : page === 'submissions'
                    ? 'Theo dõi từng bài nộp, ghi nhận từng bước tiến.'
                    : page === 'settings'
                      ? 'Kết nối dữ liệu và quản lý không gian giảng dạy.'
                      : 'Dữ liệu được lưu trên Google Sheets của bạn.'}
              </p>
            </div>
            {data && page !== 'settings' && (
              <button
                className="secondary"
                disabled={busy}
                onClick={() => void run(refresh, 'Đã tải dữ liệu mới nhất.', false)}
              >
                <Icon name="sync" />
                Tải lại dữ liệu
              </button>
            )}
          </div>
          {error && (
            <div className="alert error" role="alert">
              <span>{error}</span>
              <button
                className="icon-button"
                onClick={() => setError('')}
                aria-label="Đóng thông báo"
              >
                <Icon name="close" />
              </button>
            </div>
          )}
          {notice && (
            <div className="alert success" role="status">
              {notice}
            </div>
          )}
          {boot.environment?.mode === 'development' && (
            <div className="dev-banner">
              Môi trường DEV · Chỉ đọc/ghi trong thư mục Drive thử nghiệm.{' '}
              <a
                href={`https://drive.google.com/drive/folders/${boot.environment.root}`}
                target="_blank"
                rel="noreferrer"
              >
                Mở Drive dev ↗
              </a>
            </div>
          )}
          {!data && page !== 'settings' ? (
            <section className="welcome card">
              <span className="eyebrow">BẮT ĐẦU KHÔNG GIAN GIẢNG DẠY</span>
              <h2>
                Kết nối một lần.
                <br />
                Bài học luôn ở đúng nơi.
              </h2>
              <p>
                Kết nối tài khoản Google của giáo viên, sau đó tạo bảng dữ liệu riêng cho lớp. File
                bài tập gốc được giữ nguyên trong Drive.
              </p>
              <div className="setup-steps">
                <div>
                  <b>01</b>
                  <strong>Kết nối Google</strong>
                  <small>Cấp quyền Drive và Sheets</small>
                </div>
                <div>
                  <b>02</b>
                  <strong>Xác minh lớp học</strong>
                  <small>Học viên, buổi học và thư mục</small>
                </div>
                <div>
                  <b>03</b>
                  <strong>Bắt đầu chấm bài</strong>
                  <small>Nhận xét và theo dõi tiến độ</small>
                </div>
              </div>
              <button onClick={() => go('settings')}>
                Thiết lập kết nối
                <Icon name="arrow" />
              </button>
              <div className="welcome-character" aria-hidden="true">
                学
              </div>
            </section>
          ) : null}
          {data && page !== 'settings' && (
            <div className="scope-bar">
              <Field label="Lớp học">
                <select value={classId} onChange={(e) => changeClass(e.target.value)}>
                  {data.Classes.map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.name}
                      {c.status === 'inactive' ? ' · đã ngừng' : ''}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Buổi học">
                <select
                  value={sessionId}
                  onChange={(e) => {
                    setSessionId(e.target.value);
                    setAssignmentId('');
                  }}
                >
                  <option value="">Tất cả buổi học</option>
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="sync-status">
                <span className={`connection-dot ${latestSync ? 'online' : ''}`} />
                <div>
                  <strong>
                    {latestSync ? 'Lần đồng bộ thành công gần nhất' : 'Chưa đồng bộ bài tập'}
                  </strong>
                  <small>
                    {latestSync
                      ? format(latestSync.finished_at)
                      : 'Không kết luận trạng thái từ dữ liệu chưa đồng bộ'}
                  </small>
                </div>
              </div>
            </div>
          )}
          {data && page === 'dashboard' && (
            <>
              {cls && activeStudents.length < Number(cls.expected_students) && (
                <div className="alert warning">
                  <span>
                    Danh sách hiện có {activeStudents.length}/{cls.expected_students} học viên đang
                    học. Còn thiếu {Number(cls.expected_students) - activeStudents.length} học viên
                    cần xác minh.
                  </span>
                  <button className="text-button" onClick={() => go('students')}>
                    Bổ sung danh sách →
                  </button>
                </div>
              )}
              <div className="stats-grid">
                {[
                  {
                    label: 'Học viên đang học',
                    value: activeStudents.length,
                    note: `${sessions.length} buổi học trong lớp`,
                    icon: 'users',
                    color: 'green',
                  },
                  {
                    label: 'Bài đã nộp',
                    value: submitted,
                    note: `${states.filter((s) => s.status === 'late').length} bài xác nhận nộp muộn`,
                    icon: 'book',
                    color: 'blue',
                  },
                  {
                    label: 'Đang chờ chấm',
                    value: states.filter((s) => s.files.length && !s.review).length,
                    note: 'Bài có file đã xác minh',
                    icon: 'clock',
                    color: 'amber',
                  },
                  {
                    label: 'Đã nhận xét',
                    value: reviewed,
                    note: `${states.filter((s) => s.status === 'missing').length} bài chưa nộp sau hạn`,
                    icon: 'check',
                    color: 'green',
                  },
                ].map((stat) => (
                  <article className="stat card" key={stat.label}>
                    <div>
                      <span>{stat.label}</span>
                      <span className={`stat-icon ${stat.color}`}>
                        <Icon name={stat.icon} />
                      </span>
                    </div>
                    <strong>{stat.value}</strong>
                    <small>{stat.note}</small>
                  </article>
                ))}
              </div>
              <div className="dashboard-columns">
                <section className="card">
                  <div className="section-heading">
                    <div>
                      <h2>Việc cần cô quan tâm</h2>
                      <p className="muted">Những bước nhỏ cho buổi học tiếp theo.</p>
                    </div>
                    <Icon name="check" />
                  </div>
                  <div className="task-list">
                    <button onClick={() => go('submissions')}>
                      <span className="task-symbol amber">
                        <Icon name="clock" />
                      </span>
                      <div>
                        <strong>
                          {states.filter((s) => s.files.length && !s.review).length} bài đang chờ
                          chấm
                        </strong>
                        <small>Mở bài nộp và gửi nhận xét cho học viên</small>
                      </div>
                      <Icon name="arrow" />
                    </button>
                    <button onClick={() => go('submissions')}>
                      <span className="task-symbol blue">
                        <Icon name="folder" />
                      </span>
                      <div>
                        <strong>
                          {states.filter((s) => s.status === 'folder_missing').length} học viên chưa
                          có thư mục
                        </strong>
                        <small>Đồng bộ tự khớp thư mục theo tên học viên</small>
                      </div>
                      <Icon name="arrow" />
                    </button>
                    <button onClick={() => go('sessions')}>
                      <span className="task-symbol green">
                        <Icon name="book" />
                      </span>
                      <div>
                        <strong>
                          {sessions.length} buổi học ·{' '}
                          {data.Assignments.filter((a) => a.class_id === classId).length} bài tập
                        </strong>
                        <small>Quản lý nội dung và hạn nộp của lớp</small>
                      </div>
                      <Icon name="arrow" />
                    </button>
                  </div>
                </section>
                <section className="card progress-card">
                  <span className="eyebrow">ĐỒNG HÀNH CÙNG LỚP</span>
                  <h2>
                    Mỗi nhận xét
                    <br />
                    đều có ý nghĩa.
                  </h2>
                  <div className="progress-number">
                    {submitted ? Math.round((reviewed / submitted) * 100) : 0}
                    <small>%</small>
                  </div>
                  <progress max={Math.max(submitted, 1)} value={reviewed} />
                  <p>
                    Đã nhận xét {reviewed}/{submitted} bài có file nộp.
                  </p>
                  <button className="text-button" onClick={() => go('reports')}>
                    Xem tiến độ lớp học →
                  </button>
                </section>
              </div>
              <section className="card">
                <div className="section-heading">
                  <div>
                    <h2>Nhật ký đồng bộ</h2>
                    <p className="muted">
                      Lỗi đồng bộ được giữ riêng, không chuyển thành “chưa nộp”.
                    </p>
                  </div>
                  <button className="text-button" onClick={() => go('submissions')}>
                    Mở bài tập →
                  </button>
                </div>
                {data.SyncLogs.filter((l) => l.class_id === classId).length ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Bài tập</th>
                          <th>Bắt đầu</th>
                          <th>Kết quả</th>
                          <th>Chi tiết</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.SyncLogs.filter((l) => l.class_id === classId)
                          .slice(-6)
                          .reverse()
                          .map((l) => (
                            <tr key={l.id}>
                              <td>
                                {data.Assignments.find((a) => a.id === l.assignment_id)?.name}
                              </td>
                              <td>{format(l.started_at)}</td>
                              <td>
                                <Tag
                                  status={
                                    l.status === 'success'
                                      ? 'submitted'
                                      : l.status === 'error'
                                        ? 'sync_error'
                                        : 'awaiting'
                                  }
                                >
                                  {l.status === 'success'
                                    ? 'Thành công'
                                    : l.status === 'error'
                                      ? 'Có lỗi'
                                      : 'Đang chạy / cần kiểm tra'}
                                </Tag>
                              </td>
                              <td>
                                {l.message || 'Nếu bị ngắt quá 5 phút, kiểm tra khóa tại Cài đặt.'}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty title="Chưa có lần đồng bộ nào">
                    Thêm buổi học, bài tập rồi đồng bộ Drive để đọc bài nộp.
                  </Empty>
                )}
              </section>
            </>
          )}
          {data && page === 'students' && (
            <section className="card">
              <div className="section-heading">
                <div>
                  <h2>
                    Danh sách học viên <span className="count">{students.length}</span>
                  </h2>
                  <p className="muted">Danh sách được xác nhận bởi giáo viên.</p>
                </div>
                <div className="button-row">
                  <button className="secondary" onClick={() => setModal({ type: 'import' })}>
                    Nhập danh sách
                  </button>
                  <button className="secondary" onClick={() => setModal({ type: 'enrollment' })}>
                    Gán học viên đã có
                  </button>
                  <button onClick={() => setModal({ type: 'student' })}>
                    <Icon name="plus" />
                    Thêm học viên
                  </button>
                </div>
              </div>
              <div className="table-toolbar">
                <div className="search">
                  <Icon name="search" />
                  <input
                    aria-label="Tìm học viên"
                    placeholder="Tìm theo tên hoặc email…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
              </div>
              {students.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Học viên</th>
                        <th>Email</th>
                        <th>Ngày tham gia</th>
                        <th>Trạng thái</th>
                        <th>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {students
                        .filter((s) =>
                          (s.name + ' ' + s.email)
                            .toLocaleLowerCase('vi')
                            .includes(query.toLocaleLowerCase('vi')),
                        )
                        .map((s) => {
                          const enrollment = data.Enrollments.find(
                            (e) => e.student_id === s.id && e.class_id === classId,
                          )!;
                          return (
                            <tr key={s.id}>
                              <td>
                                <div className="person">
                                  <span className="avatar">
                                    {s.name.split(' ').slice(-1)[0].slice(0, 1)}
                                  </span>
                                  <strong>{s.name}</strong>
                                </div>
                              </td>
                              <td>{s.email || '—'}</td>
                              <td>{enrollment.joined_at}</td>
                              <td>
                                <Tag
                                  status={enrollment.status === 'active' ? 'submitted' : 'awaiting'}
                                >
                                  {enrollment.status === 'active' ? 'Đang học' : 'Đã ngừng học'}
                                </Tag>
                              </td>
                              <td>
                                <div className="button-row">
                                  <button
                                    className="text-button"
                                    onClick={() => setModal({ type: 'student-history', row: s })}
                                  >
                                    Lịch sử
                                  </button>
                                  <button
                                    className="text-button"
                                    onClick={() => setModal({ type: 'student', row: s })}
                                  >
                                    Chỉnh sửa
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty title="Thêm những học viên đầu tiên">
                  Lớp dự kiến có {cls?.expected_students} học viên. Chưa có tên nào được tự động xác
                  nhận.
                </Empty>
              )}
            </section>
          )}
          {data && page === 'sessions' && (
            <section>
              <div className="section-heading">
                <div>
                  <h2>Hành trình học tập</h2>
                  <p className="muted">
                    Mỗi buổi có một nội dung BTVN, lưu trên Sheets và file BTVN.txt trong Drive.
                  </p>
                </div>
                <button onClick={() => setModal({ type: 'session' })}>
                  <Icon name="plus" />
                  Thêm buổi học
                </button>
              </div>
              {sessions.length ? (
                sessions
                  .filter((s) => !sessionId || s.id === sessionId)
                  .map((s, index) => (
                    <article className="card session-card" key={s.id}>
                      <div className="section-heading">
                        <div className="session-title">
                          <span className="session-number">
                            {String(index + 1).padStart(2, '0')}
                          </span>
                          <div>
                            <h2>{s.name}</h2>
                            <p className="muted">
                              {s.date} ·{' '}
                              {s.deadline ? `Hạn nộp: ${format(s.deadline)}` : 'Chưa có hạn nộp'} ·{' '}
                              {s.status === 'active' ? 'Đang hoạt động' : 'Đã ngừng'}
                            </p>
                          </div>
                        </div>
                        <button
                          className="text-button"
                          onClick={() => setModal({ type: 'session', row: s })}
                        >
                          Sửa buổi học
                        </button>
                      </div>
                      <p className="session-content">{s.content || 'Chưa có nội dung buổi học.'}</p>
                      <div className="assignment-list">
                        {data.Assignments.filter(
                          (a) => a.session_id === s.id && a.status === 'active',
                        ).map((a) => (
                          <div key={a.id}>
                            <Icon name="file" />
                            <div>
                              <strong>{a.name}</strong>
                              <p>{a.requirements || 'Chưa có yêu cầu chi tiết.'}</p>
                              <small>
                                {includedStudents(data, a).length} học viên cần nộp ·{' '}
                                {a.status === 'active' ? 'Đang giao' : 'Đã ngừng'}
                              </small>
                            </div>
                            <button
                              className="text-button"
                              onClick={() => setModal({ type: 'assignment', row: a })}
                            >
                              Sửa bài tập
                            </button>
                            <button
                              className="secondary compact"
                              onClick={() => {
                                setSessionId(s.id);
                                setAssignmentId(a.id);
                                go('submissions');
                              }}
                            >
                              Mở bài nộp
                            </button>
                          </div>
                        ))}
                      </div>
                      <button
                        className="text-button"
                        onClick={() =>
                          setModal({
                            type: 'assignment',
                            row: data.Assignments.find(
                              (a) => a.session_id === s.id && a.status === 'active',
                            ) || { session_id: s.id },
                          })
                        }
                      >
                        <Icon name="plus" />
                        {data.Assignments.some(
                          (a) => a.session_id === s.id && a.status === 'active',
                        )
                          ? 'Sửa BTVN'
                          : 'Thêm BTVN'}
                      </button>
                    </article>
                  ))
              ) : (
                <div className="card">
                  <Empty title="Buổi học đầu tiên đang chờ bạn">
                    Thêm ngày học, hạn nộp và chọn thư mục buổi học trên Drive.
                  </Empty>
                </div>
              )}
            </section>
          )}
          {data && page === 'submissions' && (
            <section className="card">
              <div className="section-heading">
                <div>
                  <h2>Bài nộp của học viên</h2>
                  <p className="muted">
                    Tự kiểm tra bài nộp mỗi 30 giây khi mở màn hình này. File trong folder học viên
                    được tự nhận để chấm bài.
                  </p>
                </div>
                <button
                  disabled={busy || autoSyncing || !assignment}
                  onClick={() =>
                    void run(
                      () => request('sync', { assignment_id: assignment!.id }),
                      'Đồng bộ hoàn tất.',
                    )
                  }
                >
                  <Icon name="sync" />
                  {busy || autoSyncing ? 'Đang đồng bộ…' : 'Đồng bộ Drive'}
                </button>
              </div>
              <div className="table-toolbar">
                <Field label="Bài tập">
                  <select
                    value={assignment?.id || ''}
                    onChange={(e) => setAssignmentId(e.target.value)}
                  >
                    {assignments.map((a) => (
                      <option key={a.id} value={a.id}>
                        {sessions.find((s) => s.id === a.session_id)?.name} · {a.name}
                      </option>
                    ))}
                    {!assignments.length && <option value="">Chưa có bài tập</option>}
                  </select>
                </Field>
                <div className="search">
                  <Icon name="search" />
                  <input
                    aria-label="Tìm học viên trong bài nộp"
                    placeholder="Tìm học viên…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <Field label="Trạng thái">
                  <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                    <option value="all">Tất cả trạng thái</option>
                    <option value="pending">Chờ chấm</option>
                    <option value="reviewed">Đã chấm / nhận xét</option>
                    <option value="has_files">Có bài nộp</option>
                    {Object.entries(statusLabels).map(([k, v]) => (
                      <option value={k} key={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              {assignment ? (
                <>
                  <div className="assignment-note">
                    <strong>{assignment.name}</strong>
                    <span>{assignment.requirements || 'Chưa có yêu cầu chi tiết.'}</span>
                    <small>
                      Thời gian nộp chỉ được xác nhận thủ công khi có bằng chứng. Dấu thời gian trên
                      Drive chỉ là metadata.
                    </small>
                  </div>
                  {includedStudents(data, assignment).length ? (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Học viên</th>
                            <th>Trạng thái nộp</th>
                            <th>File bài nộp</th>
                            <th>Điểm / nhận xét</th>
                            <th>Thao tác</th>
                          </tr>
                        </thead>
                        <tbody>
                          {includedStudents(data, assignment)
                            .filter((s) =>
                              s.name
                                .toLocaleLowerCase('vi')
                                .includes(query.toLocaleLowerCase('vi')),
                            )
                            .map((student) => ({
                              student,
                              ...submissionStatus(data, assignment, student.id),
                            }))
                            .filter(
                              (s) =>
                                filter === 'all' ||
                                (filter === 'pending'
                                  ? s.files.length && !s.review
                                  : filter === 'reviewed'
                                    ? s.review
                                    : filter === 'has_files'
                                      ? s.files.length
                                      : s.status === filter),
                            )
                            .map((s) => (
                              <tr key={s.student.id}>
                                <td>
                                  <strong>{s.student.name}</strong>
                                  <small className="block muted">
                                    {s.syncedAt ? `Đồng bộ: ${format(s.syncedAt)}` : 'Chưa đồng bộ'}
                                  </small>
                                </td>
                                <td>
                                  <Tag status={s.status} />
                                  {s.status === 'sync_error' && (
                                    <small className="block muted">
                                      Đang hiển thị file từ lần trước
                                    </small>
                                  )}
                                </td>
                                <td>
                                  <span className="file-count">{s.files.length} file</span>
                                  {s.files.slice(0, 2).map((f) => (
                                    <a
                                      key={f.id}
                                      className="file-link"
                                      href={f.url}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      {f.name}
                                      <Icon name="out" />
                                    </a>
                                  ))}
                                  {s.files.length > 2 && (
                                    <small>+{s.files.length - 2} file khác</small>
                                  )}
                                </td>
                                <td>
                                  {s.review ? (
                                    <>
                                      <strong className="score">
                                        {s.review.score !== ''
                                          ? `${s.review.score}/10`
                                          : 'Chỉ nhận xét'}
                                      </strong>
                                      <small className="block muted">
                                        Phiên bản {s.review.version}
                                      </small>
                                    </>
                                  ) : (
                                    <span className="muted">
                                      {s.files.length ? 'Chờ chấm' : 'Chưa có điểm'}
                                    </span>
                                  )}
                                </td>
                                <td>
                                  <div className="action-stack">
                                    <button
                                      className="compact"
                                      disabled={!s.files.length}
                                      onClick={() =>
                                        setModal({
                                          type: 'review',
                                          row: s.submission,
                                          student: s.student,
                                        })
                                      }
                                    >
                                      {s.review ? 'Xem / sửa nhận xét' : 'Chấm bài'}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <Empty title="Chưa có học viên cần nộp">
                      Bổ sung danh sách lớp và kiểm tra ngày tham gia hoặc danh sách giao bài.
                    </Empty>
                  )}
                </>
              ) : (
                <Empty title="Chưa có bài tập để chấm">
                  Thêm buổi học và giao bài tại mục Buổi học & bài tập.
                </Empty>
              )}
            </section>
          )}
          {data && page === 'reports' && (
            <section className="card">
              <div className="section-heading">
                <div>
                  <h2>Tiến độ theo học viên</h2>
                  <p className="muted">
                    Điểm trung bình tính các bài có điểm; điểm 0 luôn được tính.
                  </p>
                </div>
                <a
                  className="button secondary"
                  href={`/api/app?action=export&class_id=${encodeURIComponent(classId)}`}
                >
                  <Icon name="download" />
                  Xuất CSV
                </a>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Học viên</th>
                      <th>Phạm vi cần nộp</th>
                      <th>Có file nộp</th>
                      <th>Chưa nộp sau hạn</th>
                      <th>Đã có điểm</th>
                      <th>Trung bình</th>
                      <th>Tiến độ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((student) => {
                      const ss = states.filter((s) => s.student.id === student.id);
                      const graded = ss.filter(
                        (s) => s.review?.score !== undefined && s.review.score !== '',
                      );
                      const avg = average(graded.map((s) => s.review?.score));
                      return (
                        <tr key={student.id}>
                          <td>
                            <button
                              className="text-button"
                              onClick={() => setModal({ type: 'student-history', row: student })}
                            >
                              {student.name}
                            </button>
                          </td>
                          <td>{ss.length}</td>
                          <td>{ss.filter((s) => s.files.length).length}</td>
                          <td>{ss.filter((s) => s.status === 'missing').length}</td>
                          <td>{graded.length}</td>
                          <td>
                            <strong>{avg === null ? 'Chưa có điểm' : avg.toFixed(2)}</strong>
                          </td>
                          <td>
                            <progress
                              max={Math.max(ss.length, 1)}
                              value={ss.filter((s) => s.review).length}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {!students.length && (
                <Empty title="Chưa có dữ liệu báo cáo">
                  Báo cáo sẽ xuất hiện sau khi bổ sung học viên và bài tập.
                </Empty>
              )}
            </section>
          )}
          {page === 'settings' && (
            <Settings
              boot={boot}
              data={data}
              busy={busy}
              request={request}
              run={run}
              setModal={setModal}
            />
          )}
          <footer className="page-footer">
            <span>Tiếng Trung Tuệ Minh</span>
            <span>
              Chậm mà chắc, học mà vui. <b>每天进步一点点</b>
            </span>
          </footer>
        </main>
      </div>
      {modal && (
        <Modal
          title={
            (
              {
                student: 'Thông tin học viên',
                import: 'Nhập danh sách học viên',
                enrollment: 'Gán học viên vào lớp',
                session: 'Thông tin buổi học',
                assignment: 'Giao bài tập',

                review: `Chấm bài · ${modal.student?.name}`,
                class: 'Thông tin lớp học',
                time: 'Xác nhận thời điểm nộp',
                'student-history': `Lịch sử · ${modal.row?.name}`,
              } as Record<string, string>
            )[modal.type] || 'Thông tin'
          }
          close={() => {
            if (!busy) setModal(null);
          }}
        >
          {modal.type === 'student' && data && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                void run(
                  () =>
                    save('student', {
                      class_id: classId,
                      students: [
                        {
                          id: modal.row?.id,
                          version: modal.row?.version,
                          name: val(fd, 'name'),
                          email: val(fd, 'email'),
                          status: val(fd, 'status'),
                          joined_at: val(fd, 'joined_at'),
                        },
                      ],
                    }),
                  'Đã lưu học viên.',
                );
              }}
            >
              <Field label="Họ và tên">
                <input name="name" defaultValue={modal.row?.name} required maxLength={200} />
              </Field>
              <Field label="Email (không bắt buộc)">
                <input type="email" name="email" defaultValue={modal.row?.email} maxLength={200} />
              </Field>
              <Field label="Tham gia lớp từ ngày">
                <input
                  type="date"
                  name="joined_at"
                  required
                  defaultValue={
                    data.Enrollments.find(
                      (e) => e.student_id === modal.row?.id && e.class_id === classId,
                    )?.joined_at || today()
                  }
                />
              </Field>
              <Field label="Trạng thái trong lớp">
                <select
                  name="status"
                  defaultValue={
                    data.Enrollments.find(
                      (e) => e.student_id === modal.row?.id && e.class_id === classId,
                    )?.status || 'active'
                  }
                >
                  <option value="active">Đang học</option>
                  <option value="inactive">Ngừng theo học</option>
                </select>
              </Field>
              <p className="muted">
                Lớp: {cls?.name}. Ngừng theo học vẫn giữ lịch sử bài nộp và điểm.
              </p>
              {footer}
            </form>
          )}
          {modal.type === 'import' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const entries = val(fd, 'names')
                  .split('\n')
                  .filter((s) => s.trim())
                  .map((line) => {
                    const [name, email = ''] = line.split('|');
                    return {
                      name: name.trim(),
                      email: email.trim(),
                      status: 'active',
                      joined_at: val(fd, 'joined_at'),
                    };
                  });
                void run(
                  () => save('students-import', { class_id: classId, students: entries }),
                  'Đã nhập danh sách.',
                );
              }}
            >
              <Field
                label="Danh sách học viên"
                hint="Mỗi dòng: Họ tên | email (email không bắt buộc). Chỉ nhập học viên mới; không nhập lại danh sách đã có."
              >
                <textarea name="names" rows={9} required placeholder="Họ và tên | email" />
              </Field>
              <Field label="Tham gia từ ngày">
                <input type="date" name="joined_at" required defaultValue={today()} />
              </Field>
              <p className="muted">
                Tên trùng không tự gộp. Bạn có thể kiểm tra và ngừng bản ghi dư sau khi nhập.
              </p>
              {footer}
            </form>
          )}
          {modal.type === 'session' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                void run(
                  () =>
                    save('session', {
                      id: modal.row?.id,
                      version: modal.row?.version,
                      class_id: classId,
                      session_number: Number(val(fd, 'session_number')),
                      date: val(fd, 'date'),
                      deadline: dateTime(val(fd, 'deadline')),
                      folder_id: modal.row ? extractDriveId(val(fd, 'folder_id')) : '',
                      content: val(fd, 'content'),
                      status: val(fd, 'status'),
                    }),
                  'Đã lưu buổi học.',
                );
              }}
            >
              <Field
                label="Số buổi"
                hint="Tên folder tự động: Buổi xx_DD/MM/YYYY theo số buổi và ngày học."
              >
                <input
                  name="session_number"
                  type="number"
                  min={1}
                  max={999}
                  required
                  defaultValue={
                    modal.row
                      ? Number(modal.row.name.match(/^Buổi\s+(\d+)_/u)?.[1]) || 1
                      : Math.max(
                          0,
                          ...(data?.Sessions || [])
                            .filter((s) => s.class_id === classId)
                            .map((s) => Number(s.name.match(/^Buổi\s+(\d+)_/u)?.[1]) || 0),
                        ) + 1
                  }
                />
              </Field>
              <div className="form-grid">
                <Field label="Ngày học">
                  <input
                    type="date"
                    name="date"
                    defaultValue={modal.row?.date || today()}
                    required
                  />
                </Field>
                <Field label="Hạn nộp (giờ Việt Nam)">
                  <input
                    type="datetime-local"
                    name="deadline"
                    defaultValue={localDate(modal.row?.deadline)}
                  />
                </Field>
              </div>
              {modal.row ? (
                <Field
                  label="Link hoặc ID thư mục buổi học trên Drive"
                  hint="Thư mục phải nằm trong Drive root của lớp. Có thể tìm bằng trình duyệt Drive ở Cài đặt."
                >
                  <input name="folder_id" required defaultValue={modal.row?.folder_id} />
                </Field>
              ) : (
                <p className="muted">
                  Khi lưu, web tự tạo thư mục BVN → tên buổi học → thư mục mang họ tên từng học viên
                  đang học trong lớp. Thư mục đã có sẽ được dùng lại.
                </p>
              )}
              <Field label="Nội dung buổi học">
                <textarea
                  name="content"
                  rows={4}
                  maxLength={10000}
                  defaultValue={modal.row?.content}
                />
              </Field>
              <Field label="Trạng thái">
                <select name="status" defaultValue={modal.row?.status || 'active'}>
                  <option value="active">Hoạt động</option>
                  <option value="inactive">Ngừng</option>
                </select>
              </Field>
              {footer}
            </form>
          )}
          {modal.type === 'assignment' && data && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                void run(
                  () =>
                    save('assignment', {
                      id: modal.row?.id,
                      version: modal.row?.version,
                      session_id: modal.row?.session_id,
                      requirements: val(fd, 'requirements'),
                    }),
                  'Đã lưu yêu cầu và cập nhật BTVN.txt trên Drive.',
                );
              }}
            >
              <Field label="Yêu cầu bài tập">
                <textarea
                  name="requirements"
                  rows={7}
                  required
                  maxLength={10000}
                  defaultValue={modal.row?.requirements}
                />
              </Field>
              {footer}
            </form>
          )}
          {modal.type === 'class' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                void run(
                  () =>
                    save('class', {
                      id: modal.row?.id,
                      version: modal.row?.version,
                      name: val(fd, 'name'),
                      root_id: extractDriveId(val(fd, 'root_id')),
                      expected_students: Number(val(fd, 'expected_students')),
                      status: val(fd, 'status'),
                    }),
                  'Đã lưu lớp học.',
                );
              }}
            >
              <Field label="Tên lớp">
                <input name="name" required defaultValue={modal.row?.name} />
              </Field>
              <Field label="Drive root của lớp (link hoặc ID)">
                <input name="root_id" required defaultValue={modal.row?.root_id} />
              </Field>
              <Field label="Số học viên dự kiến">
                <input
                  name="expected_students"
                  type="number"
                  min="0"
                  max="10000"
                  required
                  defaultValue={modal.row?.expected_students || '0'}
                />
              </Field>
              <Field label="Trạng thái">
                <select name="status" defaultValue={modal.row?.status || 'active'}>
                  <option value="active">Hoạt động</option>
                  <option value="inactive">Ngừng</option>
                </select>
              </Field>
              {footer}
            </form>
          )}
          {modal.type === 'enrollment' && data && (
            <Enrollment
              data={data}
              classId={classId}
              busy={busy}
              request={request}
              run={run}
              close={() => setModal(null)}
            />
          )}
          {modal.type === 'review' && data && (
            <Review
              data={data}
              submission={modal.row!}
              request={request}
              run={run}
              busy={busy}
              csrf={boot.csrf || ''}
              onTime={() => setModal({ type: 'time', row: modal.row, student: modal.student })}
            />
          )}
          {modal.type === 'time' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                void run(
                  () =>
                    save('submission-time', {
                      submission_id: modal.row?.id,
                      version: modal.row?.version,
                      submitted_at: dateTime(val(fd, 'submitted_at')),
                    }),
                  'Đã cập nhật thời điểm xác nhận.',
                );
              }}
            >
              <div className="alert warning">
                Chỉ xác nhận khi có bằng chứng thời điểm nộp. Để trống để bỏ xác nhận; metadata
                Drive không chứng minh thời điểm file được chuyển vào folder.
              </div>
              <Field label="Thời điểm nộp đã xác nhận (giờ Việt Nam)">
                <input
                  name="submitted_at"
                  type="datetime-local"
                  defaultValue={localDate(modal.row?.submitted_at)}
                />
              </Field>
              {footer}
            </form>
          )}
          {modal.type === 'student-history' && data && (
            <div className="history">
              {data.Assignments.filter(
                (a) =>
                  a.class_id === classId &&
                  includedStudents(data, a).some((s) => s.id === modal.row?.id),
              ).map((a) => {
                const state = submissionStatus(data, a, modal.row!.id);
                return (
                  <article key={a.id}>
                    <h3>{a.name}</h3>
                    <Tag status={state.status} />
                    <p>
                      <strong>
                        Điểm:{' '}
                        {state.review?.score !== undefined && state.review.score !== ''
                          ? state.review.score
                          : 'Chưa có điểm'}
                      </strong>
                    </p>
                    {state.review && <p className="prewrap">{state.review.comment}</p>}
                    <small>{data.Sessions.find((s) => s.id === a.session_id)?.name}</small>
                  </article>
                );
              })}
              <p className="muted">Chỉ hiển thị bài tập học viên thuộc diện phải nộp.</p>
            </div>
          )}
          {error && (
            <div role="alert" className="alert error dialog-message">
              {error}
            </div>
          )}
          {notice && (
            <div role="status" className="alert success dialog-message">
              {notice}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
function extractDriveId(value: string) {
  return (
    value.match(/\/folders\/([\w-]+)/)?.[1] || value.match(/\/d\/([\w-]+)/)?.[1] || value.trim()
  );
}

function Enrollment({
  data,
  classId,
  busy,
  request,
  run,
  close,
}: {
  data: Data;
  classId: string;
  busy: boolean;
  request: RequestFn;
  run: RunFn;
  close: () => void;
}) {
  const available = data.Students.filter(
    (s) => !data.Enrollments.some((e) => e.class_id === classId && e.student_id === s.id),
  );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        void run(async () => {
          await request('enrollment', {
            class_id: classId,
            student_id: val(fd, 'student_id'),
            joined_at: val(fd, 'joined_at'),
          });
          close();
        }, 'Đã gán học viên vào lớp.');
      }}
    >
      <Field label="Học viên đã có trong hệ thống">
        <select name="student_id" required>
          {available.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.email ? ` · ${s.email}` : ''}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Tham gia từ ngày">
        <input name="joined_at" type="date" required defaultValue={today()} />
      </Field>
      {!available.length && <p>Chưa có học viên ngoài lớp này. Dùng Thêm học viên để tạo mới.</p>}
      <div className="form-footer">
        <button disabled={busy || !available.length}>Gán vào lớp</button>
      </div>
    </form>
  );
}
type RequestFn = (action: string, payload?: unknown) => Promise<any>;
type RunFn = (
  task: () => Promise<unknown>,
  message?: string,
  refreshAfter?: boolean,
) => Promise<void>;
function DriveBrowser({
  classId,
  root,
  onSelect,
}: {
  classId: string;
  root: string;
  onSelect: (file: FileItem) => void;
}) {
  const [trail, setTrail] = useState([{ id: root, name: 'Thư mục gốc' }]),
    [files, setFiles] = useState<FileItem[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState('');
  const current = trail.at(-1)!;
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setFiles([]);
    fetch(
      `/api/app?action=drive&class_id=${encodeURIComponent(classId)}&folder_id=${encodeURIComponent(current.id)}`,
      { signal: controller.signal },
    )
      .then(async (r) => {
        const v = await r.json();
        if (!r.ok) throw new Error(v.error);
        setFiles(v.files);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [current.id, classId]);
  return (
    <div className="drive-browser">
      <div className="drive-trail">
        {trail.map((f, i) => (
          <button
            type="button"
            key={f.id}
            className="text-button"
            onClick={() => setTrail(trail.slice(0, i + 1))}
          >
            {f.name}
            {i < trail.length - 1 ? ' /' : ''}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="alert error">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Đang đọc Drive…</p>
      ) : files.length ? (
        <ul>
          {files.map((f) => (
            <li key={f.id}>
              <Icon
                name={f.mimeType === 'application/vnd.google-apps.folder' ? 'folder' : 'file'}
              />
              <button
                type="button"
                className="file-name text-button"
                onClick={() =>
                  f.mimeType === 'application/vnd.google-apps.folder'
                    ? setTrail([...trail, { id: f.id, name: f.name }])
                    : onSelect(f)
                }
              >
                {f.name}
              </button>
              <button type="button" className="secondary compact" onClick={() => onSelect(f)}>
                Chọn
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">Thư mục trống.</p>
      )}
      <small className="muted">
        ID thư mục đang mở: <code>{current.id}</code>
      </small>
    </div>
  );
}
function Review({
  data,
  submission,
  request,
  run,
  busy,
  csrf,
  onTime,
}: {
  data: Data;
  submission: Row;
  request: RequestFn;
  run: RunFn;
  busy: boolean;
  csrf: string;
  onTime: () => void;
}) {
  const latest = lastReview(data, submission.id);
  const [preview, setPreview] = useState('');
  const [saved, setSaved] = useState(latest?.id || '');
  const uploadActions = useRef<{ uploadAll: (reviewId: string) => Promise<void> } | null>(null);
  const pendingReview = useRef<{ signature: string; id: string } | null>(null);
  const savedVersion = useRef(Number(latest?.version || 0));
  const files = data.SubmissionFiles.filter(
    (f) => f.submission_id === submission.id && f.present === 'true',
  );
  const reviews = data.Reviews.filter((r) => r.submission_id === submission.id).sort(
    (a, b) => Number(b.version) - Number(a.version),
  );
  return (
    <div className="review">
      <div className="review-files">
        {files.map((f) => (
          <div key={f.id}>
            <Icon name="file" />
            <strong>{f.name}</strong>
            <button className="text-button" onClick={() => setPreview(f.drive_id)}>
              Xem trước
            </button>
            <a href={f.url} target="_blank" rel="noreferrer" className="text-button">
              Mở Drive
              <Icon name="out" />
            </a>
          </div>
        ))}
      </div>
      {preview && (
        <div className="preview">
          <iframe
            title="Xem trước bài nộp từ Google Drive"
            src={`https://drive.google.com/file/d/${encodeURIComponent(preview)}/preview`}
            allow="fullscreen"
          />
          <small>
            Nếu Drive yêu cầu quyền hoặc không phát được, hãy mở file bằng liên kết Drive phía trên.
            Ứng dụng không thay đổi chia sẻ file.
          </small>
        </div>
      )}
      <button className="text-button" onClick={onTime}>
        Xác nhận thời điểm nộp{' '}
        {submission.submitted_at ? `· ${format(submission.submitted_at)}` : '· chưa rõ'}
      </button>
      <form
        key={latest?.id || 'new'}
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          void run(async () => {
            const payload = {
              submission_id: submission.id,
              expected_version: Math.max(Number(latest?.version || 0), savedVersion.current),
              score: val(fd, 'score') === '' ? null : Number(val(fd, 'score')),
              comment: val(fd, 'comment'),
            };
            const signature = JSON.stringify([payload.score, payload.comment]);
            let reviewId =
              pendingReview.current?.signature === signature ? pendingReview.current.id : '';
            if (!reviewId) {
              const result = await request('review', payload);
              reviewId = result.id;
              savedVersion.current = payload.expected_version + 1;
              pendingReview.current = { signature, id: reviewId };
            }
            setSaved(reviewId);
            await uploadActions.current?.uploadAll(reviewId);
            pendingReview.current = null;
          }, 'Đã lưu nhận xét và file đính kèm vào Nhan_xet_GV của học viên.');
        }}
      >
        <Field label="Điểm (0–10)" hint="Để trống nếu chỉ ghi nhận xét. Điểm 0 là một điểm hợp lệ.">
          <input
            className="score-input"
            name="score"
            type="number"
            min="0"
            max="10"
            step="0.1"
            defaultValue={latest?.score ?? ''}
          />
        </Field>
        <Field label="Nhận xét">
          <textarea
            name="comment"
            rows={5}
            maxLength={10000}
            defaultValue={latest?.comment}
            placeholder="Ghi nhận điểm tốt và điều học viên cần luyện thêm…"
          />
        </Field>
        <Field
          label="File đính kèm"
          hint="Chọn tài liệu hoặc video chữa bài. File sẽ được tải lên cùng lúc lưu nhận xét."
        >
          <UploadFiles
            reviewId={saved}
            request={request}
            csrf={csrf}
            actions={uploadActions}
            disabled={busy}
          />
        </Field>
        <button disabled={busy}>{busy ? 'Đang lưu và tải file…' : 'Lưu nhận xét và file'}</button>
      </form>
      <div className="review-upload">
        <h3>File & video chữa bài</h3>
        <p className="muted">
          Lưu nhận xét sẽ tự tạo file TXT trong Nhan_xet_GV của học viên. Bạn có thể tải thêm tài
          liệu hoặc video chữa bài.
        </p>
        {data.ReviewFiles.filter((f) => reviews.some((r) => r.id === f.review_id)).map((f) => (
          <a key={f.id} className="file-link" href={f.url} target="_blank" rel="noreferrer">
            {f.name}
            <Icon name="out" />
          </a>
        ))}
      </div>
      <details className="review-history">
        <summary>Lịch sử nhận xét ({reviews.length})</summary>
        {reviews.map((r) => (
          <article key={r.id}>
            <div>
              <strong>
                Phiên bản {r.version} · {r.score !== '' ? `${r.score}/10` : 'Chỉ nhận xét'}
              </strong>
              <small>
                {format(r.created_at)} · {r.reviewer}
              </small>
            </div>
            <p className="prewrap">{r.comment || 'Không có nhận xét chữ.'}</p>
          </article>
        ))}
      </details>
    </div>
  );
}
type UploadItem = {
  file: File;
  id: string;
  progress?: Progress;
  error?: string;
  working?: boolean;
  reviewId?: string;
};
function UploadFiles({
  reviewId,
  request,
  csrf,
  actions,
  disabled,
}: {
  reviewId: string;
  request: RequestFn;
  csrf: string;
  actions: { current: { uploadAll: (reviewId: string) => Promise<void> } | null };
  disabled: boolean;
}) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const running = useRef(new Set<string>());
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const update = (id: string, patch: Partial<UploadItem>) =>
    setItems((previous) => previous.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const upload = async (item: UploadItem, targetReviewId: string) => {
    if (running.current.has(item.id)) return;
    running.current.add(item.id);
    const owner = item.reviewId || targetReviewId;
    update(item.id, { working: true, error: '', reviewId: owner });
    try {
      let progress = item.progress;
      if (!progress) {
        progress = await request('upload-init', {
          review_id: owner,
          name: item.file.name,
          mime: item.file.type || 'application/octet-stream',
          size: item.file.size,
          upload_key: item.id,
        });
      } else progress = await request('upload-status', { id: progress.id });
      update(item.id, { progress });
      while (progress && !progress.complete) {
        const end = Math.min(progress.offset + progress.chunkSize, item.file.size);
        const response = await fetch(`/api/uploads/${encodeURIComponent(progress.id)}`, {
          method: 'PUT',
          headers: { 'x-csrf-token': csrf, 'x-upload-offset': String(progress.offset) },
          body: item.file.slice(progress.offset, end),
        });
        const next = await response.json();
        if (!response.ok) throw new Error(next.error || 'Chưa xác nhận được upload.');
        progress = next;
        update(item.id, { progress });
      }
    } catch (e) {
      update(item.id, { error: (e as Error).message });
      throw e;
    } finally {
      running.current.delete(item.id);
      update(item.id, { working: false });
    }
  };
  useEffect(() => {
    actions.current = {
      uploadAll: async (id: string) => {
        for (const item of itemsRef.current) if (!item.progress?.recorded) await upload(item, id);
      },
    };
    return () => {
      actions.current = null;
    };
  }, [request, csrf, reviewId]);
  return (
    <div>
      <label className="upload-drop">
        <Icon name="plus" />
        <strong>Chọn file hoặc video chữa bài</strong>
        <small>Upload theo từng phần 1 MB · Không công khai file</small>
        <input
          type="file"
          multiple
          disabled={disabled}
          aria-label="Chọn nhiều file chữa bài"
          onChange={(e) => {
            const next = Array.from(e.target.files || []).map((file) => ({
              file,
              id: crypto.randomUUID(),
            }));
            setItems((previous) => [...previous, ...next]);
            e.target.value = '';
          }}
        />
      </label>
      {items.map((item) => (
        <div className="upload-item" key={item.id}>
          <strong>{item.file.name}</strong>
          <small>
            {(item.file.size / 1024 / 1024).toFixed(1)} MB
            {item.progress ? ` · Mã phục hồi: ${item.progress.id}` : ''}
          </small>
          <progress max={item.file.size} value={item.progress?.offset || 0} />
          {item.progress?.recorded ? (
            <Tag status="submitted">Đã xác nhận trên Drive & Sheets</Tag>
          ) : (
            <span>
              {item.working
                ? 'Đang upload…'
                : item.progress
                  ? 'Bấm Lưu để tiếp tục tải'
                  : 'Sẽ tải khi lưu nhận xét'}
            </span>
          )}
          {item.error && (
            <p role="alert" className="alert error">
              {item.error} File đã lên Drive nhưng chưa ghi Sheets có thể đối soát trong Cài đặt.
            </p>
          )}
        </div>
      ))}
      <p className="muted">
        <small>
          Giữ form mở trong khi tải. Nếu bị gián đoạn, bấm Lưu nhận xét và file để tiếp tục tải.
        </small>
      </p>
    </div>
  );
}
function Settings({
  boot,
  data,
  busy,
  request,
  run,
  setModal,
}: {
  boot: Bootstrap;
  data: Data | null;
  busy: boolean;
  request: RequestFn;
  run: RunFn;
  setModal: (m: ModalState) => void;
}) {
  const [browse, setBrowse] = useState(''),
    [selected, setSelected] = useState(''),
    [health, setHealth] = useState('');
  return (
    <div className="settings-grid">
      <section className="card">
        <div className="section-heading">
          <div>
            <h2>Kết nối Google</h2>
            <p className="muted">Tài khoản giáo viên, tách biệt với đăng nhập website.</p>
          </div>
          <Tag status={boot.google?.connected ? 'submitted' : 'awaiting'}>
            {boot.google?.connected ? 'Đã kết nối' : 'Chưa kết nối'}
          </Tag>
        </div>
        <p>{boot.google?.email || 'Chưa có tài khoản Google được kết nối.'}</p>
        {!boot.google?.configured && (
          <div className="alert warning">
            Cần cấu hình GOOGLE_CLIENT_ID và GOOGLE_CLIENT_SECRET trong phần biến môi trường của
            Netlify trước khi kết nối. Không nhập secret vào hội thoại.
          </div>
        )}
        <div className="button-row">
          <button
            disabled={busy || !boot.google?.configured}
            onClick={() =>
              void run(
                async () => {
                  const result = await request('google-connect');
                  location.assign(result.url);
                },
                undefined,
                false,
              )
            }
          >
            {boot.google?.connected ? 'Kết nối lại Google' : 'Kết nối Google'}
          </button>
          {boot.google?.connected && (
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                void run(() => request('google-disconnect'), 'Đã ngắt kết nối Google.')
              }
            >
              Ngắt kết nối
            </button>
          )}
        </div>
        <details>
          <summary>Cấu hình OAuth</summary>
          <p>Bật Google Drive API và Google Sheets API. Tạo OAuth client loại Web application.</p>
          <p>Redirect URI chính xác:</p>
          <code className="code-block">{boot.google?.callback}</code>
          <p>
            Backend authorization code + PKCE; không cần JavaScript origin. Thêm email giáo viên làm
            Test user khi dùng chế độ Testing.
          </p>
          <p>
            Scope: <code>https://www.googleapis.com/auth/drive</code> và{' '}
            <code>https://www.googleapis.com/auth/userinfo.email</code>. Quyền Drive đầy đủ phục vụ
            ghi vào thư mục có sẵn; mã ứng dụng không sửa hoặc xóa file gốc. Sheets API chấp nhận
            cùng scope Drive.
          </p>
          <p>
            Ở chế độ Testing, refresh token thường hết hạn sau 7 ngày. Xem README để phân biệt sử
            dụng nội bộ và xác minh Production.
          </p>
        </details>
      </section>
      <section className="card">
        <h2>Bảng dữ liệu Google Sheets</h2>
        <p className="muted">Danh sách lớp, bài nộp và lịch sử nhận xét được lưu tại đây.</p>
        {boot.sheet ? (
          <>
            <a className="button secondary" href={boot.sheet.url} target="_blank" rel="noreferrer">
              <Icon name="out" />
              Mở Google Sheets
            </a>
            <p className="muted">
              Bảo toàn tên bảng và hàng tiêu đề. Không sửa đồng thời bằng tay khi website đang ghi.
            </p>
          </>
        ) : (
          <>
            <p>
              Khởi tạo bảng riêng gồm các bảng nghiệp vụ, schema và biên nhận thao tác. Lớp HSK_UET
              gồm đúng danh sách 12 học viên đã cung cấp. Cấu trúc bài tập: BVN → Buổi học → folder
              học viên.
            </p>
            <button
              disabled={busy || !boot.google?.connected}
              onClick={() => void run(() => request('initialize'), 'Đã khởi tạo Google Sheets.')}
            >
              Tạo bảng dữ liệu
            </button>
          </>
        )}
        <details>
          <summary>Phục hồi bảng mới khởi tạo bị ngắt</summary>
          <p>
            Chỉ sử dụng khi file đã được tạo nhưng hoàn toàn trống; hệ thống không ghi đè bảng có dữ
            liệu.
          </p>
          <button
            className="secondary"
            disabled={busy}
            onClick={() =>
              void run(() => request('resume-initialize'), 'Đã phục hồi cấu trúc bảng.')
            }
          >
            Khởi tạo lại bảng trống
          </button>
        </details>
      </section>
      {data && (
        <section className="card wide">
          <div className="section-heading">
            <div>
              <h2>Các lớp học</h2>
              <p className="muted">Mỗi lớp có Drive root và danh sách ghi danh riêng.</p>
            </div>
            <button className="secondary" onClick={() => setModal({ type: 'class' })}>
              <Icon name="plus" />
              Thêm lớp
            </button>
          </div>
          {data.Classes.map((c) => (
            <div className="settings-class" key={c.id}>
              <div>
                <strong>{c.name}</strong>
                <small>
                  {c.expected_students} học viên dự kiến ·{' '}
                  {c.status === 'active' ? 'Hoạt động' : 'Đã ngừng'}
                </small>
              </div>
              <button className="text-button" onClick={() => setModal({ type: 'class', row: c })}>
                Chỉnh sửa
              </button>
              <button
                className="secondary compact"
                onClick={() => {
                  setBrowse(browse === c.id ? '' : c.id);
                  setSelected('');
                }}
              >
                Duyệt Drive
              </button>
            </div>
          ))}
          {browse && (
            <>
              <DriveBrowser
                classId={browse}
                root={data.Classes.find((c) => c.id === browse)!.root_id}
                onSelect={(f) => setSelected(`${f.name}: ${f.id}`)}
              />
              {selected && <p className="selected-file">{selected}</p>}
            </>
          )}
        </section>
      )}
      <section className="card">
        <h2>Bảo mật quản trị</h2>
        <p className="muted">
          Tài khoản cố định: admin. Phiên hết hạn sau 8 giờ, có đăng xuất. Không giới hạn số lần
          đăng nhập.
        </p>
        <h3 className="spaced">Đồng bộ thủ công</h3>
        <p>Chưa cấu hình lịch chạy tự động. Mở bài tập và bấm Đồng bộ Drive để lấy dữ liệu mới.</p>
      </section>
      <section className="card">
        <h2>Phục hồi & đối soát</h2>
        <p className="muted">
          Dùng khi yêu cầu bị ngắt hoặc chưa xác định kết quả. Không tự gửi lại toàn bộ file.
        </p>
        <button
          className="secondary"
          disabled={busy}
          onClick={() =>
            void run(
              async () => {
                const r = await fetch('/api/app?action=health');
                const result = await r.json();
                if (!r.ok) throw new Error(result.error);
                setHealth(JSON.stringify(result, null, 2));
              },
              undefined,
              false,
            )
          }
        >
          Kiểm tra trạng thái ghi
        </button>
        {health && <pre className="health">{health}</pre>}
        <details>
          <summary>Phục hồi thao tác ghi Sheets</summary>
          <p>
            Chờ ít nhất 5 phút để yêu cầu cũ kết thúc. Nếu khóa business còn bận, giải phóng khóa
            trước; sau đó đối soát biên nhận trên Sheets.
          </p>
          <button
            className="secondary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const r = await request('reconcile-write');
                setHealth(r.result);
              }, 'Đã đối soát lần ghi.')
            }
          >
            Đối soát lần ghi chưa rõ
          </button>
        </details>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            void run(
              () => request('upload-reconcile', { id: val(fd, 'id') }),
              'Đã xác nhận file Drive và ghi liên kết lên Sheets.',
            );
          }}
        >
          <Field label="Mã upload cần đối soát">
            <input name="id" required placeholder="Mã phục hồi hiển thị khi upload" />
          </Field>
          <button disabled={busy} className="secondary">
            Đối soát file đã tải
          </button>
        </form>
        <details>
          <summary>Giải phóng khóa bị ngắt</summary>
          <p>
            Chỉ thực hiện sau 5 phút khi thao tác cũ đã dừng. Mặc định là business; khóa khác dùng
            tên hiển thị trong yêu cầu lỗi hoặc mã upload.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              void run(
                () => request('recover-lock', { name: val(fd, 'name') }),
                'Đã giải phóng khóa. Kiểm tra dữ liệu trước khi thử lại.',
              );
            }}
          >
            <Field label="Tên khóa">
              <input name="name" defaultValue="business" required />
            </Field>
            <button className="secondary" disabled={busy}>
              Giải phóng khóa cũ
            </button>
          </form>
        </details>
      </section>
    </div>
  );
}
