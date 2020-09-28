import { APIGateway, CloudFormation, Lambda, SNS, SQS } from 'aws-sdk/clients/all';
import matcher = require('matcher');
import { AwsUtils } from '../bb-commons/typescript';
import { Context } from './context';

export class Surveyor {
    private matchPatterns = new Array<string[]>();

    constructor(private context: Context){
        const include = this.context.options.flags.include ?? [];
        const exclude = this.context.options.flags.exclude ?? [];
        const allExcludes = exclude.map(p => `!${p}`);
        if (include.length === 0) {
            this.matchPatterns.push(allExcludes);
        } else {
            for (let inc of include) {
                this.matchPatterns.push([inc, ...allExcludes]);
            }
        }
    }

    async survey() {
        this.context.cliUx.action.start('Surveying API Gateway and SQS', undefined, {stdout: true});
        await Promise.all([
            // this.surveyCloudFormation(),
            this.surveyApiGateway(),
            this.surveySQS(),
        ]);
        this.context.cliUx.action.stop();

        this.context.cliUx.action.start('Surveying SNS', undefined, {stdout: true});
        await this.surveySNS();
        this.context.cliUx.action.stop();
        
        this.context.cliUx.action.start('Surveying Lambda', undefined, {stdout: true});
        await this.surveyLambda();
        this.context.cliUx.action.stop();
    }

    async surveyApiGateway() {
        const inventory = this.context.inventory;
        const apig = new APIGateway(this.context.awsOptions);

        // Domain Names
        const domainNameObjects = await AwsUtils.repeatFetchingItemsByPosition(
            pagingParam => apig.getDomainNames({limit: 100, ...pagingParam}).promise(),
        );
        for (let domainNameObj of domainNameObjects) {
            const domainName = domainNameObj.domainName!
            if (this.shouldInclude(domainName)) {
                const mappings = await AwsUtils.repeatFetchingItemsByPosition(
                    pagingParam => apig.getBasePathMappings({domainName, limit: 500, ...pagingParam}).promise(),
                );
                inventory.apigDomainNamesByName.set(domainName, {...domainNameObj, 
                    basePathMappings: mappings.map(mapping => {
                        const basePathUrl = mapping.basePath === '(none)' ? '' : mapping.basePath!;
                        const domainAndBasePathUrl = `${domainName}/${basePathUrl}`;
                        return {...mapping, basePathUrl, domainAndBasePathUrl};
                    }),
                });
            }
        }
        this.context.debug(`Found ${inventory.apigDomainNamesByName.size}/${domainNameObjects.length} domains in API Gateway`);

        // REST APIs
        const restApis = await AwsUtils.repeatFetchingItemsByPosition(
            pagingParam => apig.getRestApis({limit: 100, ...pagingParam}).promise(),
        );
        for (let restApi of restApis) {
            const restApiId = restApi.id!;

            const resources = await AwsUtils.repeatFetchingItemsByPosition(
                pagingParam => apig.getResources({...pagingParam, restApiId}).promise(),
            );
            const lambdaFunctionArns = new Set<string>(); // at resource level
            const detailedResources = new Array<APIGateway.Resource & {
                integrations: Array<APIGateway.Integration & {lambdaFunctionArn: string|null}>,
            }>();
            for (let resource of resources) {
                const resourceDetails = {...resource, integrations: new Array<APIGateway.Integration & {lambdaFunctionArn: string|null}>()};
                if (resource.resourceMethods) {
                    for (let httpMethod of Object.keys(resource.resourceMethods)) {
                        const integration = await apig.getIntegration({restApiId, resourceId: resource.id!, httpMethod}).promise();
                        const lambdaFunctionArn = this.retrieveLambdaFunctionArnFromApiGatewayIntegrationUri(integration.uri);
                        const integrationDetails = {...integration, lambdaFunctionArn};
                        if (lambdaFunctionArn) {
                            lambdaFunctionArns.add(lambdaFunctionArn);
                        }
                        resourceDetails.integrations.push(integrationDetails);
                    }
                }
                detailedResources.push(resourceDetails);
            }
            const restApiDetails = {...restApi, lambdaFunctionArns, resources: detailedResources};
            inventory.apigApisById.set(restApiId, restApiDetails);
        }
        this.context.debug(`Found ${restApis.length} APIs in API Gateway`);
    }

    retrieveLambdaFunctionArnFromApiGatewayIntegrationUri(uri?: string): string|null {
        if (!uri || !uri.includes('/functions/arn:aws:lambda:') || !uri.endsWith('/invocations')) {
            return null;
        }
        return uri.replace(/.*\/functions\/arn:aws:lambda:/, 'arn:aws:lambda:')
                    .replace(/\/invocations$/, '');
    }

    async surveySQS() {
        const inventory = this.context.inventory;
        const sqs = new SQS(this.context.awsOptions);

        const queueUrls = await AwsUtils.repeatFetchingItemsByNextToken<string>('QueueUrls',
            pagingParam => sqs.listQueues({...pagingParam}).promise(),
        );
        for (let queueUrl of queueUrls) {
            const queueAttributes = (await sqs.getQueueAttributes({QueueUrl: queueUrl, AttributeNames: ['All']}).promise()).Attributes!;
            queueAttributes.QueueUrl = queueUrl;    // add this for convenience
            const queueDetails = {...queueAttributes, subscriptions: []} as any;
            const queueArn = queueAttributes.QueueArn;
            if (this.shouldInclude(queueArn)) {
                inventory.sqsQueuesByUrl.set(queueUrl, queueDetails);
                inventory.sqsQueuesByArn.set(queueArn, queueDetails);
            }
        }
        this.context.debug(`Found ${inventory.sqsQueuesByArn.size}/${queueUrls.length} queues in SQS`);
    }

    async surveySNS() {
        const inventory = this.context.inventory;
        const sns = new SNS(this.context.awsOptions);

        // topics
        const topics = await AwsUtils.repeatFetchingItemsByNextToken<SNS.Topic>('Topics',
            pagingParam => sns.listTopics({...pagingParam}).promise(),
        );
        const topicArns = topics.map(topic => topic.TopicArn!);
        for (let topicArn of topicArns) {
            const topicAttributes = (await sns.getTopicAttributes({TopicArn: topicArn}).promise()).Attributes!;
            const topicDetails = {...topicAttributes, subscriptions: []} as any;
            if (this.shouldInclude(topicArn)) {
                inventory.snsTopicsByArn.set(topicArn, topicDetails);
            }
        }
        this.context.debug(`Found ${inventory.snsTopicsByArn.size}/${topics.length} topics in SNS`);

        // subscriptions
        const subscriptions = await AwsUtils.repeatFetchingItemsByNextToken<SNS.Subscription>('Subscriptions',
            pagingParam => sns.listSubscriptions({...pagingParam}).promise(),
        );
        for (let subscription of subscriptions) {
            const subscriptionArn = subscription.SubscriptionArn!;
            if (this.shouldInclude(subscription.TopicArn)) {
                try{
                    const subscriptionAttributes = (await sns.getSubscriptionAttributes({SubscriptionArn: subscriptionArn}).promise()).Attributes!;
                    const subscriptionDetails = {...subscriptionAttributes, ...subscription as Required<typeof subscription>};
                    inventory.snsSubscriptionsByArn.set(subscriptionArn, subscriptionDetails);
                    inventory.snsTopicsByArn.get(subscription.TopicArn!)?.subscriptions.push(subscriptionDetails);
                }catch(e){
                    if (e.statusCode === 404 || e.statusCode === 400) {
                        console.log(`Ignore zombie or pending subscription: ${subscriptionArn}`);
                    } else {
                        throw e;
                    }
                }
            }
        }
        this.context.debug(`Found ${inventory.snsSubscriptionsByArn.size}/${subscriptions.length} subscriptions in SNS`);
    }

    async surveyLambda() {
        const inventory = this.context.inventory;
        const lambda = new Lambda(this.context.awsOptions);
        const functionConfigurations = await AwsUtils.repeatFetchingItemsByMarker<Lambda.FunctionConfiguration>('Functions',
            pagingParam => lambda.listFunctions({...pagingParam}).promise()
        );
        for(let functionConfiguration of functionConfigurations) {
            const functionArn = functionConfiguration.FunctionArn!;
            if (this.shouldInclude(functionArn)) {
                const eventSourceMappings = await AwsUtils.repeatFetchingItemsByMarker<Lambda.EventSourceMappingConfiguration>('EventSourceMappings',
                    pagingParam => lambda.listEventSourceMappings({...pagingParam, FunctionName: functionArn}).promise()
                );
                const detailedEventSourceMappings = eventSourceMappings.map(mapping => {
                    let snsTopic;
                    let sqsQueue;
                    const eventArn = mapping.EventSourceArn;
                    if (eventArn?.startsWith('arn:aws:sns:')) {
                        snsTopic = inventory.snsTopicsByArn.get(eventArn);
                    } else if (eventArn?.startsWith('arn:aws:sqs:')) {
                        sqsQueue = inventory.sqsQueuesByArn.get(eventArn);
                    } else {
                        this.context.debug(`Ignore event source ${eventArn} for Lambda function ${functionConfiguration.FunctionName}`);
                    }
                    return {...mapping, snsTopic, sqsQueue};
                });
                const functionDetails = {...functionConfiguration, eventSourceMappings: detailedEventSourceMappings};
                inventory.lambdaFunctionsByArn.set(functionArn, functionDetails);
            }
        }
        this.context.debug(`Found ${inventory.lambdaFunctionsByArn.size}/${functionConfigurations.length} functions in Lambda`);
    }

    async surveyCloudFormation() {
        const inventory = this.context.inventory;
        const cf = new CloudFormation(this.context.awsOptions);
        const stacks = await AwsUtils.repeatFetchingItemsByNextToken<CloudFormation.StackSummary>('StackSummaries',
            pagingParam => cf.listStacks({...pagingParam}).promise(),
        );
        for (let stack of stacks) {
            if (this.shouldInclude(stack.StackName)) {
                let resources = new Array<CloudFormation.StackResourceSummary>();
                /* too time consuming and 400 Throttling: Rate exceeded
                try {
                    resources = await AwsUtils.repeatFetchingItemsByNextToken<CloudFormation.StackResourceSummary>('StackResourceSummaries',
                        pagingParam => cf.listStackResources({...pagingParam, StackName: stack.StackName}).promise(),
                    );
                } catch(e) {
                    if (e.statusCode === 400) {
                        this.context.debug(`Ignore resources of CloudFormation stack: ${e}`);
                    } else {
                        console.log(e);
                    }
                }*/
                const stackDetails = {...stack, resources};
                inventory.cfStackByName.set(stack.StackName, stackDetails);
                inventory.cfStackById.set(stack.StackId!, stackDetails);
            }
        }
        this.context.debug(`Found ${inventory.cfStackByName.size}/${stacks.length} stacks in CloudFormation`);
    }

    shouldInclude(text: string | null | undefined): boolean {
        if (text == null) {
            return false;
        }
        for (let patterns of this.matchPatterns) {
            if (matcher.isMatch(text, patterns)) {
                return true;    // matched by any include and all excludes
            }
        }
        return false;
    }

}