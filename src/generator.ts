import parseArn from '@unbounce/parse-aws-arn';
import * as fs from 'fs-extra';
import * as path from 'path';
import { Context } from './context';

interface Node {
    id: string,
    label: string,
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
}

interface Edge {
    from: string,
    to: string,
    arrows?: Arrows,
    relation?: Relation,
    [others: string]: any,
}

export class Generator {
    constructor(protected context: Context) {}

    async generate() {
        const dir = this.context.options.args.path;
        await fs.emptyDir(dir);

        return Promise.all([
            fs.copy('src/index.html', path.join(dir, 'index.html')),
            fs.writeFile(path.join(dir, 'nodes.js'), 'var nodesArray = ' + JSON.stringify(this.generateNodes(), null, 2)),
            fs.writeFile(path.join(dir, 'edges.js'), 'var edgesArray = ' + JSON.stringify(this.generateEdges(), null, 2)),
        ]);
    }

    generateNodes(): Array<Node> {
        const inventory = this.context.inventory;
        const nodes = new Map<string, Node>();

        for (let sub of inventory.snsSubscriptionsByArn.values()) {
            const topicArnObj = parseArn(sub.TopicArn);
            // const topic = inventory.snsTopicsByArn.get(sub.TopicArn);
            nodes.set(sub.TopicArn, {
                id: sub.TopicArn,
                label: `${topicArnObj.service}:${topicArnObj.resource}`,
            });
            // https://docs.aws.amazon.com/sns/latest/api/API_Subscribe.html
            const endpoint = sub.Endpoint;
            const queue = inventory.sqsQueuesByArn.get(endpoint);
            if (queue) {
                const queueArnObj = parseArn(endpoint);
                nodes.set(endpoint, {
                    id: endpoint,
                    label: `${queueArnObj.service}:${queueArnObj.resource}`,
                });
            }
        }

        return [...nodes.values()];
    }

    generateEdges(): Array<Edge> {
        const inventory = this.context.inventory;
        const edges = new Map<string, Edge>();

        for (let sub of inventory.snsSubscriptionsByArn.values()) {
            const id = `${sub.Endpoint}->${sub.TopicArn}`;
            // https://docs.aws.amazon.com/sns/latest/api/API_Subscribe.html
            const endpoint = sub.Endpoint;
            const queue = inventory.sqsQueuesByArn.get(endpoint);
            if (queue) {
                edges.set(id, {
                    to: sub.TopicArn,
                    from: sub.Endpoint,
                    arrows: Arrows.To,
                });
            }
        }

        return [...edges.values()];
    }
}
