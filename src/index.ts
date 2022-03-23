import { Command, Flags } from '@oclif/core';
import { Context } from './context';
import { Generator } from './generator';
import { LocalServer } from './local-server';
import { Surveyor } from './surveyor';
import { PromiseUtils } from '@handy-common-utils/promise-utils';
import { CommandOptions, OclifUtils } from '@handy-common-utils/oclif-utils';

class AwsServerlessDataflow extends Command {
  static Options: CommandOptions<typeof AwsServerlessDataflow>;  // just to hold the type
  static description = 'Visualisation of AWS serverless (Lambda, API Gateway, SNS, SQS, etc.) dataflow\n' +
    `This command line tool can visualise AWS serverless (Lambda, API Gateway, SNS, SQS, etc.) dataflow. 
It generates website files locally and can optionally launch a local server for you to preview.`.replace(/\n/g, '') +
`\n\nBefore running this tool, you need to log into your AWS account (through command line like aws, saml2aws, okta-aws, etc.) first. 
\nThis tool is free and open source: https://github.com/james-hu/aws-serverless-dataflow`;

  static flags = {
    version: Flags.version({ char: 'v' }),
    help: Flags.help({ char: 'h' }),
    'update-readme.md': Flags.boolean({ hidden: true, description: 'For developers only, don\'t use' }),

    region: Flags.string({ char: 'r', description: 'AWS region (required if you don\'t have AWS_REGION environment variable configured)' }),

    include: Flags.string({ char: 'i', default: ['*'], multiple: true, description: 'wildcard patterns for domain names and ARN of Lambda functions/SNS topics/SQS queues that should be includeed' }),
    exclude: Flags.string({ char: 'x', multiple: true, description: 'wildcard patterns for domain names and ARN of Lambda functions/SNS topics/SQS queues that should be excluded' }),

    'cloud-formation': Flags.boolean({ char: 'c', default: false, description: 'survey CloudFormation stack information (this takes more time)' }),

    server: Flags.boolean({ char: 's', description: 'start a local http server and open a browser for pre-viewing generated website' }),
    port: Flags.integer({ char: 'p', default: 8002, description: 'port number of the local http server for preview' }),

    parallelism: Flags.integer({ char: 'l', default: 4, description: 'approximately how many AWS API calls are allowed at the same time' }),
    quiet: Flags.boolean({ char: 'q', description: 'no console output' }),
    debug: Flags.boolean({ char: 'd', description: 'output debug messages' }),
  };

  static args = [
    { name: 'path' as const, default: 'dataflow', description: 'path for putting generated website files' },
  ];

  static examples = [
    '^ -r ap-southeast-2 -s',
    `^ -r ap-southeast-2 -s -i '*boi*' -i '*datahub*' \\
      -x '*jameshu*' -c`,
    `^ -r ap-southeast-2 -s -i '*lr-*' \\
      -i '*lead*' -x '*slack*' -x '*lead-prioritization*' \\
      -x '*lead-scor*' -x '*LeadCapture*' -c`,
  ];

  protected async init(): Promise<void> {
    OclifUtils.prependCliToExamples(this);
    return super.init();
  }

  async run(): Promise<void> {
    const options = await this.parse() as CommandOptions<typeof AwsServerlessDataflow>;
    if (options.flags['update-readme.md']) {
      await OclifUtils.injectHelpTextIntoReadmeMd(this);
      return;
    }

    do {
      const reconstructedcommandLine = OclifUtils.reconstructCommandLine(this, options);
      const context = new Context(options, reconstructedcommandLine);
      context.debug('Command line: ', reconstructedcommandLine);
      // context.debug('Options: ', options);

      try {
        await this.doRun(context);
        break;
      } catch (error: any) {
        context.debug(error);
        if (typeof error?.code === 'string' && error.code.startsWith('ExpiredToken')) {
          context.info('Did you forget to log into AWS? Please log into your AWS account and try again.');
          context.info(`  ${error}`);
          break;
        } else if (error.code === 'TooManyRequestsException') {
          const previousParallelism = options.flags.parallelism;
          options.flags.parallelism = previousParallelism - 1;
          if (options.flags.parallelism >= -3) {
            context.info(`AWS is not able to handle too many requests at the same time. Restarting with parallelism changing from ${previousParallelism} to ${options.flags.parallelism} ...`);
            context.info('(Parallelism can be specified by -l / --parallelism option)');
            await PromiseUtils.delayedResolve(5000);
          } else {
            context.info('AWS is not able to handle too many requests at the same time. Please try later.');
            context.info(`  ${error}`);
            break;
          }
        } else {
          throw error;
        }
      }
    } while (options.flags.parallelism >= -3);
  }

  protected async doRun(context: Context): Promise<void> {
    const surveyor = new Surveyor(context);
    const generator = new Generator(context);

    await surveyor.survey();
    await generator.generate();

    if (context.options.flags.server) {
      const server = new LocalServer(context);
      server.start();
      await PromiseUtils.delayedResolve(1000);
    }
  }
}

export = AwsServerlessDataflow
