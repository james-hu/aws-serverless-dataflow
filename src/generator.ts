import * as fs from 'fs-extra';
import * as path from 'path';
import { AwsUtils } from '../bb-commons/typescript';
import { Context } from './context';

interface Node {
    id: string,
    label: string,
    group?: Group,
    [others: string]: any,
}

interface Edge {
    from: string,
    to: string,
    arrows?: Arrows,
    relation?: Relation,
    dashes?: boolean,
    [others: string]: any,
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
}

export class Generator {
    constructor(protected context: Context) {}

    async generate() {
        const dir = this.context.options.args.path;
        await fs.emptyDir(dir);

        const codeDir = path.resolve(__dirname);
        const siteDir = path.join(codeDir, '..', 'site')
        return Promise.all([
            fs.copy(siteDir, dir),
            fs.writeFile(path.join(dir, 'nodes.js'), 'var nodesArray = ' + JSON.stringify(this.generateNodes(), null, 2)),
            fs.writeFile(path.join(dir, 'edges.js'), 'var edgesArray = ' + JSON.stringify(this.generateEdges(), null, 2)),
        ]);
    }

    generateNodes(): Array<Node> {
        const inventory = this.context.inventory;
        const nodes = new Map<string, Node>();

        // SNS Topics
        for (let topic of inventory.snsTopicsByArn.values()) {
            const topicArn = AwsUtils.parseArn(topic.TopicArn)!;
            nodes.set(topicArn.arn, {
                id: topicArn.arn,
                label: `topic:${topicArn.resource}`,
                group: Group.SnsTopic,
            });
        }

        // SQS Queues
        for (let queue of inventory.sqsQueuesByArn.values()) {
            const queueArn = AwsUtils.parseArn(queue.QueueArn)!;
            nodes.set(queueArn.arn, {
                id: queueArn.arn,
                label: `queue:${queueArn.resource}`,
                group: Group.SqsQueue,
            });
        }

        // Lambda Functions
        for (let lambda of inventory.lambdaFunctionsByArn.values()) {
            const lambdaArn = AwsUtils.parseArn(lambda.FunctionArn)!;
            nodes.set(lambdaArn.arn, {
                id: lambdaArn.arn,
                label: `${lambdaArn.resource}`,
                group: Group.LambdaFunction,
            });
        }

        // Domain Names & Base Path mappings
        for (let domain of inventory.apigDomainNamesByName.values()) {
            const domainName = domain.domainName!;
            nodes.set(domainName, {
                id: domainName,
                label: domainName,
                group: Group.DomainName,
            })
            for (let mapping of domain.basePathMappings) {
                const basePathUrl = `/${mapping.basePathUrl}`;
                const domainAndBasePathUrl = mapping.domainAndBasePathUrl;
                nodes.set(domainAndBasePathUrl, {
                    id: domainAndBasePathUrl,
                    label: basePathUrl,
                    group: Group.BasePath,
                })
            }
        }

        return [...nodes.values()];
    }

    generateEdges(): Array<Edge> {
        const inventory = this.context.inventory;
        const edges = new Map<string, Edge>();

        // SNS Subscription
        for (let sub of inventory.snsSubscriptionsByArn.values()) {
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
        for (let lambda of inventory.lambdaFunctionsByArn.values()) {
            const lambdaArn = AwsUtils.parseArn(lambda.FunctionArn)!;

            // event sources
            for (let mapping of lambda.eventSourceMappings) {
                if (mapping.snsTopic) {
                    const id = `${lambdaArn.arn}->${mapping.snsTopic.TopicArn}`;
                    edges.set(id, {
                        from: lambdaArn.arn,
                        to: mapping.snsTopic.TopicArn,
                        relation: Relation.Consumer,
                        arrows: Arrows.From,
                        dashes: mapping.State !== 'Enabled',
                    });
                }
                if (mapping.sqsQueue) {
                    const id = `${lambdaArn.arn}->${mapping.sqsQueue.QueueArn}`;
                    edges.set(id, {
                        from: lambdaArn.arn,
                        to: mapping.sqsQueue.QueueArn,
                        relation: Relation.Consumer,
                        arrows: Arrows.From,
                        dashes: mapping.State !== 'Enabled',
                    });
                }
            }

            // environment variables pointing to other resources
            if (lambda.Environment?.Variables) {
                for (let [_name, arn] of Object.entries(lambda.Environment.Variables)) {
                    if (inventory.snsTopicsByArn.has(arn)) {
                        const id = `${lambdaArn.arn}->${arn}`;
                        edges.set(id, {
                            from: lambdaArn.arn,
                            to: arn,
                            relation: Relation.User,
                            arrows: Arrows.None,
                            dashes: true,
                        });
                    }
                    if (inventory.sqsQueuesByArn.has(arn)) {
                        const id = `${lambdaArn.arn}->${arn}`;
                        edges.set(id, {
                            from: lambdaArn.arn,
                            to: arn,
                            relation: Relation.User,
                            arrows: Arrows.None,
                            dashes: true,
                        });
                    }
    
                }
            }
        }

        // SQS DLQ
        for (let queue of inventory.sqsQueuesByArn.values()) {
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
        for (let domain of inventory.apigDomainNamesByName.values()) {
            for (let mapping of domain.basePathMappings) {
                const basePathUrl = `/${mapping.basePathUrl}`;
                const domainAndBasePathUrl = mapping.domainAndBasePathUrl;
                edges.set(domainAndBasePathUrl, {
                    from: domain.domainName!,
                    to: domainAndBasePathUrl,
                    relation: Relation.Host,
                });
                const restApi = inventory.apigApisById.get(mapping.restApiId!);
                if (restApi) {
                    for (let functionArn of restApi.lambdaFunctionArns) {
                        const id = `${domainAndBasePathUrl}->${functionArn}`;
                        edges.set(id, {
                            from: domainAndBasePathUrl,
                            to: functionArn,
                            relation: Relation.Interface,
                        });
                    }
                }
            }
        }

        return [...edges.values()];
    }
}
