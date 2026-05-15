import { NextResponse } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { auth } from '@/auth';
import {
  cpDb,
  isCpDbConfigured,
  channelPartners,
  cities,
  normalizePhone,
} from '@/lib/cpDb';

export const runtime = 'nodejs';

// GET /api/cp/lookup?cp_code=XYZ
// GET /api/cp/lookup?phone=9876543210
// Returns { found: true|false, cp: { cp_code, name, phone, city, company, email } }
// Used by the new-meeting form to auto-prefill remaining fields when the RM
// enters either of the two mandatory identifiers.
export async function GET(request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isCpDbConfigured()) {
    return NextResponse.json({
      found: false,
      configured: false,
      message: 'CP inventory DB not configured on this deployment',
    });
  }

  const { searchParams } = new URL(request.url);
  const cpCode = searchParams.get('cp_code')?.trim();
  const phoneRaw = searchParams.get('phone')?.trim();
  const phone = normalizePhone(phoneRaw);

  if (!cpCode && !phone) {
    return NextResponse.json(
      { error: 'Provide cp_code or phone' },
      { status: 400 }
    );
  }

  try {
    let row;
    if (cpCode) {
      const [r] = await cpDb
        .select({
          cp_code: channelPartners.cp_code,
          name: channelPartners.name,
          phone: channelPartners.phone,
          company: channelPartners.company,
          email: channelPartners.email,
          city: cities.name,
        })
        .from(channelPartners)
        .leftJoin(cities, eq(cities.id, channelPartners.city_id))
        .where(eq(channelPartners.cp_code, cpCode))
        .limit(1);
      row = r;
    } else {
      // Match the last 10 digits — handles "+91", spaces, etc. stored in either side.
      const [r] = await cpDb
        .select({
          cp_code: channelPartners.cp_code,
          name: channelPartners.name,
          phone: channelPartners.phone,
          company: channelPartners.company,
          email: channelPartners.email,
          city: cities.name,
        })
        .from(channelPartners)
        .leftJoin(cities, eq(cities.id, channelPartners.city_id))
        .where(sql`right(regexp_replace(${channelPartners.phone}, '\\D', '', 'g'), 10) = ${phone}`)
        .limit(1);
      row = r;
    }

    if (!row) {
      return NextResponse.json({ found: false, configured: true });
    }

    return NextResponse.json({
      found: true,
      configured: true,
      cp: {
        cp_code: row.cp_code,
        name: row.name,
        phone: row.phone,
        city: row.city || null,
        company: row.company || null,
        email: row.email || null,
      },
    });
  } catch (e) {
    console.error('[cp/lookup] query failed', { message: e?.message });
    return NextResponse.json(
      { error: 'CP lookup failed', detail: e?.message || 'unknown' },
      { status: 500 }
    );
  }
}
