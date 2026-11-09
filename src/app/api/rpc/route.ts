import type { NextRequest } from 'next/server';
import { withCtx } from '@/lib/db/http';
import type { Result } from '@/lib/db/query';
import { RpcBad, saveInvoice, saveSettlement } from '@/lib/db/rpc';

export const dynamic = 'force-dynamic';
export const POST = (req: NextRequest) => withCtx(req, async (ctx, body): Promise<Result> => {
  const b = (body ?? {}) as { fn?: unknown; args?: unknown };
  const args = b.args && typeof b.args === 'object' && !Array.isArray(b.args) ? (b.args as Record<string, unknown>) : {};
  try {
    if (b.fn === 'save_invoice') return await saveInvoice(ctx, args);
    if (b.fn === 'save_settlement') return await saveSettlement(ctx, args);
    return { data: null, error: { message: '지원하지 않는 요청이에요.', code: 'BAD_REQUEST' } };
  } catch (e) {
    if (e instanceof RpcBad) return { data: null, error: { message: e.message, code: 'BAD_REQUEST' } };
    const code = (e as { code?: string }).code ?? '';
    const msg = code === 'ER_SIGNAL_EXCEPTION' ? '다른 가게의 항목은 연결할 수 없어요.'
      : code.startsWith('ER_CHECK') || code === 'ER_CONSTRAINT_FAILED' ? '입력한 값이 허용 범위를 벗어났어요.'
      : '저장하지 못했어요.';
    if (msg === '저장하지 못했어요.') console.error('[rpc]', e);
    return { data: null, error: { message: msg, code } };
  }
});
