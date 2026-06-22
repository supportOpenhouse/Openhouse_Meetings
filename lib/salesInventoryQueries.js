import { db } from '@/lib/db';
import { salesInventory } from '@/drizzle/schema';
import { eq, desc } from 'drizzle-orm';

// All inventory entries submitted by a single sales rep, newest first.
export async function listInventoryForRm(rmId) {
  return db
    .select()
    .from(salesInventory)
    .where(eq(salesInventory.sales_rm_id, rmId))
    .orderBy(desc(salesInventory.created_at));
}

// Insert a single inventory row. Caller supplies the CP snapshot (cp_code /
// cp_name) and sales_rm_id.
export async function insertInventory(data) {
  const [row] = await db.insert(salesInventory).values(data).returning();
  return row;
}
