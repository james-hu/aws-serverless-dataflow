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
    Subscriber,
    DLQ,
    Consumer,
}

enum Group {
    SnsTopic = 'SnsTopic',
    SqsQueue = 'SqsQueue',
    LambdaFunction = 'LambdaFunction',
}

export class Generator {
    constructor(protected context: Context) {}

    async generate() {
        const dir = this.context.options.args.path;
        await fs.emptyDir(dir);

        return Promise.all([
            fs.copy('src/index.html', path.join(dir, 'index.html')),
            fs.copy('img', path.join(dir, 'img')),
            fs.writeFile(path.join(dir, 'nodes.js'), 'var nodesArray = ' + JSON.stringify(this.generateNodes(), null, 2)),
            fs.writeFile(path.join(dir, 'edges.js'), 'var edgesArray = ' + JSON.stringify(this.generateEdges(), null, 2)),
        ]);
    }

    generateNodes(): Array<Node> {
        const inventory = this.context.inventory;
        const nodes = new Map<string, Node>();

        for (let topic of inventory.snsTopicsByArn.values()) {
            const topicArn = AwsUtils.parseArn(topic.TopicArn)!;
            nodes.set(topicArn.arn, {
                id: topicArn.arn,
                label: `topic:${topicArn.resource}`,
                group: Group.SnsTopic,
            });
        }

        for (let queue of inventory.sqsQueuesByArn.values()) {
            const queueArn = AwsUtils.parseArn(queue.QueueArn)!;
            nodes.set(queueArn.arn, {
                id: queueArn.arn,
                label: `queue:${queueArn.resource}`,
                group: Group.SqsQueue,
            });
        }

        for (let lambda of inventory.lambdaFunctionsByArn.values()) {
            const lambdaArn = AwsUtils.parseArn(lambda.FunctionArn)!;
            nodes.set(lambdaArn.arn, {
                id: lambdaArn.arn,
                label: `${lambdaArn.resource}`,
                group: Group.LambdaFunction,
            });
        }

        return [...nodes.values()];
    }

    generateEdges(): Array<Edge> {
        const inventory = this.context.inventory;
        const edges = new Map<string, Edge>();

        for (let sub of inventory.snsSubscriptionsByArn.values()) {
            const id = `${sub.TopicArn}->${sub.Endpoint}`;
            // https://docs.aws.amazon.com/sns/latest/api/API_Subscribe.html
            const endpoint = sub.Endpoint;
            const queue = inventory.sqsQueuesByArn.get(endpoint);
            if (queue) {
                edges.set(id, {
                    from: sub.TopicArn,
                    to: sub.Endpoint,
                    relation: Relation.Subscriber,
                    arrows: Arrows.To,
                });
            }
        }

        for (let lambda of inventory.lambdaFunctionsByArn.values()) {
            const lambdaArn = AwsUtils.parseArn(lambda.FunctionArn)!;
            for (let mapping of lambda.eventSourceMappings) {
                if (mapping.snsTopic) {
                    const id = `${mapping.snsTopic.TopicArn}->${lambdaArn.arn}`;
                    edges.set(id, {
                        from: mapping.snsTopic.TopicArn,
                        to: lambdaArn.arn,
                        relation: Relation.Consumer,
                        arrows: Arrows.To,
                    });
                }
                if (mapping.sqsQueue) {
                    const id = `${mapping.sqsQueue.QueueArn}->${lambdaArn.arn}`;
                    edges.set(id, {
                        from: mapping.sqsQueue.QueueArn,
                        to: lambdaArn.arn,
                        relation: Relation.Consumer,
                        arrows: Arrows.To,
                    });
                }
            }
        }

        // SQS DLQ
        for (let queue of inventory.sqsQueuesByArn.values()) {
            if (queue.RedrivePolicy) {
                const redrivePolicy = JSON.parse(queue.RedrivePolicy);
                const dlqArn: string = redrivePolicy.deadLetterTargetArn;
                if (inventory.sqsQueuesByArn.has(dlqArn)) {
                    const id = `${queue.QueueArn}->${dlqArn}`;
                    edges.set(id, {
                        from: queue.QueueArn,
                        to: dlqArn,
                        relation: Relation.DLQ,
                        arrows: Arrows.To,
                        dashes: true,
                    });
                }
            }
        }

        return [...edges.values()];
    }
}
