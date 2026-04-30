"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { USER_ID } from "@/lib/constants";

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

export async function updateApplication(
  id: string,
  updates: { company: string; role: string; location: string; status: string; notes: string }
) {
  await sql`
    update applications set
      company = ${updates.company},
      role = ${updates.role || null},
      location = ${updates.location || null},
      status = ${updates.status},
      notes = ${updates.notes || null},
      updated_at = now()
    where id = ${id}::uuid and user_id = ${USER_ID}::uuid
  `;
  revalidatePath("/dashboard");
}

export async function deleteApplication(id: string) {
  // Emails cascade via FK, but Neon requires explicit delete if no cascade rule
  await sql`delete from emails where application_id = ${id}::uuid`;
  await sql`delete from applications where id = ${id}::uuid and user_id = ${USER_ID}::uuid`;
  revalidatePath("/dashboard");
}
