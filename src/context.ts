import { APIGateway, ApiGatewayV2, CloudFormation, Lambda, S3, SNS, SQS } from 'aws-sdk/clients/all';
import { ServiceConfigurationOptions } from 'aws-sdk/lib/service';
import { CliUx } from '@oclif/core';
import AwsServerlessDataflow = require('.');

export type S3BucketDetails = S3.Bucket & {
  bucketArn: string;
  notificationConfiguration: S3.NotificationConfiguration;
  notifyLambdaFunctionArns: Set<string>;
  notifySqsQueueArns: Set<string>;
  notifySnsTopicArns: Set<string>;
};
type DynamoDbTableDetails = {
  arn: string;
  TableName: string;
};
type SnsTopicDetails = SNS.TopicAttributesMap & {
  subscriptions: Array<Required<SNS.Subscription> & SNS.SubscriptionAttributesMap>;
  TopicArn: string;
};
type SqsQueueDetails = SQS.QueueAttributeMap & {
  subscriptions: Array<Required<SNS.Subscription> & SNS.SubscriptionAttributesMap>;
  QueueUrl: string;
  QueueArn: string;
  RedrivePolicy: string;
};
export type ApiGatewayApiDetails = (APIGateway.RestApi|ApiGatewayV2.Api) & {
  lambdaFunctionArns: Set<string>;
  routes: Array<(APIGateway.Resource|ApiGatewayV2.Route) & {
    routeKey: string;
    integrations: Array<(APIGateway.Integration|ApiGatewayV2.Integration) & { lambdaFunctionArn?: string }>;
  }>;
}
type CloudFormationStackDetails = CloudFormation.StackSummary & {
  resources: Array<CloudFormation.StackResourceSummary>;
}

export class Context {
  public awsOptions: Pick<ServiceConfigurationOptions, 'region'> = {};
  public cliUx = CliUx.ux;

  constructor(public options: typeof AwsServerlessDataflow.Options, public reconstructedcommandLine: string,
  ) {
    this.awsOptions.region = options.flags.region;
  }

  public inventory = {
    cfStackByName: new Map<string, CloudFormationStackDetails>(),
    cfStackById: new Map<string, CloudFormationStackDetails>(),
    lambdaFunctionsByArn: new Map<string, Lambda.FunctionConfiguration & {
      eventSourceMappings: Array<Lambda.EventSourceMappingConfiguration & {
        sqsQueue?: SqsQueueDetails;
        snsTopic?: SnsTopicDetails;
        dynamoDbTable?: DynamoDbTableDetails;
      }>;
    }>(),
    snsTopicsByArn: new Map<string, SnsTopicDetails>(),
    snsSubscriptionsByArn: new Map<string, Required<SNS.Subscription> & SNS.SubscriptionAttributesMap>(),
    sqsQueuesByUrl: new Map<string, SqsQueueDetails>(),
    sqsQueuesByArn: new Map<string, SqsQueueDetails>(),
    s3BucketsByArn: new Map<string, S3BucketDetails>(),
    dynamoDbTablesByArn: new Map<string, DynamoDbTableDetails>(),
    apigApisById: new Map<string, ApiGatewayApiDetails>(),
    apigDomainNamesByName: new Map<string, APIGateway.DomainName & {
      basePathMappings: Array<APIGateway.BasePathMapping & {
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
