/* eslint-disable unicorn/prefer-node-protocol */
/* eslint-disable unicorn/import-style */
/* eslint-disable complexity */
import { promisify } from 'util';
import * as fs from 'fs-extra';
import * as path from 'path';
import jsStringEscape from 'js-string-escape';
import ncp from 'ncp';
import { AwsUtils } from '@handy-common-utils/aws-utils';
import { Context } from './context';

interface Node {
  id: string;
  label: string;
  group?: Group;
  stackId?: string;
  stackName?: string;
  consoleUrl?: string;
  metadata?: any;
  [others: string]: any;
}

interface Edge {
  from: string;
  to: string;
  arrows?: Arrows;
  relation?: Relation;
  dashes?: boolean;
  stateIsEnabled?: boolean;
  [others: string]: any;
}

enum Arrows {
  From = 'from',
  To = 'to',
  Both = 'from,to',
  None = '',
}

enum Relation {
  Subscriber = 'Subscriber',
  DLQ = 'DLQ',
  Consumer = 'Consumer',
  User = 'User',
  Interface = 'Interface',
  Host = 'Host',
}

enum Group {
  SnsTopic = 'SnsTopic',
  SqsQueue = 'SqsQueue',
  LambdaFunction = 'LambdaFunction',
  DomainName = 'DomainName',
  BasePath = 'BasePath',
  Route = 'Route',
  CloudFormationStack = 'CfStack',
  S3Bucket = 'S3Bucket',
  DynamoDbTable = 'DynamoDbTable',
}

const ncpPromise = promisify(ncp);
function fsCopy(src: string, dest: string): Promise<void> {
  if (!(process as any)?.pkg?.entrypoint) {
    return fs.copy(src, dest, { preserveTimestamps: true });
  }
  return ncpPromise(src, dest);
}

export class Generator {
  constructor(protected context: Context) {}

  async generate(): Promise<void> {
    const destDir = this.context.options.args.path;
    this.context.cliUx.action.start(`Generating static website content in '${destDir}'`, undefined, { stdout: true });

    // eslint-disable-next-line unicorn/prefer-module
    const srcSrcDir = path.resolve(__dirname);
    const srcSiteDir = path.join(srcSrcDir, '..', 'site');

    let srcVisNetworkDir = path.join(srcSrcDir, '..', 'node_modules', 'vis-network');
    if (!fs.existsSync(srcVisNetworkDir)) {
      srcVisNetworkDir = path.join(srcSrcDir, '..', '..', 'vis-network');
    }
    const srcVisNetworkJsFile = path.join(srcVisNetworkDir, 'standalone', 'umd', 'vis-network.min.js');

    const destJsDir = path.join(destDir, 'js');
    const destVisNetworkJsFile = path.join(destJsDir, 'vis-network.min.js');

    const nodes = this.generateNodes();
    const edges = this.generateEdges();
    const cfStackClusters = this.generateCloudFormationStackClusters(nodes);

    await fs.emptyDir(destDir);

    await Promise.all([
      fsCopy(srcSiteDir, destDir),
      fs.writeFile(path.join(destDir, 'base.js'), `
        var reconstructedCommandLine = '${jsStringEscape(this.context.reconstructedcommandLine)}';
        var generatedTimestamp = '${new Date().toISOString()}';
        var awsRegion = '${this.context.awsOptions.region}';
      `),
      fs.writeFile(path.join(destDir, 'nodes.js'), 'var nodesArray = ' + JSON.stringify([...nodes.values()], undefined, 2)),
      fs.writeFile(path.join(destDir, 'edges.js'), 'var edgesArray = ' + JSON.stringify([...edges.values()], undefined, 2)),
      fs.writeFile(path.join(destDir, 'clusters.js'), 'var cfStackClusters = ' + JSON.stringify([...cfStackClusters.values()], undefined, 2)),
    ]);

    await fsCopy(srcVisNetworkJsFile, destVisNetworkJsFile);

    this.context.cliUx.action.stop();
  }

  generateNodes(): Map<string, Node> {
    const inventory = this.context.inventory;
    const nodes = new Map<string, Node>();

    // SNS Topics
    for (const topic of inventory.snsTopicsByArn.values()) {
      const topicArn = AwsUtils.parseArn(topic.TopicArn)!;
      nodes.set(topicArn.arn, {
        id: topicArn.arn,
        label: `topic:\n${topicArn.resource}`,
        group: Group.SnsTopic,
        consoleUrl: this.generateConsoleUrl(Group.SnsTopic, topicArn.arn, topicArn.resource),
        metadata: {
          DisplayName: topic.DisplayName,
          SubscriptionsConfirmed: topic.SubscriptionsConfirmed,
          SubscriptionsPending: topic.SubscriptionsPending,
        },
      });
    }

    // SQS Queues
    for (const queue of inventory.sqsQueuesByArn.values()) {
      const queueArn = AwsUtils.parseArn(queue.QueueArn)!;
      nodes.set(queueArn.arn, {
        id: queueArn.arn,
        label: `queue:\n${queueArn.resource}`,
        group: Group.SqsQueue,
        consoleUrl: this.generateConsoleUrl(Group.SqsQueue, queueArn.arn, queueArn.resource),
        metadata: {
          QueueUrl: queue.QueueUrl,
          DelaySeconds: queue.DelaySeconds,
          MaximumMessageSize: queue.MaximumMessageSize,
          VisibilityTimeout: queue.VisibilityTimeout,
        },
      });
    }

    // Lambda Functions
    for (const lambda of inventory.lambdaFunctionsByArn.values()) {
      const lambdaArn = AwsUtils.parseArn(lambda.FunctionArn)!;
      nodes.set(lambdaArn.arn, {
        id: lambdaArn.arn,
        label: `${lambdaArn.resourceId}`,
        group: Group.LambdaFunction,
        consoleUrl: this.generateConsoleUrl(Group.LambdaFunction, lambdaArn.arn, lambdaArn.resourceId),
        metadata: {
          Runtime: lambda.Runtime,
          Handler: lambda.Handler,
          Timeout: lambda.Timeout,
          MemorySize: lambda.MemorySize,
          LastModified: lambda.LastModified,
        },
      });
    }

    // DynamoDB Tables
    for (const table of inventory.dynamoDbTablesByArn.values()) {
      nodes.set(table.arn, {
        id: table.arn,
        label: table.TableName,
        group: Group.DynamoDbTable,
        consoleUrl: this.generateConsoleUrl(Group.DynamoDbTable, table.arn, table.TableName),
        metadata: {
          TableName: table.TableName,
        },
      });
    }

    // Domain Names & Base Path mappings
    for (const domain of inventory.apigDomainNamesByName.values()) {
      const domainName = domain.domainName!;
      nodes.set(domainName, {
        id: domainName,
        label: domainName,
        group: Group.DomainName,
        consoleUrl: this.generateConsoleUrl(Group.DomainName, domainName),
        metadata: {
          securityPolicy: domain.securityPolicy,
          certificateArn: domain.certificateArn,
        },
      });
      for (const mapping of domain.basePathMappings) {
        const basePathUrl = mapping.basePathUrl === '' ? '(none)' : mapping.basePathUrl;
        const domainAndBasePathUrl = mapping.domainAndBasePathUrl;
        const basePathMetadata = {
          stage: mapping.stage,
          restApiId: mapping.restApiId,
        };
        nodes.set(domainAndBasePathUrl, {
          id: domainAndBasePathUrl,
          label: basePathUrl,
          group: Group.BasePath,
          metadata: basePathMetadata,
          consoleUrl: this.generateConsoleUrl(Group.BasePath, domainName),
        });
        const api = inventory.apigApisById.get(mapping.restApiId!);
        if (api?.routes) {
          for (const resource of api.routes) {
            const domainAndFullPathUrl = `${domainAndBasePathUrl}/${resource.routeKey}`;
            const routeMetadata: any = { ...resource, restApiId: mapping.restApiId };
            delete routeMetadata.integrations; // too large for table
            nodes.set(domainAndFullPathUrl, {
              id: domainAndFullPathUrl,
              label: resource.routeKey,
              group: Group.Route,
              metadata: routeMetadata,
              consoleUrl: this.generateConsoleUrl(Group.Route, domainAndFullPathUrl, undefined, routeMetadata),
            });
          }
        }
      }
    }

    // S3 buckets' notification configurations
    for (const bucket of inventory.s3BucketsByArn.values()) {
      if (bucket.notifyLambdaFunctionArns.size > 0 || bucket.notifySqsQueueArns.size > 0 || bucket.notifySnsTopicArns.size > 0) {
        nodes.set(bucket.bucketArn, {
          id: bucket.bucketArn,
          label: `bucket:\n${bucket.Name}`,
          group: Group.S3Bucket,
          consoleUrl: this.generateConsoleUrl(Group.S3Bucket, bucket.bucketArn, bucket.Name),
          metadata: {
            Name: bucket.Name,
            CreationDate: bucket.CreationDate,
          },
        });
      }
    }

    // DynamoDb tables configured in Lambda function's event source mappings
    for (const table of inventory.dynamoDbTablesByArn.values()) {
      nodes.set(table.arn, {
        id: table.arn,
        label: `DynamoDB table:\n${table.TableName}`,
        group: Group.DynamoDbTable,
        consoleUrl: this.generateConsoleUrl(Group.DynamoDbTable, table.arn, table.TableName),
        metadata: {
          TableName: table.TableName,
        },
      });
    }

    return nodes;
  }

  generateConsoleUrl(group: Group, arn: string, resourceId?: string, metadata?: any): string | undefined {
    const region = this.context.awsOptions.region;
    switch (group) {
      case Group.LambdaFunction: {
        return `https://${region}.console.aws.amazon.com/lambda/home?region=${region}#/functions/${resourceId}?tab=code`;
      }
      case Group.SnsTopic: {
        return `https://${region}.console.aws.amazon.com/sns/v3/home?region=${region}#/topic/${arn}`;
      }
      case Group.SqsQueue: {
        return `https://${region}.console.aws.amazon.com/sqs/v2/home?region=${region}#/queues`;
      }
      case Group.S3Bucket: {
        return `https://s3.console.aws.amazon.com/s3/buckets/${resourceId}?region=${region}`;
      }
      case Group.DynamoDbTable: {
        return `https://${region}.console.aws.amazon.com/dynamodbv2/home?region=${region}#tables:selected=${resourceId};tab=overview`;
      }
      case Group.DomainName:
      case Group.BasePath: {
        return `https://${region}.console.aws.amazon.com/apigateway/main/publish/domain-names?region=${region}`;
      }
      case Group.Route: {
        if (metadata?.id && metadata?.restApiId) { // REST API (v1)
          return `https://${region}.console.aws.amazon.com/apigateway/home?region=${region}#/apis/${metadata.restApiId}/resources/${metadata.id}`;
        }
        if (metadata?.ApiId) { // HTTP API (v2)
          return `https://${region}.console.aws.amazon.com/apigateway/main/develop/apis/${metadata.ApiId}/routes?region=${region}`;
        }
        return undefined;
      }
      default: {
        return undefined;
      }
    }
  }

  generateCloudFormationStackClusters(nodes: Map<string, Node>): Map<string, Node> {
    const inventory = this.context.inventory;
    const stacks = new Map<string, Node>();

    for (const stack of inventory.cfStackById.values()) {
      const stackName = stack.StackName;
      const stackIdArn = stack.StackId!;
      const stackArn = AwsUtils.parseArn(stackIdArn);
      for (const resource of stack.resources) {
        let arn: string|null|undefined;
        switch (resource.ResourceType) {
          case 'AWS::Lambda::Function': {
            arn = `arn:${stackArn?.partition}:lambda:${stackArn?.region}:${stackArn?.accountId}:function:${resource.PhysicalResourceId}`;
            break;
          }
          case 'AWS::SQS::Queue': {
            arn = inventory.sqsQueuesByUrl.get(resource.PhysicalResourceId!)?.QueueArn;
            break;
          }
          case 'AWS::SNS::Topic': {
            arn = resource.PhysicalResourceId!;
            break;
          }
          case 'AWS::DynamoDB::Table': {
            arn = `arn:${stackArn?.partition}:dynamodb:${stackArn?.region}:${stackArn?.accountId}:table/${resource.PhysicalResourceId}`;
            break;
          }
          case 'AWS::S3::Bucket': {
            arn = `arn::s3:::${resource.PhysicalResourceId}`; // this is not the actual ARN but is consistent with surveyor.ts
            break;
          }
        }
        if (arn != null) {
          const node = nodes.get(arn);
          if (node != null) {
            node.stackId = stackIdArn;
            node.stackName = stackName;
            stacks.set(stackIdArn, {
              id: stackIdArn,
              label: stackName ?? '',
              group: Group.CloudFormationStack,
            });
          }
        }
      }
    }
    return stacks;
  }

  convertSqsUrlToArn(url?: string): string | undefined {
    if (!url || !/^http.*\/\/sqs\..+\/.+\/.+/.test(url)) {
      return undefined;
    }
    return url.replace(/^http.*\/\/sqs\./, 'arn:aws:sqs:').replace(/\.[.a-z-]+\.com\//, ':').replace('/', ':');
  }

  generateEdges(): Map<string, Edge> {
    const inventory = this.context.inventory;
    const edges = new Map<string, Edge>();

    // SNS Subscription
    for (const sub of inventory.snsSubscriptionsByArn.values()) {
      const id = `${sub.Endpoint}->${sub.TopicArn}`;
      // https://docs.aws.amazon.com/sns/latest/api/API_Subscribe.html
      const endpoint = sub.Endpoint;
      const queue = inventory.sqsQueuesByArn.get(endpoint);
      if (queue) {
        edges.set(id, {
          from: sub.Endpoint,
          to: sub.TopicArn,
          relation: Relation.Subscriber,
          arrows: Arrows.From,
        });
      }
    }

    // Lambda Function Event Sources and environment variables pointing to other resources
    for (const lambda of inventory.lambdaFunctionsByArn.values()) {
      const lambdaArn = AwsUtils.parseArn(lambda.FunctionArn)!;

      // event sources
      for (const mapping of lambda.eventSourceMappings) {
        const stateIsEnabled = mapping.State === 'Enabled';
        if (mapping.snsTopic) {
          const id = `${lambdaArn.arn}->${mapping.snsTopic.TopicArn}`;
          edges.set(id, {
            from: lambdaArn.arn,
            to: mapping.snsTopic.TopicArn,
            relation: Relation.Consumer,
            arrows: Arrows.From,
            dashes: !stateIsEnabled,
            stateIsEnabled,
          });
        }
        if (mapping.sqsQueue) {
          const id = `${lambdaArn.arn}->${mapping.sqsQueue.QueueArn}`;
          edges.set(id, {
            from: lambdaArn.arn,
            to: mapping.sqsQueue.QueueArn,
            relation: Relation.Consumer,
            arrows: Arrows.From,
            dashes: !stateIsEnabled,
            stateIsEnabled,
          });
        }
        if (mapping.dynamoDbTable) {
          const id = `${lambdaArn.arn}->${mapping.dynamoDbTable.arn}`;
          edges.set(id, {
            from: lambdaArn.arn,
            to: mapping.dynamoDbTable.arn,
            relation: Relation.Consumer,
            arrows: Arrows.From,
            dashes: !stateIsEnabled,
            stateIsEnabled,
          });
        }
      }

      // environment variables pointing to other resources
      if (lambda.Environment?.Variables) {
        for (const entry of Object.entries(lambda.Environment.Variables)) {
          const arnOrUrl = entry[1];
          if (inventory.snsTopicsByArn.has(arnOrUrl)) {
            const id = `${lambdaArn.arn}->${arnOrUrl}`;
            edges.set(id, {
              from: lambdaArn.arn,
              to: arnOrUrl,
              relation: Relation.User,
              arrows: Arrows.None,
              dashes: true,
            });
          }
          const queueArn = this.convertSqsUrlToArn(arnOrUrl) ?? arnOrUrl;
          if (inventory.sqsQueuesByArn.has(queueArn)) {
            const id = `${lambdaArn.arn}->${queueArn}`;
            edges.set(id, {
              from: lambdaArn.arn,
              to: queueArn,
              relation: Relation.User,
              arrows: Arrows.None,
              dashes: true,
            });
          }
        }
      }
    }

    // SQS DLQ
    for (const queue of inventory.sqsQueuesByArn.values()) {
      if (queue.RedrivePolicy) {
        const redrivePolicy = JSON.parse(queue.RedrivePolicy);
        const dlqArn: string = redrivePolicy.deadLetterTargetArn;
        if (inventory.sqsQueuesByArn.has(dlqArn)) {
          const id = `${dlqArn}->${queue.QueueArn}`;
          edges.set(id, {
            from: dlqArn,
            to: queue.QueueArn,
            relation: Relation.DLQ,
            arrows: Arrows.From,
            dashes: true,
          });
        }
      }
    }

    // Domain Names & Base Path mappings, and Lambda Functions mapped
    for (const domain of inventory.apigDomainNamesByName.values()) {
      for (const mapping of domain.basePathMappings) {
        const domainAndBasePathUrl = mapping.domainAndBasePathUrl;
        edges.set(domainAndBasePathUrl, {
          from: domain.domainName!,
          to: domainAndBasePathUrl,
          relation: Relation.Host,
        });
        const api = inventory.apigApisById.get(mapping.restApiId!);
        if (api) {
          for (const resource of api.routes) {
            const domainAndFullPathUrl = `${domainAndBasePathUrl}/${resource.routeKey}`;
            edges.set(`${domainAndBasePathUrl}->${domainAndFullPathUrl}`, {
              from: domainAndBasePathUrl,
              to: domainAndFullPathUrl,
              relation: Relation.Interface,
            });
            for (const integration of resource.integrations) {
              const id = `${domainAndFullPathUrl}-${integration.lambdaFunctionArn}`;
              edges.set(id, {
                from: domainAndFullPathUrl,
                to: integration.lambdaFunctionArn!,
                relation: Relation.Interface,
              });
            }
          }
        }
      }
    }

    // S3 buckets' notification configurations
    for (const bucket of inventory.s3BucketsByArn.values()) {
      for (const consumerArn of [...bucket.notifyLambdaFunctionArns, ...bucket.notifySnsTopicArns, ...bucket.notifySqsQueueArns]) {
        const bucketArn = bucket.bucketArn;
        const id = `${consumerArn}->${bucketArn}`;
        edges.set(id, {
          from: consumerArn,
          to: bucketArn,
          relation: Relation.Consumer,
          arrows: Arrows.From,
        });
      }
    }

    return edges;
  }
}

