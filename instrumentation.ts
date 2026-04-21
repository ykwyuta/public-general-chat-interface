export async function register() {
  // Only run in the Node.js server runtime (not Edge)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initBuiltinMcpServers } = await import('./src/lib/mcp/builtin-servers');
    await initBuiltinMcpServers();
  }
}
