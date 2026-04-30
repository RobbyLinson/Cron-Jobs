"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";

export async function resolveReview(
  emailId: string,
  applicationId: string,
  updates: { company: string; role: string; status: string }
) {
  await sql`
    update applications set
      company = ${updates.company},
      role = ${updates.role || null},
      status = ${updates.status},
      updated_at = now()
    where id = ${applicationId}::uuid
  `;
  await sql`
    update emails set needs_review = false where id = ${emailId}::uuid
  `;
  revalidatePath("/dashboard");
}
