/* eslint-disable max-depth */
/* eslint-disable no-await-in-loop */
import * as moment from 'moment';
import { APIGateway, CloudFormation, Lambda, S3, SNS, SQS } from 'aws-sdk/clients/all';
import { AwsUtils, Utils } from 'handy-common-utils';
import { Context } from './context';
import buildIncludeExcludeMatcher from './matcher';

export class Surveyor {
  shouldInclude: (text: string | null | undefined) => boolean;

  constructor(private context: Context) {
    this.shouldInclude = buildIncludeExcludeMatcher(this.context.options.flags.include, this.context.options.flags.exclude);
  }

  async survey() {
    const startTime = moment();
    const shouldSurveyCloudFormation = this.context.options.flags['cloud-formation'];
    const phases = shouldSurveyCloudFormation ? 5 : 4;
    const cfSurvey = shouldSurveyCloudFormation ? this.surveyCloudFormation() : Promise.resolve();

    this.context.cliUx.action.start(`(1/${phases}) Surveying API Gateway and SQS`, undefined, { stdout: true });
    await Promise.all([
      this.surveyApiGateway(),
      this.surveySQS(),
    ]);
    this.context.cliUx.action.stop();

    this.context.cliUx.action.start(`(2/${phases}) Surveying SNS`, undefined, { stdout: true });
    await this.surveySNS();
    this.context.cliUx.action.stop();

    this.context.cliUx.action.start(`(3/${phases}) Surveying Lambda`, undefined, { stdout: true });
    await this.surveyLambda();
    this.context.cliUx.action.stop();

    this.context.cliUx.action.start(`(4/${phases}) Surveying S3`, undefined, { stdout: true });
    await this.surveyS3();
    this.context.cliUx.action.stop();

    if (shouldSurveyCloudFormation) {
      this.context.cliUx.action.start(`(5/${phases}) Waiting for CloudFormation survey to finish`, undefined, { stdout: true });
      await cfSurvey;
      this.context.cliUx.action.stop();
    }
    const duration = moment.duration(moment().diff(startTime));
    this.context.info(`Finished survey in ${duration.as('second')} seconds`);
  }

  async surveyApiGateway() {
    const parallelism = this.context.options.flags.parallelism;
    const inventory = this.context.inventory;
    const apig = new APIGateway(this.context.awsOptions);

    // Domain Names
    const domainNameObjects = await AwsUtils.repeatFetchingItemsByPosition(
      pagingParam => apig.getDomainNames({ limit: 100, ...pagingParam }).promise(),
    );
    await Utils.inParallel(parallelism, domainNameObjects, async domainNameObj => {
      const domainName = domainNameObj.domainName!;
      if (this.shouldInclude(domainName)) {
        const mappings = await AwsUtils.repeatFetchingItemsByPosition(
          pagingParam => apig.getBasePathMappings({ domainName, limit: 500, ...pagingParam }).promise(),
        );
        inventory.apigDomainNamesByName.set(domainName, {
          ...domainNameObj,
          basePathMappings: mappings.map(mapping => {
            const basePathUrl = mapping.basePath === '(none)' ? '' : mapping.basePath!;
            const domainAndBasePathUrl = `${domainName}/${basePathUrl}`;
            return { ...mapping, basePathUrl, domainAndBasePathUrl };
          }),
        });
      }
    });
    this.context.info(`Surveyed ${inventory.apigDomainNamesByName.size}/${domainNameObjects.length} domains in API Gateway`);

    // REST APIs
    const restApis = await AwsUtils.repeatFetchingItemsByPosition(
      pagingParam => apig.getRestApis({ limit: 100, ...pagingParam }).promise(),
    );
    await Utils.inParallel(parallelism, restApis, async restApi => {
      const restApiId = restApi.id!;

      const resources = await AwsUtils.repeatFetchingItemsByPosition(
        pagingParam => apig.getResources({ ...pagingParam, restApiId }).promise(),
      );
      const lambdaFunctionArns = new Set<string>(); // at resource level
      const detailedResources = new Array<APIGateway.Resource & {
        integrations: Array<APIGateway.Integration & { lambdaFunctionArn: string | null }>;
      }>();
      for (const resource of resources) {
        const resourceDetails = { ...resource, integrations: new Array<APIGateway.Integration & { lambdaFunctionArn: string | null }>() };
        if (resource.resourceMethods) {
          for (const httpMethod of Object.keys(resource.resourceMethods)) {
            const integration = await apig.getIntegration({ restApiId, resourceId: resource.id!, httpMethod }).promise();
            const lambdaFunctionArn = this.retrieveLambdaFunctionArnFromApiGatewayIntegrationUri(integration.uri);
            const integrationDetails = { ...integration, lambdaFunctionArn };
            if (lambdaFunctionArn) {
              lambdaFunctionArns.add(lambdaFunctionArn);
            }
            resourceDetails.integrations.push(integrationDetails);
          }
        }
        detailedResources.push(resourceDetails);
      }
      const restApiDetails = { ...restApi, lambdaFunctionArns, resources: detailedResources };
      inventory.apigApisById.set(restApiId, restApiDetails);
    });
    this.context.info(`Surveyed ${restApis.length} APIs in API Gateway`);
  }

  retrieveLambdaFunctionArnFromApiGatewayIntegrationUri(uri?: string): string | null {
    if (!uri || !uri.match(/\/functions\/arn:.*:lambda:/) || !uri.endsWith('/invocations')) {
      return null;
    }
    return uri.replace(/.*\/functions\/arn:/, 'arn:').replace(/\/invocations$/, '');
  }

  async surveySQS() {
    const parallelism = this.context.options.flags.parallelism;
    const inventory = this.context.inventory;
    const sqs = new SQS(this.context.awsOptions);

    const queueUrls = await AwsUtils.repeatFetchingItemsByNextToken<string>('QueueUrls',
      pagingParam => sqs.listQueues({ ...pagingParam }).promise(),
    );
    await Utils.inParallel(parallelism, queueUrls, async queueUrl => {
      const queueAttributes = (await sqs.getQueueAttributes({ QueueUrl: queueUrl, AttributeNames: ['All'] }).promise()).Attributes!;
      queueAttributes.QueueUrl = queueUrl;    // add this for convenience
      const queueDetails = { ...queueAttributes, subscriptions: [] } as any;
      const queueArn = queueAttributes.QueueArn;
      if (this.shouldInclude(queueArn)) {
        inventory.sqsQueuesByUrl.set(queueUrl, queueDetails);
        inventory.sqsQueuesByArn.set(queueArn, queueDetails);
      }
    });
    this.context.info(`Surveyed ${inventory.sqsQueuesByArn.size}/${queueUrls.length} queues in SQS`);
  }

  async surveySNS() {
    const parallelism = this.context.options.flags.parallelism;
    const inventory = this.context.inventory;
    const sns = new SNS(this.context.awsOptions);

    // topics
    const topics = await AwsUtils.repeatFetchingItemsByNextToken<SNS.Topic>('Topics',
      pagingParam => sns.listTopics({ ...pagingParam }).promise(),
    );
    const topicArns = topics.map(topic => topic.TopicArn!);
    await Utils.inParallel(parallelism, topicArns, async topicArn => {
      const topicAttributes = (await sns.getTopicAttributes({ TopicArn: topicArn }).promise()).Attributes!;
      const topicDetails = { ...topicAttributes, subscriptions: [] } as any;
      if (this.shouldInclude(topicArn)) {
        inventory.snsTopicsByArn.set(topicArn, topicDetails);
      }
    });
    this.context.info(`Surveyed ${inventory.snsTopicsByArn.size}/${topics.length} topics in SNS`);

    // subscriptions
    const subscriptions = await AwsUtils.repeatFetchingItemsByNextToken<SNS.Subscription>('Subscriptions',
      pagingParam => sns.listSubscriptions({ ...pagingParam }).promise(),
    );
    await Utils.inParallel(parallelism, subscriptions, async subscription => {
      const subscriptionArn = subscription.SubscriptionArn!;
      if (this.shouldInclude(subscription.TopicArn)) {
        try {
          const subscriptionAttributes = (await sns.getSubscriptionAttributes({ SubscriptionArn: subscriptionArn }).promise()).Attributes!;
          const subscriptionDetails = { ...subscriptionAttributes, ...subscription as Required<typeof subscription> };
          inventory.snsSubscriptionsByArn.set(subscriptionArn, subscriptionDetails);
          inventory.snsTopicsByArn.get(subscription.TopicArn!)?.subscriptions.push(subscriptionDetails);
        } catch (error) {
          if (error.statusCode === 404 || error.statusCode === 400) {
            this.context.debug(`Ignore zombie or pending subscription: ${subscriptionArn}`);
          } else {
            throw error;
          }
        }
      }
    });
    this.context.info(`Surveyed ${inventory.snsSubscriptionsByArn.size}/${subscriptions.length} subscriptions in SNS`);
  }

  async surveyS3() {
    const parallelism = this.context.options.flags.parallelism;
    const inventory = this.context.inventory;
    const s3 = new S3(this.context.awsOptions);

    const buckets = (await s3.listBuckets().promise()).Buckets ?? [];
    await Utils.inParallel(parallelism, buckets, async bucket => {
      if (this.shouldInclude(bucket.Name)) {
        const bucketName = bucket.Name!;
        const bucketArn = `arn::s3:::${bucketName}`;  // this is not the real ARN but should work for our purpose
        const notificationConfiguration = await s3.getBucketNotificationConfiguration({ Bucket: bucketName }).promise();
        const notifyLambdaFunctionArns = new Set((notificationConfiguration.LambdaFunctionConfigurations ?? []).map(c => c.LambdaFunctionArn).filter(arn => inventory.lambdaFunctionsByArn.has(arn)));
        const notifySqsQueueArns = new Set((notificationConfiguration.QueueConfigurations ?? []).map(c => c.QueueArn).filter(arn => inventory.sqsQueuesByArn.has(arn)));
        const notifySnsTopicArns = new Set((notificationConfiguration.TopicConfigurations ?? []).map(c => c.TopicArn).filter(arn => inventory.snsTopicsByArn.has(arn)));

        inventory.s3BucketsByArn.set(bucketArn, { ...bucket,
          bucketArn,
          notificationConfiguration,
          notifyLambdaFunctionArns,
          notifySqsQueueArns,
          notifySnsTopicArns,
        });
      }
    });
    this.context.info(`Surveyed ${inventory.s3BucketsByArn.size}/${buckets.length} buckets in S3`);
  }

  async surveyLambda() {
    const parallelism = 1 + Math.floor(Math.sqrt(Math.sqrt(this.context.options.flags.parallelism)) / 1.4);
    // console.log(`surveyLambda() parallelism: ${parallelism}`);
    const inventory = this.context.inventory;
    const lambda = new Lambda(this.context.awsOptions);
    const functionConfigurations = await AwsUtils.repeatFetchingItemsByMarker<Lambda.FunctionConfiguration>('Functions',
      pagingParam => lambda.listFunctions({ ...pagingParam }).promise()
    );
    await Utils.inParallel(parallelism, functionConfigurations, async functionConfiguration => {
      const functionArn = functionConfiguration.FunctionArn!;
      if (this.shouldInclude(functionArn)) {
        const eventSourceMappings = await AwsUtils.repeatFetchingItemsByMarker<Lambda.EventSourceMappingConfiguration>('EventSourceMappings',
          pagingParam => lambda.listEventSourceMappings({ ...pagingParam, FunctionName: functionArn }).promise()
        );
        const detailedEventSourceMappings = eventSourceMappings.map(mapping => {
          let snsTopic;
          let sqsQueue;
          let dynamoDbTable;
          const eventArn = mapping.EventSourceArn;
          if (eventArn?.includes(':sns:')) {
            snsTopic = inventory.snsTopicsByArn.get(eventArn);
          } else if (eventArn?.includes(':sqs:')) {
            sqsQueue = inventory.sqsQueuesByArn.get(eventArn);
          } else if (eventArn?.includes(':dynamodb:')) {
            const tableArn = AwsUtils.parseArn(eventArn.replace(/\/stream\/.*/, ''));
            if (tableArn) {
              dynamoDbTable = {
                arn: tableArn.arn,
                TableName: tableArn!.resourceId!,
              };
              inventory.dynamoDbTablesByArn.set(dynamoDbTable.arn, dynamoDbTable);
            }
          } else {
            this.context.debug(`Ignore event source ${eventArn} for Lambda function ${functionConfiguration.FunctionName}`);
          }
          return { ...mapping, snsTopic, sqsQueue, dynamoDbTable };
        });
        const functionDetails = { ...functionConfiguration, eventSourceMappings: detailedEventSourceMappings };
        inventory.lambdaFunctionsByArn.set(functionArn, functionDetails);
      }
    });
    this.context.info(`Surveyed ${inventory.lambdaFunctionsByArn.size}/${functionConfigurations.length} functions in Lambda`);
  }

  async surveyCloudFormation() {
    const inventory = this.context.inventory;
    const cf = new CloudFormation({ ...this.context.awsOptions, maxRetries: 6, retryDelayOptions: { base: 600 } });
    const stacks = await AwsUtils.repeatFetchingItemsByNextToken<CloudFormation.StackSummary>('StackSummaries',
      pagingParam => cf.listStacks({ ...pagingParam }).promise(),
    );
    for (let i = 0; i < stacks.length; i++) {
      const stack = stacks[i];
      if (this.shouldInclude(stack.StackId)) {
        let resources = new Array<CloudFormation.StackResourceSummary>();
        try {
          resources = await AwsUtils.repeatFetchingItemsByNextToken<CloudFormation.StackResourceSummary>('StackResourceSummaries',
            pagingParam => cf.listStackResources({ ...pagingParam, StackName: stack.StackId! }).promise(),
          );
        } catch (error) {
          if (error.statusCode === 400) {
            const msg = `Ignore resources of CloudFormation stack (${i}/${stacks.length}) ${stack.StackId}: ${error}`;
            if (error.retryable) {
              const noStackTraceError = error;
              delete noStackTraceError.stack;
              this.context.info(msg, noStackTraceError);
            } else {
              this.context.debug(msg);
            }
          } else {
            this.context.info(error);
          }
        }

        const stackDetails = { ...stack, resources };
        inventory.cfStackByName.set(stack.StackName, stackDetails);
        inventory.cfStackById.set(stack.StackId!, stackDetails);
      }
    }
    this.context.info(`Surveyed ${inventory.cfStackByName.size}/${stacks.length} stacks in CloudFormation`);
  }
}
