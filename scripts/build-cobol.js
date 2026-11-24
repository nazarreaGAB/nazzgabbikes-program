// Compiles backend/shop.cbl into backend/shop with GnuCOBOL (cobc).
//
//   npm run build:cobol   -> always rebuilds; exits with an error if it fails
//   npm start             -> runs this first with --soft: rebuilds only when needed,
//                            installs GnuCOBOL if it is missing, and never blocks
//                            the server from starting (the API reports a clear
//                            "COBOL not connected" message if the build failed)
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const source = path.join(root, 'backend', 'shop.cbl');
const output = path.join(root, 'backend', process.platform === 'win32' ? 'shop.exe' : 'shop');
const soft = process.argv.includes('--soft');
const finish = code => process.exit(soft ? 0 : code);

const run = (cmd, args) => spawnSync(cmd, args, { stdio: 'inherit' });
const hasCobc = () => { const p = spawnSync('cobc', ['--version']); return !p.error && p.status === 0; };

if (!fs.existsSync(source)) {
  console.error('Cannot find backend/shop.cbl. Check that the "backend" folder is in your project.');
  finish(1);
}

// Skip the rebuild when the compiled program is already newer than the source.
if (soft && fs.existsSync(output) && fs.statSync(output).mtimeMs >= fs.statSync(source).mtimeMs) {
  console.log('COBOL backend is up to date.');
  process.exit(0);
}

if (!hasCobc() && process.platform === 'linux' && spawnSync('which', ['apt-get']).status === 0) {
  console.log('GnuCOBOL (cobc) was not found. Installing it now; this takes about a minute...');
  const asRoot = args => (typeof process.getuid === 'function' && process.getuid() === 0)
    ? run(args[0], args.slice(1))
    : run('sudo', args);
  asRoot(['apt-get', 'update']);
  asRoot(['apt-get', 'install', '-y', 'gnucobol']);
}

if (!hasCobc()) {
  console.error('cobc (GnuCOBOL) is not available, so the COBOL backend could not be built.');
  console.error('In Codespaces: open the Command Palette and run "Codespaces: Rebuild Container",');
  console.error('or run:  sudo apt-get update && sudo apt-get install -y gnucobol');
  finish(1);
}

const result = run('cobc', ['-x', '-free', '-o', output, source]);
if (result.status === 0) {
  console.log('COBOL backend built: ' + path.relative(root, output));
  process.exit(0);
}
console.error('The COBOL compiler reported errors (see above). Fix backend/shop.cbl and run: npm run build:cobol');
finish(result.status === null ? 1 : result.status);
