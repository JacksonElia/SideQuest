async function main() {
  const { searchPlaces } = await import('../src/moss.js');
  const results = await searchPlaces('museum of modern art');
  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error(`[moss:smoke] fatal: ${err.message}`);
  process.exitCode = 1;
});
