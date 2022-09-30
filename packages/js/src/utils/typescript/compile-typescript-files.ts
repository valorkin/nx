import {
  compileTypeScript,
  compileTypeScriptWatcher,
  TypeScriptCompilationOptions,
} from '@nrwl/workspace/src/utilities/typescript/compilation';
import type { Diagnostic } from 'typescript';
import { createAsyncIterable } from '../create-async-iterable/create-async-iteratable';
import { NormalizedExecutorOptions } from '../schema';

const TYPESCRIPT_FOUND_N_ERRORS_WATCHING_FOR_FILE_CHANGES = 6194;
// Typescript diagnostic message for 6194: Found {0} errors. Watching for file changes.
// https://github.com/microsoft/TypeScript/blob/d45012c5e2ab122919ee4777a7887307c5f4a1e0/src/compiler/diagnosticMessages.json#L4763-L4766
const ERROR_COUNT_REGEX = /Found (\d+) errors/;

function getErrorCountFromMessage(messageText: string) {
  return Number.parseInt(ERROR_COUNT_REGEX.exec(messageText)[1]);
}

export async function* compileTypeScriptFiles(
  normalizedOptions: NormalizedExecutorOptions,
  tscOptions: TypeScriptCompilationOptions,
  postCompilationCallback: () => void | Promise<void>
) {
  const getResult = (success: boolean) => ({
    success,
    outfile: normalizedOptions.mainOutputPath,
  });

  return yield* createAsyncIterable<{ success: boolean; outfile: string }>(
    async ({ next, done }) => {
      if (normalizedOptions.watch) {
        compileTypeScriptWatcher(tscOptions, async (d: Diagnostic) => {
          if (d.code === TYPESCRIPT_FOUND_N_ERRORS_WATCHING_FOR_FILE_CHANGES) {
            await postCompilationCallback();
            next(
              getResult(getErrorCountFromMessage(d.messageText as string) === 0)
            );
          }
        });
      } else {
        const { success } = compileTypeScript(tscOptions);
        await postCompilationCallback();
        next(getResult(success));
        done();
      }
    }
  );
}
