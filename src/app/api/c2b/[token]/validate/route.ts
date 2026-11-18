export const runtime = "nodejs";

/** Registered with ResponseType "Completed": we accept every payment and sort it out on confirmation. */
export async function POST() {
  return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
}
