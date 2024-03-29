import { Context } from './context';
import open from 'open';

export class LocalServer {
  protected server: any;
  protected url: string;

  constructor(private context: Context) {
    const port = this.context.options.flags.port;
    this.url = `http://localhost:${port}/`;
    // eslint-disable-next-line unicorn/prefer-module
    const rserver = require('really-simple-http-server');
    this.server = rserver({
      path: context.options.args.path,
      port: port,
    });
  }

  start(doOpen = true): void {
    this.server.start((err: any, _server: any) => {
      if (err) throw err;
      this.context.info(`Local server started. Ctrl-C to stop. Access URL: ${this.url}`);
      if (doOpen) {
        this.open();
      }
    });
  }

  stop(): void {
    this.server.stop();
  }

  open(): ReturnType<typeof open> {
    return open(this.url, { wait: true });
  }
}
