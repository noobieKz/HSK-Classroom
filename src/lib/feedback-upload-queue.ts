export type UploadProgress = {
  id: string;
  size: number;
  offset: number;
  complete: boolean;
  recorded: boolean;
  chunkSize: number;
};
export type FeedbackUploadJob = {
  id: string;
  reviewId: string;
  studentName: string;
  file: File;
  status: 'queued' | 'uploading' | 'failed' | 'done';
  progress?: UploadProgress;
  error?: string;
};
type Dependencies = {
  request: (action: string, payload: unknown) => Promise<any>;
  csrf: () => string;
  fetch?: typeof fetch;
  onComplete?: () => void;
};
export class FeedbackUploadQueue {
  private jobs: FeedbackUploadJob[] = [];
  private listeners = new Set<() => void>();
  private working = false;
  constructor(private dependencies: Dependencies) {}
  getSnapshot = () => this.jobs;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private emit() {
    for (const listener of this.listeners) listener();
  }
  private update(id: string, patch: Partial<FeedbackUploadJob>) {
    this.jobs = this.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j));
    this.emit();
  }
  enqueue(reviewId: string, studentName: string, files: File[]) {
    const fresh = files.filter(
      (file) =>
        !this.jobs.some(
          (j) =>
            j.reviewId === reviewId &&
            j.file.name === file.name &&
            j.file.size === file.size &&
            j.file.lastModified === file.lastModified,
        ),
    );
    this.jobs = [
      ...this.jobs,
      ...fresh.map((file) => ({
        id: crypto.randomUUID(),
        reviewId,
        studentName,
        file,
        status: 'queued' as const,
      })),
    ];
    this.emit();
    void this.pump();
  }
  retry(id: string) {
    const job = this.jobs.find((j) => j.id === id);
    if (!job || job.status !== 'failed') return;
    this.update(id, { status: 'queued', error: undefined });
    void this.pump();
  }
  clearCompleted() {
    this.jobs = this.jobs.filter((j) => j.status !== 'done');
    this.emit();
  }
  private async pump() {
    if (this.working) return;
    this.working = true;
    try {
      let job: FeedbackUploadJob | undefined;
      while ((job = this.jobs.find((j) => j.status === 'queued'))) {
        const current = job;
        this.update(current.id, { status: 'uploading', error: undefined });
        try {
          await this.upload(current);
          this.update(current.id, { status: 'done' });
          this.dependencies.onComplete?.();
        } catch (error) {
          this.update(current.id, {
            status: 'failed',
            error:
              error instanceof Error
                ? error.message
                : 'Không thể tải file. Bấm Thử lại để tiếp tục.',
          });
        }
      }
    } finally {
      this.working = false;
    }
  }
  private async upload(job: FeedbackUploadJob) {
    let progress: UploadProgress = job.progress
      ? await this.dependencies.request('upload-status', { id: job.progress.id })
      : await this.dependencies.request('upload-init', {
          review_id: job.reviewId,
          name: job.file.name,
          mime: job.file.type || 'application/octet-stream',
          size: job.file.size,
          upload_key: job.id,
        });
    this.update(job.id, { progress });
    while (!progress.complete) {
      const end = Math.min(progress.offset + progress.chunkSize, job.file.size);
      const response = await (this.dependencies.fetch || fetch)(
        `/api/uploads/${encodeURIComponent(progress.id)}`,
        {
          method: 'PUT',
          headers: {
            'x-csrf-token': this.dependencies.csrf(),
            'x-upload-offset': String(progress.offset),
          },
          body: job.file.slice(progress.offset, end),
        },
      );
      const next: UploadProgress & { error?: string } = await response.json();
      if (!response.ok)
        throw new Error(next.error || 'Upload chưa hoàn tất. Bấm Thử lại để kiểm tra và tiếp tục.');
      if (next.offset <= progress.offset && !next.complete)
        throw new Error('Chưa xác nhận được tiến độ upload. Bấm Thử lại.');
      progress = next;
      this.update(job.id, { progress });
    }
    if (!progress.recorded) {
      progress = await this.dependencies.request('upload-reconcile', { id: progress.id });
      this.update(job.id, { progress });
    }
    if (!progress.recorded)
      throw new Error('File đã lên Drive nhưng chưa lưu liên kết. Bấm Thử lại.');
  }
}
