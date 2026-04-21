export async function GET() {
  return Response.json({
    googleEnabled: !!process.env.GOOGLE_CLIENT_ID,
  });
}
