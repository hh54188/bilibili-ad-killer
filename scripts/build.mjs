import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  watch as watchFs
} from 'node:fs';

const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFilePath);
const rootDir = resolve(currentDir, '..');
const distDir = resolve(rootDir, 'dist');
const isWatchMode = process.argv.includes('--watch');
const modeIndex = process.argv.indexOf('--mode');
const currentMode = modeIndex >= 0 ? process.argv[modeIndex + 1] : 'production';
const shouldGenerateSourceMap = isWatchMode || currentMode === 'development';

function ensureDistDir() {
  mkdirSync(distDir, { recursive: true });
}

function copyStaticAssets() {
  ensureDistDir();

  copyFileSync(resolve(rootDir, 'manifest.json'), resolve(distDir, 'manifest.json'));

  const directoryMappings = [
    ['src/icons', 'icons'],
    ['src/_locales', '_locales'],
    ['src/lib', 'lib'],
  ];

  for (const [sourceRelativePath, targetRelativePath] of directoryMappings) {
    const sourcePath = resolve(rootDir, sourceRelativePath);
    if (!existsSync(sourcePath)) {
      continue;
    }

    cpSync(sourcePath, resolve(distDir, targetRelativePath), { recursive: true });
  }
}

function createCopyStaticAssetsPlugin() {
  return {
    name: 'copy-extension-static-assets',
    closeBundle() {
      copyStaticAssets();
    },
  };
}

function createBaseConfig(plugins = []) {
  return {
    configFile: false,
    publicDir: false,
    root: rootDir,
    plugins,
    build: {
      outDir: distDir,
      emptyOutDir: false,
      sourcemap: shouldGenerateSourceMap ? 'inline' : false,
      watch: isWatchMode ? {} : null,
    },
  };
}

function createPopupBuildConfig() {
  const baseConfig = createBaseConfig([react(), createCopyStaticAssetsPlugin()]);

  return {
    ...baseConfig,
    build: {
      ...baseConfig.build,
      emptyOutDir: !isWatchMode,
      rollupOptions: {
        input: {
          popup: resolve(rootDir, 'src/popup/popup.html'),
        },
        output: {
          entryFileNames: '[name].js',
          chunkFileNames: '[name].js',
          assetFileNames: '[name].[ext]',
        },
      },
    },
  };
}

function createExtensionScriptBuildConfig(entryRelativePath, outputFileName, bundleName) {
  const baseConfig = createBaseConfig([createCopyStaticAssetsPlugin()]);

  return {
    ...baseConfig,
    build: {
      ...baseConfig.build,
      lib: {
        entry: resolve(rootDir, entryRelativePath),
        formats: ['iife'],
        name: bundleName,
        fileName: () => outputFileName,
      },
      rollupOptions: {
        output: {
          extend: true,
        },
      },
    },
  };
}

function collectWatchTargets(targetPath) {
  if (!existsSync(targetPath)) {
    return [];
  }

  const directoryEntries = readdirSync(targetPath, { withFileTypes: true });
  const nestedTargets = directoryEntries
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => collectWatchTargets(resolve(targetPath, entry.name)));

  return [targetPath, ...nestedTargets];
}

function startStaticAssetWatchers() {
  const watchTargets = new Set([
    resolve(rootDir, 'manifest.json'),
    ...collectWatchTargets(resolve(rootDir, 'src/_locales')),
    ...collectWatchTargets(resolve(rootDir, 'src/icons')),
    ...collectWatchTargets(resolve(rootDir, 'src/lib')),
  ]);

  for (const watchTarget of watchTargets) {
    try {
      const watcher = watchFs(watchTarget, () => {
        try {
          copyStaticAssets();
          console.log(`📦 已同步静态资源: ${watchTarget}`);
        } catch (error) {
          console.error(`❌ 同步静态资源失败: ${watchTarget}`, error);
        }
      });

      watcher.on('error', (error) => {
        console.error(`❌ 静态资源监听失败: ${watchTarget}`, error);
      });
    } catch (error) {
      console.error(`❌ 无法监听静态资源路径: ${watchTarget}`, error);
    }
  }
}

async function runBuild() {
  await build(createPopupBuildConfig());

  await Promise.all([
    build(createExtensionScriptBuildConfig('src/content.ts', 'content.js', 'BilibiliAdKillerContent')),
    build(createExtensionScriptBuildConfig('src/background.ts', 'background.js', 'BilibiliAdKillerBackground')),
    build(createExtensionScriptBuildConfig('src/inject.ts', 'inject.js', 'BilibiliAdKillerInject')),
  ]);

  copyStaticAssets();

  if (isWatchMode) {
    startStaticAssetWatchers();
    console.log('👀 正在监听扩展脚本与静态资源变更...');
  }
}

runBuild().catch((error) => {
  console.error('❌ 构建失败', error);
  process.exit(1);
});
