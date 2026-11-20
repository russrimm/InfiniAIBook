// Stands in for a renderer that runs for a long time (see tests/jobs.test.ts).
console.error("frame 1/100");
setTimeout(() => process.exit(0), 30_000);
