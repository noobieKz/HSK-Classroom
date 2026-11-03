import { NextResponse } from 'next/server';
import { requireSession, csrf } from '@/lib/auth';
import { invariant, publicError } from '@/lib/errors';
import { CHUNK_SIZE, uploadChunk } from '@/lib/uploads';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    csrf(request, session);
    invariant(
      Number(request.headers.get('content-length') || 0) <= CHUNK_SIZE,
      'Phần upload vượt 1 MB.',
      413,
    );
    // Bounded streaming reader prevents unbounded memory allocation even without Content-Length.
    const reader = request.body?.getReader();
    invariant(reader, 'Không có nội dung upload.');
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > CHUNK_SIZE) {
        await reader.cancel();
        invariant(false, 'Phần upload vượt 1 MB.', 413);
      }
      chunks.push(value);
    }
    const { id } = await context.params;
    const result = await uploadChunk(
      id,
      session.id,
      Number(request.headers.get('x-upload-offset')),
      Buffer.concat(chunks),
    );
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    const error = publicError(e);
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
