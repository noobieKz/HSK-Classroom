'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { FeedbackUploadQueue, type FeedbackUploadJob } from '@/lib/feedback-upload-queue';
const empty: FeedbackUploadJob[] = [];
export default function FeedbackUploadDock({ queue }: { queue: FeedbackUploadQueue }) {
  const jobs = useSyncExternalStore(queue.subscribe, queue.getSnapshot, () => empty);
  const [minimized, setMinimized] = useState(false);
  const active = jobs.filter((j) => j.status === 'queued' || j.status === 'uploading').length;
  const failed = jobs.filter((j) => j.status === 'failed').length;
  useEffect(() => {
    if (!active) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [active]);
  if (!jobs.length) return null;
  return (
    <aside className="feedback-upload-dock" aria-label="Tiến độ tải file nhận xét">
      <div className="feedback-upload-heading">
        <strong aria-live="polite">
          {active
            ? `Đang tải ${active} file`
            : failed
              ? `${failed} file cần thử lại`
              : 'Đã tải xong'}
        </strong>
        <button
          type="button"
          className="text-button"
          aria-label={minimized ? 'Mở rộng tiến độ upload' : 'Thu nhỏ tiến độ upload'}
          onClick={() => setMinimized(!minimized)}
        >
          {minimized ? 'Mở rộng' : 'Thu nhỏ'}
        </button>
        {!active && !failed && (
          <button
            type="button"
            className="text-button"
            aria-label="Đóng tiến độ upload"
            onClick={() => queue.clearCompleted()}
          >
            Đóng
          </button>
        )}
      </div>
      {!minimized && (
        <div className="feedback-upload-body">
          <p className="muted">Bạn có thể chấm học viên khác trong khi tải. Giữ tab này mở.</p>
          {jobs.map((job) => (
            <div className="feedback-upload-job" key={job.id}>
              <strong>{job.studentName}</strong>
              <span>{job.file.name}</span>
              <progress
                aria-label={`Tiến độ ${job.file.name} · ${job.studentName}`}
                max={job.file.size || 1}
                value={job.progress?.offset || 0}
              />
              <small>
                {job.status === 'done'
                  ? 'Đã lưu trên Drive'
                  : job.status === 'failed'
                    ? 'Tải chưa xong'
                    : job.status === 'queued'
                      ? 'Đang chờ tải'
                      : `${Math.round(((job.progress?.offset || 0) / Math.max(1, job.file.size)) * 100)}% · Đang tải`}
              </small>
              {job.error && (
                <p role="alert" className="alert error">
                  {job.error}
                </p>
              )}
              {job.status === 'failed' && (
                <button
                  type="button"
                  className="secondary compact"
                  onClick={() => queue.retry(job.id)}
                >
                  Thử lại
                </button>
              )}
            </div>
          ))}
          {jobs.some((j) => j.status === 'done') && (
            <button type="button" className="text-button" onClick={() => queue.clearCompleted()}>
              Ẩn file đã tải xong
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
