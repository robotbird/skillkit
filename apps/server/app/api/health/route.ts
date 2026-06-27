export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ ok: true, service: 'skillkit-share', version: '0.1.0' });
}
