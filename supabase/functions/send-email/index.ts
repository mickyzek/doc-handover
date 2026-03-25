import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'GA Doc-Handover <noreply@doc-handover.app>'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ===== Types =====
interface NotifyPayload {
  type: 'plan_received' | 'plan_expired'
  plan_id: string
  plan_name: string
  dept: string
  created_by: string
  signer?: string
  signed_at?: string
  status?: 'done' | 'partial'
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function validatePayload(payload: NotifyPayload): string | null {
  if (!isNonEmptyString(payload.plan_id)) return 'plan_id is required'
  if (!isNonEmptyString(payload.plan_name)) return 'plan_name is required'
  if (!isNonEmptyString(payload.dept)) return 'dept is required'
  if (!isNonEmptyString(payload.created_by)) return 'created_by is required'

  if (payload.type === 'plan_received' && payload.status && !['done', 'partial'].includes(payload.status)) {
    return 'status must be done or partial'
  }

  return null
}

// ===== Resend =====
async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  })
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`)
  return res.json()
}

// ===== HTML Template =====
const base = (title: string, body: string) => `
<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body { margin:0; padding:0; background:#F7F7F5; font-family:'Noto Sans Thai',Arial,sans-serif; }
  .wrap { max-width:560px; margin:32px auto; background:#fff; border-radius:16px; overflow:hidden; box-shadow:0 2px 12px rgba(0,0,0,0.08); }
  .header { background:#185FA5; padding:24px 28px; }
  .header h1 { margin:0; color:#fff; font-size:18px; font-weight:700; }
  .header p { margin:4px 0 0; color:#b3d0f0; font-size:13px; }
  .body { padding:28px; }
  .badge { display:inline-block; padding:4px 12px; border-radius:99px; font-size:12px; font-weight:600; }
  .badge-green { background:#E6F5F0; color:#0F6E56; }
  .badge-amber { background:#FEF3C7; color:#D97706; }
  .info-table { width:100%; border-collapse:collapse; margin:16px 0; }
  .info-table td { padding:8px 0; border-bottom:1px solid #F0F0EE; font-size:14px; }
  .info-table td:first-child { color:#888; width:110px; }
  .info-table td:last-child { color:#1a1a1a; font-weight:500; }
  .footer { padding:16px 28px; background:#F7F7F5; text-align:center; font-size:11px; color:#aaa; }
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <h1>📄 GA Doc-Handover</h1>
    <p>${title}</p>
  </div>
  <div class="body">${body}</div>
  <div class="footer">ระบบจัดการการส่งมอบเอกสาร GA · อีเมลนี้สร้างโดยระบบอัตโนมัติ</div>
</div>
</body>
</html>`

function tplPlanReceived(d: NotifyPayload) {
  const isDone = d.status === 'done'
  return base(
    isDone ? 'แจ้งเตือน: เอกสารได้รับครบแล้ว' : 'แจ้งเตือน: รับเอกสารบางส่วนแล้ว',
    `<p style="font-size:15px;font-weight:600;color:#1a1a1a;margin:0 0 4px">${isDone ? 'เอกสารได้รับครบทุกรายการ' : 'รับเอกสารบางส่วนแล้ว'}</p>
    <p style="font-size:13px;color:#666;margin:0 0 20px"><span class="badge ${isDone ? 'badge-green' : 'badge-amber'}">${isDone ? 'ครบแล้ว' : 'รับบางส่วน'}</span></p>
    <table class="info-table">
      <tr><td>ชื่อแผนงาน</td><td>${esc(d.plan_name)}</td></tr>
      <tr><td>แผนก</td><td>${esc(d.dept)}</td></tr>
      <tr><td>ผู้รับเอกสาร</td><td>${esc(d.signer ?? '-')}</td></tr>
      <tr><td>เวลาที่รับ</td><td>${esc(d.signed_at ?? '-')}</td></tr>
    </table>
    <p style="font-size:13px;color:#555;margin:16px 0 0">${isDone ? 'แผนงานนี้เสร็จสมบูรณ์แล้ว ✓' : 'ยังมีเอกสารบางรายการที่รอรับอยู่'}</p>`
  )
}

function tplPlanExpired(d: NotifyPayload) {
  return base('แจ้งเตือน: Token หมดอายุแล้ว', `
    <p style="font-size:15px;font-weight:600;color:#1a1a1a;margin:0 0 4px">Token ของแผนงานนี้หมดอายุแล้ว</p>
    <p style="font-size:13px;color:#666;margin:0 0 20px"><span class="badge" style="background:#F3F4F6;color:#6B7280;">หมดอายุ</span></p>
    <table class="info-table">
      <tr><td>ชื่อแผนงาน</td><td>${esc(d.plan_name)}</td></tr>
      <tr><td>แผนก</td><td>${esc(d.dept)}</td></tr>
    </table>
    <p style="font-size:13px;color:#555;margin:16px 0 0">กรุณาเปิดแผนงานแล้วกด <strong>"Gen Token ใหม่"</strong> เพื่อสร้าง Token สำหรับรับเอกสาร</p>
  `)
}

function esc(s: string) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ===== Main Handler =====
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

  if (!RESEND_API_KEY) return json({ ok: false, error: 'RESEND_API_KEY not set' }, 500)
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ ok: false, error: 'Supabase env vars not set' }, 500)
  }

  let payload: NotifyPayload
  try {
    payload = await req.json()
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400)
  }

  if (!['plan_received', 'plan_expired'].includes(payload.type)) {
    return json({ ok: false, error: `Unknown type: ${payload.type}` }, 400)
  }
  const validationError = validatePayload(payload)
  if (validationError) return json({ ok: false, error: validationError }, 400)

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  try {
    // แจ้ง GA creator (ทั้ง plan_received และ plan_expired)
    const { data: ga } = await db.from('ga_staff').select('email').eq('name', payload.created_by).maybeSingle()
    if (ga?.email) {
      if (payload.type === 'plan_received') {
        const isDone = payload.status === 'done'
        const subject = isDone
          ? `[GA] เอกสารได้รับครบ: ${payload.plan_name}`
          : `[GA] รับบางส่วน: ${payload.plan_name}`
        await sendEmail(ga.email, subject, tplPlanReceived(payload))
      } else {
        await sendEmail(
          ga.email,
          `[GA] Token หมดอายุ: ${payload.plan_name}`,
          tplPlanExpired(payload)
        )
      }
    }
    return json({ ok: true })
  } catch (err) {
    console.error('send-email error:', err)
    return json({ ok: false, error: String(err) }, 500)
  }
})
