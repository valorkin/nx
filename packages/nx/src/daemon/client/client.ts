import { workspaceRoot } from '../../utils/workspace-root';
import { ChildProcess, spawn, spawnSync } from 'child_process';
import { openSync, readFileSync, statSync } from 'fs';
import { ensureDirSync, ensureFileSync } from 'fs-extra';
import { connect } from 'net';
import { join } from 'path';
import { performance } from 'perf_hooks';
import { output } from '../../utils/output';
import {
  safelyCleanUpExistingProcess,
  writeDaemonJsonProcessCache,
} from '../cache';
import { FULL_OS_SOCKET_PATH, killSocketOrPath } from '../socket-utils';
import {
  DAEMON_DIR_FOR_CURRENT_WORKSPACE,
  DAEMON_OUTPUT_LOG_FILE,
  isDaemonDisabled,
  removeSocketDir,
} from '../tmp-dir';
import { ProjectGraph } from '../../config/project-graph';
import { isCI } from '../../utils/is-ci';
import { NxJsonConfiguration } from '../../config/nx-json';
import { readNxJson } from '../../config/configuration';
import { PromisedBasedQueue } from '../../utils/promised-based-queue';
import { consumeMessagesFromSocket } from '../../utils/consume-messages-from-socket';
import { Workspaces } from 'nx/src/config/workspaces';

const DAEMON_ENV_SETTINGS = {
  ...process.env,
  NX_PROJECT_GLOB_CACHE: 'false',
  NX_CACHE_WORKSPACE_CONFIG: 'false',
};

export class DaemonClient {
  constructor(private readonly nxJson: NxJsonConfiguration) {
    this.reset();
  }

  private queue: PromisedBasedQueue;

  private socket;

  private currentMessage;
  private currentResolve;
  private currentReject;

  private _enabled: boolean | undefined;
  private _connected: boolean;

  enabled() {
    if (this._enabled === undefined) {
      const useDaemonProcessOption =
        this.nxJson.tasksRunnerOptions?.['default']?.options?.useDaemonProcess;
      const env = process.env.NX_DAEMON;

      // env takes precedence
      // option=true,env=false => no daemon
      // option=false,env=undefined => no daemon
      // option=false,env=false => no daemon

      // option=undefined,env=undefined => daemon
      // option=true,env=true => daemon
      // option=false,env=true => daemon

      // CI=true,env=undefined => no daemon
      // CI=true,env=false => no daemon
      // CI=true,env=true => daemon
      if (
        (isCI() && env !== 'true') ||
        isDocker() ||
        isDaemonDisabled() ||
        nxJsonIsNotPresent() ||
        (useDaemonProcessOption === undefined && env === 'false') ||
        (useDaemonProcessOption === true && env === 'false') ||
        (useDaemonProcessOption === false && env === undefined) ||
        (useDaemonProcessOption === false && env === 'false')
      ) {
        this._enabled = false;
      } else {
        this._enabled = true;
      }
    }
    return this._enabled;
  }

  reset() {
    this.queue = new PromisedBasedQueue();
    this.socket = null;
    this.currentMessage = null;
    this.currentResolve = null;
    this.currentReject = null;
    this._enabled = undefined;
    this._connected = false;
  }

  async getProjectGraph(): Promise<ProjectGraph> {
    return (await this.sendToDaemonViaQueue({ type: 'REQUEST_PROJECT_GRAPH' }))
      .projectGraph;
  }

  processInBackground(requirePath: string, data: any): Promise<any> {
    return this.sendToDaemonViaQueue({
      type: 'PROCESS_IN_BACKGROUND',
      requirePath,
      data,
    });
  }

  recordOutputsHash(outputs: string[], hash: string): Promise<any> {
    return this.sendToDaemonViaQueue({
      type: 'RECORD_OUTPUTS_HASH',
      data: {
        outputs,
        hash,
      },
    });
  }

  outputsHashesMatch(outputs: string[], hash: string): Promise<any> {
    return this.sendToDaemonViaQueue({
      type: 'OUTPUTS_HASHES_MATCH',
      data: {
        outputs,
        hash,
      },
    });
  }

  async isServerAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const socket = connect(FULL_OS_SOCKET_PATH, () => {
          socket.destroy();
          resolve(true);
        });
        socket.once('error', () => {
          resolve(false);
        });
      } catch (err) {
        resolve(false);
      }
    });
  }

  private async sendToDaemonViaQueue(messageToDaemon: any): Promise<any> {
    return this.queue.sendToQueue(() =>
      this.sendMessageToDaemon(messageToDaemon)
    );
  }

  private setUpConnection() {
    this.socket = connect(FULL_OS_SOCKET_PATH);

    this.socket.on('ready', () => {
      this.socket.on(
        'data',
        consumeMessagesFromSocket(async (message) => {
          this.handleMessage(message);
        })
      );
    });

    this.socket.on('close', () => {
      output.error({
        title: 'Daemon process terminated and closed the connection',
        bodyLines: ['Please rerun the command, which will restart the daemon.'],
      });
      process.exit(1);
    });

    this.socket.on('error', (err) => {
      if (!err.message) {
        return this.currentReject(daemonProcessException(err.toString()));
      }

      if (err.message.startsWith('LOCK-FILES-CHANGED')) {
        // retry the current message
        // we cannot send it via the queue because we are in the middle of processing
        // a message from the queue
        return this.sendMessageToDaemon(this.currentMessage).then(
          this.currentResolve,
          this.currentReject
        );
      }

      let error: any;
      if (err.message.startsWith('connect ENOENT')) {
        error = daemonProcessException('The Daemon Server is not running');
      } else if (err.message.startsWith('connect ECONNREFUSED')) {
        error = daemonProcessException(
          `A server instance had not been fully shut down. Please try running the command again.`
        );
        killSocketOrPath();
      } else if (err.message.startsWith('read ECONNRESET')) {
        error = daemonProcessException(
          `Unable to connect to the daemon process.`
        );
      } else {
        error = daemonProcessException(err.toString());
      }
      return this.currentReject(error);
    });
  }

  private async sendMessageToDaemon(message: any): Promise<any> {
    if (!this._connected) {
      this._connected = true;
      if (!(await this.isServerAvailable())) {
        await this.startInBackground();
      }
      this.setUpConnection();
    }

    return new Promise((resolve, reject) => {
      performance.mark('sendMessageToDaemon-start');

      this.currentMessage = message;
      this.currentResolve = resolve;
      this.currentReject = reject;

      this.socket.write(JSON.stringify(message));
      // send EOT to indicate that the message has been fully written
      this.socket.write(String.fromCodePoint(4));
    });
  }

  private handleMessage(serializedResult: string) {
    try {
      performance.mark('json-parse-start');
      const parsedResult = JSON.parse(serializedResult);
      performance.mark('json-parse-end');
      performance.measure(
        'deserialize daemon response',
        'json-parse-start',
        'json-parse-end'
      );
      if (parsedResult.error) {
        this.currentReject(parsedResult.error);
      } else {
        performance.measure(
          'total for sendMessageToDaemon()',
          'sendMessageToDaemon-start',
          'json-parse-end'
        );
        return this.currentResolve(parsedResult);
      }
    } catch (e) {
      const endOfResponse =
        serializedResult.length > 300
          ? serializedResult.substring(serializedResult.length - 300)
          : serializedResult;
      this.currentReject(
        daemonProcessException(
          [
            'Could not deserialize response from Nx daemon.',
            `Message: ${e.message}`,
            '\n',
            `Received:`,
            endOfResponse,
            '\n',
          ].join('\n')
        )
      );
    }
  }

  async startInBackground(): Promise<ChildProcess['pid']> {
    await safelyCleanUpExistingProcess();
    ensureDirSync(DAEMON_DIR_FOR_CURRENT_WORKSPACE);
    ensureFileSync(DAEMON_OUTPUT_LOG_FILE);

    const out = openSync(DAEMON_OUTPUT_LOG_FILE, 'a');
    const err = openSync(DAEMON_OUTPUT_LOG_FILE, 'a');
    const backgroundProcess = spawn(
      process.execPath,
      [join(__dirname, '../server/start.js')],
      {
        cwd: workspaceRoot,
        stdio: ['ignore', out, err],
        detached: true,
        windowsHide: true,
        shell: false,
        env: DAEMON_ENV_SETTINGS,
      }
    );
    backgroundProcess.unref();

    // Persist metadata about the background process so that it can be cleaned up later if needed
    await writeDaemonJsonProcessCache({
      processId: backgroundProcess.pid,
    });

    /**
     * Ensure the server is actually available to connect to via IPC before resolving
     */
    let attempts = 0;
    return new Promise((resolve, reject) => {
      const id = setInterval(async () => {
        if (await this.isServerAvailable()) {
          clearInterval(id);
          resolve(backgroundProcess.pid);
        } else if (attempts > 200) {
          // daemon fails to start, the process probably exited
          // we print the logs and exit the client
          reject(
            daemonProcessException('Failed to start the Nx Daemon process.')
          );
        } else {
          attempts++;
        }
      }, 10);
    });
  }

  stop(): void {
    spawnSync(process.execPath, ['../server/stop.js'], {
      cwd: __dirname,
      stdio: 'inherit',
    });

    removeSocketDir();
    output.log({ title: 'Daemon Server - Stopped' });
  }
}

export const daemonClient = new DaemonClient(readNxJson());

function isDocker() {
  try {
    statSync('/.dockerenv');
    return true;
  } catch {
    return false;
  }
}

function nxJsonIsNotPresent() {
  return !new Workspaces(workspaceRoot).hasNxJson();
}

function daemonProcessException(message: string) {
  try {
    let log = readFileSync(DAEMON_OUTPUT_LOG_FILE).toString().split('\n');
    if (log.length > 20) {
      log = log.slice(log.length - 20);
    }
    const error = new Error(
      [
        message,
        '',
        'Messages from the log:',
        ...log,
        '\n',
        `More information: ${DAEMON_OUTPUT_LOG_FILE}`,
      ].join('\n')
    );
    (error as any).internalDaemonError = true;
    return error;
  } catch (e) {
    return new Error(message);
  }
}
