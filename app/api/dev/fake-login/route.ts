import { encode } from "next-auth/jwt";
import { NextResponse } from "next/server";

export async function GET() {
  const token = await encode({
    secret: process.env.AUTH_SECRET!,
    salt: "authjs.session-token",
    token: {
      sub: "123456789012345678",
      name: "lolo_du_74",
      email: null,
      picture: null,
      discordId: "123456789012345678",
      discordUsername: "lolo_du_74",
      discordAvatar: null,
    },
  });

  const response = NextResponse.redirect(new URL("/catalogue", "http://localhost:3000"));
  response.cookies.set("authjs.session-token", token, { httpOnly: true, path: "/" });
  return response;
}
