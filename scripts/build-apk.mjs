// Builds the debug APK with Android Studio's bundled JDK, so no global Java or
// Android environment variables are needed. Pass --install to push it to a
// phone connected over USB.
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const androidDir = join(root, 'android');
const apk = join(androidDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');

const javaHome = process.env.JAVA_HOME || 'C:\\Program Files\\Android\\Android Studio\\jbr';
const sdkDir = process.env.ANDROID_HOME || join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk');

for (const [label, path] of [['JDK', javaHome], ['Android SDK', sdkDir], ['android project', androidDir]]) {
  if (!existsSync(path)) {
    console.error(`${label} not found at ${path}`);
    process.exit(1);
  }
}

function run(command, options = {}) {
  const result = spawnSync(command, { stdio: 'inherit', shell: true, ...options });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const installOnly = process.argv.includes('--install');

if (!installOnly || !existsSync(apk)) {
  writeFileSync(join(androidDir, 'local.properties'), `sdk.dir=${sdkDir.replaceAll('\\', '/')}\n`);
  run(`"${join(androidDir, 'gradlew.bat')}" assembleDebug --console=plain`, {
    cwd: androidDir,
    env: { ...process.env, JAVA_HOME: javaHome, ANDROID_HOME: sdkDir },
  });
  console.log(`\nAPK: ${apk}`);
}

if (installOnly) {
  run(`"${join(sdkDir, 'platform-tools', 'adb.exe')}" install -r "${apk}"`);
}
