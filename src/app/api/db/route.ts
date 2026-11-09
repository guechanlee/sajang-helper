import type { NextRequest } from 'next/server';
import { withCtx } from '@/lib/db/http';
import { run, type Req } from '@/lib/db/query';

export const dynamic = 'force-dynamic';
export const POST = (req: NextRequest) => withCtx(req, (ctx, body) => run(ctx, body as Req));
