import { AssetGlob } from '@nrwl/workspace/src/utilities/assets';
import { CopyAssetsHandler, FileEvent } from './copy-assets-handler';
import { ExecutorContext } from '@nrwl/devkit';

export interface CopyAssetsOptions {
  outputPath: string;
  assets: (string | AssetGlob)[];
  watch?: boolean | WatchMode;
}

export interface CopyAssetsResult {
  success?: boolean;
  // Only when "watch: true"
  stop?: () => void;
}

export interface WatchMode {
  onCopy?: (events: FileEvent[]) => void;
}

export async function copyAssets(
  options: CopyAssetsOptions,
  context: ExecutorContext
): Promise<CopyAssetsResult> {
  const assetHandler = new CopyAssetsHandler({
    projectDir: context.workspace.projects[context.projectName].root,
    rootDir: context.root,
    outputDir: options.outputPath,
    assets: options.assets,
    callback:
      typeof options?.watch === 'object' ? options.watch.onCopy : undefined,
  });
  if (options.watch) {
    const dispose = await assetHandler.watchAndProcessOnAssetChange();
    return {
      success: true,
      stop: dispose,
    };
  } else {
    try {
      await assetHandler.processAllAssetsOnce();
    } catch {
      return { success: false };
    }
    return { success: true };
  }
}
