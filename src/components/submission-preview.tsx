'use client';
import type { Row } from '@/lib/model';
export default function SubmissionPreview({
  files,
  selected,
  onSelect,
  onClose,
}: {
  files: Row[];
  selected: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  if (!files.length) return null;
  const index = Math.max(
    0,
    files.findIndex((f) => f.drive_id === selected),
  );
  const file = files[index];
  const move = (direction: number) => {
    const next = index + direction;
    if (next >= 0 && next < files.length) onSelect(files[next].drive_id);
  };
  return (
    <section
      className="preview submission-preview"
      aria-label="Xem trước các file bài nộp"
      tabIndex={0}
      onKeyDown={(event) => {
        if (
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          (event.target as HTMLElement).closest('input,textarea,select,[contenteditable="true"]')
        )
          return;
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          move(-1);
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          move(1);
        }
      }}
    >
      <div className="submission-preview-controls">
        <button
          type="button"
          className="secondary compact"
          disabled={index === 0}
          onClick={() => move(-1)}
          aria-label="File trước"
        >
          ← Trước
        </button>
        <span className="submission-preview-count" aria-live="polite">
          {index + 1} / {files.length}
        </span>
        <button
          type="button"
          className="secondary compact"
          disabled={index === files.length - 1}
          onClick={() => move(1)}
          aria-label="File tiếp theo"
        >
          Sau →
        </button>
        <button type="button" className="text-button" onClick={onClose}>
          Ẩn xem trước
        </button>
      </div>
      <label className="submission-preview-select">
        <span>File đang xem</span>
        <select
          aria-label="Chọn file xem trước"
          value={file.drive_id}
          onChange={(event) => onSelect(event.target.value)}
        >
          {files.map((item, i) => (
            <option value={item.drive_id} key={item.id}>
              {i + 1}. {item.name}
            </option>
          ))}
        </select>
      </label>
      <p className="submission-preview-name">
        <strong>{file.name}</strong>
        <a className="text-button" href={file.url} target="_blank" rel="noreferrer">
          Mở file này trên Drive ↗
        </a>
      </p>
      <iframe
        key={file.drive_id}
        title={`Xem trước ${index + 1}/${files.length}: ${file.name}`}
        src={`https://drive.google.com/file/d/${encodeURIComponent(file.drive_id)}/preview`}
        allow="fullscreen"
      />
      <small>
        Dùng nút Trước / Sau hoặc phím ← / → khi chọn khung điều hướng. Nếu Drive yêu cầu đăng nhập
        hoặc không phát video, mở file trên Drive.
      </small>
    </section>
  );
}
