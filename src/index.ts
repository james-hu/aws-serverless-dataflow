import { Command, flags } from '@oclif/command';
import * as Parser from '@oclif/parser';
import { Context } from './context';
import { Generator } from './generator';
import { LocalServer } from './local-server';
import { Surveyor } from './surveyor';

class AwsServerlessDataflow extends Command {
  static Options: CommandOptions<typeof AwsServerlessDataflow>  // just to hold the type
  static description = 'Visualisation of AWS serverless (Lambda, API Gateway, SNS, SQS, etc.) dataflow\n' +
    `This command line tool can visualise AWS serverless (Lambda, API Gateway, SNS, SQS, etc.) dataflow.
It generates website files locally and can optionally launch a local server for you to preview.
Before running this tool, you need to log into your AWS account (through command line like aws, saml2aws, okta-aws, etc.) first.`;

  static flags = {
    version: flags.version({ char: 'v' }),
    help: flags.help({ char: 'h' }),

    region: flags.string({ char: 'r', description: 'AWS region' }),

    include: flags.string({ char: 'i', default: ['*'], multiple: true, description: 'wildcard patterns for domain names and ARN of Lambda functions/SNS topics/SQS queues that should be includeed' }),
    exclude: flags.string({ char: 'x', multiple: true, description: 'wildcard patterns for domain names and ARN of Lambda functions/SNS topics/SQS queues that should be excluded' }),

    'cloud-formation': flags.boolean({ char: 'c', default: false, description: 'survey CloudFormation stack information (this takes more time)' }),

    server: flags.boolean({ char: 's', description: 'start a local http server and open a browser for pre-viewing generated website' }),
    port: flags.integer({ char: 'p', default: 8002, description: 'port number of the local http server for preview' }),

    quiet: flags.boolean({ char: 'q', description: 'no console output' }),
    debug: flags.boolean({ char: 'd', description: 'output debug messages' }),
  }

  static args = [
    { name: 'path' as const, default: 'dataflow', description: 'path for putting generated website files' },
  ]

  async run(argv?: string[]) {
    const options = this.parse<CommandFlags<typeof AwsServerlessDataflow>, CommandArgs<typeof AwsServerlessDataflow>>(AwsServerlessDataflow, argv);
    const context = new Context(options);
    context.debug('Options: ', options);

    const surveyor = new Surveyor(context);
    const generator = new Generator(context);

    await surveyor.survey();
    await generator.generate();

    if (options.flags.server) {
      const server = new LocalServer(context);
      server.start();
    }
  }
}

export = AwsServerlessDataflow

type CommandFlags<T> = T extends Parser.Input<infer F> ? F : never
type CommandArgNames<T> = T extends { name: infer A }[] ? A : never
type CommandArgs<T extends { args: Array<{ name: string }> }> = {
  [x in CommandArgNames<T['args']>]: string;
}
type CommandOptions<T extends { args: Array<{ name: string }> }> = Parser.Output<CommandFlags<T>, CommandArgs<T>>

