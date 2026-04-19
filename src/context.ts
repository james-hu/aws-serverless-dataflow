import { DomainName, BasePathMapping, RestApi, Resource, Integration } from '@aws-sdk/client-api-gateway';
import { Api, Route, Integration as IntegrationV2 } from '@aws-sdk/client-apigatewayv2';
import { StackSummary, StackResourceSummary } from '@aws-sdk/client-cloudformation';
import { FunctionConfiguration, EventSourceMappingConfiguration } from '@aws-sdk/client-lambda';
import { Bucket, NotificationConfiguration } from '@aws-sdk/client-s3';
import { Subscription } from '@aws-sdk/client-sns';
import { CliUx } from '@oclif/core';
import AwsServerlessDataflow = require('.');

export type S3BucketDetails = Bucket & {

  bucketArn: string;
  notificationConfiguration: NotificationConfiguration;
  notifyLambdaFunctionArns: Set<string>;
  notifySqsQueueArns: Set<string>;
  notifySnsTopicArns: Set<string>;
};

type DynamoDbTableDetails = {
  arn: string;
  TableName: string;
};
type SnsTopicDetails = Record<string, string> & {
  subscriptions: Array<Required<Subscription> & Record<string, string>>;
  TopicArn: string;
  DisplayName: string;
  SubscriptionsConfirmed: number;
  SubscriptionsDeleted: number;
  SubscriptionsPending: number;
};
type SqsQueueDetails = Record<string, string> & {
  subscriptions: Array<Required<Subscription> & Record<string, string>>;
  QueueUrl: string;
  QueueArn: string;
  RedrivePolicy: string;
  DelaySeconds: number;
  MaximumMessageSize: number;
  VisibilityTimeout: number;
};

export type ApiGatewayApiDetails = (RestApi | Api) & {
  lambdaFunctionArns: Set<string>;
  routes: Array<(Resource | Route) & {
    routeKey: string;
    integrations: Array<(Integration | IntegrationV2) & { lambdaFunctionArn?: string }>;
  }>;
}
type CloudFormationStackDetails = StackSummary & {
  resources: Array<StackResourceSummary>;
}

export class Context {
  public awsOptions: { region?: string } = {};

  public cliUx = CliUx.ux;

  constructor(public options: typeof AwsServerlessDataflow.Options, public reconstructedcommandLine: string,
  ) {
    this.awsOptions.region = options.flags.region;
  }

  public inventory = {
    cfStackByName: new Map<string, CloudFormationStackDetails>(),
    cfStackById: new Map<string, CloudFormationStackDetails>(),
    lambdaFunctionsByArn: new Map<string, FunctionConfiguration & {
      eventSourceMappings: Array<EventSourceMappingConfiguration & {
        sqsQueue?: SqsQueueDetails;
        snsTopic?: SnsTopicDetails;
        dynamoDbTable?: DynamoDbTableDetails;
      }>;
    }>(),
    snsTopicsByArn: new Map<string, SnsTopicDetails>(),
    snsSubscriptionsByArn: new Map<string, Required<Subscription> & Record<string, string>>(),
    sqsQueuesByUrl: new Map<string, SqsQueueDetails>(),
    sqsQueuesByArn: new Map<string, SqsQueueDetails>(),
    s3BucketsByArn: new Map<string, S3BucketDetails>(),
    dynamoDbTablesByArn: new Map<string, DynamoDbTableDetails>(),
    apigApisById: new Map<string, ApiGatewayApiDetails>(),
    apigDomainNamesByName: new Map<string, DomainName & {
      basePathMappings: Array<BasePathMapping & {
        basePathUrl: string;
        domainAndBasePathUrl: string;
      }>;
    }>(),

  };

  info(message?: any, ...optionalParams: any[]): void {
    if (this.options.flags.quiet !== true) {
      console.log(message, ...optionalParams);
    }
  }

  debug(message?: any, ...optionalParams: any[]): void {
    if (this.options.flags.debug === true) {
      console.log(message, ...optionalParams);
    }
  }
}
