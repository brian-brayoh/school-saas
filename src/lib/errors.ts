import { Prisma } from "@prisma/client";

export function friendlyDbError(err: unknown, duplicateMessage = "That already exists"): string {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return duplicateMessage;
  console.error(err);
  return "Something went wrong. Please try again.";
}
