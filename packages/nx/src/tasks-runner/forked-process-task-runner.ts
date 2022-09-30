import { readFileSync, writeFileSync } from 'fs';
import * as dotenv from 'dotenv';
import { ChildProcess, fork, Serializable } from 'child_process';
import * as chalk from 'chalk';
import * as logTransformer from 'strong-log-transformer';
import { workspaceRoot } from '../utils/workspace-root';
import { DefaultTasksRunnerOptions } from './default-tasks-runner';
import { output } from '../utils/output';
import {
  getCliPath,
  getPrintableCommandArgsForTask,
  getSerializedArgsForTask,
} from './utils';
import { Batch } from './tasks-schedule';
import { join } from 'path';
import {
  BatchMessage,
  BatchMessageType,
  BatchResults,
} from './batch/batch-messages';
import { stripIndents } from '../utils/strip-indents';
import { Task } from '../config/task-graph';

const workerPath = join(__dirname, './batch/run-batch.js');

export class ForkedProcessTaskRunner {
  workspaceRoot = workspaceRoot;
  cliPath = getCliPath();

  private readonly verbose = process.env.NX_VERBOSE_LOGGING === 'true';
  private processes = new Set<ChildProcess>();

  constructor(private readonly options: DefaultTasksRunnerOptions) {
    this.setupProcessEventListeners();
  }

  // TODO: vsavkin delegate terminal output printing
  public forkProcessForBatch({ executorName, taskGraph }: Batch) {
    return new Promise<BatchResults>((res, rej) => {
      try {
        const count = Object.keys(taskGraph.tasks).length;
        if (count > 1) {
          output.logSingleLine(
            `Running ${output.bold(count)} ${output.bold(
              'tasks'
            )} with ${output.bold(executorName)}`
          );
        } else {
          const args = getPrintableCommandArgsForTask(
            Object.values(taskGraph.tasks)[0]
          );
          output.logCommand(args.join(' '));
          output.addNewline();
        }

        const p = fork(workerPath, {
          stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
          env: this.getEnvVariablesForProcess(),
        });
        this.processes.add(p);

        p.once('exit', (code, signal) => {
          if (code === null) code = this.signalToCode(signal);
          if (code !== 0) {
            const results: BatchResults = {};
            for (const rootTaskId of taskGraph.roots) {
              results[rootTaskId] = {
                success: false,
              };
            }
            rej(
              new Error(
                `"${executorName}" exited unexpectedly with code: ${code}`
              )
            );
          }
        });

        p.on('message', (message: BatchMessage) => {
          switch (message.type) {
            case BatchMessageType.Complete: {
              res(message.results);
              break;
            }
            case BatchMessageType.Tasks: {
              break;
            }
            default: {
              // Re-emit any non-batch messages from the task process
              if (process.send) {
                process.send(message);
              }
            }
          }
        });

        // Start the tasks
        p.send({
          type: BatchMessageType.Tasks,
          taskGraph,
          executorName,
        });
      } catch (e) {
        rej(e);
      }
    });
  }

  public forkProcessPipeOutputCapture(
    task: Task,
    {
      streamOutput,
      temporaryOutputPath,
    }: {
      streamOutput: boolean;
      temporaryOutputPath: string;
    }
  ) {
    return new Promise<{ code: number; terminalOutput: string }>((res, rej) => {
      try {
        const args = getPrintableCommandArgsForTask(task);
        const serializedArgs = getSerializedArgsForTask(task, this.verbose);
        if (streamOutput) {
          output.logCommand(args.join(' '));
          output.addNewline();
        }

        const p = fork(this.cliPath, serializedArgs, {
          stdio: ['inherit', 'pipe', 'pipe', 'ipc'],
          env: this.getEnvVariablesForTask(
            task,
            process.env.FORCE_COLOR === undefined
              ? 'true'
              : process.env.FORCE_COLOR,
            null,
            null
          ),
        });
        this.processes.add(p);

        // Re-emit any messages from the task process
        p.on('message', (message) => {
          if (process.send) {
            process.send(message);
          }
        });

        if (streamOutput) {
          if (process.env.NX_PREFIX_OUTPUT === 'true') {
            const color = getColor(task.target.project);
            const prefixText = `${task.target.project}:`;

            p.stdout
              .pipe(logTransformer({ tag: color.bold(prefixText) }))
              .pipe(process.stdout);
            p.stderr
              .pipe(logTransformer({ tag: color(prefixText) }))
              .pipe(process.stderr);
          } else {
            p.stdout.pipe(logTransformer()).pipe(process.stdout);
            p.stderr.pipe(logTransformer()).pipe(process.stderr);
          }
        }

        let outWithErr = [];
        p.stdout.on('data', (chunk) => {
          outWithErr.push(chunk.toString());
        });
        p.stderr.on('data', (chunk) => {
          outWithErr.push(chunk.toString());
        });

        p.on('exit', (code, signal) => {
          if (code === null) code = this.signalToCode(signal);
          // we didn't print any output as we were running the command
          // print all the collected output|
          const terminalOutput = outWithErr.join('');

          if (!streamOutput) {
            this.options.lifeCycle.printTaskTerminalOutput(
              task,
              code === 0 ? 'success' : 'failure',
              terminalOutput
            );
          }
          this.writeTerminalOutput(temporaryOutputPath, terminalOutput);
          res({ code, terminalOutput });
        });
      } catch (e) {
        console.error(e);
        rej(e);
      }
    });
  }

  public forkProcessDirectOutputCapture(
    task: Task,
    {
      streamOutput,
      temporaryOutputPath,
    }: {
      streamOutput: boolean;
      temporaryOutputPath: string;
    }
  ) {
    return new Promise<{ code: number; terminalOutput: string }>((res, rej) => {
      try {
        const args = getPrintableCommandArgsForTask(task);
        const serializedArgs = getSerializedArgsForTask(task, this.verbose);
        if (streamOutput) {
          output.logCommand(args.join(' '));
          output.addNewline();
        }
        const p = fork(this.cliPath, serializedArgs, {
          stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
          env: this.getEnvVariablesForTask(
            task,
            undefined,
            temporaryOutputPath,
            streamOutput
          ),
        });
        this.processes.add(p);

        // Re-emit any messages from the task process
        p.on('message', (message) => {
          if (process.send) {
            process.send(message);
          }
        });

        p.on('exit', (code, signal) => {
          if (code === null) code = this.signalToCode(signal);
          // we didn't print any output as we were running the command
          // print all the collected output
          let terminalOutput = '';
          try {
            terminalOutput = this.readTerminalOutput(temporaryOutputPath);
            if (!streamOutput) {
              this.options.lifeCycle.printTaskTerminalOutput(
                task,
                code === 0 ? 'success' : 'failure',
                terminalOutput
              );
            }
          } catch (e) {
            console.log(stripIndents`
              Unable to print terminal output for Task "${task.id}".
              Task failed with Exit Code ${code} and Signal "${signal}".

              Received error message:
              ${e.message}
            `);
          }
          res({
            code,
            terminalOutput,
          });
        });
      } catch (e) {
        console.error(e);
        rej(e);
      }
    });
  }

  private readTerminalOutput(outputPath: string) {
    return readFileSync(outputPath).toString();
  }

  private writeTerminalOutput(outputPath: string, content: string) {
    writeFileSync(outputPath, content);
  }

  // region Environment Variables
  private getEnvVariablesForProcess() {
    return {
      // Start With Dotenv Variables
      ...this.getDotenvVariablesForForkedProcess(),
      // User Process Env Variables override Dotenv Variables
      ...process.env,
      // Nx Env Variables overrides everything
      ...this.getNxEnvVariablesForForkedProcess(
        process.env.FORCE_COLOR === undefined ? 'true' : process.env.FORCE_COLOR
      ),
    };
  }

  private getEnvVariablesForTask(
    task: Task,
    forceColor: string,
    outputPath: string,
    streamOutput: boolean
  ) {
    const res = {
      // Start With Dotenv Variables
      ...this.getDotenvVariablesForTask(task),
      // User Process Env Variables override Dotenv Variables
      ...process.env,
      // Nx Env Variables overrides everything
      ...this.getNxEnvVariablesForTask(
        task,
        forceColor,
        outputPath,
        streamOutput
      ),
    };

    // we have to delete it because if we invoke Nx from within Nx, we need to reset those values
    if (!outputPath) {
      delete res.NX_TERMINAL_OUTPUT_PATH;
      delete res.NX_STREAM_OUTPUT;
      delete res.NX_PREFIX_OUTPUT;
    }
    delete res.NX_BASE;
    delete res.NX_HEAD;
    delete res.NX_SET_CLI;
    return res;
  }

  private getNxEnvVariablesForForkedProcess(
    forceColor: string,
    outputPath?: string,
    streamOutput?: boolean
  ) {
    const env: NodeJS.ProcessEnv = {
      FORCE_COLOR: forceColor,
      NX_WORKSPACE_ROOT: this.workspaceRoot,
      NX_SKIP_NX_CACHE: this.options.skipNxCache ? 'true' : undefined,
    };

    if (outputPath) {
      env.NX_TERMINAL_OUTPUT_PATH = outputPath;
      if (this.options.captureStderr) {
        env.NX_TERMINAL_CAPTURE_STDERR = 'true';
      }
      if (streamOutput) {
        env.NX_STREAM_OUTPUT = 'true';
      }
    }
    return env;
  }

  private getNxEnvVariablesForTask(
    task: Task,
    forceColor: string,
    outputPath: string,
    streamOutput: boolean
  ) {
    const env: NodeJS.ProcessEnv = {
      NX_TASK_TARGET_PROJECT: task.target.project,
      NX_TASK_HASH: task.hash,
      // used when Nx is invoked via Lerna
      LERNA_PACKAGE_NAME: task.target.project,
    };

    // TODO: remove this once we have a reasonable way to configure it
    if (task.target.target === 'test') {
      env.NX_TERMINAL_CAPTURE_STDERR = 'true';
    }

    return {
      ...this.getNxEnvVariablesForForkedProcess(
        forceColor,
        outputPath,
        streamOutput
      ),
      ...env,
    };
  }

  private getDotenvVariablesForForkedProcess() {
    return {
      ...parseEnv('.env'),
      ...parseEnv('.local.env'),
      ...parseEnv('.env.local'),
    };
  }

  private getDotenvVariablesForTask(task: Task) {
    return {
      ...this.getDotenvVariablesForForkedProcess(),
      ...parseEnv(`.${task.target.target}.env`),
      ...parseEnv(`.env.${task.target.target}`),
      ...parseEnv(`${task.projectRoot}/.env`),
      ...parseEnv(`${task.projectRoot}/.local.env`),
      ...parseEnv(`${task.projectRoot}/.env.local`),
      ...parseEnv(`${task.projectRoot}/.${task.target.target}.env`),
      ...parseEnv(`${task.projectRoot}/.env.${task.target.target}`),
    };
  }

  // endregion Environment Variables

  private signalToCode(signal: string) {
    if (signal === 'SIGHUP') return 128 + 1;
    if (signal === 'SIGINT') return 128 + 2;
    if (signal === 'SIGTERM') return 128 + 15;
    return 128;
  }

  private setupProcessEventListeners() {
    // When the nx process gets a message, it will be sent into the task's process
    process.on('message', (message: Serializable) => {
      this.processes.forEach((p) => {
        p.send(message);
      });
    });

    // Terminate any task processes on exit
    process.on('SIGINT', () => {
      this.processes.forEach((p) => {
        p.kill('SIGTERM');
      });
      // we exit here because we don't need to write anything to cache.
      process.exit();
    });
    process.on('SIGTERM', () => {
      this.processes.forEach((p) => {
        p.kill('SIGTERM');
      });
      // no exit here because we expect child processes to terminate which
      // will store results to the cache and will terminate this process
    });
    process.on('SIGHUP', () => {
      this.processes.forEach((p) => {
        p.kill('SIGTERM');
      });
      // no exit here because we expect child processes to terminate which
      // will store results to the cache and will terminate this process
    });
  }
}

function parseEnv(path: string) {
  try {
    const envContents = readFileSync(path);
    return dotenv.parse(envContents);
  } catch (e) {}
}

const colors = [
  chalk.green,
  chalk.greenBright,
  chalk.red,
  chalk.redBright,
  chalk.cyan,
  chalk.cyanBright,
  chalk.yellow,
  chalk.yellowBright,
  chalk.magenta,
  chalk.magentaBright,
];

function getColor(projectName: string) {
  let code = 0;
  for (let i = 0; i < projectName.length; ++i) {
    code += projectName.charCodeAt(i);
  }
  const colorIndex = code % colors.length;

  return colors[colorIndex];
}
