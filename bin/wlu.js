#!/usr/bin/env node
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 18 || (major === 18 && minor < 17)) {
  console.error(`work_load_understand requires Node.js 18.17 or newer (found ${process.versions.node}).`);
  process.exit(1);
}

const { main } = await import('../src/cli.js');
main(process.argv.slice(2)).then(
  (code) => process.exit(typeof code === 'number' ? code : 0),
  (err) => {
    console.error(`Error: ${err && err.message ? err.message : err}`);
    if (process.env.WLU_DEBUG) console.error(err);
    process.exit(1);
  },
);
